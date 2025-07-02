const { v4: uuidv4 } = require('uuid');

// Enums
const OutcomeType = {
    ACTION_ITEM: 'ACTION_ITEM',
    BREAKTHROUGH: 'BREAKTHROUGH',
    PROGRESS_INDICATOR: 'PROGRESS_INDICATOR',
    COACHING_MILESTONE: 'COACHING_MILESTONE',
    ACHIEVEMENT: 'ACHIEVEMENT',
    SKILL_ACQUIRED: 'SKILL_ACQUIRED',
    GOAL_SET: 'GOAL_SET',
    CHALLENGE_IDENTIFIED: 'CHALLENGE_IDENTIFIED'
};

const OutcomeStatus = {
    PLANNED: 'PLANNED',
    IN_PROGRESS: 'IN_PROGRESS',
    ACHIEVED: 'ACHIEVED',
    FAILED: 'FAILED',
    DEFERRED: 'DEFERRED',
    CANCELLED: 'CANCELLED'
};

const OutcomeCategory = {
    GOAL_SETTING: 'Goal Setting',
    ESSAY_DEVELOPMENT: 'Essay Development',
    TEST_PREPARATION: 'Test Preparation',
    AWARDS_RECOGNITION: 'Awards & Recognition',
    COMMUNITY_PROJECTS: 'Community Projects',
    SCHOLARSHIPS: 'Scholarships',
    ACADEMIC_RESEARCH: 'Academic Research',
    ACADEMIC_ACHIEVEMENT: 'Academic Achievement',
    LEADERSHIP_DEVELOPMENT: 'Leadership Development',
    SKILL_DEVELOPMENT: 'Skill Development',
    PERSONAL_GROWTH: 'Personal Growth',
    COACHING_EXCELLENCE: 'Coaching Excellence',
    GENERAL_DEVELOPMENT: 'General Development'
};

// Value Objects
class OutcomeStrategy {
    constructor(data = {}) {
        this.approach = data.approach || 'Not specified';
        this.components = data.components || [];
        this.rationale = data.rationale || '';
        this.effectiveness = data.effectiveness || 0.5;
        this.adaptations = data.adaptations || [];
    }

    enhance(additionalStrategies) {
        if (additionalStrategies.components) {
            this.components = [...new Set([...this.components, ...additionalStrategies.components])];
        }
        
        if (additionalStrategies.effectiveness > this.effectiveness) {
            this.effectiveness = additionalStrategies.effectiveness;
        }
        
        if (additionalStrategies.adaptations) {
            this.adaptations.push(...additionalStrategies.adaptations);
        }
    }

    isEffective() {
        return this.effectiveness >= 0.7;
    }

    getTopComponents(limit = 3) {
        return this.components.slice(0, limit);
    }

    toJSON() {
        return {
            development: this.approach,
            components: this.components,
            rationale: this.rationale,
            effectiveness: this.effectiveness,
            adaptations: this.adaptations
        };
    }
}

class OutcomeMetrics {
    constructor(data = {}) {
        this.metrics = new Map();
        
        // Initialize with provided metrics
        Object.entries(data).forEach(([key, value]) => {
            this.metrics.set(key, value);
        });
    }

    update(key, value) {
        this.metrics.set(key, value);
    }

    updateMultiple(updates) {
        Object.entries(updates).forEach(([key, value]) => {
            this.metrics.set(key, value);
        });
    }

    get(key) {
        return this.metrics.get(key);
    }

    hasMetrics() {
        return this.metrics.size > 0;
    }

    getAverageScore() {
        if (this.metrics.size === 0) return 0;
        
        const scores = Array.from(this.metrics.values())
            .filter(value => typeof value === 'number');
        
        if (scores.length === 0) return 0;
        
        return scores.reduce((sum, score) => sum + score, 0) / scores.length;
    }

    getHighScoreMetrics(threshold = 0.8) {
        const highScores = {};
        
        this.metrics.forEach((value, key) => {
            if (typeof value === 'number' && value >= threshold) {
                highScores[key] = value;
            }
        });
        
        return highScores;
    }

    toJSON() {
        const obj = {};
        this.metrics.forEach((value, key) => {
            obj[key] = value;
        });
        return obj;
    }
}

class CoachingIntelligence {
    constructor(data = {}) {
        this.contribution = data.contribution || '';
        this.techniques = data.techniques || [];
        this.interventions = data.interventions || [];
        this.effectiveness = data.effectiveness || 0.5;
        this.timing = data.timing || '';
        this.adaptations = data.adaptations || [];
    }

    addIntervention(intervention) {
        this.interventions.push({
            type: intervention.type,
            effectiveness: intervention.effectiveness,
            studentResponse: intervention.studentResponse,
            timestamp: intervention.timestamp || new Date().toISOString()
        });
    }

    assessOverallEffectiveness() {
        if (this.interventions.length === 0) return this.effectiveness;
        
        const avgInterventionEffectiveness = this.interventions
            .reduce((sum, i) => sum + (i.effectiveness || 0), 0) / this.interventions.length;
        
        return (this.effectiveness + avgInterventionEffectiveness) / 2;
    }

    toJSON() {
        return {
            contribution: this.contribution,
            techniques: this.techniques,
            interventions: this.interventions,
            effectiveness: this.effectiveness,
            timing: this.timing,
            adaptations: this.adaptations
        };
    }
}

class StudentIntelligence {
    constructor(data = {}) {
        this.execution = data.execution || '';
        this.learning = data.learning || '';
        this.growth = data.growth || '';
        this.motivation = data.motivation || '';
        this.futureApplications = data.futureApplications || '';
        this.challenges = data.challenges || [];
        this.breakthroughs = data.breakthroughs || [];
        this.readiness = data.readiness || 'medium';
    }

    assessGrowthPotential() {
        const factors = {
            hasLearning: this.learning.length > 0 ? 0.25 : 0,
            hasGrowth: this.growth.length > 0 ? 0.25 : 0,
            hasMotivation: this.motivation.length > 0 ? 0.25 : 0,
            hasFutureApplications: this.futureApplications.length > 0 ? 0.25 : 0
        };
        
        return Object.values(factors).reduce((sum, val) => sum + val, 0);
    }

    addBreakthrough(breakthrough) {
        this.breakthroughs.push({
            description: breakthrough.description,
            impact: breakthrough.impact,
            timestamp: breakthrough.timestamp || new Date().toISOString()
        });
    }

    toJSON() {
        return {
            execution: this.execution,
            learning: this.learning,
            growth: this.growth,
            motivation: this.motivation,
            futureApplications: this.futureApplications,
            challenges: this.challenges,
            breakthroughs: this.breakthroughs,
            readiness: this.readiness
        };
    }
}

// Main Outcome Entity
class Outcome {
    constructor(data) {
        this.id = data.id || `outcome-${uuidv4()}`;
        this.type = data.type;
        this.category = data.category;
        this.name = data.name;
        this.description = data.description || '';
        this.value = data.value || {};
        this.status = data.status || OutcomeStatus.PLANNED;
        this.confidence = data.confidence || 0.5;
        
        this.strategy = null;
        this.metrics = null;
        this.coachingIntelligence = null;
        this.studentIntelligence = null;
        
        this.enrichment = null;
        this.timeline = [];
        this.tags = data.tags || [];
        
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
    }

    // Setters for complex properties
    setStrategy(strategy) {
        if (!(strategy instanceof OutcomeStrategy)) {
            throw new Error('Invalid strategy type');
        }
        this.strategy = strategy;
        this.updatedAt = new Date().toISOString();
    }

    setMetrics(metrics) {
        if (!(metrics instanceof OutcomeMetrics)) {
            throw new Error('Invalid metrics type');
        }
        this.metrics = metrics;
        this.updatedAt = new Date().toISOString();
    }

    addCoachingIntelligence(data) {
        if (!this.coachingIntelligence) {
            this.coachingIntelligence = new CoachingIntelligence();
        }
        
        if (data.technique) {
            this.coachingIntelligence.techniques.push(data.technique);
        }
        
        if (data.intervention) {
            this.coachingIntelligence.contribution = data.intervention;
        }
        
        if (data.effectiveness !== undefined) {
            this.coachingIntelligence.effectiveness = data.effectiveness;
        }
        
        this.updatedAt = new Date().toISOString();
    }

    addStudentIntelligence(data) {
        if (!this.studentIntelligence) {
            this.studentIntelligence = new StudentIntelligence();
        }
        
        Object.assign(this.studentIntelligence, data);
        this.updatedAt = new Date().toISOString();
    }

    // Business logic methods
    updateStatus(newStatus) {
        const validTransitions = {
            [OutcomeStatus.PLANNED]: [OutcomeStatus.IN_PROGRESS, OutcomeStatus.CANCELLED],
            [OutcomeStatus.IN_PROGRESS]: [OutcomeStatus.ACHIEVED, OutcomeStatus.FAILED, OutcomeStatus.DEFERRED],
            [OutcomeStatus.DEFERRED]: [OutcomeStatus.IN_PROGRESS, OutcomeStatus.CANCELLED],
            [OutcomeStatus.ACHIEVED]: [],
            [OutcomeStatus.FAILED]: [OutcomeStatus.IN_PROGRESS],
            [OutcomeStatus.CANCELLED]: []
        };
        
        const allowedTransitions = validTransitions[this.status] || [];
        
        if (!allowedTransitions.includes(newStatus)) {
            throw new Error(`Invalid status transition from ${this.status} to ${newStatus}`);
        }
        
        this.status = newStatus;
        this.addTimelineEntry({
            action: 'status_change',
            from: this.status,
            to: newStatus
        });
    }

    addTimelineEntry(entry) {
        this.timeline.push({
            timestamp: new Date().toISOString(),
            ...entry
        });
        this.updatedAt = new Date().toISOString();
    }

    applyEnrichment(enrichmentData) {
        this.enrichment = enrichmentData;
        
        // Apply enrichment to strategy if applicable
        if (enrichmentData.strategies && this.strategy) {
            this.strategy.enhance(enrichmentData.strategies);
        }
        
        // Apply enrichment to metrics if applicable
        if (enrichmentData.metrics && this.metrics) {
            this.metrics.updateMultiple(enrichmentData.metrics);
        }
        
        this.updatedAt = new Date().toISOString();
    }

    isHighPriority() {
        return this.value?.priority === 'high' || 
               this.value?.impact === 'high' ||
               this.confidence > 0.85;
    }

    isActionable() {
        return this.type === OutcomeType.ACTION_ITEM ||
               this.status === OutcomeStatus.PLANNED ||
               this.status === OutcomeStatus.IN_PROGRESS;
    }

    getEffectiveness() {
        const factors = [];
        
        if (this.strategy?.effectiveness) {
            factors.push(this.strategy.effectiveness);
        }
        
        if (this.coachingIntelligence?.effectiveness) {
            factors.push(this.coachingIntelligence.effectiveness);
        }
        
        if (this.metrics) {
            factors.push(this.metrics.getAverageScore());
        }
        
        if (factors.length === 0) return 0.5;
        
        return factors.reduce((sum, val) => sum + val, 0) / factors.length;
    }

    getExecutionData() {
        return {
            timeline: this.timeline,
            quality: this.getExecutionQuality(),
            challenges: this.studentIntelligence?.challenges || [],
            breakthroughs: this.studentIntelligence?.breakthroughs || [],
            lessons: this.extractLessonsLearned()
        };
    }

    getExecutionQuality() {
        if (this.status === OutcomeStatus.ACHIEVED) return 'excellent';
        if (this.status === OutcomeStatus.IN_PROGRESS && this.timeline.length > 2) return 'good';
        if (this.status === OutcomeStatus.FAILED) return 'poor';
        return 'moderate';
    }

    extractLessonsLearned() {
        const lessons = [];
        
        if (this.strategy?.isEffective()) {
            lessons.push(`${this.strategy.approach} approach was effective`);
        }
        
        if (this.studentIntelligence?.breakthroughs.length > 0) {
            lessons.push('Breakthrough moments accelerated progress');
        }
        
        if (this.coachingIntelligence?.interventions.length > 0) {
            const effectiveInterventions = this.coachingIntelligence.interventions
                .filter(i => i.effectiveness > 0.7);
            
            if (effectiveInterventions.length > 0) {
                lessons.push(`${effectiveInterventions[0].type} intervention was particularly effective`);
            }
        }
        
        return lessons;
    }

    getResults() {
        return {
            metrics: this.metrics?.toJSON() || {},
            impact: this.assessImpact(),
            sustainability: this.assessSustainability(),
            transferability: this.assessTransferability()
        };
    }

    assessImpact() {
        if (this.value?.impact) return this.value.impact;
        if (this.type === OutcomeType.BREAKTHROUGH) return 'high';
        if (this.status === OutcomeStatus.ACHIEVED) return 'medium';
        return 'low';
    }

    assessSustainability() {
        if (this.type === OutcomeType.SKILL_ACQUIRED) return 'high';
        if (this.type === OutcomeType.BREAKTHROUGH) return 'high';
        if (this.type === OutcomeType.ACTION_ITEM) return 'low';
        return 'medium';
    }

    assessTransferability() {
        if (this.studentIntelligence?.futureApplications) return 'high';
        if (this.type === OutcomeType.SKILL_ACQUIRED) return 'high';
        return 'medium';
    }

    addTag(tag) {
        if (!this.tags.includes(tag)) {
            this.tags.push(tag);
            this.updatedAt = new Date().toISOString();
        }
    }

    hasTag(tag) {
        return this.tags.includes(tag);
    }

    // Serialization
    toJSON() {
        return {
            outcomeId: this.id,
            outcomeType: this.type,
            outcomeCategory: this.category,
            outcomeName: this.name,
            outcomeDescription: this.description,
            outcomeValue: this.value,
            outcomeStatus: this.status,
            outcomeConfidence: this.confidence,
            strategy: this.strategy?.toJSON(),
            execution: this.getExecutionData(),
            results: this.getResults(),
            coachIntelligence: this.coachingIntelligence?.toJSON(),
            studentIntelligence: this.studentIntelligence?.toJSON(),
            enrichment: this.enrichment,
            tags: this.tags,
            timeline: this.timeline,
            metadata: {
                createdAt: this.createdAt,
                updatedAt: this.updatedAt,
                effectiveness: this.getEffectiveness()
            }
        };
    }

    // Static factory methods
    static fromActionItem(actionItem) {
        return new Outcome({
            type: OutcomeType.ACTION_ITEM,
            category: OutcomeCategory.GENERAL_DEVELOPMENT,
            name: actionItem.item,
            value: {
                priority: actionItem.priority,
                assignee: actionItem.assignee,
                deadline: actionItem.deadline
            },
            status: OutcomeStatus.PLANNED,
            confidence: 0.9
        });
    }

    static fromBreakthrough(breakthrough) {
        return new Outcome({
            type: OutcomeType.BREAKTHROUGH,
            category: OutcomeCategory.PERSONAL_GROWTH,
            name: 'Breakthrough Moment',
            description: breakthrough.description,
            value: {
                impact: breakthrough.impact,
                timestamp: breakthrough.timestamp
            },
            status: OutcomeStatus.ACHIEVED,
            confidence: 0.85
        });
    }
}

module.exports = {
    Outcome,
    OutcomeType,
    OutcomeStatus,
    OutcomeCategory,
    OutcomeStrategy,
    OutcomeMetrics,
    CoachingIntelligence,
    StudentIntelligence
}; 