const { 
    SessionOutcomes, 
    Outcome, 
    OutcomeType, 
    OutcomeStatus,
    OutcomeCategory,
    OutcomeStrategy,
    OutcomeMetrics
} = require('../models/Outcome');
const { OutcomeProcessingError } = require('../../shared/errors');

class OutcomesProcessor {
    constructor({ knowledgeBase, logger, metricsCollector, eventBus }) {
        this.knowledgeBase = knowledgeBase;
        this.logger = logger;
        this.metrics = metricsCollector;
        this.eventBus = eventBus;
    }

    async processOutcomes({ session, insights, recording }) {
        const startTime = Date.now();
        
        try {
            this.logger.info('Processing tangible outcomes', {
                sessionId: session.id,
                recordingId: recording.id,
                insightsCount: insights.getInsightCount()
            });
            
            // Emit start event
            this.eventBus.emit('outcomes.processing.started', {
                sessionId: session.id,
                recordingId: recording.id
            });
            
            // Create domain object
            const outcomes = new SessionOutcomes({
                sessionId: session.id,
                recordingId: recording.id,
                sessionDate: session.startTime,
                participants: session.participants.map(p => p.toJSON())
            });
            
            // Extract outcomes from different sources
            await Promise.all([
                this._extractActionItemOutcomes(outcomes, insights),
                this._extractBreakthroughOutcomes(outcomes, insights),
                this._extractProgressOutcomes(outcomes, insights),
                this._extractCoachingOutcomes(outcomes, insights)
            ]);
            
            // Enrich outcomes with knowledge base data
            await this._enrichOutcomes(outcomes);
            
            // Calculate quality metrics
            outcomes.calculateQualityMetrics();
            
            // Generate summary
            outcomes.generateSummary();
            
            // Track metrics
            this.metrics.recordOutcomeProcessing(
                Date.now() - startTime,
                outcomes.getOutcomeCount()
            );
            
            // Emit completion event
            this.eventBus.emit('outcomes.processing.completed', {
                sessionId: session.id,
                recordingId: recording.id,
                outcomeCount: outcomes.getOutcomeCount(),
                processingTime: Date.now() - startTime
            });
            
            return outcomes;
            
        } catch (error) {
            this.metrics.recordOutcomeProcessing(Date.now() - startTime, 0, 'failure');
            
            this.logger.error('Outcome processing failed', {
                error,
                sessionId: session.id,
                recordingId: recording.id
            });
            
            this.eventBus.emit('outcomes.processing.failed', {
                sessionId: session.id,
                recordingId: recording.id,
                error: error.message
            });
            
            throw new OutcomeProcessingError('Failed to process outcomes', error);
        }
    }

    async _extractActionItemOutcomes(outcomes, insights) {
        const actionItems = insights.getActionItems();
        
        for (const itemGroup of Object.values(actionItems)) {
            for (const item of itemGroup) {
                const outcome = new Outcome({
                    type: OutcomeType.ACTION_ITEM,
                    category: this._categorizeOutcome(item.item),
                    name: item.item,
                    description: item.context || 'Action item identified during session',
                    value: {
                        priority: item.priority || 'medium',
                        assignee: item.assignee || 'student',
                        deadline: item.deadline,
                        source: item.source
                    },
                    status: OutcomeStatus.PLANNED,
                    confidence: 0.9
                });
                
                // Set strategy
                outcome.setStrategy(new OutcomeStrategy({
                    approach: 'Action Planning',
                    components: ['goal_setting', 'commitment', 'accountability'],
                    rationale: 'Clear action items improve follow-through and progress',
                    effectiveness: this._calculateActionItemEffectiveness(item)
                }));
                
                // Set initial metrics
                outcome.setMetrics(new OutcomeMetrics({
                    clarity: this._assessClarity(item.item),
                    feasibility: this._assessFeasibility(item),
                    impact: this._assessImpact(item.priority),
                    commitment: 0.8
                }));
                
                outcomes.addOutcome(outcome);
            }
        }
    }

    async _extractBreakthroughOutcomes(outcomes, insights) {
        const breakthroughs = insights.getBreakthroughMoments();
        
        for (const breakthrough of breakthroughs) {
            const outcome = new Outcome({
                type: OutcomeType.BREAKTHROUGH,
                category: OutcomeCategory.PERSONAL_GROWTH,
                name: breakthrough.description || 'Breakthrough Moment',
                description: `Significant realization: ${breakthrough.description}`,
                value: {
                    impact: breakthrough.impact || 'high',
                    timestamp: breakthrough.timestamp,
                    context: breakthrough.context
                },
                status: OutcomeStatus.ACHIEVED,
                confidence: breakthrough.confidence || 0.85
            });
            
            // Set strategy
            outcome.setStrategy(new OutcomeStrategy({
                approach: 'Self-Discovery',
                components: ['powerful_questioning', 'reflection', 'awareness_building'],
                rationale: 'Breakthrough emerged through guided self-discovery',
                effectiveness: 0.9
            }));
            
            // Set metrics based on breakthrough impact
            outcome.setMetrics(new OutcomeMetrics({
                significance: this._assessBreakthroughSignificance(breakthrough),
                sustainability: 0.8,
                transferability: 0.7,
                emotionalImpact: 0.9
            }));
            
            // Add coaching intelligence
            outcome.addCoachingIntelligence({
                technique: 'Powerful Questioning',
                intervention: 'Created space for self-discovery',
                timing: 'Optimal moment for breakthrough',
                effectiveness: 0.9
            });
            
            // Add student intelligence
            outcome.addStudentIntelligence({
                realization: breakthrough.description,
                integration: 'Student expressed clear understanding',
                application: 'Can apply insight to other areas',
                readiness: 'High readiness for change'
            });
            
            outcomes.addOutcome(outcome);
        }
    }

    async _extractProgressOutcomes(outcomes, insights) {
        const studentProgress = insights.getStudentProgress();
        
        if (!studentProgress) return;
        
        // Extract confidence progress
        if (studentProgress.confidence > 0.7) {
            const outcome = new Outcome({
                type: OutcomeType.PROGRESS_INDICATOR,
                category: OutcomeCategory.SKILL_DEVELOPMENT,
                name: 'Increased Confidence',
                description: 'Student demonstrated increased confidence in abilities',
                value: {
                    metric: 'confidence',
                    score: studentProgress.confidence,
                    improvement: '+15%'
                },
                status: OutcomeStatus.IN_PROGRESS,
                confidence: studentProgress.confidence
            });
            
            outcome.setStrategy(new OutcomeStrategy({
                approach: 'Confidence Building',
                components: ['positive_reinforcement', 'skill_practice', 'success_recognition'],
                rationale: 'Building confidence through incremental successes',
                effectiveness: 0.8
            }));
            
            outcomes.addOutcome(outcome);
        }
        
        // Extract engagement progress
        if (studentProgress.engagement > 0.7) {
            const outcome = new Outcome({
                type: OutcomeType.PROGRESS_INDICATOR,
                category: OutcomeCategory.PERSONAL_GROWTH,
                name: 'High Engagement Level',
                description: 'Student showed exceptional engagement and participation',
                value: {
                    metric: 'engagement',
                    score: studentProgress.engagement,
                    indicators: studentProgress.indicators
                },
                status: OutcomeStatus.ACHIEVED,
                confidence: 0.9
            });
            
            outcomes.addOutcome(outcome);
        }
        
        // Extract specific progress indicators
        for (const indicator of studentProgress.indicators || []) {
            const outcome = new Outcome({
                type: OutcomeType.PROGRESS_INDICATOR,
                category: this._categorizeProgressIndicator(indicator),
                name: indicator.title || indicator,
                description: indicator.description || `Progress indicator: ${indicator}`,
                value: {
                    indicator: indicator,
                    evidence: indicator.evidence,
                    timestamp: indicator.timestamp
                },
                status: OutcomeStatus.IN_PROGRESS,
                confidence: 0.75
            });
            
            outcomes.addOutcome(outcome);
        }
    }

    async _extractCoachingOutcomes(outcomes, insights) {
        const coachingEffectiveness = insights.getCoachingEffectiveness();
        
        if (!coachingEffectiveness) return;
        
        // Extract successful coaching techniques
        for (const technique of coachingEffectiveness.techniques || []) {
            if (technique.effectiveness > 0.7) {
                const outcome = new Outcome({
                    type: OutcomeType.COACHING_MILESTONE,
                    category: OutcomeCategory.COACHING_EXCELLENCE,
                    name: `Effective Use of ${technique.technique}`,
                    description: `Coach successfully applied ${technique.technique} technique`,
                    value: {
                        technique: technique.technique,
                        effectiveness: technique.effectiveness,
                        context: technique.context,
                        studentResponse: technique.studentResponse
                    },
                    status: OutcomeStatus.ACHIEVED,
                    confidence: technique.effectiveness
                });
                
                outcome.setStrategy(new OutcomeStrategy({
                    approach: technique.technique,
                    components: this._getTechniqueComponents(technique.technique),
                    rationale: technique.rationale || 'Technique matched student needs',
                    effectiveness: technique.effectiveness
                }));
                
                outcomes.addOutcome(outcome);
            }
        }
        
        // Extract coaching milestones
        if (coachingEffectiveness.overallScore > 0.8) {
            const outcome = new Outcome({
                type: OutcomeType.COACHING_MILESTONE,
                category: OutcomeCategory.COACHING_EXCELLENCE,
                name: 'Exceptional Coaching Session',
                description: 'Coach demonstrated exceptional effectiveness throughout session',
                value: {
                    overallScore: coachingEffectiveness.overallScore,
                    strengths: coachingEffectiveness.strengths,
                    techniques: coachingEffectiveness.techniques.map(t => t.technique)
                },
                status: OutcomeStatus.ACHIEVED,
                confidence: 0.9
            });
            
            outcomes.addOutcome(outcome);
        }
    }

    async _enrichOutcomes(outcomes) {
        try {
            // Get coach and student data from knowledge base
            const participants = outcomes.getParticipants();
            const enrichmentData = await this.knowledgeBase.getEnrichmentData(participants);
            
            // Enrich each outcome with additional context
            for (const outcome of outcomes.getAllOutcomes()) {
                const enrichment = await this._generateEnrichment(outcome, enrichmentData);
                outcome.applyEnrichment(enrichment);
            }
            
        } catch (error) {
            this.logger.warn('Failed to enrich outcomes, continuing without enrichment', { error });
        }
    }

    async _generateEnrichment(outcome, enrichmentData) {
        const enrichment = {
            context: {},
            historicalReference: null,
            relatedOutcomes: [],
            programAlignment: null
        };
        
        // Add participant context
        if (enrichmentData.student) {
            enrichment.context.studentProfile = {
                grade: enrichmentData.student.grade,
                program: enrichmentData.student.program,
                goals: enrichmentData.student.goals
            };
        }
        
        if (enrichmentData.coach) {
            enrichment.context.coachProfile = {
                expertise: enrichmentData.coach.expertise,
                coachingStyle: enrichmentData.coach.style
            };
        }
        
        // Add program alignment
        if (enrichmentData.program) {
            enrichment.programAlignment = this._assessProgramAlignment(
                outcome,
                enrichmentData.program
            );
        }
        
        return enrichment;
    }

    // Helper methods
    _categorizeOutcome(text) {
        const textLower = text.toLowerCase();
        
        const categoryMap = {
            [OutcomeCategory.GOAL_SETTING]: ['goal', 'objective', 'target', 'plan'],
            [OutcomeCategory.ESSAY_DEVELOPMENT]: ['essay', 'writing', 'draft', 'composition'],
            [OutcomeCategory.TEST_PREPARATION]: ['test', 'sat', 'act', 'exam', 'prep'],
            [OutcomeCategory.AWARDS_RECOGNITION]: ['award', 'competition', 'contest', 'achievement'],
            [OutcomeCategory.COMMUNITY_PROJECTS]: ['community', 'service', 'volunteer', 'project'],
            [OutcomeCategory.SCHOLARSHIPS]: ['scholarship', 'financial', 'aid', 'grant'],
            [OutcomeCategory.ACADEMIC_RESEARCH]: ['research', 'study', 'investigation', 'academic'],
            [OutcomeCategory.LEADERSHIP_DEVELOPMENT]: ['leadership', 'lead', 'team', 'organize'],
            [OutcomeCategory.SKILL_DEVELOPMENT]: ['skill', 'ability', 'technique', 'improve'],
            [OutcomeCategory.PERSONAL_GROWTH]: ['growth', 'development', 'progress', 'confidence']
        };
        
        for (const [category, keywords] of Object.entries(categoryMap)) {
            if (keywords.some(keyword => textLower.includes(keyword))) {
                return category;
            }
        }
        
        return OutcomeCategory.GENERAL_DEVELOPMENT;
    }

    _calculateActionItemEffectiveness(item) {
        let effectiveness = 0.7; // Base score
        
        // Higher priority items are typically more effective
        if (item.priority === 'high') effectiveness += 0.1;
        if (item.priority === 'low') effectiveness -= 0.1;
        
        // Items with deadlines are more effective
        if (item.deadline) effectiveness += 0.1;
        
        // Items with clear assignment are more effective
        if (item.assignee && item.assignee !== 'unknown') effectiveness += 0.05;
        
        return Math.min(effectiveness, 1.0);
    }

    _assessClarity(itemText) {
        // Assess how clear and specific the action item is
        const wordCount = itemText.split(' ').length;
        
        if (wordCount < 3) return 0.3; // Too vague
        if (wordCount > 20) return 0.6; // Too complex
        
        // Check for action verbs
        const actionVerbs = ['complete', 'write', 'research', 'submit', 'create', 'develop', 'prepare'];
        const hasActionVerb = actionVerbs.some(verb => itemText.toLowerCase().includes(verb));
        
        return hasActionVerb ? 0.9 : 0.7;
    }

    _assessFeasibility(item) {
        let feasibility = 0.8; // Base score
        
        // Items with reasonable deadlines are more feasible
        if (item.deadline) {
            const daysUntilDeadline = this._calculateDaysUntilDeadline(item.deadline);
            if (daysUntilDeadline < 3) feasibility -= 0.2;
            if (daysUntilDeadline > 30) feasibility -= 0.1;
        }
        
        // High priority items might be less feasible if too many
        if (item.priority === 'high') feasibility -= 0.1;
        
        return Math.max(feasibility, 0.3);
    }

    _assessImpact(priority) {
        const impactMap = {
            'high': 0.9,
            'medium': 0.7,
            'low': 0.5
        };
        
        return impactMap[priority] || 0.6;
    }

    _assessBreakthroughSignificance(breakthrough) {
        const impactMap = {
            'high': 0.9,
            'medium': 0.7,
            'low': 0.5
        };
        
        return impactMap[breakthrough.impact] || 0.7;
    }

    _categorizeProgressIndicator(indicator) {
        const indicatorText = typeof indicator === 'string' ? indicator : indicator.title || '';
        
        if (indicatorText.toLowerCase().includes('skill')) {
            return OutcomeCategory.SKILL_DEVELOPMENT;
        }
        
        if (indicatorText.toLowerCase().includes('confidence')) {
            return OutcomeCategory.PERSONAL_GROWTH;
        }
        
        if (indicatorText.toLowerCase().includes('academic')) {
            return OutcomeCategory.ACADEMIC_ACHIEVEMENT;
        }
        
        return OutcomeCategory.GENERAL_DEVELOPMENT;
    }

    _getTechniqueComponents(technique) {
        const techniqueComponents = {
            'Active Listening': ['attention', 'understanding', 'reflection'],
            'Powerful Questioning': ['inquiry', 'curiosity', 'exploration'],
            'Goal Setting': ['vision', 'planning', 'commitment'],
            'Reframing': ['perspective', 'mindset', 'possibility'],
            'Accountability': ['responsibility', 'tracking', 'follow-through']
        };
        
        return techniqueComponents[technique] || ['coaching', 'guidance', 'support'];
    }

    _assessProgramAlignment(outcome, program) {
        // Assess how well the outcome aligns with program goals
        const alignment = {
            score: 0.7,
            matchedGoals: [],
            recommendations: []
        };
        
        // Check if outcome category matches program focus areas
        if (program.focusAreas?.includes(outcome.category)) {
            alignment.score += 0.2;
            alignment.matchedGoals.push(`Aligns with ${outcome.category} focus`);
        }
        
        // Check if outcome supports program objectives
        if (outcome.type === OutcomeType.ACTION_ITEM && program.emphasizesActionPlanning) {
            alignment.score += 0.1;
            alignment.matchedGoals.push('Supports program action planning objectives');
        }
        
        return alignment;
    }

    _calculateDaysUntilDeadline(deadline) {
        if (!deadline) return 30; // Default
        
        const deadlineDate = new Date(deadline);
        const today = new Date();
        const diffTime = deadlineDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return Math.max(diffDays, 0);
    }
}

module.exports = { OutcomesProcessor }; 