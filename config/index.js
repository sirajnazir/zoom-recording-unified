// src/config/index.js
require('dotenv').config();

// Parse Google Service Account JSON if provided
let parsedGoogleCredentials = null;
if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
        parsedGoogleCredentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
        console.log('✅ Parsed Google Service Account JSON successfully');
        console.log('   Client Email:', parsedGoogleCredentials.client_email ? '✓ Found' : '✗ Missing');
        console.log('   Private Key:', parsedGoogleCredentials.private_key ? '✓ Found' : '✗ Missing');
    } catch (error) {
        console.error('❌ Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', error.message);
    }
}

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
        // Service account credentials - extract from JSON or use individual env vars
        clientEmail: parsedGoogleCredentials?.client_email || process.env.GOOGLE_CLIENT_EMAIL,
        privateKey: parsedGoogleCredentials?.private_key || process.env.GOOGLE_PRIVATE_KEY,
        serviceAccountKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
        serviceAccountJson: parsedGoogleCredentials,
        // OAuth2 credentials (base64 encoded, fallback)
        credentialsBase64: process.env.GOOGLE_CREDENTIALS_BASE64,
        tokenBase64: process.env.GOOGLE_TOKEN_BASE64,
        
        drive: {
            recordingsRootFolderId: process.env.RECORDINGS_ROOT_FOLDER_ID,
            coachesFolderId: process.env.COACHES_FOLDER_ID,
            studentsFolderId: process.env.STUDENTS_FOLDER_ID,
            miscFolderId: process.env.MISC_FOLDER_ID,
            trivialFolderId: process.env.TRIVIAL_FOLDER_ID
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
        'google.clientEmail',
        'google.privateKey',
        'google.drive.recordingsRootFolderId',
        'google.sheets.masterIndexSheetId'
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
        console.error('Missing required configuration:', missing.join(', '));
        
        // Additional debugging for Google credentials
        if (missing.includes('google.clientEmail') || missing.includes('google.privateKey')) {
            console.error('Google Auth Debug:');
            console.error('  GOOGLE_SERVICE_ACCOUNT_JSON exists:', !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
            console.error('  Parsed successfully:', !!parsedGoogleCredentials);
            if (parsedGoogleCredentials) {
                console.error('  Has client_email:', !!parsedGoogleCredentials.client_email);
                console.error('  Has private_key:', !!parsedGoogleCredentials.private_key);
            }
        }
        
        // Don't throw in production, just warn
        if (process.env.NODE_ENV === 'production') {
            console.warn('⚠️  Configuration incomplete but continuing...');
        }
    }
}

// Validate config on load
validateConfig();

module.exports = config;
