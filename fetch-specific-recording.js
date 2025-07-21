#!/usr/bin/env node

/**
 * Fetch and process a specific Zoom recording by UUID
 * UUID: 43sNl0IVTvy3Xnp5+ydCog==
 */

require('dotenv').config();

async function fetchAndProcessRecording() {
    const targetUUID = '43sNl0IVTvy3Xnp5+ydCog==';
    
    console.log('🎯 FETCHING SPECIFIC ZOOM RECORDING');
    console.log('================================================================================');
    console.log(`UUID: ${targetUUID}`);
    console.log('================================================================================\n');

    try {
        // Initialize Zoom service directly
        const { ZoomService } = require('./src/infrastructure/services/ZoomService');
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
            warn: (...args) => console.warn('[WARN]', ...args),
            debug: (...args) => console.log('[DEBUG]', ...args)
        };
        
        console.log('📡 Initializing Zoom service...');
        const zoomService = new ZoomService({ config, logger });
        
        // Double encode UUID for Zoom API
        const doubleEncodedUuid = encodeURIComponent(encodeURIComponent(targetUUID));
        
        console.log('🔍 Fetching recording from Zoom Cloud...');
        console.log(`   Double encoded UUID: ${doubleEncodedUuid}`);
        
        // Get recording details
        const recording = await zoomService.getRecording(doubleEncodedUuid);
        
        if (!recording) {
            throw new Error('Recording not found');
        }
        
        console.log('\n✅ Recording found!');
        console.log(`   Topic: ${recording.topic}`);
        console.log(`   Start Time: ${recording.start_time}`);
        console.log(`   Duration: ${recording.duration} minutes`);
        console.log(`   Total Size: ${(recording.total_size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Recording Files: ${recording.recording_files?.length || 0}`);
        
        if (recording.recording_files && recording.recording_files.length > 0) {
            console.log('\n📁 Available Files:');
            recording.recording_files.forEach((file, index) => {
                console.log(`\n   ${index + 1}. ${file.recording_type}`);
                console.log(`      - File Type: ${file.file_extension || file.file_type || 'Unknown'}`);
                console.log(`      - Size: ${(file.file_size / 1024 / 1024).toFixed(2)} MB`);
                console.log(`      - Status: ${file.status}`);
                console.log(`      - Download URL: ${file.download_url ? 'Available' : 'Not Available'}`);
            });
        }
        
        // Now process through the full pipeline
        console.log('\n\n🔄 PROCESSING THROUGH FULL PIPELINE...\n');
        
        // Import and run the production processor
        const runProductionProcessor = require('./src/processors/run-production-processor');
        
        // Process single recording
        await runProductionProcessor({
            singleRecording: {
                ...recording,
                uuid: targetUUID,
                id: recording.id || recording.meeting_id,
                meeting_id: recording.meeting_id || recording.id
            },
            source: 'Manual UUID Processing'
        });
        
        console.log('\n✅ Processing completed!');
        console.log('\n💡 Check the following:');
        console.log('   1. Google Drive for the uploaded files');
        console.log('   2. Google Sheets "Zoom API" tabs for the recording entry');
        console.log('   3. Processing logs above for any errors');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        
        if (error.response?.status === 404) {
            console.log('\n💡 Recording not found. Possible reasons:');
            console.log('   - Recording deleted from Zoom Cloud');
            console.log('   - Recording expired (Zoom has retention limits)');
            console.log('   - Invalid UUID');
            
            // Check if it was previously processed
            console.log('\n🔍 Checking Google Sheets for previous processing...');
            
            try {
                const { MultiTabGoogleSheetsService } = require('./src/infrastructure/services/MultiTabGoogleSheetsService');
                const sheetsService = new MultiTabGoogleSheetsService();
                
                // Search in all tabs
                const tabs = ['zoomRaw', 'webhookRaw', 'driveRaw'];
                let found = false;
                
                for (const tab of tabs) {
                    const result = await sheetsService.findRecordingByUUID(targetUUID, tab);
                    if (result) {
                        found = true;
                        console.log(`\n✅ Found in ${tab}:`);
                        console.log(`   Standardized Name: ${result.standardizedName}`);
                        console.log(`   Processing Date: ${result.processedDate}`);
                        if (result.driveLink) {
                            console.log(`   Drive Link: ${result.driveLink}`);
                        }
                        break;
                    }
                }
                
                if (!found) {
                    console.log('   ❌ Not found in any Google Sheets tabs');
                }
            } catch (sheetsError) {
                console.log('   ❌ Could not check Google Sheets:', sheetsError.message);
            }
        } else if (error.response) {
            console.log(`   Status: ${error.response.status}`);
            console.log(`   Message: ${error.response.data?.message || error.response.statusText}`);
        }
        
        console.error('\nFull error:', error);
    }
}

// Run the script
fetchAndProcessRecording().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});