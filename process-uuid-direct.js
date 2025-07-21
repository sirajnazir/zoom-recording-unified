#!/usr/bin/env node

/**
 * Direct processing of a specific Zoom recording
 * UUID: 43sNl0IVTvy3Xnp5+ydCog==
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;

// Use the actual processor the system uses
const { execSync } = require('child_process');

async function processSpecificUUID() {
    const targetUUID = '43sNl0IVTvy3Xnp5+ydCog==';
    
    console.log('🎯 PROCESSING ZOOM RECORDING DIRECTLY');
    console.log('================================================================================');
    console.log(`UUID: ${targetUUID}`);
    console.log('================================================================================\n');

    try {
        // First, let's get the recording details
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
            warn: (...args) => console.warn('[WARN]', ...args)
        };
        
        const zoomService = new ZoomService({ config, logger });
        
        // Get the recording
        const doubleEncodedUuid = encodeURIComponent(encodeURIComponent(targetUUID));
        const recording = await zoomService.getRecording(doubleEncodedUuid);
        
        if (!recording) {
            throw new Error('Recording not found');
        }
        
        console.log('✅ Recording found:');
        console.log(`   Topic: ${recording.topic}`);
        console.log(`   Date: ${recording.start_time}`);
        console.log(`   Duration: ${recording.duration} minutes`);
        console.log(`   Files: ${recording.recording_files?.length || 0}`);
        
        // Create a temporary file with the recording data
        const tempFile = path.join(__dirname, `temp-recording-${Date.now()}.json`);
        const recordingData = {
            recordings: [{
                ...recording,
                uuid: targetUUID,
                id: recording.id || recording.meeting_id,
                meeting_id: recording.meeting_id || recording.id,
                dataSource: 'zoom-api'
            }]
        };
        
        await fs.writeFile(tempFile, JSON.stringify(recordingData, null, 2));
        
        console.log('\n🔄 Processing through production processor...\n');
        
        try {
            // Run the processor using the approach that works
            const command = `node process-zoom-simple.js --file "${tempFile}" --single`;
            console.log(`Running: ${command}\n`);
            
            execSync(command, {
                stdio: 'inherit',
                env: process.env
            });
            
            console.log('\n✅ Processing completed successfully!');
            
            // Cleanup temp file
            await fs.unlink(tempFile).catch(() => {});
            
        } catch (processError) {
            console.error('❌ Processing failed:', processError.message);
            
            // Cleanup temp file
            await fs.unlink(tempFile).catch(() => {});
            
            // Try alternative approach - direct processing
            console.log('\n🔄 Trying direct processing approach...\n');
            
            const { ProductionZoomProcessor } = require('./complete-production-processor');
            const { setupContainer } = require('./src/container');
            
            const container = setupContainer();
            const processor = new ProductionZoomProcessor(container);
            
            const result = await processor.processRecording({
                ...recording,
                uuid: targetUUID,
                id: recording.id || recording.meeting_id,
                meeting_id: recording.meeting_id || recording.id,
                dataSource: 'zoom-api',
                source: 'Direct UUID Processing'
            });
            
            if (result.success) {
                console.log('\n✅ Direct processing completed!');
                if (result.processedRecording?.processed?.driveLink) {
                    console.log(`\n📁 Google Drive Folder: ${result.processedRecording.processed.driveLink}`);
                }
            } else {
                console.error('❌ Direct processing also failed:', result.error);
            }
        }
        
        console.log('\n📋 Next steps:');
        console.log('1. Check Google Drive for the folder');
        console.log('2. Verify files are uploaded (audio, timeline, summary)');
        console.log('3. Check Google Sheets "Zoom API" tabs');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        
        if (error.response?.status === 404) {
            console.log('\n💡 The recording may have expired or been deleted from Zoom Cloud');
        }
    }
}

// Run it
processSpecificUUID().catch(console.error);