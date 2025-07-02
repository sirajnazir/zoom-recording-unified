/**
 * Session Analyzer Service
 * 
 * Orchestrates the analysis of recording sessions by coordinating
 * various analyzers and services.
 */

class SessionAnalyzerService {
    constructor({ 
        nameStandardizationService, 
        weekInferenceService, 
        transcriptAnalyzer, 
        participantAnalyzer 
    }) {
        this.nameStandardizationService = nameStandardizationService;
        this.weekInferenceService = weekInferenceService;
        this.transcriptAnalyzer = transcriptAnalyzer;
        this.participantAnalyzer = participantAnalyzer;
    }

    /**
     * Analyze a complete session
     */
    async analyzeSession(recordingData, transcriptPath = null) {
        try {
            const analysis = {
                metadata: {
                    version: '1.0.0',
                    analyzedAt: new Date().toISOString(),
                    recordingId: recordingData.id,
                    sessionType: 'unknown'
                },
                session: null,
                transcript: null,
                participants: null,
                insights: null,
                errors: []
            };

            // Step 1: Analyze session structure
            analysis.session = await this.analyzeSessionStructure(recordingData);

            // Step 2: Analyze transcript if available
            if (transcriptPath) {
                try {
                    analysis.transcript = await this.transcriptAnalyzer.analyze(transcriptPath);
                } catch (error) {
                    analysis.errors.push(`Transcript analysis failed: ${error.message}`);
                }
            }

            // Step 3: Analyze participants
            try {
                analysis.participants = await this.analyzeParticipants(recordingData);
            } catch (error) {
                analysis.errors.push(`Participant analysis failed: ${error.message}`);
            }

            // Step 4: Generate insights
            analysis.insights = this.generateSessionInsights(analysis);

            return analysis;

        } catch (error) {
            throw new Error(`Session analysis failed: ${error.message}`);
        }
    }

    /**
     * Analyze session structure and metadata
     */
    async analyzeSessionStructure(recordingData) {
        const session = {
            recordingId: recordingData.id,
            meetingId: recordingData.meeting_id,
            topic: recordingData.topic || 'Unknown',
            startTime: recordingData.start_time,
            endTime: recordingData.end_time,
            duration: recordingData.duration || 0,
            participantCount: recordingData.participant_count || 0,
            recordingType: recordingData.recording_type || 'unknown',
            sessionType: this.determineSessionType(recordingData),
            characteristics: this.analyzeSessionCharacteristics(recordingData)
        };

        // Infer week number if possible
        if (session.startTime) {
            try {
                session.weekNumber = await this.weekInferenceService.inferWeek(session.startTime);
            } catch (error) {
                session.weekNumber = null;
            }
        }

        return session;
    }

    /**
     * Determine session type based on metadata
     */
    determineSessionType(recordingData) {
        const topic = (recordingData.topic || '').toLowerCase();
        const participantCount = recordingData.participant_count || 0;

        // Check for specific session types based on topic
        if (topic.includes('coaching') || topic.includes('mentor')) {
            return 'coaching';
        }
        if (topic.includes('assessment') || topic.includes('evaluation')) {
            return 'assessment';
        }
        if (topic.includes('group') || topic.includes('workshop')) {
            return 'group';
        }
        if (topic.includes('interview') || topic.includes('consultation')) {
            return 'consultation';
        }

        // Default based on participant count
        if (participantCount <= 2) {
            return 'one-on-one';
        } else if (participantCount <= 5) {
            return 'small-group';
        } else {
            return 'large-group';
        }
    }

    /**
     * Analyze session characteristics
     */
    analyzeSessionCharacteristics(recordingData) {
        const duration = recordingData.duration || 0;
        const participantCount = recordingData.participant_count || 0;

        return {
            isOneOnOne: participantCount <= 2,
            isGroupSession: participantCount > 2,
            isLongSession: duration > 60,
            isShortSession: duration < 30,
            isMediumSession: duration >= 30 && duration <= 60,
            hasVideo: recordingData.recording_type === 'video',
            hasAudio: recordingData.recording_type === 'audio' || recordingData.recording_type === 'video',
            isHighQuality: recordingData.recording_quality === 'high'
        };
    }

    /**
     * Analyze participants
     */
    async analyzeParticipants(recordingData) {
        const participants = {
            totalCount: recordingData.participant_count || 0,
            activeCount: 0,
            roles: [],
            interactions: [],
            engagement: 'unknown'
        };

        // If we have participant data, analyze it
        if (recordingData.participants && Array.isArray(recordingData.participants)) {
            participants.activeCount = recordingData.participants.length;
            participants.roles = this.extractParticipantRoles(recordingData.participants);
            participants.interactions = this.analyzeParticipantInteractions(recordingData.participants);
            participants.engagement = this.calculateParticipantEngagement(recordingData.participants);
        }

        return participants;
    }

    /**
     * Extract participant roles
     */
    extractParticipantRoles(participants) {
        const roles = [];
        
        participants.forEach(participant => {
            const name = participant.name || participant.user_name || 'Unknown';
            const role = this.nameStandardizationService.standardizeRole(name);
            roles.push({
                name: name,
                role: role,
                joinTime: participant.join_time,
                leaveTime: participant.leave_time
            });
        });

        return roles;
    }

    /**
     * Analyze participant interactions
     */
    analyzeParticipantInteractions(participants) {
        // This would analyze speaking patterns, questions asked, etc.
        // For now, return basic interaction data
        return participants.map(participant => ({
            name: participant.name || participant.user_name,
            speakingTime: participant.speaking_time || 0,
            questionsAsked: participant.questions_asked || 0,
            engagementLevel: 'medium'
        }));
    }

    /**
     * Calculate participant engagement
     */
    calculateParticipantEngagement(participants) {
        if (!participants || participants.length === 0) {
            return 'unknown';
        }

        const totalSpeakingTime = participants.reduce((sum, p) => sum + (p.speaking_time || 0), 0);
        const avgSpeakingTime = totalSpeakingTime / participants.length;

        if (avgSpeakingTime > 300) return 'high';
        if (avgSpeakingTime > 100) return 'medium';
        return 'low';
    }

    /**
     * Generate session insights
     */
    generateSessionInsights(analysis) {
        const insights = {
            sessionQuality: this.assessSessionQuality(analysis),
            keyObservations: this.generateKeyObservations(analysis),
            recommendations: this.generateRecommendations(analysis),
            nextSteps: this.suggestNextSteps(analysis)
        };

        return insights;
    }

    /**
     * Assess session quality
     */
    assessSessionQuality(analysis) {
        const quality = {
            overall: 0.7,
            factors: [],
            score: 0
        };

        const session = analysis.session;
        const transcript = analysis.transcript;
        const participants = analysis.participants;

        // Duration quality
        if (session.duration >= 30 && session.duration <= 90) {
            quality.factors.push('Optimal session duration');
            quality.score += 0.2;
        }

        // Participant engagement
        if (participants && participants.engagement === 'high') {
            quality.factors.push('High participant engagement');
            quality.score += 0.2;
        }

        // Transcript quality
        if (transcript && transcript.wordCount > 500) {
            quality.factors.push('Comprehensive transcript');
            quality.score += 0.2;
        }

        // Session type appropriateness
        if (session.sessionType === 'coaching' || session.sessionType === 'one-on-one') {
            quality.factors.push('Appropriate session type');
            quality.score += 0.1;
        }

        quality.overall = Math.min(quality.score, 1.0);
        return quality;
    }

    /**
     * Generate key observations
     */
    generateKeyObservations(analysis) {
        const observations = [];
        const session = analysis.session;

        observations.push(`${session.sessionType} session completed`);
        observations.push(`Duration: ${session.duration} minutes`);
        
        if (session.weekNumber) {
            observations.push(`Week ${session.weekNumber} session`);
        }

        if (analysis.participants && analysis.participants.totalCount > 0) {
            observations.push(`${analysis.participants.totalCount} participants`);
        }

        return observations;
    }

    /**
     * Generate recommendations
     */
    generateRecommendations(analysis) {
        const recommendations = [];
        const session = analysis.session;

        if (session.duration < 30) {
            recommendations.push('Consider longer sessions for more comprehensive coverage');
        }

        if (session.duration > 90) {
            recommendations.push('Consider breaking into multiple sessions for better focus');
        }

        if (analysis.participants && analysis.participants.engagement === 'low') {
            recommendations.push('Work on increasing participant engagement');
        }

        return recommendations;
    }

    /**
     * Suggest next steps
     */
    suggestNextSteps(analysis) {
        const nextSteps = [];
        const session = analysis.session;

        if (session.sessionType === 'coaching') {
            nextSteps.push('Schedule follow-up coaching session');
            nextSteps.push('Review action items from this session');
        }

        if (session.weekNumber) {
            nextSteps.push(`Prepare for week ${session.weekNumber + 1} session`);
        }

        return nextSteps;
    }
}

module.exports = { SessionAnalyzerService }; 