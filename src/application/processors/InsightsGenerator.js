const { ProcessingResult } = require('../../core/value-objects');

/**
 * Service for generating insights from recordings
 */
class InsightsGenerator {
    constructor({ aiPoweredInsightsGenerator, transcriptAnalyzer }) {
        this.aiPoweredInsightsGenerator = aiPoweredInsightsGenerator;
        this.transcriptAnalyzer = transcriptAnalyzer;
        this.insightsVersion = '2.0.0';
    }

    /**
     * Generate insights for a recording
     */
    async generateInsights({ recording, session, transcriptPath, timelinePath }) {
        const startTime = Date.now();
        
        try {
            const insights = {
                metadata: {
                    version: this.insightsVersion,
                    generatedAt: new Date().toISOString(),
                    sessionType: session.sessionType,
                    recordingId: recording.id,
                    processingTime: 0,
                    aiGenerated: false,
                    model: 'none'
                },
                sessionSummary: null,
                keyHighlights: null,
                actionItems: null,
                coachingEffectiveness: null,
                studentProgress: null,
                recommendations: null,
                qualityMetrics: null
            };

            // Generate insights based on session type
            if (session.isCoachingSession() && this.aiPoweredInsightsGenerator) {
                // Use AI for coaching sessions
                insights.metadata.aiGenerated = true;
                
                // Analyze transcript if available
                let transcriptContent = null;
                if (transcriptPath) {
                    const transcriptAnalysis = await this.transcriptAnalyzer.analyze(transcriptPath);
                    transcriptContent = transcriptAnalysis.content || transcriptAnalysis.rawText;
                }
                
                // Generate AI insights using the consolidated AI service
                const aiInsights = await this.aiPoweredInsightsGenerator.generateAIInsights(
                    transcriptContent, 
                    {
                        topic: session.topic || recording.topic,
                        duration: session.duration || recording.duration,
                        start_time: session.startTime || recording.start_time,
                        participant_count: session.participantCount || recording.participant_count,
                        forceRuleBased: false
                    }
                );
                
                // Map AI insights to our structure
                insights.sessionSummary = aiInsights.aiSummary;
                insights.keyHighlights = aiInsights.aiHighlights;
                insights.actionItems = aiInsights.aiActionItems;
                insights.coachingEffectiveness = aiInsights.aiCoachingInsights;
                insights.studentProgress = {
                    confidence: aiInsights.aiEngagement?.studentEngagement || 0.7,
                    engagement: aiInsights.aiEngagement?.overallScore || 0.7,
                    understanding: 0.8,
                    indicators: aiInsights.aiCoachingInsights?.studentProgress?.visibleGrowth || []
                };
                insights.recommendations = {
                    immediate: aiInsights.aiCoachingInsights?.studentProgress?.nextSteps || [],
                    shortTerm: [],
                    longTerm: []
                };
                insights.metadata.model = aiInsights.metadata.model;
                insights.metadata.provider = aiInsights.metadata.provider;
            } else {
                // Use rule-based insights for non-coaching sessions
                const ruleBasedInsights = this._generateRuleBasedInsights(
                    recording, 
                    session
                );
                
                Object.assign(insights, ruleBasedInsights);
            }

            // Calculate quality metrics
            insights.qualityMetrics = this._calculateQualityMetrics(insights);
            
            // Set processing time
            insights.metadata.processingTime = Date.now() - startTime;

            return insights;

        } catch (error) {
            // Return basic insights on error
            return this._generateFallbackInsights(recording, session, error);
        }
    }

    /**
     * Generate rule-based insights
     */
    _generateRuleBasedInsights(recording, session) {
        return {
            sessionSummary: {
                executiveSummary: `${session.sessionType} session completed successfully.`,
                mainDiscussionPoints: [`${session.sessionType} session topics`],
                keyOutcomes: []
            },
            keyHighlights: {
                highlights: [`${session.duration} minute ${session.sessionType} session`],
                breakthroughMoments: [],
                importantQuestions: []
            },
            actionItems: {
                highPriority: [],
                mediumPriority: [],
                lowPriority: []
            },
            coachingEffectiveness: {
                overallScore: 0.5,
                techniques: [],
                strengths: [],
                areasForImprovement: ['Session analysis not available']
            },
            studentProgress: {
                confidence: 0.5,
                engagement: 0.5,
                understanding: 0.5,
                indicators: []
            },
            recommendations: {
                immediate: [],
                shortTerm: [],
                longTerm: []
            }
        };
    }

    /**
     * Generate fallback insights
     */
    _generateFallbackInsights(recording, session, error) {
        return {
            metadata: {
                version: this.insightsVersion,
                generatedAt: new Date().toISOString(),
                sessionType: session.sessionType,
                recordingId: recording.id,
                processingTime: 0,
                aiGenerated: false,
                model: 'fallback',
                error: error.message
            },
            sessionSummary: {
                executiveSummary: 'Insights generation failed - using fallback data',
                mainDiscussionPoints: [],
                keyOutcomes: []
            },
            keyHighlights: {
                highlights: [],
                breakthroughMoments: [],
                importantQuestions: []
            },
            actionItems: {
                highPriority: [],
                mediumPriority: [],
                lowPriority: []
            },
            coachingEffectiveness: {
                overallScore: 0,
                techniques: [],
                strengths: [],
                areasForImprovement: []
            },
            studentProgress: {
                confidence: 0,
                engagement: 0,
                understanding: 0,
                indicators: []
            },
            recommendations: {
                immediate: [],
                shortTerm: [],
                longTerm: []
            },
            qualityMetrics: {
                dataQuality: { completeness: 0, accuracy: 0, consistency: 0 },
                overallScore: 0
            }
        };
    }

    /**
     * Calculate quality metrics
     */
    _calculateQualityMetrics(insights) {
        const metrics = {
            dataQuality: {
                completeness: 0,
                accuracy: 0,
                consistency: 0
            },
            overallScore: 0
        };

        // Calculate completeness
        const requiredFields = [
            insights.sessionSummary?.executiveSummary,
            insights.keyHighlights?.highlights?.length > 0,
            insights.actionItems?.highPriority,
            insights.coachingEffectiveness?.overallScore,
            insights.studentProgress?.confidence
        ];
        
        const completedFields = requiredFields.filter(Boolean).length;
        metrics.dataQuality.completeness = completedFields / requiredFields.length;

        // Estimate accuracy based on AI generation
        metrics.dataQuality.accuracy = insights.metadata.aiGenerated ? 0.9 : 0.5;

        // Consistency check
        metrics.dataQuality.consistency = 0.8; // Placeholder

        // Overall score
        metrics.overallScore = (
            metrics.dataQuality.completeness * 0.4 +
            metrics.dataQuality.accuracy * 0.4 +
            metrics.dataQuality.consistency * 0.2
        );

        return metrics;
    }

    /**
     * Generate insights for multiple recordings
     */
    async generateBatchInsights(recordings) {
        const results = [];
        
        for (const recording of recordings) {
            try {
                const insights = await this.generateInsights(recording);
                results.push({
                    recordingId: recording.id,
                    success: true,
                    insights
                });
            } catch (error) {
                results.push({
                    recordingId: recording.id,
                    success: false,
                    error: error.message
                });
            }
        }
        
        return results;
    }

    /**
     * Validate insights structure
     */
    validateInsights(insights) {
        const requiredSections = [
            'metadata',
            'sessionSummary',
            'keyHighlights',
            'actionItems',
            'coachingEffectiveness',
            'studentProgress',
            'recommendations',
            'qualityMetrics'
        ];

        const missingSections = requiredSections.filter(section => !insights[section]);
        
        if (missingSections.length > 0) {
            throw new Error(`Missing required sections: ${missingSections.join(', ')}`);
        }

        return true;
    }

    /**
     * Get insights version
     */
    getVersion() {
        return this.insightsVersion;
    }

    /**
     * Update insights version
     */
    updateVersion(newVersion) {
        this.insightsVersion = newVersion;
    }
}

module.exports = { InsightsGenerator }; 