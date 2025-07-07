/**
 * Test Real Webhook Recording
 * 
 * This script simulates a real Zoom webhook event to test the unified system
 */

require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

// Configuration
const WEBHOOK_URL = process.env.WEBHOOK_BASE_URL || 'https://zoom-webhook-v2.onrender.com';
const WEBHOOK_SECRET = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
const LOCAL_WEBHOOK_URL = 'http://localhost:3000/webhook'; // For local testing

// Real recording data structure based on actual Zoom webhooks
const createRealWebhookPayload = () => {
    const now = new Date();
    const startTime = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
    
    return {
        event: "recording.completed",
        event_ts: now.getTime(),
        payload: {
            account_id: process.env.ZOOM_ACCOUNT_ID,
            object: {
                uuid: `TestWebhook${Date.now()}==`,
                id: "88888888888",
                host_id: "test_host_123",
                host_email: "jenny.duan@ivymentors.co",
                host_name: "Jenny Duan",
                topic: "Coaching Session - Jenny Duan & Test Student",
                type: 2, // Scheduled meeting
                start_time: startTime.toISOString(),
                timezone: "America/Los_Angeles",
                duration: 45, // 45 minutes
                total_size: 157286400, // 150MB
                recording_count: 4,
                share_url: "https://ivymentors.zoom.us/rec/share/test123",
                recording_play_passcode: "TestPass123",
                download_access_token: "eyJhbGciOiJIUzI1NiJ9.testtoken123",
                password: "TestPass123",
                on_prem: false,
                participant_audio_files: [
                    {
                        id: "audio1",
                        recording_start: startTime.toISOString(),
                        recording_end: now.toISOString(),
                        file_name: "Audio only",
                        file_type: "M4A",
                        file_size: 10485760,
                        download_url: "https://ivymentors.zoom.us/rec/download/test-audio"
                    }
                ],
                recording_files: [
                    {
                        id: "video1",
                        meeting_id: "88888888888",
                        recording_start: startTime.toISOString(),
                        recording_end: now.toISOString(),
                        file_type: "MP4",
                        file_size: 104857600, // 100MB
                        file_extension: "mp4",
                        play_url: "https://ivymentors.zoom.us/rec/play/test-video",
                        download_url: "https://ivymentors.zoom.us/rec/download/test-video",
                        status: "completed",
                        recording_type: "shared_screen_with_speaker_view"
                    },
                    {
                        id: "audio1",
                        meeting_id: "88888888888",
                        recording_start: startTime.toISOString(),
                        recording_end: now.toISOString(),
                        file_type: "M4A",
                        file_size: 10485760, // 10MB
                        file_extension: "m4a",
                        play_url: "https://ivymentors.zoom.us/rec/play/test-audio",
                        download_url: "https://ivymentors.zoom.us/rec/download/test-audio",
                        status: "completed",
                        recording_type: "audio_only"
                    },
                    {
                        id: "transcript1",
                        meeting_id: "88888888888",
                        recording_start: startTime.toISOString(),
                        recording_end: now.toISOString(),
                        file_type: "TRANSCRIPT",
                        file_size: 524288, // 512KB
                        file_extension: "vtt",
                        play_url: "https://ivymentors.zoom.us/rec/play/test-transcript",
                        download_url: "https://ivymentors.zoom.us/rec/download/test-transcript",
                        status: "completed",
                        recording_type: "audio_transcript"
                    },
                    {
                        id: "chat1",
                        meeting_id: "88888888888",
                        recording_start: startTime.toISOString(),
                        recording_end: now.toISOString(),
                        file_type: "CHAT",
                        file_size: 4096, // 4KB
                        file_extension: "txt",
                        play_url: "https://ivymentors.zoom.us/rec/play/test-chat",
                        download_url: "https://ivymentors.zoom.us/rec/download/test-chat",
                        status: "completed",
                        recording_type: "chat_file"
                    }
                ]
            }
        }
    };
};

// Generate webhook signature
function generateWebhookSignature(payload, timestamp) {
    const message = `v0:${timestamp}:${JSON.stringify(payload)}`;
    const hash = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(message)
        .digest('hex');
    return `v0=${hash}`;
}

// Send webhook to a specific URL
async function sendWebhook(url, payload) {
    const timestamp = Date.now().toString();
    const signature = generateWebhookSignature(payload, timestamp);
    
    try {
        console.log(`📤 Sending webhook to: ${url}`);
        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json',
                'x-zm-request-timestamp': timestamp,
                'x-zm-signature': signature
            },
            timeout: 30000
        });
        
        console.log(`✅ Response: ${response.status} - ${JSON.stringify(response.data)}`);
        return { success: true, response: response.data };
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Data: ${JSON.stringify(error.response.data)}`);
        }
        return { success: false, error: error.message };
    }
}

// Main test function
async function testWebhook() {
    console.log('🧪 Zoom Webhook Test Tool\n');
    
    // Get command line arguments
    const args = process.argv.slice(2);
    const target = args[0] || 'both';
    
    console.log(`Target: ${target}`);
    console.log(`Webhook Secret: ${WEBHOOK_SECRET ? '✅ Configured' : '❌ Missing'}`);
    console.log('=' .repeat(60) + '\n');
    
    // Create webhook payload
    const payload = createRealWebhookPayload();
    
    console.log('📋 Webhook Payload Summary:');
    console.log(`Event: ${payload.event}`);
    console.log(`Meeting ID: ${payload.payload.object.id}`);
    console.log(`Topic: ${payload.payload.object.topic}`);
    console.log(`Host: ${payload.payload.object.host_name} (${payload.payload.object.host_email})`);
    console.log(`Duration: ${payload.payload.object.duration} minutes`);
    console.log(`Files: ${payload.payload.object.recording_files.length}`);
    console.log(`Total Size: ${(payload.payload.object.total_size / 1024 / 1024).toFixed(2)} MB`);
    console.log('=' .repeat(60) + '\n');
    
    // Test based on target
    if (target === 'local' || target === 'both') {
        console.log('🏠 Testing LOCAL webhook server...');
        const localResult = await sendWebhook(LOCAL_WEBHOOK_URL, payload);
        
        if (localResult.success) {
            console.log('✅ Local webhook test successful!\n');
        } else {
            console.log('❌ Local webhook test failed!\n');
        }
    }
    
    if (target === 'render' || target === 'both') {
        console.log('☁️  Testing RENDER webhook server...');
        const renderResult = await sendWebhook(`${WEBHOOK_URL}/webhook`, payload);
        
        if (renderResult.success) {
            console.log('✅ Render webhook test successful!\n');
            
            // Check health status
            console.log('🏥 Checking Render health...');
            try {
                const health = await axios.get(`${WEBHOOK_URL}/health`);
                console.log(`Health: ${JSON.stringify(health.data, null, 2)}\n`);
            } catch (error) {
                console.log('❌ Health check failed\n');
            }
        } else {
            console.log('❌ Render webhook test failed!\n');
        }
    }
    
    // Show next steps
    console.log('=' .repeat(60));
    console.log('📝 Next Steps:');
    console.log('1. Check Google Drive for the uploaded recording');
    console.log('2. Check Google Sheets for the new entry');
    console.log('3. Review logs for processing details');
    console.log('4. Verify AI insights were generated');
    console.log('=' .repeat(60));
}

// Show usage
function showUsage() {
    console.log(`
Usage: node test-real-webhook.js [target]

Targets:
  local   - Test local webhook server (http://localhost:3000)
  render  - Test Render webhook server (${WEBHOOK_URL})
  both    - Test both servers (default)

Examples:
  node test-real-webhook.js
  node test-real-webhook.js local
  node test-real-webhook.js render
    `);
}

// Run the test
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args[0] === 'help' || args[0] === '--help') {
        showUsage();
    } else {
        testWebhook().catch(console.error);
    }
}