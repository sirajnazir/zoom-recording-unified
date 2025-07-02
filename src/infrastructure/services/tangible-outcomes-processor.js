require('dotenv').config();
const { logger } = require('./logger.js');

class TangibleOutcomesProcessor {
    constructor() {
        this.coaches = require('../../../data/coaches.json');
        this.students = require('../../../data/students.json');
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
                        components: [technique],
                        rationale: 'Technique was effective for student',
                        effectiveness: 0.8
                    },
                    execution: {
                        timeline: [],
                        quality: 'good',
                        challenges: [],
                        breakthroughs: [],
                        lessons: [`${technique} was effective`]
                    },
                    results: {
                        metrics: {
                            effectiveness: 0.8,
                            studentResponse: 'positive'
                        },
                        impact: 'Improved coaching effectiveness',
                        sustainability: 'high',
                        transferability: 'Can use with other students'
                    },
                    coachIntelligence: {
                        contribution: 'Applied effective technique',
                        techniques: [technique],
                        interventions: [],
                        effectiveness: 0.8
                    },
                    studentIntelligence: {
                        execution: 'Student responded well',
                        learning: 'Student benefited from technique',
                        growth: 'Student showed improvement',
                        motivation: 'Technique increased engagement',
                        futureApplications: 'Can apply technique again'
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

        // Extract from progress indicators
        if (studentProgress.indicators) {
            studentProgress.indicators.forEach(indicator => {
                outcomes.push({
                    outcomeId: `outcome-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    outcomeType: 'Progress Indicator',
                    outcomeCategory: 'Student Growth',
                    outcomeName: indicator,
                    outcomeValue: {
                        progress: 0.7,
                        indicator: indicator
                    },
                    outcomeStatus: 'In Progress',
                    strategy: {
                        development: 'Student showed progress',
                        components: ['growth', 'development'],
                        rationale: 'Student demonstrated improvement',
                        effectiveness: 0.7
                    },
                    execution: {
                        timeline: [],
                        quality: 'good',
                        challenges: [],
                        breakthroughs: [],
                        lessons: ['Progress indicators show growth']
                    },
                    results: {
                        metrics: {
                            progress: 0.7,
                            growth: 0.7
                        },
                        impact: 'Student showed measurable progress',
                        sustainability: 'medium',
                        transferability: 'Can build on progress'
                    },
                    coachIntelligence: {
                        contribution: 'Supported student growth',
                        techniques: ['support', 'encouragement'],
                        interventions: [],
                        effectiveness: 0.7
                    },
                    studentIntelligence: {
                        execution: 'Student made progress',
                        learning: 'Student learned and grew',
                        growth: 'Student showed improvement',
                        motivation: 'Progress increased motivation',
                        futureApplications: 'Can continue building on progress'
                    }
                });
            });
        }

        return outcomes;
    }

    /**
     * Create outcome from session summary
     */
    createOutcomeFromSummary(summaryOutcome, type) {
        return {
            outcomeId: `outcome-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            outcomeType: type,
            outcomeCategory: 'Session Outcome',
            outcomeName: summaryOutcome,
            outcomeValue: {
                achievement: 'session_outcome',
                description: summaryOutcome
            },
            outcomeStatus: 'Achieved',
            strategy: {
                development: 'Achieved during session',
                components: ['session_work'],
                rationale: 'Outcome achieved through session',
                effectiveness: 0.8
            },
            execution: {
                timeline: [],
                quality: 'good',
                challenges: [],
                breakthroughs: [],
                lessons: ['Session outcomes are valuable']
            },
            results: {
                metrics: {
                    achievement: 0.8,
                    satisfaction: 0.8
                },
                impact: 'Session outcome achieved',
                sustainability: 'medium',
                transferability: 'Can build on outcome'
            },
            coachIntelligence: {
                contribution: 'Facilitated outcome achievement',
                techniques: ['facilitation'],
                interventions: [],
                effectiveness: 0.8
            },
            studentIntelligence: {
                execution: 'Student achieved outcome',
                learning: 'Student learned from outcome',
                growth: 'Student grew through outcome',
                motivation: 'Outcome increased motivation',
                futureApplications: 'Can apply outcome learning'
            }
        };
    }

    /**
     * Categorize outcome
     */
    categorizeOutcome(text) {
        const textLower = text.toLowerCase();
        
        if (textLower.includes('goal') || textLower.includes('plan')) return 'Goal Setting';
        if (textLower.includes('essay') || textLower.includes('writing')) return 'Essay Development';
        if (textLower.includes('test') || textLower.includes('sat') || textLower.includes('act')) return 'Test Preparation';
        if (textLower.includes('award') || textLower.includes('competition')) return 'Awards & Recognition';
        if (textLower.includes('project') || textLower.includes('community')) return 'Community Projects';
        if (textLower.includes('scholarship') || textLower.includes('financial')) return 'Scholarships';
        if (textLower.includes('research') || textLower.includes('study')) return 'Academic Research';
        if (textLower.includes('leadership') || textLower.includes('team')) return 'Leadership Development';
        
        return 'General Development';
    }

    /**
     * Generate outcomes summary
     */
    generateOutcomesSummary(outcomes) {
        const summary = {
            totalOutcomes: outcomes.length,
            outcomeTypes: [...new Set(outcomes.map(o => o.outcomeType))],
            outcomeCategories: [...new Set(outcomes.map(o => o.outcomeCategory))],
            statusBreakdown: {
                planned: outcomes.filter(o => o.outcomeStatus === 'Planned').length,
                inProgress: outcomes.filter(o => o.outcomeStatus === 'In Progress').length,
                achieved: outcomes.filter(o => o.outcomeStatus === 'Achieved').length,
                failed: outcomes.filter(o => o.outcomeStatus === 'Failed').length
            },
            effectivenessScore: this.calculateAverageEffectiveness(outcomes),
            keyOutcomes: outcomes.slice(0, 5).map(o => ({
                name: o.outcomeName,
                type: o.outcomeType,
                status: o.outcomeStatus
            }))
        };

        return summary;
    }

    /**
     * Calculate outcomes quality metrics
     */
    calculateOutcomesQuality(outcomes) {
        const metrics = {
            completeness: outcomes.length > 0 ? 1.0 : 0.0,
            specificity: this.calculateSpecificity(outcomes),
            actionability: this.calculateActionability(outcomes),
            measurability: this.calculateMeasurability(outcomes),
            overallQuality: 0
        };

        metrics.overallQuality = (
            metrics.completeness * 0.3 +
            metrics.specificity * 0.3 +
            metrics.actionability * 0.2 +
            metrics.measurability * 0.2
        );

        return metrics;
    }

    /**
     * Calculate average effectiveness
     */
    calculateAverageEffectiveness(outcomes) {
        if (outcomes.length === 0) return 0;
        
        const totalEffectiveness = outcomes.reduce((sum, outcome) => {
            return sum + (outcome.strategy?.effectiveness || 0);
        }, 0);
        
        return totalEffectiveness / outcomes.length;
    }

    /**
     * Calculate specificity
     */
    calculateSpecificity(outcomes) {
        if (outcomes.length === 0) return 0;
        
        const specificOutcomes = outcomes.filter(outcome => {
            const name = outcome.outcomeName || '';
            return name.length > 10 && name.includes('specific');
        });
        
        return specificOutcomes.length / outcomes.length;
    }

    /**
     * Calculate actionability
     */
    calculateActionability(outcomes) {
        if (outcomes.length === 0) return 0;
        
        const actionableOutcomes = outcomes.filter(outcome => {
            return outcome.strategy?.components?.length > 0;
        });
        
        return actionableOutcomes.length / outcomes.length;
    }

    /**
     * Calculate measurability
     */
    calculateMeasurability(outcomes) {
        if (outcomes.length === 0) return 0;
        
        const measurableOutcomes = outcomes.filter(outcome => {
            return outcome.results?.metrics && Object.keys(outcome.results.metrics).length > 0;
        });
        
        return measurableOutcomes.length / outcomes.length;
    }
}

module.exports = TangibleOutcomesProcessor;
module.exports.TangibleOutcomesProcessor = TangibleOutcomesProcessor; 