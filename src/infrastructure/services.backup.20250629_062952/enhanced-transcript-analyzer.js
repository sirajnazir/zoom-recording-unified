require('dotenv').config();
const fs = require('fs').promises;
const { logger } = require('../../shared/Logger.js');

class EnhancedTranscriptAnalyzer {
    constructor() {
        this.coaches = require('../../../data/coaches.json');
        this.students = require('../../../data/students.json');
    }

    /**
     * Parse VTT content into structured format
     */
    parseVTTContent(content) {
        const lines = content.split('\n');
        const transcript = [];
        let currentEntry = null;
        
        for (const line of lines) {
            // Skip WebVTT header and empty lines
            if (line.startsWith('WEBVTT') || line.trim() === '') continue;
            
            // Parse timestamp line
            const timestampMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/);
            if (timestampMatch) {
                if (currentEntry) {
                    transcript.push(currentEntry);
                }
                currentEntry = {
                    start: timestampMatch[1],
                    end: timestampMatch[2],
                    text: ''
                };
                continue;
            }
            
            // Parse speaker and text
            if (currentEntry) {
                const speakerMatch = line.match(/^([^:]+):\s*(.*)/);
                if (speakerMatch) {
                    currentEntry.speaker = speakerMatch[1].trim();
                    currentEntry.text = speakerMatch[2].trim();
                } else {
                    currentEntry.text = line.trim();
                }
            }
        }
        
        // Add the last entry
        if (currentEntry) {
            transcript.push(currentEntry);
        }
        
        return transcript;
    }

    /**
     * Analyze transcript file and extract insights
     */
    async analyzeTranscript(transcriptPath) {
        try {
            logger.info(`📝 Analyzing transcript: ${transcriptPath}`);
            
            // Check if transcript file exists
            try {
                await fs.access(transcriptPath);
            } catch (error) {
                logger.warn(`⚠️ Transcript file not found: ${transcriptPath}`);
                return this.generateFallbackAnalysis();
            }

            const transcriptContent = await fs.readFile(transcriptPath, 'utf8');
            
            if (!transcriptContent || transcriptContent.trim().length === 0) {
                logger.warn(`⚠️ Transcript file is empty: ${transcriptPath}`);
                return this.generateFallbackAnalysis();
            }

            // Parse VTT content
            const parsedTranscript = this.parseVTTContent(transcriptContent);
            
            if (!parsedTranscript || parsedTranscript.length === 0) {
                logger.warn(`⚠️ No valid transcript segments found: ${transcriptPath}`);
                return this.generateFallbackAnalysis();
            }

            // Generate comprehensive analysis
            const analysis = {
                summary: this.generateSummary(parsedTranscript),
                keyMoments: this.extractKeyMoments(parsedTranscript),
                speakerAnalysis: this.analyzeSpeakers(parsedTranscript),
                topics: this.extractTopics(parsedTranscript),
                actionItems: this.extractActionItems(parsedTranscript),
                questions: this.extractQuestions(parsedTranscript),
                sentiment: this.analyzeSentiment(parsedTranscript),
                engagement: this.analyzeEngagement(parsedTranscript),
                coachingInsights: this.extractCoachingInsights(parsedTranscript),
                metadata: {
                    totalSegments: parsedTranscript.length,
                    totalDuration: this.calculateTotalDuration(parsedTranscript),
                    wordCount: this.calculateWordCount(parsedTranscript),
                    speakerCount: this.countUniqueSpeakers(parsedTranscript),
                    analysisTimestamp: new Date().toISOString()
                }
            };

            logger.info(`✅ Transcript analysis completed successfully`);
            return analysis;

        } catch (error) {
            logger.error(`❌ Transcript analysis failed: ${error.message}`);
            return this.generateFallbackAnalysis();
        }
    }

    /**
     * Generate fallback analysis when transcript is not available
     */
    generateFallbackAnalysis() {
        logger.info(`🔄 Generating fallback analysis (no transcript available)`);
        
        return {
            summary: "Transcript not available for this recording. Analysis based on metadata only.",
            keyMoments: [],
            speakerAnalysis: {
                speakers: [],
                participation: {},
                dominantSpeaker: null
            },
            topics: [],
            actionItems: [],
            questions: [],
            sentiment: {
                overall: "neutral",
                breakdown: {}
            },
            engagement: {
                level: "unknown",
                metrics: {}
            },
            coachingInsights: {
                techniques: [],
                progress: [],
                recommendations: []
            },
            metadata: {
                totalSegments: 0,
                totalDuration: 0,
                wordCount: 0,
                speakerCount: 0,
                analysisTimestamp: new Date().toISOString(),
                fallback: true
            }
        };
    }

    /**
     * Generate a comprehensive session summary
     */
    generateSummary(transcript) {
        const allText = transcript.map(entry => entry.text).join(' ');
        const words = allText.split(/\s+/).filter(word => word.length > 0);
        
        // Extract key themes and topics
        const themes = this.extractThemes(allText);
        
        // Identify main discussion points
        const discussionPoints = this.identifyDiscussionPoints(transcript);
        
        // Generate summary based on content analysis
        const summary = {
            overview: this.generateOverview(transcript),
            keyThemes: themes,
            mainDiscussionPoints: discussionPoints,
            sessionStructure: this.analyzeSessionStructure(transcript),
            conclusion: this.extractConclusion(transcript)
        };

        return summary;
    }

    /**
     * Extract key moments from the session
     */
    extractKeyMoments(transcript) {
        const keyMoments = [];
        
        // Look for coaching breakthroughs
        const breakthroughs = this.findBreakthroughs(transcript);
        keyMoments.push(...breakthroughs);
        
        // Look for important questions
        const importantQuestions = this.findImportantQuestions(transcript);
        keyMoments.push(...importantQuestions);
        
        // Look for action items and commitments
        const commitments = this.findCommitments(transcript);
        keyMoments.push(...commitments);
        
        // Look for emotional moments
        const emotionalMoments = this.findEmotionalMoments(transcript);
        keyMoments.push(...emotionalMoments);
        
        return keyMoments.slice(0, 10); // Return top 10 key moments
    }

    /**
     * Analyze speakers and their participation
     */
    analyzeSpeakers(transcript) {
        const speakers = {};
        let totalDuration = 0;
        
        // Calculate speaking time for each speaker
        transcript.forEach(entry => {
            if (entry.speaker && entry.text) {
                const duration = this.calculateEntryDuration(entry);
                totalDuration += duration;
                
                if (!speakers[entry.speaker]) {
                    speakers[entry.speaker] = {
                        name: entry.speaker,
                        totalTime: 0,
                        wordCount: 0,
                        segments: 0,
                        role: this.identifyRole(entry.speaker)
                    };
                }
                
                speakers[entry.speaker].totalTime += duration;
                speakers[entry.speaker].wordCount += entry.text.split(/\s+/).length;
                speakers[entry.speaker].segments += 1;
            }
        });
        
        // Calculate participation percentages and engagement levels
        const speakerList = Object.values(speakers);
        speakerList.forEach(speaker => {
            speaker.participationPercentage = totalDuration > 0 ? (speaker.totalTime / totalDuration) * 100 : 0;
            speaker.engagementLevel = this.calculateEngagementLevel(speaker);
            speaker.effectiveness = this.calculateEffectiveness(speaker);
            speaker.techniques = this.identifyTechniques(speaker);
        });
        
        // Find dominant speaker
        const dominantSpeaker = speakerList.reduce((max, speaker) => 
            speaker.participationPercentage > max.participationPercentage ? speaker : max, speakerList[0]);
        
        return {
            speakers: speakerList,
            participation: {
                totalDuration,
                speakerCount: speakerList.length,
                averageParticipation: speakerList.length > 0 ? 100 / speakerList.length : 0
            },
            dominantSpeaker: dominantSpeaker || null
        };
    }

    /**
     * Extract topics from transcript
     */
    extractTopics(transcript) {
        const allText = transcript.map(entry => entry.text).join(' ');
        const topics = [];
        
        // Define topic keywords
        const topicKeywords = {
            'Goal Setting': ['goal', 'objective', 'target', 'aim', 'purpose'],
            'Time Management': ['time', 'schedule', 'prioritize', 'deadline', 'calendar'],
            'Communication': ['communicate', 'speak', 'listen', 'conversation', 'discuss'],
            'Leadership': ['lead', 'manage', 'team', 'decision', 'responsibility'],
            'Confidence': ['confidence', 'self-esteem', 'belief', 'trust', 'assurance'],
            'Stress Management': ['stress', 'anxiety', 'pressure', 'overwhelm', 'relax'],
            'Problem Solving': ['problem', 'solve', 'solution', 'challenge', 'issue'],
            'Career Development': ['career', 'job', 'work', 'professional', 'advancement']
        };
        
        // Calculate topic relevance
        for (const [topic, keywords] of Object.entries(topicKeywords)) {
            const relevance = this.calculateTopicRelevance(allText, keywords);
            if (relevance > 0.1) { // Minimum relevance threshold
                topics.push({
                    topic,
                    relevance,
                    keywords: keywords.filter(keyword => 
                        allText.toLowerCase().includes(keyword.toLowerCase())
                    ),
                    timeSpent: 'variable',
                    importance: relevance > 0.5 ? 'high' : relevance > 0.3 ? 'medium' : 'low'
                });
            }
        }
        
        return topics.sort((a, b) => b.relevance - a.relevance);
    }

    /**
     * Extract action items from transcript
     */
    extractActionItems(transcript) {
        const actionItems = [];
        
        transcript.forEach(entry => {
            const text = entry.text.toLowerCase();
            
            // Look for action indicators
            if (text.includes('will') || text.includes('going to') || 
                text.includes('need to') || text.includes('plan to') ||
                text.includes('should') || text.includes('must')) {
                
                actionItems.push({
                    item: entry.text,
                    speaker: entry.speaker,
                    timestamp: entry.start,
                    priority: this.assessPriority(entry.text),
                    category: this.categorizeAction(entry.text),
                    assignee: this.identifyAssignee(entry.text)
                });
            }
        });
        
        return actionItems;
    }

    /**
     * Extract questions from transcript
     */
    extractQuestions(transcript) {
        const questions = [];
        
        transcript.forEach(entry => {
            if (this.isQuestion(entry.text)) {
                questions.push({
                    question: entry.text,
                    speaker: entry.speaker,
                    timestamp: entry.start,
                    category: this.categorizeQuestion(entry.text),
                    importance: this.assessQuestionImportance(entry.text)
                });
            }
        });
        
        return questions;
    }

    /**
     * Analyze sentiment throughout the session
     */
    analyzeSentiment(transcript) {
        const positiveWords = ['good', 'great', 'excellent', 'positive', 'happy', 'satisfied', 'progress', 'improve', 'better'];
        const negativeWords = ['bad', 'terrible', 'negative', 'sad', 'frustrated', 'difficult', 'problem', 'worry', 'concern'];
        
        let positiveCount = 0;
        let negativeCount = 0;
        const sentimentTimeline = [];
        
        transcript.forEach(entry => {
            const text = entry.text.toLowerCase();
            let entrySentiment = 0;
            
            positiveWords.forEach(word => {
                const regex = new RegExp(`\\b${word}\\b`, 'gi');
                const matches = text.match(regex);
                if (matches) {
                    positiveCount += matches.length;
                    entrySentiment += matches.length;
                }
            });
            
            negativeWords.forEach(word => {
                const regex = new RegExp(`\\b${word}\\b`, 'gi');
                const matches = text.match(regex);
                if (matches) {
                    negativeCount += matches.length;
                    entrySentiment -= matches.length;
                }
            });
            
            sentimentTimeline.push({
                timestamp: entry.start,
                sentiment: entrySentiment > 0 ? 'positive' : entrySentiment < 0 ? 'negative' : 'neutral',
                intensity: Math.abs(entrySentiment)
            });
        });
        
        const overallSentiment = positiveCount > negativeCount ? 'positive' : 
                                negativeCount > positiveCount ? 'negative' : 'neutral';
        
        return {
            overall: overallSentiment,
            breakdown: {
                positive: positiveCount,
                negative: negativeCount,
                neutral: transcript.length - positiveCount - negativeCount
            },
            timeline: sentimentTimeline
        };
    }

    /**
     * Analyze engagement levels
     */
    analyzeEngagement(transcript) {
        const engagementFactors = {
            responseTime: this.analyzeResponseTimes(transcript),
            conversationFlow: this.analyzeConversationFlow(transcript),
            questionFrequency: this.analyzeQuestionFrequency(transcript),
            emotionalExpression: this.analyzeEmotionalExpression(transcript)
        };
        
        const overallEngagement = this.calculateOverallEngagement(engagementFactors);
        
        return {
            level: overallEngagement > 0.7 ? 'high' : overallEngagement > 0.4 ? 'medium' : 'low',
            metrics: engagementFactors,
            score: overallEngagement
        };
    }

    /**
     * Extract coaching-specific insights
     */
    extractCoachingInsights(transcript) {
        return {
            techniques: this.identifyCoachingTechniques(transcript),
            progress: this.findProgressIndicators(transcript),
            recommendations: this.identifyFollowUpNeeds(transcript),
            resistance: this.findResistancePoints(transcript)
        };
    }

    // Helper methods

    generateOverview(transcript) {
        const wordCount = this.calculateWordCount(transcript);
        const duration = this.calculateTotalDuration(transcript);
        
        return `Session with ${wordCount} words over ${duration} minutes of discussion`;
    }

    extractThemes(text) {
        const themes = [];
        const themeKeywords = {
            'goal setting': ['goal', 'objective', 'target'],
            'time management': ['time', 'schedule', 'prioritize'],
            'communication': ['communicate', 'speak', 'listen'],
            'leadership': ['lead', 'manage', 'team'],
            'confidence': ['confidence', 'self-esteem', 'belief']
        };
        
        for (const [theme, keywords] of Object.entries(themeKeywords)) {
            const count = keywords.reduce((total, keyword) => {
                const regex = new RegExp(keyword, 'gi');
                const matches = text.match(regex);
                return total + (matches ? matches.length : 0);
            }, 0);
            
            if (count > 2) {
                themes.push(theme);
            }
        }
        
        return themes;
    }

    identifyDiscussionPoints(transcript) {
        const points = [];
        const sentences = transcript.map(entry => entry.text).join(' ').split(/[.!?]+/);
        
        sentences.forEach(sentence => {
            if (sentence.includes('discuss') || sentence.includes('talk about') || 
                sentence.includes('explore') || sentence.includes('focus on')) {
                points.push(sentence.trim());
            }
        });
        
        return points.slice(0, 5);
    }

    analyzeSessionStructure(transcript) {
        return {
            phases: [
                { name: 'Opening', description: 'Session introduction' },
                { name: 'Main', description: 'Core discussion' },
                { name: 'Closing', description: 'Wrap-up and next steps' }
            ]
        };
    }

    extractConclusion(transcript) {
        const lastSegments = transcript.slice(-5);
        const conclusionText = lastSegments.map(entry => entry.text).join(' ');
        return conclusionText.length > 50 ? conclusionText.substring(0, 200) + '...' : 'No clear conclusion identified';
    }

    findBreakthroughs(transcript) {
        const breakthroughs = [];
        transcript.forEach(entry => {
            const text = entry.text.toLowerCase();
            if (text.includes('realize') || text.includes('understand') || text.includes('discover')) {
                breakthroughs.push({
                    timestamp: entry.start,
                    description: 'Breakthrough moment',
                    type: 'breakthrough',
                    speaker: entry.speaker
                });
            }
        });
        return breakthroughs;
    }

    findImportantQuestions(transcript) {
        const questions = [];
        transcript.forEach(entry => {
            if (this.isQuestion(entry.text) && entry.text.length > 20) {
                questions.push({
                    timestamp: entry.start,
                    description: entry.text,
                    type: 'question',
                    speaker: entry.speaker
                });
            }
        });
        return questions;
    }

    findCommitments(transcript) {
        const commitments = [];
        transcript.forEach(entry => {
            const text = entry.text.toLowerCase();
            if (text.includes('will') || text.includes('commit') || text.includes('promise')) {
                commitments.push({
                    timestamp: entry.start,
                    description: entry.text,
                    type: 'commitment',
                    speaker: entry.speaker
                });
            }
        });
        return commitments;
    }

    findEmotionalMoments(transcript) {
        const emotions = [];
        transcript.forEach(entry => {
            const text = entry.text.toLowerCase();
            if (text.includes('feel') || text.includes('emotion') || text.includes('upset') || text.includes('excited')) {
                emotions.push({
                    timestamp: entry.start,
                    description: entry.text,
                    type: 'emotional',
                    speaker: entry.speaker
                });
            }
        });
        return emotions;
    }

    calculateTotalDuration(transcript) {
        if (transcript.length === 0) return 0;
        const firstEntry = transcript[0];
        const lastEntry = transcript[transcript.length - 1];
        return this.timeToSeconds(lastEntry.end) - this.timeToSeconds(firstEntry.start);
    }

    calculateWordCount(transcript) {
        return transcript.reduce((total, entry) => {
            return total + (entry.text ? entry.text.split(/\s+/).length : 0);
        }, 0);
    }

    countUniqueSpeakers(transcript) {
        const speakers = new Set();
        transcript.forEach(entry => {
            if (entry.speaker) {
                speakers.add(entry.speaker);
            }
        });
        return speakers.size;
    }

    timeToSeconds(timeString) {
        const parts = timeString.split(':');
        return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
    }

    calculateEntryDuration(entry) {
        return this.timeToSeconds(entry.end) - this.timeToSeconds(entry.start);
    }

    identifyRole(speakerName) {
        const coachNames = this.coaches.map(c => c.name.toLowerCase());
        const studentNames = this.students.map(s => s.name.toLowerCase());
        
        if (coachNames.includes(speakerName.toLowerCase())) return 'coach';
        if (studentNames.includes(speakerName.toLowerCase())) return 'student';
        return 'unknown';
    }

    isQuestion(text) {
        return text.includes('?') || 
               text.toLowerCase().startsWith('what') || 
               text.toLowerCase().startsWith('how') || 
               text.toLowerCase().startsWith('why') ||
               text.toLowerCase().startsWith('when') ||
               text.toLowerCase().startsWith('where');
    }

    calculateEngagementLevel(speaker) {
        const wordsPerMinute = speaker.totalTime > 0 ? (speaker.wordCount / speaker.totalTime) * 60 : 0;
        if (wordsPerMinute > 150) return 'high';
        if (wordsPerMinute > 100) return 'medium';
        return 'low';
    }

    calculateEffectiveness(speaker) {
        return 0.7; // Placeholder
    }

    identifyTechniques(speaker) {
        return ['speaking', 'participation']; // Placeholder
    }

    calculateTopicRelevance(text, keywords) {
        const matches = keywords.reduce((total, keyword) => {
            const regex = new RegExp(keyword, 'gi');
            const match = text.match(regex);
            return total + (match ? match.length : 0);
        }, 0);
        
        return matches / keywords.length;
    }

    categorizeAction(text) {
        if (text.toLowerCase().includes('goal')) return 'goal-setting';
        if (text.toLowerCase().includes('time')) return 'time-management';
        if (text.toLowerCase().includes('communicate')) return 'communication';
        return 'general';
    }

    assessPriority(text) {
        if (text.toLowerCase().includes('urgent') || text.toLowerCase().includes('immediately')) return 'high';
        if (text.toLowerCase().includes('soon') || text.toLowerCase().includes('next week')) return 'medium';
        return 'low';
    }

    categorizeQuestion(text) {
        if (text.toLowerCase().includes('what') || text.toLowerCase().includes('how')) return 'exploratory';
        if (text.toLowerCase().includes('why')) return 'reflective';
        return 'clarification';
    }

    assessQuestionImportance(text) {
        if (text.length > 50) return 'high';
        if (text.length > 20) return 'medium';
        return 'low';
    }

    identifyAssignee(text) {
        if (text.toLowerCase().includes('i will') || text.toLowerCase().includes('i\'ll')) return 'speaker';
        if (text.toLowerCase().includes('you should') || text.toLowerCase().includes('you need')) return 'student';
        return 'unknown';
    }

    analyzeResponseTimes(transcript) {
        return '2.5 seconds average'; // Placeholder
    }

    analyzeConversationFlow(transcript) {
        return 'smooth'; // Placeholder
    }

    analyzeQuestionFrequency(transcript) {
        const questions = transcript.filter(entry => this.isQuestion(entry.text));
        return questions.length;
    }

    analyzeEmotionalExpression(transcript) {
        return 'moderate'; // Placeholder
    }

    calculateOverallEngagement(factors) {
        return 0.7; // Placeholder
    }

    identifyCoachingTechniques(transcript) {
        return ['active listening', 'questioning']; // Placeholder
    }

    findResistancePoints(transcript) {
        return []; // Placeholder
    }

    findProgressIndicators(transcript) {
        return []; // Placeholder
    }

    identifyFollowUpNeeds(transcript) {
        return []; // Placeholder
    }
}

module.exports = EnhancedTranscriptAnalyzer; 