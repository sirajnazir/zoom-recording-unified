#!/usr/bin/env node
require('dotenv').config();

const path = require('path');
const fs = require('fs');

// Import required services
const { ZoomService } = require('./src/infrastructure/services/ZoomService');
const { CompleteSmartNameStandardizer } = require('./src/infrastructure/services/CompleteSmartNameStandardizer');
const MultiTabGoogleSheetsService = require('./src/infrastructure/services/MultiTabGoogleSheetsService');
const { EnhancedRecordingDownloader } = require('./src/infrastructure/services/EnhancedRecordingDownloader');

// Simple logger
const logger = {
    info: (...args) => console.log(new Date().toISOString(), '[INFO]', ...args),
    error: (...args) => console.error(new Date().toISOString(), '[ERROR]', ...args),
    warn: (...args) => console.warn(new Date().toISOString(), '[WARN]', ...args),
    debug: (...args) => console.log(new Date().toISOString(), '[DEBUG]', ...args)
};

// Configuration
const config = {
    zoom: {
        clientId: process.env.ZOOM_CLIENT_ID,
        clientSecret: process.env.ZOOM_CLIENT_SECRET,
        accountId: process.env.ZOOM_ACCOUNT_ID
    },
    google: {
        clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
        privateKey: process.env.GOOGLE_PRIVATE_KEY,
        sheets: {
            masterIndexSheetId: process.env.MASTER_INDEX_SHEET_ID
        }
    }
};

async function processZoomRecordings() {
    try {
        console.log('🚀 Starting Simple Zoom Recording Processor\n');
        
        // Initialize services
        console.log('1. Initializing services...');
        const zoomService = new ZoomService({ config, logger });
        const nameStandardizer = new CompleteSmartNameStandardizer({ logger });
        const sheetsService = new MultiTabGoogleSheetsService({ config, logger, nameStandardizer });
        const downloader = new EnhancedRecordingDownloader({ logger, zoomService });
        
        console.log('✅ Services initialized\n');
        
        // Fetch recent recordings
        console.log('2. Fetching recent recordings from Zoom...');
        const currentDate = new Date();
        const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        
        const recordings = await zoomService.getRecordings({
            from: startDate.toISOString(),
            to: currentDate.toISOString(),
            limit: 1
        });
        
        console.log(`✅ Found ${recordings.length} recordings\n`);
        
        // Process each recording
        for (let i = 0; i < recordings.length; i++) {
            const recording = recordings[i];
            console.log(`\n📹 Processing recording ${i + 1}/${recordings.length}:`);
            console.log(`   Topic: ${recording.topic}`);
            console.log(`   UUID: ${recording.uuid}`);
            console.log(`   Start: ${recording.start_time}`);
            console.log(`   Duration: ${recording.duration} seconds`);
            
            // Set data source for _A_ indicator
            recording.source = 'zoom-api';
            recording.dataSource = 'zoom-api';
            
            // Standardize name
            console.log('\n   📝 Standardizing name...');
            const nameAnalysis = await nameStandardizer.standardizeName(recording);
            console.log(`   ✅ Standardized: ${nameAnalysis.standardizedName}`);
            console.log(`   Coach: ${nameAnalysis.components?.coach || 'Unknown'}`);
            console.log(`   Student: ${nameAnalysis.components?.student || 'Unknown'}`);
            console.log(`   Session Type: ${nameAnalysis.components?.sessionType || 'Unknown'}`);
            
            // Skip check for now - just process all
            console.log('\n   📋 Processing recording...');
            
            // Download files (if enabled)
            if (process.env.DOWNLOAD_FILES === 'true') {
                console.log('\n   📥 Downloading recording files...');
                const outputDir = path.join('./output', `M:${recording.id}U:${recording.uuid}`);
                const downloadResult = await downloader.downloadRecordingFiles(recording, outputDir);
                
                if (downloadResult.success) {
                    console.log(`   ✅ Downloaded ${Object.keys(downloadResult.files).length} files`);
                } else {
                    console.log(`   ⚠️ Download failed: ${downloadResult.error}`);
                }
            }
            
            // Update Google Sheets
            console.log('\n   📊 Updating Google Sheets...');
            
            // Prepare row data
            const rowData = {
                // Basic info
                uuid: recording.uuid,
                meetingId: recording.id,
                topic: recording.topic,
                startTime: recording.start_time,
                duration: recording.duration,
                hostEmail: recording.host_email,
                
                // Standardized info
                standardizedName: nameAnalysis.standardizedName,
                coachName: nameAnalysis.components?.coach || 'Unknown',
                studentName: nameAnalysis.components?.student || 'Unknown',
                sessionType: nameAnalysis.components?.sessionType || 'Unknown',
                weekNumber: nameAnalysis.components?.week || 0,
                
                // Source info
                dataSource: 'zoom-api',
                processedDate: new Date().toISOString(),
                
                // Status
                processingStatus: 'completed',
                fileCount: recording.recording_files?.length || 0
            };
            
            // Add recording to appropriate tab
            await sheetsService.addRecording({
                uuid: recording.uuid,
                raw: recording,  // Original Zoom data
                processed: {
                    ...rowData,
                    standardizedName: nameAnalysis.standardizedName,
                    dataSource: 'zoom-api'
                }
            });
            console.log(`   ✅ Updated sheets successfully`);
            
            console.log(`\n✅ Completed processing recording ${i + 1}/${recordings.length}`);
        }
        
        console.log('\n\n🎉 All recordings processed successfully!');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Run the processor
processZoomRecordings().catch(console.error);