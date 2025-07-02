// src/domain/services/OutcomeExtractor.js

class OutcomeExtractor {
    constructor({ logger, knowledgeBaseService }) {
        this.logger = logger;
        this.knowledgeBaseService = knowledgeBaseService;
    }

    /**
     * Extract all outcomes from session insights
     */
    async extractOutcomes(insights, context = {}) {
        const outcomes = [];

        try {
            // Extract from action items
            if (insights?.actionItems) {
                const actionOutcomes = this.extractActionItemOutcomes(insights.actionItems);
                outcomes.push(...actionOutcomes);
            }

            // Extract from breakthrough moments
            if (insights?.keyHighlights?.breakthroughMoments) {
                const breakthroughOutcomes = this.extractBreakthroughOutcomes(
                    insights.keyHighlights.breakthroughMoments
                );
                outcomes.push(...breakthroughOutcomes);
            }

            // Extract from coaching insights
            if (insights?.transcriptInsights?.coachingInsights) {
                const coachingOutcomes = this.extractCoachingOutcomes(
                    insights.transcriptInsights.coachingInsights
                );
                outcomes.push(...coachingOutcomes);
            }

            // Extract from student progress
            if (insights?.combinedAnalysis?.studentProgress) {
                const progressOutcomes = this.extractProgressOutcomes(
                    insights.combinedAnalysis.studentProgress
                );
                outcomes.push(...progressOutcomes);
            }

            // Extract from session summary
            if (insights?.sessionSummary?.keyOutcomes) {
                const summaryOutcomes = this.extractSummaryOutcomes(
                    insights.sessionSummary.keyOutcomes
                );
                outcomes.push(...summaryOutcomes);
            }

            // Extract from goals and milestones
            if (insights?.goals || insights?.milestones) {
                const goalOutcomes = this.extractGoalOutcomes(insights);
                outcomes.push(...goalOutcomes);
            }

            // Extract from next steps
            if (insights?.nextSteps) {
                const nextStepOutcomes = this.extractNextStepOutcomes(insights.nextSteps);
                outcomes.push(...nextStepOutcomes);
            }

            // Deduplicate and enhance outcomes
            const processedOutcomes = await this.processOutcomes(outcomes, context);

            return processedOutcomes;

        } catch (error) {
            this.logger.error('Error extracting outcomes:', error);
            return outcomes;
        }
    }

    /**
     * Extract outcomes from action items
     */
    extractActionItemOutcomes(actionItems) {
        const outcomes = [];

        const priorities = ['highPriority', 'mediumPriority', 'lowPriority'];
        
        priorities.forEach(priority => {
            if (actionItems[priority]) {
                actionItems[priority].forEach(item => {
                    outcomes.push({
                        type: 'action_item',
                        category: this.categorizeOutcome(item.item || item.text || item),
                        description: item.item || item.text || item,
                        priority: priority.replace('Priority', ''),
                        assignee: item.assignee || 'unassigned',
                        deadline: item.deadline || null,
                        status: 'pending',
                        source: 'action_items',
                        timestamp: item.timestamp || null,
                        metadata: {
                            raw: item
                        }
                    });
                });
            }
        });

        return outcomes;
    }

    /**
     * Extract outcomes from breakthrough moments
     */
    extractBreakthroughOutcomes(breakthroughMoments) {
        return breakthroughMoments.map(moment => ({
            type: 'breakthrough',
            category: 'insight',
            description: moment.moment || moment.description || moment,
            priority: 'high',
            impact: moment.impact || 'significant',
            timestamp: moment.timestamp || null,
            status: 'achieved',
            source: 'breakthrough_moments',
            metadata: {
                raw: moment
            }
        }));
    }

    /**
     * Extract outcomes from coaching insights
     */
    extractCoachingOutcomes(coachingInsights) {
        const outcomes = [];

        // Extract from techniques used
        if (coachingInsights.coachingTechniques) {
            coachingInsights.coachingTechniques.forEach(technique => {
                outcomes.push({
                    type: 'coaching_technique',
                    category: 'methodology',
                    description: `Applied ${technique} technique`,
                    effectiveness: coachingInsights.effectiveness || 'high',
                    status: 'applied',
                    source: 'coaching_insights',
                    metadata: {
                        technique
                    }
                });
            });
        }

        // Extract from coaching outcomes
        if (coachingInsights.outcomes) {
            coachingInsights.outcomes.forEach(outcome => {
                outcomes.push({
                    type: 'coaching_outcome',
                    category: this.categorizeOutcome(outcome),
                    description: outcome,
                    status: 'achieved',
                    source: 'coaching_insights'
                });
            });
        }

        return outcomes;
    }

    /**
     * Extract outcomes from student progress
     */
    extractProgressOutcomes(studentProgress) {
        const outcomes = [];

        // Extract from indicators
        if (studentProgress.indicators) {
            studentProgress.indicators.forEach(indicator => {
                outcomes.push({
                    type: 'progress_indicator',
                    category: 'development',
                    description: indicator,
                    progress: studentProgress.overallProgress || 'moderate',
                    status: 'in_progress',
                    source: 'student_progress',
                    metadata: {
                        indicator
                    }
                });
            });
        }

        // Extract from milestones
        if (studentProgress.milestones) {
            studentProgress.milestones.forEach(milestone => {
                outcomes.push({
                    type: 'milestone',
                    category: 'achievement',
                    description: milestone.description || milestone,
                    status: milestone.achieved ? 'achieved' : 'pending',
                    date: milestone.date || null,
                    source: 'student_progress'
                });
            });
        }

        return outcomes;
    }

    /**
     * Extract outcomes from session summary
     */
    extractSummaryOutcomes(keyOutcomes) {
        return keyOutcomes.map(outcome => ({
            type: 'session_outcome',
            category: this.categorizeOutcome(outcome),
            description: outcome,
            status: 'noted',
            source: 'session_summary'
        }));
    }

    /**
     * Extract outcomes from goals
     */
    extractGoalOutcomes(insights) {
        const outcomes = [];

        if (insights.goals) {
            insights.goals.forEach(goal => {
                outcomes.push({
                    type: 'goal',
                    category: this.categorizeOutcome(goal.description || goal),
                    description: goal.description || goal,
                    timeline: goal.timeline || 'unspecified',
                    status: goal.status || 'active',
                    progress: goal.progress || 0,
                    source: 'goals',
                    metadata: {
                        raw: goal
                    }
                });
            });
        }

        if (insights.milestones) {
            insights.milestones.forEach(milestone => {
                outcomes.push({
                    type: 'milestone',
                    category: 'achievement',
                    description: milestone.description || milestone,
                    status: milestone.completed ? 'achieved' : 'pending',
                    date: milestone.date || null,
                    source: 'milestones'
                });
            });
        }

        return outcomes;
    }

    /**
     * Extract outcomes from next steps
     */
    extractNextStepOutcomes(nextSteps) {
        return nextSteps.map((step, index) => ({
            type: 'next_step',
            category: this.categorizeOutcome(step),
            description: step,
            priority: index === 0 ? 'high' : 'medium',
            status: 'planned',
            source: 'next_steps'
        }));
    }

    /**
     * Process and enhance outcomes
     */
    async processOutcomes(outcomes, context) {
        // Remove duplicates
        const uniqueOutcomes = this.deduplicateOutcomes(outcomes);

        // Enhance with context
        const enhancedOutcomes = uniqueOutcomes.map(outcome => ({
            ...outcome,
            id: this.generateOutcomeId(),
            extractedAt: new Date().toISOString(),
            context: {
                recordingId: context.recordingId,
                sessionDate: context.sessionDate,
                participants: context.participants
            }
        }));

        // Sort by priority
        return enhancedOutcomes.sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            return (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
        });
    }

    /**
     * Deduplicate outcomes
     */
    deduplicateOutcomes(outcomes) {
        const seen = new Set();
        return outcomes.filter(outcome => {
            const key = `${outcome.type}-${outcome.description}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    /**
     * Categorize outcome based on content
     */
    categorizeOutcome(text) {
        if (!text) return 'general';
        
        const textLower = text.toString().toLowerCase();
        
        // Academic categories
        if (textLower.includes('essay') || textLower.includes('writing')) return 'essay_development';
        if (textLower.includes('test') || textLower.includes('sat') || textLower.includes('act')) return 'test_preparation';
        if (textLower.includes('research') || textLower.includes('study')) return 'academic_research';
        if (textLower.includes('grade') || textLower.includes('gpa')) return 'academic_performance';
        
        // Development categories
        if (textLower.includes('goal') || textLower.includes('plan')) return 'goal_setting';
        if (textLower.includes('leadership') || textLower.includes('lead')) return 'leadership_development';
        if (textLower.includes('skill') || textLower.includes('ability')) return 'skill_development';
        if (textLower.includes('project') || textLower.includes('community')) return 'project_management';
        
        // Application categories
        if (textLower.includes('college') || textLower.includes('university')) return 'college_application';
        if (textLower.includes('award') || textLower.includes('competition')) return 'awards_recognition';
        if (textLower.includes('scholarship') || textLower.includes('financial')) return 'scholarships';
        if (textLower.includes('interview') || textLower.includes('admission')) return 'interview_preparation';
        
        // Personal development
        if (textLower.includes('confidence') || textLower.includes('self')) return 'personal_growth';
        if (textLower.includes('time') || textLower.includes('manage')) return 'time_management';
        if (textLower.includes('stress') || textLower.includes('anxiety')) return 'stress_management';
        
        return 'general_development';
    }

    /**
     * Generate unique outcome ID
     */
    generateOutcomeId() {
        return `outcome-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get outcome statistics
     */
    getOutcomeStatistics(outcomes) {
        const stats = {
            total: outcomes.length,
            byType: {},
            byCategory: {},
            byStatus: {},
            byPriority: {},
            bySource: {}
        };

        outcomes.forEach(outcome => {
            // Count by type
            stats.byType[outcome.type] = (stats.byType[outcome.type] || 0) + 1;
            
            // Count by category
            stats.byCategory[outcome.category] = (stats.byCategory[outcome.category] || 0) + 1;
            
            // Count by status
            stats.byStatus[outcome.status] = (stats.byStatus[outcome.status] || 0) + 1;
            
            // Count by priority
            if (outcome.priority) {
                stats.byPriority[outcome.priority] = (stats.byPriority[outcome.priority] || 0) + 1;
            }
            
            // Count by source
            stats.bySource[outcome.source] = (stats.bySource[outcome.source] || 0) + 1;
        });

        return stats;
    }
}

module.exports = OutcomeExtractor; 