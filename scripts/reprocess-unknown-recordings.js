#!/usr/bin/env node

/**
 * Reprocess Unknown Drive Recordings
 * Uses EnhancedDriveProcessorV5 with better metadata extraction
 */

require('dotenv').config();
const { google } = require('googleapis');
const { createContainer } = require('../src/container');
const EnhancedDriveProcessorV5 = require('../src/drive-source/services/EnhancedDriveProcessorV5');
const MultiTabGoogleSheetsService = require('../src/infrastructure/services/MultiTabGoogleSheetsService');
const awilix = require('awilix');
const crypto = require('crypto');

const config = require('../config');

// The 20 unknown recordings' folder IDs
const unknownRecordingFolderIds = [
    '1KJ8mFzMpT-mpd9FAMUhtC_TVa93L4l8t',
    '1o0-Ve3_jUvq0Xv9N1k3e0zMl86kcZJhr',
    '1Bhmv97nHdZIuoZoT99dr0H3AhfCTe4oh',
    '1IaDGQ-WJcqQiAZ0DC40rmHmPch-wQlvK',
    '1mczuxWupqkYn7sWCcSmWfZ4xTseB86w9',
    '1d43qU2fNiLFxcG1_V9zbUerJJ7AoUan7',
    '1Iv3KwElUoXcZKfN5mPI7qtLtIm02FRBp',
    '1qCjIbSejfaaH3AAvbyXcFk7iHo_dbq2c',
    '1JTxIdMOAzo76CRdp-oDhBPJxr2mYUK5M',
    '1bDNb4rHhBWJgIqdQ1loFdRZlQ56cQ-x9',
    '1lDAL4fx6e0BVzXKENLvd3KAomoMg4fQA',
    '1ZkXxeJPisUr-GF-1RNKH5NBvBxF9aANI',
    '1SSD0ie4Oqa9_gJu46SGZZePx6u6VK7aL',
    '1SvoqrgpUGFB2Fv9h9o4rhFGeJ5m2c0xF',
    '1reve35GEsOStZ4itNIvTX1qr33ylqU_d',
    '1-tTDHE-Z8MErrc7aFDiB2r40ABlYrx6k',
    '1JNbbheIrQH_ZP3dPHos8kgTlS96N5mAz',
    '162ArNE03QTI9d4kFfuxZ93IgNzmh_fH5',
    '1udz0TwG-itMOgqbqzjOdCPMvqQGMW1FA'
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

async function reprocessUnknownRecordings() {
    console.log('🔧 Reprocessing Unknown Drive Recordings with Enhanced Extraction');
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
        
        // Create enhanced processor
        const processor = new EnhancedDriveProcessorV5(config, {
            googleDriveService: scope.resolve('googleDriveService'),
            googleSheetsService: scope.resolve('googleSheetsService'),
            nameStandardizer: scope.resolve('nameStandardizer'),
            weekInferencer: scope.resolve('weekInferencer'),
            metadataExtractor: scope.resolve('metadataExtractor'),
            driveOrganizer: scope.resolve('driveOrganizer'),
            logger: scope.resolve('logger'),
            config: scope.resolve('config')
        });
        
        console.log('✅ Services initialized with EnhancedDriveProcessorV5\n');
        
        // Process statistics
        let stats = {
            total: unknownRecordingFolderIds.length,
            processed: 0,
            improved: 0,
            stillUnknown: 0,
            errors: 0
        };
        
        console.log(`📊 Processing ${stats.total} unknown recordings...\n`);
        
        for (let i = 0; i < unknownRecordingFolderIds.length; i++) {
            const folderId = unknownRecordingFolderIds[i];
            
            console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`🎬 [${i + 1}/${stats.total}] Processing folder: ${folderId}`);
            
            try {
                // Get folder information
                const folderResponse = await drive.files.get({
                    fileId: folderId,
                    fields: 'id,name,parents'
                });
                
                const folderName = folderResponse.data.name;
                console.log(`📁 Folder name: ${folderName}`);
                
                // Get all files in the folder
                const filesResponse = await drive.files.list({
                    q: `'${folderId}' in parents and trashed = false`,
                    fields: 'files(id, name, mimeType, size, createdTime, modifiedTime)',
                    pageSize: 1000
                });
                
                const files = filesResponse.data.files || [];
                console.log(`📄 Files found: ${files.length}`);
                
                // Create session object
                const session = {
                    id: crypto.randomBytes(8).toString('hex'),
                    folderId: folderId,
                    folderName: folderName,
                    files: files.map(file => ({
                        id: file.id,
                        name: file.name,
                        mimeType: file.mimeType,
                        size: file.size,
                        folderId: folderId,
                        folderName: folderName,
                        createdTime: file.createdTime,
                        modifiedTime: file.modifiedTime
                    })),
                    metadata: {
                        folderName: folderName,
                        folderId: folderId,
                        fileCount: files.length
                    },
                    dataSource: 'google-drive',
                    source: 'google-drive'
                };
                
                console.log(`🔄 Processing with enhanced extraction...`);
                
                // Process the recording
                const result = await processor.processRecording(session);
                
                stats.processed++;
                
                if (result.success) {
                    console.log(`✅ Success: ${result.standardizedName}`);
                    
                    // Check if we improved the extraction
                    if (!result.standardizedName.includes('unknown') && 
                        !result.standardizedName.includes('Unknown')) {
                        stats.improved++;
                        console.log(`🎯 IMPROVED - Coach and student properly identified!`);
                    } else {
                        stats.stillUnknown++;
                        console.log(`⚠️  Still contains unknown values`);
                    }
                } else {
                    stats.errors++;
                    console.log(`❌ Failed: ${result.error}`);
                }
                
            } catch (error) {
                stats.errors++;
                console.error(`❌ Error processing ${folderId}:`, error.message);
            }
            
            // Small delay between recordings
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Final summary
        console.log('\n' + '═'.repeat(70));
        console.log('📊 REPROCESSING SUMMARY');
        console.log('═'.repeat(70));
        console.log(`✅ Total recordings: ${stats.total}`);
        console.log(`✅ Successfully processed: ${stats.processed}`);
        console.log(`🎯 Improved (no longer unknown): ${stats.improved}`);
        console.log(`⚠️  Still unknown: ${stats.stillUnknown}`);
        console.log(`❌ Errors: ${stats.errors}`);
        console.log(`📈 Improvement rate: ${((stats.improved / stats.total) * 100).toFixed(1)}%`);
        console.log('═'.repeat(70));
        
        console.log('\n✅ Reprocessing complete!');
        console.log('\n📊 Check the Drive Import tabs in Google Sheets');
        console.log('   The improved recordings should now show proper coach/student names');
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

console.log('🚀 Starting unknown recordings reprocessing...\n');

reprocessUnknownRecordings()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });