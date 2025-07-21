// src/shared/config/smart-config.js
require('dotenv').config();

/**
 * Unified configuration for Smart Logic Integration
 * Single source of truth for all Google services and smart features
 */
class SmartConfig {
    constructor() {
        this.config = this._buildConfig();
        this._validateConfig();
    }

    _buildConfig() {
        return {
            // Environment
            environment: process.env.NODE_ENV || 'development',
            
            // Google Authentication
            google: {
                // Service Account (preferred)
                clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
                privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                
                // Drive Configuration
                drive: {
                    parentFolderId: process.env.RECORDINGS_ROOT_FOLDER_ID,
                            coachesFolderId: process.env.COACHES_FOLDER_ID || '1fLA2s5KBgg0t0JHwoihjj35-wiwr8hJ8',
        studentsFolderId: process.env.STUDENTS_FOLDER_ID || '12LgtSd9CpOllNBBycCfxPVFB6Sk9bTIp',
        miscFolderId: process.env.MISC_FOLDER_ID || '1jMQ_gmwfUQv6gvGAXog3UrnXinUej0Qt',
        trivialFolderId: process.env.TRIVIAL_FOLDER_ID || '12oCxJ6xwJ5xDWo7H89nSh9OQJroTBhhH',
                    
                    // Operational settings
                    retryAttempts: parseInt(process.env.DRIVE_RETRY_ATTEMPTS) || 3,
                    uploadTimeout: parseInt(process.env.DRIVE_UPLOAD_TIMEOUT) || 600000,
                    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 5368709120, // 5GB
                    
                    // Folder naming patterns
                    folderNaming: {
                        sessionFormat: '{date}_{coach}_{student}_{week}',
                        dateFormat: 'YYYY-MM-DD'
                    }
                },
                
                // Sheets Configuration
                sheets: {
                    masterIndexSheetId: process.env.MASTER_INDEX_SHEET_ID,
                    sheetName: process.env.SHEET_NAME || 'Smart Schema Master Index',
                    
                    // Batch processing
                    batchSize: parseInt(process.env.SHEETS_BATCH_SIZE) || 100,
                    rateLimitDelay: parseInt(process.env.SHEETS_RATE_LIMIT_DELAY) || 100,
                    
                    // Schema version
                    schemaVersion: '2.0-smart',
                    columnCount: 50 // A to AX
                }
            },
            
            // Smart Logic Features
            smartLogic: {
                // Name Standardization
                nameStandardization: {
                    enabled: process.env.NAME_STANDARDIZATION !== 'false',
                    confidenceThreshold: parseInt(process.env.NAME_CONFIDENCE_THRESHOLD) || 70,
                    
                    // Known patterns
                    patterns: {
                        coaches: ['Jenny', 'Mike', 'Sarah', 'Rishi', 'Jamie', 'Amanda', 'David'],
                        sessionTypes: {
                            'game plan': 'GamePlan',
                            'coaching': 'Coaching',
                            'check-in': 'CheckIn',
                            'office hours': 'OfficeHours',
                            'consultation': 'Consultation'
                        }
                    }
                },
                
                // Week Inference
                weekInference: {
                    enabled: process.env.WEEK_INFERENCE !== 'false',
                    methods: {
                        pattern: { enabled: true, weight: 0.4 },
                        timeline: { enabled: true, weight: 0.3 },
                        historical: { enabled: true, weight: 0.2 },
                        ai: { enabled: process.env.USE_AI === 'true', weight: 0.1 }
                    },
                    
                    // Program durations
                    programDurations: {
                        standard: 12,
                        extended: 16,
                        intensive: 8
                    }
                },
                
                // Transcript Analysis
                transcriptAnalysis: {
                    enabled: process.env.TRANSCRIPT_ANALYSIS !== 'false',
                    
                    // Analysis features
                    features: {
                        speakerIdentification: true,
                        emotionalJourney: true,
                        engagementScoring: true,
                        keyMoments: true,
                        actionItems: true,
                        coachingStyle: true
                    },
                    
                    // Quality thresholds
                    quality: {
                        minDuration: 300, // 5 minutes
                        minSpeakers: 2,
                        minWordCount: 100
                    }
                },
                
                // Metadata Extraction
                metadataExtraction: {
                    sources: {
                        files: { priority: 1, weight: 0.4 },
                        participants: { priority: 2, weight: 0.3 },
                        topic: { priority: 3, weight: 0.2 },
                        host: { priority: 4, weight: 0.1 }
                    },
                    
                    // Confidence scoring
                    confidence: {
                        highThreshold: 90,
                        mediumThreshold: 70,
                        lowThreshold: 50
                    }
                }
            },
            
            // AI Integration
            ai: {
                enabled: process.env.USE_AI === 'true',
                provider: process.env.AI_PROVIDER || 'openai',
                
                openai: {
                    apiKey: process.env.OPENAI_API_KEY,
                    model: process.env.OPENAI_MODEL || 'gpt-4',
                    temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.3,
                    maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 2000
                },
                
                // AI features
                features: {
                    transcriptAnalysis: true,
                    nameResolution: true,
                    weekInference: true,
                    insightGeneration: true,
                    outcomeTracking: true
                }
            },
            
            // Caching
            cache: {
                type: process.env.CACHE_TYPE || 'memory',
                
                redis: {
                    enabled: process.env.REDIS_ENABLED === 'true',
                    host: process.env.REDIS_HOST || 'localhost',
                    port: parseInt(process.env.REDIS_PORT) || 6379,
                    password: process.env.REDIS_PASSWORD
                },
                
                // TTL settings (seconds)
                ttl: {
                    default: 3600,
                    metadata: 7200,
                    analysis: 86400,
                    stats: 300
                }
            },
            
            // Processing
            processing: {
                // Concurrency
                maxConcurrent: parseInt(process.env.MAX_CONCURRENT) || 3,
                batchSize: parseInt(process.env.BATCH_SIZE) || 10,
                
                // Timeouts
                timeouts: {
                    download: parseInt(process.env.DOWNLOAD_TIMEOUT) || 300000,
                    processing: parseInt(process.env.PROCESSING_TIMEOUT) || 600000,
                    upload: parseInt(process.env.UPLOAD_TIMEOUT) || 600000
                },
                
                // File handling
                files: {
                    downloadEnabled: process.env.DOWNLOAD_FILES !== 'false',
                    keepLocal: process.env.KEEP_LOCAL_FILES === 'true',
                    outputDir: process.env.OUTPUT_DIR || './output'
                }
            },
            
            // Monitoring
            monitoring: {
                metrics: {
                    enabled: process.env.METRICS_ENABLED === 'true',
                    provider: process.env.METRICS_PROVIDER || 'console'
                },
                
                logging: {
                    level: process.env.LOG_LEVEL || 'info',
                    format: process.env.LOG_FORMAT || 'json',
                    destination: process.env.LOG_DESTINATION || 'console'
                },
                
                alerts: {
                    enabled: process.env.ALERTS_ENABLED === 'true',
                    channels: (process.env.ALERT_CHANNELS || '').split(',').filter(Boolean)
                }
            },
            
            // Feature Flags
            features: {
                smartNaming: process.env.FEATURE_SMART_NAMING !== 'false',
                weekInference: process.env.FEATURE_WEEK_INFERENCE !== 'false',
                transcriptAnalysis: process.env.FEATURE_TRANSCRIPT_ANALYSIS !== 'false',
                aiInsights: process.env.FEATURE_AI_INSIGHTS === 'true',
                duplicateDetection: process.env.FEATURE_DUPLICATE_DETECTION !== 'false',
                autoShortcuts: process.env.FEATURE_AUTO_SHORTCUTS !== 'false',
                batchProcessing: process.env.FEATURE_BATCH_PROCESSING !== 'false'
            }
        };
    }

    _validateConfig() {
        const errors = [];
        
        // Validate Google credentials (service account only)
        if (!(this.config.google.clientEmail && this.config.google.privateKey)) {
            errors.push('Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY');
        }
        
        // Validate required IDs
        const requiredIds = [
            'google.drive.parentFolderId',
            'google.sheets.masterIndexSheetId'
        ];
        
        requiredIds.forEach(path => {
            if (!this._getConfigValue(path)) {
                errors.push(`Missing required configuration: ${path}`);
            }
        });
        
        // Validate AI config if enabled
        if (this.config.ai.enabled && !this.config.ai.openai.apiKey) {
            errors.push('AI enabled but no OpenAI API key provided');
        }
        
        if (errors.length > 0) {
            console.error('Configuration validation errors:', errors);
            if (this.config.environment === 'production') {
                throw new Error(`Configuration invalid: ${errors.join(', ')}`);
            }
        }
    }

    _hasValidGoogleCredentials() {
        return !!(this.config.google.clientEmail && this.config.google.privateKey);
    }

    _getConfigValue(path) {
        return path.split('.').reduce((obj, key) => obj?.[key], this.config);
    }

    /**
     * Get configuration value by path
     */
    get(path) {
        return this._getConfigValue(path);
    }

    /**
     * Check if feature is enabled
     */
    isFeatureEnabled(feature) {
        return this.config.features[feature] === true;
    }

    /**
     * Get all configuration
     */
    getAll() {
        return this.config;
    }

    /**
     * Get sanitized config for logging (no secrets)
     */
    getSanitized() {
        const sanitized = JSON.parse(JSON.stringify(this.config));
        
        // Remove sensitive values
        if (sanitized.google.privateKey) sanitized.google.privateKey = '[REDACTED]';
        if (sanitized.google.credentialsBase64) sanitized.google.credentialsBase64 = '[REDACTED]';
        if (sanitized.google.tokenBase64) sanitized.google.tokenBase64 = '[REDACTED]';
        if (sanitized.ai.openai.apiKey) sanitized.ai.openai.apiKey = '[REDACTED]';
        if (sanitized.cache.redis.password) sanitized.cache.redis.password = '[REDACTED]';
        
        return sanitized;
    }

    /**
     * Validate specific service configuration
     */
    validateService(service) {
        switch (service) {
            case 'drive':
                return {
                    valid: !!this.config.google.drive.parentFolderId,
                    config: this.config.google.drive
                };
            
            case 'sheets':
                return {
                    valid: !!this.config.google.sheets.masterIndexSheetId,
                    config: this.config.google.sheets
                };
            
            case 'ai':
                return {
                    valid: !this.config.ai.enabled || !!this.config.ai.openai.apiKey,
                    config: this.config.ai
                };
            
            default:
                return { valid: false, error: 'Unknown service' };
        }
    }
}

// Export singleton instance
module.exports = new SmartConfig();