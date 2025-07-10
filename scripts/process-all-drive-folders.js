#!/usr/bin/env node

/**
 * Process all Google Drive recordings with proper folder-based grouping
 * This version respects the original folder structure and doesn't split sessions
 */

require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs').promises;
const config = require('../config');
const { createContainer } = require('../src/container');
const IntegratedDriveProcessorV4 = require('../src/drive-source/services/IntegratedDriveProcessorV4');
const MultiTabGoogleSheetsService = require('../src/infrastructure/services/MultiTabGoogleSheetsService');
const awilix = require('awilix');
const crypto = require('crypto');

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
 * Scan folder recursively and group files by their parent folder
 * This ensures all files from a recording session stay together
 */
async function scanFolderWithStructure(drive, folderId, folderName, depth = 0) {
    const MAX_DEPTH = 5;
    const sessions = [];
    
    if (depth > MAX_DEPTH) {
        return sessions;
    }
    
    try {
        // First, check if this folder contains recording files
        const filesResponse = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
            fields: 'files(id, name, mimeType, size, createdTime, modifiedTime)',
            pageSize: 1000
        });
        
        const files = filesResponse.data.files || [];
        
        // Filter for recording files
        const recordingFiles = files.filter(file => {
            const name = file.name.toLowerCase();
            return name.endsWith('.mp4') || name.endsWith('.m4a') || 
                   name.endsWith('.vtt') || name.endsWith('.txt') ||
                   name.endsWith('.srt');
        });
        
        // If this folder has recording files, it's a session folder
        if (recordingFiles.length > 0) {
            console.log(`   📁 Found session folder: ${folderName} (${recordingFiles.length} files)`);
            
            sessions.push({
                id: crypto.randomBytes(8).toString('hex'),
                folderId: folderId,
                folderName: folderName,
                files: recordingFiles.map(file => ({
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
                    fileCount: recordingFiles.length
                }
            });
            
            return sessions; // Don't go deeper if we found recording files
        }
        
        // Otherwise, check subfolders
        const foldersResponse = await drive.files.list({
            q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 1000
        });
        
        const subfolders = foldersResponse.data.files || [];
        
        // Recursively scan subfolders
        for (const subfolder of subfolders) {
            const subSessions = await scanFolderWithStructure(
                drive, 
                subfolder.id, 
                subfolder.name, 
                depth + 1
            );
            sessions.push(...subSessions);
        }
        
    } catch (error) {
        console.error(`Error scanning folder ${folderName}:`, error.message);
    }
    
    return sessions;
}

async function processCoachFolder(drive, coachFolder, processor) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📁 Processing ${coachFolder.name}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
    try {
        // Scan for all recording sessions in coach folder
        console.log(`🔍 Scanning for recording sessions...`);
        const sessions = await scanFolderWithStructure(drive, coachFolder.id, coachFolder.name);
        console.log(`✅ Found ${sessions.length} recording sessions\n`);
        
        let processed = 0;
        let errors = 0;
        
        // Process each session
        for (let i = 0; i < sessions.length; i++) {
            const session = sessions[i];
            console.log(`🎬 Processing session ${i + 1}/${sessions.length}: ${session.folderName}`);
            console.log(`   Files: ${session.files.length}`);
            
            // List files in session
            session.files.forEach(f => console.log(`     - ${f.name}`));
            
            try {
                // Ensure dataSource is set
                session.dataSource = 'google-drive';
                session.source = 'google-drive';
                
                // Process through pipeline
                const result = await processor.processRecording(session);
                
                if (result.success) {
                    processed++;
                    console.log(`   ✅ Success: ${result.standardizedName || session.folderName}`);
                    console.log(`   📊 B indicator: ${result.standardizedName?.includes('_B_') ? 'YES' : 'NO'}`);
                } else {
                    errors++;
                    console.log(`   ⚠️ Failed: ${result.error}`);
                }
                
            } catch (error) {
                errors++;
                console.error(`   ❌ Error: ${error.message}`);
            }
            
            // Small delay between sessions
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log(`\n📊 ${coachFolder.name} Summary:`);
        console.log(`   Total sessions: ${sessions.length}`);
        console.log(`   Processed: ${processed}`);
        console.log(`   Errors: ${errors}`);
        
        return { processed, errors, total: sessions.length };
        
    } catch (error) {
        console.error(`❌ Error processing ${coachFolder.name}:`, error.message);
        return { processed: 0, errors: 1, total: 0 };
    }
}

async function main() {
    console.log('🚀 Google Drive Recording Processor - Folder-Based Grouping');
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
        
        // Create processor with all services
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
        
        // Get all coach folders
        console.log('🔍 Discovering coach folders...');
        const response = await drive.files.list({
            q: `'${S3_IVYLEVEL_ROOT_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)',
            orderBy: 'name'
        });
        
        const coachFolders = response.data.files || [];
        console.log(`✅ Found ${coachFolders.length} coach folders:`);
        coachFolders.forEach((folder, index) => {
            console.log(`   ${index + 1}. ${folder.name}`);
        });
        
        // Process statistics
        let totalStats = {
            coaches: 0,
            sessions: 0,
            processed: 0,
            errors: 0
        };
        
        // Process each coach
        for (const coachFolder of coachFolders) {
            const stats = await processCoachFolder(drive, coachFolder, processor);
            totalStats.coaches++;
            totalStats.sessions += stats.total;
            totalStats.processed += stats.processed;
            totalStats.errors += stats.errors;
        }
        
        // Final summary
        console.log('\n' + '═'.repeat(60));
        console.log('📊 FINAL PROCESSING SUMMARY');
        console.log('═'.repeat(60));
        console.log(`✅ Coaches processed: ${totalStats.coaches}`);
        console.log(`✅ Total sessions: ${totalStats.sessions}`);
        console.log(`✅ Successfully processed: ${totalStats.processed}`);
        console.log(`❌ Errors: ${totalStats.errors}`);
        console.log(`📈 Success rate: ${((totalStats.processed / totalStats.sessions) * 100).toFixed(1)}%`);
        console.log('═'.repeat(60));
        
        console.log('\n✅ Processing complete!');
        console.log('📊 Check the Drive Import tabs in Google Sheets');
        console.log('   All recordings should have the _B_ indicator');
        console.log('   Each session folder should appear only once');
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

console.log('🚀 Starting folder-based Google Drive processing...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });