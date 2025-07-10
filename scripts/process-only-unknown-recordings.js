#!/usr/bin/env node

/**
 * Process ONLY the 20 Unknown Recordings
 * Run this after deleting the unknown rows from sheets and their folders/shortcuts from Drive
 */

require('dotenv').config();
const { google } = require('googleapis');
const { createContainer } = require('../src/container');
const IntegratedDriveProcessorV4 = require('../src/drive-source/services/IntegratedDriveProcessorV4');
const MultiTabGoogleSheetsService = require('../src/infrastructure/services/MultiTabGoogleSheetsService');
const awilix = require('awilix');
const crypto = require('crypto');

const config = require('../config');

// The 20 unknown recordings to reprocess
const unknownRecordings = [
    { folderId: '1KJ8mFzMpT-mpd9FAMUhtC_TVa93L4l8t', name: 'Unknown 1' },
    { folderId: '1o0-Ve3_jUvq0Xv9N1k3e0zMl86kcZJhr', name: 'Unknown 2' },
    { folderId: '1Bhmv97nHdZIuoZoT99dr0H3AhfCTe4oh', name: 'Unknown 3' },
    { folderId: '1IaDGQ-WJcqQiAZ0DC40rmHmPch-wQlvK', name: 'Unknown 4' },
    { folderId: '1mczuxWupqkYn7sWCcSmWfZ4xTseB86w9', name: 'Unknown 5' },
    { folderId: '1d43qU2fNiLFxcG1_V9zbUerJJ7AoUan7', name: 'Unknown 6' },
    { folderId: '1Iv3KwElUoXcZKfN5mPI7qtLtIm02FRBp', name: 'Unknown 7' },
    { folderId: '1qCjIbSejfaaH3AAvbyXcFk7iHo_dbq2c', name: 'Unknown 8' },
    { folderId: '1JTxIdMOAzo76CRdp-oDhBPJxr2mYUK5M', name: 'Unknown 9' },
    { folderId: '1bDNb4rHhBWJgIqdQ1loFdRZlQ56cQ-x9', name: 'Unknown 10' },
    { folderId: '1lDAL4fx6e0BVzXKENLvd3KAomoMg4fQA', name: 'Unknown 11' },
    { folderId: '1ZkXxeJPisUr-GF-1RNKH5NBvBxF9aANI', name: 'Unknown 12' },
    { folderId: '1SSD0ie4Oqa9_gJu46SGZZePx6u6VK7aL', name: 'Unknown 13' },
    { folderId: '1SvoqrgpUGFB2Fv9h9o4rhFGeJ5m2c0xF', name: 'Unknown 14' },
    { folderId: '1reve35GEsOStZ4itNIvTX1qr33ylqU_d', name: 'Unknown 15' },
    { folderId: '1-tTDHE-Z8MErrc7aFDiB2r40ABlYrx6k', name: 'Unknown 16' },
    { folderId: '1JNbbheIrQH_ZP3dPHos8kgTlS96N5mAz', name: 'Unknown 17' },
    { folderId: '162ArNE03QTI9d4kFfuxZ93IgNzmh_fH5', name: 'Unknown 18' },
    { folderId: '1udz0TwG-itMOgqbqzjOdCPMvqQGMW1FA', name: 'Re: Aaryan/Leena session' } // The one we know about
];

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
 * Get folder path to understand context
 */
async function getFolderPath(drive, folderId) {
    const path = [];
    let currentId = folderId;
    
    try {
        for (let depth = 0; depth < 10 && currentId; depth++) {
            const response = await drive.files.get({
                fileId: currentId,
                fields: 'id,name,parents'
            });
            
            path.unshift(response.data.name);
            
            if (response.data.parents && response.data.parents.length > 0) {
                currentId = response.data.parents[0];
            } else {
                break;
            }
        }
    } catch (error) {
        console.error('Error getting folder path:', error.message);
    }
    
    return path;
}

/**
 * Process a single recording folder with enhanced context
 */
async function processRecordingFolder(drive, folder, processor) {
    try {
        // Get folder details
        const folderResponse = await drive.files.get({
            fileId: folder.folderId,
            fields: 'id,name,parents'
        });
        
        const folderName = folderResponse.data.name;
        console.log(`📁 Actual folder name: ${folderName}`);
        
        // Get folder path for context
        const folderPath = await getFolderPath(drive, folder.folderId);
        console.log(`📍 Full path: ${folderPath.join(' / ')}`);
        
        // Get all files in the folder
        const filesResponse = await drive.files.list({
            q: `'${folder.folderId}' in parents and trashed = false`,
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
        
        console.log(`   📊 Files: ${files.length} total`);
        console.log(`      📹 Video: ${fileTypes.video.length}`);
        console.log(`      🔊 Audio: ${fileTypes.audio.length}`);
        console.log(`      📝 Transcript: ${fileTypes.transcript.length}`);
        console.log(`      💬 Chat: ${fileTypes.chat.length}`);
        
        // Create session object with enhanced metadata
        const session = {
            id: crypto.randomBytes(8).toString('hex'),
            folderId: folder.folderId,
            folderName: folderName,
            files: files.map(file => ({
                id: file.id,
                name: file.name,
                mimeType: file.mimeType,
                size: file.size,
                folderId: folder.folderId,
                folderName: folderName,
                createdTime: file.createdTime,
                modifiedTime: file.modifiedTime
            })),
            metadata: {
                folderName: folderName,
                folderId: folder.folderId,
                fileCount: files.length,
                folderPath: folderPath // Add path context
            },
            dataSource: 'google-drive',
            source: 'google-drive'
        };
        
        console.log(`   🔄 Processing session ${session.id}...`);
        
        // Process the session
        const result = await processor.processRecording(session);
        
        return {
            success: result.success,
            standardizedName: result.standardizedName,
            error: result.error,
            filesProcessed: files.length,
            hasTranscript: fileTypes.transcript.length > 0,
            hasChat: fileTypes.chat.length > 0
        };
        
    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function main() {
    console.log('🎯 Processing ONLY Unknown Drive Recordings');
    console.log('   (After cleanup of sheets and drive folders)');
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
        
        // Process statistics
        let stats = {
            total: unknownRecordings.length,
            processed: 0,
            successful: 0,
            errors: 0,
            withTranscript: 0,
            withChat: 0,
            improved: 0
        };
        
        console.log(`📊 Processing ${stats.total} unknown recordings...\n`);
        
        // Process each unknown recording
        for (let i = 0; i < unknownRecordings.length; i++) {
            const recording = unknownRecordings[i];
            
            console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`🎬 [${i + 1}/${stats.total}] Processing: ${recording.name}`);
            console.log(`   Folder ID: ${recording.folderId}`);
            
            const result = await processRecordingFolder(drive, recording, processor);
            
            stats.processed++;
            
            if (result.success) {
                stats.successful++;
                console.log(`   ✅ Success: ${result.standardizedName}`);
                console.log(`   📊 B indicator: ${result.standardizedName?.includes('_B_') ? 'YES ✓' : 'NO ✗'}`);
                
                // Check if improved
                if (!result.standardizedName.includes('unknown') && 
                    !result.standardizedName.includes('Unknown')) {
                    stats.improved++;
                    console.log(`   🎯 IMPROVED - Coach and student identified!`);
                }
                
                if (result.hasTranscript) stats.withTranscript++;
                if (result.hasChat) stats.withChat++;
            } else {
                stats.errors++;
                console.log(`   ❌ Failed: ${result.error}`);
            }
            
            // Small delay between recordings
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Final summary
        console.log('\n' + '═'.repeat(70));
        console.log('📊 PROCESSING SUMMARY');
        console.log('═'.repeat(70));
        console.log(`✅ Total recordings: ${stats.total}`);
        console.log(`✅ Successfully processed: ${stats.successful}`);
        console.log(`❌ Errors: ${stats.errors}`);
        console.log(`📝 With transcript: ${stats.withTranscript}`);
        console.log(`💬 With chat: ${stats.withChat}`);
        console.log(`🎯 Improved (proper names): ${stats.improved}`);
        console.log(`📈 Success rate: ${((stats.successful / stats.total) * 100).toFixed(1)}%`);
        console.log('═'.repeat(70));
        
        console.log('\n✅ Processing complete!');
        console.log('\n📊 Next steps:');
        console.log('1. Check the Drive Import tabs in Google Sheets');
        console.log('2. Look for recordings that still have "unknown" in their names');
        console.log('3. For those with transcripts/chat, the high-fidelity extraction should help');
        console.log('4. Manual review may be needed for recordings without clear patterns');
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

console.log('🚀 Starting targeted unknown recordings processing...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });