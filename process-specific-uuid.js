#!/usr/bin/env node

/**
 * Bespoke script to process a specific Zoom recording by UUID
 * This will fetch the recording from Zoom Cloud and process it through the full pipeline
 */

require('dotenv').config();
const { ProductionZoomProcessor } = require('./complete-production-processor');
const { setupDependencyContainer } = require('./src/infrastructure/container');

async function processSpecificRecording() {
    const targetUUID = '43sNl0IVTvy3Xnp5+ydCog==';
    
    console.log('🎯 PROCESSING SPECIFIC ZOOM RECORDING');
    console.log('================================================================================');
    console.log(`UUID: ${targetUUID}`);
    console.log('================================================================================\n');

    try {
        // Setup container and initialize processor
        console.log('🚀 Setting up dependency container...');
        const container = await setupDependencyContainer();
        
        console.log('🚀 Initializing production processor...');
        const processor = new ProductionZoomProcessor(container);
        
        // Get services from container
        const zoomService = container.get('zoomService');
        const logger = container.get('logger');
        
        // Fetch recording details from Zoom
        console.log('\n📡 Fetching recording from Zoom Cloud...');
        
        // Double encode the UUID for Zoom API
        const doubleEncodedUuid = encodeURIComponent(encodeURIComponent(targetUUID));
        
        try {
            // Get the recording details
            const recording = await zoomService.getRecording(doubleEncodedUuid);
            
            if (!recording) {
                throw new Error('Recording not found in Zoom Cloud');
            }
            
            console.log('\n✅ Recording found:');
            console.log(`   Topic: ${recording.topic}`);
            console.log(`   Date: ${recording.start_time}`);
            console.log(`   Duration: ${recording.duration} minutes`);
            console.log(`   Files: ${recording.recording_files?.length || 0}`);
            
            // List all files
            if (recording.recording_files && recording.recording_files.length > 0) {
                console.log('\n📁 Recording files available:');
                recording.recording_files.forEach((file, index) => {
                    console.log(`   ${index + 1}. ${file.recording_type} (${(file.file_size / 1024 / 1024).toFixed(2)} MB)`);
                    console.log(`      - File Type: ${file.file_extension || 'Unknown'}`);
                    console.log(`      - Status: ${file.status}`);
                });
            }
            
            // Process the recording through the full pipeline
            console.log('\n🔄 Processing recording through full pipeline...');
            console.log('   This will:');
            console.log('   ✓ Download all files from Zoom Cloud');
            console.log('   ✓ Generate standardized name');
            console.log('   ✓ Create AI insights');
            console.log('   ✓ Upload to Google Drive');
            console.log('   ✓ Update Google Sheets\n');
            
            const result = await processor.processRecording({
                ...recording,
                uuid: targetUUID,
                id: recording.id || recording.meeting_id,
                meeting_id: recording.meeting_id || recording.id,
                start_time: recording.start_time,
                topic: recording.topic,
                duration: recording.duration,
                recording_files: recording.recording_files || [],
                // Mark as zoom-api source to ensure proper processing
                dataSource: 'zoom-api',
                source: 'Manual UUID Processing'
            });
            
            if (result.success) {
                console.log('\n✅ PROCESSING COMPLETED SUCCESSFULLY!');
                console.log('================================================================================');
                console.log('📊 Results:');
                console.log(`   Standardized Name: ${result.processedRecording?.processed?.standardizedName || 'Unknown'}`);
                console.log(`   Category: ${result.processedRecording?.processed?.category || 'Unknown'}`);
                console.log(`   Week: ${result.processedRecording?.processed?.weekNumber || 'Unknown'}`);
                
                if (result.processedRecording?.processed?.driveLink) {
                    console.log(`\n📁 Google Drive Folder:`);
                    console.log(`   ${result.processedRecording.processed.driveLink}`);
                }
                
                if (result.processedRecording?.processed?.downloadedFiles) {
                    const files = result.processedRecording.processed.downloadedFiles;
                    console.log(`\n📥 Downloaded Files:`);
                    Object.entries(files).forEach(([type, path]) => {
                        if (path) {
                            console.log(`   ✓ ${type}: ${path}`);
                        }
                    });
                }
                
                if (result.processedRecording?.processed?.driveFileIds) {
                    console.log(`\n☁️ Uploaded to Drive:`);
                    Object.entries(result.processedRecording.processed.driveFileIds).forEach(([type, fileInfo]) => {
                        if (fileInfo) {
                            const id = typeof fileInfo === 'object' ? fileInfo.id : fileInfo;
                            console.log(`   ✓ ${type}: ${id}`);
                        }
                    });
                }
                
                console.log('\n💡 Next Steps:');
                console.log('   1. Check the Google Drive folder link above');
                console.log('   2. Verify all files are present');
                console.log('   3. Check Google Sheets "Zoom API" tabs for the recording entry');
                
            } else {
                console.error('\n❌ Processing failed:', result.error);
                
                // Try to provide more specific guidance
                if (result.error?.includes('401') || result.error?.includes('Unauthorized')) {
                    console.log('\n💡 This might be an authentication issue. Check:');
                    console.log('   - Zoom OAuth credentials are valid');
                    console.log('   - Recording is not expired or deleted');
                    console.log('   - You have permission to access this recording');
                }
            }
            
        } catch (zoomError) {
            console.error('\n❌ Failed to fetch recording from Zoom:', zoomError.message);
            
            if (zoomError.response?.status === 404) {
                console.log('\n💡 Recording not found. Possible reasons:');
                console.log('   - Recording has been deleted from Zoom Cloud');
                console.log('   - UUID is incorrect');
                console.log('   - Recording has expired (Zoom retains for limited time)');
                
                // Try to check if it exists in Google Sheets already
                console.log('\n🔍 Checking if recording was previously processed...');
                const googleSheetsService = container.get('googleSheetsService');
                const existingRecording = await googleSheetsService.findRecordingByUUID(targetUUID);
                
                if (existingRecording) {
                    console.log('\n✅ Recording was previously processed:');
                    console.log(`   Standardized Name: ${existingRecording.standardizedName}`);
                    console.log(`   Processing Date: ${existingRecording.processedDate}`);
                    console.log(`   Drive Folder: ${existingRecording.driveFolder}`);
                    if (existingRecording.driveLink) {
                        console.log(`   Drive Link: ${existingRecording.driveLink}`);
                    }
                } else {
                    console.log('   ❌ No record found in Google Sheets either');
                }
            }
        }
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        console.error(error.stack);
    } finally {
        console.log('\n================================================================================');
        console.log('🏁 Script completed');
        process.exit(0);
    }
}

// Run the script
processSpecificRecording().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});