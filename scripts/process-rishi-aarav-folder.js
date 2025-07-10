#!/usr/bin/env node

/**
 * Process Rishi & Aarav recordings folder specifically
 * Uses the unified approach to process all recordings with _B_ indicator
 */

require('dotenv').config();
const { google } = require('googleapis');
const { createContainer } = require('../src/container');
const IntegratedDriveProcessorV4 = require('../src/drive-source/services/IntegratedDriveProcessorV4');
const MultiTabGoogleSheetsService = require('../src/infrastructure/services/MultiTabGoogleSheetsService');
const awilix = require('awilix');
const crypto = require('crypto');

const config = require('../config');

// Rishi & Aarav folder ID
const RISHI_AARAV_FOLDER_ID = '1lGkcHEwpsoZ96fqUeuFfudbsD0yPrA-H';

async function initializeGoogleDrive() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: config.google.clientEmail,
            private_key: config.google.privateKey
        },
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });
    
    return google.drive({ version: 'v3', auth });
}

/**
 * Check if a folder contains recording files
 */
async function isRecordingFolder(drive, folderId) {
    const filesResponse = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
        fields: 'files(name)',
        pageSize: 10
    });
    
    const files = filesResponse.data.files || [];
    
    // Check if any file is a recording file
    return files.some(file => {
        const name = file.name.toLowerCase();
        return name.endsWith('.mp4') || name.endsWith('.m4a') || 
               name.endsWith('.vtt') || name.endsWith('.txt') ||
               name.endsWith('.srt');
    });
}

/**
 * Get all recording folders in Rishi & Aarav folder
 */
async function getRecordingFolders(drive) {
    console.log('📁 Scanning Rishi & Aarav folder...');
    
    const foldersResponse = await drive.files.list({
        q: `'${RISHI_AARAV_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id,name)',
        pageSize: 100
    });
    
    const allFolders = foldersResponse.data.files || [];
    
    // Filter to only recording folders
    const recordingFolders = [];
    for (const folder of allFolders) {
        if (folder.name.includes('Coaching_Rishi_Aarav') || 
            (folder.name.includes('GamePlan') && folder.name.includes('Aarav'))) {
            const hasRecordings = await isRecordingFolder(drive, folder.id);
            if (hasRecordings) {
                recordingFolders.push(folder);
            }
        }
    }
    
    return recordingFolders;
}

async function main() {
    console.log('🚀 Processing Rishi & Aarav Recordings');
    console.log('============================================================\n');
    
    try {
        // Initialize services
        console.log('🔧 Initializing services...');
        const container = createContainer();
        const drive = await initializeGoogleDrive();
        
        // Register Google Drive
        container.register({
            googleDrive: awilix.asValue(drive)
        });
        
        // Get the processor
        const processor = container.resolve('integratedDriveProcessorV4');
        
        // Get all recording folders
        const recordingFolders = await getRecordingFolders(drive);
        console.log(`\n📊 Found ${recordingFolders.length} recording folders to process\n`);
        
        let processedCount = 0;
        let errorCount = 0;
        
        // Process each recording folder
        for (let i = 0; i < recordingFolders.length; i++) {
            const folder = recordingFolders[i];
            console.log(`[${i + 1}/${recordingFolders.length}] Processing: ${folder.name}`);
            
            try {
                // Get all files in the folder
                const filesResponse = await drive.files.list({
                    q: `'${folder.id}' in parents and trashed = false`,
                    fields: 'files(id,name,mimeType,size)',
                    pageSize: 100
                });
                
                const files = filesResponse.data.files || [];
                
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
                        fileCount: files.length
                    },
                    dataSource: 'google-drive',
                    source: 'google-drive'
                };
                
                // Process the session
                const result = await processor.processSession(session);
                
                if (result.success) {
                    console.log('  ✅ Successfully processed');
                    processedCount++;
                } else {
                    console.log('  ⚠️  Processing failed:', result.error);
                    errorCount++;
                }
                
            } catch (error) {
                console.error(`  ❌ Error: ${error.message}`);
                errorCount++;
            }
            
            console.log(); // Empty line between recordings
        }
        
        // Summary
        console.log('============================================================');
        console.log('📊 Processing Complete!');
        console.log(`✅ Successful: ${processedCount}`);
        console.log(`❌ Errors: ${errorCount}`);
        console.log(`📝 Total: ${recordingFolders.length}`);
        
    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    }
}

// Run the script
main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });