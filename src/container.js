/**
 * Production Container Configuration
 */

require('dotenv').config();
const awilix = require('awilix');
const fs = require('fs');
const path = require('path');

// Log to file utility
const logFile = path.join(__dirname, '../logs/container-debug.log');
function logToFile(...args) {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ');
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
    console.log(...args);
}

// Shared utilities
const { EventBus, Logger, Cache, MetricsCollector } = require('./shared');
logToFile('Loaded shared utilities:', { EventBus, Logger, Cache, MetricsCollector });

// Infrastructure services
let ZoomService, GoogleDriveService, DualTabGoogleSheetsService, SmartWeekInferencer, EnhancedMetadataExtractor, FileContentAnalyzer, KnowledgeBaseService, OpenAIService, CompleteSmartNameStandardizer, DriveOrganizer, AIPoweredInsightsGenerator;
try { ZoomService = require('./infrastructure/services/ZoomService').ZoomService; } catch (e) { logToFile('ZoomService import error:', e); }
try { GoogleDriveService = require('./infrastructure/services/GoogleDriveService').GoogleDriveService; } catch (e) { logToFile('GoogleDriveService import error:', e); }
try { DualTabGoogleSheetsService = require('./infrastructure/services/DualTabGoogleSheetsService').DualTabGoogleSheetsService; } catch (e) { logToFile('DualTabGoogleSheetsService import error:', e); }
try { SmartWeekInferencer = require('./infrastructure/services/SmartWeekInferencer').SmartWeekInferencer; } catch (e) { logToFile('SmartWeekInferencer import error:', e); }
try { EnhancedMetadataExtractor = require('./infrastructure/services/EnhancedMetadataExtractor').EnhancedMetadataExtractor; } catch (e) { logToFile('EnhancedMetadataExtractor import error:', e); }
try { FileContentAnalyzer = require('./infrastructure/services/FileContentAnalyzer').FileContentAnalyzer; } catch (e) { logToFile('FileContentAnalyzer import error:', e); }
try { KnowledgeBaseService = require('./infrastructure/services/KnowledgeBaseService').KnowledgeBaseService; } catch (e) { logToFile('KnowledgeBaseService import error:', e); }
try { OpenAIService = require('./infrastructure/services/OpenAIService').OpenAIService; } catch (e) { logToFile('OpenAIService import error:', e); }
try { CompleteSmartNameStandardizer = require('./infrastructure/services/CompleteSmartNameStandardizer').CompleteSmartNameStandardizer; } catch (e) { logToFile('CompleteSmartNameStandardizer import error:', e); }
try { DriveOrganizer = require('./infrastructure/services/DriveOrganizer'); } catch (e) { logToFile('DriveOrganizer import error:', e); }
try { AIPoweredInsightsGenerator = require('./infrastructure/ai/ai-powered-insights-generator'); } catch (e) { logToFile('AIPoweredInsightsGenerator import error:', e); }
logToFile('Loaded infrastructure services:', { ZoomService, GoogleDriveService, DualTabGoogleSheetsService, SmartWeekInferencer, EnhancedMetadataExtractor, FileContentAnalyzer, KnowledgeBaseService, OpenAIService, CompleteSmartNameStandardizer, DriveOrganizer, AIPoweredInsightsGenerator });

// Application services
let RecordingAnalyzer, InsightsGenerator, TranscriptionAnalyzer, ParticipantAnalyzer, RecordingProcessor, RecordingService;
try { RecordingAnalyzer = require('./application/services/RecordingAnalyzer').RecordingAnalyzer; } catch (e) { logToFile('RecordingAnalyzer import error:', e); }
try { InsightsGenerator = require('./application/services/InsightsGenerator').InsightsGenerator; } catch (e) { logToFile('InsightsGenerator import error:', e); }
try { TranscriptionAnalyzer = require('./application/services/TranscriptionAnalyzer').TranscriptionAnalyzer; } catch (e) { logToFile('TranscriptionAnalyzer import error:', e); }
try { ParticipantAnalyzer = require('./application/services/ParticipantAnalyzer').ParticipantAnalyzer; } catch (e) { logToFile('ParticipantAnalyzer import error:', e); }
try { RecordingProcessor = require('./application/services/RecordingProcessor').RecordingProcessor; } catch (e) { logToFile('RecordingProcessor import error:', e); }
try { RecordingService = require('./application/services/RecordingService').RecordingService; } catch (e) { logToFile('RecordingService import error:', e); }
logToFile('Loaded application services:', { RecordingAnalyzer, InsightsGenerator, TranscriptionAnalyzer, ParticipantAnalyzer, RecordingProcessor, RecordingService });

// Domain services
let OutcomesProcessor;
try { OutcomesProcessor = require('./domain/services/OutcomesProcessor').OutcomesProcessor; } catch (e) { logToFile('OutcomesProcessor import error:', e); }
logToFile('Loaded domain services:', { OutcomesProcessor });

// Core entities
let Recording, Session;
try { Recording = require('./core/entities/Recording').Recording; } catch (e) { logToFile('Recording import error:', e); }
try { Session = require('./core/entities/Session').Session; } catch (e) { logToFile('Session import error:', e); }
logToFile('Loaded core entities:', { Recording, Session });

// Utils
let RecordingCategorizer;
try { RecordingCategorizer = require('./utils/RecordingCategorizer').RecordingCategorizer; } catch (e) { logToFile('RecordingCategorizer import error:', e); }
logToFile('Loaded utils:', { RecordingCategorizer });

function createContainer() {
    const container = awilix.createContainer({
        injectionMode: awilix.InjectionMode.PROXY
    });

    // Configuration
    const config = {
        LOG_LEVEL: process.env.LOG_LEVEL || 'info',
        MASTER_INDEX_SHEET_ID: process.env.MASTER_INDEX_SHEET_ID || 'test-sheet',
        GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || './credentials.json',
        ZOOM_ACCOUNT_ID: process.env.ZOOM_ACCOUNT_ID,
        ZOOM_CLIENT_ID: process.env.ZOOM_CLIENT_ID,
        ZOOM_CLIENT_SECRET: process.env.ZOOM_CLIENT_SECRET,
        GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID,
        GOOGLE_SHEETS_ID: process.env.GOOGLE_SHEETS_ID,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY
    };
    
    container.register({
        config: awilix.asValue(config)
    });

    // Shared utilities
    container.register({
        eventBus: awilix.asClass(EventBus).singleton(),
        logger: awilix.asFunction(() => new Logger('App')).singleton(),
        cache: awilix.asClass(Cache).singleton(),
        metricsCollector: awilix.asClass(MetricsCollector).singleton()
    });

    // Logger factory
    container.register({
        createLogger: awilix.asFunction(({ logger }) => {
            return (context) => new Logger(context, { parent: logger });
        })
    });

    // Infrastructure services
    container.register({
        ...(OpenAIService && { openAIService: awilix.asClass(OpenAIService).singleton() }),
        ...(ZoomService && { zoomService: awilix.asClass(ZoomService).singleton() }),
        ...(GoogleDriveService && { googleDriveService: awilix.asClass(GoogleDriveService).singleton() }),
        ...(DualTabGoogleSheetsService && { googleSheetsService: awilix.asClass(DualTabGoogleSheetsService).singleton() }),
        ...(CompleteSmartNameStandardizer && { completeSmartNameStandardizer: awilix.asValue(new CompleteSmartNameStandardizer()) }),
        ...(SmartWeekInferencer && { smartWeekInferencer: awilix.asClass(SmartWeekInferencer).singleton() }),
        ...(EnhancedMetadataExtractor && { enhancedMetadataExtractor: awilix.asClass(EnhancedMetadataExtractor).singleton() }),
        ...(FileContentAnalyzer && { fileContentAnalyzer: awilix.asClass(FileContentAnalyzer).singleton() }),
        ...(KnowledgeBaseService && { knowledgeBaseService: awilix.asClass(KnowledgeBaseService).singleton() }),
        ...(DriveOrganizer && { driveOrganizer: awilix.asClass(DriveOrganizer).singleton() }),
        ...(AIPoweredInsightsGenerator && { aiPoweredInsightsGenerator: awilix.asClass(AIPoweredInsightsGenerator).singleton() }),
        
        // Alias for backward compatibility
        ...(CompleteSmartNameStandardizer && { nameStandardizer: awilix.asValue(new CompleteSmartNameStandardizer()) }),
        ...(SmartWeekInferencer && { weekInferencer: awilix.asClass(SmartWeekInferencer).singleton() }),
        ...(EnhancedMetadataExtractor && { metadataExtractor: awilix.asClass(EnhancedMetadataExtractor).singleton() }),
        ...(KnowledgeBaseService && { knowledgeBase: awilix.aliasTo('knowledgeBaseService') })
    });

    // Application services
    container.register({
        ...(RecordingAnalyzer && { recordingAnalyzer: awilix.asClass(RecordingAnalyzer).singleton() }),
        ...(InsightsGenerator && { insightsGenerator: awilix.asClass(InsightsGenerator).singleton() }),
        ...(TranscriptionAnalyzer && { transcriptionAnalyzer: awilix.asClass(TranscriptionAnalyzer).singleton() }),
        ...(ParticipantAnalyzer && { participantAnalyzer: awilix.asClass(ParticipantAnalyzer).singleton() }),
        ...(RecordingProcessor && { recordingProcessor: awilix.asClass(RecordingProcessor).singleton() }),
        ...(RecordingService && { recordingService: awilix.asClass(RecordingService).singleton() })
    });

    // Domain services
    container.register({
        ...(OutcomesProcessor && { outcomesProcessor: awilix.asClass(OutcomesProcessor).singleton() })
    });

    // Core entities
    container.register({
        ...(Recording && { Recording: awilix.asValue(Recording) }),
        ...(Session && { Session: awilix.asValue(Session) })
    });

    // Utils
    container.register({
        ...(RecordingCategorizer && { recordingCategorizer: awilix.asClass(RecordingCategorizer).singleton() })
    });

    // Initialize function
    container.register({
        initialize: awilix.asFunction(async ({ logger }) => {
            logger.info('Production container initialized successfully');
            return true;
        })
    });

    return container;
}

// Singleton
let containerInstance = null;

function getContainer() {
    if (!containerInstance) {
        containerInstance = createContainer();
    }
    return containerInstance;
}

module.exports = {
    createContainer,
    getContainer
};