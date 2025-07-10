#!/usr/bin/env node

/**
 * Process the specific folders we just moved
 * This will add them to Google Sheets with proper names
 */

require('dotenv').config();
const { google } = require('googleapis');
const { createContainer } = require('../src/container');
const IntegratedDriveProcessorV4 = require('../src/drive-source/services/IntegratedDriveProcessorV4');
const MultiTabGoogleSheetsService = require('../src/infrastructure/services/MultiTabGoogleSheetsService');
const awilix = require('awilix');
const crypto = require('crypto');
const config = require('../config');

// Knowledge Base Students folder ID
const STUDENTS_FOLDER_ID = config.google.drive.organizedRecordingsFolder || '12LgtSd9CpOllNBBycCfxPVFB6Sk9bTIp';

// The folders we moved with their details
const movedFolders = [
    { sessionId: '330f04559d336f8b', coach: 'Jenny', student: 'Huda', folderName: 'Coaching_B_Jenny_Huda_Wk01_2025-07-07_M_330f04559d336f8bU_330f04559d336f8b' },
    { sessionId: '67b7b4ddb94d9714', coach: 'Jenny', student: 'Huda', folderName: 'Coaching_B_Jenny_Huda_Wk01_2025-07-07_M_67b7b4ddb94d9714U_67b7b4ddb94d9714' },
    { sessionId: '7247ecbd0e5fae62', coach: 'Jenny', student: 'Huda', folderName: 'Coaching_B_Jenny_Huda_Wk01_2025-07-07_M_7247ecbd0e5fae62U_7247ecbd0e5fae62' },
    { sessionId: '7190c776c4c0d307', coach: 'Jenny', student: 'Huda', folderName: 'Coaching_B_Jenny_Huda_Wk01_2025-07-07_M_7190c776c4c0d307U_7190c776c4c0d307' },
    { sessionId: '324b9bb1a74a3f89', coach: 'Jenny', student: 'Huda', folderName: 'Coaching_B_Jenny_Huda_Wk01_2025-07-07_M_324b9bb1a74a3f89U_324b9bb1a74a3f89' },
    { sessionId: '0f53dda2ddac18b2', coach: 'Jenny', student: 'Huda', folderName: 'Coaching_B_Jenny_Huda_Wk01_2025-07-07_M_0f53dda2ddac18b2U_0f53dda2ddac18b2' },
    { sessionId: '37b4f7c7f24f1a85', coach: 'Alan', student: 'Rayaan', folderName: 'Coaching_B_Alan_Rayaan_Wk01_2025-07-07_M_37b4f7c7f24f1a85U_37b4f7c7f24f1a85' }
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

async function findFolderInKnowledgeBase(drive, folderName, studentName) {
    try {
        // First find the student folder
        const studentResponse = await drive.files.list({
            q: `'${STUDENTS_FOLDER_ID}' in parents and name = '${studentName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id)',
            pageSize: 1
        });
        
        if (!studentResponse.data.files || studentResponse.data.files.length === 0) {
            console.log(`   ❌ Student folder not found: ${studentName}`);
            return null;
        }
        
        const studentFolderId = studentResponse.data.files[0].id;
        
        // Now find the recording folder
        const folderResponse = await drive.files.list({
            q: `'${studentFolderId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 1
        });
        
        if (!folderResponse.data.files || folderResponse.data.files.length === 0) {
            console.log(`   ❌ Recording folder not found: ${folderName}`);
            return null;
        }
        
        return folderResponse.data.files[0];
        
    } catch (error) {
        console.error(`   ❌ Error finding folder:`, error.message);
        return null;
    }
}

async function processRecordingFolder(drive, folder, folderInfo, processor) {
    try {
        console.log(`   📁 Found folder: ${folder.name}`);
        console.log(`   📍 Location: Students/${folderInfo.student}/${folder.name}`);
        
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
        
        console.log(`   📊 Files: ${files.length} total`);
        
        // Create session object with proper metadata
        const session = {
            id: folderInfo.sessionId,
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
                coach: folderInfo.coach,
                student: folderInfo.student,
                dataSource: 'google-drive'
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
            error: result.error
        };
        
    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function main() {
    console.log('🎯 Processing Moved Recording Folders');
    console.log('=' .repeat(70));
    console.log('This will add the 7 fixed recordings to Google Sheets\n');
    
    try {
        // Initialize services
        console.log('🔧 Initializing services...');
        
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
        
        // Process each moved folder
        let stats = {
            total: movedFolders.length,
            successful: 0,
            errors: 0
        };
        
        for (let i = 0; i < movedFolders.length; i++) {
            const folderInfo = movedFolders[i];
            
            console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`[${i + 1}/${stats.total}] Processing: ${folderInfo.folderName}`);
            console.log(`   Coach: ${folderInfo.coach}, Student: ${folderInfo.student}`);
            
            // Find the folder in Knowledge Base
            const folder = await findFolderInKnowledgeBase(drive, folderInfo.folderName, folderInfo.student);
            
            if (!folder) {
                stats.errors++;
                continue;
            }
            
            // Process the folder
            const result = await processRecordingFolder(drive, folder, folderInfo, processor);
            
            if (result.success) {
                stats.successful++;
                console.log(`   ✅ Success: Added to sheets`);
                console.log(`   📊 Standardized name: ${result.standardizedName}`);
            } else {
                stats.errors++;
            }
            
            // Small delay
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Final summary
        console.log('\n' + '═'.repeat(70));
        console.log('📊 PROCESSING SUMMARY');
        console.log('═'.repeat(70));
        console.log(`✅ Total folders: ${stats.total}`);
        console.log(`✅ Successfully added to sheets: ${stats.successful}`);
        console.log(`❌ Errors: ${stats.errors}`);
        console.log('═'.repeat(70));
        
        console.log('\n✅ Processing complete!');
        console.log('📊 Check Google Sheets - the 7 recordings should now be added with proper names');
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

console.log('🚀 Starting folder processing...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });