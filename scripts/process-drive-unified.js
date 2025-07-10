#!/usr/bin/env node

/**
 * Unified Drive Processing Script
 * Properly groups all files in a recording folder as ONE session
 */

require('dotenv').config();
const { google } = require('googleapis');
const { createContainer } = require('../src/container');
const IntegratedDriveProcessorV4 = require('../src/drive-source/services/IntegratedDriveProcessorV4');
const MultiTabGoogleSheetsService = require('../src/infrastructure/services/MultiTabGoogleSheetsService');
const awilix = require('awilix');
const crypto = require('crypto');

const config = require('../config');

// S3-Ivylevel root folder ID
const S3_IVYLEVEL_ROOT_ID = '1Dpq3rSZelQJJePkSi7K6xAY4q62xMiFA';

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
 * Get all recording folders from the entire drive structure
 */
async function getAllRecordingFolders(drive) {
    const recordingFolders = [];
    const processedFolders = new Set();
    
    async function scanFolder(folderId, path = '', depth = 0) {
        if (depth > 6 || processedFolders.has(folderId)) return;
        processedFolders.add(folderId);
        
        try {
            // Check if this folder has recording files
            if (await isRecordingFolder(drive, folderId)) {
                // Get folder details
                const folderResponse = await drive.files.get({
                    fileId: folderId,
                    fields: 'id,name'
                });
                
                recordingFolders.push({
                    id: folderId,
                    name: folderResponse.data.name,
                    path: path
                });
                
                // Don't scan subfolders of recording folders
                return;
            }
            
            // Otherwise, scan subfolders
            const foldersResponse = await drive.files.list({
                q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'files(id, name)',
                pageSize: 1000
            });
            
            const subfolders = foldersResponse.data.files || [];
            
            for (const subfolder of subfolders) {
                await scanFolder(subfolder.id, path + '/' + subfolder.name, depth + 1);
            }
            
        } catch (error) {
            console.error(`Error scanning folder ${folderId}: ${error.message}`);
        }
    }
    
    // Start scanning from root
    await scanFolder(S3_IVYLEVEL_ROOT_ID);
    
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
    console.log('🚀 Unified Google Drive Recording Processor');
    console.log('=' .repeat(60));
    
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
        
        // Get all recording folders
        console.log('🔍 Discovering all recording folders...');
        const recordingFolders = await getAllRecordingFolders(drive);
        console.log(`✅ Found ${recordingFolders.length} recording folders\n`);
        
        // Group by coach for better display
        const foldersByCoach = {};
        recordingFolders.forEach(folder => {
            const pathParts = folder.path.split('/');
            const coach = pathParts[1] || 'Unknown';
            if (!foldersByCoach[coach]) {
                foldersByCoach[coach] = [];
            }
            foldersByCoach[coach].push(folder);
        });
        
        // Process statistics
        let totalStats = {
            folders: 0,
            processed: 0,
            errors: 0
        };
        
        // Process each coach's folders
        for (const [coach, folders] of Object.entries(foldersByCoach)) {
            console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`📁 ${coach} (${folders.length} recordings)`);
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
            
            for (let i = 0; i < folders.length; i++) {
                const folder = folders[i];
                totalStats.folders++;
                
                console.log(`🎬 [${i + 1}/${folders.length}] ${folder.name}`);
                
                const result = await processRecordingFolder(drive, folder, processor);
                
                if (result.success) {
                    totalStats.processed++;
                    console.log(`   ✅ Success: ${result.standardizedName}`);
                    console.log(`   📊 B indicator: ${result.standardizedName?.includes('_B_') ? 'YES ✓' : 'NO ✗'}`);
                } else {
                    totalStats.errors++;
                    console.log(`   ❌ Failed: ${result.error}`);
                }
                
                // Small delay between recordings
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        // Final summary
        console.log('\n' + '═'.repeat(60));
        console.log('📊 FINAL PROCESSING SUMMARY');
        console.log('═'.repeat(60));
        console.log(`✅ Total recording folders: ${totalStats.folders}`);
        console.log(`✅ Successfully processed: ${totalStats.processed}`);
        console.log(`❌ Errors: ${totalStats.errors}`);
        console.log(`📈 Success rate: ${((totalStats.processed / totalStats.folders) * 100).toFixed(1)}%`);
        console.log('═'.repeat(60));
        
        console.log('\n✅ Processing complete!');
        console.log('📊 Check the Drive Import tabs in Google Sheets');
        console.log('   Each recording folder appears as exactly ONE row');
        console.log('   All files from each folder are grouped together');
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

console.log('🚀 Starting unified Google Drive processing...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });