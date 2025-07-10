#!/usr/bin/env node

/**
 * Send a test webhook directly to the live webhook server
 * This simulates what Zoom would send when a recording is completed
 */

require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

// Your webhook server URL from Render
const WEBHOOK_URL = process.env.WEBHOOK_SERVER_URL || 'https://zoom-webhook-v2.onrender.com/webhook';
const WEBHOOK_SECRET = process.env.ZOOM_WEBHOOK_SECRET_TOKEN || '_UVqGOAeRsqzrz0PWKP_zw';

async function fetchRealRecording() {
    console.log('📹 Fetching real recording data from Zoom...\n');
    
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
        error: (...args) => console.error('[ERROR]', ...args)
    };
    
    const zoomService = new ZoomService({ config, logger });
    
    try {
        // Get the Jenny & Arshiya Week 18 recording
        const uuid = 'HhLLp74lRKi4i90lfY2uiQ==';
        const doubleEncodedUuid = encodeURIComponent(encodeURIComponent(uuid));
        const apiUrl = `https://api.zoom.us/v2/meetings/${doubleEncodedUuid}/recordings`;
        
        const accessToken = await zoomService.getZoomToken();
        const response = await axios.get(apiUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        return response.data;
    } catch (error) {
        console.error('❌ Failed to fetch recording:', error.response?.data || error.message);
        throw error;
    }
}

function createWebhookPayload(recording) {
    // Create a realistic webhook payload
    const payload = {
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
                timezone: 'America/Los_Angeles',
                host_email: recording.host_email || 'contact@ivymentors.co',
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
                    recording_type: file.recording_type,
                    download_access_token: file.download_access_token || 'simulated-token-12345'
                })),
                password: recording.password || '',
                recording_play_passcode: recording.recording_play_passcode || ''
            }
        },
        download_token: 'webhook-download-token-' + Date.now()
    };
    
    return payload;
}

function generateWebhookSignature(payload, secret, timestamp) {
    // Zoom webhook signature format
    const message = `v0:${timestamp}:${JSON.stringify(payload)}`;
    const hash = crypto.createHmac('sha256', secret).update(message).digest('hex');
    return `v0=${hash}`;
}

async function sendWebhookToServer(webhookPayload) {
    console.log('\n🚀 Sending webhook to live server...\n');
    console.log(`   URL: ${WEBHOOK_URL}`);
    console.log(`   Event: ${webhookPayload.event}`);
    console.log(`   Recording: ${webhookPayload.payload.object.topic}`);
    console.log(`   UUID: ${webhookPayload.payload.object.uuid}`);
    console.log(`   Files: ${webhookPayload.payload.object.recording_files.length}`);
    
    try {
        // Generate signature with timestamp
        const timestamp = Date.now().toString();
        const signature = generateWebhookSignature(webhookPayload, WEBHOOK_SECRET, timestamp);
        
        // Send webhook
        const response = await axios.post(WEBHOOK_URL, webhookPayload, {
            headers: {
                'Content-Type': 'application/json',
                'x-zm-signature': signature,
                'x-zm-request-timestamp': timestamp
            },
            timeout: 300000 // 5 minutes
        });
        
        console.log('\n✅ Webhook sent successfully!');
        console.log(`   Status: ${response.status}`);
        console.log(`   Response: ${JSON.stringify(response.data)}`);
        
        return response.data;
    } catch (error) {
        console.error('\n❌ Failed to send webhook:', error.message);
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Response: ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

async function checkWebhookLogs() {
    console.log('\n📋 Next Steps:');
    console.log('1. Check the Render logs to see webhook processing');
    console.log('2. Verify files were downloaded (no 401 errors)');
    console.log('3. Check Google Sheets "Webhook - Raw" and "Webhook - Standardized" tabs');
    console.log('4. Look for the recording in Google Drive');
    
    console.log('\n💡 Key things to verify:');
    console.log('   - Authentication worked (query parameter auth for webhook URLs)');
    console.log('   - Files downloaded successfully');
    console.log('   - Recording appears in Webhook tabs (not Zoom API tabs)');
    console.log('   - If webhook download failed, check for API fallback');
}

async function main() {
    console.log('🧪 LIVE WEBHOOK SERVER TEST');
    console.log('=' .repeat(80));
    console.log('Sending real recording data to your webhook server\n');
    
    try {
        // Step 1: Get real recording data
        const recording = await fetchRealRecording();
        console.log(`✅ Fetched recording: ${recording.topic}`);
        
        // Step 2: Create webhook payload
        const webhookPayload = createWebhookPayload(recording);
        console.log('✅ Created webhook payload');
        
        // Step 3: Send to webhook server
        await sendWebhookToServer(webhookPayload);
        
        // Step 4: Provide guidance
        await checkWebhookLogs();
        
        console.log('\n' + '='.repeat(80));
        console.log('✅ TEST COMPLETE - Check Render logs and Google Sheets!\n');
        
    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        process.exit(1);
    }
}

// Run the test
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };