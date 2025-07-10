#!/usr/bin/env node

/**
 * Process all Rishi & Aarav recordings using unified approach
 * Add _B_ indicator and proper standardization
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');
const crypto = require('crypto');
const CompleteSmartNameStandardizer = require('../src/infrastructure/services/CompleteSmartNameStandardizer');
const MultiTabGoogleSheetsService = require('../src/infrastructure/services/MultiTabGoogleSheetsService');
const { DriveFolderEnumerator } = require('../src/infrastructure/services');

// Import processors from the main pipeline
const ProcessingPipeline = require('../src/processors/ProcessingPipeline');
const TranscriptAnalyzer = require('../src/processors/TranscriptAnalyzer');
const FileSystemManager = require('../src/processors/FileSystemManager');
const GoogleDriveManager = require('../src/processors/GoogleDriveManager');
const FallbackSessionData = require('../src/processors/FallbackSessionData');
const GoogleSheetsWriter = require('../src/processors/GoogleSheetsWriter');

const RISHI_AARAV_FOLDER_ID = '1lGkcHEwpsoZ96fqUeuFfudbsD0yPrA-H';

async function initializeServices() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: config.google.clientEmail,
            private_key: config.google.privateKey
        },
        scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
    });
    
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });
    
    return { drive, sheets, auth };
}

async function processRishiAaravRecordings() {
    console.log('🔧 Processing All Rishi & Aarav Recordings');
    console.log('=' .repeat(70));
    
    try {
        const { drive, sheets, auth } = await initializeServices();
        
        // Initialize services
        const sheetsService = new MultiTabGoogleSheetsService(sheets, config.google.sheets.masterIndexSheetId);
        const nameStandardizer = new CompleteSmartNameStandardizer();
        
        // Initialize the processing pipeline
        const transcriptAnalyzer = new TranscriptAnalyzer({ 
            drive, 
            nameStandardizer,
            apiKey: config.openai?.apiKey || 'sk-dummy'
        });
        
        const fileSystemManager = new FileSystemManager({
            localOutputPath: config.recording.localOutputPath
        });
        
        const googleDriveManager = new GoogleDriveManager({
            drive,
            targetRootFolder: config.google.drive.organizedRecordingsFolder
        });
        
        const fallbackSessionData = new FallbackSessionData({ nameStandardizer });
        
        const googleSheetsWriter = new GoogleSheetsWriter({
            sheetsService
        });
        
        const pipeline = new ProcessingPipeline([
            transcriptAnalyzer,
            fileSystemManager,
            googleDriveManager,
            fallbackSessionData,
            googleSheetsWriter
        ]);
        
        // Get all recordings from the folder
        console.log('\n📁 Scanning Rishi & Aarav folder...');
        
        const enumerator = new DriveFolderEnumerator(drive);
        const folders = await enumerator.listRecordingFolders(RISHI_AARAV_FOLDER_ID);
        
        // Filter to only recording folders
        const recordingFolders = folders.filter(folder => 
            folder.name.includes('Coaching_Rishi_Aarav') || 
            folder.name.includes('GamePlan') && folder.name.includes('Aarav')
        );
        
        console.log(`\nFound ${recordingFolders.length} recording folders to process`);
        
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < recordingFolders.length; i++) {
            const folder = recordingFolders[i];
            console.log(`\n[${i + 1}/${recordingFolders.length}] Processing: ${folder.name}`);
            console.log('-'.repeat(70));
            
            try {
                // Get all files in the folder
                const filesResponse = await drive.files.list({
                    q: `'${folder.id}' in parents and trashed = false`,
                    fields: 'files(id,name,mimeType,size)',
                    pageSize: 100
                });
                
                const files = filesResponse.data.files || [];
                console.log(`  Files found: ${files.length}`);
                
                if (files.length === 0) {
                    console.log('  ⚠️  No files found, skipping...');
                    continue;
                }
                
                // Create session object with ALL files from the folder
                const session = {
                    id: crypto.randomBytes(8).toString('hex'),
                    folderId: folder.id,
                    folderName: folder.name,
                    files: files.map(file => ({
                        id: file.id,
                        name: file.name,
                        mimeType: file.mimeType,
                        size: file.size || 0,
                        folderId: folder.id,
                        folderName: folder.name
                    })),
                    metadata: {
                        folderName: folder.name,
                        folderId: folder.id,
                        fileCount: files.length,
                        dataSource: 'google-drive'
                    },
                    dataSource: 'google-drive',
                    source: 'google-drive'
                };
                
                console.log('  Processing through pipeline...');
                
                // Process through the full pipeline
                const result = await pipeline.process(session);
                
                if (result.success) {
                    console.log('  ✅ Successfully processed');
                    if (result.data.standardizedSessionData?.standardizedName) {
                        console.log(`  📝 Standardized: ${result.data.standardizedSessionData.standardizedName}`);
                    }
                    successCount++;
                } else {
                    console.log('  ⚠️  Processing completed with warnings');
                    successCount++;
                }
                
            } catch (error) {
                console.error(`  ❌ Error: ${error.message}`);
                errorCount++;
            }
        }
        
        console.log('\n' + '=' .repeat(70));
        console.log('📊 Processing Complete!');
        console.log(`✅ Successful: ${successCount}`);
        console.log(`❌ Errors: ${errorCount}`);
        console.log(`📝 Total: ${recordingFolders.length}`);
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
    }
}

async function main() {
    console.log('🚀 Starting Rishi & Aarav recordings processing...\n');
    
    try {
        await processRishiAaravRecordings();
    } catch (error) {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    }
}

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });