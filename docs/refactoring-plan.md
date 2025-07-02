# Refactoring Plan for Core Files

## 1. AI-Powered Insights Generator Refactoring

### Current State
```javascript
// Monolithic class with direct API integration
class AIPoweredInsightsGenerator {
    constructor() {
        this.openaiApiKey = process.env.OPENAI_API_KEY;
        this.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
        // Direct initialization
    }
}
```

### Refactored State
```javascript
// src/infrastructure/services/AIService.js
class AIService {
    constructor({ config, logger, circuitBreaker }) {
        this.config = config;
        this.logger = logger;
        this.circuitBreaker = circuitBreaker;
        this.providers = this._initializeProviders();
    }
    
    async generateInsights(transcript, metadata) {
        return this.circuitBreaker.execute(async () => {
            const provider = this._selectProvider();
            return provider.analyze(transcript, metadata);
        });
    }
}

// src/infrastructure/services/ai/OpenAIProvider.js
class OpenAIProvider {
    constructor({ apiKey, logger }) {
        this.client = new OpenAI({ apiKey });
        this.logger = logger;
    }
    
    async analyze(transcript, metadata) {
        // Your existing OpenAI logic, but cleaner
    }
}

// src/infrastructure/services/ai/AnthropicProvider.js
class AnthropicProvider {
    constructor({ apiKey, logger }) {
        this.client = new Anthropic({ apiKey });
        this.logger = logger;
    }
    
    async analyze(transcript, metadata) {
        // Your existing Anthropic logic, but cleaner
    }
}
```

### Key Changes
- **Separation of Concerns**: Split into AIService + individual providers
- **Dependency Injection**: All dependencies injected, not created
- **Circuit Breaker**: Automatic failure handling
- **Provider Pattern**: Easy to add/remove AI providers
- **Testability**: Each provider can be tested independently

---

## 2. Comprehensive Insights Generator Refactoring

### Current State
```javascript
class ComprehensiveInsightsGenerator {
    constructor() {
        // Direct instantiation of dependencies
        this.zoomInsightsExtractor = new EnhancedZoomInsightsExtractor();
        this.transcriptAnalyzer = new EnhancedTranscriptAnalyzer();
    }
}
```

### Refactored State
```javascript
// src/application/services/InsightsGenerator.js
class InsightsGenerator {
    constructor({ 
        aiService, 
        transcriptAnalyzer, 
        participantAnalyzer,
        logger,
        eventBus 
    }) {
        this.aiService = aiService;
        this.transcriptAnalyzer = transcriptAnalyzer;
        this.participantAnalyzer = participantAnalyzer;
        this.logger = logger;
        this.eventBus = eventBus;
    }
    
    async generateInsights({ recording, session, transcript }) {
        try {
            // Emit start event
            this.eventBus.emit('insights.generation.started', { recordingId: recording.id });
            
            // Parallel processing for efficiency
            const [aiInsights, transcriptInsights, participantInsights] = await Promise.all([
                this._generateAIInsights(transcript, session),
                this._generateTranscriptInsights(transcript),
                this._generateParticipantInsights(session)
            ]);
            
            // Combine insights using domain logic
            const combinedInsights = this._combineInsights({
                ai: aiInsights,
                transcript: transcriptInsights,
                participants: participantInsights
            });
            
            // Emit completion event
            this.eventBus.emit('insights.generation.completed', { 
                recordingId: recording.id,
                insightsCount: combinedInsights.length 
            });
            
            return combinedInsights;
        } catch (error) {
            this.logger.error('Insights generation failed', { error, recordingId: recording.id });
            throw new InsightsGenerationError('Failed to generate insights', error);
        }
    }
    
    _combineInsights({ ai, transcript, participants }) {
        // Your existing combination logic, but cleaner
        return new CombinedInsights({
            sessionOverview: this._createSessionOverview(ai, transcript),
            coachingEffectiveness: this._assessCoachingEffectiveness(ai, transcript),
            studentProgress: this._assessStudentProgress(ai, transcript),
            keyHighlights: this._extractKeyHighlights(ai, transcript),
            actionItems: this._consolidateActionItems(ai, transcript)
        });
    }
}
```

### Key Changes
- **Domain Models**: Uses `Recording` and `Session` entities
- **Event-Driven**: Emits events for monitoring
- **Parallel Processing**: Faster insights generation
- **Error Boundaries**: Proper error handling with custom errors
- **Clean Interfaces**: Clear method signatures

---

## 3. Tangible Outcomes Processor Refactoring

### Current State
```javascript
class TangibleOutcomesProcessor {
    constructor() {
        // Direct file loading
        this.coaches = require('../data/coaches.json');
        this.students = require('../data/students.json');
    }
}
```

### Refactored State
```javascript
// src/domain/services/OutcomesProcessor.js
class OutcomesProcessor {
    constructor({ knowledgeBase, logger, metricsCollector }) {
        this.knowledgeBase = knowledgeBase;
        this.logger = logger;
        this.metrics = metricsCollector;
    }
    
    async processOutcomes({ session, insights }) {
        const startTime = Date.now();
        
        try {
            // Create domain object
            const outcomes = new SessionOutcomes({
                sessionId: session.id,
                recordingId: session.recordingId
            });
            
            // Extract outcomes using domain logic
            await this._extractActionItemOutcomes(outcomes, insights);
            await this._extractBreakthroughOutcomes(outcomes, insights);
            await this._extractProgressOutcomes(outcomes, insights);
            
            // Calculate quality metrics
            outcomes.calculateQualityMetrics();
            
            // Track metrics
            this.metrics.recordOutcomeProcessing(Date.now() - startTime);
            
            return outcomes;
        } catch (error) {
            this.logger.error('Outcome processing failed', { 
                sessionId: session.id,
                error 
            });
            throw new OutcomeProcessingError('Failed to process outcomes', error);
        }
    }
    
    async _extractActionItemOutcomes(outcomes, insights) {
        const actionItems = insights.getActionItems();
        
        for (const item of actionItems) {
            const outcome = new Outcome({
                type: OutcomeType.ACTION_ITEM,
                category: this._categorizeOutcome(item.text),
                name: item.text,
                value: {
                    priority: item.priority,
                    assignee: item.assignee,
                    deadline: item.deadline
                },
                status: OutcomeStatus.PLANNED
            });
            
            // Use knowledge base for enrichment
            const enrichedData = await this.knowledgeBase.enrichOutcome(outcome);
            outcome.applyEnrichment(enrichedData);
            
            outcomes.addOutcome(outcome);
        }
    }
}

// src/domain/models/Outcome.js
class Outcome {
    constructor(data) {
        this.id = generateOutcomeId();
        this.type = data.type;
        this.category = data.category;
        this.name = data.name;
        this.value = data.value;
        this.status = data.status;
        this.strategy = new OutcomeStrategy();
        this.metrics = new OutcomeMetrics();
    }
    
    applyEnrichment(enrichedData) {
        // Domain logic for enrichment
        this.strategy.enhance(enrichedData.strategies);
        this.metrics.update(enrichedData.metrics);
    }
    
    toJSON() {
        return {
            outcomeId: this.id,
            outcomeType: this.type,
            outcomeCategory: this.category,
            outcomeName: this.name,
            outcomeValue: this.value,
            outcomeStatus: this.status,
            strategy: this.strategy.toJSON(),
            metrics: this.metrics.toJSON()
        };
    }
}
```

### Key Changes
- **Domain Models**: `Outcome`, `SessionOutcomes` with business logic
- **Knowledge Base Service**: Injected, not loaded directly
- **Rich Domain Objects**: Outcomes have behavior, not just data
- **Metrics Collection**: Built-in performance tracking
- **Async Processing**: Better performance with async/await

---

## Integration Benefits

### 1. **Loose Coupling**
- Services don't know about each other's implementation
- Easy to swap providers (e.g., switch from OpenAI to Anthropic)
- No circular dependencies

### 2. **Testability**
```javascript
// Easy to test with mocks
const mockAIService = {
    generateInsights: jest.fn().mockResolvedValue(mockInsights)
};

const insightsGenerator = new InsightsGenerator({
    aiService: mockAIService,
    // ... other mocks
});
```

### 3. **Scalability**
- Services can be deployed separately
- Horizontal scaling ready
- Queue-based processing possible

### 4. **Observability**
- Built-in logging with context
- Metrics collection
- Event emission for monitoring

### 5. **Error Handling**
- Circuit breakers prevent cascading failures
- Retry logic for transient failures
- Graceful degradation

---

## Migration Path

### Phase 1: Create New Services (Day 1)
1. Implement new service interfaces
2. Create adapters for existing code
3. Set up dependency injection

### Phase 2: Gradual Migration (Days 2-3)
1. Run old and new systems in parallel
2. Compare outputs for validation
3. Route traffic gradually to new system

### Phase 3: Cleanup (Day 4)
1. Remove old code
2. Optimize new implementations
3. Update documentation

---

## Sample Usage After Refactoring

```javascript
// Old way
const generator = new ComprehensiveInsightsGenerator();
const insights = await generator.generateComprehensiveInsights(recordingData, folderPath);

// New way
const insightsGenerator = container.get('insightsGenerator');
const insights = await insightsGenerator.generateInsights({
    recording,  // Domain object
    session,    // Domain object
    transcript  // Parsed transcript
});
```

The refactored code is:
- ✅ More maintainable
- ✅ More testable
- ✅ More scalable
- ✅ More reliable
- ✅ Following SOLID principles 