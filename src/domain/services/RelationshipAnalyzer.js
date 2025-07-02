// src/domain/services/RelationshipAnalyzer.js

class RelationshipAnalyzer {
    constructor({ logger, knowledgeBaseService }) {
        this.logger = logger;
        this.knowledgeBaseService = knowledgeBaseService;
    }

    /**
     * Analyze relationships in the recording context
     */
    async analyzeRelationships(context) {
        try {
            const relationships = [];

            // Analyze participant relationships
            if (context.participants && context.participants.length > 1) {
                const participantRelationships = await this.analyzeParticipantRelationships(
                    context.participants,
                    context
                );
                relationships.push(...participantRelationships);
            }

            // Analyze coach-student relationships
            if (context.insights) {
                const coachingRelationships = await this.analyzeCoachingRelationships(
                    context.insights,
                    context.participants
                );
                relationships.push(...coachingRelationships);
            }

            // Analyze program relationships
            if (context.metadata?.program) {
                const programRelationships = await this.analyzeProgramRelationships(
                    context.metadata,
                    context.participants
                );
                relationships.push(...programRelationships);
            }

            // Analyze historical relationships
            const historicalRelationships = await this.analyzeHistoricalRelationships(context);
            relationships.push(...historicalRelationships);

            // Process and enhance relationships
            const processedRelationships = await this.processRelationships(relationships, context);

            return processedRelationships;

        } catch (error) {
            this.logger.error('Error analyzing relationships:', error);
            return [];
        }
    }

    /**
     * Analyze relationships between participants
     */
    async analyzeParticipantRelationships(participants, context) {
        const relationships = [];

        for (let i = 0; i < participants.length; i++) {
            for (let j = i + 1; j < participants.length; j++) {
                const participant1 = participants[i];
                const participant2 = participants[j];

                const relationship = await this.createParticipantRelationship(
                    participant1,
                    participant2,
                    context
                );

                if (relationship) {
                    relationships.push(relationship);
                }
            }
        }

        return relationships;
    }

    /**
     * Create relationship between two participants
     */
    async createParticipantRelationship(participant1, participant2, context) {
        // Determine participant roles
        const role1 = await this.determineParticipantRole(participant1);
        const role2 = await this.determineParticipantRole(participant2);

        // Determine relationship type
        const relationshipType = this.determineRelationshipType(role1, role2);

        // Calculate interaction metrics
        const interactionMetrics = this.calculateInteractionMetrics(
            participant1,
            participant2,
            context
        );

        return {
            id: this.generateRelationshipId(),
            type: relationshipType,
            participants: [
                {
                    name: participant1.name,
                    role: role1,
                    email: participant1.email
                },
                {
                    name: participant2.name,
                    role: role2,
                    email: participant2.email
                }
            ],
            strength: this.calculateRelationshipStrength(interactionMetrics),
            metrics: interactionMetrics,
            context: {
                sessionDate: context.sessionDate,
                recordingId: context.recordingId,
                topic: context.topic
            },
            status: 'active'
        };
    }

    /**
     * Analyze coaching relationships
     */
    async analyzeCoachingRelationships(insights, participants) {
        const relationships = [];

        // Identify coach and students
        const coaches = participants.filter(p => this.isCoach(p));
        const students = participants.filter(p => this.isStudent(p));

        for (const coach of coaches) {
            for (const student of students) {
                const relationship = {
                    id: this.generateRelationshipId(),
                    type: 'coach_student',
                    participants: [
                        {
                            name: coach.name,
                            role: 'coach',
                            email: coach.email
                        },
                        {
                            name: student.name,
                            role: 'student',
                            email: student.email
                        }
                    ],
                    quality: this.assessCoachingQuality(insights),
                    effectiveness: this.assessCoachingEffectiveness(insights),
                    dynamics: {
                        rapport: this.assessRapport(insights),
                        engagement: this.assessEngagement(insights),
                        trust: this.assessTrust(insights)
                    },
                    status: 'active'
                };

                relationships.push(relationship);
            }
        }

        return relationships;
    }

    /**
     * Analyze program relationships
     */
    async analyzeProgramRelationships(metadata, participants) {
        const relationships = [];

        if (!metadata.program) return relationships;

        // Create program-participant relationships
        for (const participant of participants) {
            const role = await this.determineParticipantRole(participant);
            
            relationships.push({
                id: this.generateRelationshipId(),
                type: 'program_participant',
                entities: [
                    {
                        type: 'program',
                        name: metadata.program,
                        week: metadata.week
                    },
                    {
                        type: 'participant',
                        name: participant.name,
                        role: role
                    }
                ],
                context: {
                    programWeek: metadata.week,
                    sessionType: metadata.sessionType
                },
                status: 'active'
            });
        }

        return relationships;
    }

    /**
     * Analyze historical relationships
     */
    async analyzeHistoricalRelationships(context) {
        const relationships = [];

        // This would connect to historical data to find:
        // - Previous sessions between participants
        // - Long-term coaching relationships
        // - Program enrollment history

        // For now, return empty array
        // In production, this would query historical data
        return relationships;
    }

    /**
     * Process and enhance relationships
     */
    async processRelationships(relationships, context) {
        // Remove duplicates
        const uniqueRelationships = this.deduplicateRelationships(relationships);

        // Enhance with additional data
        const enhancedRelationships = uniqueRelationships.map(relationship => ({
            ...relationship,
            analyzedAt: new Date().toISOString(),
            sessionContext: {
                recordingId: context.recordingId,
                sessionDate: context.sessionDate,
                duration: context.duration
            }
        }));

        // Sort by importance
        return enhancedRelationships.sort((a, b) => {
            const importanceA = this.calculateRelationshipImportance(a);
            const importanceB = this.calculateRelationshipImportance(b);
            return importanceB - importanceA;
        });
    }

    /**
     * Determine participant role
     */
    async determineParticipantRole(participant) {
        // Check knowledge base
        if (this.knowledgeBaseService) {
            if (this.knowledgeBaseService.isStudent(participant.name)) {
                return 'student';
            }
            if (this.knowledgeBaseService.isCoach(participant.name)) {
                return 'coach';
            }
        }

        // Check email patterns
        if (participant.email) {
            if (participant.email.includes('@ivymentors')) {
                return 'coach';
            }
        }

        // Default based on context clues
        return 'participant';
    }

    /**
     * Determine relationship type
     */
    determineRelationshipType(role1, role2) {
        if (role1 === 'coach' && role2 === 'student') return 'coach_student';
        if (role1 === 'student' && role2 === 'coach') return 'coach_student';
        if (role1 === 'coach' && role2 === 'coach') return 'coach_collaboration';
        if (role1 === 'student' && role2 === 'student') return 'peer_learning';
        return 'general_interaction';
    }

    /**
     * Calculate interaction metrics
     */
    calculateInteractionMetrics(participant1, participant2, context) {
        const metrics = {
            totalInteractions: 0,
            speakingTimeRatio: 0,
            turnTaking: 0,
            responseTime: 0
        };

        // Calculate based on transcript data if available
        if (context.transcriptAnalysis) {
            // This would analyze actual transcript data
            // For now, return placeholder metrics
            metrics.totalInteractions = 10;
            metrics.speakingTimeRatio = 0.6;
            metrics.turnTaking = 0.8;
            metrics.responseTime = 2.5;
        }

        return metrics;
    }

    /**
     * Calculate relationship strength
     */
    calculateRelationshipStrength(metrics) {
        // Simple scoring based on metrics
        let strength = 0;

        if (metrics.totalInteractions > 5) strength += 0.25;
        if (metrics.speakingTimeRatio > 0.3 && metrics.speakingTimeRatio < 0.7) strength += 0.25;
        if (metrics.turnTaking > 0.7) strength += 0.25;
        if (metrics.responseTime < 3) strength += 0.25;

        return strength;
    }

    /**
     * Assess coaching quality
     */
    assessCoachingQuality(insights) {
        let quality = 0.5; // baseline

        if (insights?.coachingInsights?.effectiveness) {
            quality = insights.coachingInsights.effectiveness;
        }

        if (insights?.keyHighlights?.breakthroughMoments?.length > 0) {
            quality += 0.1;
        }

        if (insights?.actionItems?.highPriority?.length > 0) {
            quality += 0.1;
        }

        return Math.min(quality, 1.0);
    }

    /**
     * Assess coaching effectiveness
     */
    assessCoachingEffectiveness(insights) {
        let effectiveness = 0.5; // baseline

        // Check for positive outcomes
        if (insights?.outcomes?.length > 0) {
            effectiveness += 0.2;
        }

        // Check for student progress
        if (insights?.studentProgress?.indicators?.length > 0) {
            effectiveness += 0.2;
        }

        // Check for clear next steps
        if (insights?.nextSteps?.length > 0) {
            effectiveness += 0.1;
        }

        return Math.min(effectiveness, 1.0);
    }

    /**
     * Assess rapport
     */
    assessRapport(insights) {
        // This would analyze conversation patterns
        // For now, return a default value
        return 0.7;
    }

    /**
     * Assess engagement
     */
    assessEngagement(insights) {
        // This would analyze participation patterns
        // For now, return a default value
        return 0.8;
    }

    /**
     * Assess trust
     */
    assessTrust(insights) {
        // This would analyze conversation depth and openness
        // For now, return a default value
        return 0.75;
    }

    /**
     * Check if participant is a coach
     */
    isCoach(participant) {
        if (this.knowledgeBaseService?.isCoach) {
            return this.knowledgeBaseService.isCoach(participant.name);
        }
        return participant.email?.includes('@ivymentors') || false;
    }

    /**
     * Check if participant is a student
     */
    isStudent(participant) {
        if (this.knowledgeBaseService?.isStudent) {
            return this.knowledgeBaseService.isStudent(participant.name);
        }
        return !this.isCoach(participant);
    }

    /**
     * Deduplicate relationships
     */
    deduplicateRelationships(relationships) {
        const seen = new Set();
        return relationships.filter(relationship => {
            const key = this.createRelationshipKey(relationship);
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    /**
     * Create unique key for relationship
     */
    createRelationshipKey(relationship) {
        if (relationship.participants) {
            const names = relationship.participants
                .map(p => p.name)
                .sort()
                .join('-');
            return `${relationship.type}-${names}`;
        }
        return `${relationship.type}-${Date.now()}`;
    }

    /**
     * Calculate relationship importance
     */
    calculateRelationshipImportance(relationship) {
        let importance = 0;

        // Coach-student relationships are most important
        if (relationship.type === 'coach_student') importance += 0.5;

        // Active relationships are important
        if (relationship.status === 'active') importance += 0.2;

        // Strong relationships are important
        if (relationship.strength > 0.7) importance += 0.2;

        // High quality relationships are important
        if (relationship.quality > 0.7) importance += 0.1;

        return importance;
    }

    /**
     * Generate unique relationship ID
     */
    generateRelationshipId() {
        return `rel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get relationship statistics
     */
    getRelationshipStatistics(relationships) {
        const stats = {
            total: relationships.length,
            byType: {},
            byStatus: {},
            averageStrength: 0,
            averageQuality: 0
        };

        let totalStrength = 0;
        let totalQuality = 0;
        let strengthCount = 0;
        let qualityCount = 0;

        relationships.forEach(relationship => {
            // Count by type
            stats.byType[relationship.type] = (stats.byType[relationship.type] || 0) + 1;
            
            // Count by status
            stats.byStatus[relationship.status] = (stats.byStatus[relationship.status] || 0) + 1;
            
            // Sum strength
            if (relationship.strength !== undefined) {
                totalStrength += relationship.strength;
                strengthCount++;
            }
            
            // Sum quality
            if (relationship.quality !== undefined) {
                totalQuality += relationship.quality;
                qualityCount++;
            }
        });

        // Calculate averages
        stats.averageStrength = strengthCount > 0 ? totalStrength / strengthCount : 0;
        stats.averageQuality = qualityCount > 0 ? totalQuality / qualityCount : 0;

        return stats;
    }
}

module.exports = RelationshipAnalyzer; 