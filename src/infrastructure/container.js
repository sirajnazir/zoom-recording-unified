const { NameStandardizationService } = require('../core/services/NameStandardizationService');
const { WeekInferenceService } = require('../core/services/WeekInferenceService');
const { SessionAnalyzerService } = require('../core/services/SessionAnalyzerService');
const { ZoomService } = require('./services/ZoomService');
const { GoogleDriveService } = require('./google/google-drive-service');
const { GoogleSheetsService } = require('./google/GoogleSheetsService');
const AIPoweredInsightsGenerator = require('./ai/ai-powered-insights-generator');
const { RecordingProcessor } = require('../application/processors/RecordingProcessor');
const { TranscriptAnalyzer } = require('../application/analyzers/TranscriptAnalyzer');
const { ParticipantAnalyzer } = require('../application/analyzers/ParticipantAnalyzer');
const { InsightsGenerator } = require('../application/processors/InsightsGenerator');
const { OutcomesProcessor } = require('../application/processors/OutcomesProcessor');
const { ZoomWebhookHandler } = require('../api/webhooks/zoom-webhook-handler');
const { RecordingService } = require('../application/services/RecordingService');
const { KnowledgeBaseService } = require('./services/KnowledgeBaseService');
const config = require('../shared/config/smart-config');
const { Logger } = require('../shared/logging/logger');

/**
 * Dependency injection container
 */
class Container {
    constructor() {
        this.services = new Map();
        this.singletons = new Map();
    }

    /**
     * Register a service
     */
    register(name, factory, options = {}) {
        this.services.set(name, {
            factory,
            singleton: options.singleton !== false
        });
    }

    /**
     * Get a service instance
     */
    get(name) {
        const service = this.services.get(name);
        
        if (!service) {
            throw new Error(`Service not found: ${name}`);
        }

        if (service.singleton) {
            if (!this.singletons.has(name)) {
                this.singletons.set(name, service.factory(this));
            }
            return this.singletons.get(name);
        }

        return service.factory(this);
    }

    /**
     * Dispose of resources
     */
    async dispose() {
        // Dispose of services that implement dispose method
        for (const [name, instance] of this.singletons) {
            if (instance && typeof instance.dispose === 'function') {
                try {
                    await instance.dispose();
                    console.debug(`Disposed service: ${name}`);
                } catch (error) {
                    console.error(`Error disposing service: ${name}`, error);
                }
            }
        }
        
        this.singletons.clear();
        this.services.clear();
    }
}

/**
 * Create and configure the container
 */
async function createContainer() {
    const container = new Container();
    
    // Create logger instance
    const logger = new Logger();
    
    // Configuration
    container.register('config', () => config);
    container.register('logger', () => logger);
    
    // Create cache instance
    const cache = {
        async get(key) { return null; },
        async set(key, value, ttl) { return true; }
    };
    container.register('cache', () => cache);
    
    // Knowledge base service
    const knowledgeBaseService = new KnowledgeBaseService({ config, logger, cache });
    await knowledgeBaseService.initialize();
    container.register('knowledgeBaseService', () => knowledgeBaseService);
    container.register('knowledgeBase', () => knowledgeBaseService); // Alias for backward compatibility
    
    // Core services
    container.register('nameStandardizationService', (c) => 
        new NameStandardizationService(c.get('knowledgeBaseService'))
    );
    
    container.register('weekInferenceService', () => 
        new WeekInferenceService()
    );
    
    container.register('transcriptAnalyzer', () => 
        new TranscriptAnalyzer()
    );
    
    container.register('participantAnalyzer', () => 
        new ParticipantAnalyzer()
    );
    
    container.register('sessionAnalyzerService', (c) => 
        new SessionAnalyzerService({
            nameStandardizationService: c.get('nameStandardizationService'),
            weekInferenceService: c.get('weekInferenceService'),
            transcriptAnalyzer: c.get('transcriptAnalyzer'),
            participantAnalyzer: c.get('participantAnalyzer')
        })
    );
    
    // Infrastructure services
    container.register('zoomService', () => 
        new ZoomService(config.zoom, logger.child('ZoomService'))
    );
    
    container.register('googleDriveService', () => 
        new GoogleDriveService(config.google, logger.child('GoogleDriveService'))
    );
    
    container.register('googleSheetsService', () => 
        new GoogleSheetsService(config.google, logger.child('GoogleSheetsService'))
    );
    
    container.register('aiPoweredInsightsGenerator', (c) => 
        new AIPoweredInsightsGenerator({
            config: c.get('config'),
            logger: c.get('logger').child('AIPoweredInsightsGenerator')
        })
    );
    
    // Application services
    container.register('insightsGenerator', (c) => 
        new InsightsGenerator({
            aiPoweredInsightsGenerator: c.get('aiPoweredInsightsGenerator'),
            transcriptAnalyzer: c.get('transcriptAnalyzer')
        })
    );
    
    container.register('outcomesProcessor', (c) => 
        new OutcomesProcessor({
            aiPoweredInsightsGenerator: c.get('aiPoweredInsightsGenerator')
        })
    );
    
    container.register('recordingProcessor', (c) => 
        new RecordingProcessor({
            sessionAnalyzer: c.get('sessionAnalyzerService'),
            zoomService: c.get('zoomService'),
            googleDriveService: c.get('googleDriveService'),
            googleSheetsService: c.get('googleSheetsService'),
            insightsGenerator: c.get('insightsGenerator'),
            outcomesProcessor: c.get('outcomesProcessor'),
            config: c.get('config'),
            logger: c.get('logger').child('RecordingProcessor')
        })
    );
    
    container.register('recordingService', (c) => 
        new RecordingService({
            recordingProcessor: c.get('recordingProcessor'),
            googleSheetsService: c.get('googleSheetsService'),
            logger: c.get('logger').child('RecordingService')
        })
    );
    
    // API handlers
    container.register('webhookHandler', (c) => 
        new ZoomWebhookHandler(c.get('recordingProcessor'))
    );
    
    return container;
}

module.exports = { Container, createContainer }; 