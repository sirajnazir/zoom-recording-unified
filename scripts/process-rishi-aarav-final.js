#!/usr/bin/env node

/**
 * Process ONLY Rishi & Aarav recordings using the working unified approach
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
 * Get recording folders from Rishi & Aarav folder
 */
async function getRishiAaravRecordingFolders(drive) {
    const recordingFolders = [];
    
    // Get all subfolders
    const foldersResponse = await drive.files.list({
        q: `'${RISHI_AARAV_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 100
    });
    
    const folders = foldersResponse.data.files || [];
    
    // Check each folder
    for (const folder of folders) {
        // Only process recording folders
        if (folder.name.includes('Coaching_Rishi_Aarav') || 
            (folder.name.includes('GamePlan') && folder.name.includes('Aarav'))) {
            
            const hasRecordings = await isRecordingFolder(drive, folder.id);
            if (hasRecordings) {
                recordingFolders.push({
                    id: folder.id,
                    name: folder.name,
                    path: `/Rishi & Aarav/${folder.name}`
                });
            }
        }
    }
    
    return recordingFolders;
}

/**
 * Process a single recording folder
 */
async function processRecordingFolder(drive, folder, processor) {
    try {
        // Get all files in the folder
        const filesResponse = await drive.files.list({
            q: `'${folder.id}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType, size, createdTime, modifiedTime)',
            pageSize: 1000
        });
        
        const files = filesResponse.data.files || [];
        
        if (files.length === 0) {
            console.log(`   ⚠️ No files found`);
            return { success: false, error: 'No files' };
        }
        
        // Create session object with ALL files
        const session = {
            id: crypto.randomBytes(8).toString('hex'),
            folderId: folder.id,
            folderName: folder.name,
            files: files.map(file => ({
                id: file.id,
                name: file.name,
                mimeType: file.mimeType,
                size: file.size,
                folderId: folder.id,
                folderName: folder.name,
                createdTime: file.createdTime,
                modifiedTime: file.modifiedTime
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
        const result = await processor.processRecording(session);
        
        return {
            success: result.success,
            standardizedName: result.standardizedName,
            error: result.error
        };
        
    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function main() {
    console.log('🚀 Processing ONLY Rishi & Aarav Recordings');
    console.log('=' .repeat(60));
    console.log(`\nTarget folder: ${RISHI_AARAV_FOLDER_ID}`);
    console.log('URL: https://drive.google.com/drive/folders/1lGkcHEwpsoZ96fqUeuFfudbsD0yPrA-H');
    
    try {
        // Initialize services
        console.log('\n🔧 Initializing services...');
        
        const container = createContainer();
        const scope = container.createScope();
        
        // Override with MultiTabGoogleSheetsService
        scope.register({
            googleSheetsService: awilix.asClass(MultiTabGoogleSheetsService).singleton()
        });
        
        const drive = await initializeGoogleDrive();
        
        // Create processor
        const processor = new IntegratedDriveProcessorV4(config, {
            googleDriveService: scope.resolve('googleDriveService'),
            googleSheetsService: scope.resolve('googleSheetsService'),
            nameStandardizer: scope.resolve('nameStandardizer'),
            weekInferencer: scope.resolve('weekInferencer'),
            metadataExtractor: scope.resolve('metadataExtractor'),
            driveOrganizer: scope.resolve('driveOrganizer'),
            logger: scope.resolve('logger'),
            config: scope.resolve('config')
        });
        
        console.log('✅ Services initialized\n');
        
        // Get Rishi & Aarav recording folders
        console.log('🔍 Discovering Rishi & Aarav recording folders...');
        const recordingFolders = await getRishiAaravRecordingFolders(drive);
        console.log(`✅ Found ${recordingFolders.length} recording folders\n`);
        
        console.log('📂 Recording folders to process:');
        recordingFolders.forEach((folder, idx) => {
            console.log(`   ${idx + 1}. ${folder.name}`);
        });
        console.log();
        
        // Process each folder
        let stats = {
            processed: 0,
            errors: 0
        };
        
        for (let i = 0; i < recordingFolders.length; i++) {
            const folder = recordingFolders[i];
            console.log(`\n[${i + 1}/${recordingFolders.length}] Processing: ${folder.name}`);
            console.log(`   Folder ID: ${folder.id}`);
            
            const result = await processRecordingFolder(drive, folder, processor);
            
            if (result.success) {
                stats.processed++;
                console.log(`   ✅ Success: ${result.standardizedName}`);
            } else {
                stats.errors++;
                console.log(`   ❌ Failed: ${result.error}`);
            }
        }
        
        // Summary
        console.log('\n' + '=' .repeat(60));
        console.log('📊 Processing Complete!');
        console.log(`   ✅ Processed: ${stats.processed}`);
        console.log(`   ❌ Errors: ${stats.errors}`);
        console.log(`   📝 Total: ${recordingFolders.length}`);
        
        if (stats.processed > 0) {
            console.log('\n🎉 Rishi & Aarav recordings have been processed with _B_ indicator!');
        }
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        throw error;
    }
}

// Run the script
console.log('🚀 Starting Rishi & Aarav recordings processing...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });