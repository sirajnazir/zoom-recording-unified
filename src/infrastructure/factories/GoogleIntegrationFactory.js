// src/infrastructure/factories/GoogleIntegrationFactory.js
const { GoogleDriveService } = require('../services/GoogleDriveService');
const { DualTabGoogleSheetsService } = require('../services/DualTabGoogleSheetsService');
const { getGoogleAuth } = require('../auth/google-auth');
const { SmartServicesInitializer } = require('../helpers/SmartServicesInitializer');
const { Logger } = require('../../shared/Logger');

class GoogleIntegrationFactory {
    constructor(config) {
        this.config = config;
        this.services = {};
        this.logger = new Logger('GoogleIntegrationFactory');
    }

    /**
     * Create fully integrated Google services with all smart dependencies
     */
    async createIntegratedServices() {
        try {
            // Use SmartServicesInitializer to get all smart services
            const smartServicesInitializer = new SmartServicesInitializer(this.config);
            const smartServices = await smartServicesInitializer.initializeServices();

            // Initialize Google Auth
            const auth = await this._initializeAuth();

            // Create Google Drive Service
            const driveService = new GoogleDriveService({
                config: this.config,
                logger: smartServices.loggerFactory('GoogleDriveService'),
                cache: smartServices.cache,
                eventBus: smartServices.eventBus,
                auth
            });

            // Initialize Drive service
            await driveService.initialize();

            // Create Google Sheets Service with ALL dependencies from SmartServicesInitializer
            const sheetsService = new DualTabGoogleSheetsService({
                config: this.config,
                eventBus: smartServices.eventBus,
                logger: smartServices.loggerFactory('DualTabGoogleSheetsService'),
                cache: smartServices.cache,
                metricsCollector: smartServices.metricsCollector,
                nameStandardizer: smartServices.nameStandardizer,
                weekInferencer: smartServices.weekInferencer,
                metadataExtractor: smartServices.metadataExtractor,
                transcriptionAnalyzer: smartServices.transcriptionAnalyzer
            });

            // Store all services
            this.services = {
                drive: driveService,
                sheets: sheetsService,
                ...smartServices // Include all smart services
            };

            // Set up event listeners
            this._setupEventListeners();

            this.logger.info('Integrated Google services created successfully using SmartServicesInitializer');

            return this.services;

        } catch (error) {
            this.logger.error('Failed to create integrated services', error);
            throw error;
        }
    }

    /**
     * Initialize Google authentication
     */
    async _initializeAuth() {
        try {
            // Unified auth approach - prefer service account
            if (this.config.google?.clientEmail && this.config.google?.privateKey) {
                this.logger.info('Using service account authentication');
                return {
                    type: 'service_account',
                    credentials: {
                        client_email: this.config.google.clientEmail,
                        private_key: this.config.google.privateKey.replace(/\\n/g, '\n')
                    }
                };
            }

            // Fallback to other auth methods
            const auth = getGoogleAuth();
            const isValid = await auth.validateGoogleCredentials();
            
            if (!isValid) {
                throw new Error('Invalid Google credentials');
            }

            return auth;

        } catch (error) {
            this.logger.error('Auth initialization failed', error);
            throw error;
        }
    }

    /**
     * Set up event listeners for cross-service communication
     */
    _setupEventListeners() {
        const { eventBus } = this.services;

        // Drive upload completed -> Update sheets
        eventBus.on('drive.file.uploaded', async (data) => {
            this.logger.info('File uploaded, updating sheets', { fileId: data.fileId });
        });

        // Sheets updated -> Cache invalidation
        eventBus.on('spreadsheet:updated', async (data) => {
            await this.services.cache.delete(`recording:list`);
            await this.services.cache.delete(`stats:*`);
        });

        // Processing errors
        eventBus.on('processing:error', (error) => {
            this.logger.error('Processing error', error);
            this.services.metrics.increment('processing.errors');
        });
    }

    /**
     * Create a processing pipeline with all services
     */
    createProcessingPipeline() {
        const { 
            drive, 
            sheets, 
            nameStandardizer, 
            weekInferencer,
            metadataExtractor,
            transcriptionAnalyzer 
        } = this.services;

        return {
            /**
             * Process a single recording through the full pipeline
             */
            async processRecording(recording, options = {}) {
                const startTime = Date.now();
                const result = {
                    success: false,
                    recording: null,
                    errors: [],
                    metrics: {}
                };

                try {
                    // Step 1: Extract metadata
                    const metadata = await metadataExtractor.extractMetadata(recording);
                    result.metrics.metadataExtraction = Date.now() - startTime;

                    // Step 2: Standardize name
                    const nameAnalysis = await nameStandardizer.standardizeName(
                        metadata.topic || recording.topic
                    );
                    result.metrics.nameStandardization = Date.now() - startTime;

                    // Step 3: Infer week
                    const weekAnalysis = await weekInferencer.inferWeek({
                        timestamp: recording.start_time,
                        metadata,
                        recordingName: nameAnalysis.standardizedName
                    });
                    result.metrics.weekInference = Date.now() - startTime;

                    // Step 4: Analyze transcript (if available)
                    let transcriptAnalysis = null;
                    if (recording.transcript || recording.downloadedFiles?.transcript) {
                        transcriptAnalysis = await transcriptionAnalyzer.analyzeTranscript(
                            recording.transcript || recording.downloadedFiles.transcript,
                            {
                                recordingId: recording.id,
                                studentName: nameAnalysis.standardizedName
                            }
                        );
                        result.metrics.transcriptAnalysis = Date.now() - startTime;
                    }

                    // Step 5: Upload to Drive (if files provided)
                    let driveResult = null;
                    if (options.uploadFiles && recording.downloadedFiles) {
                        driveResult = await drive.uploadProcessedRecording(
                            recording,
                            recording.downloadedFiles,
                            nameStandardizer
                        );
                        result.metrics.driveUpload = Date.now() - startTime;
                    }

                    // Step 6: Update Sheets
                    const processedData = {
                        original: recording,
                        processed: {
                            ...metadata,
                            standardizedName: nameAnalysis.standardizedName,
                            weekNumber: weekAnalysis.weekNumber,
                            weekConfidence: weekAnalysis.confidence,
                            analysis: {
                                transcript: transcriptAnalysis
                            },
                            folderId: driveResult?.folderId,
                            folderName: driveResult?.folderName
                        }
                    };

                    const sheetsResult = await sheets.updateMasterSpreadsheet(
                        processedData,
                        options.source || 'Pipeline'
                    );
                    result.metrics.sheetsUpdate = Date.now() - startTime;

                    // Success
                    result.success = true;
                    result.recording = processedData;
                    result.driveResult = driveResult;
                    result.sheetsResult = sheetsResult;
                    result.metrics.total = Date.now() - startTime;

                } catch (error) {
                    result.errors.push(error);
                    this.logger.error('Pipeline processing failed', error);
                }

                return result;
            },

            /**
             * Process multiple recordings in batch
             */
            async processBatch(recordings, options = {}) {
                const results = {
                    total: recordings.length,
                    successful: 0,
                    failed: 0,
                    errors: [],
                    recordings: []
                };

                // Process in chunks to avoid overwhelming APIs
                const chunkSize = options.chunkSize || 5;
                for (let i = 0; i < recordings.length; i += chunkSize) {
                    const chunk = recordings.slice(i, i + chunkSize);
                    
                    const chunkResults = await Promise.allSettled(
                        chunk.map(recording => 
                            this.processRecording(recording, options)
                        )
                    );

                    chunkResults.forEach((result, index) => {
                        if (result.status === 'fulfilled' && result.value.success) {
                            results.successful++;
                            results.recordings.push(result.value);
                        } else {
                            results.failed++;
                            results.errors.push({
                                recording: chunk[index].id,
                                error: result.reason || result.value.errors
                            });
                        }
                    });

                    // Rate limiting between chunks
                    if (i + chunkSize < recordings.length) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                return results;
            }
        };
    }

    /**
     * Get service health status
     */
    async getHealthStatus() {
        const health = {
            services: {},
            overall: true
        };

        // Check Drive
        try {
            const driveHealth = await this.services.drive?.getHealthStatus();
            health.services.drive = driveHealth;
        } catch (error) {
            health.services.drive = { healthy: false, error: error.message };
            health.overall = false;
        }

        // Check Sheets
        try {
            const sheetsStats = await this.services.sheets?.getSpreadsheetStats();
            health.services.sheets = { 
                healthy: sheetsStats.success, 
                stats: sheetsStats 
            };
        } catch (error) {
            health.services.sheets = { healthy: false, error: error.message };
            health.overall = false;
        }

        // Check Cache
        health.services.cache = {
            healthy: await this.services.cache?.isHealthy(),
            type: this.services.cache?.type
        };

        return health;
    }

    /**
     * Cleanup and shutdown
     */
    async shutdown() {
        this.logger.info('Shutting down Google Integration Factory');
        
        // Clear event listeners
        this.services.eventBus?.removeAllListeners();
        
        // Close cache connections
        await this.services.cache?.close();
        
        // Clear services
        this.services = {};
    }
}

module.exports = { GoogleIntegrationFactory };