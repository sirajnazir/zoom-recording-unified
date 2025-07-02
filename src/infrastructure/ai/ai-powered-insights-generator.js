require('dotenv').config();

class AIPoweredInsightsGenerator {
    constructor({ logger = console, config = {}, ...rest } = {}) {
        this.logger = logger;
        this.config = config;
        Object.assign(this, rest);
        
        // API Configuration
        this.openaiApiKey = process.env.OPENAI_API_KEY || config?.openai?.apiKey;
        this.anthropicApiKey = process.env.ANTHROPIC_API_KEY || config?.anthropic?.apiKey;
        this.useOpenAI = !!this.openaiApiKey && this.openaiApiKey !== 'your-openai-api-key-here';
        this.useAnthropic = !!this.anthropicApiKey && this.anthropicApiKey !== 'your-anthropic-api-key-here';
        
        // Provider selection
        this.preferredProvider = config?.ai?.preferredProvider || 'openai';
        this.activeProvider = this._selectPrimaryProvider();
        
        // Zoom API Integration
        this.zoomInsightsExtractor = new (require('../services/EnhancedZoomInsightsExtractor.js'))({ logger, config });
        
        // Tangible Outcomes Processing
        this.outcomesProcessor = new (require('../services/tangible-outcomes-processor.js'))();
        
        this.logger.info(`🤖 AI-Powered Insights Generator initialized:`);
        this.logger.info(`  OpenAI: ${this.useOpenAI ? '✅ Available' : '❌ Not available'}`);
        this.logger.info(`  Anthropic: ${this.useAnthropic ? '✅ Available' : '❌ Not available'}`);
        this.logger.info(`  Active Provider: ${this.activeProvider}`);
        this.logger.info(`  Zoom API Integration: ✅ Enabled`);
        this.logger.info(`  Tangible Outcomes Processing: ✅ Enabled`);
        
        if (!this.useOpenAI && !this.useAnthropic) {
            this.logger.warn('⚠️ No valid AI API keys found. Using fallback analysis only.');
            this.logger.warn('⚠️ Set OPENAI_API_KEY or ANTHROPIC_API_KEY in local.env for AI-powered insights.');
        }
    }

    /**
     * Select the primary AI provider
     */
    _selectPrimaryProvider() {
        if (this.preferredProvider === 'openai' && this.useOpenAI) return 'openai';
        if (this.preferredProvider === 'anthropic' && this.useAnthropic) return 'anthropic';
        if (this.useOpenAI) return 'openai';
        if (this.useAnthropic) return 'anthropic';
        return 'fallback';
    }

    /**
     * Main entry point for generating comprehensive AI-powered insights
     */
    async generateAIInsights(transcriptContent, meetingData) {
        const startTime = Date.now();
        const meetingId = this._extractMeetingId(meetingData);
        
        try {
            this.logger.info(`🤖 Generating AI-powered insights from transcript (length: ${transcriptContent?.length || 0} chars)`);
            
            // Extract meeting ID for Zoom API
            this.logger.info(`📡 Extracting Zoom data for meeting: ${meetingId}`);
            
            // Extract Zoom insights in parallel with AI analysis
            const zoomInsightsPromise = this.zoomInsightsExtractor.extractZoomInsights(meetingId, transcriptContent);
            
            const insights = {
                aiSummary: null,
                aiHighlights: null,
                aiTopics: null,
                aiActionItems: null,
                aiQuestions: null,
                aiSentiment: null,
                aiEngagement: null,
                aiCoachingInsights: null,
                aiSessionAnalysis: null,
                aiParticipantInsights: null,
                aiQualityMetrics: null,
                // Zoom-specific insights
                zoomInsights: null,
                combinedInsights: null,
                metadata: {
                    aiGenerated: false,
                    model: 'none',
                    provider: 'none',
                    processingTime: 0,
                    dataSources: []
                }
            };

            // Check if rule-based analysis is forced (for MISC/Trivial sessions)
            if (meetingData.forceRuleBased) {
                this.logger.info('⚡ Skipping AI analysis - using rule-based analysis only');
                const ruleBasedInsights = this.generateRuleBasedInsights(transcriptContent, meetingData);
                const zoomInsights = await zoomInsightsPromise;
                return await this.combineInsights(ruleBasedInsights, zoomInsights, meetingData);
            }

            if (!transcriptContent || transcriptContent.length < 50) {
                this.logger.warn(`⚠️ Transcript too short for AI analysis (length: ${transcriptContent?.length || 0}), using fallback`);
                const fallbackInsights = this.generateFallbackInsights(meetingData);
                const zoomInsights = await zoomInsightsPromise;
                return await this.combineInsights(fallbackInsights, zoomInsights, meetingData);
            }

            // Try AI providers in order of preference
            const providerOrder = [
                this.activeProvider,
                ...['openai', 'anthropic', 'fallback'].filter(p => p !== this.activeProvider)
            ];

            for (const provider of providerOrder) {
                try {
                    if (provider === 'openai' && this.useOpenAI) {
                        this.logger.info('🤖 Using OpenAI for AI analysis');
                        const openaiInsights = await this.generateOpenAIInsights(transcriptContent, meetingData);
                        Object.assign(insights, openaiInsights);
                        insights.metadata.aiGenerated = true;
                        insights.metadata.model = 'OpenAI GPT-4';
                        insights.metadata.provider = 'openai';
                        
                        // Get Zoom insights and combine
                        const zoomInsights = await zoomInsightsPromise;
                        const combinedInsights = await this.combineInsights(insights, zoomInsights, meetingData);
                        combinedInsights.metadata.processingTime = Date.now() - startTime;
                        
                        this.logger.info('✅ OpenAI AI insights generated successfully with Zoom integration');
                        return combinedInsights;
                    }
                    
                    if (provider === 'anthropic' && this.useAnthropic) {
                        this.logger.info('🤖 Using Anthropic Claude for AI analysis');
                        const anthropicInsights = await this.generateAnthropicInsights(transcriptContent, meetingData);
                        Object.assign(insights, anthropicInsights);
                        insights.metadata.aiGenerated = true;
                        insights.metadata.model = 'Anthropic Claude';
                        insights.metadata.provider = 'anthropic';
                        
                        // Get Zoom insights and combine
                        const zoomInsights = await zoomInsightsPromise;
                        const combinedInsights = await this.combineInsights(insights, zoomInsights, meetingData);
                        combinedInsights.metadata.processingTime = Date.now() - startTime;
                        
                        this.logger.info('✅ Anthropic AI insights generated successfully with Zoom integration');
                        return combinedInsights;
                    }
                    
                    if (provider === 'fallback') {
                        this.logger.info('🔄 Using rule-based fallback analysis');
                        const ruleBasedInsights = this.generateRuleBasedInsights(transcriptContent, meetingData);
                        const zoomInsights = await zoomInsightsPromise;
                        const combinedInsights = await this.combineInsights(ruleBasedInsights, zoomInsights, meetingData);
                        combinedInsights.metadata.processingTime = Date.now() - startTime;
                        return combinedInsights;
                    }
                } catch (error) {
                    this.logger.error(`❌ ${provider} analysis failed: ${error.message}`);
                    if (provider === providerOrder[providerOrder.length - 1]) {
                        throw error;
                    }
                }
            }

            // Final fallback
            const fallbackInsights = this.generateFallbackInsights(meetingData);
            const zoomInsights = await zoomInsightsPromise;
            const combinedInsights = await this.combineInsights(fallbackInsights, zoomInsights, meetingData);
            combinedInsights.metadata.processingTime = Date.now() - startTime;
            return combinedInsights;

        } catch (error) {
            this.logger.error(`❌ AI insights generation failed: ${error.message}`);
            this.logger.error(`❌ AI insights error details:`, error);
            const fallbackInsights = this.generateFallbackInsights(meetingData);
            const zoomInsights = await this.zoomInsightsExtractor.extractZoomInsights(meetingId, transcriptContent);
            const combinedInsights = await this.combineInsights(fallbackInsights, zoomInsights, meetingData);
            combinedInsights.metadata.processingTime = Date.now() - startTime;
            return combinedInsights;
        }
    }

    /**
     * Extract meeting ID from various sources
     */
    _extractMeetingId(meetingData) {
        // Try different possible sources for meeting ID
        return meetingData.meetingId || 
               meetingData.id || 
               meetingData.zoomMeetingId || 
               meetingData.recordingId ||
               'mock-meeting-id';
    }

    /**
     * Combine AI insights with Zoom insights for comprehensive analysis
     */
    async combineInsights(aiInsights, zoomInsights, meetingData) {
        this.logger.info('🔄 Combining AI and Zoom insights for comprehensive analysis');
        
        // Process tangible outcomes from the combined insights
        this.logger.info('🏆 Processing tangible outcomes from combined insights');
        const outcomesData = await this.outcomesProcessor.processSessionOutcomes(meetingData, {
            ...aiInsights,
            ...zoomInsights,
            combinedAnalysis: {
                studentProgress: aiInsights.aiParticipantInsights?.studentProgress || [],
                coachingInsights: aiInsights.aiCoachingInsights || {},
                sessionSummary: aiInsights.aiSummary || {},
                keyHighlights: aiInsights.aiHighlights || {},
                actionItems: aiInsights.aiActionItems || {}
            }
        });
        
        const combined = {
            // AI-generated insights (enhanced with Zoom data)
            aiSummary: this.combineSummary(aiInsights.aiSummary, zoomInsights.zoomSummary),
            aiHighlights: this.combineHighlights(aiInsights.aiHighlights, zoomInsights.zoomHighlights),
            aiTopics: this.combineTopics(aiInsights.aiTopics, zoomInsights.zoomTopics),
            aiActionItems: this.combineActionItems(aiInsights.aiActionItems, zoomInsights.zoomActionItems),
            aiQuestions: this.combineQuestions(aiInsights.aiQuestions, zoomInsights.zoomQuestions),
            aiSentiment: this.combineSentiment(aiInsights.aiSentiment, zoomInsights.zoomSentiment),
            aiEngagement: this.combineEngagement(aiInsights.aiEngagement, zoomInsights.zoomEngagement),
            aiCoachingInsights: this.combineCoachingInsights(aiInsights.aiCoachingInsights, zoomInsights.zoomCoachingInsights),
            aiSessionAnalysis: this.combineSessionAnalysis(aiInsights.aiSessionAnalysis, zoomInsights.zoomSessionAnalysis),
            aiParticipantInsights: this.combineParticipantInsights(aiInsights.aiParticipantInsights, zoomInsights.zoomParticipantInsights),
            aiQualityMetrics: this.combineQualityMetrics(aiInsights.aiQualityMetrics, zoomInsights.zoomQualityMetrics),
            
            // Raw Zoom insights
            zoomInsights: zoomInsights,
            
            // Tangible Outcomes Processing
            tangibleOutcomes: outcomesData,
            
            // Combined insights with data source attribution
            combinedInsights: {
                summary: this.createCombinedSummary(aiInsights, zoomInsights),
                highlights: this.createCombinedHighlights(aiInsights, zoomInsights),
                actionItems: this.createCombinedActionItems(aiInsights, zoomInsights),
                recommendations: this.createRecommendations(aiInsights, zoomInsights),
                qualityAssessment: this.createQualityAssessment(aiInsights, zoomInsights),
                outcomes: outcomesData
            },
            
            // Enhanced metadata
            metadata: {
                ...aiInsights.metadata,
                zoomGenerated: zoomInsights.metadata.zoomGenerated,
                outcomesGenerated: true,
                dataSources: [
                    ...(aiInsights.metadata.dataSources || []),
                    ...(zoomInsights.metadata.dataSources || []),
                    'tangible-outcomes-processor'
                ],
                meetingId: this._extractMeetingId(meetingData),
                combinedAnalysis: true
            }
        };

        this.logger.info('✅ Insights combination completed successfully with tangible outcomes');
        return combined;
    }

    /**
     * Generate insights using OpenAI GPT-4
     */
    async generateOpenAIInsights(transcriptContent, meetingData) {
        const { OpenAI } = require('openai');
        const openai = new OpenAI({ apiKey: this.openaiApiKey });

        const prompt = this.buildComprehensiveAnalysisPrompt(transcriptContent, meetingData);

        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: "You are an expert coaching session analyst. Analyze the transcript and provide comprehensive insights in JSON format."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.3,
            max_tokens: 4000
        });

        const response = completion.choices[0].message.content;
        return this.parseAIResponse(response);
    }

    /**
     * Generate insights using Anthropic Claude
     */
    async generateAnthropicInsights(transcriptContent, meetingData) {
        const Anthropic = require('@anthropic-ai/sdk');
        const anthropic = new Anthropic({ apiKey: this.anthropicApiKey });

        const prompt = this.buildComprehensiveAnalysisPrompt(transcriptContent, meetingData);

        const message = await anthropic.messages.create({
            model: "claude-3-sonnet-20240229",
            max_tokens: 4000,
            temperature: 0.3,
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ]
        });

        const response = message.content[0].text;
        return this.parseAIResponse(response);
    }

    /**
     * Build comprehensive analysis prompt for all AI providers
     */
    buildComprehensiveAnalysisPrompt(transcriptContent, meetingData) {
        return `Analyze this coaching session transcript and provide comprehensive insights in the following JSON format:

MEETING DATA:
- Topic: ${meetingData.topic || 'Unknown'}
- Duration: ${meetingData.duration || 0} minutes
- Date: ${meetingData.start_time || 'Unknown'}
- Coach: ${meetingData.coach || 'Unknown'}
- Student: ${meetingData.student || 'Unknown'}
- Participant Count: ${meetingData.participantCount || 2}

TRANSCRIPT:
${transcriptContent.substring(0, 8000)}${transcriptContent.length > 8000 ? '...' : ''}

Please provide analysis in this exact JSON format:

{
  "aiSummary": {
    "executiveSummary": "Brief overview of the session",
    "keyThemes": ["theme1", "theme2"],
    "mainDiscussionPoints": ["point1", "point2"],
    "sessionStructure": {
      "phases": [
        {"name": "Opening", "description": "What happened"},
        {"name": "Main", "description": "Core discussion"},
        {"name": "Closing", "description": "Wrap-up"}
      ]
    }
  },
  "aiHighlights": {
    "breakthroughMoments": [
      {"timestamp": "00:15:30", "description": "Key breakthrough", "impact": "high"}
    ],
    "importantQuestions": [
      {"question": "What was asked", "significance": "high", "response": "brief response"}
    ],
    "keyInsights": [
      {"insight": "Important realization", "context": "when it occurred"}
    ],
    "memorableQuotes": [
      {"quote": "Memorable statement", "speaker": "who said it", "context": "when"}
    ]
  },
  "aiTopics": [
    {"topic": "Topic name", "timeSpent": "15 minutes", "importance": "high", "details": "What was discussed"}
  ],
  "aiActionItems": {
    "highPriority": [
      {"item": "Action item", "assignee": "who", "deadline": "when", "context": "why"}
    ],
    "mediumPriority": [],
    "lowPriority": []
  },
  "aiQuestions": {
    "coachingQuestions": [
      {"question": "Question asked", "type": "reflective/strategic/tactical", "effectiveness": "high"}
    ],
    "studentQuestions": [
      {"question": "Student question", "category": "clarification/concern/interest"}
    ]
  },
  "aiSentiment": {
    "overall": "positive/neutral/negative",
    "progression": [
      {"phase": "opening", "sentiment": "positive", "intensity": 0.8}
    ],
    "emotionalJourney": [
      {"timestamp": "00:10:00", "emotion": "frustrated", "context": "discussing challenge"}
    ]
  },
  "aiEngagement": {
    "overallScore": 0.85,
    "speakerEngagement": {
      "coach": {"score": 0.9, "techniques": ["active listening", "questioning"]},
      "student": {"score": 0.8, "participation": "high"}
    },
    "engagementFactors": {
      "responseTime": {"average": 2.5},
      "conversationFlow": {"flow": "smooth"},
      "questionFrequency": {"frequency": "high"}
    }
  },
  "aiCoachingInsights": {
    "techniques": [
      {"technique": "Active listening", "effectiveness": "high", "context": "when used"}
    ],
    "breakthroughMoments": [
      {"moment": "Description", "coachingMethod": "what worked", "studentResponse": "how they reacted"}
    ],
    "resistancePoints": [
      {"point": "What student resisted", "coachingResponse": "how coach handled it"}
    ],
    "progressIndicators": [
      {"indicator": "Sign of progress", "evidence": "what showed this"}
    ],
    "effectiveness": {
      "overall": 0.8,
      "strengths": ["Clear communication", "Good questioning"],
      "areasForImprovement": ["Could use more examples"]
    },
    "studentProgress": {
      "visibleGrowth": ["Increased confidence", "Clearer goals"],
      "challenges": ["Time management", "Follow-through"],
      "nextSteps": ["Practice new techniques", "Set specific milestones"]
    }
  },
  "aiSessionAnalysis": {
    "sessionType": "one-on-one/group",
    "duration": ${meetingData.duration || 0},
    "participantCount": ${meetingData.participantCount || 2},
    "characteristics": {
      "isOneOnOne": ${(meetingData.participantCount || 0) <= 2},
      "isGroupSession": ${(meetingData.participantCount || 0) > 2},
      "isLongSession": ${(meetingData.duration || 0) > 60},
      "isShortSession": ${(meetingData.duration || 0) < 30}
    }
  },
  "aiParticipantInsights": {
    "totalParticipants": ${meetingData.participantCount || 2},
    "activeParticipants": ${Math.min(meetingData.participantCount || 2, 2)},
    "participantRoles": ["Coach", "Student"],
    "interactionPatterns": ["Question-Answer", "Discussion"],
    "engagementLevel": "medium"
  },
  "aiQualityMetrics": {
    "overallQuality": 0.7,
    "transcriptQuality": 0.8,
    "completeness": 0.7,
    "reliability": 0.8,
    "recommendations": ["Improve audio quality", "Add more structure"]
  }
}

Focus on coaching effectiveness, student progress, actionable insights, and specific moments that demonstrate growth or challenges. Be specific about techniques used, breakthrough moments, and measurable progress indicators.`;
    }

    /**
     * Parse AI response and validate structure
     */
    parseAIResponse(response) {
        try {
            // Extract JSON from response (handle cases where AI adds extra text)
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in AI response');
            }
            
            const parsed = JSON.parse(jsonMatch[0]);
            
            // Enhanced validation and structure enforcement
            const validatedInsights = {
                aiSummary: this._validateAndEnhanceSummary(parsed.aiSummary),
                aiHighlights: this._validateAndEnhanceHighlights(parsed.aiHighlights),
                aiTopics: this._validateAndEnhanceTopics(parsed.aiTopics),
                aiActionItems: this._validateAndEnhanceActionItems(parsed.aiActionItems),
                aiQuestions: this._validateAndEnhanceQuestions(parsed.aiQuestions),
                aiSentiment: this._validateAndEnhanceSentiment(parsed.aiSentiment),
                aiEngagement: this._validateAndEnhanceEngagement(parsed.aiEngagement),
                aiCoachingInsights: this._validateAndEnhanceCoachingInsights(parsed.aiCoachingInsights),
                aiSessionAnalysis: this._validateAndEnhanceSessionAnalysis(parsed.aiSessionAnalysis),
                aiParticipantInsights: this._validateAndEnhanceParticipantInsights(parsed.aiParticipantInsights),
                aiQualityMetrics: this._validateAndEnhanceQualityMetrics(parsed.aiQualityMetrics)
            };

            this.logger.info('✅ AI response parsed and validated successfully');
            return validatedInsights;
        } catch (error) {
            this.logger.error(`❌ Failed to parse AI response: ${error.message}`);
            this.logger.error(`❌ Raw response: ${response.substring(0, 500)}...`);
            return this._generateFallbackStructure();
        }
    }

    /**
     * Validate and enhance summary structure
     */
    _validateAndEnhanceSummary(summary) {
        if (!summary || typeof summary !== 'object') {
            return this._defaultSummary();
        }

        return {
            executiveSummary: summary.executiveSummary || 'Session focused on coaching and development',
            keyThemes: Array.isArray(summary.keyThemes) ? summary.keyThemes : [],
            mainDiscussionPoints: Array.isArray(summary.mainDiscussionPoints) ? summary.mainDiscussionPoints : [],
            sessionStructure: {
                phases: Array.isArray(summary.sessionStructure?.phases) 
                    ? summary.sessionStructure.phases 
                    : [
                        { name: "Opening", description: "Session introduction and goal setting" },
                        { name: "Main", description: "Core coaching discussion and exploration" },
                        { name: "Closing", description: "Summary and next steps" }
                    ]
            }
        };
    }

    /**
     * Validate and enhance highlights structure
     */
    _validateAndEnhanceHighlights(highlights) {
        if (!highlights || typeof highlights !== 'object') {
            return this._defaultHighlights();
        }

        return {
            breakthroughMoments: Array.isArray(highlights.breakthroughMoments) 
                ? highlights.breakthroughMoments.map(moment => ({
                    timestamp: moment.timestamp || '00:00:00',
                    description: moment.description || 'Key moment',
                    impact: moment.impact || 'medium'
                }))
                : [],
            importantQuestions: Array.isArray(highlights.importantQuestions)
                ? highlights.importantQuestions.map(q => ({
                    question: q.question || 'Important question',
                    significance: q.significance || 'medium',
                    response: q.response || 'Brief response'
                }))
                : [],
            keyInsights: Array.isArray(highlights.keyInsights)
                ? highlights.keyInsights.map(insight => ({
                    insight: insight.insight || 'Key insight',
                    context: insight.context || 'When it occurred'
                }))
                : [],
            memorableQuotes: Array.isArray(highlights.memorableQuotes)
                ? highlights.memorableQuotes.map(quote => ({
                    quote: quote.quote || 'Memorable quote',
                    speaker: quote.speaker || 'Unknown',
                    context: quote.context || 'When said'
                }))
                : []
        };
    }

    /**
     * Validate and enhance topics structure
     */
    _validateAndEnhanceTopics(topics) {
        if (!Array.isArray(topics)) {
            return [];
        }

        return topics.map(topic => ({
            topic: topic.topic || 'Unknown topic',
            timeSpent: topic.timeSpent || 'Unknown',
            importance: topic.importance || 'medium',
            details: topic.details || 'Topic discussion'
        }));
    }

    /**
     * Validate and enhance action items structure
     */
    _validateAndEnhanceActionItems(actionItems) {
        if (!actionItems || typeof actionItems !== 'object') {
            return this._defaultActionItems();
        }

        return {
            highPriority: Array.isArray(actionItems.highPriority)
                ? actionItems.highPriority.map(item => ({
                    item: typeof item === 'string' ? item : item.item || 'Action item',
                    assignee: typeof item === 'string' ? "Student" : item.assignee || "Student",
                    deadline: typeof item === 'string' ? "TBD" : item.deadline || "TBD",
                    context: typeof item === 'string' ? "Action item from coaching session" : item.context || "Action item from coaching session"
                }))
                : [],
            mediumPriority: Array.isArray(actionItems.mediumPriority)
                ? actionItems.mediumPriority.map(item => ({
                    item: item.item || 'Action item',
                    assignee: item.assignee || 'Unknown',
                    deadline: item.deadline || 'TBD',
                    context: item.context || 'Why needed'
                }))
                : [],
            lowPriority: Array.isArray(actionItems.lowPriority)
                ? actionItems.lowPriority.map(item => ({
                    item: item.item || 'Action item',
                    assignee: item.assignee || 'Unknown',
                    deadline: item.deadline || 'TBD',
                    context: item.context || 'Why needed'
                }))
                : []
        };
    }

    /**
     * Validate and enhance questions structure
     */
    _validateAndEnhanceQuestions(questions) {
        if (!questions || typeof questions !== 'object') {
            return this._defaultQuestions();
        }

        return {
            coachingQuestions: Array.isArray(questions.coachingQuestions)
                ? questions.coachingQuestions.map(q => ({
                    question: q.question || 'Coaching question',
                    type: q.type || 'reflective',
                    effectiveness: q.effectiveness || 'medium'
                }))
                : [],
            studentQuestions: Array.isArray(questions.studentQuestions)
                ? questions.studentQuestions.map(q => ({
                    question: q.question || 'Student question',
                    category: q.category || 'clarification'
                }))
                : []
        };
    }

    /**
     * Validate and enhance sentiment structure
     */
    _validateAndEnhanceSentiment(sentiment) {
        if (!sentiment || typeof sentiment !== 'object') {
            return this._defaultSentiment();
        }

        return {
            overall: sentiment.overall || 'neutral',
            progression: Array.isArray(sentiment.progression)
                ? sentiment.progression.map(p => ({
                    phase: p.phase || 'unknown',
                    sentiment: p.sentiment || 'neutral',
                    intensity: typeof p.intensity === 'number' ? p.intensity : 0.5
                }))
                : [],
            emotionalJourney: Array.isArray(sentiment.emotionalJourney)
                ? sentiment.emotionalJourney.map(e => ({
                    timestamp: e.timestamp || '00:00:00',
                    emotion: e.emotion || 'neutral',
                    context: e.context || 'Emotional state'
                }))
                : []
        };
    }

    /**
     * Validate and enhance engagement structure
     */
    _validateAndEnhanceEngagement(engagement) {
        if (!engagement || typeof engagement !== 'object') {
            return this._defaultEngagement();
        }

        return {
            overallScore: typeof engagement.overallScore === 'number' ? engagement.overallScore : 0.7,
            speakerEngagement: {
                coach: {
                    score: typeof engagement.speakerEngagement?.coach?.score === 'number' 
                        ? engagement.speakerEngagement.coach.score : 0.8,
                    techniques: Array.isArray(engagement.speakerEngagement?.coach?.techniques)
                        ? engagement.speakerEngagement.coach.techniques : ['active listening']
                },
                student: {
                    score: typeof engagement.speakerEngagement?.student?.score === 'number'
                        ? engagement.speakerEngagement.student.score : 0.7,
                    participation: engagement.speakerEngagement?.student?.participation || 'medium'
                }
            },
            engagementFactors: {
                responseTime: {
                    average: typeof engagement.engagementFactors?.responseTime?.average === 'number'
                        ? engagement.engagementFactors.responseTime.average : 2.5
                },
                conversationFlow: {
                    flow: engagement.engagementFactors?.conversationFlow?.flow || 'smooth'
                },
                questionFrequency: {
                    frequency: engagement.engagementFactors?.questionFrequency?.frequency || 'medium'
                }
            }
        };
    }

    /**
     * Validate and enhance coaching insights structure
     */
    _validateAndEnhanceCoachingInsights(insights) {
        if (!insights || typeof insights !== 'object') {
            return this._defaultCoachingInsights();
        }

        return {
            techniques: Array.isArray(insights.techniques)
                ? insights.techniques.map(t => ({
                    technique: t.technique || 'Coaching technique',
                    effectiveness: t.effectiveness || 'medium',
                    context: t.context || 'When used'
                }))
                : [],
            breakthroughMoments: Array.isArray(insights.breakthroughMoments)
                ? insights.breakthroughMoments.map(m => ({
                    moment: m.moment || 'Breakthrough moment',
                    coachingMethod: m.coachingMethod || 'Method used',
                    studentResponse: m.studentResponse || 'Student reaction'
                }))
                : [],
            resistancePoints: Array.isArray(insights.resistancePoints)
                ? insights.resistancePoints.map(r => ({
                    point: r.point || 'Resistance point',
                    coachingResponse: r.coachingResponse || 'How handled'
                }))
                : [],
            progressIndicators: Array.isArray(insights.progressIndicators)
                ? insights.progressIndicators.map(p => ({
                    indicator: p.indicator || 'Progress indicator',
                    evidence: p.evidence || 'Evidence of progress'
                }))
                : [],
            effectiveness: {
                overall: typeof insights.effectiveness?.overall === 'number' 
                    ? insights.effectiveness.overall : 0.7,
                strengths: Array.isArray(insights.effectiveness?.strengths) 
                    ? insights.effectiveness.strengths : ['Good communication'],
                areasForImprovement: Array.isArray(insights.effectiveness?.areasForImprovement)
                    ? insights.effectiveness.areasForImprovement : ['Could use more examples']
            },
            studentProgress: {
                visibleGrowth: Array.isArray(insights.studentProgress?.visibleGrowth)
                    ? insights.studentProgress.visibleGrowth : ['Increased confidence'],
                challenges: Array.isArray(insights.studentProgress?.challenges)
                    ? insights.studentProgress.challenges : ['Time management'],
                nextSteps: Array.isArray(insights.studentProgress?.nextSteps)
                    ? insights.studentProgress.nextSteps : ['Practice new techniques']
            }
        };
    }

    /**
     * Validate and enhance session analysis structure
     */
    _validateAndEnhanceSessionAnalysis(analysis) {
        if (!analysis || typeof analysis !== 'object') {
            return this._defaultSessionAnalysis();
        }

        return {
            sessionType: analysis.sessionType || 'one-on-one',
            duration: typeof analysis.duration === 'number' ? analysis.duration : 0,
            participantCount: typeof analysis.participantCount === 'number' ? analysis.participantCount : 2,
            characteristics: {
                isOneOnOne: typeof analysis.characteristics?.isOneOnOne === 'boolean' 
                    ? analysis.characteristics.isOneOnOne : true,
                isGroupSession: typeof analysis.characteristics?.isGroupSession === 'boolean'
                    ? analysis.characteristics.isGroupSession : false,
                isLongSession: typeof analysis.characteristics?.isLongSession === 'boolean'
                    ? analysis.characteristics.isLongSession : false,
                isShortSession: typeof analysis.characteristics?.isShortSession === 'boolean'
                    ? analysis.characteristics.isShortSession : false
            }
        };
    }

    /**
     * Validate and enhance participant insights structure
     */
    _validateAndEnhanceParticipantInsights(insights) {
        if (!insights || typeof insights !== 'object') {
            return this._defaultParticipantInsights();
        }

        return {
            totalParticipants: typeof insights.totalParticipants === 'number' 
                ? insights.totalParticipants : 2,
            activeParticipants: typeof insights.activeParticipants === 'number'
                ? insights.activeParticipants : 2,
            participantRoles: Array.isArray(insights.participantRoles)
                ? insights.participantRoles : ['Coach', 'Student'],
            interactionPatterns: Array.isArray(insights.interactionPatterns)
                ? insights.interactionPatterns : ['Question-Answer'],
            engagementLevel: insights.engagementLevel || 'medium'
        };
    }

    /**
     * Validate and enhance quality metrics structure
     */
    _validateAndEnhanceQualityMetrics(metrics) {
        if (!metrics || typeof metrics !== 'object') {
            return this._defaultQualityMetrics();
        }

        return {
            overallQuality: typeof metrics.overallQuality === 'number' ? metrics.overallQuality : 0.7,
            transcriptQuality: typeof metrics.transcriptQuality === 'number' ? metrics.transcriptQuality : 0.8,
            completeness: typeof metrics.completeness === 'number' ? metrics.completeness : 0.7,
            reliability: typeof metrics.reliability === 'number' ? metrics.reliability : 0.8,
            recommendations: Array.isArray(metrics.recommendations) ? metrics.recommendations : ['Improve quality']
        };
    }

    /**
     * Generate rule-based insights (fallback when AI is not available)
     */
    generateRuleBasedInsights(transcriptContent, meetingData) {
        this.logger.info('🔄 Generating rule-based insights');
        
        const themes = this.extractKeyThemes(transcriptContent);
        const discussionPoints = this.extractDiscussionPoints(transcriptContent);
        const breakthroughs = this.extractBreakthroughMoments(transcriptContent);
        const questions = this.extractImportantQuestions(transcriptContent);
        const insights = this.extractKeyInsights(transcriptContent);
        const topics = this.extractTopics(transcriptContent);
        const actionItems = this.extractActionItems(transcriptContent, 'high');
        const coachingQuestions = this.extractCoachingQuestions(transcriptContent);
        const studentQuestions = this.extractStudentQuestions(transcriptContent);
        const sentiment = this.analyzeSentiment(transcriptContent);
        
        return {
            aiSummary: {
                executiveSummary: themes.length > 0 ? `Session focused on ${themes.join(', ')}` : 'Coaching session with general discussion',
                keyThemes: themes,
                mainDiscussionPoints: discussionPoints,
                sessionStructure: {
                    phases: [
                        { name: "Opening", description: "Session introduction and goal setting" },
                        { name: "Main", description: "Core coaching discussion and exploration" },
                        { name: "Closing", description: "Summary and next steps" }
                    ]
                }
            },
            aiHighlights: {
                breakthroughMoments: breakthroughs,
                importantQuestions: questions,
                keyInsights: insights,
                memorableQuotes: this._extractMemorableQuotes(transcriptContent)
            },
            aiTopics: topics.map(topic => ({
                topic: topic,
                timeSpent: "Variable",
                importance: "medium",
                details: `Discussed ${topic} during the session`
            })),
            aiActionItems: {
                highPriority: actionItems.map(item => ({
                    item: typeof item === 'string' ? item : item.item || 'Action item',
                    assignee: typeof item === 'string' ? "Student" : item.assignee || "Student",
                    deadline: typeof item === 'string' ? "TBD" : item.deadline || "TBD",
                    context: typeof item === 'string' ? "Action item from coaching session" : item.context || "Action item from coaching session"
                })),
                mediumPriority: [],
                lowPriority: []
            },
            aiQuestions: {
                coachingQuestions: coachingQuestions.map(q => ({
                    question: q,
                    type: "reflective",
                    effectiveness: "medium"
                })),
                studentQuestions: studentQuestions.map(q => ({
                    question: q,
                    category: "clarification"
                }))
            },
            aiSentiment: {
                overall: sentiment.overall || 'neutral',
                progression: [
                    { phase: "opening", sentiment: "neutral", intensity: 0.5 },
                    { phase: "main", sentiment: sentiment.overall || "neutral", intensity: 0.7 },
                    { phase: "closing", sentiment: "positive", intensity: 0.6 }
                ],
                emotionalJourney: [
                    { timestamp: "00:00:00", emotion: "neutral", context: "Session start" },
                    { timestamp: "00:30:00", emotion: sentiment.overall || "neutral", context: "Main discussion" }
                ]
            },
            aiEngagement: {
                overallScore: 0.7,
                speakerEngagement: {
                    coach: {
                        score: 0.8,
                        techniques: ['Active listening', 'Questioning', 'Goal setting']
                    },
                    student: {
                        score: 0.6,
                        participation: 'medium'
                    }
                },
                engagementFactors: {
                    responseTime: { average: 2.5 },
                    conversationFlow: { flow: 'smooth' },
                    questionFrequency: { frequency: 'medium' }
                }
            },
            aiCoachingInsights: {
                techniques: [
                    { technique: 'Active Listening', effectiveness: 'high', context: 'Throughout session' },
                    { technique: 'Questioning', effectiveness: 'medium', context: 'To explore topics' },
                    { technique: 'Goal Setting', effectiveness: 'medium', context: 'For next steps' }
                ],
                breakthroughMoments: breakthroughs.map(b => ({
                    moment: b.description,
                    coachingMethod: 'Questioning and reflection',
                    studentResponse: 'Positive engagement'
                })),
                resistancePoints: [],
                progressIndicators: [
                    { indicator: 'Active participation', evidence: 'Student asking questions' },
                    { indicator: 'Goal clarity', evidence: 'Clear action items identified' }
                ],
                effectiveness: {
                    overall: 0.7,
                    strengths: ['Good rapport building', 'Clear communication', 'Structured approach'],
                    areasForImprovement: ['Could use more specific examples', 'More follow-up questions']
                },
                studentProgress: {
                    visibleGrowth: ['Increased engagement', 'Clearer goals'],
                    challenges: ['Time management', 'Follow-through'],
                    nextSteps: ['Practice new techniques', 'Set specific milestones']
                }
            },
            aiSessionAnalysis: {
                sessionType: (meetingData.participantCount || 0) <= 2 ? 'one-on-one' : 'group',
                duration: meetingData.duration || 0,
                participantCount: meetingData.participantCount || 2,
                characteristics: {
                    isOneOnOne: (meetingData.participantCount || 0) <= 2,
                    isGroupSession: (meetingData.participantCount || 0) > 2,
                    isLongSession: (meetingData.duration || 0) > 60,
                    isShortSession: (meetingData.duration || 0) < 30
                }
            },
            aiParticipantInsights: {
                totalParticipants: meetingData.participantCount || 2,
                activeParticipants: Math.min(meetingData.participantCount || 2, 2),
                participantRoles: ['Coach', 'Student'],
                interactionPatterns: ['Question-Answer', 'Discussion'],
                engagementLevel: 'medium'
            },
            aiQualityMetrics: {
                overallQuality: 0.7,
                transcriptQuality: 0.8,
                completeness: 0.7,
                reliability: 0.8,
                recommendations: ['Improve audio quality', 'Add more structure', 'Enhance engagement tracking']
            },
            metadata: {
                aiGenerated: false,
                model: 'rule-based',
                provider: 'fallback',
                processingTime: 0
            }
        };
    }

    /**
     * Extract memorable quotes from transcript
     */
    _extractMemorableQuotes(transcriptContent) {
        if (!transcriptContent) return [];
        
        const quotes = [];
        const quoteKeywords = ['said', 'mentioned', 'stated', 'explained', 'shared'];
        
        const sentences = transcriptContent.split(/[.!?]+/).filter(s => s.trim().length > 20);
        
        sentences.forEach(sentence => {
            quoteKeywords.forEach(keyword => {
                if (sentence.toLowerCase().includes(keyword)) {
                    quotes.push({
                        quote: sentence.trim(),
                        speaker: 'Unknown',
                        context: 'During discussion'
                    });
                }
            });
        });

        return quotes.slice(0, 3);
    }

    /**
     * Extract key themes from transcript
     */
    extractKeyThemes(transcriptContent) {
        if (!transcriptContent) return [];
        
        const themes = [];
        const themeKeywords = {
            'goal setting': ['goal', 'objective', 'target', 'aim'],
            'time management': ['time', 'schedule', 'prioritize', 'deadline'],
            'communication': ['communicate', 'speak', 'listen', 'conversation'],
            'leadership': ['lead', 'manage', 'team', 'decision'],
            'confidence': ['confidence', 'self-esteem', 'belief', 'trust'],
            'stress management': ['stress', 'anxiety', 'pressure', 'overwhelm']
        };

        for (const [theme, keywords] of Object.entries(themeKeywords)) {
            const count = keywords.reduce((total, keyword) => {
                const regex = new RegExp(keyword, 'gi');
                const matches = transcriptContent.match(regex);
                return total + (matches ? matches.length : 0);
            }, 0);
            
            if (count > 2) {
                themes.push(theme);
            }
        }

        return themes.slice(0, 3); // Return top 3 themes
    }

    /**
     * Extract discussion points
     */
    extractDiscussionPoints(transcriptContent) {
        if (!transcriptContent) return [];
        
        const points = [];
        const sentences = transcriptContent.split(/[.!?]+/).filter(s => s.trim().length > 20);
        
        // Extract sentences that seem like discussion points
        sentences.forEach(sentence => {
            if (sentence.includes('discuss') || sentence.includes('talk about') || 
                sentence.includes('explore') || sentence.includes('focus on')) {
                points.push(sentence.trim());
            }
        });

        return points.slice(0, 5); // Return top 5 points
    }

    /**
     * Extract breakthrough moments
     */
    extractBreakthroughMoments(transcriptContent) {
        if (!transcriptContent) return [];
        
        const breakthroughs = [];
        const breakthroughKeywords = ['realize', 'understand', 'discover', 'breakthrough', 'aha', 'insight'];
        
        breakthroughKeywords.forEach(keyword => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            const matches = transcriptContent.match(regex);
            if (matches) {
                breakthroughs.push({
                    timestamp: "00:00:00",
                    description: `Key ${keyword} moment`,
                    impact: "high"
                });
            }
        });

        return breakthroughs.slice(0, 3);
    }

    /**
     * Extract important questions
     */
    extractImportantQuestions(transcriptContent) {
        if (!transcriptContent) return [];
        
        const questions = [];
        const questionRegex = /[^.!?]*\?/g;
        const matches = transcriptContent.match(questionRegex);
        
        if (matches) {
            matches.forEach(question => {
                if (question.trim().length > 10) {
                    questions.push({
                        question: question.trim(),
                        significance: "medium",
                        response: "Response captured in transcript"
                    });
                }
            });
        }

        return questions.slice(0, 5);
    }

    /**
     * Extract key insights
     */
    extractKeyInsights(transcriptContent) {
        if (!transcriptContent) return [];
        
        const insights = [];
        const insightKeywords = ['learn', 'realize', 'understand', 'discover', 'find'];
        
        insightKeywords.forEach(keyword => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            const matches = transcriptContent.match(regex);
            if (matches) {
                insights.push({
                    insight: `Key learning about ${keyword}`,
                    context: "During session discussion"
                });
            }
        });

        return insights.slice(0, 3);
    }

    /**
     * Extract topics
     */
    extractTopics(transcriptContent) {
        if (!transcriptContent) return [];
        
        const topics = this.extractKeyThemes(transcriptContent);
        return topics.map(topic => ({
            topic: topic,
            timeSpent: "variable",
            importance: "medium",
            details: `Discussed ${topic} during the session`
        }));
    }

    /**
     * Extract action items
     */
    extractActionItems(transcriptContent, priority) {
        if (!transcriptContent) return [];
        
        const actionItems = [];
        const actionKeywords = ['will', 'going to', 'plan to', 'need to', 'should'];
        
        actionKeywords.forEach(keyword => {
            const regex = new RegExp(`\\b${keyword}\\b[^.!?]*[.!?]`, 'gi');
            const matches = transcriptContent.match(regex);
            if (matches) {
                matches.forEach(match => {
                    actionItems.push({
                        item: match.trim(),
                        assignee: "student",
                        deadline: "TBD",
                        context: "Identified during session"
                    });
                });
            }
        });

        return actionItems.slice(0, 3);
    }

    /**
     * Extract coaching questions
     */
    extractCoachingQuestions(transcriptContent) {
        if (!transcriptContent) return [];
        
        const questions = this.extractImportantQuestions(transcriptContent);
        return questions.map(q => ({
            question: q.question,
            type: "reflective",
            effectiveness: "medium"
        }));
    }

    /**
     * Extract student questions
     */
    extractStudentQuestions(transcriptContent) {
        if (!transcriptContent) return [];
        
        const questions = this.extractImportantQuestions(transcriptContent);
        return questions.map(q => ({
            question: q.question,
            category: "clarification"
        }));
    }

    /**
     * Analyze sentiment
     */
    analyzeSentiment(transcriptContent) {
        if (!transcriptContent) return "neutral";
        
        const positiveWords = ['good', 'great', 'excellent', 'positive', 'happy', 'satisfied', 'progress'];
        const negativeWords = ['bad', 'terrible', 'negative', 'sad', 'frustrated', 'difficult', 'problem'];
        
        let positiveCount = 0;
        let negativeCount = 0;
        
        positiveWords.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            const matches = transcriptContent.match(regex);
            if (matches) positiveCount += matches.length;
        });
        
        negativeWords.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            const matches = transcriptContent.match(regex);
            if (matches) negativeCount += matches.length;
        });
        
        if (positiveCount > negativeCount) return "positive";
        if (negativeCount > positiveCount) return "negative";
        return "neutral";
    }

    /**
     * Generate fallback insights when transcript is unavailable
     */
    generateFallbackInsights(meetingData) {
        this.logger.info('🔄 Generating fallback insights (no transcript available)');
        
        return {
            aiSummary: {
                executiveSummary: `Coaching session on ${meetingData.topic || 'general topics'} - no transcript available`,
                keyThemes: ["session completed"],
                mainDiscussionPoints: ["coaching discussion"],
                sessionStructure: {
                    phases: [
                        { name: "Session", description: "Coaching session completed" }
                    ]
                }
            },
            aiHighlights: {
                breakthroughMoments: [],
                importantQuestions: [],
                keyInsights: [],
                memorableQuotes: []
            },
            aiTopics: [],
            aiActionItems: {
                highPriority: [],
                mediumPriority: [],
                lowPriority: []
            },
            aiQuestions: {
                coachingQuestions: [],
                studentQuestions: []
            },
            aiSentiment: {
                overall: "neutral",
                coachSentiment: "neutral",
                studentSentiment: "neutral",
                confidence: "low"
            },
            aiEngagement: {
                overallScore: 0.5,
                coachEngagement: 0.5,
                studentEngagement: 0.5,
                conversationFlow: "unknown"
            },
            aiCoachingInsights: {
                techniques: [],
                effectiveness: {
                    overall: 0.5,
                    strengths: [],
                    areasForImprovement: []
                },
                studentProgress: {
                    visibleGrowth: [],
                    challenges: [],
                    nextSteps: []
                }
            },
            aiSessionAnalysis: {
                sessionType: (meetingData.participant_count || 0) <= 2 ? 'one-on-one' : 'group',
                duration: meetingData.duration || 0,
                participantCount: meetingData.participant_count || 0,
                characteristics: {
                    isOneOnOne: (meetingData.participant_count || 0) <= 2,
                    isGroupSession: (meetingData.participant_count || 0) > 2,
                    isLongSession: (meetingData.duration || 0) > 60,
                    isShortSession: (meetingData.duration || 0) < 30
                }
            },
            aiParticipantInsights: {
                totalParticipants: meetingData.participant_count || 0,
                activeParticipants: 0,
                participantRoles: [],
                interactionPatterns: [],
                engagementLevel: "unknown"
            },
            aiQualityMetrics: {
                overallQuality: 0.5,
                transcriptQuality: 0.0,
                completeness: 0.5,
                reliability: 0.5,
                recommendations: ["No transcript available for analysis"]
            },
            metadata: {
                aiGenerated: false,
                model: 'fallback',
                provider: 'none',
                processingTime: 0
            }
        };
    }

    /**
     * Default methods for AI response parsing
     */
    _defaultSummary() {
        return {
            executiveSummary: "AI analysis completed",
            keyThemes: [],
            mainDiscussionPoints: [],
            sessionStructure: {
                phases: [
                    { name: "Session", description: "Coaching session" }
                ]
            }
        };
    }

    _defaultHighlights() {
        return {
            breakthroughMoments: [],
            importantQuestions: [],
            keyInsights: [],
            memorableQuotes: []
        };
    }

    _defaultActionItems() {
        return {
            highPriority: [],
            mediumPriority: [],
            lowPriority: []
        };
    }

    _defaultQuestions() {
        return {
            coachingQuestions: [],
            studentQuestions: []
        };
    }

    _defaultSentiment() {
        return {
            overall: "neutral",
            coachSentiment: "neutral",
            studentSentiment: "neutral",
            confidence: "medium"
        };
    }

    _defaultEngagement() {
        return {
            overallScore: 0.5,
            coachEngagement: 0.5,
            studentEngagement: 0.5,
            conversationFlow: "unknown"
        };
    }

    _defaultCoachingInsights() {
        return {
            techniques: [],
            effectiveness: {
                overall: 0.5,
                strengths: [],
                areasForImprovement: []
            },
            studentProgress: {
                visibleGrowth: [],
                challenges: [],
                nextSteps: []
            }
        };
    }

    _defaultSessionAnalysis() {
        return {
            sessionType: "one-on-one",
            duration: 0,
            participantCount: 0,
            characteristics: {
                isOneOnOne: true,
                isGroupSession: false,
                isLongSession: false,
                isShortSession: true
            }
        };
    }

    _defaultParticipantInsights() {
        return {
            totalParticipants: 0,
            activeParticipants: 0,
            participantRoles: [],
            interactionPatterns: [],
            engagementLevel: "unknown"
        };
    }

    _defaultQualityMetrics() {
        return {
            overallQuality: 0.5,
            transcriptQuality: 0.5,
            completeness: 0.5,
            reliability: 0.5,
            recommendations: []
        };
    }

    _generateFallbackStructure() {
        return {
            aiSummary: this._defaultSummary(),
            aiHighlights: this._defaultHighlights(),
            aiTopics: [],
            aiActionItems: this._defaultActionItems(),
            aiQuestions: this._defaultQuestions(),
            aiSentiment: this._defaultSentiment(),
            aiEngagement: this._defaultEngagement(),
            aiCoachingInsights: this._defaultCoachingInsights(),
            aiSessionAnalysis: this._defaultSessionAnalysis(),
            aiParticipantInsights: this._defaultParticipantInsights(),
            aiQualityMetrics: this._defaultQualityMetrics()
        };
    }

    /**
     * Combine summary insights
     */
    combineSummary(aiSummary, zoomSummary) {
        return {
            executiveSummary: zoomSummary?.executiveSummary || aiSummary?.executiveSummary || 'Coaching session analysis',
            keyThemes: [...new Set([
                ...(aiSummary?.keyThemes || []),
                ...(zoomSummary?.keyThemes || [])
            ])],
            mainDiscussionPoints: [...new Set([
                ...(aiSummary?.mainDiscussionPoints || []),
                ...(zoomSummary?.mainDiscussionPoints || [])
            ])],
            sessionStructure: aiSummary?.sessionStructure || zoomSummary?.sessionStructure,
            meetingDetails: zoomSummary?.meetingDetails || {},
            dataSources: {
                ai: !!aiSummary,
                zoom: !!zoomSummary
            }
        };
    }

    /**
     * Combine highlights
     */
    combineHighlights(aiHighlights, zoomHighlights) {
        return {
            breakthroughMoments: [
                ...(aiHighlights?.breakthroughMoments || []),
                ...(zoomHighlights?.breakthroughMoments || [])
            ],
            importantQuestions: [
                ...(aiHighlights?.importantQuestions || []),
                ...(zoomHighlights?.importantQuestions || [])
            ],
            keyInsights: [
                ...(aiHighlights?.keyInsights || []),
                ...(zoomHighlights?.keyInsights || [])
            ],
            memorableQuotes: [
                ...(aiHighlights?.memorableQuotes || []),
                ...(zoomHighlights?.memorableQuotes || [])
            ],
            keyMoments: zoomHighlights?.keyMoments || [],
            dataSources: {
                ai: !!aiHighlights,
                zoom: !!zoomHighlights
            }
        };
    }

    /**
     * Combine topics
     */
    combineTopics(aiTopics, zoomTopics) {
        // Combine topics from both sources, deduplicate by topic name (case-insensitive)
        const safeToLower = v => (typeof v === 'string' ? v.toLowerCase() : '');
        const allTopics = [...(aiTopics || []), ...(zoomTopics || [])];
        const seen = new Set();
        const combined = [];
        for (const topic of allTopics) {
            const topicName = topic?.topic || topic;
            const key = safeToLower(topicName);
            if (!seen.has(key)) {
                seen.add(key);
                combined.push(topic);
            }
        }
        return combined;
    }

    /**
     * Combine action items
     */
    combineActionItems(aiActionItems, zoomActionItems) {
        const combinePriorityItems = (aiItems, zoomItems) => {
            const combined = [...(aiItems || []), ...(zoomItems || [])];
            return combined.map(item => ({
                ...item,
                sources: [...(item.sources || []), item.source || 'ai']
            }));
        };

        return {
            highPriority: combinePriorityItems(
                aiActionItems?.highPriority,
                zoomActionItems?.highPriority
            ),
            mediumPriority: combinePriorityItems(
                aiActionItems?.mediumPriority,
                zoomActionItems?.mediumPriority
            ),
            lowPriority: combinePriorityItems(
                aiActionItems?.lowPriority,
                zoomActionItems?.lowPriority
            ),
            nextSteps: zoomActionItems?.nextSteps || [],
            dataSources: {
                ai: !!aiActionItems,
                zoom: !!zoomActionItems
            }
        };
    }

    /**
     * Combine questions
     */
    combineQuestions(aiQuestions, zoomQuestions) {
        return {
            coachingQuestions: [
                ...(aiQuestions?.coachingQuestions || []),
                ...(zoomQuestions?.coachingQuestions || [])
            ],
            studentQuestions: [
                ...(aiQuestions?.studentQuestions || []),
                ...(zoomQuestions?.studentQuestions || [])
            ],
            questionsAsked: zoomQuestions?.questionsAsked || 0,
            dataSources: {
                ai: !!aiQuestions,
                zoom: !!zoomQuestions
            }
        };
    }

    /**
     * Combine sentiment analysis
     */
    combineSentiment(aiSentiment, zoomSentiment) {
        // Prefer Zoom sentiment if available (more accurate)
        const primarySentiment = zoomSentiment || aiSentiment;
        
        return {
            overall: primarySentiment?.overall || 'neutral',
            confidence: zoomSentiment?.confidence || 0.7,
            progression: [
                ...(aiSentiment?.progression || []),
                ...(zoomSentiment?.progression || [])
            ],
            emotionalJourney: [
                ...(aiSentiment?.emotionalJourney || []),
                ...(zoomSentiment?.emotionalJourney || [])
            ],
            dataSources: {
                ai: !!aiSentiment,
                zoom: !!zoomSentiment
            }
        };
    }

    /**
     * Combine engagement analysis
     */
    combineEngagement(aiEngagement, zoomEngagement) {
        // Prefer Zoom engagement data (more accurate)
        const primaryEngagement = zoomEngagement || aiEngagement;
        
        return {
            overallScore: primaryEngagement?.overallScore || 0.7,
            participationRate: zoomEngagement?.participationRate || 0.8,
            speakerEngagement: {
                ...aiEngagement?.speakerEngagement,
                ...zoomEngagement?.speakerEngagement
            },
            engagementFactors: {
                ...aiEngagement?.engagementFactors,
                ...zoomEngagement?.engagementFactors
            },
            dataSources: {
                ai: !!aiEngagement,
                zoom: !!zoomEngagement
            }
        };
    }

    /**
     * Combine coaching insights
     */
    combineCoachingInsights(aiCoachingInsights, zoomCoachingInsights) {
        return {
            techniques: [
                ...(aiCoachingInsights?.techniques || []),
                ...(zoomCoachingInsights?.techniques || [])
            ],
            breakthroughMoments: [
                ...(aiCoachingInsights?.breakthroughMoments || []),
                ...(zoomCoachingInsights?.breakthroughMoments || [])
            ],
            resistancePoints: [
                ...(aiCoachingInsights?.resistancePoints || []),
                ...(zoomCoachingInsights?.resistancePoints || [])
            ],
            progressIndicators: [
                ...(aiCoachingInsights?.progressIndicators || []),
                ...(zoomCoachingInsights?.progressIndicators || [])
            ],
            effectiveness: {
                overall: zoomCoachingInsights?.effectiveness?.overall || aiCoachingInsights?.effectiveness?.overall || 0.7,
                strengths: [
                    ...(aiCoachingInsights?.effectiveness?.strengths || []),
                    ...(zoomCoachingInsights?.effectiveness?.strengths || [])
                ],
                areasForImprovement: [
                    ...(aiCoachingInsights?.effectiveness?.areasForImprovement || []),
                    ...(zoomCoachingInsights?.effectiveness?.areasForImprovement || [])
                ]
            },
            studentProgress: {
                visibleGrowth: [
                    ...(aiCoachingInsights?.studentProgress?.visibleGrowth || []),
                    ...(zoomCoachingInsights?.studentProgress?.visibleGrowth || [])
                ],
                challenges: [
                    ...(aiCoachingInsights?.studentProgress?.challenges || []),
                    ...(zoomCoachingInsights?.studentProgress?.challenges || [])
                ],
                nextSteps: [
                    ...(aiCoachingInsights?.studentProgress?.nextSteps || []),
                    ...(zoomCoachingInsights?.studentProgress?.nextSteps || [])
                ]
            },
            dataSources: {
                ai: !!aiCoachingInsights,
                zoom: !!zoomCoachingInsights
            }
        };
    }

    /**
     * Combine session analysis
     */
    combineSessionAnalysis(aiSessionAnalysis, zoomSessionAnalysis) {
        // Prefer Zoom session data (more accurate)
        const primaryAnalysis = zoomSessionAnalysis || aiSessionAnalysis;
        
        return {
            sessionType: primaryAnalysis?.sessionType || 'unknown',
            duration: primaryAnalysis?.duration || 0,
            participantCount: primaryAnalysis?.participantCount || 0,
            characteristics: {
                ...aiSessionAnalysis?.characteristics,
                ...zoomSessionAnalysis?.characteristics
            },
            meetingId: zoomSessionAnalysis?.meetingId,
            hostName: zoomSessionAnalysis?.hostName,
            hostEmail: zoomSessionAnalysis?.hostEmail,
            startTime: zoomSessionAnalysis?.startTime,
            dataSources: {
                ai: !!aiSessionAnalysis,
                zoom: !!zoomSessionAnalysis
            }
        };
    }

    /**
     * Combine participant insights
     */
    combineParticipantInsights(aiParticipantInsights, zoomParticipantInsights) {
        // Prefer Zoom participant data (more accurate)
        const primaryInsights = zoomParticipantInsights || aiParticipantInsights;
        
        return {
            totalParticipants: primaryInsights?.totalParticipants || 0,
            activeParticipants: primaryInsights?.activeParticipants || 0,
            participantRoles: primaryInsights?.participantRoles || [],
            interactionPatterns: primaryInsights?.interactionPatterns || [],
            engagementLevel: primaryInsights?.engagementLevel || 'medium',
            participants: zoomParticipantInsights?.participants || [],
            dataSources: {
                ai: !!aiParticipantInsights,
                zoom: !!zoomParticipantInsights
            }
        };
    }

    /**
     * Combine quality metrics
     */
    combineQualityMetrics(aiQualityMetrics, zoomQualityMetrics) {
        return {
            overallQuality: zoomQualityMetrics?.overallQuality || aiQualityMetrics?.overallQuality || 0.7,
            transcriptQuality: aiQualityMetrics?.transcriptQuality || 0.8,
            completeness: zoomQualityMetrics?.completeness || aiQualityMetrics?.completeness || 0.7,
            reliability: zoomQualityMetrics?.reliability || aiQualityMetrics?.reliability || 0.8,
            engagementQuality: zoomQualityMetrics?.engagementQuality || 0.8,
            participationQuality: zoomQualityMetrics?.participationQuality || 0.9,
            recommendations: [
                ...(aiQualityMetrics?.recommendations || []),
                ...(zoomQualityMetrics?.recommendations || [])
            ],
            dataSources: {
                ai: !!aiQualityMetrics,
                zoom: !!zoomQualityMetrics
            }
        };
    }

    /**
     * Create combined summary
     */
    createCombinedSummary(aiInsights, zoomInsights) {
        const aiSummary = aiInsights.aiSummary;
        const zoomSummary = zoomInsights.zoomSummary;
        
        return {
            executiveSummary: zoomSummary?.executiveSummary || aiSummary?.executiveSummary,
            keyThemes: [...new Set([
                ...(aiSummary?.keyThemes || []),
                ...(zoomSummary?.keyThemes || [])
            ])],
            dataSources: ['ai', 'zoom'].filter(source => 
                source === 'ai' ? !!aiSummary : !!zoomSummary
            ),
            confidence: zoomSummary?.confidence || 0.8
        };
    }

    /**
     * Create combined highlights
     */
    createCombinedHighlights(aiInsights, zoomInsights) {
        return {
            breakthroughMoments: [
                ...(aiInsights.aiHighlights?.breakthroughMoments || []),
                ...(zoomInsights.zoomHighlights?.breakthroughMoments || [])
            ],
            keyInsights: [
                ...(aiInsights.aiHighlights?.keyInsights || []),
                ...(zoomInsights.zoomHighlights?.keyInsights || [])
            ],
            keyMoments: zoomInsights.zoomHighlights?.keyMoments || []
        };
    }

    /**
     * Create combined action items
     */
    createCombinedActionItems(aiInsights, zoomInsights) {
        const allActionItems = [
            ...(aiInsights.aiActionItems?.highPriority || []),
            ...(zoomInsights.zoomActionItems?.highPriority || []),
            ...(zoomInsights.zoomActionItems?.nextSteps || [])
        ];

        return {
            highPriority: allActionItems.filter(item => item.priority === 'high' || !item.priority),
            mediumPriority: aiInsights.aiActionItems?.mediumPriority || [],
            lowPriority: aiInsights.aiActionItems?.lowPriority || [],
            totalCount: allActionItems.length
        };
    }

    /**
     * Create recommendations
     */
    createRecommendations(aiInsights, zoomInsights) {
        const recommendations = [];

        // Coaching effectiveness recommendations
        const coachingInsights = aiInsights.aiCoachingInsights;
        if (coachingInsights?.effectiveness?.areasForImprovement) {
            recommendations.push(...coachingInsights.effectiveness.areasForImprovement.map(area => ({
                type: 'coaching_improvement',
                recommendation: area,
                priority: 'medium'
            })));
        }

        // Quality recommendations
        const qualityMetrics = zoomInsights.zoomQualityMetrics;
        if (qualityMetrics?.recommendations) {
            recommendations.push(...qualityMetrics.recommendations.map(rec => ({
                type: 'quality_improvement',
                recommendation: rec,
                priority: 'low'
            })));
        }

        return recommendations;
    }

    /**
     * Create quality assessment
     */
    createQualityAssessment(aiInsights, zoomInsights) {
        const aiQuality = aiInsights.aiQualityMetrics;
        const zoomQuality = zoomInsights.zoomQualityMetrics;

        return {
            overallQuality: zoomQuality?.overallQuality || aiQuality?.overallQuality || 0.7,
            dataCompleteness: zoomQuality?.completeness || 0.8,
            accuracy: zoomQuality?.reliability || 0.8,
            engagementQuality: zoomQuality?.engagementQuality || 0.8,
            transcriptQuality: aiQuality?.transcriptQuality || 0.8,
            confidence: zoomQuality?.reliability || 0.8
        };
    }
}

module.exports = AIPoweredInsightsGenerator; 