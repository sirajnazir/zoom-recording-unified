// src/config/index.js
require('dotenv').config();

// Parse Google Service Account JSON if provided
let parsedGoogleCredentials = null;

// First try to decode base64 service account key
if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
        // Remove any line breaks or spaces from the base64 string
        const cleanedKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY.replace(/\s+/g, '');
        const decodedKey = Buffer.from(cleanedKey, 'base64').toString('utf-8');
        parsedGoogleCredentials = JSON.parse(decodedKey);
        console.log('✅ Decoded Google Service Account Key successfully');
        console.log('   Client Email:', parsedGoogleCredentials.client_email ? '✓ Found' : '✗ Missing');
        console.log('   Private Key:', parsedGoogleCredentials.private_key ? '✓ Found' : '✗ Missing');
    } catch (error) {
        console.error('❌ Failed to decode GOOGLE_SERVICE_ACCOUNT_KEY:', error.message);
    }
}

// Fallback to direct JSON if provided
if (!parsedGoogleCredentials && process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
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
        privateKey: parsedGoogleCredentials?.private_key || process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        serviceAccountKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
        serviceAccountJson: parsedGoogleCredentials,
        // OAuth2 credentials (base64 encoded, fallback)
        credentialsBase64: process.env.GOOGLE_CREDENTIALS_BASE64,
        tokenBase64: process.env.GOOGLE_TOKEN_BASE64,
        
        drive: {
            recordingsRootFolderId: process.env.RECORDINGS_ROOT_FOLDER_ID,
            coachesFolderId: process.env.COACHES_FOLDER_ID || '1fLA2s5KBgg0t0JHwoihjj35-wiwr8hJ8',
            studentsFolderId: process.env.STUDENTS_FOLDER_ID || '12LgtSd9CpOllNBBycCfxPVFB6Sk9bTIp',
            miscFolderId: process.env.MISC_FOLDER_ID || '1jMQ_gmwfUQv6gvGAXog3UrnXinUej0Qt',
            trivialFolderId: process.env.TRIVIAL_FOLDER_ID || '12oCxJ6xwJ5xDWo7H89nSh9OQJroTBhhH',
            // Additional auxiliary folders
            gamePlanReportsFolderId: process.env.GAME_PLAN_REPORTS_FOLDER_ID || '1Gxok38h6CAa0fw-zs8JFWoKSkzWlWEUG',
            executionDocsFolderId: process.env.EXECUTION_DOCS_FOLDER_ID || '1ZElDyXLjHPW5kTkn2piUHmJ9n6iwYNkK'
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
        enableAutoRetry: process.env.ENABLE_AUTO_RETRY !== 'false',
        enableDriveSource: process.env.ENABLE_DRIVE_SOURCE === 'true'
    },
    
    // Drive source configuration (NEW - doesn't affect existing functionality)
    driveSource: {
        enabled: process.env.ENABLE_DRIVE_SOURCE === 'true',
        s3IvylevelFolderId: process.env.S3_IVYLEVEL_FOLDER_ID || '1Dpq3rSZelQJJePkSi7K6xAY4q62xMiFA',
        
        // Known coach folders for quick access
        coachFolders: {
            'Jenny': process.env.JENNY_FOLDER_ID || '1hlwz3XSGz53Q1OPmVHAzLf4-46CAmh40',
            'Alan': process.env.ALAN_FOLDER_ID || '1ZPlXd04BoKwVNjfXP5oTZTzhIVNO7hnV',
            'Juli': process.env.JULI_FOLDER_ID || '1Qd-fcahIti7Xs-wtVgfnHKsE9qp4v_uD',
            'Andrew': process.env.ANDREW_FOLDER_ID || '18RQk0cgJGQJHoovcsStfXoUJmFrJajzH'
        },
        
        scanOptions: {
            maxDepth: parseInt(process.env.DRIVE_SCAN_MAX_DEPTH || '5'),
            minFileSize: parseInt(process.env.DRIVE_MIN_FILE_SIZE || '102400'), // 100KB
            batchSize: parseInt(process.env.DRIVE_BATCH_SIZE || '10')
        },
        
        // Use test folders if configured
        useTestFolders: process.env.USE_DRIVE_TEST_FOLDERS === 'true',
        testFolders: {
            recordingsRootFolderId: process.env.DRIVE_SOURCE_RECORDINGS_ROOT,
            coachesFolderId: process.env.DRIVE_SOURCE_COACHES_FOLDER,
            studentsFolderId: process.env.DRIVE_SOURCE_STUDENTS_FOLDER,
            miscFolderId: process.env.DRIVE_SOURCE_MISC_FOLDER,
            trivialFolderId: process.env.DRIVE_SOURCE_TRIVIAL_FOLDER
        },
        
        testSheetId: process.env.DRIVE_SOURCE_TEST_SHEET
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
        console.log('Configuration validation status:', missing.join(', '));
        
        // Additional debugging for Google credentials
        if (missing.includes('google.clientEmail') || missing.includes('google.privateKey')) {
            console.log('Google Auth Debug:');
            console.log('  GOOGLE_SERVICE_ACCOUNT_KEY exists:', !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
            console.log('  GOOGLE_SERVICE_ACCOUNT_JSON exists:', !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
            console.log('  Parsed successfully:', !!parsedGoogleCredentials);
            if (parsedGoogleCredentials) {
                console.log('  Has client_email:', !!parsedGoogleCredentials.client_email);
                console.log('  Has private_key:', !!parsedGoogleCredentials.private_key);
            }
        }
        
        // Don't block execution, just warn
        if (missing.length > 0 && !missing.includes('google.clientEmail') && !missing.includes('google.privateKey')) {
            console.warn('⚠️  Some configuration missing but Google credentials are available');
        }
    }
}

// Debug logging before export
console.log('\n🔍 DEBUG: Config Google Credentials Before Export');
console.log('================================================');
console.log('config.google.clientEmail:', config.google.clientEmail ? '✓ Set' : '✗ Not set');
console.log('config.google.privateKey:', config.google.privateKey ? '✓ Set' : '✗ Not set');
if (config.google.clientEmail) {
    console.log('clientEmail value:', config.google.clientEmail);
}
if (config.google.privateKey) {
    console.log('privateKey length:', config.google.privateKey.length);
}
console.log('================================================\n');

// Validate config on load
validateConfig();

module.exports = config;
