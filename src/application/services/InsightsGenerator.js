const { InsightsGenerationError } = require('../../shared/errors');
const { CombinedInsights, SessionInsight, InsightType } = require('../../domain/models/Insights');

class InsightsGenerator {
    constructor({ 
        aiService, 
        transcriptAnalyzer, 
        participantAnalyzer,
        zoomService,
        logger,
        eventBus,
        metricsCollector
    }) {
        this.aiService = aiService;
        this.transcriptAnalyzer = transcriptAnalyzer;
        this.participantAnalyzer = participantAnalyzer;
        this.zoomService = zoomService;
        this.logger = logger;
        this.eventBus = eventBus;
        this.metrics = metricsCollector;
    }

    async generateInsights({ recording, session, transcript }) {
        const startTime = Date.now();
        
        try {
            this.logger.info(`Generating comprehensive insights: recordingId=${recording.id}, sessionId=${session.id}, transcriptLength=${transcript?.content?.length || 0}`);
            
            // Emit start event
            this.eventBus.emit('insights.generation.started', { 
                recordingId: recording.id,
                sessionId: session.id 
            });
            
            // Parallel processing for efficiency
            const [aiInsights, transcriptInsights, participantInsights, zoomInsights] = await Promise.all([
                this._generateAIInsights(transcript, session),
                this._generateTranscriptInsights(transcript, session),
                this._generateParticipantInsights(session),
                this._generateZoomInsights(recording, session)
            ]);
            
            // Combine insights using domain logic
            const combinedInsights = this._combineInsights({
                ai: aiInsights,
                transcript: transcriptInsights,
                participants: participantInsights,
                zoom: zoomInsights,
                session,
                recording
            });
            
            // Extract key highlights
            const keyHighlights = this._extractKeyHighlights(combinedInsights);
            
            // Generate action items
            const actionItems = this._consolidateActionItems(combinedInsights);
            
            // Generate follow-up recommendations
            const recommendations = this._generateRecommendations(combinedInsights);
            
            // Calculate quality metrics
            const qualityMetrics = this._calculateQualityMetrics(combinedInsights);
            
            const result = new CombinedInsights({
                sessionId: session.id,
                recordingId: recording.id,
                insights: combinedInsights,
                keyHighlights,
                actionItems,
                recommendations,
                qualityMetrics,
                metadata: {
                    version: '2.0.0',
                    generatedAt: new Date().toISOString(),
                    processingTime: Date.now() - startTime,
                    sources: this._getDataSources(aiInsights, transcriptInsights, zoomInsights)
                }
            });
            
            // Track metrics
            this.metrics.recordInsightsGeneration(Date.now() - startTime, 'success');
            
            // Emit completion event
            this.eventBus.emit('insights.generation.completed', { 
                recordingId: recording.id,
                sessionId: session.id,
                insightsCount: result.getInsightCount(),
                processingTime: Date.now() - startTime
            });
            
            return result;
            
        } catch (error) {
            this.metrics.recordInsightsGeneration(Date.now() - startTime, 'failure');
            
            this.logger.error(`Insights generation failed: error=${error.message}, recordingId=${recording.id}, sessionId=${session.id}`);
            
            this.eventBus.emit('insights.generation.failed', { 
                recordingId: recording.id,
                sessionId: session.id,
                error: error.message 
            });
            
            throw new InsightsGenerationError('Failed to generate insights', error);
        }
    }

    async _generateAIInsights(transcript, session) {
        if (!transcript?.content || session.isRuleBased()) {
            this.logger.info(`Skipping AI insights: hasTranscript=${!!transcript?.content}, isRuleBased=${session.isRuleBased()}`);
            return null;
        }
        
        try {
            const metadata = {
                topic: session.topic,
                duration: session.duration,
                startTime: session.startTime,
                sessionType: session.type,
                participants: session.participants.map(p => p.toJSON())
            };
            
            const aiInsights = await this.aiService.generateInsights(
                transcript.content,
                metadata
            );
            
            return this._transformAIInsights(aiInsights);
            
        } catch (error) {
            this.logger.warn(`AI insights generation failed, continuing without: ${error.message}`);
            return null;
        }
    }

    async _generateTranscriptInsights(transcript, session) {
        if (!transcript) {
            return null;
        }
        
        try {
            const analysis = await this.transcriptAnalyzer.analyzeTranscript(transcript);
            return this._transformTranscriptAnalysis(analysis);
        } catch (error) {
            this.logger.warn('Transcript analysis failed, continuing without', { error });
            return null;
        }
    }

    async _generateParticipantInsights(session) {
        try {
            const analysis = await this.participantAnalyzer.analyzeParticipants(session.participants);
            return this._transformParticipantAnalysis(analysis);
        } catch (error) {
            this.logger.warn('Participant analysis failed, continuing without', { error });
            return null;
        }
    }

    async _generateZoomInsights(recording, session) {
        try {
            // Check if we have meeting data
            if (!recording.meetingId || !recording.meetingUuid) {
                return null;
            }
            
            // Get meeting details from Zoom
            const meetingDetails = await this.zoomService.getMeetingDetails(
                recording.meetingId,
                recording.meetingUuid
            );
            
            return this._transformZoomData(meetingDetails);
            
        } catch (error) {
            this.logger.warn(`Zoom insights extraction failed, continuing without: ${error.message}`);
            return null;
        }
    }

    _combineInsights({ ai, transcript, participants, zoom, session, recording }) {
        const insights = [];
        
        // Session Overview Insights
        insights.push(new SessionInsight({
            type: InsightType.SESSION_OVERVIEW,
            title: 'Session Overview',
            content: this._createSessionOverview({ ai, transcript, participants, zoom, session }),
            confidence: 1.0,
            source: 'combined',
            timestamp: session.startTime
        }));
        
        // Coaching Effectiveness Insights
        const coachingEffectiveness = this._assessCoachingEffectiveness({ ai, transcript, participants });
        if (coachingEffectiveness) {
            insights.push(new SessionInsight({
                type: InsightType.COACHING_EFFECTIVENESS,
                title: 'Coaching Effectiveness',
                content: coachingEffectiveness,
                confidence: coachingEffectiveness.confidence || 0.8,
                source: 'analysis',
                impact: 'high'
            }));
        }
        
        // Student Progress Insights
        const studentProgress = this._assessStudentProgress({ ai, transcript, participants });
        if (studentProgress) {
            insights.push(new SessionInsight({
                type: InsightType.STUDENT_PROGRESS,
                title: 'Student Progress',
                content: studentProgress,
                confidence: studentProgress.confidence || 0.8,
                source: 'analysis',
                impact: 'high'
            }));
        }
        
        // Extract insights from AI analysis
        if (ai?.insights) {
            ai.insights.forEach(insight => {
                insights.push(new SessionInsight({
                    type: this._mapInsightType(insight.type),
                    title: insight.title,
                    content: insight.content,
                    confidence: insight.confidence || 0.7,
                    source: 'ai',
                    timestamp: insight.timestamp,
                    context: insight.context,
                    impact: insight.impact
                }));
            });
        }
        
        // Extract insights from transcript analysis
        if (transcript?.insights) {
            transcript.insights.forEach(insight => {
                insights.push(new SessionInsight({
                    type: this._mapInsightType(insight.type),
                    title: insight.title,
                    content: insight.content,
                    confidence: insight.confidence || 0.8,
                    source: 'transcript',
                    timestamp: insight.timestamp,
                    speaker: insight.speaker
                }));
            });
        }
        
        return insights;
    }

    _createSessionOverview({ ai, transcript, participants, zoom, session }) {
        const overview = {
            duration: session.duration,
            participants: this._extractParticipantsSummary(participants, session),
            mainTopics: this._extractMainTopics(ai, transcript, zoom),
            sessionType: session.type,
            overallSentiment: this._determineOverallSentiment(ai, transcript),
            engagementLevel: this._determineEngagementLevel(ai, transcript, participants),
            keyMetrics: {
                speakingTime: transcript?.speakingTimeDistribution || {},
                questionCount: transcript?.questionCount || 0,
                topicCoverage: ai?.topicCoverage || [],
                participationBalance: participants?.participationBalance || 0.5
            }
        };
        
        return overview;
    }

    _assessCoachingEffectiveness({ ai, transcript, participants }) {
        const effectiveness = {
            overallScore: 0,
            techniques: [],
            strengths: [],
            areasForImprovement: [],
            studentResponse: 'neutral',
            effectivenessFactors: {}
        };
        
        // Collect coaching techniques from all sources
        const techniques = new Set();
        
        if (ai?.coachingInsights?.techniques) {
            ai.coachingInsights.techniques.forEach(t => techniques.add(t));
        }
        
        if (transcript?.coachingTechniques) {
            transcript.coachingTechniques.forEach(t => techniques.add(t));
        }
        
        effectiveness.techniques = Array.from(techniques);
        
        // Calculate overall score
        let scoreFactors = [];
        
        if (ai?.coachingInsights?.effectiveness) {
            scoreFactors.push(ai.coachingInsights.effectiveness);
        }
        
        if (transcript?.coachingMetrics?.effectiveness) {
            scoreFactors.push(transcript.coachingMetrics.effectiveness);
        }
        
        if (participants?.coachEngagement) {
            scoreFactors.push(participants.coachEngagement);
        }
        
        effectiveness.overallScore = scoreFactors.length > 0
            ? scoreFactors.reduce((a, b) => a + b) / scoreFactors.length
            : 0.7;
        
        // Identify strengths and improvements
        effectiveness.strengths = this._identifyCoachingStrengths({ ai, transcript });
        effectiveness.areasForImprovement = this._identifyCoachingImprovements({ ai, transcript });
        
        // Determine student response
        if (ai?.sentiment?.overall === 'positive' || transcript?.sentiment?.overall === 'positive') {
            effectiveness.studentResponse = 'positive';
        } else if (ai?.sentiment?.overall === 'negative' || transcript?.sentiment?.overall === 'negative') {
            effectiveness.studentResponse = 'negative';
        }
        
        effectiveness.confidence = this._calculateConfidence([ai, transcript, participants]);
        
        return effectiveness;
    }

    _assessStudentProgress({ ai, transcript, participants }) {
        const progress = {
            confidence: 0,
            engagement: 0,
            understanding: 0,
            motivation: 0,
            indicators: [],
            growthAreas: [],
            achievements: [],
            confidence: 0
        };
        
        // Aggregate progress metrics
        const metrics = {
            confidence: [],
            engagement: [],
            understanding: [],
            motivation: []
        };
        
        if (ai?.studentProgress) {
            metrics.confidence.push(ai.studentProgress.confidence);
            metrics.engagement.push(ai.studentProgress.engagement);
            metrics.understanding.push(ai.studentProgress.understanding);
            metrics.motivation.push(ai.studentProgress.motivation);
        }
        
        if (transcript?.studentMetrics) {
            metrics.engagement.push(transcript.studentMetrics.engagement);
            metrics.understanding.push(transcript.studentMetrics.comprehension);
        }
        
        if (participants?.studentEngagement) {
            metrics.engagement.push(participants.studentEngagement);
        }
        
        // Calculate averages
        progress.confidence = this._average(metrics.confidence);
        progress.engagement = this._average(metrics.engagement);
        progress.understanding = this._average(metrics.understanding);
        progress.motivation = this._average(metrics.motivation);
        
        // Extract indicators
        if (ai?.coachingInsights?.progressIndicators) {
            progress.indicators.push(...ai.coachingInsights.progressIndicators);
        }
        
        if (transcript?.progressIndicators) {
            progress.indicators.push(...transcript.progressIndicators);
        }
        
        // Identify growth areas and achievements
        progress.growthAreas = this._identifyGrowthAreas({ ai, transcript });
        progress.achievements = this._identifyAchievements({ ai, transcript });
        
        progress.confidence = this._calculateConfidence([ai, transcript]);
        
        return progress;
    }

    _extractKeyHighlights(insights) {
        const highlights = {
            breakthroughMoments: [],
            importantQuestions: [],
            actionItems: [],
            coachingExcellence: [],
            studentGrowth: []
        };
        
        insights.forEach(insight => {
            if (insight.type === InsightType.BREAKTHROUGH && insight.impact === 'high') {
                highlights.breakthroughMoments.push({
                    description: insight.content,
                    timestamp: insight.timestamp,
                    impact: insight.impact
                });
            }
            
            if (insight.type === InsightType.KEY_QUESTION) {
                highlights.importantQuestions.push({
                    question: insight.content.question || insight.title,
                    significance: insight.impact,
                    response: insight.content.response
                });
            }
            
            if (insight.type === InsightType.ACTION_ITEM) {
                highlights.actionItems.push({
                    item: insight.content.item || insight.title,
                    priority: insight.content.priority || 'medium',
                    assignee: insight.content.assignee
                });
            }
            
            if (insight.type === InsightType.COACHING_EFFECTIVENESS && insight.impact === 'high') {
                highlights.coachingExcellence.push({
                    technique: insight.content.technique || insight.title,
                    effectiveness: insight.confidence
                });
            }
            
            if (insight.type === InsightType.STUDENT_PROGRESS && insight.confidence > 0.7) {
                highlights.studentGrowth.push({
                    area: insight.content.area || insight.title,
                    progress: insight.confidence
                });
            }
        });
        
        return highlights;
    }

    _consolidateActionItems(insights) {
        const actionItems = {
            highPriority: [],
            mediumPriority: [],
            lowPriority: []
        };
        
        insights.forEach(insight => {
            if (insight.type === InsightType.ACTION_ITEM) {
                const item = {
                    id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    item: insight.content.item || insight.title,
                    assignee: insight.content.assignee || 'student',
                    deadline: insight.content.deadline,
                    context: insight.context,
                    source: insight.source,
                    createdAt: new Date().toISOString()
                };
                
                const priority = insight.content.priority || 'medium';
                
                switch (priority) {
                    case 'high':
                        actionItems.highPriority.push(item);
                        break;
                    case 'low':
                        actionItems.lowPriority.push(item);
                        break;
                    default:
                        actionItems.mediumPriority.push(item);
                }
            }
        });
        
        return actionItems;
    }

    _generateRecommendations(insights) {
        const recommendations = {
            immediate: [],
            shortTerm: [],
            longTerm: [],
            coachRecommendations: [],
            studentRecommendations: []
        };
        
        // Analyze insights to generate recommendations
        const hasBreakthroughs = insights.some(i => i.type === InsightType.BREAKTHROUGH);
        const hasActionItems = insights.some(i => i.type === InsightType.ACTION_ITEM);
        const coachingScore = this._getCoachingEffectivenessScore(insights);
        const studentProgress = this._getStudentProgressScore(insights);
        
        // Immediate recommendations
        if (hasActionItems) {
            recommendations.immediate.push({
                recommendation: 'Review and prioritize identified action items',
                rationale: 'Action items were identified during the session',
                priority: 'high'
            });
        }
        
        if (hasBreakthroughs) {
            recommendations.immediate.push({
                recommendation: 'Document and reflect on breakthrough moments',
                rationale: 'Breakthrough moments can accelerate progress',
                priority: 'high'
            });
        }
        
        // Short-term recommendations
        recommendations.shortTerm.push({
            recommendation: 'Schedule follow-up session to review progress',
            rationale: 'Regular follow-ups maintain momentum',
            priority: 'medium'
        });
        
        // Long-term recommendations
        if (studentProgress < 0.6) {
            recommendations.longTerm.push({
                recommendation: 'Consider adjusting coaching approach',
                rationale: 'Student progress indicators suggest room for improvement',
                priority: 'medium'
            });
        }
        
        // Coach-specific recommendations
        if (coachingScore < 0.7) {
            recommendations.coachRecommendations.push({
                recommendation: 'Explore additional coaching techniques',
                rationale: 'Diversifying techniques can improve effectiveness',
                priority: 'medium'
            });
        }
        
        // Student-specific recommendations
        recommendations.studentRecommendations.push({
            recommendation: 'Apply session insights to daily practice',
            rationale: 'Consistent application accelerates progress',
            priority: 'high'
        });
        
        return recommendations;
    }

    _calculateQualityMetrics(insights) {
        const metrics = {
            overallScore: 0,
            dataQuality: {
                completeness: 0,
                accuracy: 0,
                consistency: 0,
                sources: []
            },
            insightQuality: {
                depth: 0,
                relevance: 0,
                actionability: 0
            },
            confidence: {
                average: 0,
                distribution: {
                    high: 0,
                    medium: 0,
                    low: 0
                }
            }
        };
        
        // Data quality
        const sources = new Set(insights.map(i => i.source));
        metrics.dataQuality.sources = Array.from(sources);
        metrics.dataQuality.completeness = Math.min(sources.size / 4, 1.0); // 4 possible sources
        
        // Insight quality
        const hasActionableInsights = insights.some(i => i.type === InsightType.ACTION_ITEM);
        const hasHighImpactInsights = insights.some(i => i.impact === 'high');
        
        metrics.insightQuality.actionability = hasActionableInsights ? 1.0 : 0.5;
        metrics.insightQuality.relevance = hasHighImpactInsights ? 1.0 : 0.7;
        metrics.insightQuality.depth = Math.min(insights.length / 10, 1.0);
        
        // Confidence metrics
        const confidences = insights.map(i => i.confidence);
        metrics.confidence.average = this._average(confidences);
        
        confidences.forEach(conf => {
            if (conf >= 0.8) metrics.confidence.distribution.high++;
            else if (conf >= 0.6) metrics.confidence.distribution.medium++;
            else metrics.confidence.distribution.low++;
        });
        
        // Overall score
        metrics.overallScore = (
            metrics.dataQuality.completeness * 0.3 +
            metrics.insightQuality.actionability * 0.3 +
            metrics.insightQuality.relevance * 0.2 +
            metrics.confidence.average * 0.2
        );
        
        return metrics;
    }

    // Helper methods
    _transformAIInsights(aiInsights) {
        if (!aiInsights) return null;
        
        const transformed = {
            insights: [],
            coachingInsights: aiInsights.coachingInsights,
            studentProgress: this._extractStudentProgress(aiInsights),
            sentiment: aiInsights.sentiment,
            engagement: aiInsights.engagement,
            topicCoverage: aiInsights.topics
        };
        
        // Transform AI insights into SessionInsight objects
        if (aiInsights.highlights?.breakthroughMoments) {
            aiInsights.highlights.breakthroughMoments.forEach(moment => {
                transformed.insights.push({
                    type: 'breakthrough',
                    title: 'Breakthrough Moment',
                    content: moment,
                    confidence: 0.8,
                    timestamp: moment.timestamp,
                    impact: moment.impact || 'high'
                });
            });
        }
        
        if (aiInsights.actionItems) {
            const allActionItems = [
                ...aiInsights.actionItems.highPriority,
                ...aiInsights.actionItems.mediumPriority,
                ...aiInsights.actionItems.lowPriority
            ];
            
            allActionItems.forEach(item => {
                transformed.insights.push({
                    type: 'action_item',
                    title: item.item,
                    content: item,
                    confidence: 0.9
                });
            });
        }
        
        return transformed;
    }

    _transformTranscriptAnalysis(analysis) {
        if (!analysis) return null;
        
        return {
            insights: analysis.insights || [],
            speakingTimeDistribution: analysis.speakerAnalysis,
            questionCount: analysis.questions?.length || 0,
            coachingTechniques: analysis.coachingInsights?.coachingTechniques || [],
            sentiment: analysis.sentiment,
            studentMetrics: {
                engagement: analysis.engagement?.score || 0.5,
                comprehension: analysis.comprehension?.score || 0.5
            },
            progressIndicators: analysis.coachingInsights?.progressIndicators || []
        };
    }

    _transformParticipantAnalysis(analysis) {
        if (!analysis) return null;
        
        return {
            participationBalance: analysis.balance || 0.5,
            coachEngagement: analysis.coach?.engagement || 0.7,
            studentEngagement: analysis.student?.engagement || 0.7,
            insights: analysis.insights || []
        };
    }

    _transformZoomData(meetingDetails) {
        if (!meetingDetails) return null;
        
        return {
            meetingMetrics: meetingDetails.metrics,
            participantDetails: meetingDetails.participants,
            recordingQuality: meetingDetails.quality
        };
    }

    _extractStudentProgress(aiInsights) {
        const progress = {
            confidence: 0.5,
            engagement: 0.5,
            understanding: 0.5,
            motivation: 0.5
        };
        
        if (aiInsights.engagement?.overallScore) {
            progress.engagement = aiInsights.engagement.overallScore;
        }
        
        if (aiInsights.sentiment?.overall === 'positive') {
            progress.confidence = 0.7;
            progress.motivation = 0.7;
        }
        
        return progress;
    }

    _extractParticipantsSummary(participants, session) {
        const summary = [];
        
        session.participants.forEach(participant => {
            summary.push({
                name: participant.name,
                role: participant.role,
                engagement: participants?.insights?.find(i => 
                    i.content?.participantId === participant.id
                )?.content?.engagement || 'unknown'
            });
        });
        
        return summary;
    }

    _extractMainTopics(ai, transcript, zoom) {
        const topics = new Map();
        
        // Collect topics from all sources
        if (ai?.topicCoverage) {
            ai.topicCoverage.forEach(topic => {
                topics.set(topic.topic, {
                    topic: topic.topic,
                    timeSpent: topic.timeSpent,
                    importance: topic.importance
                });
            });
        }
        
        if (transcript?.insights) {
            transcript.insights
                .filter(i => i.type === 'topic')
                .forEach(insight => {
                    const topicName = insight.content.topic || insight.title;
                    if (!topics.has(topicName)) {
                        topics.set(topicName, {
                            topic: topicName,
                            timeSpent: insight.content.duration || 'unknown',
                            importance: insight.impact || 'medium'
                        });
                    }
                });
        }
        
        return Array.from(topics.values());
    }

    _determineOverallSentiment(ai, transcript) {
        if (ai?.sentiment?.overall) return ai.sentiment.overall;
        if (transcript?.sentiment?.overall) return transcript.sentiment.overall;
        return 'neutral';
    }

    _determineEngagementLevel(ai, transcript, participants) {
        const scores = [];
        
        if (ai?.engagement?.overallScore) scores.push(ai.engagement.overallScore);
        if (transcript?.studentMetrics?.engagement) scores.push(transcript.studentMetrics.engagement);
        if (participants?.studentEngagement) scores.push(participants.studentEngagement);
        
        return this._average(scores);
    }

    _identifyCoachingStrengths(sources) {
        const strengths = new Set();
        
        if (sources.ai?.coachingInsights?.techniques?.length > 3) {
            strengths.add('Diverse coaching techniques employed');
        }
        
        if (sources.transcript?.coachingMetrics?.effectiveness > 0.8) {
            strengths.add('High coaching effectiveness demonstrated');
        }
        
        return Array.from(strengths);
    }

    _identifyCoachingImprovements(sources) {
        const improvements = new Set();
        
        if (!sources.ai?.coachingInsights?.techniques?.length) {
            improvements.add('Consider incorporating more varied coaching techniques');
        }
        
        if (sources.transcript?.questionCount < 5) {
            improvements.add('Increase use of powerful questions');
        }
        
        return Array.from(improvements);
    }

    _identifyGrowthAreas(sources) {
        const areas = [];
        
        if (sources.ai?.studentProgress?.confidence < 0.6) {
            areas.push('Building confidence');
        }
        
        if (sources.ai?.studentProgress?.engagement < 0.6) {
            areas.push('Increasing engagement');
        }
        
        return areas;
    }

    _identifyAchievements(sources) {
        const achievements = [];
        
        if (sources.ai?.highlights?.breakthroughMoments?.length > 0) {
            achievements.push('Breakthrough moments achieved');
        }
        
        if (sources.ai?.studentProgress?.understanding > 0.8) {
            achievements.push('Strong comprehension demonstrated');
        }
        
        return achievements;
    }

    _mapInsightType(type) {
        const typeMap = {
            'breakthrough': InsightType.BREAKTHROUGH,
            'action_item': InsightType.ACTION_ITEM,
            'question': InsightType.KEY_QUESTION,
            'coaching': InsightType.COACHING_EFFECTIVENESS,
            'progress': InsightType.STUDENT_PROGRESS,
            'topic': InsightType.TOPIC_DISCUSSION
        };
        
        return typeMap[type] || InsightType.GENERAL;
    }

    _calculateConfidence(sources) {
        const validSources = sources.filter(s => s !== null);
        return Math.min(0.9, 0.5 + (validSources.length * 0.15));
    }

    _average(numbers) {
        if (!numbers || numbers.length === 0) return 0;
        return numbers.reduce((a, b) => a + b, 0) / numbers.length;
    }

    _getCoachingEffectivenessScore(insights) {
        const coachingInsight = insights.find(i => i.type === InsightType.COACHING_EFFECTIVENESS);
        return coachingInsight?.content?.overallScore || 0.7;
    }

    _getStudentProgressScore(insights) {
        const progressInsight = insights.find(i => i.type === InsightType.STUDENT_PROGRESS);
        if (!progressInsight) return 0.5;
        
        const metrics = progressInsight.content;
        return this._average([
            metrics.confidence,
            metrics.engagement,
            metrics.understanding,
            metrics.motivation
        ]);
    }

    _getDataSources(ai, transcript, zoom) {
        const sources = [];
        
        if (ai) sources.push({ type: 'ai', provider: ai.metadata?.provider });
        if (transcript) sources.push({ type: 'transcript', analyzed: true });
        if (zoom) sources.push({ type: 'zoom', hasMetrics: !!zoom.meetingMetrics });
        
        return sources;
    }
}

module.exports = { InsightsGenerator }; 