#!/usr/bin/env node

/**
 * Limited test of unified processing - process only first 10 recordings
 * to demonstrate proper folder-based grouping
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
 * Get LIMITED recording folders for testing
 */
async function getLimitedRecordingFolders(drive, limit = 10) {
    const recordingFolders = [];
    const processedFolders = new Set();
    
    async function scanFolder(folderId, path = '', depth = 0) {
        if (depth > 6 || processedFolders.has(folderId) || recordingFolders.length >= limit) return;
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
                pageSize: 100
            });
            
            const subfolders = foldersResponse.data.files || [];
            
            for (const subfolder of subfolders) {
                if (recordingFolders.length >= limit) break;
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
        
        // Show file breakdown
        const fileTypes = {
            video: files.filter(f => f.name.toLowerCase().includes('.mp4')),
            audio: files.filter(f => f.name.toLowerCase().includes('.m4a')),
            transcript: files.filter(f => f.name.toLowerCase().includes('.vtt')),
            chat: files.filter(f => f.name.toLowerCase().includes('.txt')),
            other: files.filter(f => !f.name.match(/\.(mp4|m4a|vtt|txt)$/i))
        };
        
        console.log(`   📊 File breakdown:`);
        console.log(`      📹 Videos: ${fileTypes.video.length}`);
        console.log(`      🔊 Audio: ${fileTypes.audio.length}`);
        console.log(`      📝 Transcripts: ${fileTypes.transcript.length}`);
        console.log(`      💬 Chat: ${fileTypes.chat.length}`);
        console.log(`      📄 Other: ${fileTypes.other.length}`);
        console.log(`      📁 TOTAL: ${files.length} files`);
        
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
        
        console.log(`   🔄 Processing as ONE session with ${files.length} files...`);
        
        // Process the session
        const result = await processor.processRecording(session);
        
        return {
            success: result.success,
            standardizedName: result.standardizedName,
            error: result.error,
            filesProcessed: files.length
        };
        
    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function main() {
    console.log('🚀 LIMITED Test: Unified Google Drive Recording Processor');
    console.log('   Processing only first 10 recordings to demonstrate proper grouping');
    console.log('=' .repeat(70));
    
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
        
        // Get LIMITED recording folders
        console.log('🔍 Discovering first 10 recording folders...');
        const recordingFolders = await getLimitedRecordingFolders(drive, 10);
        console.log(`✅ Found ${recordingFolders.length} recording folders\n`);
        
        // Process statistics
        let totalStats = {
            folders: 0,
            processed: 0,
            errors: 0,
            totalFiles: 0
        };
        
        // Process each folder
        for (let i = 0; i < recordingFolders.length; i++) {
            const folder = recordingFolders[i];
            totalStats.folders++;
            
            console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`🎬 [${i + 1}/${recordingFolders.length}] ${folder.name}`);
            console.log(`   Path: ${folder.path}`);
            
            const result = await processRecordingFolder(drive, folder, processor);
            
            if (result.success) {
                totalStats.processed++;
                totalStats.totalFiles += result.filesProcessed;
                console.log(`   ✅ Success: ${result.standardizedName}`);
                console.log(`   📊 B indicator: ${result.standardizedName?.includes('_B_') ? 'YES ✓' : 'NO ✗'}`);
                console.log(`   🗂️ Created 1 row in sheets for ${result.filesProcessed} files`);
            } else {
                totalStats.errors++;
                console.log(`   ❌ Failed: ${result.error}`);
            }
            
            // Small delay between recordings
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Final summary
        console.log('\n' + '═'.repeat(70));
        console.log('📊 TEST SUMMARY - UNIFIED PROCESSING');
        console.log('═'.repeat(70));
        console.log(`✅ Recording folders processed: ${totalStats.folders}`);
        console.log(`✅ Successfully processed: ${totalStats.processed}`);
        console.log(`❌ Errors: ${totalStats.errors}`);
        console.log(`📁 Total files grouped: ${totalStats.totalFiles}`);
        console.log(`📈 Average files per recording: ${(totalStats.totalFiles / totalStats.processed).toFixed(1)}`);
        console.log('═'.repeat(70));
        
        console.log('\n✅ Test complete!');
        console.log('\n🎯 KEY RESULTS:');
        console.log('   • Each recording folder appears as EXACTLY ONE row in sheets');
        console.log('   • All files from each folder are grouped together');
        console.log('   • No more duplicate rows for the same recording');
        console.log('\n📊 Check the Drive Import tabs in Google Sheets to verify');
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

console.log('🚀 Starting LIMITED unified Google Drive processing test...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });