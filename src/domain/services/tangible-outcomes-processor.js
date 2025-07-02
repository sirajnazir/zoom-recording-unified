require('dotenv').config();
const { logger } = require('../../shared/Logger.js');

class TangibleOutcomesProcessor {
    constructor() {
        this.coaches = require('../../data/coaches.json');
        this.students = require('../../data/students.json');
    }

    /**
     * Process session outcomes and extract tangible results
     */
    async processSessionOutcomes(recordingData, insights) {
        try {
            logger.info(`🏆 Processing tangible outcomes for recording: ${recordingData.id}`);

            const outcomes = {
                metadata: {
                    version: "1.0.0",
                    generatedAt: new Date().toISOString(),
                    recordingId: recordingData.id,
                    meetingId: recordingData.meeting_id,
                    meetingUuid: recordingData.uuid,
                    topic: recordingData.topic,
                    startTime: recordingData.start_time,
                    duration: recordingData.duration
                },
                outcomes: [],
                summary: null,
                qualityMetrics: null
            };

            // Extract outcomes from insights
            outcomes.outcomes = await this.extractOutcomes(insights, recordingData);
            
            // Generate summary
            outcomes.summary = this.generateOutcomesSummary(outcomes.outcomes);
            
            // Calculate quality metrics
            outcomes.qualityMetrics = this.calculateOutcomesQuality(outcomes.outcomes);

            return outcomes;

        } catch (error) {
            logger.error('Error processing tangible outcomes:', error);
            throw error;
        }
    }

    /**
     * Extract tangible outcomes from session insights
     */
    async extractOutcomes(insights, recordingData) {
        const outcomes = [];

        // Extract from action items
        if (insights?.actionItems?.highPriority) {
            insights.actionItems.highPriority.forEach(item => {
                outcomes.push(this.createOutcomeFromActionItem(item, 'Action Item'));
            });
        }

        // Extract from breakthrough moments
        if (insights?.keyHighlights?.breakthroughMoments) {
            insights.keyHighlights.breakthroughMoments.forEach(moment => {
                outcomes.push(this.createOutcomeFromBreakthrough(moment, 'Breakthrough'));
            });
        }

        // Extract from coaching insights
        if (insights?.transcriptInsights?.coachingInsights) {
            const coachingOutcomes = this.extractCoachingOutcomes(insights.transcriptInsights.coachingInsights);
            outcomes.push(...coachingOutcomes);
        }

        // Extract from student progress
        if (insights?.combinedAnalysis?.studentProgress) {
            const progressOutcomes = this.extractProgressOutcomes(insights.combinedAnalysis.studentProgress);
            outcomes.push(...progressOutcomes);
        }

        // Extract from session summary
        if (insights?.sessionSummary?.keyOutcomes) {
            insights.sessionSummary.keyOutcomes.forEach(outcome => {
                outcomes.push(this.createOutcomeFromSummary(outcome, 'Session Outcome'));
            });
        }

        return outcomes;
    }

    /**
     * Create outcome from action item
     */
    createOutcomeFromActionItem(actionItem, type) {
        return {
            outcomeId: `outcome-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            outcomeType: type,
            outcomeCategory: this.categorizeOutcome(actionItem.item || actionItem.text),
            outcomeName: actionItem.item || actionItem.text,
            outcomeValue: {
                priority: actionItem.priority || 'medium',
                assignee: actionItem.assignee || 'student',
                deadline: actionItem.deadline || null
            },
            outcomeStatus: 'Planned',
            strategy: {
                development: 'Identified during session discussion',
                components: ['action_planning', 'commitment'],
                rationale: 'Student committed to specific action',
                effectiveness: 0.8
            },
            execution: {
                timeline: [
                    {
                        time: actionItem.timestamp || '00:00:00',
                        action: 'Action item identified',
                        studentResponse: 'committed'
                    }
                ],
                quality: 'good',
                challenges: [],
                breakthroughs: [],
                lessons: ['Clear action items improve follow-through']
            },
            results: {
                metrics: {
                    commitment: 0.8,
                    clarity: 0.9,
                    feasibility: 0.7
                },
                impact: 'Student has clear next steps',
                sustainability: 'medium',
                transferability: 'Can apply to other goal-setting'
            },
            coachIntelligence: {
                contribution: 'Helped student identify specific action',
                techniques: ['action_planning', 'commitment_building'],
                interventions: [
                    {
                        type: 'action_planning',
                        effectiveness: 0.8,
                        studentResponse: 'positive'
                    }
                ],
                effectiveness: 0.8
            },
            studentIntelligence: {
                execution: 'Student committed to action',
                learning: 'How to break goals into actions',
                growth: 'Improved action planning skills',
                motivation: 'Clear next steps increase motivation',
                futureApplications: 'Can use this approach for other goals'
            }
        };
    }

    /**
     * Create outcome from breakthrough moment
     */
    createOutcomeFromBreakthrough(breakthrough, type) {
        return {
            outcomeId: `outcome-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            outcomeType: type,
            outcomeCategory: 'Breakthrough',
            outcomeName: breakthrough.moment || breakthrough.description,
            outcomeValue: {
                impact: breakthrough.impact || 'high',
                significance: 'high',
                timestamp: breakthrough.timestamp
            },
            outcomeStatus: 'Achieved',
            strategy: {
                development: 'Emergent from coaching conversation',
                components: ['powerful_questioning', 'self_discovery'],
                rationale: 'Student had realization through coaching',
                effectiveness: 0.9
            },
            execution: {
                timeline: [
                    {
                        time: breakthrough.timestamp,
                        action: 'Breakthrough occurred',
                        studentResponse: 'realization'
                    }
                ],
                quality: 'excellent',
                challenges: [],
                breakthroughs: [
                    {
                        moment: breakthrough.moment,
                        timestamp: breakthrough.timestamp,
                        description: breakthrough.description
                    }
                ],
                lessons: ['Breakthroughs often come from self-discovery']
            },
            results: {
                metrics: {
                    clarity: 0.9,
                    motivation: 0.8,
                    confidence: 0.8
                },
                impact: 'Student gained new understanding',
                sustainability: 'high',
                transferability: 'Can apply insights to other areas'
            },
            coachIntelligence: {
                contribution: 'Created environment for breakthrough',
                techniques: ['powerful_questioning', 'active_listening'],
                interventions: [
                    {
                        type: 'questioning',
                        effectiveness: 0.9,
                        studentResponse: 'breakthrough'
                    }
                ],
                effectiveness: 0.9
            },
            studentIntelligence: {
                execution: 'Student had realization',
                learning: 'New understanding gained',
                growth: 'Increased self-awareness',
                motivation: 'Breakthrough increased motivation',
                futureApplications: 'Can apply insights broadly'
            }
        };
    }

    /**
     * Extract coaching outcomes
     */
    extractCoachingOutcomes(coachingInsights) {
        const outcomes = [];

        // Extract from coaching techniques
        if (coachingInsights.coachingTechniques) {
            coachingInsights.coachingTechniques.forEach(technique => {
                outcomes.push({
                    outcomeId: `outcome-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    outcomeType: 'Coaching Technique',
                    outcomeCategory: 'Coaching Excellence',
                    outcomeName: technique,
                    outcomeValue: {
                        effectiveness: 0.8,
                        usage: 'successful'
                    },
                    outcomeStatus: 'Achieved',
                    strategy: {
                        development: 'Coach applied specific technique',
                        components: ['technique_application', 'skill_development'],
                        rationale: 'Technique was effective in session',
                        effectiveness: 0.8
                    },
                    execution: {
                        timeline: [
                            {
                                time: '00:00:00',
                                action: 'Technique applied',
                                studentResponse: 'positive'
                            }
                        ],
                        quality: 'good',
                        challenges: [],
                        breakthroughs: [],
                        lessons: ['Technique was effective']
                    },
                    results: {
                        metrics: {
                            effectiveness: 0.8,
                            studentResponse: 0.8,
                            skillDevelopment: 0.7
                        },
                        impact: 'Improved coaching effectiveness',
                        sustainability: 'high',
                        transferability: 'Can use in future sessions'
                    },
                    coachIntelligence: {
                        contribution: 'Applied coaching technique effectively',
                        techniques: [technique],
                        interventions: [
                            {
                                type: technique,
                                effectiveness: 0.8,
                                studentResponse: 'positive'
                            }
                        ],
                        effectiveness: 0.8
                    },
                    studentIntelligence: {
                        execution: 'Student responded well to technique',
                        learning: 'Benefited from coaching approach',
                        growth: 'Improved through coaching',
                        motivation: 'Technique increased engagement',
                        futureApplications: 'Can benefit from similar approaches'
                    }
                });
            });
        }

        return outcomes;
    }

    /**
     * Extract progress outcomes
     */
    extractProgressOutcomes(studentProgress) {
        const outcomes = [];

        if (studentProgress.visibleGrowth) {
            studentProgress.visibleGrowth.forEach(growth => {
                outcomes.push({
                    outcomeId: `outcome-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    outcomeType: 'Student Growth',
                    outcomeCategory: 'Progress',
                    outcomeName: growth,
                    outcomeValue: {
                        growth: 'visible',
                        significance: 'high'
                    },
                    outcomeStatus: 'Achieved',
                    strategy: {
                        development: 'Emergent from coaching process',
                        components: ['skill_development', 'self_awareness'],
                        rationale: 'Student showed measurable growth',
                        effectiveness: 0.8
                    },
                    execution: {
                        timeline: [
                            {
                                time: '00:00:00',
                                action: 'Growth observed',
                                studentResponse: 'positive'
                            }
                        ],
                        quality: 'good',
                        challenges: [],
                        breakthroughs: [],
                        lessons: ['Growth is possible through coaching']
                    },
                    results: {
                        metrics: {
                            growth: 0.8,
                            sustainability: 0.7,
                            transferability: 0.8
                        },
                        impact: 'Student showed improvement',
                        sustainability: 'medium',
                        transferability: 'Can apply to other areas'
                    },
                    coachIntelligence: {
                        contribution: 'Facilitated student growth',
                        techniques: ['support', 'encouragement'],
                        interventions: [
                            {
                                type: 'growth_support',
                                effectiveness: 0.8,
                                studentResponse: 'growth'
                            }
                        ],
                        effectiveness: 0.8
                    },
                    studentIntelligence: {
                        execution: 'Student showed growth',
                        learning: 'New skills or awareness gained',
                        growth: 'Measurable improvement',
                        motivation: 'Growth increased motivation',
                        futureApplications: 'Can build on this growth'
                    }
                });
            });
        }

        return outcomes;
    }

    /**
     * Create outcome from summary
     */
    createOutcomeFromSummary(summaryOutcome, type) {
        return {
            outcomeId: `outcome-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            outcomeType: type,
            outcomeCategory: this.categorizeOutcome(summaryOutcome),
            outcomeName: summaryOutcome,
            outcomeValue: {
                significance: 'medium',
                sessionImpact: 'positive'
            },
            outcomeStatus: 'Achieved',
            strategy: {
                development: 'Session-based outcome',
                components: ['session_engagement', 'learning'],
                rationale: 'Outcome achieved during session',
                effectiveness: 0.7
            },
            execution: {
                timeline: [
                    {
                        time: '00:00:00',
                        action: 'Outcome achieved',
                        studentResponse: 'positive'
                    }
                ],
                quality: 'good',
                challenges: [],
                breakthroughs: [],
                lessons: ['Session was productive']
            },
            results: {
                metrics: {
                    achievement: 0.7,
                    satisfaction: 0.7,
                    learning: 0.7
                },
                impact: 'Session goal achieved',
                sustainability: 'medium',
                transferability: 'Can apply learning'
            },
            coachIntelligence: {
                contribution: 'Facilitated session outcome',
                techniques: ['session_management', 'goal_achievement'],
                interventions: [
                    {
                        type: 'session_facilitation',
                        effectiveness: 0.7,
                        studentResponse: 'positive'
                    }
                ],
                effectiveness: 0.7
            },
            studentIntelligence: {
                execution: 'Student achieved outcome',
                learning: 'Gained from session',
                growth: 'Improved through session',
                motivation: 'Achievement increased motivation',
                futureApplications: 'Can apply session learning'
            }
        };
    }

    /**
     * Categorize outcome based on content
     */
    categorizeOutcome(text) {
        if (!text) return 'General';
        
        const lowerText = text.toLowerCase();
        
        if (lowerText.includes('goal') || lowerText.includes('objective')) return 'Goal Setting';
        if (lowerText.includes('time') || lowerText.includes('schedule')) return 'Time Management';
        if (lowerText.includes('communicat') || lowerText.includes('speak')) return 'Communication';
        if (lowerText.includes('lead') || lowerText.includes('manage')) return 'Leadership';
        if (lowerText.includes('confiden') || lowerText.includes('self-esteem')) return 'Confidence';
        if (lowerText.includes('stress') || lowerText.includes('anxiety')) return 'Stress Management';
        if (lowerText.includes('learn') || lowerText.includes('understand')) return 'Learning';
        if (lowerText.includes('action') || lowerText.includes('plan')) return 'Action Planning';
        
        return 'General';
    }

    /**
     * Generate outcomes summary
     */
    generateOutcomesSummary(outcomes) {
        if (!outcomes || outcomes.length === 0) {
            return {
                totalOutcomes: 0,
                outcomeTypes: {},
                categories: {},
                status: {},
                averageEffectiveness: 0
            };
        }

        const summary = {
            totalOutcomes: outcomes.length,
            outcomeTypes: {},
            categories: {},
            status: {},
            averageEffectiveness: this.calculateAverageEffectiveness(outcomes)
        };

        outcomes.forEach(outcome => {
            // Count outcome types
            summary.outcomeTypes[outcome.outcomeType] = (summary.outcomeTypes[outcome.outcomeType] || 0) + 1;
            
            // Count categories
            summary.categories[outcome.outcomeCategory] = (summary.categories[outcome.outcomeCategory] || 0) + 1;
            
            // Count status
            summary.status[outcome.outcomeStatus] = (summary.status[outcome.outcomeStatus] || 0) + 1;
        });

        return summary;
    }

    /**
     * Calculate outcomes quality metrics
     */
    calculateOutcomesQuality(outcomes) {
        if (!outcomes || outcomes.length === 0) {
            return {
                specificity: 0,
                actionability: 0,
                measurability: 0,
                overallQuality: 0
            };
        }

        const specificity = this.calculateSpecificity(outcomes);
        const actionability = this.calculateActionability(outcomes);
        const measurability = this.calculateMeasurability(outcomes);

        return {
            specificity,
            actionability,
            measurability,
            overallQuality: (specificity + actionability + measurability) / 3
        };
    }

    /**
     * Calculate average effectiveness
     */
    calculateAverageEffectiveness(outcomes) {
        if (!outcomes || outcomes.length === 0) return 0;
        
        const totalEffectiveness = outcomes.reduce((sum, outcome) => {
            return sum + (outcome.strategy?.effectiveness || 0);
        }, 0);
        
        return totalEffectiveness / outcomes.length;
    }

    /**
     * Calculate specificity score
     */
    calculateSpecificity(outcomes) {
        if (!outcomes || outcomes.length === 0) return 0;
        
        let specificCount = 0;
        outcomes.forEach(outcome => {
            const name = outcome.outcomeName || '';
            if (name.length > 20 && name.includes('specific')) {
                specificCount++;
            }
        });
        
        return specificCount / outcomes.length;
    }

    /**
     * Calculate actionability score
     */
    calculateActionability(outcomes) {
        if (!outcomes || outcomes.length === 0) return 0;
        
        let actionableCount = 0;
        outcomes.forEach(outcome => {
            const name = outcome.outcomeName || '';
            if (name.includes('action') || name.includes('plan') || name.includes('do')) {
                actionableCount++;
            }
        });
        
        return actionableCount / outcomes.length;
    }

    /**
     * Calculate measurability score
     */
    calculateMeasurability(outcomes) {
        if (!outcomes || outcomes.length === 0) return 0;
        
        let measurableCount = 0;
        outcomes.forEach(outcome => {
            if (outcome.results?.metrics) {
                measurableCount++;
            }
        });
        
        return measurableCount / outcomes.length;
    }
}

module.exports = TangibleOutcomesProcessor; 