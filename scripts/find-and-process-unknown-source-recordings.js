#!/usr/bin/env node

/**
 * Find and Process Unknown Source Recordings
 * This script finds the ORIGINAL recordings in S3-Ivylevel that resulted in "unknown" entries
 */

require('dotenv').config();
const { google } = require('googleapis');
const { createContainer } = require('../src/container');
const IntegratedDriveProcessorV4 = require('../src/drive-source/services/IntegratedDriveProcessorV4');
const MultiTabGoogleSheetsService = require('../src/infrastructure/services/MultiTabGoogleSheetsService');
const awilix = require('awilix');
const crypto = require('crypto');

const config = require('../config');

// S3-Ivylevel root folder ID (source folder)
const S3_IVYLEVEL_ROOT_ID = '1Dpq3rSZelQJJePkSi7K6xAY4q62xMiFA';

// These are the problematic folder names we need to find in the source
const problematicFolderNames = [
    'Re: Aaryan/ Leena: Ivylevel Basic Plan - 15 Minute with Rishi - May 9, 2024',
    // Add other known problematic names here as we discover them
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
 * Search for folders by name pattern
 */
async function findFoldersByPattern(drive, searchPatterns) {
    const foundFolders = [];
    
    for (const pattern of searchPatterns) {
        try {
            // Search for folders containing the pattern
            const response = await drive.files.list({
                q: `name contains '${pattern}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'files(id, name, parents)',
                pageSize: 100
            });
            
            if (response.data.files && response.data.files.length > 0) {
                foundFolders.push(...response.data.files);
            }
        } catch (error) {
            console.error(`Error searching for pattern "${pattern}":`, error.message);
        }
    }
    
    return foundFolders;
}

/**
 * Find all folders that might contain recordings but have non-standard names
 */
async function findProblematicSourceFolders(drive) {
    console.log('🔍 Searching for non-standard recording folders in S3-Ivylevel...\n');
    
    const searchPatterns = [
        'Re:',           // Email reply format
        'Fwd:',          // Email forward format
        'Meeting with',  // Meeting descriptions
        'Session -',     // Session descriptions
        'Recording -',   // Recording descriptions
        '15 Minute',     // Time-based descriptions
        '30 Minute',
        '45 Minute',
        '60 Minute',
        'Check-in',      // Check-in sessions
        'Review',        // Review sessions
        'Follow-up'      // Follow-up sessions
    ];
    
    const candidateFolders = await findFoldersByPattern(drive, searchPatterns);
    
    // Filter to only those within S3-Ivylevel hierarchy
    const recordingFolders = [];
    
    for (const folder of candidateFolders) {
        // Check if it contains recording files
        const filesResponse = await drive.files.list({
            q: `'${folder.id}' in parents and trashed = false and (name contains '.mp4' or name contains '.m4a' or name contains '.vtt' or name contains '.txt')`,
            fields: 'files(id)',
            pageSize: 1
        });
        
        if (filesResponse.data.files && filesResponse.data.files.length > 0) {
            // Get full path to verify it's in S3-Ivylevel
            const path = await getFolderPath(drive, folder.id);
            if (path.some(p => p.includes('S3-Ivylevel') || p.includes('S3_Ivylevel'))) {
                recordingFolders.push({
                    ...folder,
                    path: path.join(' / ')
                });
            }
        }
    }
    
    return recordingFolders;
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
 * Process a recording folder
 */
async function processRecordingFolder(drive, folder, processor) {
    try {
        console.log(`📁 Processing: ${folder.name}`);
        console.log(`   Path: ${folder.path}`);
        
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
        
        console.log(`   📊 Files: ${files.length} total`);
        console.log(`      📹 Video: ${fileTypes.video.length}`);
        console.log(`      🔊 Audio: ${fileTypes.audio.length}`);
        console.log(`      📝 Transcript: ${fileTypes.transcript.length}`);
        console.log(`      💬 Chat: ${fileTypes.chat.length}`);
        
        // Create session object
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
                fileCount: files.length,
                folderPath: folder.path.split(' / ')
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
            hasChat: fileTypes.chat.length > 0,
            folderPath: folder.path
        };
        
    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function main() {
    console.log('🎯 Finding and Processing Unknown Source Recordings');
    console.log('   (From original S3-Ivylevel folders)');
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
        
        // Find problematic source folders
        const problematicFolders = await findProblematicSourceFolders(drive);
        
        if (problematicFolders.length === 0) {
            console.log('❌ No problematic folders found in S3-Ivylevel');
            console.log('\nTry looking for specific patterns or folder names.');
            return;
        }
        
        console.log(`📊 Found ${problematicFolders.length} potential problematic folders\n`);
        
        // Show what we found
        console.log('📋 Problematic folders found:');
        console.log('─'.repeat(70));
        problematicFolders.forEach((folder, index) => {
            console.log(`${index + 1}. ${folder.name}`);
            console.log(`   Path: ${folder.path}`);
            console.log(`   ID: ${folder.id}\n`);
        });
        
        // Ask for confirmation or process automatically
        console.log('─'.repeat(70));
        console.log('Processing these folders...\n');
        
        // Process statistics
        let stats = {
            total: problematicFolders.length,
            processed: 0,
            successful: 0,
            errors: 0,
            improved: 0
        };
        
        // Process each folder
        for (let i = 0; i < problematicFolders.length; i++) {
            const folder = problematicFolders[i];
            
            console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`🎬 [${i + 1}/${stats.total}] Processing folder`);
            
            const result = await processRecordingFolder(drive, folder, processor);
            
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
        console.log(`✅ Total folders found: ${stats.total}`);
        console.log(`✅ Successfully processed: ${stats.successful}`);
        console.log(`❌ Errors: ${stats.errors}`);
        console.log(`🎯 Improved (proper names): ${stats.improved}`);
        console.log(`📈 Success rate: ${((stats.successful / stats.total) * 100).toFixed(1)}%`);
        console.log('═'.repeat(70));
        
        console.log('\n✅ Processing complete!');
        console.log('\n📊 Check the Drive Import tabs in Google Sheets');
        console.log('   These recordings should now have better coach/student identification');
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

console.log('🚀 Starting search for unknown source recordings...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });