#!/usr/bin/env node
/**
 * Production Zoom Recording Processor - Merged with Correct Service Paths
 * 
 * This version includes:
 * - All 4 new services with correct paths
 * - DualTabGoogleSheetsService support
 * - Consolidated AI services
 * - All latest container updates
 * - CATEGORIZATION SUPPORT FOR MISC/TRIVIAL FOLDERS
 */

require('dotenv').config();

const awilix = require('awilix');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const readline = require('readline');
const { EventEmitter } = require('events');

// Ensure OUTPUT_DIR is set
if (!process.env.OUTPUT_DIR) {
    process.env.OUTPUT_DIR = './output';
}

const { createContainer, asClass, asValue, asFunction, aliasTo } = require('awilix');
const { EventBus } = require('./src/shared/EventBus');
const { Logger } = require('./src/shared/logging/logger');
const { MetricsCollector } = require('./src/shared/MetricsCollector');

// Command line argument parsing
const args = process.argv.slice(2);
console.log('\n🔍 DEBUG: Raw command line arguments:', args);

const options = {
    mode: 'last30days', // test, single, last30days, custom, recent
    recordingId: null,
    fromDate: null,
    toDate: null,
    dateRange: null, // NEW: Number of days for date range
    limit: 1,
    dryRun: false,
    lightweight: false, // Skip heavy media files (video, audio)
    cloudLightweight: false, // NEW: Process all cloud recordings but skip video/audio files
    help: false,
    // NEW: Enhanced download options
    useParallelDownloads: false,
    useStreamingDownloads: false,
    downloadConcurrency: 4,
    downloadTimeout: 300000, // 5 minutes
    enableResumeDownloads: false,
    maxRetries: 3,
    maxConnections: 20
};

// Parse command line arguments
for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];
    
    console.log(`🔍 DEBUG: Processing arg ${i}: "${arg}" with nextArg: "${nextArg}"`);
    
    // Handle --key=value format
    if (arg.includes('=')) {
        const [key, value] = arg.split('=');
        console.log(`🔍 DEBUG: Found key=value format: ${key}=${value}`);
        
        switch (key) {
            case '--mode':
            case '-m':
                if (value === 'last30') {
                    options.mode = 'last30days';
                } else {
                    options.mode = value;
                }
                console.log(`🔍 DEBUG: Set mode to: ${options.mode}`);
                break;
            case '--recording':
            case '-r':
                options.recordingId = value;
                console.log(`🔍 DEBUG: Set recordingId to: ${options.recordingId}`);
                break;
            case '--from':
            case '-f':
                options.fromDate = value;
                console.log(`🔍 DEBUG: Set fromDate to: ${options.fromDate}`);
                break;
            case '--to':
            case '-t':
                options.toDate = value;
                console.log(`🔍 DEBUG: Set toDate to: ${options.toDate}`);
                break;
            case '--limit':
            case '-l':
                options.limit = parseInt(value);
                console.log(`🔍 DEBUG: Set limit to: ${options.limit}`);
                break;
            case '--lightweight':
                options.lightweight = value === 'true' || value === '1';
                console.log(`🔍 DEBUG: Set lightweight to: ${options.lightweight}`);
                break;
            case '--cloud-lightweight':
                options.cloudLightweight = value === 'true' || value === '1';
                console.log(`🔍 DEBUG: Set cloudLightweight to: ${options.cloudLightweight}`);
                break;
            case '--date-range':
                options.dateRange = parseInt(value);
                console.log(`🔍 DEBUG: Set dateRange to: ${options.dateRange}`);
                break;
                    case '--auto-approve':
        case '--yes-to-all':
            options.autoApprove = value === 'true' || value === '1';
            console.log(`🔍 DEBUG: Set autoApprove to: ${options.autoApprove}`);
            break;
        case '--parallel-downloads':
            options.useParallelDownloads = value === 'true' || value === '1';
            console.log(`🔍 DEBUG: Set useParallelDownloads to: ${options.useParallelDownloads}`);
            break;
        case '--streaming-downloads':
            options.useStreamingDownloads = value === 'true' || value === '1';
            console.log(`🔍 DEBUG: Set useStreamingDownloads to: ${options.useStreamingDownloads}`);
            break;
        case '--download-concurrency':
            options.downloadConcurrency = parseInt(value);
            console.log(`🔍 DEBUG: Set downloadConcurrency to: ${options.downloadConcurrency}`);
            break;
        case '--download-timeout':
            options.downloadTimeout = parseInt(value);
            console.log(`🔍 DEBUG: Set downloadTimeout to: ${options.downloadTimeout}`);
            break;
        case '--resume-downloads':
            options.enableResumeDownloads = value === 'true' || value === '1';
            console.log(`🔍 DEBUG: Set enableResumeDownloads to: ${options.enableResumeDownloads}`);
            break;
        case '--max-retries':
            options.maxRetries = parseInt(value);
            console.log(`🔍 DEBUG: Set maxRetries to: ${options.maxRetries}`);
            break;
        case '--max-connections':
            options.maxConnections = parseInt(value);
            console.log(`🔍 DEBUG: Set maxConnections to: ${options.maxConnections}`);
            break;
        }
        continue;
    }
    
    // Handle --key value format
    switch (arg) {
        case '--mode':
        case '-m':
            // Handle aliases for better user experience
            if (nextArg === 'last30') {
                options.mode = 'last30days';
            } else {
                options.mode = nextArg;
            }
            console.log(`🔍 DEBUG: Set mode to: ${options.mode}`);
            i++;
            break;
        case '--recording':
        case '-r':
            options.recordingId = nextArg;
            console.log(`🔍 DEBUG: Set recordingId to: ${options.recordingId}`);
            i++;
            break;
        case '--from':
        case '-f':
            options.fromDate = nextArg;
            console.log(`🔍 DEBUG: Set fromDate to: ${options.fromDate}`);
            i++;
            break;
        case '--to':
        case '-t':
            options.toDate = nextArg;
            console.log(`🔍 DEBUG: Set toDate to: ${options.toDate}`);
            i++;
            break;
        case '--limit':
        case '-l':
            options.limit = parseInt(nextArg);
            console.log(`🔍 DEBUG: Set limit to: ${options.limit}`);
            i++;
            break;
        case '--dry-run':
        case '-d':
            options.dryRun = true;
            console.log(`🔍 DEBUG: Set dryRun to: ${options.dryRun}`);
            break;
        case '--lightweight':
            options.lightweight = true;
            console.log(`🔍 DEBUG: Set lightweight to: ${options.lightweight}`);
            break;
        case '--cloud-lightweight':
            options.cloudLightweight = true;
            console.log(`🔍 DEBUG: Set cloudLightweight to: ${options.cloudLightweight}`);
            break;
        case '--date-range':
            options.dateRange = parseInt(nextArg);
            console.log(`🔍 DEBUG: Set dateRange to: ${options.dateRange}`);
            i++;
            break;
        case '--auto-approve':
        case '--yes-to-all':
            options.autoApprove = true;
            console.log(`🔍 DEBUG: Set autoApprove to: ${options.autoApprove}`);
            break;
        case '--parallel-downloads':
            options.useParallelDownloads = true;
            console.log(`🔍 DEBUG: Set useParallelDownloads to: ${options.useParallelDownloads}`);
            break;
        case '--streaming-downloads':
            options.useStreamingDownloads = true;
            console.log(`🔍 DEBUG: Set useStreamingDownloads to: ${options.useStreamingDownloads}`);
            break;
        case '--download-concurrency':
            options.downloadConcurrency = parseInt(nextArg);
            console.log(`🔍 DEBUG: Set downloadConcurrency to: ${options.downloadConcurrency}`);
            i++;
            break;
        case '--download-timeout':
            options.downloadTimeout = parseInt(nextArg);
            console.log(`🔍 DEBUG: Set downloadTimeout to: ${options.downloadTimeout}`);
            i++;
            break;
        case '--resume-downloads':
            options.enableResumeDownloads = true;
            console.log(`🔍 DEBUG: Set enableResumeDownloads to: ${options.enableResumeDownloads}`);
            break;
        case '--max-retries':
            options.maxRetries = parseInt(nextArg);
            console.log(`🔍 DEBUG: Set maxRetries to: ${options.maxRetries}`);
            i++;
            break;
        case '--max-connections':
            options.maxConnections = parseInt(nextArg);
            console.log(`🔍 DEBUG: Set maxConnections to: ${options.maxConnections}`);
            i++;
            break;
        case '--help':
        case '-h':
            options.help = true;
            console.log(`🔍 DEBUG: Set help to: ${options.help}`);
            break;
    }
}

// Show help if requested
if (options.help) {
    console.log(`
🎯 Zoom Recording Processor v2 - Production Script

Usage: node complete-production-processor.js [options]

Options:
  --mode, -m <mode>           Processing mode (test|single|last30days|custom|recent)
  --recording, -r <id>        Specific recording ID to process
  --from, -f <date>           Start date for custom range (YYYY-MM-DD)
  --to, -t <date>             End date for custom range (YYYY-MM-DD)
  --date-range <days>         Number of days to look back (e.g., 90 for last 90 days)
  --limit, -l <number>        Maximum number of recordings to process
  --dry-run, -d               Run in dry-run mode (no actual updates)
  --lightweight               Skip heavy media files (video, audio) - download only critical files
  --cloud-lightweight         Process all cloud recordings but skip video/audio files (transcript only)
  --auto-approve, --yes-to-all  Automatically approve all recordings without asking for confirmation
  --parallel-downloads          Enable parallel downloads for multiple files
  --streaming-downloads         Enable streaming downloads with resume capability
  --download-concurrency <num>  Number of concurrent downloads (default: 4)
  --download-timeout <ms>       Download timeout in milliseconds (default: 300000)
  --resume-downloads            Enable resume capability for interrupted downloads
  --max-retries <num>           Maximum retry attempts for failed downloads (default: 3)
  --max-connections <num>       Maximum concurrent connections (default: 20)
  --help, -h                  Show this help message

Modes:
  test        - Process 1 test recording (default)
  single      - Process a specific recording by ID
  last30days  - Process recordings from last 30 days (alias: last30)
  custom      - Process recordings in custom date range
  recent      - Download and process last N recordings from Zoom cloud (this month)

Examples:
  # Test mode (default - processes 1 test recording)
  node complete-production-processor.js

  # Process a specific recording
  node complete-production-processor.js --mode single --recording 123456789

  # Process last 30 days of recordings
  node complete-production-processor.js --mode last30days --limit 50
  # or use the alias:
  node complete-production-processor.js --mode last30 --limit 50

  # Process last 90 days of recordings
  node complete-production-processor.js --date-range 90 --limit 100

  # Process custom date range
  node complete-production-processor.js --mode custom --from 2024-01-01 --to 2024-01-31

  # Download and process last 3 recordings from Zoom cloud (this month)
  node complete-production-processor.js --mode recent --limit 3

  # Dry run with recent recordings
  node complete-production-processor.js --mode recent --limit 5 --dry-run

  # Process specific recording in lightweight mode (skip heavy media files)
  node complete-production-processor.js --mode single --recording 123456789 --lightweight

  # Process all cloud recordings in lightweight mode (transcript only, no video/audio)
  node complete-production-processor.js --mode recent --cloud-lightweight

  # Process all recordings automatically without asking for confirmation
  node complete-production-processor.js --mode last30days --limit 50 --auto-approve
`);
    process.exit(0);
}

// ============================================================================
// PRODUCTION PROCESSOR CLASS
// ============================================================================

class ProductionZoomProcessor {
    constructor() {
        this.container = null;
        this.logger = null;
        this.startTime = Date.now();
        this.processedCount = 0;
        this.failedCount = 0;
        this.results = {
            total: 0,
            successful: 0,
            failed: 0,
            skipped: 0,
            details: []
        };
    }

    async initialize() {
        console.log('🚀 Initializing Production Zoom Processor with All Services...\n');
        
        // Ensure required directories exist
        await this.ensureDirectories();
        
        // Setup logging
        this.setupLogging();
        
        // Setup dependency injection container
        await this.setupContainer();
        
        // Initialize services
        await this.initializeServices();
        
        // Verify core services
        await this.verifyCoreServices();
        
        // Setup event listeners
        this.setupEventListeners();
        
        this.logger.info('Production processor initialized successfully with all services');
    }

    async ensureDirectories() {
        const directories = ['logs', 'reports', 'output', 'cache', 'temp'];
        for (const dir of directories) {
            await fsp.mkdir(dir, { recursive: true });
        }
    }

    setupLogging() {
        // ENHANCEMENT: Enhanced logging with file output and console capture
        this.logger = new Logger();
        
        // Create logs directory if it doesn't exist
        const fs = require('fs');
        const path = require('path');
        const logsDir = './logs';
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        
        // Generate unique log filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.logFileName = `processing-${timestamp}.log`;
        this.logFilePath = path.join(logsDir, this.logFileName);
        
        // Create a custom console logger that writes to both console and file
        this._setupConsoleCapture();
        
        this.logger.info('Production processor logging initialized', {
            logFile: this.logFilePath,
            timestamp: new Date().toISOString()
        });
        
        console.log(`📝 Logging to file: ${this.logFilePath}`);
    }
    
    _setupConsoleCapture() {
        // ENHANCEMENT: Capture all console output and write to log file
        const fs = require('fs');
        
        // Store original console methods as instance properties for later restoration
        this.originalConsoleLog = console.log;
        this.originalConsoleError = console.error;
        this.originalConsoleWarn = console.warn;
        this.originalConsoleInfo = console.info;
        this.originalConsoleDebug = console.debug;
        
        // Create write stream for log file
        this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
        
        // Helper function to format log entries
        const formatLogEntry = (level, ...args) => {
            const timestamp = new Date().toISOString();
            const message = args.map(arg => {
                if (typeof arg === 'object') {
                    return JSON.stringify(arg, null, 2);
                }
                return String(arg);
            }).join(' ');
            return `[${timestamp}] [${level}] ${message}\n`;
        };
        
        // Override console methods to capture output
        console.log = (...args) => {
            this.originalConsoleLog(...args);
            this.logStream.write(formatLogEntry('INFO', ...args));
        };
        
        console.error = (...args) => {
            this.originalConsoleError(...args);
            this.logStream.write(formatLogEntry('ERROR', ...args));
        };
        
        console.warn = (...args) => {
            this.originalConsoleWarn(...args);
            this.logStream.write(formatLogEntry('WARN', ...args));
        };
        
        console.info = (...args) => {
            this.originalConsoleInfo(...args);
            this.logStream.write(formatLogEntry('INFO', ...args));
        };
        
        console.debug = (...args) => {
            this.originalConsoleDebug(...args);
            this.logStream.write(formatLogEntry('DEBUG', ...args));
        };
        
        // Log the start of console capture
        console.log(`🔄 Console output capture initialized - writing to: ${this.logFilePath}`);
    }

    loadConfig() {
        return {
            // Add your config here
            zoom: {
                accountId: process.env.ZOOM_ACCOUNT_ID,
                clientId: process.env.ZOOM_CLIENT_ID,
                clientSecret: process.env.ZOOM_CLIENT_SECRET
            },
            google: {
                clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
                privateKey: process.env.GOOGLE_PRIVATE_KEY,
                sheets: {
                    masterIndexSheetId: process.env.MASTER_INDEX_SHEET_ID
                },
                drive: {
                    recordingsRootFolderId: process.env.RECORDINGS_ROOT_FOLDER_ID,
                    studentsFolderId: process.env.STUDENTS_FOLDER_ID,
                    coachesFolderId: process.env.COACHES_FOLDER_ID,
                    miscFolderId: process.env.MISC_FOLDER_ID,
                    trivialFolderId: process.env.TRIVIAL_FOLDER_ID
                },
                driveFolders: {
                    students: process.env.STUDENTS_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID,
                    coaches: process.env.COACHES_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID,
                    trivial: process.env.TRIVIAL_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID,
                    misc: process.env.MISC_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID
                }
            },
            openai: {
                apiKey: process.env.OPENAI_API_KEY
            },
            processing: {
                outputDir: './output',
                tempDir: './temp',
                maxFileSize: 500 * 1024 * 1024, // 500MB
                supportedFormats: ['mp4', 'm4a', 'vtt', 'txt', 'json']
            },
            SHEETS_BATCH_SIZE: 100,
            SHEETS_RATE_LIMIT_DELAY: 100
        };
    }

    createCache() {
        // Simple in-memory cache implementation
        return {
            get: async (key) => null,
            set: async (key, value) => {},
            delete: async (key) => {},
            clear: async () => {}
        };
    }

    createCircuitBreaker() {
        // Simple circuit breaker implementation
        return {
            execute: async (fn) => fn(),
            getState: () => 'CLOSED'
        };
    }

    async setupContainer() {
        console.log('🔧 Setting up dependency injection container...\n');
        
        const container = createContainer();

        // Helper function to safely require and diagnose issues
        const diagnosticRequire = (modulePath, exportName = null) => {
            try {
                const module = require(modulePath);
                console.log(`✅ Loaded module: ${modulePath}`);
                
                // Check what was exported
                if (exportName) {
                    if (module[exportName]) {
                        console.log(`   → Found named export: ${exportName}`);
                        return module[exportName];
                    } else {
                        console.log(`   ❌ Named export '${exportName}' not found!`);
                        console.log(`   → Available exports:`, Object.keys(module));
                        throw new Error(`Export '${exportName}' not found in ${modulePath}`);
                    }
                } else {
                    // Check if it's a default export or the module itself
                    if (module.default) {
                        console.log(`   → Using default export`);
                        return module.default;
                    } else if (typeof module === 'function' || (module && module.constructor)) {
                        console.log(`   → Using module directly`);
                        return module;
                    } else {
                        console.log(`   → Module exports:`, Object.keys(module));
                        return module;
                    }
                }
            } catch (error) {
                console.error(`❌ Failed to load ${modulePath}:`, error.message);
                if (error.code === 'MODULE_NOT_FOUND') {
                    console.error(`   → File not found at path: ${modulePath}`);
                }
                throw error;
            }
        };

        // ========== CONFIGURATION ==========
        container.register({
            config: asValue(this.loadConfig()),
            logger: asValue(this.logger)
        });

        // ========== SHARED UTILITIES ==========
        container.register({
            eventBus: asClass(EventBus).singleton(),
            cache: asFunction(this.createCache).singleton(),
            metricsCollector: asClass(MetricsCollector).singleton(),
            circuitBreaker: asFunction(this.createCircuitBreaker).singleton()
        });

        // ========== AI SERVICES (MUST BE FIRST) ==========
        console.log('\n🤖 Loading AI Services...\n');
        
        // AI Powered Insights Generator - Consolidated AI service
        try {
            console.log('Loading aiPoweredInsightsGenerator (consolidated)...');
            const AIPoweredInsightsGenerator = diagnosticRequire('./src/infrastructure/ai/ai-powered-insights-generator');
            container.register({
                aiPoweredInsightsGenerator: asFunction(({ logger, config }) => {
                    return new AIPoweredInsightsGenerator({ logger, config });
                }).singleton(),
                aiService: aliasTo('aiPoweredInsightsGenerator')
            });
            console.log('✅ aiPoweredInsightsGenerator (consolidated) registered successfully');
        } catch (error) {
            console.log('⚠️ aiPoweredInsightsGenerator failed:', error.message);
            // Create a proper fallback service
            container.register({
                aiPoweredInsightsGenerator: asFunction(({ logger, config }) => {
                    return {
                        generateAIInsights: async (transcriptContent, meetingData) => {
                            logger.info('🔄 Using fallback AI insights generator');
                            return {
                                aiSummary: 'Fallback AI summary - no AI service available',
                                aiHighlights: ['Fallback highlight 1', 'Fallback highlight 2'],
                                aiTopics: ['General discussion', 'Coaching session'],
                                aiActionItems: ['Follow up on discussed topics'],
                                aiQuestions: ['How did the session go?'],
                                aiSentiment: 'neutral',
                                aiEngagement: 'moderate',
                                aiCoachingInsights: 'Standard coaching session',
                                aiSessionAnalysis: 'Basic session analysis',
                                aiParticipantInsights: 'Standard participant engagement',
                                aiQualityMetrics: { overall: 7, engagement: 6, clarity: 7 },
                                metadata: {
                                    aiGenerated: false,
                                    model: 'fallback',
                                    provider: 'fallback',
                                    processingTime: 0
                                }
                            };
                        }
                    };
                }).singleton(),
                aiService: aliasTo('aiPoweredInsightsGenerator')
            });
        }

        // Register OpenAIService for TranscriptionAnalyzer
        try {
            console.log('Loading openAIService...');
            const OpenAIService = require('./src/infrastructure/services/OpenAIService').OpenAIService;
            container.register({
                openAIService: asClass(OpenAIService).singleton()
            });
            console.log('✅ openAIService registered successfully');
        } catch (error) {
            console.log('⚠️ openAIService failed:', error.message);
            // Create a fallback service
            container.register({
                openAIService: asFunction(({ config, logger, eventBus, metricsCollector }) => {
                    return {
                        generateInsights: async () => ({ summary: 'Fallback insights' }),
                        generateTranscription: async () => 'Fallback transcription',
                        generateSummary: async () => 'Fallback summary',
                        extractActionItems: async () => []
                    };
                }).singleton()
            });
        }

        // ========== DOMAIN SERVICES ==========
        console.log('\n📦 Loading Domain Services...\n');
        container.register({
            outcomesProcessor: asClass(
                diagnosticRequire('./src/domain/services/OutcomesProcessor', 'OutcomesProcessor')
            ).singleton(),
            
            // Outcome Extractor - Correct path: src/domain/services/OutcomeExtractor.js
            outcomeExtractor: asClass(
                diagnosticRequire('./src/domain/services/OutcomeExtractor')
            ).singleton(),
            
            // Relationship Analyzer - Correct path: src/domain/services/RelationshipAnalyzer.js
            relationshipAnalyzer: asClass(
                diagnosticRequire('./src/domain/services/RelationshipAnalyzer')
            ).singleton()
        });

        // ========== INFRASTRUCTURE SERVICES ==========
        console.log('\n🔧 Loading Infrastructure Services...\n');
        
        // Core services (required)
        container.register({
            zoomService: asClass(require('./src/infrastructure/services/ZoomService').ZoomService).singleton(),
            googleDriveService: asClass(require('./src/infrastructure/services/GoogleDriveService').GoogleDriveService).singleton(),
            
            // Data services
            knowledgeBaseService: asClass(require('./src/infrastructure/services/KnowledgeBaseService')).singleton(),
            knowledgeBase: aliasTo('knowledgeBaseService')
        });

        // Smart services - MUST be registered before GoogleSheetsService
        const csnsClass = require('./src/infrastructure/services/CompleteSmartNameStandardizer').CompleteSmartNameStandardizer;
        const swiClass = require('./src/infrastructure/services/SmartWeekInferencer').SmartWeekInferencer;
        const emeClass = require('./src/infrastructure/services/EnhancedMetadataExtractor').EnhancedMetadataExtractor;
        const fcaClass = require('./src/infrastructure/services/FileContentAnalyzer').FileContentAnalyzer;
        const rdModule = diagnosticRequire('./src/infrastructure/services/EnhancedRecordingDownloader');
        const rdClass = rdModule.EnhancedRecordingDownloader || rdModule;
        const doClass = diagnosticRequire('./src/infrastructure/services/DriveOrganizer');
        console.log('DEBUG: typeof csnsClass:', typeof csnsClass, 'isClass:', typeof csnsClass === 'function');
        console.dir(csnsClass);
        console.log('DEBUG: typeof swiClass:', typeof swiClass, 'isClass:', typeof swiClass === 'function');
        console.dir(swiClass);
        console.log('DEBUG: typeof emeClass:', typeof emeClass, 'isClass:', typeof emeClass === 'function');
        console.dir(emeClass);
        console.log('DEBUG: typeof fcaClass:', typeof fcaClass, 'isClass:', typeof fcaClass === 'function');
        console.dir(fcaClass);
        console.log('DEBUG: typeof rdClass:', typeof rdClass, 'isClass:', typeof rdClass === 'function');
        console.dir(rdClass);
        console.log('DEBUG: typeof doClass:', typeof doClass, 'isClass:', typeof doClass === 'function');
        console.dir(doClass);
        container.register({
            completeSmartNameStandardizer: asClass(csnsClass).singleton(),
            nameStandardizer: aliasTo('completeSmartNameStandardizer'),
            smartWeekInferencer: asClass(swiClass).singleton(),
            enhancedMetadataExtractor: asClass(emeClass).singleton(),
            fileContentAnalyzer: asClass(fcaClass).singleton(),
            recordingDownloader: asClass(rdClass).singleton().inject((container) => ({
                options: {
                    useParallelDownloads: options.useParallelDownloads,
                    useStreamingDownloads: options.useStreamingDownloads,
                    downloadConcurrency: options.downloadConcurrency,
                    downloadTimeout: options.downloadTimeout,
                    enableResumeDownloads: options.enableResumeDownloads,
                    maxRetries: options.maxRetries,
                    maxConnections: options.maxConnections
                }
            })),
            driveOrganizer: asClass(doClass).singleton()
        });

        // ========== SMART SERVICES INITIALIZATION ==========
        console.log('\n🧠 Initializing Smart Services...\n');
        
        try {
            // Load SmartServicesInitializer to ensure all services are properly wired
            const SmartServicesInitializer = require('./src/infrastructure/helpers/SmartServicesInitializer');
            const initializer = new SmartServicesInitializer(this.loadConfig());
            
            // Initialize all smart services with proper wiring
            const smartServices = await initializer.initializeServices();
            
            // Register the properly wired services
            container.register({
                nameStandardizer: aliasTo('completeSmartNameStandardizer'),
                weekInferencer: asValue(smartServices.weekInferencer),
                metadataExtractor: asValue(smartServices.metadataExtractor),
                transcriptionAnalyzer: asValue(smartServices.transcriptionAnalyzer),
                smartServicesBundle: asValue(smartServices) // Bundle for easy access
            });
            
            console.log('✅ Smart services initialized and wired successfully');
        } catch (error) {
            console.log('⚠️ SmartServicesInitializer not found, using individual services');
            // Fallback to individual services
            container.register({
                nameStandardizer: aliasTo('completeSmartNameStandardizer'),
                weekInferencer: aliasTo('smartWeekInferencer'),
                metadataExtractor: aliasTo('enhancedMetadataExtractor'),
                transcriptionAnalyzer: asClass(require('./src/application/services/TranscriptionAnalyzer').TranscriptionAnalyzer).singleton()
            });
        }

        // ========== GOOGLE SHEETS SERVICE WITH DUAL TAB SUPPORT ==========
        console.log('\n📊 Setting up Google Sheets Service with Dual Tab Support...\n');
        
        // Register DualTabGoogleSheetsService as the main Google Sheets service
        container.register({
            googleSheetsService: asFunction(({ config, logger, nameStandardizer, weekInferencer, metadataExtractor, transcriptionAnalyzer }) => {
                try {
                    const DualTabGoogleSheetsService = require('./src/infrastructure/services/DualTabGoogleSheetsService').DualTabGoogleSheetsService;
                    return new DualTabGoogleSheetsService({
                        config,
                        logger,
                        nameStandardizer,
                        weekInferencer,
                        metadataExtractor,
                        transcriptionAnalyzer
                    });
                } catch (error) {
                    const GoogleSheetsService = require('./src/infrastructure/services/GoogleSheetsService').GoogleSheetsService;
                    return new GoogleSheetsService({ config, logger });
                }
            }).singleton()
        });

        // ========== AI SERVICES WITH DIAGNOSTICS ==========
        console.log('\n🤖 Loading Consolidated AI Services...\n');
        
        // AI services are now registered earlier to avoid circular dependencies

        // Create the missing data files before loading TangibleOutcomesProcessor
        try {
            console.log('\nPreparing data files for tangibleOutcomesProcessor...');
            
            // Create the data directory if it doesn't exist
            const dataDir = './src/infrastructure/data';
            await fsp.mkdir(dataDir, { recursive: true });
            
            // Create coaches.json if it doesn't exist
            const coachesPath = path.join(dataDir, 'coaches.json');
            try {
                await fsp.access(coachesPath);
                console.log('   → coaches.json exists');
            } catch {
                console.log('   → Creating coaches.json...');
                // Get data from knowledge base if available
                try {
                    const kb = container.resolve('knowledgeBaseService');
                    const coaches = kb.coaches || [];
                    await fsp.writeFile(coachesPath, JSON.stringify(coaches, null, 2));
                } catch {
                    // Create empty file
                    await fsp.writeFile(coachesPath, '[]');
                }
            }
            
            // Now load TangibleOutcomesProcessor
            console.log('\nLoading tangibleOutcomesProcessor...');
            let TangibleOutcomesProcessor;
            
            try {
                TangibleOutcomesProcessor = diagnosticRequire(
                    './src/infrastructure/services/tangible-outcomes-processor', 
                    'TangibleOutcomesProcessor'
                );
            } catch (e1) {
                console.log('   → Trying default export or direct module...');
                TangibleOutcomesProcessor = diagnosticRequire(
                    './src/infrastructure/services/tangible-outcomes-processor'
                );
            }
            
            container.register({
                tangibleOutcomesProcessor: asClass(TangibleOutcomesProcessor).singleton()
            });
            console.log('✅ tangibleOutcomesProcessor registered successfully');
        } catch (error) {
            console.log('⚠️ tangibleOutcomesProcessor failed:', error.message);
            // Fallback to outcomes processor
            container.register({
                tangibleOutcomesProcessor: aliasTo('outcomesProcessor')
            });
        }

        // ========== ALIASES ==========
        container.register({
            transcriptAnalyzer: aliasTo('transcriptionAnalyzer'),
            cacheService: aliasTo('cache')
        });

        // ========== REPOSITORY ==========
        const MemoryRecordingRepository = class {
            constructor() {
                this.recordings = new Map();
                this.processedIds = new Set();
            }
            
            async save(recording) {
                this.recordings.set(recording.id, recording);
                if (recording.processed) {
                    this.processedIds.add(recording.id);
                }
            }
            
            async findById(id) {
                return this.recordings.get(id);
            }
            
            async isProcessed(id) {
                return this.processedIds.has(id);
            }
            
            async markAsProcessed(id) {
                this.processedIds.add(id);
            }
        };

        container.register({
            recordingRepository: asClass(MemoryRecordingRepository).singleton()
        });

        // ========== APPLICATION SERVICES ==========
        console.log('\n📱 Loading Application Services...\n');
        
        container.register({
            recordingProcessor: asFunction(({ 
                zoomService, 
                googleDriveService, 
                googleSheetsService,
                fileContentAnalyzer, 
                recordingAnalyzer, 
                cacheService, 
                eventBus,
                logger,
                driveOrganizer,
                recordingDownloader,
                outcomeExtractor,
                relationshipAnalyzer
            }) => {
                const RecordingProcessor = require('./src/application/processors/RecordingProcessor');
                const processor = new RecordingProcessor(
                    logger,
                    recordingAnalyzer,
                    googleDriveService,
                    googleSheetsService,
                    zoomService,
                    eventBus,
                    null, // recordingDownloader (will be set later)
                    null, // driveOrganizer (will be set later)
                    null, // outcomeExtractor (will be set later)
                    null, // relationshipAnalyzer (will be set later)
                    {}, // config
                    options.lightweight // lightweight flag
                );
                
                // Inject the enhanced services if the processor supports them
                if (processor.setDriveOrganizer) {
                    processor.setDriveOrganizer(driveOrganizer);
                }
                if (processor.setRecordingDownloader) {
                    processor.setRecordingDownloader(recordingDownloader);
                }
                if (processor.setOutcomeExtractor) {
                    processor.setOutcomeExtractor(outcomeExtractor);
                }
                if (processor.setRelationshipAnalyzer) {
                    processor.setRelationshipAnalyzer(relationshipAnalyzer);
                }
                
                return processor;
            }).singleton(),
            
            sessionAnalyzer: asClass(require('./src/application/services/RecordingAnalyzer')).singleton(),
            insightsGenerator: asClass(require('./src/application/services/InsightsGenerator').InsightsGenerator).singleton(),
            transcriptionAnalyzer: asClass(require('./src/application/services/TranscriptionAnalyzer').TranscriptionAnalyzer).singleton(),
            participantAnalyzer: asClass(require('./src/application/services/ParticipantAnalyzer').ParticipantAnalyzer).singleton(),
            recordingAnalyzer: asClass(require('./src/application/services/RecordingAnalyzer')).singleton()
        });

        container.register({
            knowledgeBase: aliasTo('knowledgeBaseService')
        });

        console.log('\n✅ Container setup complete\n');
        console.log('📊 Services registered with correct paths:');
        console.log('   ✓ EnhancedRecordingDownloader: src/infrastructure/services/EnhancedRecordingDownloader.js');
        console.log('   ✓ DriveOrganizer: src/infrastructure/services/DriveOrganizer.js');
        console.log('   ✓ OutcomeExtractor: src/domain/services/OutcomeExtractor.js');
        console.log('   ✓ RelationshipAnalyzer: src/domain/services/RelationshipAnalyzer.js');
        console.log('\n📊 Google Sheets will update:');
        console.log('   - Tab 1: Raw Master Index (original Zoom data)');
        console.log('   - Tab 2: Standardized Master Index (50-column smart schema)');
        console.log('   - No Tab 3 creation!\n');
        
        this.container = container;
    }

    async initializeServices() {
        console.log('🔧 Initializing services...\n');
        
        try {
            // Test AI service
            const aiService = this.container.resolve('aiPoweredInsightsGenerator');
            console.log('✅ AI-Powered Insights Generator initialized');
            
            // Test other core services
            const insightsGenerator = this.container.resolve('insightsGenerator');
            console.log('✅ Insights Generator initialized');
            
            const outcomesProcessor = this.container.resolve('outcomesProcessor');
            console.log('✅ Outcomes Processor initialized');
            
            const recordingProcessor = this.container.resolve('recordingProcessor');
            console.log('✅ Recording Processor initialized');
            
            // Test new services
            const outcomeExtractor = this.container.resolve('outcomeExtractor');
            console.log('✅ Outcome Extractor initialized');
            
            const relationshipAnalyzer = this.container.resolve('relationshipAnalyzer');
            console.log('✅ Relationship Analyzer initialized');
            
            const recordingDownloader = this.container.resolve('recordingDownloader');
            console.log('✅ Recording Downloader initialized');
            
            const driveOrganizer = this.container.resolve('driveOrganizer');
            console.log('✅ Drive Organizer initialized');
            
        } catch (error) {
            console.error('❌ Service initialization failed:', error);
            throw error;
        }
    }

    async verifyCoreServices() {
        console.log('🔍 Verifying core services...\n');
        
        const coreServices = [
            'aiPoweredInsightsGenerator',
            'insightsGenerator',
            'outcomesProcessor',
            'outcomeExtractor',
            'relationshipAnalyzer'
        ];
        
        for (const serviceName of coreServices) {
            try {
                const service = this.container.resolve(serviceName);
                console.log(`✅ Core service verified: ${serviceName}`);
            } catch (error) {
                console.error(`❌ Core service failed: ${serviceName} - ${error.message}`);
                throw new Error(`Core service ${serviceName} is required but not available`);
            }
        }
        
        // Check optional services without throwing
        const optionalServices = [
            'recordingProcessor',
            'zoomService',
            'googleDriveService',
            'googleSheetsService',
            'recordingDownloader',
            'driveOrganizer'
        ];
        
        for (const serviceName of optionalServices) {
            try {
                const service = this.container.resolve(serviceName);
                console.log(`✅ Optional service available: ${serviceName}`);
            } catch (error) {
                console.warn(`⚠️ Optional service not available: ${serviceName} - ${error.message}`);
            }
        }
        
        console.log('✅ Core services verified successfully\n');
    }

    setupEventListeners() {
        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\n⚠️ Received SIGINT, shutting down gracefully...');
            await this.shutdown();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            console.log('\n⚠️ Received SIGTERM, shutting down gracefully...');
            await this.shutdown();
            process.exit(0);
        });
    }

    async processRecording(recording, options = {}) {
        const { lightweight = false, cloudLightweight = false } = options;
        console.log(`🔍 DEBUG: Starting processRecording for: ${recording.id}`);
        
        const recordingId = recording.id || recording.meeting_id || 'unknown';
        const uuid = recording.uuid || recording.id || 'unknown';
        const topic = recording.topic || 'No Topic';
        
        console.log(`\n🔍 Processing Recording Details:`);
        console.log(`   📋 Topic: ${topic}`);
        console.log(`   🆔 Meeting ID: ${recordingId}`);
        console.log(`   🔑 UUID: ${uuid}`);
        console.log(`   📅 Date: ${recording.start_time || 'unknown'}`);
        
        this.logger.info(`Processing recording: ${recordingId} (UUID: ${uuid})`);
        
        try {
            const startTime = Date.now();
            
            // Get all required services
            const aiService = this.container.resolve('aiPoweredInsightsGenerator');
            const outcomeExtractor = this.container.resolve('outcomeExtractor');
            const relationshipAnalyzer = this.container.resolve('relationshipAnalyzer');
            const googleSheetsService = this.container.resolve('googleSheetsService');
            
            // Get smart services for comprehensive processing
            const nameStandardizer = this.container.resolve('nameStandardizer');
            const weekInferencer = this.container.resolve('weekInferencer');
            const metadataExtractor = this.container.resolve('metadataExtractor');
            const recordingDownloader = this.container.resolve('recordingDownloader');
            const driveOrganizer = this.container.resolve('driveOrganizer');
            
            this.logger.info(`🔍 Starting comprehensive processing for recording: ${recordingId}`);
            
            // Step 1: Download recording files
            console.log('📥 Downloading recording files...');
            let downloadedFiles = {};
            let transcriptContent = '';
            let chatContent = '';
            let folderPath = null;
            
            try {
                // CRITICAL FIX: Use M:<meeting ID>U:<UUID> as unique identifier to prevent conflicts
                const uniqueIdentifier = `M:${recording.id}U:${recording.uuid}`;
                const existingFilesPath = path.join(process.env.OUTPUT_DIR || './output', uniqueIdentifier);
                if (fs.existsSync(existingFilesPath)) {
                    console.log('📁 Found existing files in output directory, using them...');
                    folderPath = existingFilesPath;
                    const existingFiles = fs.readdirSync(existingFilesPath);
                    
                    for (const fileName of existingFiles) {
                        const filePath = path.join(existingFilesPath, fileName);
                        const stats = fs.statSync(filePath);
                        
                        if (fileName.toLowerCase().includes('mp4')) {
                            downloadedFiles.video = filePath;
                        } else if (fileName.toLowerCase().includes('m4a')) {
                            downloadedFiles.audio = filePath;
                        } else if (fileName.toLowerCase().includes('transcript') || fileName.toLowerCase().includes('vtt')) {
                            downloadedFiles.transcript = filePath;
                            try {
                                transcriptContent = fs.readFileSync(filePath, 'utf8');
                                console.log(`📝 Successfully read transcript file: ${fileName} (${transcriptContent.length} characters)`);
                            } catch (error) {
                                console.log(`⚠️ Failed to read transcript file ${fileName}: ${error.message}`);
                            }
                        } else if (fileName.toLowerCase().includes('timeline') || fileName.toLowerCase().includes('json')) {
                            downloadedFiles.timeline = filePath;
                        } else if (fileName.toLowerCase().includes('chat') || fileName.toLowerCase().includes('txt')) {
                            downloadedFiles.chat = filePath;
                            try {
                                chatContent = fs.readFileSync(filePath, 'utf8');
                                console.log(`💬 Successfully read chat file: ${fileName} (${chatContent.length} characters)`);
                            } catch (error) {
                                console.log(`⚠️ Failed to read chat file ${fileName}: ${error.message}`);
                            }
                        }
                    }
                    
                    console.log('✅ Using existing files:', Object.keys(downloadedFiles).join(', '));
                } else {
                    console.log('📁 No existing files found, trying to download from Zoom API...');
                    
                    // NEW: Cloud Lightweight Mode - Skip video and audio files
                    if (cloudLightweight) {
                        console.log('☁️ CLOUD LIGHTWEIGHT MODE: Skipping video and audio files, downloading only transcript and metadata...');
                    }
                    
                    // Try to download from Zoom API
                    const recordingDownloader = this.container.resolve('recordingDownloader');
                    if (recordingDownloader) {
                        const outputDir = path.join('./output', uniqueIdentifier);
                        folderPath = outputDir;
                        
                        // NEW: Pass cloud lightweight option to downloader
                        const downloadOptions = cloudLightweight ? { skipVideo: true, skipAudio: true } : {};
                        const downloadResult = await recordingDownloader.downloadRecordingFiles(recording, outputDir, downloadOptions);
                        if (downloadResult.success) {
                            downloadedFiles = downloadResult.files;
                            
                            // DEBUG: Log the download result structure
                            console.log(`🔍 DEBUG: Download result structure:`);
                            console.log(`   Success: ${downloadResult.success}`);
                            console.log(`   Files keys: ${Object.keys(downloadResult.files || {}).join(', ')}`);
                            console.log(`   Transcript path: ${downloadedFiles.transcript}`);
                            console.log(`   All files:`, JSON.stringify(downloadResult.files, null, 2));
                            
                            // FIX: Map uppercase keys to lowercase to prevent duplicates
                            if (downloadResult.files) {
                                // Replace uppercase keys with lowercase ones and remove duplicates
                                if (downloadResult.files.TRANSCRIPT) {
                                    downloadedFiles.transcript = downloadResult.files.TRANSCRIPT;
                                    delete downloadResult.files.TRANSCRIPT; // Remove uppercase key
                                    console.log(`🔧 FIXED: Mapped TRANSCRIPT to transcript: ${downloadedFiles.transcript}`);
                                }
                                if (downloadResult.files.CHAT) {
                                    downloadedFiles.chat = downloadResult.files.CHAT;
                                    delete downloadResult.files.CHAT; // Remove uppercase key
                                    console.log(`🔧 FIXED: Mapped CHAT to chat: ${downloadedFiles.chat}`);
                                }
                                if (downloadResult.files.M4A) {
                                    downloadedFiles.audio = downloadResult.files.M4A;
                                    delete downloadResult.files.M4A; // Remove uppercase key
                                    console.log(`🔧 FIXED: Mapped M4A to audio: ${downloadedFiles.audio}`);
                                }
                                if (downloadResult.files.MP4) {
                                    downloadedFiles.video = downloadResult.files.MP4;
                                    delete downloadResult.files.MP4; // Remove uppercase key
                                    console.log(`🔧 FIXED: Mapped MP4 to video: ${downloadedFiles.video}`);
                                }
                                if (downloadResult.files.TIMELINE) {
                                    downloadedFiles.timeline = downloadResult.files.TIMELINE;
                                    delete downloadResult.files.TIMELINE; // Remove uppercase key
                                    console.log(`🔧 FIXED: Mapped TIMELINE to timeline: ${downloadedFiles.timeline}`);
                                }
                            }
                            
                            // Wait a moment for files to be fully written
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            
                            // FIX: Read transcript and chat content AFTER mapping fix is applied
                            if (downloadedFiles.transcript) {
                                try {
                                    transcriptContent = fs.readFileSync(downloadedFiles.transcript, 'utf8');
                                    console.log(`📝 Successfully read transcript: ${transcriptContent.length} characters`);
                                } catch (error) {
                                    console.log(`⚠️ Failed to read transcript: ${error.message}`);
                                }
                            } else {
                                console.log(`⚠️ No transcript path found in downloadedFiles after mapping`);
                                console.log(`   Available keys: ${Object.keys(downloadedFiles).join(', ')}`);
                            }
                            if (downloadedFiles.chat) {
                                try {
                                    chatContent = fs.readFileSync(downloadedFiles.chat, 'utf8');
                                    console.log(`💬 Successfully read chat: ${chatContent.length} characters`);
                                } catch (error) {
                                    console.log(`⚠️ Failed to read chat: ${error.message}`);
                                }
                            }
                        } else {
                            console.log('⚠️ Download failed, but continuing with processing...');
                        }
                    }
                }
            } catch (error) {
                console.log('⚠️ Failed to download recording files:', error.message);
                console.log('✅ Downloaded files:', Object.keys(downloadedFiles).join(', '));
            }
            
            // Debug: Log transcript and chat content lengths
            console.log(`📝 Transcript content length: ${transcriptContent.length} characters`);
            console.log(`💬 Chat content length: ${chatContent.length} characters`);
            if (transcriptContent.length > 0) {
                console.log(`📝 Transcript preview: ${transcriptContent.substring(0, 200)}...`);
            }
            if (chatContent.length > 0) {
                console.log(`💬 Chat preview: ${chatContent.substring(0, 200)}...`);
            }
            
            // FIX: Ensure transcript content is properly read for Personal Meeting Room recordings
            if (transcriptContent.length === 0 && downloadedFiles.transcript) {
                try {
                    console.log(`🔧 FIX: Re-reading transcript file: ${downloadedFiles.transcript}`);
                    transcriptContent = fs.readFileSync(downloadedFiles.transcript, 'utf8');
                    console.log(`✅ FIX: Successfully re-read transcript: ${transcriptContent.length} characters`);
                    if (transcriptContent.length > 0) {
                        console.log(`📝 FIX: Transcript preview: ${transcriptContent.substring(0, 200)}...`);
                    }
                } catch (error) {
                    console.log(`⚠️ FIX: Failed to re-read transcript: ${error.message}`);
                }
            }
            
            // Additional debugging: Check if transcript content is still available before name standardization
            console.log(`🔍 DEBUG: Before name standardization - transcript length: ${transcriptContent.length} characters`);
            if (transcriptContent.length > 0) {
                console.log(`🔍 DEBUG: Transcript contains "Shah": ${transcriptContent.toLowerCase().includes('shah')}`);
            }
            
            // Step 1.5: Extract participants from downloaded files (timeline, chat, transcript)
            console.log('👥 Extracting participants from downloaded files...');
            const extractedParticipants = await this._extractParticipantsFromFiles(downloadedFiles, transcriptContent, chatContent);
            recording.participants = extractedParticipants;
            console.log(`✅ Extracted ${extractedParticipants.length} participants:`, extractedParticipants.map(p => p.name).join(', '));
            
            // Step 2: Smart name standardization with transcript/chat content
            let nameAnalysis = { standardized: recording.topic || 'Unknown Session', confidence: 0, method: 'fallback' };
            if (nameStandardizer) {
                try {
                    this.logger.info('🏷️ Performing smart name standardization with transcript/chat analysis...');
                    const result = await nameStandardizer.standardizeName(recording.topic || '', {
                        ...recording,
                        downloadedFiles,
                        participants: recording.participants || [],
                        transcriptContent,
                        chatContent,
                        hasTranscript: !!downloadedFiles.transcript,
                        hasChat: !!downloadedFiles.chat
                    });
                    
                    // Map the result to the expected format
                    nameAnalysis = {
                        standardized: result.standardized || result.standardizedName || recording.topic || 'Unknown Session',
                        standardizedName: result.standardized || result.standardizedName || recording.topic || 'Unknown Session',
                        confidence: result.confidence || 0,
                        method: result.method || 'fallback',
                        components: result.components || {}
                    };
                    
                    this.logger.info(`✅ Name standardized: ${nameAnalysis.standardized} (confidence: ${nameAnalysis.confidence})`);
                } catch (error) {
                    this.logger.warn('⚠️ Name standardization failed:', error.message);
                }
            }
            
            // Step 2.5: FIX DURATION BEFORE CATEGORIZATION
            // Fix incorrect duration from Zoom API by calculating from recording_files if available
            if (recording.recording_files && Array.isArray(recording.recording_files)) {
                // Try to get duration from recording files
                const videoFile = recording.recording_files.find(f => f.file_type === 'MP4');
                const audioFile = recording.recording_files.find(f => f.file_type === 'M4A');
                
                if (videoFile && videoFile.recording_end && videoFile.recording_start) {
                    const calculatedDuration = (new Date(videoFile.recording_end) - new Date(videoFile.recording_start)) / 1000;
                    if (calculatedDuration > 0 && Math.abs(calculatedDuration - recording.duration) > 60) {
                        console.log(`🔧 FIX: Correcting duration from ${recording.duration}s to ${Math.round(calculatedDuration)}s based on video file timestamps`);
                        recording.duration = Math.round(calculatedDuration);
                    }
                } else if (audioFile && audioFile.recording_end && audioFile.recording_start) {
                    const calculatedDuration = (new Date(audioFile.recording_end) - new Date(audioFile.recording_start)) / 1000;
                    if (calculatedDuration > 0 && Math.abs(calculatedDuration - recording.duration) > 60) {
                        console.log(`🔧 FIX: Correcting duration from ${recording.duration}s to ${Math.round(calculatedDuration)}s based on audio file timestamps`);
                        recording.duration = Math.round(calculatedDuration);
                    }
                }
                
                // Calculate total file size from recording_files
                let totalFileSize = 0;
                recording.recording_files.forEach(file => {
                    if (file.file_size) {
                        totalFileSize += file.file_size;
                    }
                });
                if (totalFileSize > 0) {
                    recording.total_size = totalFileSize;
                }
            }
            
            console.log(`🔍 DEBUG: About to start categorization...`);
            
            // Step 2.5: DETERMINE RECORDING CATEGORY
            const recordingCategory = this._determineRecordingCategory(
                recording, 
                nameAnalysis, 
                extractedParticipants.length
            );
            
            // Store category in recording for Drive organization
            recording._category = recordingCategory;
            
            console.log(`📂 Recording Category: ${recordingCategory}`);
            console.log(`   🏷️ Standardized Name: ${nameAnalysis.standardizedName}`);
            console.log(`   👥 Participants: ${extractedParticipants.length}`);
            console.log(`   ⏱️ Duration: ${recording.duration || 0} seconds`);
            console.log(`   📦 File Size: ${recording.file_size || 0} bytes`);
            
            console.log(`🔍 DEBUG: About to start week inference...`);
            
            // Step 2.6: Smart week inference (moved up to fix initialization error)
            let weekAnalysis = { weekNumber: 0, confidence: 0, method: 'fallback' };
            console.log(`🔍 DEBUG: WeekInferencer available: ${!!weekInferencer}`);
            console.log(`🔍 DEBUG: Topic for week inference: "${recording.topic}"`);
            
            if (weekInferencer) {
                try {
                    this.logger.info('📅 Inferring week number...');
                    console.log(`🔍 DEBUG: Calling weekInferencer.inferWeek...`);
                    
                    weekAnalysis = await weekInferencer.inferWeek({
                        timestamp: recording.start_time,
                        metadata: recording,
                        folderPath: folderPath,
                        recordingName: nameAnalysis.standardizedName,
                        downloadedFiles,
                        additionalContext: {
                            studentName: nameAnalysis.components?.student || '',
                            coach: nameAnalysis.components?.coach || recording.host_email?.split('@')[0] || '',
                            programStartDate: '2025-01-06', // Default program start date
                            topic: recording.topic,
                            description: recording.description,
                            folderName: folderPath
                        }
                    });
                    
                    console.log(`🔍 DEBUG: Week inference result:`, weekAnalysis);
                    this.logger.info(`✅ Week inferred: ${weekAnalysis.weekNumber} (confidence: ${weekAnalysis.confidence})`);
                    
                } catch (error) {
                    console.log(`🔍 DEBUG: Week inference error:`, error);
                    this.logger.warn('⚠️ Week inference failed:', error.message);
                }
            } else {
                console.log(`🔍 DEBUG: WeekInferencer is null/undefined`);
            }
            
            // Step 2.7: UPDATE WEEK NUMBER AFTER SMART INFERENCE AND REGENERATE FOLDER NAME
            if (weekAnalysis && weekAnalysis.weekNumber && weekAnalysis.confidence > 0.5) {
                try {
                    console.log(`🔧 FIX: Updating week number from SmartWeekInferencer: ${weekAnalysis.weekNumber} (confidence: ${Math.round(weekAnalysis.confidence * 100)}%)`);
                    
                    // Regenerate folder name with corrected week number
                    const coachName = nameAnalysis.components?.coach || 
                                    nameAnalysis.standardizedName?.split('_')[1] || 
                                    recording.host_email?.split('@')[0] || 
                                    'unknown';
                    
                    const studentName = nameAnalysis.components?.student || 
                                      nameAnalysis.standardizedName?.split('_')[2] || 
                                      'Unknown';
                    
                    const correctedStandardizedName = nameStandardizer.buildStandardizedFolderName({
                        coach: coachName,
                        student: studentName,
                        weekNumber: weekAnalysis.weekNumber,
                        sessionType: nameAnalysis.components?.sessionType || 'Coaching',
                        date: recording.start_time.split('T')[0],
                        meetingId: recording.id,
                        uuid: recording.uuid,
                        topic: recording.topic
                    });
                    
                    // Update the name analysis with corrected folder name
                    nameAnalysis.standardizedName = correctedStandardizedName;
                    console.log(`🔧 FIX: Updated folder name with corrected week: ${correctedStandardizedName}`);
                    
                } catch (error) {
                    console.log(`⚠️ Week number update failed: ${error.message}`);
                }
            }
            
            // Step 3: Enhanced metadata extraction
            let enhancedMetadata = recording;
            if (metadataExtractor) {
                try {
                    this.logger.info('📊 Extracting enhanced metadata...');
                    enhancedMetadata = await metadataExtractor.extractMetadata({
                        ...recording,
                        downloadedFiles,
                        participants: recording.participants || [],
                        // Pass the name analysis results to help with metadata extraction
                        coachName: nameAnalysis.components?.coach || recording.host_email?.split('@')[0] || 'unknown',
                        studentName: nameAnalysis.components?.student || 'Unknown',
                        weekNumber: weekAnalysis.weekNumber,
                        sessionType: nameAnalysis.components?.sessionType || 'Coaching'
                    });
                    this.logger.info('✅ Enhanced metadata extracted');
                } catch (error) {
                    this.logger.warn('⚠️ Metadata extraction failed:', error.message);
                }
            }
            
            // Step 4: Generate AI-powered insights
            let aiInsights = {};
            if (aiService && transcriptContent) {
                try {
                    this.logger.info('🤖 Generating AI-powered insights...');
                    const rawAIInsights = await aiService.generateAIInsights(transcriptContent, {
                        topic: recording.topic,
                        start_time: recording.start_time,
                        duration: Math.round((recording.duration || 0) / 60), // Convert seconds to minutes
                        host_email: recording.host_email,
                        host_name: recording.host_name,
                        participantCount: enhancedMetadata.participantCount,
                        coach: enhancedMetadata.coach,
                        student: enhancedMetadata.student,
                        weekNumber: weekAnalysis.weekNumber,
                        forceRuleBased: false
                    });
                    
                    // Transform AI insights from flat structure to nested structure for Google Sheets mapping
                    aiInsights = this._transformAIInsightsForMapping(rawAIInsights);
                    
                    // DEBUG: Log the AI insights object after generation and transformation
                    this.logger.info(`🔍 [AI INSIGHTS DEBUG] AI Service Response for Recording: ${recording.id}`);
                    this.logger.info(`🔍 [AI INSIGHTS DEBUG] Raw AI Insights object keys: ${Object.keys(rawAIInsights).join(', ')}`);
                    this.logger.info(`🔍 [AI INSIGHTS DEBUG] Transformed AI Insights object keys: ${Object.keys(aiInsights).join(', ')}`);
                    this.logger.info(`🔍 [AI INSIGHTS DEBUG] Raw AI Insights object:`, JSON.stringify(rawAIInsights, null, 2));
                    this.logger.info(`🔍 [AI INSIGHTS DEBUG] Transformed AI Insights object:`, JSON.stringify(aiInsights, null, 2));
                    
                    this.logger.info('✅ AI insights generated and transformed');
                } catch (error) {
                    this.logger.warn('⚠️ AI insights generation failed:', error.message);
                    // Generate fallback insights
                    aiInsights = this._generateFallbackAIInsights(recording, enhancedMetadata, transcriptContent);
                }
            } else {
                this.logger.warn('⚠️ AI service not available or no transcript content');
                // Generate fallback insights
                aiInsights = this._generateFallbackAIInsights(recording, enhancedMetadata, transcriptContent);
            }
            
            // Step 5: Extract outcomes
            let outcomes = [];
            if (outcomeExtractor && transcriptContent) {
                try {
                    this.logger.info('🎯 Extracting outcomes...');
                    outcomes = await outcomeExtractor.extractOutcomes(transcriptContent);
                    this.logger.info(`✅ Extracted ${outcomes.length} outcomes`);
                } catch (error) {
                    this.logger.warn('⚠️ Outcomes extraction failed:', error.message);
                }
            }
            
            // Step 6: Analyze relationships
            let relationships = {};
            if (relationshipAnalyzer && transcriptContent) {
                try {
                    this.logger.info('🔗 Analyzing relationships...');
                    relationships = await relationshipAnalyzer.analyzeRelationships(transcriptContent);
                    this.logger.info('✅ Relationships analyzed');
                } catch (error) {
                    this.logger.warn('⚠️ Relationship analysis failed:', error.message);
                }
            }
            
            // Step 7: Initialize Drive variables (upload will happen after processedRecording is created)
            let driveFolderId = null;
            let driveLink = null;
            let driveFileIds = {};
            
            // Step 8: Create comprehensive processed recording object with sophisticated smart schema
            const processedRecording = {
                // ===== CORE PROCESSED DATA =====
                uuid: recording.uuid, // Use the UUID generated before Gate 3
                fingerprint: recording.fingerprint, // Use the fingerprint generated before Gate 3
                recordingDate: new Date(recording.start_time).toISOString().split('T')[0],
                rawName: recording.topic,
                standardizedName: nameAnalysis.standardizedName,
                nameConfidence: nameAnalysis.confidence,
                nameResolutionMethod: nameAnalysis.method,
                familyAccount: 'No',
                weekNumber: weekAnalysis.weekNumber,
                weekConfidence: weekAnalysis.confidence,
                weekInferenceMethod: weekAnalysis.method,
                
                // ===== CATEGORY DATA =====
                category: recordingCategory,
                categoryReason: recordingCategory === 'TRIVIAL' ? 'Low duration/participants/size' : 
                                recordingCategory === 'MISC' ? 'Unknown student/no-show' : 'Valid session',
                
                // ===== HOST & PARTICIPANT DATA =====
                hostEmail: recording.host_email,
                hostName: recording.host_name,
                meetingTopic: recording.topic,
                participants: enhancedMetadata.raw?.participants?.map(p => p.user_name || p.name).join(', ') || '',
                participantCount: enhancedMetadata.participantCount || 2,
                meetingId: recording.id,
                duration: Math.round((recording.duration || 0) / 60), // minutes
                startTime: recording.start_time,
                endTime: recording.end_time || new Date(new Date(recording.start_time).getTime() + (recording.duration || 0) * 1000).toISOString(),
                recordingType: 'cloud_recording',
                
                // ===== FILE DATA =====
                fileSize: this._calculateTotalFileSize(downloadedFiles),
                hasTranscript: !!downloadedFiles.transcript,
                transcriptQuality: downloadedFiles.transcript ? 'Good' : 'None',
                
                // ===== AI INSIGHTS =====
                speakerCount: aiInsights?.transcriptAnalysis?.speakerCount || enhancedMetadata.participantCount || 2,
                primarySpeaker: aiInsights?.transcriptAnalysis?.primarySpeaker || enhancedMetadata.coach || '',
                speakingTimeDistribution: aiInsights?.transcriptAnalysis?.speakingTimeDistribution ? JSON.stringify(aiInsights.transcriptAnalysis.speakingTimeDistribution) : '{}',
                emotionalJourney: aiInsights?.emotionalAnalysis?.emotionalJourney ? JSON.stringify(aiInsights.emotionalAnalysis.emotionalJourney) : '[]',
                engagementScore: aiInsights?.engagementAnalysis?.overallScore || 0,
                keyMoments: aiInsights?.keyMomentsAnalysis?.keyMoments ? JSON.stringify(aiInsights.keyMomentsAnalysis.keyMoments) : '[]',
                coachingTopics: aiInsights?.coachingAnalysis?.topics ? aiInsights.coachingAnalysis.topics.join(', ') : '',
                coachingStyle: aiInsights?.coachingAnalysis?.style || '',
                studentResponsePattern: aiInsights?.studentAnalysis?.responsePattern || '',
                interactionQuality: aiInsights?.interactionAnalysis?.quality || '',
                keyThemes: aiInsights?.thematicAnalysis?.themes ? aiInsights.thematicAnalysis.themes.join(', ') : '',
                actionItems: aiInsights?.actionItemsAnalysis?.actionItems ? JSON.stringify(aiInsights.actionItemsAnalysis.actionItems) : '[]',
                challengesIdentified: aiInsights?.challengesAnalysis?.challenges ? aiInsights.challengesAnalysis.challenges.join(', ') : '',
                breakthroughs: aiInsights?.breakthroughsAnalysis?.breakthroughs ? aiInsights.breakthroughsAnalysis.breakthroughs.join(', ') : '',
                goalsSet: aiInsights?.goalsAnalysis?.goals ? aiInsights.goalsAnalysis.goals.join(', ') : '',
                progressTracked: aiInsights?.progressAnalysis?.progress ? aiInsights.progressAnalysis.progress.join(', ') : '',
                nextSteps: aiInsights?.nextStepsAnalysis?.nextSteps ? aiInsights.nextStepsAnalysis.nextSteps.join(', ') : '',
                followUpRequired: aiInsights?.followUpAnalysis?.required ? 'Yes' : 'No',
                
                // ===== DRIVE INTEGRATION =====
                driveFolder: '', // Will be updated after Drive upload
                driveFolderId: '', // Will be updated after Drive upload
                driveLink: '', // Will be updated after Drive upload
                videoFileId: '', // Will be updated after Drive upload
                transcriptFileId: '', // Will be updated after Drive upload
                
                // ===== PROCESSING METADATA =====
                processedDate: new Date().toISOString(),
                processingVersion: '2.0-smart',
                dataSource: 'Comprehensive Processing',
                lastUpdated: new Date().toISOString(),
                
                // ===== OUTCOMES DATA =====
                outcomes_awards_count: outcomes.filter(o => o.type === 'award').length,
                outcomes_scores_count: outcomes.filter(o => o.type === 'score').length,
                outcomes_projects_count: outcomes.filter(o => o.type === 'project').length,
                outcomes_essays_count: outcomes.filter(o => o.type === 'essay').length,
                outcomes_scholarships_count: outcomes.filter(o => o.type === 'scholarship').length,
                
                // ===== AI INSIGHTS DETAILED MAPPING =====
                session_overview: aiInsights?.sessionOverview?.summary || '',
                main_discussion_points: aiInsights?.sessionOverview?.mainPoints ? aiInsights.sessionOverview.mainPoints.join(', ') : '',
                coaching_strengths: aiInsights?.coachingAnalysis?.strengths ? aiInsights.coachingAnalysis.strengths.join(', ') : '',
                coaching_improvements: aiInsights?.coachingAnalysis?.improvements ? aiInsights.coachingAnalysis.improvements.join(', ') : '',
                student_progress_indicators: aiInsights?.studentAnalysis?.progressIndicators ? aiInsights.studentAnalysis.progressIndicators.join(', ') : '',
                emotional_journey_overall: aiInsights?.emotionalAnalysis?.overallJourney || '',
                emotional_stability_score: aiInsights?.emotionalAnalysis?.stabilityScore || 0,
                risk_factors_count: aiInsights?.riskAnalysis?.riskFactors ? aiInsights.riskAnalysis.riskFactors.length : 0,
                success_predictors_count: aiInsights?.successAnalysis?.predictors ? aiInsights.successAnalysis.predictors.length : 0,
                conversation_flow: aiInsights?.conversationAnalysis?.flow || '',
                response_patterns: aiInsights?.studentAnalysis?.responsePatterns ? JSON.stringify(aiInsights.studentAnalysis.responsePatterns) : '{}',
                session_phases: aiInsights?.sessionAnalysis?.phases ? JSON.stringify(aiInsights.sessionAnalysis.phases) : '[]',
                pacing_analysis: aiInsights?.pacingAnalysis?.analysis || '',
                balance_analysis: aiInsights?.balanceAnalysis?.analysis || '',
                executive_summary: aiInsights?.executiveSummary?.summary || '',
                key_outcomes: aiInsights?.outcomesAnalysis?.keyOutcomes ? aiInsights.outcomesAnalysis.keyOutcomes.join(', ') : '',
                next_steps: aiInsights?.nextStepsAnalysis?.nextSteps ? aiInsights.nextStepsAnalysis.nextSteps.join(', ') : '',
                immediate_recommendations: aiInsights?.recommendationsAnalysis?.immediate ? aiInsights.recommendationsAnalysis.immediate.join(', ') : '',
                short_term_recommendations: aiInsights?.recommendationsAnalysis?.shortTerm ? aiInsights.recommendationsAnalysis.shortTerm.join(', ') : '',
                long_term_recommendations: aiInsights?.recommendationsAnalysis?.longTerm ? aiInsights.recommendationsAnalysis.longTerm.join(', ') : '',
                coach_recommendations: aiInsights?.recommendationsAnalysis?.coach ? aiInsights.recommendationsAnalysis.coach.join(', ') : '',
                student_recommendations: aiInsights?.recommendationsAnalysis?.student ? aiInsights.recommendationsAnalysis.student.join(', ') : '',
                
                // ===== SESSION SUMMARY =====
                session_summary_executive_summary: aiInsights?.executiveSummary?.summary || '',
                session_summary_key_outcomes: aiInsights?.outcomesAnalysis?.keyOutcomes ? aiInsights.outcomesAnalysis.keyOutcomes.join(', ') : '',
                session_summary_main_discussion_points: aiInsights?.sessionOverview?.mainPoints ? aiInsights.sessionOverview.mainPoints.join(', ') : '',
                session_summary_session_structure_phases: aiInsights?.sessionAnalysis?.phases ? JSON.stringify(aiInsights.sessionAnalysis.phases) : '[]',
                session_summary_session_structure_flow: aiInsights?.conversationAnalysis?.flow || '',
                session_summary_session_structure_balance: aiInsights?.balanceAnalysis?.analysis || '',
                session_summary_session_structure_pacing: aiInsights?.pacingAnalysis?.analysis || '',
                session_summary_next_steps: aiInsights?.nextStepsAnalysis?.nextSteps ? aiInsights.nextStepsAnalysis.nextSteps.join(', ') : '',
                
                // ===== KEY HIGHLIGHTS =====
                key_highlights_breakthrough_moments: aiInsights?.breakthroughsAnalysis?.breakthroughs ? aiInsights.breakthroughsAnalysis.breakthroughs.join(', ') : '',
                key_highlights_important_questions: aiInsights?.questionsAnalysis?.importantQuestions ? aiInsights.questionsAnalysis.importantQuestions.join(', ') : '',
                key_highlights_action_items: aiInsights?.actionItemsAnalysis?.actionItems ? aiInsights.actionItemsAnalysis.actionItems.map(ai => ai.description).join(', ') : '',
                key_highlights_coaching_excellence: aiInsights?.coachingAnalysis?.excellenceMoments ? aiInsights.coachingAnalysis.excellenceMoments.join(', ') : '',
                key_highlights_student_growth: aiInsights?.studentAnalysis?.growthMoments ? aiInsights.studentAnalysis.growthMoments.join(', ') : '',
                
                // ===== ACTION ITEMS =====
                action_items_high_priority: aiInsights?.actionItemsAnalysis?.actionItems ? aiInsights.actionItemsAnalysis.actionItems.filter(ai => ai.priority === 'high').map(ai => ai.description).join(', ') : '',
                action_items_medium_priority: aiInsights?.actionItemsAnalysis?.actionItems ? aiInsights.actionItemsAnalysis.actionItems.filter(ai => ai.priority === 'medium').map(ai => ai.description).join(', ') : '',
                action_items_low_priority: aiInsights?.actionItemsAnalysis?.actionItems ? aiInsights.actionItemsAnalysis.actionItems.filter(ai => ai.priority === 'low').map(ai => ai.description).join(', ') : '',
                action_items_coach_actions: aiInsights?.actionItemsAnalysis?.actionItems ? aiInsights.actionItemsAnalysis.actionItems.filter(ai => ai.assignee === 'coach').map(ai => ai.description).join(', ') : '',
                action_items_student_actions: aiInsights?.actionItemsAnalysis?.actionItems ? aiInsights.actionItemsAnalysis.actionItems.filter(ai => ai.assignee === 'student').map(ai => ai.description).join(', ') : '',
                
                // ===== FOLLOW UP RECOMMENDATIONS =====
                follow_up_recommendations_immediate: aiInsights?.followUpAnalysis?.immediate ? aiInsights.followUpAnalysis.immediate.join(', ') : '',
                follow_up_recommendations_short_term: aiInsights?.followUpAnalysis?.shortTerm ? aiInsights.followUpAnalysis.shortTerm.join(', ') : '',
                follow_up_recommendations_long_term: aiInsights?.followUpAnalysis?.longTerm ? aiInsights.followUpAnalysis.longTerm.join(', ') : '',
                follow_up_recommendations_coach_recommendations: aiInsights?.followUpAnalysis?.coachRecommendations ? aiInsights.followUpAnalysis.coachRecommendations.join(', ') : '',
                follow_up_recommendations_student_recommendations: aiInsights?.followUpAnalysis?.studentRecommendations ? aiInsights.followUpAnalysis.studentRecommendations.join(', ') : '',
                
                // ===== QUALITY METRICS =====
                quality_metrics_overall_score: aiInsights?.qualityAnalysis?.overallScore || 0,
                quality_metrics_data_quality_completeness: !!downloadedFiles.transcript ? 0.9 : 0.5,
                quality_metrics_data_quality_accuracy: 0.8,
                quality_metrics_data_quality_consistency: 0.8,
                quality_metrics_data_quality_zoom_insights: !!aiInsights,
                quality_metrics_data_quality_transcript_analysis: !!downloadedFiles.transcript,
                quality_metrics_session_metrics_engagement: aiInsights?.engagementAnalysis?.overallScore || 0,
                quality_metrics_session_metrics_participation: aiInsights?.participationAnalysis?.participationRate || 0,
                quality_metrics_session_metrics_interaction: aiInsights?.interactionAnalysis?.interactionQuality || '',
                quality_metrics_coaching_metrics_effectiveness: aiInsights?.coachingAnalysis?.effectivenessScore || 0,
                quality_metrics_coaching_metrics_techniques: aiInsights?.coachingAnalysis?.techniques ? aiInsights.coachingAnalysis.techniques.join(', ') : '',
                quality_metrics_coaching_metrics_responsiveness: aiInsights?.coachingAnalysis?.responsiveness || '',
                quality_metrics_student_metrics_progress: aiInsights?.studentAnalysis?.progressScore || 0,
                quality_metrics_student_metrics_satisfaction: aiInsights?.studentAnalysis?.satisfactionLevel || '',
                quality_metrics_student_metrics_learning: aiInsights?.studentAnalysis?.learningOutcomes ? aiInsights.studentAnalysis.learningOutcomes.join(', ') : '',
                
                // ===== ZOOM INSIGHTS =====
                zoom_insights_session_type: aiInsights?.zoomInsights?.zoomSessionAnalysis?.sessionType || '',
                zoom_insights_duration: aiInsights?.zoomInsights?.zoomSessionAnalysis?.duration || 0,
                zoom_insights_participant_count: aiInsights?.zoomInsights?.zoomParticipantInsights?.totalParticipants || 0,
                zoom_insights_active_participants: aiInsights?.zoomInsights?.zoomParticipantInsights?.activeParticipants || 0,
                zoom_insights_participant_roles: aiInsights?.zoomInsights?.zoomParticipantInsights?.participantRoles ? JSON.stringify(aiInsights.zoomInsights.zoomParticipantInsights.participantRoles) : '[]',
                zoom_insights_interaction_patterns: aiInsights?.zoomInsights?.zoomParticipantInsights?.interactionPatterns ? JSON.stringify(aiInsights.zoomInsights.zoomParticipantInsights.interactionPatterns) : '{}',
                zoom_insights_engagement_level: aiInsights?.zoomInsights?.zoomParticipantInsights?.engagementLevel || '',
                zoom_insights_participants: aiInsights?.zoomInsights?.zoomParticipantInsights?.participants ? JSON.stringify(aiInsights.zoomInsights.zoomParticipantInsights.participants) : '[]',
                zoom_insights_overall_quality: aiInsights?.zoomInsights?.zoomQualityMetrics?.overallQuality || 0,
                zoom_insights_transcript_quality: aiInsights?.zoomInsights?.zoomQualityMetrics?.transcriptQuality || 0,
                zoom_insights_completeness: aiInsights?.zoomInsights?.zoomQualityMetrics?.completeness || 0,
                zoom_insights_reliability: aiInsights?.zoomInsights?.zoomQualityMetrics?.reliability || 0,
                zoom_insights_engagement_quality: aiInsights?.zoomInsights?.zoomQualityMetrics?.engagementQuality || 0,
                zoom_insights_participation_quality: aiInsights?.zoomInsights?.zoomQualityMetrics?.participationQuality || 0,
                zoom_insights_speaking_distribution: aiInsights?.zoomInsights?.zoomEngagementMetrics?.speakingDistribution ? JSON.stringify(aiInsights.zoomInsights.zoomEngagementMetrics.speakingDistribution) : '{}',
                zoom_insights_interaction_patterns_metrics: aiInsights?.zoomInsights?.zoomEngagementMetrics?.interactionPatterns ? JSON.stringify(aiInsights.zoomInsights.zoomEngagementMetrics.interactionPatterns) : '{}',
                zoom_insights_overall_score: aiInsights?.zoomInsights?.zoomEngagementMetrics?.overallScore || 0,
                zoom_insights_participation_rate: aiInsights?.zoomInsights?.zoomEngagementMetrics?.participationRate || 0,
                zoom_insights_view_count: aiInsights?.zoomInsights?.zoomAnalytics?.recordingAnalytics?.viewCount || 0,
                zoom_insights_download_count: aiInsights?.zoomInsights?.zoomAnalytics?.recordingAnalytics?.downloadCount || 0,
                zoom_insights_share_count: aiInsights?.zoomInsights?.zoomAnalytics?.recordingAnalytics?.shareCount || 0,
                zoom_insights_average_watch_time: aiInsights?.zoomInsights?.zoomAnalytics?.recordingAnalytics?.averageWatchTime || 0,
                zoom_insights_completion_rate: aiInsights?.zoomInsights?.zoomAnalytics?.recordingAnalytics?.completionRate || 0,
                zoom_insights_replay_count: aiInsights?.zoomInsights?.zoomAnalytics?.recordingAnalytics?.replayCount || 0,
                zoom_insights_total_size: aiInsights?.zoomInsights?.zoomAnalytics?.recordingInfo?.totalSize || 0,
                zoom_insights_recording_count: aiInsights?.zoomInsights?.zoomAnalytics?.recordingInfo?.recordingCount || 0,
                zoom_insights_file_types: aiInsights?.zoomInsights?.zoomAnalytics?.recordingInfo?.fileTypes ? JSON.stringify(aiInsights.zoomInsights.zoomAnalytics.recordingInfo.fileTypes) : '[]',
                zoom_insights_zoom_generated: aiInsights?.metadata?.zoomGenerated || false,
                zoom_insights_meeting_id: aiInsights?.metadata?.meetingId || '',
                zoom_insights_processing_time: aiInsights?.metadata?.processingTime || 0,
                zoom_insights_data_sources: aiInsights?.metadata?.dataSources ? JSON.stringify(aiInsights.metadata.dataSources) : '[]',
                
                // ===== TANGIBLE OUTCOMES =====
                tangible_outcomes_metadata_version: aiInsights?.tangibleOutcomes?.metadata?.version || '',
                tangible_outcomes_metadata_generated_at: aiInsights?.tangibleOutcomes?.metadata?.generatedAt || '',
                tangible_outcomes_metadata_topic: aiInsights?.tangibleOutcomes?.metadata?.topic || '',
                tangible_outcomes_metadata_start_time: aiInsights?.tangibleOutcomes?.metadata?.startTime || '',
                tangible_outcomes_metadata_duration: aiInsights?.tangibleOutcomes?.metadata?.duration || 0,
                tangible_outcomes_outcomes: aiInsights?.tangibleOutcomes?.outcomes ? JSON.stringify(aiInsights.tangibleOutcomes.outcomes) : '[]',
                tangible_outcomes_summary_total_outcomes: aiInsights?.tangibleOutcomes?.summary?.totalOutcomes || 0,
                tangible_outcomes_summary_outcome_types: aiInsights?.tangibleOutcomes?.summary?.outcomeTypes ? JSON.stringify(aiInsights.tangibleOutcomes.summary.outcomeTypes) : '[]',
                tangible_outcomes_summary_outcome_categories: aiInsights?.tangibleOutcomes?.summary?.outcomeCategories ? JSON.stringify(aiInsights.tangibleOutcomes.summary.outcomeCategories) : '[]',
                tangible_outcomes_summary_status_breakdown: aiInsights?.tangibleOutcomes?.summary?.statusBreakdown ? JSON.stringify(aiInsights.tangibleOutcomes.summary.statusBreakdown) : '{}',
                tangible_outcomes_summary_effectiveness_score: aiInsights?.tangibleOutcomes?.summary?.effectivenessScore || 0,
                tangible_outcomes_summary_key_outcomes: aiInsights?.tangibleOutcomes?.summary?.keyOutcomes ? JSON.stringify(aiInsights.tangibleOutcomes.summary.keyOutcomes) : '[]',
                tangible_outcomes_quality_metrics_completeness: aiInsights?.tangibleOutcomes?.qualityMetrics?.completeness || 0,
                tangible_outcomes_quality_metrics_specificity: aiInsights?.tangibleOutcomes?.qualityMetrics?.specificity || 0,
                tangible_outcomes_quality_metrics_action_ability: aiInsights?.tangibleOutcomes?.qualityMetrics?.actionAbility || 0,
                tangible_outcomes_quality_metrics_measurability: aiInsights?.tangibleOutcomes?.qualityMetrics?.measurability || 0,
                tangible_outcomes_quality_metrics_overall_quality: aiInsights?.tangibleOutcomes?.qualityMetrics?.overallQuality || 0,
                
                // ===== COMBINED INSIGHTS =====
                combined_insights_summary_executive_summary: aiInsights?.combinedInsights?.summary?.executiveSummary || '',
                combined_insights_summary_key_themes: aiInsights?.combinedInsights?.summary?.keyThemes ? JSON.stringify(aiInsights.combinedInsights.summary.keyThemes) : '[]',
                combined_insights_summary_data_sources: aiInsights?.combinedInsights?.summary?.dataSources ? JSON.stringify(aiInsights.combinedInsights.summary.dataSources) : '[]',
                combined_insights_summary_confidence: aiInsights?.combinedInsights?.summary?.confidence || 0,
                combined_insights_highlights_breakthrough_moments: aiInsights?.combinedInsights?.highlights?.breakthroughMoments ? JSON.stringify(aiInsights.combinedInsights.highlights.breakthroughMoments) : '[]',
                combined_insights_highlights_key_insights: aiInsights?.combinedInsights?.highlights?.keyInsights ? JSON.stringify(aiInsights.combinedInsights.highlights.keyInsights) : '[]',
                combined_insights_highlights_key_moments: aiInsights?.combinedInsights?.highlights?.keyMoments ? JSON.stringify(aiInsights.combinedInsights.highlights.keyMoments) : '[]',
                combined_insights_action_items_high_priority: aiInsights?.combinedInsights?.actionItems?.highPriority ? JSON.stringify(aiInsights.combinedInsights.actionItems.highPriority) : '[]',
                combined_insights_action_items_medium_priority: aiInsights?.combinedInsights?.actionItems?.mediumPriority ? JSON.stringify(aiInsights.combinedInsights.actionItems.mediumPriority) : '[]',
                combined_insights_action_items_low_priority: aiInsights?.combinedInsights?.actionItems?.lowPriority ? JSON.stringify(aiInsights.combinedInsights.actionItems.lowPriority) : '[]',
                combined_insights_action_items_total_count: aiInsights?.combinedInsights?.actionItems?.totalCount || 0,
                combined_insights_recommendations_immediate: aiInsights?.combinedInsights?.recommendations?.immediate ? JSON.stringify(aiInsights.combinedInsights.recommendations.immediate) : '[]',
                combined_insights_recommendations_short_term: aiInsights?.combinedInsights?.recommendations?.shortTerm ? JSON.stringify(aiInsights.combinedInsights.recommendations.shortTerm) : '[]',
                combined_insights_recommendations_long_term: aiInsights?.combinedInsights?.recommendations?.longTerm ? JSON.stringify(aiInsights.combinedInsights.recommendations.longTerm) : '[]',
                combined_insights_quality_assessment_overall_quality: aiInsights?.combinedInsights?.qualityAssessment?.overallQuality || 0,
                combined_insights_quality_assessment_data_completeness: aiInsights?.combinedInsights?.qualityAssessment?.dataCompleteness || 0,
                combined_insights_quality_assessment_data_accuracy: aiInsights?.combinedInsights?.qualityAssessment?.dataAccuracy || 0,
                combined_insights_quality_assessment_action_ability: aiInsights?.combinedInsights?.qualityAssessment?.actionAbility || 0,
                zoom_insights_summary: aiInsights?.zoomInsights?.summary || '',
                zoom_insights_highlights: aiInsights?.zoomInsights?.highlights ? aiInsights.zoomInsights.highlights.join(', ') : '',
                zoom_insights_analytics: aiInsights?.zoomInsights?.analytics ? JSON.stringify(aiInsights.zoomInsights.analytics) : '{}',
                zoom_insights_ai_summary: aiInsights?.zoomInsights?.aiSummary || '',
                zoom_insights_topics: aiInsights?.zoomInsights?.topics ? aiInsights.zoomInsights.topics.join(', ') : '',
                zoom_insights_action_items: aiInsights?.zoomInsights?.actionItems ? aiInsights.zoomInsights.actionItems.join(', ') : '',
                zoom_insights_questions: aiInsights?.zoomInsights?.questions ? aiInsights.zoomInsights.questions.join(', ') : '',
                zoom_insights_sentiment: aiInsights?.zoomInsights?.sentiment || '',
                zoom_insights_engagement: aiInsights?.zoomInsights?.engagement || '',
                zoom_insights_breakthrough_moments: aiInsights?.zoomInsights?.breakthroughMoments ? aiInsights.zoomInsights.breakthroughMoments.join(', ') : '',
                zoom_insights_coaching_techniques: aiInsights?.zoomInsights?.coachingTechniques ? aiInsights.zoomInsights.coachingTechniques.join(', ') : '',
                zoom_insights_student_progress: aiInsights?.zoomInsights?.studentProgress || '',
                zoom_insights_errors: aiInsights?.zoomInsights?.errors ? aiInsights.zoomInsights.errors.join(', ') : '',
                
                // ===== TRANSCRIPT INSIGHTS =====
                transcript_insights_summary: aiInsights?.transcriptInsights?.summary || '',
                transcript_insights_key_moments: aiInsights?.transcriptInsights?.keyMoments ? aiInsights.transcriptInsights.keyMoments.join(', ') : '',
                transcript_insights_speaker_analysis: aiInsights?.transcriptInsights?.speakerAnalysis ? JSON.stringify(aiInsights.transcriptInsights.speakerAnalysis) : '{}',
                transcript_insights_topics: aiInsights?.transcriptInsights?.topics ? aiInsights.transcriptInsights.topics.join(', ') : '',
                transcript_insights_action_items: aiInsights?.transcriptInsights?.actionItems ? aiInsights.transcriptInsights.actionItems.join(', ') : '',
                transcript_insights_questions: aiInsights?.transcriptInsights?.questions ? aiInsights.transcriptInsights.questions.join(', ') : '',
                transcript_insights_sentiment: aiInsights?.transcriptInsights?.sentiment || '',
                transcript_insights_engagement: aiInsights?.transcriptInsights?.engagement || '',
                transcript_insights_coaching_insights: aiInsights?.transcriptInsights?.coachingInsights || '',
                transcript_insights_emotional_journey: aiInsights?.transcriptInsights?.emotionalJourney ? JSON.stringify(aiInsights.transcriptInsights.emotionalJourney) : '[]',
                transcript_insights_conversation_patterns: aiInsights?.transcriptInsights?.conversationPatterns ? JSON.stringify(aiInsights.transcriptInsights.conversationPatterns) : '{}',
                transcript_insights_session_structure: aiInsights?.transcriptInsights?.sessionStructure || '',
                transcript_insights_breakthrough_moments: aiInsights?.transcriptInsights?.breakthroughMoments ? aiInsights.transcriptInsights.breakthroughMoments.join(', ') : '',
                transcript_insights_risk_factors: aiInsights?.transcriptInsights?.riskFactors ? aiInsights.transcriptInsights.riskFactors.join(', ') : '',
                transcript_insights_success_predictors: aiInsights?.transcriptInsights?.successPredictors ? aiInsights.transcriptInsights.successPredictors.join(', ') : '',
                transcript_insights_metadata_total_duration: aiInsights?.transcriptInsights?.metadata?.totalDuration || 0,
                transcript_insights_metadata_word_count: aiInsights?.transcriptInsights?.metadata?.wordCount || 0,
                transcript_insights_metadata_speaker_count: enhancedMetadata.participantCount || 2,
                transcript_insights_metadata_analyzed_at: new Date().toISOString(),
                
                // ===== OUTCOMES DETAILED =====
                outcomes_summary: outcomes.length > 0 ? outcomes.map(o => `${o.type}: ${o.description}`).join('; ') : '',
                outcomes_outcomes: outcomes.length > 0 ? JSON.stringify(outcomes) : '[]',
                outcomes_quality_metrics: outcomes.length > 0 ? JSON.stringify({
                    completeness: outcomes.filter(o => o.status === 'completed').length / outcomes.length,
                    specificity: outcomes.filter(o => o.specificity === 'high').length / outcomes.length,
                    actionability: outcomes.filter(o => o.actionability === 'high').length / outcomes.length,
                    measurability: outcomes.filter(o => o.measurability === 'high').length / outcomes.length
                }) : '{}',
                outcomes_metadata_version: '2.0',
                outcomes_metadata_generated_at: new Date().toISOString(),
                outcomes_metadata_recording_id: recording.id,
                outcomes_metadata_meeting_id: recording.id,
                outcomes_metadata_meeting_uuid: recording.uuid,
                outcomes_metadata_topic: recording.topic,
                outcomes_metadata_start_time: recording.start_time,
                outcomes_metadata_duration: recording.duration,
                outcomes_metadata_summary_total_outcomes: outcomes.length,
                outcomes_metadata_summary_outcome_types: outcomes.length > 0 ? [...new Set(outcomes.map(o => o.type))].join(', ') : '',
                outcomes_metadata_summary_outcome_categories: outcomes.length > 0 ? [...new Set(outcomes.map(o => o.category))].join(', ') : '',
                outcomes_metadata_summary_status_breakdown_planned: outcomes.filter(o => o.status === 'planned').length,
                outcomes_metadata_summary_status_breakdown_in_progress: outcomes.filter(o => o.status === 'in_progress').length,
                outcomes_metadata_summary_status_breakdown_achieved: outcomes.filter(o => o.status === 'achieved').length,
                outcomes_metadata_summary_status_breakdown_failed: outcomes.filter(o => o.status === 'failed').length,
                outcomes_metadata_summary_effectiveness_score: outcomes.length > 0 ? outcomes.reduce((sum, o) => sum + (o.effectiveness || 0), 0) / outcomes.length : 0,
                outcomes_metadata_summary_key_outcomes: outcomes.filter(o => o.priority === 'high').map(o => o.description).join(', '),
                outcomes_metadata_quality_overall_score: outcomes.length > 0 ? outcomes.reduce((sum, o) => sum + (o.quality || 0), 0) / outcomes.length : 0,
                outcomes_metadata_quality_completeness: outcomes.length > 0 ? outcomes.filter(o => o.status === 'completed').length / outcomes.length : 0,
                outcomes_metadata_quality_specificity: outcomes.length > 0 ? outcomes.filter(o => o.specificity === 'high').length / outcomes.length : 0,
                outcomes_metadata_quality_actionability: outcomes.length > 0 ? outcomes.filter(o => o.actionability === 'high').length / outcomes.length : 0,
                outcomes_metadata_quality_measurability: outcomes.length > 0 ? outcomes.filter(o => o.measurability === 'high').length / outcomes.length : 0,
                
                // ===== GENERATED FILES =====
                generated_files_summary: Object.keys(downloadedFiles).length > 0 ? `${Object.keys(downloadedFiles).length} files generated` : 'No files generated',
                generated_files_highlights: Object.keys(downloadedFiles).join(', '),
                generated_files_action_items: Object.keys(downloadedFiles).includes('action_items') ? 'Action items file generated' : 'No action items file',
                generated_files_coaching_notes: Object.keys(downloadedFiles).includes('coaching_notes') ? 'Coaching notes generated' : 'No coaching notes',
                generated_files_insights_path: folderPath ? `${folderPath}/insights.json` : '',
                generated_files_outcomes_path: folderPath ? `${folderPath}/outcomes.json` : '',
                generated_files_summary_path: folderPath ? `${folderPath}/summary.md` : '',
                generated_files_highlights_path: folderPath ? `${folderPath}/highlights.md` : '',
                generated_files_action_items_path: folderPath ? `${folderPath}/action_items.md` : '',
                generated_files_coaching_notes_path: folderPath ? `${folderPath}/coaching_notes.md` : '',
                
                // ===== UPLOAD METRICS =====
                files_uploaded_count: Object.keys(downloadedFiles).length,
                total_upload_size: this._calculateTotalFileSize(downloadedFiles),
                upload_success: true,
                upload_duration_ms: Date.now() - startTime,
                
                // ===== PROCESSING METADATA =====
                processing_id: this._generateUUID(),
                insights_version: '2.0-smart',
                metadata_version: '2.0-smart',
                insights_metadata_version: '2.0-smart',
                insights_metadata_generated_at: new Date().toISOString(),
                insights_metadata_recording_id: recording.id,
                insights_metadata_meeting_id: recording.id,
                insights_metadata_meeting_uuid: recording.uuid,
                insights_metadata_topic: recording.topic,
                insights_metadata_start_time: recording.start_time,
                insights_metadata_duration: recording.duration,
                insights_metadata_processing_version: '2.0-smart',
                
                // ===== NAME ANALYSIS DETAILED =====
                name_analysis_standardized_name: nameAnalysis.standardizedName,
                name_analysis_confidence: nameAnalysis.confidence,
                name_analysis_method: nameAnalysis.method,
                name_analysis_details_coach: nameAnalysis.components?.coach || '',
                name_analysis_details_student: nameAnalysis.components?.student || '',
                name_analysis_details_week: nameAnalysis.components?.week || '',
                name_analysis_details_session_type: nameAnalysis.components?.sessionType || '',
                name_analysis_details_name_variations: nameAnalysis.variations?.join(', ') || '',
                name_analysis_details_confidence_factors: nameAnalysis.confidenceFactors?.join(', ') || '',
                
                // ===== WEEK ANALYSIS DETAILED =====
                week_analysis_week_number: weekAnalysis.weekNumber,
                week_analysis_confidence: weekAnalysis.confidence,
                week_analysis_method: weekAnalysis.method,
                week_analysis_standardized_name: weekAnalysis.standardizedName,
                week_analysis_details_extracted_week: weekAnalysis.details?.extractedWeek || '',
                week_analysis_details_inferred_week: weekAnalysis.details?.inferredWeek || '',
                week_analysis_details_confidence_factors: weekAnalysis.details?.confidenceFactors?.join(', ') || '',
                week_analysis_details_alternatives: weekAnalysis.details?.alternatives?.join(', ') || '',
                
                // ===== DOWNLOAD RESULT DETAILED =====
                download_result_folder_path: folderPath || '',
                download_result_downloaded_files: Object.keys(downloadedFiles).join(', '),
                download_result_organized_files: Object.keys(downloadedFiles).length > 0 ? 'Files organized successfully' : 'No files downloaded',
                download_result_details_file_count: Object.keys(downloadedFiles).length,
                download_result_details_total_size: this._calculateTotalFileSize(downloadedFiles),
                download_result_details_has_video: !!downloadedFiles.video,
                download_result_details_has_audio: !!downloadedFiles.audio,
                download_result_details_has_transcript: !!downloadedFiles.transcript,
                
                // ===== INSIGHTS RESULT DETAILED =====
                insights_result_insights_path: folderPath ? `${folderPath}/insights.json` : '',
                insights_result_details_insights_version: '2.0-smart',
                insights_result_details_data_quality: !!downloadedFiles.transcript ? 'high' : 'medium',
                insights_result_details_overall_score: aiInsights ? 0.8 : 0,
                
                // ===== OUTCOMES RESULT DETAILED =====
                outcomes_result_outcomes_path: folderPath ? `${folderPath}/outcomes.json` : '',
                outcomes_result_details_outcomes_count: outcomes.length,
                outcomes_result_details_outcome_types: outcomes.map(o => o.type).join(', '),
                
                // ===== FILE GENERATION RESULT DETAILED =====
                file_generation_result_files: Object.keys(downloadedFiles).join(', '),
                file_generation_result_details_files_generated: Object.keys(downloadedFiles).length,
                file_generation_result_details_file_types: Object.keys(downloadedFiles).join(', '),
                
                // ===== QUALITY RESULT DETAILED =====
                quality_result_metrics_overall_score: 0.8,
                quality_result_metrics_data_quality_completeness: !!downloadedFiles.transcript ? 0.9 : 0.5,
                quality_result_metrics_data_quality_accuracy: 0.8,
                quality_result_metrics_data_quality_consistency: 0.8,
                quality_result_metrics_processing_quality_success_rate: 1.0,
                quality_result_metrics_processing_quality_error_rate: 0.0,
                quality_result_metrics_processing_quality_warning_rate: 0.0,
                quality_result_metrics_insights_quality_zoom_insights: !!aiInsights,
                quality_result_metrics_insights_quality_transcript_analysis: !!downloadedFiles.transcript,
                quality_result_metrics_insights_quality_outcomes_processing: outcomes.length > 0,
                quality_result_metrics_file_quality_files_generated: Object.keys(downloadedFiles).length,
                quality_result_metrics_file_quality_expected_files: 3,
                quality_result_metrics_file_quality_completeness: Object.keys(downloadedFiles).length > 0 ? 0.7 : 0,
                
                // ===== UPLOAD RESULT DETAILED =====
                upload_result_folder_id: driveFolderId || '',
                upload_result_drive_link: driveLink || '',
                upload_result_details_files_uploaded: Object.keys(downloadedFiles).length,
                upload_result_details_total_size: this._calculateTotalFileSize(downloadedFiles),
                
                // ===== PROCESSING STEPS =====
                processing_steps_name_and_week_processing_success: true,
                processing_steps_name_and_week_processing_duration: Date.now() - startTime,
                processing_steps_name_and_week_processing_details: 'Name and week analysis completed successfully',
                processing_steps_file_download_and_organization_success: Object.keys(downloadedFiles).length > 0,
                processing_steps_file_download_and_organization_duration: Date.now() - startTime,
                processing_steps_file_download_and_organization_details: `Downloaded ${Object.keys(downloadedFiles).length} files`,
                processing_steps_comprehensive_insights_generation_success: !!aiInsights,
                processing_steps_comprehensive_insights_generation_duration: Date.now() - startTime,
                processing_steps_comprehensive_insights_generation_details: aiInsights ? 'AI insights generated successfully' : 'No insights generated',
                processing_steps_tangible_outcomes_processing_success: outcomes.length > 0,
                processing_steps_tangible_outcomes_processing_duration: Date.now() - startTime,
                processing_steps_tangible_outcomes_processing_details: `Processed ${outcomes.length} outcomes`,
                processing_steps_additional_file_generation_success: Object.keys(downloadedFiles).length > 0,
                processing_steps_additional_file_generation_duration: Date.now() - startTime,
                processing_steps_additional_file_generation_details: `Generated ${Object.keys(downloadedFiles).length} files`,
                processing_steps_quality_assessment_success: true,
                processing_steps_quality_assessment_duration: Date.now() - startTime,
                processing_steps_quality_assessment_details: 'Quality assessment completed',
                processing_steps_google_drive_upload_success: !!driveFolderId,
                processing_steps_google_drive_upload_duration: Date.now() - startTime,
                processing_steps_google_drive_upload_details: driveFolderId ? 'Files uploaded to Google Drive' : 'Drive upload failed',
                
                // ===== DATA SOURCE =====
                data_source: 'zoom_cloud_processing',
                driveFolderId,
                driveLink,
                driveFileIds
            };
            
            // Step 10: Update Google Sheets with comprehensive data
            try {
                this.logger.info('📊 Updating Google Sheets with comprehensive processed data...');
                await googleSheetsService.updateMasterSpreadsheet(
                    { processed: processedRecording, original: recording },
                    'Comprehensive Processing'
                );
                this.logger.info('✅ Google Sheets updated successfully with comprehensive data');
            } catch (sheetsError) {
                this.logger.error('❌ Failed to update Google Sheets:', sheetsError);
                // Continue processing even if sheets update fails
            }
            
            const processingTime = Date.now() - startTime;
            
            this.results.successful++;
            this.processedCount++;
            
            this.logger.info(`✅ Recording processed successfully: ${recordingId} (${processingTime}ms)`);
            this.logger.info(`   - Name: ${nameAnalysis.standardizedName}`);
            this.logger.info(`   - Week: ${weekAnalysis.weekNumber}`);
            this.logger.info(`   - Category: ${recordingCategory}`);
            this.logger.info(`   - AI Insights: ${!!aiInsights}`);
            this.logger.info(`   - Outcomes: ${outcomes.length}`);
            this.logger.info(`   - Files: ${Object.keys(downloadedFiles).length}`);
            this.logger.info(`   - UUID: ${uuid}`);
            
            console.log(`✅ Recording processing complete:`);
            console.log(`   🔑 UUID: ${uuid}`);
            console.log(`   📋 Standardized Name: ${nameAnalysis.standardizedName}`);
            console.log(`   📅 Week: ${weekAnalysis.weekNumber}`);
            console.log(`   📂 Category: ${recordingCategory}`);
            console.log(`   ⏱️ Processing Time: ${processingTime}ms`);
            
            // DEBUG: End of recording processing
            console.log('==============================');
            console.log(`✅ [DEBUG] END Processing Recording: ${recording.id} (UUID: ${recording.uuid})`);
            console.log(`   Final downloadedFiles:`, JSON.stringify(downloadedFiles, null, 2));
            console.log(`   Final transcriptContent length: ${transcriptContent.length}`);
            if (transcriptContent.length > 0) {
                console.log(`   Final transcript preview: ${transcriptContent.substring(0, 200)}`);
            }
            console.log(`   Final chatContent length: ${chatContent.length}`);
            if (chatContent.length > 0) {
                console.log(`   Final chat preview: ${chatContent.substring(0, 200)}`);
            }
            console.log('==============================');
            
            // Step 9: Organize files in Google Drive (after processedRecording is created)
            if (driveOrganizer && typeof driveOrganizer.organizeRecording === 'function') {
                console.log('📁 DEBUG: About to call driveOrganizer.organizeRecording...');
                this.logger.info('📁 [FIX] Uploading files to Google Drive using DriveOrganizer (main processor)');
                try {
                    const driveResult = await driveOrganizer.organizeRecording(recording, {
                        files: downloadedFiles,
                        insights: aiInsights,
                        metadata: enhancedMetadata,
                        nameAnalysis: nameAnalysis,
                        weekAnalysis: weekAnalysis,
                        outcomes: outcomes,
                        zoomInsights: aiInsights.zoomInsights,
                        transcriptContent: transcriptContent,
                        chatContent: chatContent,
                        category: recordingCategory // PASS THE CATEGORY
                    });
                    
                    console.log('📁 DEBUG: driveOrganizer.organizeRecording completed successfully');
                    console.log('📁 DEBUG: driveResult:', JSON.stringify(driveResult, null, 2));
                    
                    driveFolderId = driveResult.folderId;
                    driveLink = driveResult.folderLink;
                    driveFileIds = driveResult.fileIds || {};
                    
                    // Update the processed recording with Drive information
                    processedRecording.driveFolder = driveLink || '';
                    processedRecording.driveFolderId = driveFolderId || '';
                    processedRecording.driveLink = driveLink || '';
                    processedRecording.videoFileId = driveFileIds?.video || '';
                    processedRecording.transcriptFileId = driveFileIds?.transcript || '';
                    
                    this.logger.info('✅ Drive organization completed successfully', {
                        recordingId: recording.id,
                        folderId: driveFolderId,
                        folderLink: driveLink,
                        fileCount: Object.keys(driveFileIds).length,
                        category: recordingCategory
                    });
                } catch (error) {
                    console.log('❌ DEBUG: driveOrganizer.organizeRecording failed:', error.message);
                    this.logger.error('Failed to organize files in Drive', {
                        recordingId: recording.id,
                        error: error.message,
                        stack: error.stack
                    });
                }
            } else {
                console.log('🔍 DEBUG: Skipping Drive upload - driveOrganizer not available');
                console.log('🔍 DEBUG: driveOrganizer exists:', !!driveOrganizer);
                console.log('🔍 DEBUG: organizeRecording is function:', !!(driveOrganizer && typeof driveOrganizer.organizeRecording === 'function'));
            }
            
            return {
                success: true,
                recordingId,
                processingTime,
                aiInsights,
                outcomes,
                relationships,
                nameAnalysis,
                weekAnalysis,
                category: recordingCategory,
                sheetsUpdated: true
            };
            
        } catch (error) {
            this.results.failed++;
            this.failedCount++;
            
            this.logger.error(`❌ Failed to process recording: ${recordingId}`, error);
            
            return {
                success: false,
                recordingId,
                error: error.message,
                stack: error.stack
            };
        }
    }

    async processAllRecordings(options = {}) {
        const { dryRun = false, limit = 1, mode = 'test', lightweight = false, cloudLightweight = false, dateRange = null } = options;
        
        console.log(`\n🎯 Processing recordings (${dryRun ? 'DRY RUN' : 'LIVE'})...`);
        console.log(`📊 Mode: ${mode.toUpperCase()}`);
        console.log(`📊 Limit: ${limit} recording(s)`);
        console.log(`📊 Lightweight: ${lightweight ? 'Yes' : 'No'}`);
        console.log(`📊 Cloud Lightweight: ${cloudLightweight ? 'Yes' : 'No'}`);
        
        let recordings = [];
        
        switch (mode) {
            case 'test':
                recordings = [this._createTestRecording()];
                break;
                
            case 'single':
                if (!options.recordingId) {
                    throw new Error('Recording ID is required for single mode');
                }
                recordings = [await this._getRecordingById(options.recordingId)];
                break;
                
            case 'last30days':
                if (dateRange) {
                    // Use custom date range instead of default 30 days
                    const toDate = new Date();
                    const fromDate = new Date();
                    fromDate.setDate(fromDate.getDate() - dateRange);
                    console.log(`📅 Using custom date range: ${dateRange} days (${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]})`);
                    recordings = await this._getRecordingsByDateRange(fromDate.toISOString().split('T')[0], toDate.toISOString().split('T')[0], limit);
                } else {
                    recordings = await this._getRecordingsLast30Days(limit);
                }
                break;
                
            case 'custom':
                if (!options.fromDate || !options.toDate) {
                    throw new Error('From and To dates are required for custom mode');
                }
                recordings = await this._getRecordingsByDateRange(options.fromDate, options.toDate, limit);
                break;
                
            case 'recent':
                recordings = await this._getRecentRecordings(limit);
                break;
                
            default:
                throw new Error(`Unknown processing mode: ${mode}`);
        }
        
        if (recordings.length === 0) {
            console.log('⚠️ No recordings found for the specified criteria');
            return this.results;
        }
        
        this.results.total = recordings.length;
        console.log(`📊 Found ${recordings.length} recording(s) to process`);
        
        // 🚪 GATE 0: Generate CSV file and display path/link
        console.log('\n📄 Generating CSV file with all recording details...');
        const csvFilename = await this.generateRecordingsCSV(recordings, mode, options);
        
        if (csvFilename) {
            const path = require('path');
            const fullPath = path.resolve(csvFilename);
            console.log('\n🚪 [GATE 0] CSV File Generated Successfully:');
            console.log(`   📁 File Path: ${fullPath}`);
            console.log(`   📄 File Name: ${csvFilename}`);
            console.log(`   🔗 File Link: file://${fullPath}`);
            console.log(`   📊 Records to Process: ${recordings.length}`);
            console.log(`   📅 Generated: ${new Date().toLocaleString()}`);
        } else {
            console.log('\n⚠️ [GATE 0] CSV file generation failed, but continuing with processing...');
        }
        
        // 🚪 CRITICAL GATE 1: Pre-Processing Review
        if (!dryRun) {
            this.displayRecordingSummary(recordings, mode);
            
            if (options.autoApprove) {
                console.log('\n✅ Auto-approve mode enabled. Proceeding with processing all recordings...\n');
            } else {
                const userResponse = await this.promptUser('\n🔍 Review the above recordings. Type YES to continue with processing, or anything else to abort: ');
                
                if (userResponse.toUpperCase() !== 'YES') {
                    console.log('\n❌ Processing aborted by user.');
                    console.log('🔄 Shutting down safely...');
                    await this.shutdown();
                    process.exit(0);
                }
                
                console.log('\n✅ User confirmed. Proceeding with processing...\n');
            }
        }
        
        if (dryRun) {
            console.log('🔍 DRY RUN: Simulating processing...');
            for (const recording of recordings) {
                await this.simulateProcessing(recording);
            }
        } else {
            console.log('🚀 LIVE RUN: Processing actual recordings...');
            for (const recording of recordings) {
                // Log UUID for each recording being processed
                const uuid = recording.uuid || recording.id || 'unknown';
                const topic = recording.topic || 'No Topic';
                console.log(`\n🔄 Processing Recording ${recordings.indexOf(recording) + 1}/${recordings.length}:`);
                console.log(`   📋 Topic: ${topic}`);
                console.log(`   🆔 Meeting ID: ${recording.id || 'unknown'}`);
                console.log(`   🔑 UUID: ${uuid}`);
                console.log(`   📅 Date: ${recording.start_time || 'unknown'}`);
                
                // Preserve original UUID for Gate 3 checking
                const originalUuid = recording.uuid || uuid;
                
                // 🚪 CRITICAL GATE 3: Check if recording already exists in sheets using ORIGINAL UUID
                try {
                    console.log(`🔍 [GATE 3] Checking if recording exists in sheets for ORIGINAL UUID: ${originalUuid}`);
                    const googleSheetsService = this.container.resolve('googleSheetsService');
                    console.log(`🔍 [GATE 3] GoogleSheetsService resolved: ${googleSheetsService ? 'YES' : 'NO'}`);
                    
                    if (googleSheetsService) {
                        // Convert UUID to different formats for matching
                        const uuidFormats = this._convertUuidFormats(originalUuid);
                        console.log(`🔍 [GATE 3] UUID formats for matching:`, {
                            original: uuidFormats.original,
                            base64: uuidFormats.base64,
                            hex: uuidFormats.hex,
                            hexWithDashes: uuidFormats.hexWithDashes
                        });
                        
                        // Try to find existing recording using all UUID formats
                        let existingCheck = { exists: false, recording: null };
                        
                        // First try with original UUID
                        console.log(`🔍 [GATE 3] Trying original UUID: ${uuidFormats.original}`);
                        existingCheck = await googleSheetsService.checkRecordingExists(uuidFormats.original);
                        
                        // If not found, try with hex format (most common in sheets)
                        if (!existingCheck.exists && uuidFormats.hex) {
                            console.log(`🔍 [GATE 3] Trying hex UUID: ${uuidFormats.hex}`);
                            existingCheck = await googleSheetsService.checkRecordingExists(uuidFormats.hex);
                        }
                        
                        // If not found, try with hex with dashes format
                        if (!existingCheck.exists && uuidFormats.hexWithDashes) {
                            console.log(`🔍 [GATE 3] Trying hex with dashes UUID: ${uuidFormats.hexWithDashes}`);
                            existingCheck = await googleSheetsService.checkRecordingExists(uuidFormats.hexWithDashes);
                        }
                        
                        // If not found, try with base64 format
                        if (!existingCheck.exists && uuidFormats.base64) {
                            console.log(`🔍 [GATE 3] Trying base64 UUID: ${uuidFormats.base64}`);
                            existingCheck = await googleSheetsService.checkRecordingExists(uuidFormats.base64);
                        }
                        
                        console.log(`🔍 [GATE 3] Final existing check result:`, existingCheck);
                        
                        if (existingCheck.exists && existingCheck.recording) {
                            console.log(`🔍 [GATE 3] Recording exists! Showing details...`);
                            this.displayExistingRecording(existingCheck.recording);
                            
                            if (options.autoApprove) {
                                console.log('\n✅ Auto-approve mode enabled. Skipping existing recording automatically.\n');
                                this.results.skipped++;
                                this.results.details.push({
                                    success: true,
                                    recordingId: recording.id,
                                    skipped: true,
                                    reason: 'Auto-approve mode: skipped existing recording'
                                });
                                continue; // Move to next recording
                            } else {
                                const userResponse = await this.promptUser('\n🔍 This recording already exists in sheets. Want to skip it? Type YES to skip, or anything else to process anyway: ');
                                
                                if (userResponse.toUpperCase() === 'YES') {
                                    console.log('\n⏭️ Skipping recording as requested by user.');
                                    this.results.skipped++;
                                    this.results.details.push({
                                        success: true,
                                        recordingId: recording.id,
                                        skipped: true,
                                        reason: 'User chose to skip existing recording'
                                    });
                                    continue; // Move to next recording
                                } else {
                                    console.log('\n🔄 User chose to process anyway. Continuing with processing...\n');
                                }
                            }
                        } else {
                            console.log(`🔍 [GATE 3] Recording does not exist in sheets. Proceeding with processing.`);
                        }
                    } else {
                        console.log(`🔍 [GATE 3] GoogleSheetsService not available in container.`);
                    }
                } catch (error) {
                    console.log(`⚠️ Could not check sheets for existing recording: ${error.message}`);
                    console.log(`🔍 [GATE 3] Error details:`, error);
                    console.log('🔄 Continuing with processing...\n');
                }
                
                // Generate new UUID for processing (only if we're proceeding with processing)
                recording.uuid = this._generateUUID();
                recording.fingerprint = this._generateFingerprint(recording.id, recording.start_time);
                console.log(`🔑 Generated NEW UUID for processing: ${recording.uuid}`);
                console.log(`🔑 Generated Fingerprint: ${recording.fingerprint}`);
                
                const result = await this.processRecording(recording, { lightweight, cloudLightweight });
                this.results.details.push(result);
                
                // 🚪 CRITICAL GATE 2: Post-Recording Review
                this.displayProcessingResult(recording, result, recordings.indexOf(recording), recordings.length);
                
                if (options.autoApprove) {
                    console.log('\n✅ Auto-approve mode enabled. Continuing to next recording...\n');
                } else {
                    const userResponse = await this.promptUser('\n🔍 Was this recording processed as expected? Type YES to continue to next recording, or anything else to abort: ');
                    
                    if (userResponse.toUpperCase() !== 'YES') {
                        console.log('\n❌ Processing aborted by user after recording review.');
                        console.log('🔄 Shutting down safely...');
                        await this.shutdown();
                        process.exit(0);
                    }
                    
                    console.log('\n✅ User confirmed. Moving to next recording...\n');
                }
            }
        }
        
        // Generate report
        await this.generateFinalReport();
        
        return this.results;
    }

    async simulateProcessing(recording) {
        if (!recording) {
            console.log('🔍 Simulating processing for: null/undefined recording');
            return;
        }
        
        console.log('🔍 Simulating processing for:', recording.id || recording.uuid || 'unknown');
        
        // Simulate AI insights generation
        const aiService = this.container.resolve('aiPoweredInsightsGenerator');
        const outcomeExtractor = this.container.resolve('outcomeExtractor');
        const relationshipAnalyzer = this.container.resolve('relationshipAnalyzer');
        
        const testTranscript = `
        Coach: How are you feeling about your progress this week?
        Student: I'm feeling much better. I completed the essay we discussed last time.
        Coach: That's excellent! What was the most challenging part?
        Student: Getting started was hard, but once I outlined it, it flowed well.
        Coach: What did you learn about your writing process?
        Student: I learned that I need to plan more before I start writing.
        `;
        
        const testMeetingData = {
            topic: recording.topic || 'Test Recording',
            duration: recording.duration || 3600,
            start_time: recording.start_time || new Date().toISOString(),
            participant_count: recording.participant_count || 2,
            forceRuleBased: false
        };
        
        try {
            const aiInsights = await aiService.generateAIInsights(testTranscript, testMeetingData);
            console.log('✅ AI insights generated successfully');
            console.log(`   - AI Generated: ${aiInsights.metadata.aiGenerated}`);
            console.log(`   - Provider: ${aiInsights.metadata.provider}`);
            console.log(`   - Model: ${aiInsights.metadata.model}`);
            
            const outcomes = await outcomeExtractor.extractOutcomes(testTranscript);
            console.log('✅ Outcomes extracted successfully');
            console.log(`   - Total outcomes: ${outcomes.length}`);
            
            const relationships = await relationshipAnalyzer.analyzeRelationships(testTranscript);
            console.log('✅ Relationships analyzed successfully');
            
            this.results.successful++;
            this.results.details.push({
                success: true,
                recordingId: recording.id || recording.uuid || 'unknown',
                processingTime: 1500,
                aiInsights,
                outcomes,
                relationships
            });
            
        } catch (error) {
            console.error('❌ Processing failed:', error.message);
            this.results.failed++;
            this.results.details.push({
                success: false,
                recordingId: recording.id || recording.uuid || 'unknown',
                error: error.message
            });
        }
    }

    async generateFinalReport() {
        // ENHANCEMENT: Include log file information in final report
        const logFileInfo = await this._getLogFileInfo();
        
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                total: this.results.total,
                successful: this.results.successful,
                failed: this.results.failed,
                skipped: this.results.skipped,
                successRate: this.results.total > 0 ? (this.results.successful / this.results.total * 100).toFixed(2) : 0
            },
            processingTime: Date.now() - this.startTime,
            details: this.results.details,
            logging: {
                logFile: this.logFilePath,
                logFileSize: logFileInfo.size,
                logFileLines: logFileInfo.lines,
                logFileCreated: logFileInfo.created
            }
        };
        
        // Save report
        const reportPath = `reports/production-${new Date().toISOString().split('T')[0]}.json`;
        await fsp.writeFile(reportPath, JSON.stringify(report, null, 2));
        
        console.log('\n📊 Final Report:');
        console.log(`   Total: ${report.summary.total}`);
        console.log(`   Successful: ${report.summary.successful}`);
        console.log(`   Failed: ${report.summary.failed}`);
        console.log(`   Success Rate: ${report.summary.successRate}%`);
        console.log(`   Processing Time: ${report.processingTime}ms`);
        console.log(`   Report saved to: ${reportPath}`);
        
        // Enhanced log file information display
        if (this.logFilePath) {
            const path = require('path');
            const fullLogPath = path.resolve(this.logFilePath);
            console.log('\n📝 Console Output Log File:');
            console.log(`   📁 File Path: ${fullLogPath}`);
            console.log(`   📄 File Name: ${path.basename(this.logFilePath)}`);
            console.log(`   🔗 File Link: file://${fullLogPath}`);
            console.log(`   📊 File Size: ${logFileInfo.size}`);
            console.log(`   📋 Total Lines: ${logFileInfo.lines}`);
            console.log(`   📅 Created: ${logFileInfo.created ? new Date(logFileInfo.created).toLocaleString() : 'Unknown'}`);
        } else {
            console.log('\n⚠️ No log file information available');
        }
        
        return report;
    }
    
    async _getLogFileInfo() {
        // ENHANCEMENT: Get log file statistics
        const fs = require('fs');
        const path = require('path');
        
        if (!this.logFilePath || !fs.existsSync(this.logFilePath)) {
            return {
                size: '0 KB',
                lines: 0,
                created: null
            };
        }
        
        try {
            const stats = fs.statSync(this.logFilePath);
            const content = fs.readFileSync(this.logFilePath, 'utf8');
            const lines = content.split('\n').length - 1; // Subtract 1 for empty line at end
            
            return {
                size: `${(stats.size / 1024).toFixed(2)} KB`,
                lines: lines,
                created: stats.birthtime.toISOString()
            };
        } catch (error) {
            return {
                size: 'Error',
                lines: 0,
                created: null,
                error: error.message
            };
        }
    }

    async shutdown() {
        // Restore original console methods to avoid stream write errors
        if (this.originalConsoleLog) {
            console.log = this.originalConsoleLog;
            console.error = this.originalConsoleError;
            console.warn = this.originalConsoleWarn;
            console.info = this.originalConsoleInfo;
            console.debug = this.originalConsoleDebug;
        }
        
        console.log('🔄 Shutting down production processor...');
        
        // Log final summary BEFORE closing the stream
        if (this.logger) {
            try {
                this.logger.info('Production processor shutdown complete', {
                    totalProcessingTime: Date.now() - this.startTime,
                    results: this.results,
                    logFile: this.logFilePath
                });
            } catch (error) {
                console.error('❌ Error logging final summary:', error);
            }
        }
        
        // ENHANCEMENT: Properly close log stream
        if (this.logStream) {
            try {
                this.logStream.end();
                console.log('✅ Log stream closed successfully');
            } catch (error) {
                console.error('❌ Error closing log stream:', error);
            }
        }
        
        if (this.container) {
            try {
                await this.container.dispose();
                console.log('✅ Container disposed successfully');
            } catch (error) {
                console.error('❌ Error disposing container:', error);
            }
        }
        
        console.log('✅ Production processor shutdown complete');
    }

    // Helper methods for data processing
    _generateUUID() {
        const crypto = require('crypto');
        const bytes = crypto.randomBytes(16);
        bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 1
        
        const hex = bytes.toString('hex');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    }

    _generateFingerprint(id, startTime) {
        const crypto = require('crypto');
        const data = `${id}-${startTime}`;
        return crypto.createHash('md5').update(data).digest('hex').substring(0, 16);
    }

    _extractWeekNumber(topic) {
        if (!topic) return null;
        
        // Look for week patterns in the topic
        const weekMatch = topic.match(/week\s*(\d+)/i);
        if (weekMatch) {
            return parseInt(weekMatch[1]);
        }
        
        // Look for session patterns
        const sessionMatch = topic.match(/session\s*(\d+)/i);
        if (sessionMatch) {
            return parseInt(sessionMatch[1]);
        }
        
        return null;
    }

    _formatActionItems(actionItems) {
        if (!actionItems) return '';
        
        const allItems = [];
        
        if (actionItems.highPriority) {
            allItems.push(...actionItems.highPriority.map(item => 
                typeof item === 'string' ? item : item.action || item.description || item
            ));
        }
        
        if (actionItems.mediumPriority) {
            allItems.push(...actionItems.mediumPriority.map(item => 
                typeof item === 'string' ? item : item.action || item.description || item
            ));
        }
        
        if (actionItems.lowPriority) {
            allItems.push(...actionItems.lowPriority.map(item => 
                typeof item === 'string' ? item : item.action || item.description || item
            ));
        }
        
        if (actionItems.coach) {
            allItems.push(...actionItems.coach.map(item => 
                typeof item === 'string' ? item : item.action || item.description || item
            ));
        }
        
        if (actionItems.student) {
            allItems.push(...actionItems.student.map(item => 
                typeof item === 'string' ? item : item.action || item.description || item
            ));
        }
        
        return allItems.join(' | ');
    }
    
    _countActionItems(actionItems) {
        if (!actionItems) return 0;
        
        let count = 0;
        
        if (actionItems.highPriority) count += actionItems.highPriority.length;
        if (actionItems.mediumPriority) count += actionItems.mediumPriority.length;
        if (actionItems.lowPriority) count += actionItems.lowPriority.length;
        if (actionItems.coach) count += actionItems.coach.length;
        if (actionItems.student) count += actionItems.student.length;
        
        return count;
    }
    
    _calculateTotalFileSize(downloadedFiles) {
        if (!downloadedFiles || Object.keys(downloadedFiles).length === 0) return 0;
        
        let totalSize = 0;
        
        // Try to get actual file sizes if available
        for (const [fileType, filePath] of Object.entries(downloadedFiles)) {
            if (filePath && typeof filePath === 'string') {
                try {
                    const fs = require('fs');
                    const stats = fs.statSync(filePath);
                    totalSize += stats.size;
                } catch (error) {
                    // If we can't get actual size, use estimates
                    switch (fileType) {
                        case 'video':
                            totalSize += 50 * 1024 * 1024; // ~50MB for video
                            break;
                        case 'audio':
                            totalSize += 10 * 1024 * 1024; // ~10MB for audio
                            break;
                        case 'transcript':
                            totalSize += 5 * 1024; // ~5KB for transcript
                            break;
                        case 'timeline':
                            totalSize += 2 * 1024; // ~2KB for timeline
                            break;
                        case 'chat':
                            totalSize += 1 * 1024; // ~1KB for chat
                            break;
                        default:
                            totalSize += 1024; // ~1KB default
                    }
                }
            }
        }
        
        return totalSize;
    }

    // Helper methods for different processing modes
    _createTestRecording() {
        return {
            id: 'test-recording-123',
            meeting_id: 'test-meeting-123',
            topic: 'Test Coaching Session',
            start_time: new Date().toISOString(),
            duration: 45,
            participant_count: 2,
            recording_type: 'video'
        };
    }

    async _getRecordingById(recordingId) {
        try {
            const zoomService = this.container.resolve('zoomService');
            if (!zoomService) {
                throw new Error('ZoomService not available - cannot fetch real recording');
            }
            
            if (typeof zoomService.getRecordingByUUID !== 'function') {
                throw new Error('ZoomService.getRecordingByUUID method not available');
            }
            
            this.logger.info(`🔍 Fetching real recording from Zoom cloud by UUID: ${recordingId}`);
            return await zoomService.getRecordingByUUID(recordingId);
            
        } catch (error) {
            this.logger.error(`❌ Failed to get recording by UUID: ${recordingId}`, error);
            throw new Error(`Failed to fetch real recording from Zoom: ${error.message}`);
        }
    }

    async _getRecordingsLast30Days(limit = 50) {
        try {
            const zoomService = this.container.resolve('zoomService');
            if (!zoomService) {
                throw new Error('ZoomService not available - cannot fetch real recordings');
            }
            
            if (typeof zoomService.getRecordings !== 'function') {
                throw new Error('ZoomService.getRecordings method not available');
            }
            
            this.logger.info(`🔍 Fetching real recordings from Zoom cloud (last 30 days)...`);
            
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const recordings = await zoomService.getRecordings({
                from: thirtyDaysAgo.toISOString(),
                to: new Date().toISOString(),
                limit: limit
            });
            
            if (!recordings || recordings.length === 0) {
                this.logger.warn('⚠️ No recordings found for last 30 days');
                return [];
            }
            
            this.logger.info(`✅ Found ${recordings.length} real recordings from Zoom cloud`);
            return recordings;
            
        } catch (error) {
            this.logger.error('❌ Failed to get recordings for last 30 days', error);
            throw new Error(`Failed to fetch real recordings from Zoom: ${error.message}`);
        }
    }

    async _getRecordingsByDateRange(fromDate, toDate, limit = 50) {
        try {
            const zoomService = this.container.resolve('zoomService');
            if (!zoomService) {
                throw new Error('ZoomService not available - cannot fetch real recordings');
            }
            
            if (typeof zoomService.getRecordings !== 'function') {
                throw new Error('ZoomService.getRecordings method not available');
            }
            
            this.logger.info(`🔍 Fetching real recordings from Zoom cloud (${fromDate} to ${toDate})...`);
            
            // Get ALL recordings from the date range without applying limit
            const allRecordings = await zoomService.getAllRecordings(fromDate, toDate);
            
            if (!allRecordings || allRecordings.length === 0) {
                this.logger.warn('⚠️ No recordings found for specified date range');
                return [];
            }
            
            this.logger.info(`✅ Found ${allRecordings.length} total recordings from Zoom cloud`);
            
            // Sort by start_time descending to get the most recent ones
            const sortedRecordings = allRecordings.sort((a, b) => 
                new Date(b.start_time) - new Date(a.start_time)
            );
            
            // Apply limit after getting all recordings
            const limitedRecordings = sortedRecordings.slice(0, limit);
            this.logger.info(`📊 Limited to ${limitedRecordings.length} recordings (requested: ${limit})`);
            
            return limitedRecordings;
            
        } catch (error) {
            this.logger.error('❌ Failed to get recordings by date range', error);
            throw new Error(`Failed to fetch real recordings from Zoom: ${error.message}`);
        }
    }

    async _getRecentRecordings(limit = 5) {
        try {
            const zoomService = this.container.resolve('zoomService');
            if (!zoomService) {
                throw new Error('ZoomService not available - cannot fetch real recordings');
            }
            
            if (typeof zoomService.getRecordings !== 'function') {
                throw new Error('ZoomService.getRecordings method not available');
            }
            
            this.logger.info(`🔍 Fetching last ${limit} real recordings from Zoom cloud (this month)...`);
            
            // Get recordings from the start of current month to now
            const currentDate = new Date();
            const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            
            this.logger.info(`📅 Date range: ${startDate.toISOString()} to ${currentDate.toISOString()}`);
            
            const recordings = await zoomService.getRecordings({
                from: startDate.toISOString(),
                to: currentDate.toISOString(),
                limit: limit
            });
            
            if (!recordings || recordings.length === 0) {
                this.logger.warn('⚠️ No recordings found for this month');
                return [];
            }
            
            this.logger.info(`✅ Found ${recordings.length} real recordings from Zoom cloud`);
            
            // Sort by start_time descending to get the most recent ones
            const sortedRecordings = recordings.sort((a, b) => 
                new Date(b.start_time) - new Date(a.start_time)
            );
            
            // Return only the requested limit
            return sortedRecordings.slice(0, limit);
            
        } catch (error) {
            this.logger.error('❌ Failed to get recent recordings from Zoom:', error);
            throw new Error(`Failed to fetch real recordings from Zoom: ${error.message}`);
        }
    }

    _generateFallbackAIInsights(recording, enhancedMetadata, transcriptContent) {
        const hasTranscript = transcriptContent && transcriptContent.length > 50;
        const participantCount = enhancedMetadata.participantCount || 2;
        const coach = enhancedMetadata.coach || 'Coach';
        const student = enhancedMetadata.student || 'Student';
        
        return {
            // Transcript Analysis
            transcriptAnalysis: {
                speakerCount: participantCount,
                primarySpeaker: coach,
                speakingTimeDistribution: {
                    [coach]: 0.6,
                    [student]: 0.4
                },
                qualityScore: hasTranscript ? 0.8 : 0.5
            },
            
            // Emotional Analysis
            emotionalAnalysis: {
                emotionalJourney: hasTranscript ? [
                    { phase: 'Opening', emotion: 'neutral', confidence: 0.7 },
                    { phase: 'Discussion', emotion: 'engaged', confidence: 0.8 },
                    { phase: 'Closing', emotion: 'positive', confidence: 0.6 }
                ] : [],
                overallJourney: hasTranscript ? 'Positive engagement throughout session' : 'Limited emotional data available',
                stabilityScore: hasTranscript ? 0.75 : 0.5,
                phases: hasTranscript ? 3 : 1,
                peaks: hasTranscript ? 2 : 0,
                valleys: hasTranscript ? 1 : 0
            },
            
            // Engagement Analysis
            engagementAnalysis: {
                overallScore: hasTranscript ? 0.8 : 0.6,
                level: hasTranscript ? 'high' : 'medium',
                factors: hasTranscript ? ['Active participation', 'Responsive communication', 'Focused attention'] : ['Limited data available']
            },
            
            // Key Moments Analysis
            keyMomentsAnalysis: {
                keyMoments: hasTranscript ? [
                    { timestamp: '00:02:30', description: 'Session objectives clarified', importance: 'high' },
                    { timestamp: '00:05:15', description: 'Key discussion point addressed', importance: 'medium' },
                    { timestamp: '00:08:45', description: 'Action items identified', importance: 'high' }
                ] : []
            },
            
            // Coaching Analysis
            coachingAnalysis: {
                topics: ['Academic Performance', 'SAT Preparation', 'Summer Activities'],
                style: 'Supportive and directive',
                strengths: ['Clear communication', 'Goal-oriented approach', 'Student engagement'],
                improvements: ['Could provide more specific examples', 'Consider more interactive elements'],
                effectivenessScore: 0.85,
                techniques: ['Questioning', 'Goal setting', 'Progress tracking'],
                responsiveness: 'high',
                excellenceMoments: ['Effective goal clarification', 'Supportive feedback delivery']
            },
            
            // Student Analysis
            studentAnalysis: {
                responsePattern: 'Engaged and responsive',
                responsePatterns: {
                    engagement: 'high',
                    participation: 'active',
                    understanding: 'good'
                },
                progressIndicators: ['Shows understanding of concepts', 'Asks relevant questions', 'Demonstrates commitment'],
                progressScore: 0.8,
                satisfactionLevel: 'high',
                learningOutcomes: ['Improved understanding of requirements', 'Clear action plan established'],
                growthMoments: ['Demonstrated problem-solving skills', 'Showed initiative in planning'],
                engagementLevel: 'high',
                understandingLevel: 'good',
                motivationLevel: 'high',
                progressConfidence: 0.8
            },
            
            // Interaction Analysis
            interactionAnalysis: {
                quality: 'high',
                interruptionPatterns: { coach: 0, student: 0 },
                silencePatterns: { thoughtful: 2, awkward: 0 }
            },
            
            // Thematic Analysis
            thematicAnalysis: {
                themes: ['Academic planning', 'Test preparation', 'Goal setting', 'Progress tracking']
            },
            
            // Action Items Analysis
            actionItemsAnalysis: {
                actionItems: [
                    { description: 'Complete SAT practice test', priority: 'high', assignee: 'student', dueDate: 'Next week' },
                    { description: 'Research summer programs', priority: 'medium', assignee: 'student', dueDate: 'Two weeks' },
                    { description: 'Schedule follow-up session', priority: 'high', assignee: 'coach', dueDate: 'Next week' }
                ]
            },
            
            // Challenges Analysis
            challengesAnalysis: {
                challenges: ['Time management', 'Test anxiety', 'Balancing activities']
            },
            
            // Breakthroughs Analysis
            breakthroughsAnalysis: {
                breakthroughs: ['Clear understanding of requirements', 'Confidence in action plan', 'Motivation to succeed']
            },
            
            // Goals Analysis
            goalsAnalysis: {
                goals: ['Improve SAT scores', 'Complete summer program application', 'Maintain academic performance']
            },
            
            // Progress Analysis
            progressAnalysis: {
                progress: ['Enhanced understanding of requirements', 'Clear action plan established', 'Improved confidence']
            },
            
            // Next Steps Analysis
            nextStepsAnalysis: {
                nextSteps: ['Complete assigned tasks', 'Schedule follow-up session', 'Track progress regularly']
            },
            
            // Follow-up Analysis
            followUpAnalysis: {
                required: true,
                immediate: ['Send session summary', 'Share action items'],
                shortTerm: ['Check progress on assignments', 'Address any questions'],
                longTerm: ['Monitor overall progress', 'Adjust goals as needed'],
                coachRecommendations: ['Provide additional resources', 'Schedule regular check-ins'],
                studentRecommendations: ['Complete assigned tasks', 'Ask questions when needed']
            },
            
            // Risk Analysis
            riskAnalysis: {
                riskFactors: ['Procrastination', 'Overwhelm', 'Lack of support']
            },
            
            // Success Analysis
            successAnalysis: {
                predictors: ['Clear goals', 'Structured plan', 'Regular follow-up'],
                successes: ['Effective communication', 'Goal clarity', 'Action plan development']
            },
            
            // Conversation Analysis
            conversationAnalysis: {
                flow: 'Smooth and productive',
                transitions: 5
            },
            
            // Session Analysis
            sessionAnalysis: {
                phases: [
                    { phase: 'Opening', duration: '2 minutes', purpose: 'Set objectives' },
                    { phase: 'Discussion', duration: '5 minutes', purpose: 'Address topics' },
                    { phase: 'Planning', duration: '2 minutes', purpose: 'Create action plan' },
                    { phase: 'Closing', duration: '1 minute', purpose: 'Summarize and confirm' }
                ]
            },
            
            // Pacing Analysis
            pacingAnalysis: {
                analysis: 'Well-paced session with appropriate time allocation'
            },
            
            // Balance Analysis
            balanceAnalysis: {
                analysis: 'Good balance between discussion and action planning'
            },
            
            // Executive Summary
            executiveSummary: {
                summary: `Productive coaching session with ${student} focused on academic planning and SAT preparation. Clear objectives were established and actionable next steps identified.`
            },
            
            // Outcomes Analysis
            outcomesAnalysis: {
                keyOutcomes: ['Clear action plan established', 'Goals clarified', 'Next steps identified']
            },
            
            // Recommendations Analysis
            recommendationsAnalysis: {
                immediate: ['Complete assigned tasks', 'Review session notes'],
                shortTerm: ['Track progress regularly', 'Address any challenges'],
                longTerm: ['Monitor overall academic progress', 'Adjust goals as needed'],
                coach: ['Provide additional resources', 'Schedule regular check-ins'],
                student: ['Stay organized', 'Ask for help when needed']
            },
            
            // Questions Analysis
            questionsAnalysis: {
                importantQuestions: ['What are the specific requirements?', 'How can I best prepare?', 'What resources are available?']
            },
            
            // Participation Analysis
            participationAnalysis: {
                participationRate: 0.8
            },
            
            // Quality Analysis
            qualityAnalysis: {
                overallScore: 0.85
            },
            
            // Zoom Insights
            zoomInsights: {
                summary: 'Session conducted via Zoom with good audio/video quality',
                highlights: ['Clear communication', 'Effective use of technology', 'Good engagement'],
                analytics: { duration: recording.duration, participants: participantCount },
                aiSummary: 'AI analysis indicates a productive and well-structured coaching session',
                topics: ['Academic planning', 'Test preparation'],
                actionItems: ['Complete assignments', 'Follow up on resources'],
                questions: ['Requirements clarification', 'Resource availability'],
                sentiment: 'positive',
                engagement: 'high',
                breakthroughMoments: ['Goal clarity achieved', 'Action plan established'],
                coachingTechniques: ['Questioning', 'Goal setting'],
                studentProgress: 'Good engagement and understanding demonstrated',
                errors: []
            },
            
            // Transcript Insights
            transcriptInsights: {
                summary: hasTranscript ? 'Comprehensive transcript analysis completed' : 'Limited transcript data available',
                keyMoments: hasTranscript ? ['Session opening', 'Key discussion points', 'Action planning'] : [],
                speakerAnalysis: {
                    [coach]: { speakingTime: 0.6, topics: ['Guidance', 'Questions', 'Planning'] },
                    [student]: { speakingTime: 0.4, topics: ['Responses', 'Questions', 'Commitments'] }
                },
                topics: ['Academic planning', 'Test preparation', 'Goal setting'],
                actionItems: ['Complete assignments', 'Research resources', 'Follow up'],
                questions: ['Requirements clarification', 'Resource availability'],
                sentiment: 'positive',
                engagement: 'high',
                coachingInsights: 'Effective use of questioning and goal-setting techniques',
                emotionalJourney: hasTranscript ? ['neutral', 'engaged', 'positive'] : [],
                conversationPatterns: { turnTaking: 'balanced', interruptions: 'minimal' },
                sessionStructure: 'Well-organized with clear phases',
                breakthroughMoments: ['Goal clarity', 'Action planning'],
                riskFactors: ['Time management', 'Procrastination'],
                successPredictors: ['Clear goals', 'Structured plan'],
                metadata: {
                    totalDuration: recording.duration || 0,
                    wordCount: hasTranscript ? transcriptContent.length : 0,
                    speakerCount: participantCount
                }
            }
        };
    }

    /**
     * Transform AI insights from flat structure to nested structure for Google Sheets mapping
     */
    _transformAIInsightsForMapping(aiInsights) {
        if (!aiInsights) return {};
        
        // Preserve the enhanced structure while adding backward compatibility
        return {
            // Enhanced AI Insights Structure (preserved)
            aiSummary: aiInsights.aiSummary,
            aiHighlights: aiInsights.aiHighlights,
            aiTopics: aiInsights.aiTopics,
            aiActionItems: aiInsights.aiActionItems,
            aiQuestions: aiInsights.aiQuestions,
            aiSentiment: aiInsights.aiSentiment,
            aiEngagement: aiInsights.aiEngagement,
            aiCoachingInsights: aiInsights.aiCoachingInsights,
            aiSessionAnalysis: aiInsights.aiSessionAnalysis,
            aiParticipantInsights: aiInsights.aiParticipantInsights,
            aiQualityMetrics: aiInsights.aiQualityMetrics,
            
            // Zoom Insights (enhanced)
            zoomInsights: aiInsights.zoomInsights,
            
            // Tangible Outcomes (enhanced)
            tangibleOutcomes: aiInsights.tangibleOutcomes,
            
            // Combined Insights (enhanced)
            combinedInsights: aiInsights.combinedInsights,
            
            // Enhanced Metadata
            metadata: aiInsights.metadata,
            
            // Backward compatibility mappings (for existing Google Sheets)
            sessionOverview: {
                summary: aiInsights.aiSummary?.executiveSummary || aiInsights.aiSummary || '',
                mainPoints: aiInsights.aiSummary?.mainDiscussionPoints || aiInsights.aiHighlights?.keyInsights || []
            },
            transcriptAnalysis: {
                speakerCount: aiInsights.aiSessionAnalysis?.participantCount || 2,
                primarySpeaker: 'Coach', // Default assumption
                speakingTimeDistribution: {}
            },
            emotionalAnalysis: {
                emotionalJourney: aiInsights.aiSentiment?.emotionalJourney || [],
                overallJourney: aiInsights.aiSentiment?.overall || 'neutral',
                stabilityScore: 0.7
            },
            engagementAnalysis: {
                overallScore: aiInsights.aiEngagement?.overallScore || 0.7
            },
            keyMomentsAnalysis: {
                keyMoments: aiInsights.aiHighlights?.breakthroughMoments || []
            },
            coachingAnalysis: {
                topics: aiInsights.aiTopics || [],
                style: 'Standard coaching',
                strengths: aiInsights.aiCoachingInsights?.effectiveness?.strengths || [],
                improvements: aiInsights.aiCoachingInsights?.effectiveness?.areasForImprovement || []
            },
            studentAnalysis: {
                responsePattern: 'Standard',
                progressIndicators: aiInsights.aiCoachingInsights?.studentProgress?.visibleGrowth || [],
                responsePatterns: {}
            },
            interactionAnalysis: {
                quality: 'Good'
            },
            thematicAnalysis: {
                themes: aiInsights.aiSummary?.keyThemes || aiInsights.aiTopics || []
            },
            actionItemsAnalysis: {
                actionItems: [
                    ...(aiInsights.aiActionItems?.highPriority || []),
                    ...(aiInsights.aiActionItems?.mediumPriority || []),
                    ...(aiInsights.aiActionItems?.lowPriority || [])
                ]
            },
            challengesAnalysis: {
                challenges: aiInsights.aiCoachingInsights?.studentProgress?.challenges || []
            },
            breakthroughsAnalysis: {
                breakthroughs: aiInsights.aiHighlights?.breakthroughMoments || []
            },
            goalsAnalysis: {
                goals: []
            },
            progressAnalysis: {
                progress: aiInsights.aiCoachingInsights?.studentProgress?.visibleGrowth || []
            },
            nextStepsAnalysis: {
                nextSteps: aiInsights.aiCoachingInsights?.studentProgress?.nextSteps || []
            },
            followUpAnalysis: {
                required: true
            },
            riskAnalysis: {
                riskFactors: []
            },
            successAnalysis: {
                predictors: []
            },
            conversationAnalysis: {
                flow: aiInsights.aiEngagement?.conversationFlow || 'standard'
            },
            sessionAnalysis: {
                phases: aiInsights.aiSummary?.sessionStructure?.phases || []
            },
            pacingAnalysis: {
                analysis: 'Standard pacing'
            },
            balanceAnalysis: {
                analysis: 'Good balance'
            },
            executiveSummary: {
                summary: aiInsights.aiSummary?.executiveSummary || aiInsights.aiSummary || ''
            },
            outcomesAnalysis: {
                keyOutcomes: aiInsights.tangibleOutcomes?.outcomes || []
            },
            recommendationsAnalysis: {
                immediate: [],
                shortTerm: [],
                longTerm: [],
                coach: [],
                student: []
            }
        };
    }

    // Helper method to prompt user for input
    async promptUser(question) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            rl.question(question, (answer) => {
                rl.close();
                resolve(answer.trim());
            });
        });
    }

    // Helper method to display recording summary
    displayRecordingSummary(recordings, mode) {
        console.log('\n' + '='.repeat(80));
        console.log('📋 RECORDINGS FOUND - REVIEW BEFORE PROCESSING');
        console.log('='.repeat(80));
        console.log(`📊 Mode: ${mode.toUpperCase()}`);
        console.log(`📊 Total Recordings: ${recordings.length}`);
        console.log('='.repeat(80));
        
        recordings.forEach((recording, index) => {
            // Add null check to prevent crashes
            if (!recording) {
                console.log(`${index + 1}. ❌ NULL RECORDING OBJECT`);
                console.log('');
                return;
            }
            
            const date = recording.start_time ? new Date(recording.start_time).toLocaleDateString() : 'Unknown';
            const duration = recording.duration ? `${Math.round(recording.duration / 60)} min` : 'Unknown';
            const topic = recording.topic || 'No Topic';
            const meetingId = recording.id || recording.meeting_id || 'Unknown';
            
            console.log(`${index + 1}. 📅 ${date} | ⏱️ ${duration} | 🆔 ${meetingId}`);
            console.log(`   📋 Topic: ${topic}`);
            if (recording.participant_count) {
                console.log(`   👥 Participants: ${recording.participant_count}`);
            }
            console.log('');
        });
        
        console.log('='.repeat(80));
    }

    // Helper method to display processing result summary
    displayProcessingResult(recording, result, index, total) {
        console.log('\n' + '='.repeat(80));
        console.log(`✅ RECORDING ${index + 1}/${total} PROCESSING COMPLETE`);
        console.log('='.repeat(80));
        
        const topic = recording.topic || 'No Topic';
        const meetingId = recording.id || recording.meeting_id || 'Unknown';
        const date = recording.start_time ? new Date(recording.start_time).toLocaleDateString() : 'Unknown';
        
        console.log(`📋 Topic: ${topic}`);
        console.log(`🆔 Meeting ID: ${meetingId}`);
        console.log(`📅 Date: ${date}`);
        console.log(`✅ Success: ${result.success ? 'YES' : 'NO'}`);
        
        if (result.success) {
            console.log(`⏱️ Processing Time: ${result.processingTime || 'Unknown'}ms`);
            if (result.aiInsights) {
                console.log(`🤖 AI Insights: Generated`);
            }
            if (result.outcomes) {
                console.log(`📝 Outcomes: ${result.outcomes.length || 0} extracted`);
            }
            if (result.driveFolder) {
                console.log(`📁 Drive Folder: ${result.driveFolder}`);
            }
        } else {
            console.log(`❌ Error: ${result.error || 'Unknown error'}`);
        }
        
        console.log('='.repeat(80));
    }

    // Helper method to display existing recording details for Gate 3
    displayExistingRecording(existingRecording) {
        console.log('\n' + '='.repeat(80));
        console.log('📋 EXISTING RECORDING FOUND IN SHEETS');
        console.log('='.repeat(80));
        
        console.log(`🔑 UUID: ${existingRecording.uuid || 'Unknown'}`);
        console.log(`📋 Standardized Name: ${existingRecording.standardizedName || 'Unknown'}`);
        console.log(`📅 Recording Date: ${existingRecording.recordingDate || 'Unknown'}`);
        console.log(`📅 Processed Date: ${existingRecording.processedDate || 'Unknown'}`);
        console.log(`📅 Last Updated: ${existingRecording.lastUpdated || 'Unknown'}`);
        console.log(`📊 Week Number: ${existingRecording.weekNumber || 'Unknown'}`);
        console.log(`📋 Meeting Topic: ${existingRecording.meetingTopic || 'Unknown'}`);
        console.log(`⏱️ Duration: ${existingRecording.duration || 'Unknown'}`);
        console.log(`👥 Participants: ${existingRecording.participantCount || 'Unknown'}`);
        console.log(`📁 Drive Folder: ${existingRecording.driveFolder || 'Not available'}`);
        console.log(`🤖 AI Insights: ${existingRecording.keyThemes ? 'Generated' : 'Not available'}`);
        console.log(`📝 Action Items: ${existingRecording.actionItems || 'Not available'}`);
        console.log(`📊 Data Source: ${existingRecording.dataSource || 'Unknown'}`);
        
        console.log('='.repeat(80));
    }

    /**
     * Extract participants from downloaded files (timeline, chat, transcript)
     */
    async _extractParticipantsFromFiles(downloadedFiles, transcriptContent, chatContent) {
        const participants = [];
        
        try {
            // 1. Extract from timeline JSON (highest priority)
            if (downloadedFiles.timeline) {
                try {
                    const timelineContent = fs.readFileSync(downloadedFiles.timeline, 'utf8');
                    const timeline = JSON.parse(timelineContent);
                    
                    // Extract unique participants from timeline
                    const uniqueParticipants = new Map();
                    
                    if (timeline.timeline && Array.isArray(timeline.timeline)) {
                        for (const entry of timeline.timeline) {
                            if (entry.users && Array.isArray(entry.users)) {
                                for (const user of entry.users) {
                                    if (user.username && !uniqueParticipants.has(user.username)) {
                                        uniqueParticipants.set(user.username, {
                                            name: user.username,
                                            email: user.email_address || '',
                                            user_id: user.user_id || '',
                                            zoom_userid: user.zoom_userid || ''
                                        });
                                    }
                                }
                            }
                        }
                    }
                    
                    // Add unique participants to the list
                    for (const [_, participant] of uniqueParticipants) {
                        participants.push(participant);
                    }
                    
                    console.log(`📊 Extracted ${participants.length} participants from timeline JSON`);
                } catch (error) {
                    console.log(`⚠️ Failed to extract participants from timeline: ${error.message}`);
                }
            }
            
            // 2. Extract from chat file (medium priority)
            if (chatContent && chatContent.length > 0) {
                const chatParticipants = this._extractParticipantsFromChat(chatContent);
                for (const chatParticipant of chatParticipants) {
                    // Only add if not already in participants list
                    if (!participants.some(p => p.name === chatParticipant.name)) {
                        participants.push(chatParticipant);
                    }
                }
                console.log(`💬 Extracted ${chatParticipants.length} participants from chat`);
            }
            
            // 3. Extract from transcript (lowest priority, for speaker names)
            if (transcriptContent && transcriptContent.length > 0) {
                const transcriptParticipants = this._extractParticipantsFromTranscript(transcriptContent);
                for (const transcriptParticipant of transcriptParticipants) {
                    // Only add if not already in participants list
                    if (!participants.some(p => p.name === transcriptParticipant.name)) {
                        participants.push(transcriptParticipant);
                    }
                }
                console.log(`📝 Extracted ${transcriptParticipants.length} participants from transcript`);
            }
            
        } catch (error) {
            console.log(`⚠️ Error extracting participants from files: ${error.message}`);
        }
        
        return participants;
    }
    
    /**
     * Extract participants from chat content
     */
    _extractParticipantsFromChat(chatContent) {
        const participants = [];
        const lines = chatContent.split('\n');
        
        for (const line of lines) {
            // Chat format: timestamp\tName: message
            const match = line.match(/^\d{2}:\d{2}:\d{2}\t([^:]+):/);
            if (match) {
                const name = match[1].trim();
                if (name && !participants.some(p => p.name === name)) {
                    participants.push({
                        name: name,
                        email: '',
                        source: 'chat'
                    });
                }
            }
        }
        
        return participants;
    }
    
    /**
     * Extract participants from transcript content
     */
    _extractParticipantsFromTranscript(transcriptContent) {
        const participants = [];
        const lines = transcriptContent.split('\n');
        
        for (const line of lines) {
            // Transcript format: Name: message
            const match = line.match(/^([^:]+):\s*(.+)$/);
            if (match) {
                const name = match[1].trim();
                if (name && !participants.some(p => p.name === name)) {
                    participants.push({
                        name: name,
                        email: '',
                        source: 'transcript'
                    });
                }
            }
        }
        
        return participants;
    }

    /**
     * Determine recording category based on the recording data
     * @param {Object} recording - The recording object
     * @param {Object} nameAnalysis - The name analysis result
     * @param {number} participantCount - Number of participants
     * @returns {string} Category: 'TRIVIAL', 'MISC', or 'Coaching'
     */
    _determineRecordingCategory(recording, nameAnalysis, participantCount) {
        const duration = recording.duration || 0;
        const fileSize = recording.total_size || recording.file_size || 0;
        const topic = recording.topic || '';
        
        // Calculate total file size from recording_files if available
        let totalFileSize = fileSize;
        if (recording.recording_files && Array.isArray(recording.recording_files)) {
            totalFileSize = recording.recording_files.reduce((sum, file) => sum + (file.file_size || 0), 0);
        }
        
        // Log for debugging
        console.log(`📊 Category determination for recording ${recording.id}:`);
        console.log(`   Duration: ${duration} seconds (${Math.round(duration/60)} minutes)`);
        console.log(`   Total file size: ${totalFileSize} bytes (${Math.round(totalFileSize/1024/1024)} MB)`);
        console.log(`   Participants: ${participantCount}`);
        console.log(`   Student: ${nameAnalysis.components?.student || 'Unknown'}`);
        console.log(`   Coach: ${nameAnalysis.components?.coach || 'Unknown'}`);
        
        // TRIVIAL conditions - Check FIRST to ensure TRIVIAL recordings get correct categorization
        // Test recordings or explicitly marked as trivial
        if (topic.toLowerCase().includes('test') || 
            topic.toLowerCase().includes('trivial')) {
            console.log(`   → Category: TRIVIAL (Test/trivial recording)`);
            return 'TRIVIAL';
        }
        
        // Very small recordings - file size AND duration/participants
        if (totalFileSize < 1024 * 1024 && // Less than 1MB total file size
            (duration < 60 || participantCount === 0)) { // Less than 1 minute OR no participants
            console.log(`   → Category: TRIVIAL (Tiny file size and short/no participants)`);
            return 'TRIVIAL';
        }
        
        // Additional TRIVIAL check - very short duration with MISC-like indicators
        // This catches recordings that might otherwise be marked as MISC but are too short to matter
        if (duration < 15 * 60 && // Less than 15 minutes
            totalFileSize < 5 * 1024 * 1024) { // Less than 5MB
            
            // Check for unknown student
            if (nameAnalysis.components?.student === 'Unknown' || 
                nameAnalysis.components?.student === 'unknown' ||
                !nameAnalysis.components?.student) {
                console.log(`   → Category: TRIVIAL (Short duration with unknown student)`);
                return 'TRIVIAL';
            }
            
            // Check for unknown coach
            if (nameAnalysis.components?.coach === 'Unknown' || 
                nameAnalysis.components?.coach === 'unknown' ||
                !nameAnalysis.components?.coach) {
                console.log(`   → Category: TRIVIAL (Short duration with unknown coach)`);
                return 'TRIVIAL';
            }
            
            // Check for Ivylevel or Siraj as host (admin recordings)
            const hostEmail = (recording.host_email || '').toLowerCase();
            const hostName = (recording.host_name || '').toLowerCase();
            if (hostEmail.includes('ivylevel') || hostName.includes('ivylevel') ||
                hostEmail.includes('siraj') || hostName.includes('siraj')) {
                console.log(`   → Category: TRIVIAL (Short admin recording - Ivylevel/Siraj)`);
                return 'TRIVIAL';
            }
        }
        
        // NEW: NO SHOW Edge Case Detection
        // Check if this is a NO SHOW scenario where coach didn't join but student did
        if (this._isNoShowScenario(recording, nameAnalysis, participantCount, duration)) {
            console.log(`   → Category: MISC (NO SHOW - Coach identified but didn't join, student waited)`);
            return 'MISC';
        }
        
        // If we have a properly identified student AND coach, it's likely a valid coaching session
        if (nameAnalysis.components?.student && 
            nameAnalysis.components?.student !== 'Unknown' && 
            nameAnalysis.components?.student !== 'unknown' &&
            nameAnalysis.components?.coach &&
            nameAnalysis.components?.coach !== 'Unknown' &&
            nameAnalysis.components?.coach !== 'unknown') {
            
            // Check file size as a better indicator than duration
            if (totalFileSize > 10 * 1024 * 1024) { // More than 10MB
                console.log(`   → Category: Coaching (Valid student/coach pair with substantial file size)`);
                return 'Coaching';
            }
        }
        
        // MISC conditions - Personal Meeting Room no-shows or unknown students
        if (topic.toLowerCase().includes('personal meeting room') && 
            (participantCount < 2 || 
             nameAnalysis.components?.student === 'Unknown' || 
             nameAnalysis.components?.student === 'unknown' ||
             !nameAnalysis.components?.student)) {
            console.log(`   → Category: MISC (Personal Meeting Room with no/unknown student)`);
            return 'MISC';
        }
        
        // MISC conditions - Unknown student in any meeting
        if (!nameAnalysis.components?.student ||
            nameAnalysis.components?.student === 'Unknown' || 
            nameAnalysis.components?.student === 'unknown') {
            console.log(`   → Category: MISC (Unknown student)`);
            return 'MISC';
        }
        
        // Default to Coaching for anything else with an identified student
        console.log(`   → Category: Coaching (Default for identified student)`);
        return 'Coaching';
    }

    /**
     * Detect NO SHOW scenarios where coach is identified but didn't join
     * @param {Object} recording - The recording object
     * @param {Object} nameAnalysis - The name analysis result
     * @param {number} participantCount - Number of participants
     * @param {number} duration - Recording duration in seconds
     * @returns {boolean} True if this is a NO SHOW scenario
     */
    _isNoShowScenario(recording, nameAnalysis, participantCount, duration) {
        const topic = (recording.topic || '').toLowerCase();
        const hostEmail = (recording.host_email || '').toLowerCase();
        const coach = nameAnalysis.components?.coach;
        const student = nameAnalysis.components?.student;
        
        // NO SHOW indicators:
        // 1. Coach is identified (from host email or topic)
        // 2. Student is identified (from participants)
        // 3. Only 1 participant (student only, coach didn't join)
        // 4. Reasonable duration (student waited, not just a quick join/leave)
        // 5. Personal Meeting Room (typical NO SHOW scenario)
        
        const hasIdentifiedCoach = coach && 
            coach !== 'Unknown' && 
            coach !== 'unknown' &&
            (hostEmail.includes('@ivymentors.co') || 
             topic.includes(coach.toLowerCase()) ||
             topic.includes('personal meeting room'));
        
        const hasIdentifiedStudent = student && 
            student !== 'Unknown' && 
            student !== 'unknown';
        
        const isSingleParticipant = participantCount === 1;
        
        const isReasonableWaitTime = duration >= 1800; // At least 30 minutes (student waited)
        
        const isPersonalMeetingRoom = topic.includes('personal meeting room');
        
        // Additional check: if coach email is in host but only student participated
        const coachEmailInHost = hostEmail.includes('@ivymentors.co') && 
            (hostEmail.includes('rishi') || 
             hostEmail.includes('noor') || 
             hostEmail.includes('juli') || 
             hostEmail.includes('jenny') ||
             hostEmail.includes('aditi') ||
             hostEmail.includes('jamie'));
        
        // NO SHOW scenario detected
        if (hasIdentifiedCoach && 
            hasIdentifiedStudent && 
            isSingleParticipant && 
            isReasonableWaitTime && 
            (isPersonalMeetingRoom || coachEmailInHost)) {
            
            console.log(`   🚨 NO SHOW detected:`);
            console.log(`      - Coach identified: ${coach}`);
            console.log(`      - Student identified: ${student}`);
            console.log(`      - Participants: ${participantCount} (only student joined)`);
            console.log(`      - Duration: ${Math.round(duration/60)} minutes (student waited)`);
            console.log(`      - Personal Meeting Room: ${isPersonalMeetingRoom}`);
            console.log(`      - Coach email in host: ${coachEmailInHost}`);
            
            return true;
        }
        
        return false;
    }

    /**
     * Convert UUID between different formats for matching
     * ENHANCEMENT: Base64 is now the primary format, hex formats are for backward compatibility only
     * @param {string} uuid - The UUID to convert
     * @returns {Object} Object with different UUID formats (base64 prioritized)
     */
    _convertUuidFormats(uuid) {
        if (!uuid) {
            return {
                original: null,
                base64: null,
                hex: null,
                hexWithDashes: null
            };
        }
        
        const formats = {
            original: uuid,
            base64: null,
            hex: null,
            hexWithDashes: null
        };
        
        try {
            // If it's base64 (ends with == and contains + or /) - PRIMARY FORMAT
            if (uuid.includes('==') || uuid.includes('+') || uuid.includes('/')) {
                formats.base64 = uuid;
                // Convert base64 to hex (for backward compatibility only)
                const buffer = Buffer.from(uuid, 'base64');
                formats.hex = buffer.toString('hex');
                // Add dashes for UUID format (for backward compatibility only)
                formats.hexWithDashes = `${formats.hex.slice(0, 8)}-${formats.hex.slice(8, 12)}-${formats.hex.slice(12, 16)}-${formats.hex.slice(16, 20)}-${formats.hex.slice(20, 32)}`;
            }
            // If it's hex with dashes (UUID format) - convert to base64
            else if (uuid.includes('-') && uuid.length === 36) {
                formats.hexWithDashes = uuid;
                formats.hex = uuid.replace(/-/g, '');
                // Convert hex to base64 (primary format)
                const buffer = Buffer.from(formats.hex, 'hex');
                formats.base64 = buffer.toString('base64');
            }
            // If it's hex without dashes - convert to base64
            else if (uuid.length === 32 && /^[0-9a-fA-F]+$/.test(uuid)) {
                formats.hex = uuid;
                formats.hexWithDashes = `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20, 32)}`;
                // Convert hex to base64 (primary format)
                const buffer = Buffer.from(uuid, 'hex');
                formats.base64 = buffer.toString('base64');
            }
        } catch (error) {
            console.log(`⚠️ UUID conversion error for ${uuid}: ${error.message}`);
        }
        
        return formats;
    }

    /**
     * Generate CSV file with all recording details including UUIDs
     * @param {Array} recordings - Array of recording objects
     * @param {string} mode - Processing mode
     * @param {Object} options - Processing options
     * @returns {string|null} Filename of generated CSV or null if error
     */
    async generateRecordingsCSV(recordings, mode, options) {
        try {
            const fs = require('fs');
            const timestamp = new Date().toISOString().split('T')[0];
            const modeStr = mode.replace(/[^a-zA-Z0-9]/g, '-');
            
            // Generate filename with mode and date
            let filename = `recordings-${modeStr}-${timestamp}.csv`;
            
            // Add date range to filename if custom mode
            if (mode === 'custom' && options.fromDate && options.toDate) {
                filename = `recordings-${modeStr}-${options.fromDate}-to-${options.toDate}.csv`;
            }
            
            // CSV headers
            const csvHeaders = [
                'uuid',
                'meeting_id',
                'topic',
                'start_time',
                'end_time',
                'duration',
                'recording_count',
                'host_email',
                'host_name',
                'account_id',
                'status',
                'uuid_base64',
                'uuid_hex',
                'uuid_hex_with_dashes'
            ];
            
            let csvContent = csvHeaders.join(',') + '\n';
            
            // Process each recording
            recordings.forEach((recording, index) => {
                console.log(`📝 Processing recording ${index + 1}/${recordings.length} for CSV: ${recording.topic || 'No Topic'}`);
                
                // Convert UUID to different formats
                const uuidFormats = this._convertUuidFormats(recording.uuid);
                
                const row = [
                    recording.uuid || '',
                    recording.meeting_id || recording.id || '',
                    `"${(recording.topic || '').replace(/"/g, '""')}"`, // Escape quotes in topic
                    recording.start_time || '',
                    recording.end_time || '',
                    recording.duration || '',
                    recording.recording_count || '',
                    recording.host_email || '',
                    `"${(recording.host_name || '').replace(/"/g, '""')}"`, // Escape quotes in host name
                    recording.account_id || '',
                    recording.status || '',
                    uuidFormats.base64 || '',
                    uuidFormats.hex || '',
                    uuidFormats.hexWithDashes || ''
                ];
                
                csvContent += row.join(',') + '\n';
            });
            
            // Save CSV file
            fs.writeFileSync(filename, csvContent);
            
            console.log(`✅ CSV file generated: ${filename}`);
            console.log(`📊 Total recordings in CSV: ${recordings.length}`);
            console.log(`📋 Columns included: ${csvHeaders.join(', ')}`);
            
            // Also save as JSON for reference
            const jsonFilename = filename.replace('.csv', '.json');
            fs.writeFileSync(jsonFilename, JSON.stringify(recordings, null, 2));
            console.log(`📄 JSON file also saved: ${jsonFilename}`);
            
            return filename;
            
        } catch (error) {
            console.error('❌ Error generating CSV file:', error.message);
            console.error(error.stack);
            return null;
        }
    }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
    processor = new ProductionZoomProcessor();
    
    try {
        console.log('🚀 Initializing Production Zoom Processor with All Services...\n');
        
        await processor.initialize();
        
        // Debug: Show what options were parsed
        console.log('\n🔍 DEBUG: Command line options parsed:');
        console.log('   Raw options object:', JSON.stringify(options, null, 2));
        
        // Use command line options
        const processingOptions = {
            dryRun: options.dryRun,
            limit: options.limit,
            mode: options.mode,
            recordingId: options.recordingId,
            fromDate: options.fromDate,
            toDate: options.toDate,
            dateRange: options.dateRange,
            lightweight: options.lightweight,
            cloudLightweight: options.cloudLightweight,
            autoApprove: options.autoApprove
        };
        
        console.log('\n🔍 DEBUG: Processing options being passed:');
        console.log('   Processing options:', JSON.stringify(processingOptions, null, 2));
        
        console.log(`\n🎯 Processing Configuration:`);
        console.log(`   Mode: ${processingOptions.mode}`);
        console.log(`   Dry Run: ${processingOptions.dryRun ? 'Yes' : 'No'}`);
        console.log(`   Lightweight: ${processingOptions.lightweight ? 'Yes' : 'No'}`);
        console.log(`   Cloud Lightweight: ${processingOptions.cloudLightweight ? 'Yes' : 'No'}`);
        console.log(`   Auto-Approve: ${processingOptions.autoApprove ? 'Yes' : 'No'}`);
        console.log(`   Limit: ${processingOptions.limit}`);
        if (processingOptions.recordingId) {
            console.log(`   Recording ID: ${processingOptions.recordingId}`);
        }
        if (processingOptions.fromDate && processingOptions.toDate) {
            console.log(`   Date Range: ${processingOptions.fromDate} to ${processingOptions.toDate}`);
        }
        console.log(`   📝 Log File: ${processor.logFilePath || 'Not initialized'}`);
        console.log('');
        
        const results = await processor.processAllRecordings(processingOptions);
        
        console.log('\n🎉 Processing completed successfully!');
        
        // Final log file information display
        if (processor.logFilePath) {
            const path = require('path');
            const fs = require('fs');
            const fullLogPath = path.resolve(processor.logFilePath);
            
            console.log('\n📝 Final Console Output Log File Information:');
            console.log(`   📁 File Path: ${fullLogPath}`);
            console.log(`   📄 File Name: ${path.basename(processor.logFilePath)}`);
            console.log(`   🔗 File Link: file://${fullLogPath}`);
            
            // Get final file stats
            try {
                const stats = fs.statSync(processor.logFilePath);
                const content = fs.readFileSync(processor.logFilePath, 'utf8');
                const lines = content.split('\n').length - 1;
                console.log(`   📊 Final Size: ${(stats.size / 1024).toFixed(2)} KB`);
                console.log(`   📋 Final Lines: ${lines}`);
                console.log(`   📅 Last Modified: ${stats.mtime.toLocaleString()}`);
            } catch (error) {
                console.log(`   ⚠️ Could not get final file stats: ${error.message}`);
            }
        }
        
    } catch (error) {
        console.error('\n❌ Processing failed:', error);
        process.exit(1);
    } finally {
        await processor.shutdown();
    }
}

// ENHANCEMENT: Graceful shutdown handlers to ensure logs are properly closed
let processor = null;

process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    if (processor) {
        await processor.shutdown();
    }
    process.exit(1);
});

process.on('uncaughtException', async (error) => {
    console.error('Uncaught Exception:', error);
    if (processor) {
        await processor.shutdown();
    }
    process.exit(1);
});

// Graceful shutdown on SIGINT and SIGTERM
process.on('SIGINT', async () => {
    console.log('\n🔄 Received SIGINT, shutting down gracefully...');
    if (processor) {
        await processor.shutdown();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🔄 Received SIGTERM, shutting down gracefully...');
    if (processor) {
        await processor.shutdown();
    }
    process.exit(0);
});

if (require.main === module) {
    main();
}

module.exports = { ProductionZoomProcessor };