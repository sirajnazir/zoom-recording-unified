#!/usr/bin/env node

/**
 * Test Webhook Simulation Script
 * Downloads real recording and simulates webhook processing
 * Recording: Jenny & Arshiya Week 18 (UUID: HhLLp74lRKi4i90lfY2uiQ==)
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Import necessary services
const { ZoomService } = require('./src/infrastructure/services/ZoomService');
const { WebhookRecordingAdapter } = require('./src/infrastructure/services/WebhookRecordingAdapter');
const { ProductionZoomProcessor } = require('./complete-production-processor');

async function downloadRealRecording() {
    console.log('🔄 Step 1: Downloading real recording from Zoom Cloud...\n');
    
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
    
    const zoomService = new ZoomService({ config, logger });
    
    try {
        // Get recording details by UUID
        const uuid = 'HhLLp74lRKi4i90lfY2uiQ==';
        console.log(`📹 Fetching recording details for UUID: ${uuid}`);
        
        // Double encode the UUID for API call
        const doubleEncodedUuid = encodeURIComponent(encodeURIComponent(uuid));
        const apiUrl = `https://api.zoom.us/v2/meetings/${doubleEncodedUuid}/recordings`;
        
        // Get access token
        const accessToken = await zoomService.getZoomToken();
        const response = await axios.get(apiUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const recording = response.data;
        console.log(`✅ Found recording: ${recording.topic}`);
        console.log(`   Meeting ID: ${recording.id}`);
        console.log(`   Start Time: ${recording.start_time}`);
        console.log(`   Duration: ${recording.duration} minutes`);
        console.log(`   Files: ${recording.recording_files.length}`);
        
        return recording;
    } catch (error) {
        console.error('❌ Failed to fetch recording:', error.response?.data || error.message);
        throw error;
    }
}

function createWebhookPayload(recording) {
    console.log('\n🔧 Step 2: Creating webhook payload from real recording data...\n');
    
    // Transform Zoom API response to webhook format
    const webhookPayload = {
        event: 'recording.completed',
        event_ts: Date.now(),
        payload: {
            account_id: recording.account_id,
            object: {
                uuid: recording.uuid,
                id: recording.id,
                account_id: recording.account_id,
                host_id: recording.host_id,
                topic: recording.topic,
                type: recording.type || 2,
                start_time: recording.start_time,
                duration: recording.duration,
                total_size: recording.total_size,
                recording_count: recording.recording_count,
                share_url: recording.share_url,
                recording_files: recording.recording_files.map(file => ({
                    id: file.id,
                    meeting_id: recording.id,
                    recording_start: file.recording_start,
                    recording_end: file.recording_end,
                    file_type: file.file_type,
                    file_size: file.file_size,
                    file_extension: file.file_extension,
                    play_url: file.play_url,
                    download_url: file.download_url,
                    status: file.status,
                    recording_type: file.recording_type
                })),
                password: recording.password || '',
                recording_play_passcode: recording.recording_play_passcode || ''
            }
        },
        download_token: 'simulated-download-token-12345' // Simulate webhook download token
    };
    
    console.log('✅ Webhook payload created');
    console.log(`   Event: ${webhookPayload.event}`);
    console.log(`   Recording Files: ${webhookPayload.payload.object.recording_files.length}`);
    
    // Save webhook payload for inspection
    const webhookPath = `output/webhook-logs/simulated-webhook-${Date.now()}.json`;
    fs.mkdir(path.dirname(webhookPath), { recursive: true })
        .then(() => fs.writeFile(webhookPath, JSON.stringify(webhookPayload, null, 2)))
        .then(() => console.log(`   Saved to: ${webhookPath}`));
    
    return webhookPayload;
}

async function simulateWebhookProcessing(webhookPayload) {
    console.log('\n🚀 Step 3: Simulating webhook processing with our fixes...\n');
    
    // Initialize the production processor
    const processor = new ProductionZoomProcessor();
    await processor.initialize();
    
    // Create webhook adapter with dependencies
    const config = processor.config || processor.loadConfig();
    const logger = processor.logger || console;
    const recordingDownloader = processor.recordingDownloader || null;
    
    const adapter = new WebhookRecordingAdapter({ 
        config,
        logger,
        recordingDownloader
    });
    
    try {
        console.log('🔄 Processing webhook through adapter...');
        
        // Transform webhook data
        const transformedRecording = adapter.transform(webhookPayload.payload.object, webhookPayload.download_token);
        
        console.log('\n📊 Transformed recording:');
        console.log(`   UUID: ${transformedRecording.uuid}`);
        console.log(`   Data Source: ${transformedRecording.dataSource}`);
        console.log(`   Source: ${transformedRecording.source}`);
        console.log(`   Has Download Token: ${transformedRecording.download_access_token ? 'Yes' : 'No'}`);
        
        // Process through production processor
        console.log('\n🔄 Processing through production pipeline...');
        const result = await processor.processRecording(transformedRecording, {
            lightweight: false,
            cloudLightweight: false
        });
        
        console.log('\n✅ Processing completed!');
        console.log(`   Success: ${result.success}`);
        console.log(`   Standardized Name: ${result.standardizedName || 'N/A'}`);
        console.log(`   Downloaded Files: ${result.downloadedFiles || 0}`);
        console.log(`   Category: ${result.category || 'N/A'}`);
        console.log(`   Drive Folder: ${result.driveFolder ? 'Created' : 'Not created'}`);
        console.log(`   Sheets Updated: ${result.sheetsUpdated ? 'Yes' : 'No'}`);
        
        if (result.error) {
            console.log(`   ⚠️  Error: ${result.error}`);
        }
        
        // Check which tabs were updated
        if (result.sheetsUpdated && result.tabsUpdated) {
            console.log(`\n📊 Google Sheets tabs updated:`);
            result.tabsUpdated.forEach(tab => {
                console.log(`   - ${tab}`);
            });
        }
        
        return result;
    } catch (error) {
        console.error('\n❌ Processing failed:', error.message);
        console.error(error.stack);
        throw error;
    } finally {
        // Cleanup
        if (processor.container) {
            await processor.shutdown();
        }
    }
}

async function verifyWebhookTabUpdate() {
    console.log('\n🔍 Step 4: Verifying webhook tab updates...\n');
    
    // This would normally check the actual Google Sheets
    // For now, we'll check the logs
    console.log('📋 Expected behavior:');
    console.log('   1. Recording should appear in "Webhook - Raw" tab');
    console.log('   2. Recording should appear in "Webhook - Standardized" tab');
    console.log('   3. NOT in "Zoom API - Raw" or "Zoom API - Standardized" tabs');
    console.log('\n💡 Check the Google Sheets to verify the tabs were updated correctly');
}

async function runSimulation() {
    console.log('🧪 WEBHOOK SIMULATION TEST');
    console.log('=' .repeat(80));
    console.log('Testing webhook processing with real recording data');
    console.log('Recording: Jenny & Arshiya Week 18\n');
    
    try {
        // Step 1: Download real recording
        const recording = await downloadRealRecording();
        
        // Step 2: Create webhook payload
        const webhookPayload = createWebhookPayload(recording);
        
        // Step 3: Simulate webhook processing
        const result = await simulateWebhookProcessing(webhookPayload);
        
        // Step 4: Verify results
        await verifyWebhookTabUpdate();
        
        console.log('\n' + '='.repeat(80));
        console.log('✅ WEBHOOK SIMULATION COMPLETE\n');
        
        console.log('Summary:');
        console.log('1. Real recording data fetched from Zoom Cloud');
        console.log('2. Webhook payload created with proper format');
        console.log('3. Processing tested with all webhook fixes');
        console.log('4. Check Google Sheets for webhook tab updates');
        
        console.log('\n💡 Key things to verify:');
        console.log('   - No 401 authentication errors');
        console.log('   - Files downloaded successfully');
        console.log('   - Recording in Webhook tabs (not API tabs)');
        console.log('   - Proper standardized naming');
        
    } catch (error) {
        console.error('\n❌ SIMULATION FAILED:', error.message);
        process.exit(1);
    }
}

// Run the simulation
if (require.main === module) {
    runSimulation().catch(console.error);
}

module.exports = { runSimulation };