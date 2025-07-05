// Standalone configuration for drive-source testing
// This is separate from the main project to avoid interfering with ongoing processing

require('dotenv').config();

// Parse Google Service Account JSON if provided
let parsedGoogleCredentials = null;
if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
        parsedGoogleCredentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch (error) {
        console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', error.message);
    }
}

const standaloneConfig = {
    // Google authentication (same as main project)
    google: {
        clientEmail: parsedGoogleCredentials?.client_email || process.env.GOOGLE_CLIENT_EMAIL,
        privateKey: parsedGoogleCredentials?.private_key || process.env.GOOGLE_PRIVATE_KEY,
        
        // SEPARATE DRIVE FOLDERS FOR TESTING - These should be created in Google Drive
        drive: {
            // Test folders under S3-Ivylevel-GDrive-Session-Recordings
            testRootFolderId: process.env.DRIVE_SOURCE_TEST_ROOT || '1Dpq3rSZelQJJePkSi7K6xAY4q62xMiFA', // S3-Ivylevel folder
            
            // Test folders now configured
            recordingsRootFolderId: process.env.DRIVE_SOURCE_RECORDINGS_ROOT || 'CREATE_TEST_FOLDER',
            coachesFolderId: process.env.DRIVE_SOURCE_COACHES_FOLDER || 'CREATE_TEST_FOLDER', 
            studentsFolderId: process.env.DRIVE_SOURCE_STUDENTS_FOLDER || 'CREATE_TEST_FOLDER',
            miscFolderId: process.env.DRIVE_SOURCE_MISC_FOLDER || 'CREATE_TEST_FOLDER',
            trivialFolderId: process.env.DRIVE_SOURCE_TRIVIAL_FOLDER || 'CREATE_TEST_FOLDER'
        },
        
        // SEPARATE GOOGLE SHEET FOR TESTING
        sheets: {
            masterIndexSheetId: process.env.DRIVE_SOURCE_TEST_SHEET || 'CREATE_TEST_SHEET'
        }
    },
    
    // Processing configuration
    processing: {
        maxRetries: 3,
        retryDelay: 5000,
        downloadTimeout: 600000, // 10 minutes
        processingTimeout: 1800000, // 30 minutes
        concurrentProcessing: 2
    },
    
    // Drive source specific settings
    driveSource: {
        // Main source folder
        s3IvylevelFolderId: '1Dpq3rSZelQJJePkSi7K6xAY4q62xMiFA',
        
        // Known coach folders for quick access
        coachFolders: {
            'Jenny': '1hlwz3XSGz53Q1OPmVHAzLf4-46CAmh40',
            'Alan': '1ZPlXd04BoKwVNjfXP5oTZTzhIVNO7hnV',
            'Juli': '1Qd-fcahIti7Xs-wtVgfnHKsE9qp4v_uD',
            'Andrew': '18RQk0cgJGQJHoovcsStfXoUJmFrJajzH'
        },
        
        // Processing options
        scanOptions: {
            maxDepth: 5,
            minFileSize: 100 * 1024, // 100KB minimum
            batchSize: 10, // Process 10 sessions at a time
            dryRun: false // Set to true to test without moving files
        }
    }
};

// Helper to check if test folders are configured
standaloneConfig.isTestEnvironmentReady = function() {
    const drive = this.google.drive;
    const sheets = this.google.sheets;
    
    const notConfigured = [];
    
    if (drive.recordingsRootFolderId === 'CREATE_TEST_FOLDER') {
        notConfigured.push('recordingsRootFolderId');
    }
    if (drive.coachesFolderId === 'CREATE_TEST_FOLDER') {
        notConfigured.push('coachesFolderId');
    }
    if (drive.studentsFolderId === 'CREATE_TEST_FOLDER') {
        notConfigured.push('studentsFolderId');
    }
    if (drive.miscFolderId === 'CREATE_TEST_FOLDER') {
        notConfigured.push('miscFolderId');
    }
    if (drive.trivialFolderId === 'CREATE_TEST_FOLDER') {
        notConfigured.push('trivialFolderId');
    }
    if (sheets.masterIndexSheetId === 'CREATE_TEST_SHEET') {
        notConfigured.push('masterIndexSheetId');
    }
    
    if (notConfigured.length > 0) {
        console.log('\n⚠️  Test environment not fully configured!');
        console.log('Please create the following in Google Drive/Sheets:');
        notConfigured.forEach(item => console.log(`  - ${item}`));
        console.log('\nThen update the IDs in .env or this config file.');
        return false;
    }
    
    return true;
};

module.exports = standaloneConfig;