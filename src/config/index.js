// src/config/index.js
require('dotenv').config();

const config = {
    server: {
        port: process.env.PORT || 3000,
        env: process.env.NODE_ENV || 'development',
        adminEmail: process.env.ADMIN_EMAIL,
        adminToken: process.env.ADMIN_TOKEN
    },
    
    zoom: {
        accountId: process.env.ZOOM_ACCOUNT_ID,
        clientId: process.env.ZOOM_CLIENT_ID,
        clientSecret: process.env.ZOOM_CLIENT_SECRET,
        webhookSecretToken: process.env.ZOOM_WEBHOOK_SECRET_TOKEN,
        apiBaseUrl: 'https://api.zoom.us/v2',
        oauth2BaseUrl: 'https://zoom.us/oauth'
    },
    
    google: {
        // OAuth2 credentials (base64 encoded)
        credentialsBase64: process.env.GOOGLE_CREDENTIALS_BASE64,
        tokenBase64: process.env.GOOGLE_TOKEN_BASE64,
        
        drive: {
            recordingsRootFolderId: process.env.RECORDINGS_ROOT_FOLDER_ID,
                    coachesFolderId: process.env.COACHES_FOLDER_ID || '1fLA2s5KBgg0t0JHwoihjj35-wiwr8hJ8',
        studentsFolderId: process.env.STUDENTS_FOLDER_ID || '12LgtSd9CpOllNBBycCfxPVFB6Sk9bTIp',
        miscFolderId: process.env.MISC_FOLDER_ID || '1jMQ_gmwfUQv6gvGAXog3UrnXinUej0Qt',
        trivialFolderId: process.env.TRIVIAL_FOLDER_ID || '12oCxJ6xwJ5xDWo7H89nSh9OQJroTBhhH'
        },
        
        sheets: {
            masterIndexSheetId: process.env.MASTER_INDEX_SHEET_ID
        }
    },
    
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
        maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '4000'),
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7')
    },
    
    redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        keyPrefix: 'zoom-processor:',
        ttl: {
            default: 3600,      // 1 hour
            recording: 86400,   // 24 hours
            auth: 3300         // 55 minutes (Zoom token expires in 1 hour)
        }
    },
    
    processing: {
        maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
        retryDelay: parseInt(process.env.RETRY_DELAY || '5000'),
        downloadTimeout: parseInt(process.env.DOWNLOAD_TIMEOUT || '600000'), // 10 minutes
        processingTimeout: parseInt(process.env.PROCESSING_TIMEOUT || '1800000'), // 30 minutes
        webhookTimeout: parseInt(process.env.WEBHOOK_TIMEOUT || '30000'), // 30 seconds
        concurrentProcessing: parseInt(process.env.CONCURRENT_PROCESSING || '2')
    },
    
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.LOG_FORMAT || 'json',
        directory: process.env.LOG_DIRECTORY || './logs'
    },
    
    features: {
        enableTranscription: process.env.ENABLE_TRANSCRIPTION !== 'false',
        enableInsights: process.env.ENABLE_INSIGHTS !== 'false',
        enableDriveUpload: process.env.ENABLE_DRIVE_UPLOAD !== 'false',
        enableSheetsTracking: process.env.ENABLE_SHEETS_TRACKING !== 'false',
        enableNotifications: process.env.ENABLE_NOTIFICATIONS === 'true',
        enableAutoRetry: process.env.ENABLE_AUTO_RETRY !== 'false'
    }
};

// Validate required configuration
function validateConfig() {
    const required = [
        'zoom.accountId',
        'zoom.clientId',
        'zoom.clientSecret',
        'zoom.webhookSecretToken',
        'google.credentialsBase64',
        'google.tokenBase64',
        'google.drive.recordingsRootFolderId',
        'google.sheets.masterIndexSheetId',
        'openai.apiKey'
    ];
    
    const missing = [];
    
    for (const path of required) {
        const parts = path.split('.');
        let value = config;
        
        for (const part of parts) {
            value = value?.[part];
        }
        
        if (!value) {
            missing.push(path);
        }
    }
    
    if (missing.length > 0) {
        throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }
}

// Validate config on load
if (process.env.NODE_ENV !== 'test') {
    try {
        validateConfig();
    } catch (error) {
        console.error('Configuration validation failed:', error.message);
        console.error('Please check your .env file');
        // Don't exit in development to allow debugging
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }
    }
}

module.exports = config;