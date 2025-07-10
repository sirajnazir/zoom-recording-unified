#!/usr/bin/env node

/**
 * Process specific known problematic recordings
 * Based on the console output, we know at least one: 
 * "Re: Aaryan/ Leena: Ivylevel Basic Plan - 15 Minute with Rishi - May 9, 2024"
 */

require('dotenv').config();
const { google } = require('googleapis');
const { createContainer } = require('../src/container');
const IntegratedDriveProcessorV4 = require('../src/drive-source/services/IntegratedDriveProcessorV4');
const MultiTabGoogleSheetsService = require('../src/infrastructure/services/MultiTabGoogleSheetsService');
const awilix = require('awilix');
const crypto = require('crypto');

const config = require('../config');

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
 * Search for a specific folder by name
 */
async function findFolderByName(drive, folderName) {
    try {
        const response = await drive.files.list({
            q: `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name, parents)',
            pageSize: 10
        });
        
        return response.data.files || [];
    } catch (error) {
        console.error(`Error searching for "${folderName}":`, error.message);
        return [];
    }
}

/**
 * Get folder path
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
        const folderPath = await getFolderPath(drive, folder.id);
        console.log(`📁 Processing: ${folder.name}`);
        console.log(`   Path: ${folderPath.join(' / ')}`);
        console.log(`   ID: ${folder.id}`);
        
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
        
        // Create session object with enhanced metadata
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
                folderPath: folderPath
            },
            dataSource: 'google-drive',
            source: 'google-drive',
            folderPath: folderPath // Add this for enhanced extraction
        };
        
        console.log(`   🔄 Processing session ${session.id}...`);
        
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
    console.log('🎯 Processing Specific Known Problematic Recordings');
    console.log('=' .repeat(70));
    
    // Known problematic folder names to search for
    const problematicNames = [
        "Re: Aaryan/ Leena: Ivylevel Basic Plan - 15 Minute with Rishi - May 9, 2024",
        // Add more as we discover them
    ];
    
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
        
        // Search for each problematic folder
        console.log('🔍 Searching for known problematic folders...\n');
        
        const foundFolders = [];
        
        for (const name of problematicNames) {
            console.log(`Searching for: "${name}"`);
            const folders = await findFolderByName(drive, name);
            
            if (folders.length > 0) {
                console.log(`   ✅ Found ${folders.length} match(es)`);
                foundFolders.push(...folders);
            } else {
                console.log(`   ❌ Not found`);
            }
        }
        
        if (foundFolders.length === 0) {
            console.log('\n❌ No problematic folders found');
            console.log('\nTry running the S3-Ivylevel scan to identify more non-standard recordings');
            return;
        }
        
        console.log(`\n📊 Found ${foundFolders.length} folders to process\n`);
        
        // Process each found folder
        let stats = {
            total: foundFolders.length,
            successful: 0,
            errors: 0,
            improved: 0
        };
        
        for (let i = 0; i < foundFolders.length; i++) {
            const folder = foundFolders[i];
            
            console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`🎬 [${i + 1}/${stats.total}] Processing folder`);
            
            const result = await processRecordingFolder(drive, folder, processor);
            
            if (result.success) {
                stats.successful++;
                console.log(`   ✅ Success: ${result.standardizedName}`);
                console.log(`   📊 B indicator: ${result.standardizedName?.includes('_B_') ? 'YES ✓' : 'NO ✗'}`);
                
                if (!result.standardizedName.includes('unknown') && 
                    !result.standardizedName.includes('Unknown')) {
                    stats.improved++;
                    console.log(`   🎯 IMPROVED - Coach and student identified!`);
                }
            } else {
                stats.errors++;
            }
            
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Final summary
        console.log('\n' + '═'.repeat(70));
        console.log('📊 PROCESSING SUMMARY');
        console.log('═'.repeat(70));
        console.log(`✅ Total folders: ${stats.total}`);
        console.log(`✅ Successfully processed: ${stats.successful}`);
        console.log(`❌ Errors: ${stats.errors}`);
        console.log(`🎯 Improved: ${stats.improved}`);
        console.log('═'.repeat(70));
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

console.log('🚀 Starting specific recording processing...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });