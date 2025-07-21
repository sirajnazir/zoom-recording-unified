#!/usr/bin/env node

/**
 * Download and process a specific recording by UUID
 */

require('dotenv').config();

const TARGET_UUID = '43sNl0IVTvy3Xnp5+ydCog==';

async function main() {
    console.log('🎯 DOWNLOADING AND PROCESSING SPECIFIC RECORDING');
    console.log('================================================================================');
    console.log(`UUID: ${TARGET_UUID}`);
    console.log('================================================================================\n');
    
    // Load required services
    const { ZoomService } = require('./src/infrastructure/services/ZoomService');
    const { EnhancedRecordingDownloader } = require('./src/infrastructure/services/EnhancedRecordingDownloader');
    const { CompleteSmartNameStandardizer } = require('./src/infrastructure/services/CompleteSmartNameStandardizer');
    const { DriveOrganizer } = require('./src/infrastructure/services/DriveOrganizer');
    const { GoogleDriveService } = require('./src/infrastructure/services/GoogleDriveService');
    const { MultiTabGoogleSheetsService } = require('./src/infrastructure/services/MultiTabGoogleSheetsService');
    
    const config = {
        zoom: {
            accountId: process.env.ZOOM_ACCOUNT_ID,
            clientId: process.env.ZOOM_CLIENT_ID,
            clientSecret: process.env.ZOOM_CLIENT_SECRET
        }
    };
    
    const logger = {
        info: (...args) => console.log('[INFO]', ...args),
        error: (...args) => console.error('[ERROR]', ...args),
        warn: (...args) => console.warn('[WARN]', ...args)
    };
    
    try {
        // Step 1: Fetch recording from Zoom
        console.log('📡 Step 1: Fetching recording from Zoom...');
        const zoomService = new ZoomService({ config, logger });
        const doubleEncodedUuid = encodeURIComponent(encodeURIComponent(TARGET_UUID));
        const recording = await zoomService.getRecording(doubleEncodedUuid);
        
        if (!recording) {
            throw new Error('Recording not found');
        }
        
        console.log('✅ Recording found:');
        console.log(`   Topic: ${recording.topic}`);
        console.log(`   Date: ${recording.start_time}`);
        console.log(`   Duration: ${recording.duration} minutes`);
        console.log(`   Files: ${recording.recording_files?.length || 0}\n`);
        
        // Step 2: Download files
        console.log('📥 Step 2: Downloading files...');
        const downloader = new EnhancedRecordingDownloader({ config, logger });
        const downloadResult = await downloader.downloadRecordingFiles({
            ...recording,
            uuid: TARGET_UUID,
            id: recording.meeting_id || recording.id,
            dataSource: 'zoom-api'
        });
        
        if (!downloadResult.success) {
            throw new Error('Failed to download files: ' + downloadResult.error);
        }
        
        console.log('✅ Downloaded files:');
        Object.entries(downloadResult.files).forEach(([type, path]) => {
            if (path) console.log(`   - ${type}: ${path}`);
        });
        console.log('');
        
        // Step 3: Standardize name
        console.log('🏷️ Step 3: Standardizing name...');
        const nameStandardizer = new CompleteSmartNameStandardizer({ config, logger });
        const standardizedName = await nameStandardizer.standardizeName(recording, {
            downloadedFiles: downloadResult.files,
            dataSource: 'zoom-api'
        });
        
        console.log(`✅ Standardized name: ${standardizedName}\n`);
        
        // Step 4: Upload to Google Drive
        console.log('☁️ Step 4: Uploading to Google Drive...');
        const googleDriveService = new GoogleDriveService({ config, logger });
        const driveOrganizer = new DriveOrganizer({
            get: (service) => {
                if (service === 'googleDriveService') return googleDriveService;
                if (service === 'logger') return logger;
                return null;
            }
        });
        
        const processedData = {
            standardizedName,
            files: downloadResult.files,
            category: standardizedName.split('_')[0],
            downloadedFiles: downloadResult.files
        };
        
        const driveResult = await driveOrganizer.organizeRecording(recording, processedData);
        
        if (!driveResult.success) {
            throw new Error('Failed to upload to Drive');
        }
        
        console.log('✅ Uploaded to Google Drive:');
        console.log(`   Folder: ${driveResult.folderLink || driveResult.folderUrl}`);
        console.log(`   Files uploaded: ${Object.keys(driveResult.uploadedFiles || {}).length}\n`);
        
        // Step 5: Update Google Sheets
        console.log('📊 Step 5: Updating Google Sheets...');
        const sheetsService = new MultiTabGoogleSheetsService({ config, logger });
        
        await sheetsService.addRecording({
            ...recording,
            uuid: TARGET_UUID,
            standardizedName,
            processedData: {
                ...processedData,
                driveLink: driveResult.folderLink,
                driveFolderId: driveResult.folderId
            }
        }, 'zoom-api');
        
        console.log('✅ Updated Google Sheets\n');
        
        console.log('🎉 PROCESSING COMPLETED SUCCESSFULLY!');
        console.log('================================================================================');
        console.log('📋 Summary:');
        console.log(`   Recording: ${recording.topic}`);
        console.log(`   Standardized: ${standardizedName}`);
        console.log(`   Drive Folder: ${driveResult.folderLink || 'Check Google Drive'}`);
        console.log(`   Sheets: Check "Zoom API - Raw" and "Zoom API - Standardized" tabs`);
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
    }
}

main().catch(console.error);