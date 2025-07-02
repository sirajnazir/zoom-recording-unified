const { Logger } = require('../../shared/Logger');
const { Cache } = require('../../shared/Cache');
const { EventBus } = require('../../shared/EventBus');
const { MetricsCollector } = require('../../shared/MetricsCollector');

/**
 * Smart Services Initializer
 * Ensures all services are properly initialized and wired together
 * Provides graceful fallbacks for missing services
 */
class SmartServicesInitializer {
    constructor(config) {
        this.config = config;
        this.logger = new Logger('SmartServicesInitializer');
        this.services = {};
    }

    /**
     * Initialize all smart services with proper dependencies
     */
    async initializeServices() {
        this.logger.info('Initializing smart services...');
        
        try {
            // Step 1: Initialize shared dependencies
            const sharedDeps = await this._initializeSharedDependencies();
            
            // Step 2: Initialize smart services
            const smartServices = await this._initializeSmartServices(sharedDeps);
            
            // Step 3: Initialize Google services with smart dependencies
            const googleServices = await this._initializeGoogleServices({
                ...sharedDeps,
                ...smartServices
            });
            
            // Step 4: Wire up circular dependencies
            this._wireCircularDependencies(smartServices);
            
            // Step 5: Validate all services
            await this._validateServices();
            
            this.services = {
                ...sharedDeps,
                ...smartServices,
                ...googleServices
            };
            
            this.logger.info('All services initialized successfully');
            return this.services;
            
        } catch (error) {
            this.logger.error('Service initialization failed', error);
            throw error;
        }
    }

    /**
     * Initialize shared dependencies
     */
    async _initializeSharedDependencies() {
        const deps = {};
        
        // Event Bus
        deps.eventBus = new EventBus();
        this.logger.debug('EventBus initialized');
        
        // Cache
        deps.cache = new Cache({
            type: this.config.cache?.type || 'memory',
            redis: this.config.cache?.redis
        });
        this.logger.debug('Cache initialized');
        
        // Metrics Collector
        deps.metricsCollector = new MetricsCollector({
            enabled: this.config.monitoring?.metrics?.enabled
        });
        this.logger.debug('MetricsCollector initialized');
        
        // Logger factory
        deps.loggerFactory = (name) => new Logger(name);
        
        return deps;
    }

    /**
     * Initialize smart services
     */
    async _initializeSmartServices(sharedDeps) {
        const services = {};
        
        // Name Standardizer
        try {
            const { NameStandardizer } = require('../services/NameStandardizer');
            services.nameStandardizer = new NameStandardizer({
                config: this.config,
                logger: sharedDeps.loggerFactory('NameStandardizer'),
                cache: sharedDeps.cache,
                knowledgeBase: await this._loadKnowledgeBase()
            });
            this.logger.debug('NameStandardizer initialized');
        } catch (error) {
            this.logger.warn('NameStandardizer not available, using fallback', error);
            services.nameStandardizer = this._createFallbackNameStandardizer();
        }
        
        // Smart Week Inferencer
        try {
            const { SmartWeekInferencer } = require('../services/SmartWeekInferencer');
            services.weekInferencer = new SmartWeekInferencer({
                cache: sharedDeps.cache,
                logger: sharedDeps.loggerFactory('SmartWeekInferencer'),
                config: this.config
            });
            this.logger.debug('SmartWeekInferencer initialized');
        } catch (error) {
            this.logger.warn('SmartWeekInferencer not available, using fallback', error);
            services.weekInferencer = this._createFallbackWeekInferencer();
        }
        
        // File Content Analyzer
        try {
            const { FileContentAnalyzer } = require('../services/FileContentAnalyzer');
            services.fileContentAnalyzer = new FileContentAnalyzer({
                logger: sharedDeps.loggerFactory('FileContentAnalyzer')
            });
            this.logger.debug('FileContentAnalyzer initialized');
        } catch (error) {
            this.logger.warn('FileContentAnalyzer not available, using fallback', error);
            services.fileContentAnalyzer = this._createFallbackFileAnalyzer();
        }
        
        // Enhanced Metadata Extractor
        try {
            const { EnhancedMetadataExtractor } = require('../services/EnhancedMetadataExtractor');
            services.metadataExtractor = new EnhancedMetadataExtractor({
                cache: sharedDeps.cache,
                nameStandardizer: services.nameStandardizer,
                fileContentAnalyzer: services.fileContentAnalyzer,
                knowledgeBase: services.nameStandardizer.knowledgeBase,
                logger: sharedDeps.loggerFactory('EnhancedMetadataExtractor')
            });
            this.logger.debug('EnhancedMetadataExtractor initialized');
        } catch (error) {
            this.logger.warn('EnhancedMetadataExtractor not available, using fallback', error);
            services.metadataExtractor = this._createFallbackMetadataExtractor();
        }
        
        // Transcription Analyzer
        try {
            const { TranscriptionAnalyzer } = require('../services/TranscriptionAnalyzer');
            services.transcriptionAnalyzer = new TranscriptionAnalyzer({
                logger: sharedDeps.loggerFactory('TranscriptionAnalyzer'),
                cache: sharedDeps.cache,
                config: this.config,
                openaiApiKey: this.config.ai?.openai?.apiKey
            });
            this.logger.debug('TranscriptionAnalyzer initialized');
        } catch (error) {
            this.logger.warn('TranscriptionAnalyzer not available, using fallback', error);
            services.transcriptionAnalyzer = this._createFallbackTranscriptionAnalyzer();
        }
        
        return services;
    }

    /**
     * Initialize Google services with smart dependencies
     */
    async _initializeGoogleServices(dependencies) {
        const services = {};
        
        // Google Drive Service
        try {
            const { GoogleDriveService } = require('../services/GoogleDriveService');
            services.driveService = new GoogleDriveService({
                config: this.config,
                logger: dependencies.loggerFactory('GoogleDriveService'),
                cache: dependencies.cache,
                eventBus: dependencies.eventBus
            });
            await services.driveService.initialize();
            this.logger.debug('GoogleDriveService initialized');
        } catch (error) {
            this.logger.error('GoogleDriveService initialization failed', error);
            throw new Error(`Critical: Google Drive service required - ${error.message}`);
        }
        
        // Google Sheets Service (Dual Tab)
        try {
            const { DualTabGoogleSheetsService } = require('../services/DualTabGoogleSheetsService');
            services.sheetsService = new DualTabGoogleSheetsService({
                config: this.config,
                eventBus: dependencies.eventBus,
                logger: dependencies.loggerFactory('DualTabGoogleSheetsService'),
                cache: dependencies.cache,
                metricsCollector: dependencies.metricsCollector,
                nameStandardizer: dependencies.nameStandardizer,
                weekInferencer: dependencies.weekInferencer,
                metadataExtractor: dependencies.metadataExtractor,
                transcriptionAnalyzer: dependencies.transcriptionAnalyzer
            });
            this.logger.debug('DualTabGoogleSheetsService initialized');
        } catch (error) {
            this.logger.error('DualTabGoogleSheetsService initialization failed', error);
            throw new Error(`Critical: Google Sheets service required - ${error.message}`);
        }
        
        return services;
    }

    /**
     * Wire circular dependencies
     */
    _wireCircularDependencies(services) {
        // MetadataExtractor needs WeekInferencer
        if (services.metadataExtractor && services.weekInferencer) {
            if (typeof services.metadataExtractor.setWeekInferencer === 'function') {
                services.metadataExtractor.setWeekInferencer(services.weekInferencer);
                this.logger.debug('Wired WeekInferencer to MetadataExtractor');
            }
        }
    }

    /**
     * Validate all services are working
     */
    async _validateServices() {
        const validations = [];
        
        // Test each service
        for (const [name, service] of Object.entries(this.services)) {
            if (service && typeof service === 'object') {
                try {
                    // Check for common methods
                    if (typeof service.getHealthStatus === 'function') {
                        const health = await service.getHealthStatus();
                        validations.push({ name, healthy: health.healthy });
                    } else {
                        // Service exists but no health check
                        validations.push({ name, healthy: true, note: 'No health check' });
                    }
                } catch (error) {
                    validations.push({ name, healthy: false, error: error.message });
                }
            }
        }
        
        // Log validation results
        const unhealthy = validations.filter(v => !v.healthy);
        if (unhealthy.length > 0) {
            this.logger.warn('Some services are unhealthy:', unhealthy);
        } else {
            this.logger.info('All services validated successfully');
        }
        
        return validations;
    }

    /**
     * Load knowledge base
     */
    async _loadKnowledgeBase() {
        // Try to load from cache or config
        const cached = await this.services.cache?.get('knowledge-base');
        if (cached) return cached;
        
        // Default knowledge base
        const knowledgeBase = {
            coaches: new Map([
                ['jenny', { standard: 'Jenny', full: 'Jenny Duan', confidence: 100 }],
                ['mike', { standard: 'Mike', full: 'Mike Chen', confidence: 100 }],
                ['sarah', { standard: 'Sarah', full: 'Sarah Johnson', confidence: 100 }],
                ['rishi', { standard: 'Rishi', full: 'Rishi Patel', confidence: 100 }],
                ['jamie', { standard: 'Jamie', full: 'Jamie Wong', confidence: 100 }]
            ]),
            students: new Map([
                ['aarav', { standard: 'Aarav', confidence: 95 }],
                ['zainab', { standard: 'Zainab', confidence: 95 }],
                ['ethan', { standard: 'Ethan', confidence: 95 }],
                ['sophia', { standard: 'Sophia', confidence: 95 }],
                ['lucas', { standard: 'Lucas', confidence: 95 }]
            ]),
            patterns: {
                sessionTypes: [
                    { pattern: /game\s*plan/i, type: 'GamePlan', confidence: 95 },
                    { pattern: /coaching/i, type: 'Coaching', confidence: 90 },
                    { pattern: /check[\s-]?in/i, type: 'CheckIn', confidence: 85 },
                    { pattern: /office\s*hours?/i, type: 'OfficeHours', confidence: 90 }
                ]
            }
        };
        
        return knowledgeBase;
    }

    /**
     * Fallback implementations
     */
    _createFallbackNameStandardizer() {
        return {
            standardizeName: async (input) => ({
                standardizedName: `MISC_${input.replace(/[^\w]/g, '_')}_${new Date().toISOString().split('T')[0]}`,
                confidence: 30,
                method: 'fallback',
                sessionType: 'MISC',
                coach: null,
                student: null,
                week: null,
                date: new Date().toISOString().split('T')[0],
                isFamilyAccount: false
            })
        };
    }

    _createFallbackWeekInferencer() {
        return {
            inferWeek: async (data) => ({
                weekNumber: 0,
                confidence: 0,
                method: 'fallback',
                source: 'none'
            })
        };
    }

    _createFallbackFileAnalyzer() {
        return {
            analyzeFile: async (content) => ({
                hasContent: !!content,
                type: 'unknown',
                metadata: {}
            })
        };
    }

    _createFallbackMetadataExtractor() {
        return {
            extractMetadata: async (recording) => ({
                coach: 'Unknown',
                student: 'Unknown',
                sessionType: 'MISC',
                hostEmail: recording.host_email || '',
                topic: recording.topic || '',
                participants: [],
                confidence: {
                    coach: 0,
                    student: 0,
                    sessionType: 0
                }
            })
        };
    }

    _createFallbackTranscriptionAnalyzer() {
        return {
            analyzeTranscript: async (transcript) => ({
                content: transcript?.substring(0, 500) || '',
                quality: 'not-analyzed',
                speakers: [],
                speakerCount: 0,
                topics: [],
                engagementScore: 0,
                summary: 'Analysis not available'
            })
        };
    }

    /**
     * Get initialization status
     */
    getStatus() {
        const status = {
            initialized: Object.keys(this.services).length > 0,
            services: {}
        };
        
        Object.entries(this.services).forEach(([name, service]) => {
            status.services[name] = {
                available: !!service,
                type: service?.constructor?.name || 'unknown',
                isFallback: service?.method === 'fallback'
            };
        });
        
        return status;
    }

    /**
     * Get a specific service
     */
    getService(name) {
        return this.services[name];
    }

    /**
     * Get all services
     */
    getAllServices() {
        return this.services;
    }
}

module.exports = { SmartServicesInitializer }; 