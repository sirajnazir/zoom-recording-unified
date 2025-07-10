#!/usr/bin/env node

/**
 * Process ONLY Rishi & Aarav recordings
 * Target folder: 1lGkcHEwpsoZ96fqUeuFfudbsD0yPrA-H
 */

require('dotenv').config();
const { google } = require('googleapis');
const crypto = require('crypto');
const config = require('../config');

// Import the same modules used in process-drive-unified.js
const { createContainer } = require('../src/container');
const IntegratedDriveProcessorV4 = require('../src/drive-source/services/IntegratedDriveProcessorV4');
const MultiTabGoogleSheetsService = require('../src/infrastructure/services/MultiTabGoogleSheetsService');
const CompleteSmartNameStandardizer = require('../src/infrastructure/services/CompleteSmartNameStandardizer');
const SmartWeekInferencer = require('../src/infrastructure/services/SmartWeekInferencer');
const DriveOrganizer = require('../src/infrastructure/services/DriveOrganizer');
const awilix = require('awilix');

// Rishi & Aarav folder ID
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

async function processRishiAaravOnly() {
    console.log('🚀 Processing ONLY Rishi & Aarav Recordings');
    console.log('============================================================\n');
    console.log(`Target folder: ${RISHI_AARAV_FOLDER_ID}`);
    console.log('URL: https://drive.google.com/drive/folders/1lGkcHEwpsoZ96fqUeuFfudbsD0yPrA-H\n');
    
    try {
        // Initialize services
        console.log('🔧 Initializing services...');
        const { drive, sheets, auth } = await initializeServices();
        
        // Initialize sheets service
        const sheetsService = new MultiTabGoogleSheetsService(sheets, config.google.sheets.masterIndexSheetId);
        
        // Initialize name standardizer
        const nameStandardizer = new CompleteSmartNameStandardizer();
        
        // Initialize week inferencer
        const weekInferencer = new SmartWeekInferencer();
        
        // Initialize drive organizer
        const driveOrganizer = new DriveOrganizer(drive, config.google.drive.organizedRecordingsFolder);
        
        // Initialize the processor
        const processor = new IntegratedDriveProcessorV4({
            drive,
            sheetsService,
            nameStandardizer,
            weekInferencer,
            driveOrganizer,
            targetRootFolder: config.google.drive.organizedRecordingsFolder
        });
        
        console.log('✅ Services initialized\n');
        
        // Get all recording folders
        console.log('📁 Scanning Rishi & Aarav folder...');
        const foldersResponse = await drive.files.list({
            q: `'${RISHI_AARAV_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id,name)',
            pageSize: 100,
            orderBy: 'name'
        });
        
        const allFolders = foldersResponse.data.files || [];
        
        // Filter to only recording folders
        const recordingFolders = allFolders.filter(folder => 
            folder.name.includes('Coaching_Rishi_Aarav') || 
            (folder.name.includes('GamePlan') && folder.name.includes('Aarav'))
        );
        
        console.log(`\n📊 Found ${recordingFolders.length} recording folders to process`);
        console.log('Recording folders:');
        recordingFolders.forEach(f => console.log(`  - ${f.name}`));
        console.log();
        
        let processedCount = 0;
        let errorCount = 0;
        
        // Process each recording folder
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
                
                console.log('  Processing session...');
                
                // Process the session
                const result = await processor.processSession(session);
                
                if (result.success) {
                    console.log('  ✅ Successfully processed');
                    if (result.data?.standardizedSessionData?.standardizedName) {
                        console.log(`  📝 Standardized: ${result.data.standardizedSessionData.standardizedName}`);
                    }
                    processedCount++;
                } else {
                    console.log('  ⚠️  Processing failed:', result.error || 'Unknown error');
                    errorCount++;
                }
                
            } catch (error) {
                console.error(`  ❌ Error: ${error.message}`);
                errorCount++;
            }
        }
        
        // Summary
        console.log('\n' + '='.repeat(70));
        console.log('📊 Processing Complete!');
        console.log(`✅ Successful: ${processedCount}`);
        console.log(`❌ Errors: ${errorCount}`);
        console.log(`📝 Total: ${recordingFolders.length}`);
        
        console.log('\nAll Rishi & Aarav recordings have been processed with _B_ indicator!');
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        throw error;
    }
}

// Run the script
console.log('🚀 Starting Rishi & Aarav recordings processing...\n');

processRishiAaravOnly()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });