/**
 * Service for processing and extracting outcomes from sessions
 */
class OutcomesProcessor {
    constructor({ aiPoweredInsightsGenerator }) {
        this.aiPoweredInsightsGenerator = aiPoweredInsightsGenerator;
        
        // Outcome patterns for extraction
        this.outcomePatterns = {
            award: [
                /received?\s+(?:an?\s+)?award/i,
                /won\s+(?:the\s+)?(?:first|second|third|1st|2nd|3rd)/i,
                /award(?:ed)?\s+(?:for|in)/i,
                /scholarship\s+(?:recipient|winner)/i
            ],
            score: [
                /scored?\s+(\d+)/i,
                /SAT\s*:?\s*(\d+)/i,
                /ACT\s*:?\s*(\d+)/i,
                /GPA\s*:?\s*([\d.]+)/i,
                /percentile\s*:?\s*(\d+)/i
            ],
            project: [
                /completed?\s+(?:a\s+)?project/i,
                /project\s+(?:on|about|titled)/i,
                /research\s+(?:paper|project)/i,
                /built\s+(?:a|an)/i,
                /developed\s+(?:a|an)/i
            ],
            essay: [
                /essay\s+(?:on|about|for)/i,
                /wrote\s+(?:about|on)/i,
                /personal\s+statement/i,
                /college\s+essay/i,
                /supplemental\s+essay/i
            ],
            scholarship: [
                /scholarship/i,
                /financial\s+aid/i,
                /merit\s+(?:award|scholarship)/i,
                /grant/i
            ],
            achievement: [
                /accepted\s+(?:to|into|at)/i,
                /admission\s+(?:to|into)/i,
                /internship\s+(?:at|with)/i,
                /leadership\s+(?:role|position)/i,
                /elected\s+(?:as|to)/i
            ]
        };
    }

    /**
     * Process outcomes from session data
     */
    async processOutcomes({ session, insights }) {
        try {
            const outcomes = {
                sessionId: session.recordingId,
                sessionType: session.sessionType,
                processedAt: new Date().toISOString(),
                outcomes: [],
                summary: '',
                qualityScore: 0,
                metadata: {
                    version: '1.0.0',
                    aiProcessed: false
                }
            };

            // Only process outcomes for coaching sessions
            if (!session.isCoachingSession()) {
                outcomes.summary = 'No outcomes to process for non-coaching session';
                return outcomes;
            }

            // Extract outcomes based on available data
            if (this.aiPoweredInsightsGenerator && insights?.metadata?.aiGenerated) {
                // Use AI to extract outcomes
                const aiOutcomes = await this._extractOutcomesWithAI(session, insights);
                outcomes.outcomes = aiOutcomes;
                outcomes.metadata.aiProcessed = true;
            } else {
                // Use pattern matching
                const patternOutcomes = this._extractOutcomesWithPatterns(insights);
                outcomes.outcomes = patternOutcomes;
            }

            // Generate summary
            outcomes.summary = this._generateOutcomesSummary(outcomes.outcomes);
            
            // Calculate quality score
            outcomes.qualityScore = this._calculateQualityScore(outcomes.outcomes);

            // Add additional metrics
            outcomes.statistics = this._calculateStatistics(outcomes.outcomes);

            return outcomes;

        } catch (error) {
            console.error('Error processing outcomes:', error);
            return this._generateFallbackOutcomes(session);
        }
    }

    /**
     * Extract outcomes using AI
     */
    async _extractOutcomesWithAI(session, insights) {
        const prompt = this._buildOutcomesPrompt(session, insights);
        
        try {
            // Use the consolidated AI service to generate outcomes
            const aiResponse = await this.aiPoweredInsightsGenerator.generateAIInsights(
                prompt, // Use the prompt as transcript content
                {
                    topic: 'Outcomes Extraction',
                    duration: session.duration || 0,
                    start_time: session.startTime || new Date().toISOString(),
                    participant_count: session.participantCount || 1,
                    forceRuleBased: false
                }
            );

            return this._parseAIOutcomes(aiResponse);

        } catch (error) {
            console.error('AI outcomes extraction failed:', error);
            return [];
        }
    }

    /**
     * Build AI prompt for outcomes extraction
     */
    _buildOutcomesPrompt(session, insights) {
        const parts = [
            'Extract tangible outcomes and achievements from this coaching session:',
            '',
            `Session Context:`,
            `- Student: ${session.student}`,
            `- Week: ${session.weekNumber || 'Unknown'}`,
            `- Duration: ${session.duration} minutes`,
            ''
        ];

        if (insights?.sessionSummary?.executiveSummary) {
            parts.push('Session Summary:');
            parts.push(insights.sessionSummary.executiveSummary);
            parts.push('');
        }

        if (insights?.keyHighlights?.highlights?.length > 0) {
            parts.push('Key Highlights:');
            insights.keyHighlights.highlights.forEach(h => parts.push(`- ${h}`));
            parts.push('');
        }

        parts.push('Extract outcomes in these categories:');
        parts.push('1. Awards and recognitions');
        parts.push('2. Test scores and academic achievements');
        parts.push('3. Projects completed');
        parts.push('4. Essays written');
        parts.push('5. Scholarships received');
        parts.push('6. Other achievements');
        parts.push('');
        parts.push('For each outcome, provide: type, description, date (if mentioned), and impact level (high/medium/low)');

        return parts.join('\n');
    }

    /**
     * Parse AI outcomes response
     */
    _parseAIOutcomes(aiResponse) {
        // Extract outcomes from the AI response
        const outcomes = [];
        
        // Look for action items and key insights that might be outcomes
        if (aiResponse.aiActionItems) {
            const { highPriority, mediumPriority, lowPriority } = aiResponse.aiActionItems;
            [...highPriority, ...mediumPriority, ...lowPriority].forEach((item, index) => {
                if (typeof item === 'string' && item.length > 10) {
                    outcomes.push({
                        id: `outcome-${Date.now()}-${index}`,
                        type: 'achievement',
                        category: 'general',
                        description: item,
                        date: null,
                        impact: highPriority.includes(item) ? 'high' : mediumPriority.includes(item) ? 'medium' : 'low',
                        confidence: 0.7,
                        evidence: 'AI extracted from action items'
                    });
                }
            });
        }

        // Look for key insights that might be outcomes
        if (aiResponse.aiHighlights?.keyInsights) {
            aiResponse.aiHighlights.keyInsights.forEach((insight, index) => {
                if (typeof insight === 'string' && insight.length > 10) {
                    outcomes.push({
                        id: `outcome-${Date.now()}-insight-${index}`,
                        type: 'insight',
                        category: 'learning',
                        description: insight,
                        date: null,
                        impact: 'medium',
                        confidence: 0.6,
                        evidence: 'AI extracted from key insights'
                    });
                }
            });
        }

        return outcomes;
    }

    /**
     * Extract outcomes using pattern matching
     */
    _extractOutcomesWithPatterns(insights) {
        const outcomes = [];
        const textToAnalyze = this._getTextForAnalysis(insights);
        
        if (!textToAnalyze) return outcomes;

        // Check each pattern type
        Object.entries(this.outcomePatterns).forEach(([type, patterns]) => {
            patterns.forEach(pattern => {
                const matches = textToAnalyze.match(new RegExp(pattern, 'gi'));
                if (matches) {
                    matches.forEach((match, index) => {
                        outcomes.push({
                            id: `outcome-${Date.now()}-${type}-${index}`,
                            type: type,
                            category: this._categorizeOutcome(type),
                            description: this._cleanMatch(match),
                            date: null,
                            impact: 'medium',
                            confidence: 0.6,
                            evidence: 'Pattern matching'
                        });
                    });
                }
            });
        });

        // Deduplicate outcomes
        return this._deduplicateOutcomes(outcomes);
    }

    /**
     * Get text for pattern analysis
     */
    _getTextForAnalysis(insights) {
        const parts = [];
        
        if (insights?.sessionSummary?.executiveSummary) {
            parts.push(insights.sessionSummary.executiveSummary);
        }
        
        if (insights?.keyHighlights?.highlights) {
            parts.push(...insights.keyHighlights.highlights);
        }
        
        if (insights?.sessionSummary?.keyOutcomes) {
            parts.push(...insights.sessionSummary.keyOutcomes);
        }

        return parts.join(' ');
    }

    /**
     * Categorize outcome type
     */
    _categorizeOutcome(type) {
        const categories = {
            award: 'Recognition',
            score: 'Academic',
            project: 'Project',
            essay: 'Writing',
            scholarship: 'Financial',
            achievement: 'Achievement'
        };
        
        return categories[type] || 'Other';
    }

    /**
     * Clean matched text
     */
    _cleanMatch(match) {
        return match
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/^[,.\s]+|[,.\s]+$/g, '');
    }

    /**
     * Deduplicate outcomes
     */
    _deduplicateOutcomes(outcomes) {
        const seen = new Set();
        return outcomes.filter(outcome => {
            const key = `${outcome.type}-${outcome.description.toLowerCase()}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    /**
     * Generate outcomes summary
     */
    _generateOutcomesSummary(outcomes) {
        if (outcomes.length === 0) {
            return 'No specific outcomes identified in this session';
        }

        const byCategory = {};
        outcomes.forEach(outcome => {
            if (!byCategory[outcome.category]) {
                byCategory[outcome.category] = 0;
            }
            byCategory[outcome.category]++;
        });

        const parts = [`Identified ${outcomes.length} outcomes:`];
        Object.entries(byCategory).forEach(([category, count]) => {
            parts.push(`- ${category}: ${count}`);
        });

        return parts.join('\n');
    }

    /**
     * Calculate quality score
     */
    _calculateQualityScore(outcomes) {
        if (outcomes.length === 0) return 0;

        const factors = {
            quantity: Math.min(outcomes.length / 5, 1) * 0.3,
            confidence: outcomes.reduce((sum, o) => sum + o.confidence, 0) / outcomes.length * 0.4,
            diversity: Object.keys(this._groupByCategory(outcomes)).length / 6 * 0.3
        };

        return Object.values(factors).reduce((sum, val) => sum + val, 0);
    }

    /**
     * Calculate statistics
     */
    _calculateStatistics(outcomes) {
        const stats = {
            total: outcomes.length,
            byType: {},
            byCategory: {},
            byImpact: {
                high: 0,
                medium: 0,
                low: 0
            },
            averageConfidence: 0
        };

        outcomes.forEach(outcome => {
            // By type
            stats.byType[outcome.type] = (stats.byType[outcome.type] || 0) + 1;
            
            // By category
            stats.byCategory[outcome.category] = (stats.byCategory[outcome.category] || 0) + 1;
            
            // By impact
            stats.byImpact[outcome.impact]++;
            
            // Confidence
            stats.averageConfidence += outcome.confidence;
        });

        if (outcomes.length > 0) {
            stats.averageConfidence /= outcomes.length;
        }

        return stats;
    }

    /**
     * Group outcomes by category
     */
    _groupByCategory(outcomes) {
        const groups = {};
        outcomes.forEach(outcome => {
            if (!groups[outcome.category]) {
                groups[outcome.category] = [];
            }
            groups[outcome.category].push(outcome);
        });
        return groups;
    }

    /**
     * Generate fallback outcomes
     */
    _generateFallbackOutcomes(session) {
        return {
            sessionId: session.recordingId,
            sessionType: session.sessionType,
            processedAt: new Date().toISOString(),
            outcomes: [],
            summary: 'Outcomes processing failed - no outcomes extracted',
            qualityScore: 0,
            metadata: {
                version: '1.0.0',
                aiProcessed: false,
                error: true
            }
        };
    }
}

module.exports = { OutcomesProcessor }; 