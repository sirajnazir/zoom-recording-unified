#!/usr/bin/env node

/**
 * Process a single specific UUID through the production pipeline
 */

require('dotenv').config();

const TARGET_UUID = '43sNl0IVTvy3Xnp5+ydCog==';

async function main() {
    console.log('🎯 PROCESSING SPECIFIC RECORDING');
    console.log('================================================================================');
    console.log(`Target UUID: ${TARGET_UUID}`);
    console.log('================================================================================\n');

    try {
        // Load the processor script directly
        const processRecordings = require('./src/processors/processRecordings');
        
        // Create recording object with the specific UUID
        const recording = {
            uuid: TARGET_UUID,
            // This will be filled by the processor when it fetches from Zoom
        };
        
        console.log('🔄 Fetching and processing recording...\n');
        
        // Process just this one recording
        await processRecordings([recording], {
            source: 'Manual UUID Processing',
            forceProcess: true,
            skipExistingCheck: true
        });
        
        console.log('\n✅ Processing completed!');
        console.log('\n📋 Check:');
        console.log('   1. Google Drive for uploaded files');
        console.log('   2. Google Sheets "Zoom API" tabs');
        console.log('   3. Logs above for any errors');
        
    } catch (error) {
        // If that doesn't work, try the more direct approach
        console.log('🔄 Trying alternative approach...\n');
        
        try {
            // Direct initialization
            console.log('📦 Loading dependencies...');
            const { ProductionZoomProcessor } = require('./complete-production-processor');
            const DIContainer = require('./src/container');
            
            console.log('🔧 Setting up container...');
            const container = new DIContainer();
            
            // Manually register required services
            const { ZoomService } = require('./src/infrastructure/services/ZoomService');
            const { GoogleDriveService } = require('./src/infrastructure/services/GoogleDriveService');
            const { MultiTabGoogleSheetsService } = require('./src/infrastructure/services/MultiTabGoogleSheetsService');
            const { EnhancedRecordingDownloader } = require('./src/infrastructure/services/EnhancedRecordingDownloader');
            const { CompleteSmartNameStandardizer } = require('./src/infrastructure/services/CompleteSmartNameStandardizer');
            const { SmartWeekInferencer } = require('./src/infrastructure/services/SmartWeekInferencer');
            const { DriveOrganizer } = require('./src/infrastructure/services/DriveOrganizer');
            
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
            
            // Register services
            container.register('config', config);
            container.register('logger', logger);
            container.register('zoomService', new ZoomService({ config, logger }));
            container.register('googleDriveService', new GoogleDriveService({ config, logger }));
            container.register('googleSheetsService', new MultiTabGoogleSheetsService({ config, logger }));
            container.register('recordingDownloader', new EnhancedRecordingDownloader({ config, logger }));
            container.register('nameStandardizer', new CompleteSmartNameStandardizer({ config, logger }));
            container.register('weekInferencer', new SmartWeekInferencer({ config, logger }));
            container.register('driveOrganizer', new DriveOrganizer(container));
            
            console.log('📡 Fetching recording from Zoom...');
            const zoomService = container.get('zoomService');
            const doubleEncodedUuid = encodeURIComponent(encodeURIComponent(TARGET_UUID));
            const recording = await zoomService.getRecording(doubleEncodedUuid);
            
            if (!recording) {
                throw new Error('Recording not found in Zoom Cloud');
            }
            
            console.log('\n✅ Recording found:');
            console.log(`   Topic: ${recording.topic}`);
            console.log(`   Date: ${recording.start_time}`);
            console.log(`   Duration: ${recording.duration} minutes`);
            console.log(`   Files: ${recording.recording_files?.length || 0}`);
            
            console.log('\n🚀 Processing recording...');
            const processor = new ProductionZoomProcessor(container);
            
            const result = await processor.processRecording({
                ...recording,
                uuid: TARGET_UUID,
                id: recording.id || recording.meeting_id,
                meeting_id: recording.meeting_id || recording.id,
                dataSource: 'zoom-api'
            });
            
            if (result.success) {
                console.log('\n✅ Successfully processed!');
                
                const processed = result.processedRecording?.processed;
                if (processed) {
                    console.log(`\n📊 Results:`);
                    console.log(`   Standardized Name: ${processed.standardizedName}`);
                    console.log(`   Category: ${processed.category}`);
                    console.log(`   Week: ${processed.weekNumber}`);
                    
                    if (processed.driveLink) {
                        console.log(`\n📁 Google Drive Folder:`);
                        console.log(`   ${processed.driveLink}`);
                    }
                    
                    if (processed.downloadedFiles) {
                        console.log(`\n📥 Downloaded Files:`);
                        Object.entries(processed.downloadedFiles).forEach(([type, path]) => {
                            if (path) console.log(`   ✓ ${type}`);
                        });
                    }
                }
            } else {
                console.error('\n❌ Processing failed:', result.error);
            }
            
        } catch (altError) {
            console.error('❌ Alternative approach also failed:', altError.message);
            throw altError;
        }
    }
}

main().catch(error => {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
});