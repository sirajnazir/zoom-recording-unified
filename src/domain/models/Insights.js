const { v4: uuidv4 } = require('uuid');

// Enums
const InsightType = {
    SESSION_OVERVIEW: 'SESSION_OVERVIEW',
    COACHING_EFFECTIVENESS: 'COACHING_EFFECTIVENESS',
    STUDENT_PROGRESS: 'STUDENT_PROGRESS',
    BREAKTHROUGH: 'BREAKTHROUGH',
    ACTION_ITEM: 'ACTION_ITEM',
    KEY_QUESTION: 'KEY_QUESTION',
    TOPIC_DISCUSSION: 'TOPIC_DISCUSSION',
    SENTIMENT_CHANGE: 'SENTIMENT_CHANGE',
    ENGAGEMENT_PATTERN: 'ENGAGEMENT_PATTERN',
    GENERAL: 'GENERAL'
};

const InsightSource = {
    AI: 'ai',
    TRANSCRIPT: 'transcript',
    PARTICIPANT: 'participant',
    ZOOM: 'zoom',
    COMBINED: 'combined',
    ANALYSIS: 'analysis'
};

const InsightImpact = {
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low'
};

// Value Objects
class InsightContext {
    constructor(data = {}) {
        this.sessionPhase = data.sessionPhase; // opening, main, closing
        this.precedingEvent = data.precedingEvent;
        this.followingEvent = data.followingEvent;
        this.relatedInsights = data.relatedInsights || [];
        this.environmentalFactors = data.environmentalFactors || {};
    }

    addRelatedInsight(insightId) {
        if (!this.relatedInsights.includes(insightId)) {
            this.relatedInsights.push(insightId);
        }
    }

    toJSON() {
        return {
            sessionPhase: this.sessionPhase,
            precedingEvent: this.precedingEvent,
            followingEvent: this.followingEvent,
            relatedInsights: this.relatedInsights,
            environmentalFactors: this.environmentalFactors
        };
    }
}

// Main Insight Entity
class SessionInsight {
    constructor(data) {
        this.id = data.id || `insight-${uuidv4()}`;
        this.type = data.type || InsightType.GENERAL;
        this.title = data.title;
        this.content = data.content;
        this.confidence = data.confidence || 0.5;
        this.source = data.source || InsightSource.ANALYSIS;
        this.timestamp = data.timestamp;
        this.speaker = data.speaker;
        this.impact = data.impact || InsightImpact.MEDIUM;
        this.context = data.context ? new InsightContext(data.context) : null;
        
        this.tags = data.tags || [];
        this.metadata = data.metadata || {};
        
        this.createdAt = data.createdAt || new Date().toISOString();
    }

    isHighConfidence() {
        return this.confidence >= 0.8;
    }

    isHighImpact() {
        return this.impact === InsightImpact.HIGH;
    }

    isActionable() {
        return this.type === InsightType.ACTION_ITEM ||
               this.type === InsightType.BREAKTHROUGH ||
               (this.content && typeof this.content === 'object' && this.content.actionable);
    }

    addTag(tag) {
        if (!this.tags.includes(tag)) {
            this.tags.push(tag);
        }
    }

    hasTag(tag) {
        return this.tags.includes(tag);
    }

    setContext(context) {
        this.context = context instanceof InsightContext ? context : new InsightContext(context);
    }

    getRelevanceScore() {
        let score = 0.5; // Base score
        
        // High impact insights are more relevant
        if (this.impact === InsightImpact.HIGH) score += 0.2;
        if (this.impact === InsightImpact.LOW) score -= 0.1;
        
        // High confidence insights are more relevant
        score += (this.confidence - 0.5) * 0.3;
        
        // Actionable insights are more relevant
        if (this.isActionable()) score += 0.2;
        
        // Insights with context are more relevant
        if (this.context) score += 0.1;
        
        return Math.min(Math.max(score, 0), 1);
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            title: this.title,
            content: this.content,
            confidence: this.confidence,
            source: this.source,
            timestamp: this.timestamp,
            speaker: this.speaker,
            impact: this.impact,
            context: this.context?.toJSON(),
            tags: this.tags,
            metadata: this.metadata,
            relevanceScore: this.getRelevanceScore(),
            createdAt: this.createdAt
        };
    }

    // Static factory methods
    static createBreakthrough(data) {
        return new SessionInsight({
            type: InsightType.BREAKTHROUGH,
            title: 'Breakthrough Moment',
            content: data.content,
            confidence: data.confidence || 0.85,
            impact: InsightImpact.HIGH,
            timestamp: data.timestamp,
            source: data.source
        });
    }

    static createActionItem(data) {
        return new SessionInsight({
            type: InsightType.ACTION_ITEM,
            title: data.item,
            content: {
                item: data.item,
                priority: data.priority,
                assignee: data.assignee,
                deadline: data.deadline,
                context: data.context
            },
            confidence: 0.9,
            impact: data.priority === 'high' ? InsightImpact.HIGH : InsightImpact.MEDIUM,
            source: data.source
        });
    }
}

// Aggregate for Combined Insights
class CombinedInsights {
    constructor(data) {
        this.sessionId = data.sessionId;
        this.recordingId = data.recordingId;
        this.insights = data.insights || [];
        this.keyHighlights = data.keyHighlights || {};
        this.actionItems = data.actionItems || {};
        this.recommendations = data.recommendations || {};
        this.qualityMetrics = data.qualityMetrics || {};
        this.metadata = data.metadata || {};
        
        this._insightMap = new Map();
        this._buildInsightMap();
    }

    _buildInsightMap() {
        this.insights.forEach(insight => {
            this._insightMap.set(insight.id, insight);
        });
    }

    addInsight(insight) {
        if (!(insight instanceof SessionInsight)) {
            throw new Error('Invalid insight type');
        }
        
        this.insights.push(insight);
        this._insightMap.set(insight.id, insight);
    }

    getInsightById(id) {
        return this._insightMap.get(id);
    }

    getInsightsByType(type) {
        return this.insights.filter(i => i.type === type);
    }

    getInsightsBySource(source) {
        return this.insights.filter(i => i.source === source);
    }

    getHighImpactInsights() {
        return this.insights.filter(i => i.impact === InsightImpact.HIGH);
    }

    getActionableInsights() {
        return this.insights.filter(i => i.isActionable());
    }

    getInsightCount() {
        return this.insights.length;
    }

    getBreakthroughMoments() {
        const breakthroughs = this.getInsightsByType(InsightType.BREAKTHROUGH);
        
        // Also check key highlights
        if (this.keyHighlights.breakthroughMoments) {
            return [...breakthroughs, ...this.keyHighlights.breakthroughMoments];
        }
        
        return breakthroughs;
    }

    getActionItems() {
        // Return structured action items
        return this.actionItems;
    }

    getStudentProgress() {
        const progressInsight = this.getInsightsByType(InsightType.STUDENT_PROGRESS)[0];
        return progressInsight?.content;
    }

    getCoachingEffectiveness() {
        const coachingInsight = this.getInsightsByType(InsightType.COACHING_EFFECTIVENESS)[0];
        return coachingInsight?.content;
    }

    getTopInsights(limit = 5) {
        // Sort by relevance score and return top N
        return this.insights
            .sort((a, b) => b.getRelevanceScore() - a.getRelevanceScore())
            .slice(0, limit);
    }

    generateExecutiveSummary() {
        const summary = {
            totalInsights: this.insights.length,
            highImpactCount: this.getHighImpactInsights().length,
            actionableCount: this.getActionableInsights().length,
            typeDistribution: this._getTypeDistribution(),
            sourceDistribution: this._getSourceDistribution(),
            keyFindings: this.getTopInsights(3).map(i => ({
                title: i.title,
                impact: i.impact,
                confidence: i.confidence
            })),
            overallQuality: this.qualityMetrics.overallScore || 0
        };
        
        return summary;
    }

    _getTypeDistribution() {
        const distribution = {};
        
        this.insights.forEach(insight => {
            distribution[insight.type] = (distribution[insight.type] || 0) + 1;
        });
        
        return distribution;
    }

    _getSourceDistribution() {
        const distribution = {};
        
        this.insights.forEach(insight => {
            distribution[insight.source] = (distribution[insight.source] || 0) + 1;
        });
        
        return distribution;
    }

    calculateInsightCorrelations() {
        const correlations = [];
        
        // Find insights that reference each other
        this.insights.forEach(insight => {
            if (insight.context?.relatedInsights?.length > 0) {
                insight.context.relatedInsights.forEach(relatedId => {
                    const relatedInsight = this.getInsightById(relatedId);
                    if (relatedInsight) {
                        correlations.push({
                            from: insight.id,
                            to: relatedId,
                            fromType: insight.type,
                            toType: relatedInsight.type,
                            strength: this._calculateCorrelationStrength(insight, relatedInsight)
                        });
                    }
                });
            }
        });
        
        return correlations;
    }

    _calculateCorrelationStrength(insight1, insight2) {
        let strength = 0.5; // Base strength
        
        // Same source increases correlation
        if (insight1.source === insight2.source) strength += 0.1;
        
        // Close timestamps increase correlation
        if (insight1.timestamp && insight2.timestamp) {
            const timeDiff = Math.abs(new Date(insight1.timestamp) - new Date(insight2.timestamp));
            if (timeDiff < 60000) strength += 0.2; // Within 1 minute
        }
        
        // Same speaker increases correlation
        if (insight1.speaker === insight2.speaker) strength += 0.1;
        
        // Complementary types increase correlation
        const complementaryTypes = [
            [InsightType.KEY_QUESTION, InsightType.BREAKTHROUGH],
            [InsightType.COACHING_EFFECTIVENESS, InsightType.STUDENT_PROGRESS]
        ];
        
        complementaryTypes.forEach(pair => {
            if ((insight1.type === pair[0] && insight2.type === pair[1]) ||
                (insight1.type === pair[1] && insight2.type === pair[0])) {
                strength += 0.1;
            }
        });
        
        return Math.min(strength, 1.0);
    }

    toJSON() {
        return {
            sessionId: this.sessionId,
            recordingId: this.recordingId,
            insights: this.insights.map(i => i.toJSON()),
            keyHighlights: this.keyHighlights,
            actionItems: this.actionItems,
            recommendations: this.recommendations,
            qualityMetrics: this.qualityMetrics,
            metadata: this.metadata,
            summary: this.generateExecutiveSummary()
        };
    }
}

// Helper class for building insights
class InsightBuilder {
    constructor() {
        this.insight = {};
    }

    withType(type) {
        this.insight.type = type;
        return this;
    }

    withTitle(title) {
        this.insight.title = title;
        return this;
    }

    withContent(content) {
        this.insight.content = content;
        return this;
    }

    withConfidence(confidence) {
        this.insight.confidence = confidence;
        return this;
    }

    withSource(source) {
        this.insight.source = source;
        return this;
    }

    withTimestamp(timestamp) {
        this.insight.timestamp = timestamp;
        return this;
    }

    withSpeaker(speaker) {
        this.insight.speaker = speaker;
        return this;
    }

    withImpact(impact) {
        this.insight.impact = impact;
        return this;
    }

    withContext(context) {
        this.insight.context = context;
        return this;
    }

    withTags(...tags) {
        this.insight.tags = tags;
        return this;
    }

    build() {
        return new SessionInsight(this.insight);
    }
}

module.exports = {
    SessionInsight,
    CombinedInsights,
    InsightBuilder,
    InsightType,
    InsightSource,
    InsightImpact,
    InsightContext
}; 