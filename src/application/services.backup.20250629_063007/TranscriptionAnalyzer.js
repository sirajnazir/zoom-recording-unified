const fs = require('fs').promises;
const { logger } = require('../../shared');
const { TranscriptionAnalysisError } = require('../../shared/errors');

class TranscriptionAnalyzer {
    constructor({ openAIService, knowledgeBase, cache, eventBus }) {
        this.openAIService = openAIService;
        this.knowledgeBase = knowledgeBase;
        this.cache = cache;
        this.eventBus = eventBus;
    }

    /**
     * Analyze transcript file and extract insights
     */
    async analyzeTranscript(transcriptPath, metadata = {}) {
        try {
            logger.info(`Analyzing transcript: ${transcriptPath}`);
            
            // Check if file exists
            try {
                await fs.access(transcriptPath);
            } catch (error) {
                logger.warn(`Transcript file not found: ${transcriptPath}`);
                return this.generateFallbackAnalysis(metadata);
            }

            const content = await fs.readFile(transcriptPath, 'utf8');
            
            if (!content || content.trim().length === 0) {
                logger.warn(`Transcript file is empty: ${transcriptPath}`);
                return this.generateFallbackAnalysis(metadata);
            }

            // Parse content based on format
            let parsedContent;
            if (content.startsWith('WEBVTT')) {
                parsedContent = this.parseVTTContent(content);
            } else {
                parsedContent = this.parseTextContent(content);
            }

            // Generate comprehensive analysis
            const analysis = await this.generateAnalysis(parsedContent, metadata);
            
            // Cache the analysis
            await this.cacheAnalysis(transcriptPath, analysis);
            
            logger.info('Transcript analysis completed successfully');
            return analysis;

        } catch (error) {
            logger.error(`Transcript analysis failed: ${error.message}`);
            throw new TranscriptionAnalysisError(
                'Failed to analyze transcript',
                error
            );
        }
    }

    /**
     * Parse VTT content into structured format
     */
    parseVTTContent(content) {
        const lines = content.split('\n');
        const segments = [];
        let currentSegment = null;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Skip header and empty lines
            if (line === 'WEBVTT' || line === '' || line.startsWith('NOTE')) {
                continue;
            }
            
            // Parse timestamp
            const timestampMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
            if (timestampMatch) {
                if (currentSegment) {
                    segments.push(currentSegment);
                }
                currentSegment = {
                    start: timestampMatch[1],
                    end: timestampMatch[2],
                    startSeconds: this.timeToSeconds(timestampMatch[1]),
                    endSeconds: this.timeToSeconds(timestampMatch[2]),
                    speaker: null,
                    text: ''
                };
                continue;
            }
            
            // Parse speaker and text
            if (currentSegment) {
                const speakerMatch = line.match(/^([^:]+):\s*(.*)/);
                if (speakerMatch) {
                    currentSegment.speaker = speakerMatch[1].trim();
                    currentSegment.text = speakerMatch[2].trim();
                } else if (line) {
                    // Text without speaker
                    currentSegment.text += (currentSegment.text ? ' ' : '') + line;
                }
            }
        }
        
        // Add last segment
        if (currentSegment && currentSegment.text) {
            segments.push(currentSegment);
        }
        
        return {
            type: 'vtt',
            segments,
            metadata: this.extractVTTMetadata(segments)
        };
    }

    /**
     * Parse plain text content
     */
    parseTextContent(content) {
        const lines = content.split('\n').filter(line => line.trim());
        
        return {
            type: 'text',
            segments: [{
                start: '00:00:00.000',
                end: '00:00:00.000',
                startSeconds: 0,
                endSeconds: 0,
                speaker: null,
                text: content
            }],
            metadata: {
                lineCount: lines.length,
                wordCount: content.split(/\s+/).filter(word => word).length
            }
        };
    }

    /**
     * Extract metadata from VTT segments
     */
    extractVTTMetadata(segments) {
        const speakers = new Set();
        let totalDuration = 0;
        let totalWords = 0;
        
        segments.forEach(segment => {
            if (segment.speaker) {
                speakers.add(segment.speaker);
            }
            totalDuration = Math.max(totalDuration, segment.endSeconds);
            totalWords += segment.text.split(/\s+/).filter(word => word).length;
        });
        
        return {
            speakerCount: speakers.size,
            speakers: Array.from(speakers),
            totalSegments: segments.length,
            totalDuration,
            totalWords,
            averageSegmentDuration: segments.length > 0 
                ? totalDuration / segments.length 
                : 0
        };
    }

    /**
     * Generate comprehensive analysis
     */
    async generateAnalysis(parsedContent, metadata) {
        const { segments } = parsedContent;
        
        // Extract key components
        const speakerAnalysis = this.analyzeSpeakers(segments);
        const topicAnalysis = await this.analyzeTopics(segments);
        const sentimentAnalysis = this.analyzeSentiment(segments);
        const engagementAnalysis = this.analyzeEngagement(segments);
        const keyMoments = this.extractKeyMoments(segments);
        const actionItems = await this.extractActionItems(segments);
        const questions = this.extractQuestions(segments);
        
        // Generate AI-powered insights if available
        let aiInsights = null;
        if (this.openAIService && segments.length > 0) {
            try {
                const fullText = segments.map(s => s.text).join(' ');
                aiInsights = await this.openAIService.generateInsights(fullText, metadata);
            } catch (error) {
                logger.warn('AI insights generation failed:', error);
            }
        }
        
        return {
            summary: this.generateSummary(segments, metadata),
            metadata: parsedContent.metadata,
            speakerAnalysis,
            topicAnalysis,
            sentimentAnalysis,
            engagementAnalysis,
            keyMoments,
            actionItems,
            questions,
            aiInsights,
            coachingInsights: this.extractCoachingInsights(segments, speakerAnalysis),
            processingMetadata: {
                analyzedAt: new Date().toISOString(),
                segmentCount: segments.length,
                format: parsedContent.type
            }
        };
    }

    /**
     * Analyze speakers in the transcript
     */
    analyzeSpeakers(segments) {
        const speakers = {};
        const speakerTurns = [];
        
        segments.forEach((segment, index) => {
            if (!segment.speaker) return;
            
            if (!speakers[segment.speaker]) {
                speakers[segment.speaker] = {
                    name: segment.speaker,
                    totalTime: 0,
                    totalWords: 0,
                    segmentCount: 0,
                    firstAppearance: index,
                    role: this.identifySpeakerRole(segment.speaker)
                };
            }
            
            const speaker = speakers[segment.speaker];
            speaker.totalTime += (segment.endSeconds - segment.startSeconds);
            speaker.totalWords += segment.text.split(/\s+/).filter(word => word).length;
            speaker.segmentCount++;
            
            // Track turn-taking
            if (speakerTurns.length === 0 || 
                speakerTurns[speakerTurns.length - 1].speaker !== segment.speaker) {
                speakerTurns.push({
                    speaker: segment.speaker,
                    startIndex: index,
                    startTime: segment.startSeconds
                });
            }
        });
        
        // Calculate participation percentages
        const totalTime = Object.values(speakers).reduce((sum, s) => sum + s.totalTime, 0);
        const totalWords = Object.values(speakers).reduce((sum, s) => sum + s.totalWords, 0);
        
        Object.values(speakers).forEach(speaker => {
            speaker.timePercentage = totalTime > 0 ? (speaker.totalTime / totalTime * 100).toFixed(1) : 0;
            speaker.wordPercentage = totalWords > 0 ? (speaker.totalWords / totalWords * 100).toFixed(1) : 0;
            speaker.averageSegmentLength = speaker.segmentCount > 0 
                ? (speaker.totalTime / speaker.segmentCount).toFixed(1) : 0;
        });
        
        return {
            speakers,
            speakerCount: Object.keys(speakers).length,
            dominantSpeaker: this.findDominantSpeaker(speakers),
            turnTaking: {
                totalTurns: speakerTurns.length,
                averageTurnDuration: speakerTurns.length > 0 
                    ? (totalTime / speakerTurns.length).toFixed(1) : 0
            }
        };
    }

    /**
     * Identify speaker role (coach/student/other)
     */
    identifySpeakerRole(speakerName) {
        if (!speakerName) return 'unknown';
        
        const coaches = this.knowledgeBase.getCoaches();
        const students = this.knowledgeBase.getStudents();
        
        const nameLower = speakerName.toLowerCase();
        
        if (coaches.some(coach => 
            coach.name.toLowerCase() === nameLower ||
            coach.firstName?.toLowerCase() === nameLower
        )) {
            return 'coach';
        }
        
        if (students.some(student => 
            student.name.toLowerCase() === nameLower ||
            student.firstName?.toLowerCase() === nameLower
        )) {
            return 'student';
        }
        
        return 'other';
    }

    /**
     * Analyze topics discussed
     */
    async analyzeTopics(segments) {
        const allText = segments.map(s => s.text).join(' ');
        const topics = [];
        
        // Coaching-related topic keywords
        const topicKeywords = {
            'Goal Setting': ['goal', 'objective', 'target', 'aim', 'plan'],
            'Progress Review': ['progress', 'improvement', 'growth', 'development'],
            'Challenges': ['challenge', 'difficulty', 'obstacle', 'problem', 'struggle'],
            'Strategies': ['strategy', 'approach', 'method', 'technique', 'tactic'],
            'Accountability': ['accountability', 'responsibility', 'commitment'],
            'Mindset': ['mindset', 'attitude', 'perspective', 'outlook', 'belief'],
            'Performance': ['performance', 'results', 'outcome', 'achievement'],
            'College Preparation': ['college', 'university', 'application', 'essay', 'admission'],
            'Test Preparation': ['sat', 'act', 'test', 'exam', 'score'],
            'Time Management': ['time', 'schedule', 'planning', 'deadline', 'priority']
        };
        
        Object.entries(topicKeywords).forEach(([topic, keywords]) => {
            const matches = keywords.filter(keyword => 
                allText.toLowerCase().includes(keyword.toLowerCase())
            );
            
            if (matches.length > 0) {
                const frequency = matches.reduce((sum, keyword) => {
                    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
                    const matchCount = (allText.match(regex) || []).length;
                    return sum + matchCount;
                }, 0);
                
                topics.push({
                    topic,
                    keywords: matches,
                    frequency,
                    relevance: Math.min(100, frequency * 10)
                });
            }
        });
        
        return topics.sort((a, b) => b.relevance - a.relevance);
    }

    /**
     * Analyze sentiment throughout the session
     */
    analyzeSentiment(segments) {
        const positiveWords = [
            'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 
            'good', 'positive', 'happy', 'excited', 'motivated',
            'confident', 'progress', 'success', 'achieve', 'improve'
        ];
        
        const negativeWords = [
            'bad', 'terrible', 'awful', 'difficult', 'hard', 
            'frustrated', 'angry', 'sad', 'disappointed', 'worried',
            'stressed', 'anxious', 'confused', 'struggle', 'fail'
        ];
        
        let positiveCount = 0;
        let negativeCount = 0;
        const timeline = [];
        
        segments.forEach(segment => {
            const text = segment.text.toLowerCase();
            const segmentPositive = positiveWords.filter(word => text.includes(word)).length;
            const segmentNegative = negativeWords.filter(word => text.includes(word)).length;
            
            positiveCount += segmentPositive;
            negativeCount += segmentNegative;
            
            let sentiment = 'neutral';
            if (segmentPositive > segmentNegative) sentiment = 'positive';
            else if (segmentNegative > segmentPositive) sentiment = 'negative';
            
            timeline.push({
                time: segment.startSeconds,
                sentiment,
                intensity: Math.max(segmentPositive, segmentNegative)
            });
        });
        
        const totalWords = positiveCount + negativeCount;
        const overallSentiment = positiveCount > negativeCount ? 'positive' : 
                                negativeCount > positiveCount ? 'negative' : 'neutral';
        
        return {
            overall: overallSentiment,
            positiveRatio: totalWords > 0 ? (positiveCount / totalWords * 100).toFixed(1) : 0,
            timeline,
            emotionalJourney: this.analyzeEmotionalJourney(timeline)
        };
    }

    /**
     * Analyze engagement patterns
     */
    analyzeEngagement(segments) {
        const metrics = {
            responseTime: this.analyzeResponseTimes(segments),
            questionFrequency: this.analyzeQuestionFrequency(segments),
            speakerBalance: this.analyzeSpeakerBalance(segments),
            interactionQuality: this.analyzeInteractionQuality(segments)
        };
        
        // Calculate overall engagement score
        const scores = [
            metrics.responseTime.score,
            metrics.questionFrequency.score,
            metrics.speakerBalance.score,
            metrics.interactionQuality.score
        ];
        
        const overallScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        
        return {
            overallScore: overallScore.toFixed(1),
            level: overallScore >= 80 ? 'high' : overallScore >= 60 ? 'medium' : 'low',
            metrics
        };
    }

    /**
     * Extract key moments from the session
     */
    extractKeyMoments(segments) {
        const keyMoments = [];
        
        // Look for breakthrough indicators
        const breakthroughPhrases = [
            'aha', 'i see', 'now i understand', 'that makes sense',
            'i get it', 'oh', 'exactly', 'yes'
        ];
        
        // Look for commitment indicators
        const commitmentPhrases = [
            'i will', 'i commit', 'i promise', 'definitely',
            'absolutely', 'for sure', 'i\'ll make sure'
        ];
        
        segments.forEach((segment, index) => {
            const textLower = segment.text.toLowerCase();
            
            // Check for breakthroughs
            if (breakthroughPhrases.some(phrase => textLower.includes(phrase))) {
                keyMoments.push({
                    type: 'breakthrough',
                    time: segment.startSeconds,
                    timeFormatted: segment.start,
                    speaker: segment.speaker,
                    text: segment.text,
                    significance: 'high'
                });
            }
            
            // Check for commitments
            if (commitmentPhrases.some(phrase => textLower.includes(phrase))) {
                keyMoments.push({
                    type: 'commitment',
                    time: segment.startSeconds,
                    timeFormatted: segment.start,
                    speaker: segment.speaker,
                    text: segment.text,
                    significance: 'high'
                });
            }
            
            // Check for questions followed by insights
            if (segment.text.includes('?') && index < segments.length - 1) {
                const nextSegment = segments[index + 1];
                if (nextSegment.speaker !== segment.speaker) {
                    keyMoments.push({
                        type: 'coaching_question',
                        time: segment.startSeconds,
                        timeFormatted: segment.start,
                        speaker: segment.speaker,
                        text: segment.text,
                        response: nextSegment.text,
                        significance: 'medium'
                    });
                }
            }
        });
        
        return keyMoments.sort((a, b) => a.time - b.time);
    }

    /**
     * Extract action items
     */
    async extractActionItems(segments) {
        const actionItems = [];
        const actionPhrases = [
            'will', 'going to', 'plan to', 'need to', 'should',
            'must', 'have to', 'action item', 'next step', 'follow up'
        ];
        
        segments.forEach(segment => {
            const textLower = segment.text.toLowerCase();
            
            if (actionPhrases.some(phrase => textLower.includes(phrase))) {
                // Simple extraction - could be enhanced with AI
                actionItems.push({
                    text: segment.text,
                    speaker: segment.speaker,
                    time: segment.startSeconds,
                    timeFormatted: segment.start,
                    priority: this.assessActionPriority(segment.text),
                    category: this.categorizeAction(segment.text)
                });
            }
        });
        
        return {
            items: actionItems,
            count: actionItems.length,
            byPriority: {
                high: actionItems.filter(item => item.priority === 'high').length,
                medium: actionItems.filter(item => item.priority === 'medium').length,
                low: actionItems.filter(item => item.priority === 'low').length
            }
        };
    }

    /**
     * Extract questions from transcript
     */
    extractQuestions(segments) {
        const questions = [];
        
        segments.forEach(segment => {
            if (segment.text.includes('?') || this.isQuestion(segment.text)) {
                questions.push({
                    text: segment.text,
                    speaker: segment.speaker,
                    speakerRole: this.identifySpeakerRole(segment.speaker),
                    time: segment.startSeconds,
                    timeFormatted: segment.start,
                    type: this.categorizeQuestion(segment.text)
                });
            }
        });
        
        return {
            all: questions,
            count: questions.length,
            byType: this.groupQuestionsByType(questions),
            bySpeaker: this.groupQuestionsBySpeaker(questions)
        };
    }

    /**
     * Extract coaching insights
     */
    extractCoachingInsights(segments, speakerAnalysis) {
        const insights = {
            coachingTechniques: [],
            studentEngagement: 'unknown',
            sessionEffectiveness: 'unknown',
            recommendations: []
        };
        
        // Identify coaching techniques used
        const techniques = {
            'Open Questions': ['what', 'how', 'why', 'tell me about'],
            'Active Listening': ['i hear', 'sounds like', 'it seems'],
            'Reflection': ['so you\'re saying', 'in other words', 'what i\'m hearing'],
            'Goal Setting': ['goal', 'objective', 'target', 'achieve'],
            'Accountability': ['commit', 'promise', 'will you', 'when will']
        };
        
        segments.forEach(segment => {
            const textLower = segment.text.toLowerCase();
            
            Object.entries(techniques).forEach(([technique, keywords]) => {
                if (keywords.some(keyword => textLower.includes(keyword))) {
                    if (!insights.coachingTechniques.includes(technique)) {
                        insights.coachingTechniques.push(technique);
                    }
                }
            });
        });
        
        // Assess student engagement based on speaker analysis
        const studentSpeakers = Object.values(speakerAnalysis.speakers)
            .filter(s => s.role === 'student');
            
        if (studentSpeakers.length > 0) {
            const avgParticipation = studentSpeakers.reduce((sum, s) => 
                sum + parseFloat(s.wordPercentage), 0) / studentSpeakers.length;
                
            insights.studentEngagement = avgParticipation >= 40 ? 'high' :
                                        avgParticipation >= 25 ? 'medium' : 'low';
        }
        
        // Generate recommendations
        if (insights.studentEngagement === 'low') {
            insights.recommendations.push('Consider using more open-ended questions to increase student participation');
        }
        
        if (insights.coachingTechniques.length < 3) {
            insights.recommendations.push('Try incorporating more varied coaching techniques');
        }
        
        return insights;
    }

    // Helper methods
    
    timeToSeconds(timeString) {
        const parts = timeString.split(':');
        const [hours, minutes, seconds] = parts.map(parseFloat);
        return hours * 3600 + minutes * 60 + seconds;
    }
    
    generateSummary(segments, metadata) {
        if (segments.length === 0) {
            return 'No transcript content available for analysis.';
        }
        
        const totalWords = segments.reduce((sum, s) => 
            sum + s.text.split(/\s+/).filter(w => w).length, 0);
        const speakerCount = new Set(segments.map(s => s.speaker).filter(s => s)).size;
        
        return `Session with ${speakerCount} speakers, ${totalWords} words, and ${segments.length} segments. ` +
               `${metadata.coach ? `Coach: ${metadata.coach}. ` : ''}` +
               `${metadata.student ? `Student: ${metadata.student}.` : ''}`;
    }
    
    findDominantSpeaker(speakers) {
        let dominant = null;
        let maxWords = 0;
        
        Object.entries(speakers).forEach(([name, data]) => {
            if (data.totalWords > maxWords) {
                maxWords = data.totalWords;
                dominant = name;
            }
        });
        
        return dominant;
    }
    
    analyzeEmotionalJourney(timeline) {
        if (timeline.length < 3) return 'insufficient_data';
        
        const start = timeline.slice(0, Math.floor(timeline.length / 3));
        const middle = timeline.slice(Math.floor(timeline.length / 3), Math.floor(2 * timeline.length / 3));
        const end = timeline.slice(Math.floor(2 * timeline.length / 3));
        
        const avgSentiment = (segments) => {
            const sentimentScore = segments.reduce((sum, s) => {
                return sum + (s.sentiment === 'positive' ? 1 : s.sentiment === 'negative' ? -1 : 0);
            }, 0);
            return sentimentScore / segments.length;
        };
        
        const startScore = avgSentiment(start);
        const endScore = avgSentiment(end);
        
        if (endScore > startScore + 0.3) return 'improving';
        if (endScore < startScore - 0.3) return 'declining';
        return 'stable';
    }
    
    analyzeResponseTimes(segments) {
        const responseTimes = [];
        
        for (let i = 1; i < segments.length; i++) {
            if (segments[i].speaker !== segments[i-1].speaker) {
                const responseTime = segments[i].startSeconds - segments[i-1].endSeconds;
                if (responseTime >= 0 && responseTime < 10) {
                    responseTimes.push(responseTime);
                }
            }
        }
        
        const avgResponse = responseTimes.length > 0 
            ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length 
            : 0;
            
        return {
            average: avgResponse.toFixed(2),
            score: avgResponse < 2 ? 90 : avgResponse < 4 ? 70 : 50
        };
    }
    
    analyzeQuestionFrequency(segments) {
        const questions = segments.filter(s => s.text.includes('?')).length;
        const frequency = segments.length > 0 ? questions / segments.length : 0;
        
        return {
            count: questions,
            frequency: (frequency * 100).toFixed(1),
            score: frequency > 0.15 ? 90 : frequency > 0.08 ? 70 : 50
        };
    }
    
    analyzeSpeakerBalance(segments) {
        const speakers = {};
        
        segments.forEach(segment => {
            if (segment.speaker) {
                speakers[segment.speaker] = (speakers[segment.speaker] || 0) + 1;
            }
        });
        
        const counts = Object.values(speakers);
        if (counts.length < 2) {
            return { balance: 'single_speaker', score: 30 };
        }
        
        const max = Math.max(...counts);
        const min = Math.min(...counts);
        const ratio = min / max;
        
        return {
            balance: ratio > 0.7 ? 'excellent' : ratio > 0.4 ? 'good' : 'poor',
            ratio: ratio.toFixed(2),
            score: ratio > 0.7 ? 90 : ratio > 0.4 ? 70 : 50
        };
    }
    
    analyzeInteractionQuality(segments) {
        let interactions = 0;
        let meaningfulInteractions = 0;
        
        for (let i = 1; i < segments.length; i++) {
            if (segments[i].speaker !== segments[i-1].speaker) {
                interactions++;
                
                // Check if interaction is meaningful (more than 10 words)
                if (segments[i].text.split(/\s+/).length > 10) {
                    meaningfulInteractions++;
                }
            }
        }
        
        const quality = interactions > 0 ? meaningfulInteractions / interactions : 0;
        
        return {
            totalInteractions: interactions,
            meaningfulInteractions,
            quality: (quality * 100).toFixed(1),
            score: quality > 0.7 ? 90 : quality > 0.5 ? 70 : 50
        };
    }
    
    isQuestion(text) {
        const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which'];
        const textLower = text.toLowerCase();
        
        return questionWords.some(word => textLower.startsWith(word)) ||
               textLower.includes('can you') ||
               textLower.includes('could you') ||
               textLower.includes('would you') ||
               textLower.includes('do you');
    }
    
    assessActionPriority(text) {
        const highPriorityWords = ['urgent', 'immediately', 'asap', 'critical', 'must'];
        const lowPriorityWords = ['eventually', 'sometime', 'maybe', 'consider'];
        
        const textLower = text.toLowerCase();
        
        if (highPriorityWords.some(word => textLower.includes(word))) return 'high';
        if (lowPriorityWords.some(word => textLower.includes(word))) return 'low';
        return 'medium';
    }
    
    categorizeAction(text) {
        const categories = {
            'Academic': ['homework', 'assignment', 'study', 'test', 'essay'],
            'College Prep': ['application', 'college', 'university', 'essay'],
            'Personal Development': ['practice', 'improve', 'develop', 'work on'],
            'Administrative': ['schedule', 'meeting', 'email', 'contact']
        };
        
        const textLower = text.toLowerCase();
        
        for (const [category, keywords] of Object.entries(categories)) {
            if (keywords.some(keyword => textLower.includes(keyword))) {
                return category;
            }
        }
        
        return 'Other';
    }
    
    categorizeQuestion(text) {
        const textLower = text.toLowerCase();
        
        if (textLower.startsWith('what')) return 'what';
        if (textLower.startsWith('how')) return 'how';
        if (textLower.startsWith('why')) return 'why';
        if (textLower.includes('?')) return 'other';
        return 'implied';
    }
    
    groupQuestionsByType(questions) {
        const byType = {};
        
        questions.forEach(q => {
            if (!byType[q.type]) {
                byType[q.type] = [];
            }
            byType[q.type].push(q);
        });
        
        return byType;
    }
    
    groupQuestionsBySpeaker(questions) {
        const bySpeaker = {};
        
        questions.forEach(q => {
            const speaker = q.speaker || 'Unknown';
            if (!bySpeaker[speaker]) {
                bySpeaker[speaker] = [];
            }
            bySpeaker[speaker].push(q);
        });
        
        return bySpeaker;
    }
    
    async cacheAnalysis(transcriptPath, analysis) {
        const cacheKey = `transcript:${transcriptPath}`;
        await this.cache.set(cacheKey, analysis, 3600); // 1 hour
    }
    
    generateFallbackAnalysis(metadata) {
        return {
            summary: 'Transcript not available for analysis.',
            metadata: {
                available: false,
                reason: 'file_not_found'
            },
            speakerAnalysis: { speakers: {}, speakerCount: 0 },
            topicAnalysis: [],
            sentimentAnalysis: { overall: 'neutral', timeline: [] },
            engagementAnalysis: { overallScore: 0, level: 'unknown' },
            keyMoments: [],
            actionItems: { items: [], count: 0 },
            questions: { all: [], count: 0 },
            coachingInsights: {
                coachingTechniques: [],
                studentEngagement: 'unknown',
                recommendations: ['Transcript required for detailed analysis']
            },
            processingMetadata: {
                analyzedAt: new Date().toISOString(),
                segmentCount: 0,
                format: 'none'
            }
        };
    }
}

module.exports = { TranscriptionAnalyzer }; 