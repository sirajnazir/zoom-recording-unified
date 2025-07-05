/**
 * Simple Webhook Test Script
 * 
 * This script tests the webhook endpoint with a basic recording.completed event.
 * You can use this to verify your webhook is working correctly.
 */

const axios = require('axios');

// Configuration - Update these values
const WEBHOOK_URL = 'https://zoom-webhook-v2.onrender.com'; // Update with your actual URL
const USE_TEST_ENDPOINT = true; // Set to false for production endpoint with signature validation

// Test webhook payload
const testWebhookPayload = {
    event: "recording.completed",
    event_ts: Date.now(),
    payload: {
        account_id: "D222nJC2QJiqPoQbV15Kvw",
        object: {
            id: "test_recording_001",
            uuid: "TestUUID123==",
            host_id: "test_host_123",
            host_email: "test@example.com",
            topic: "Test Recording - Webhook Test",
            type: 2, // Scheduled meeting
            start_time: new Date().toISOString(),
            duration: 15, // 15 minutes
            total_size: 50000000, // 50MB
            recording_count: 1,
            recording_files: [
                {
                    id: "test_file_001",
                    meeting_id: "test_recording_001",
                    recording_start: new Date().toISOString(),
                    recording_end: new Date(Date.now() + 15*60*1000).toISOString(),
                    file_type: "MP4",
                    file_size: 50000000,
                    play_url: "https://zoom.us/rec/play/test-recording",
                    download_url: "https://zoom.us/rec/download/test-recording",
                    status: "completed",
                    recording_type: "shared_screen_with_speaker_view"
                }
            ]
        }
    }
};

async function testWebhook() {
    console.log('🚀 Testing Webhook Endpoint\n');
    console.log(`📡 Webhook URL: ${WEBHOOK_URL}`);
    console.log(`🔧 Endpoint: ${USE_TEST_ENDPOINT ? '/webhook-test' : '/webhook'}`);
    console.log('=' .repeat(60));
    
    const endpoint = USE_TEST_ENDPOINT ? '/webhook-test' : '/webhook';
    
    console.log('\n📤 Sending test webhook...');
    console.log(`   Topic: ${testWebhookPayload.payload.object.topic}`);
    console.log(`   Duration: ${testWebhookPayload.payload.object.duration} minutes`);
    console.log(`   Host: ${testWebhookPayload.payload.object.host_email}`);
    
    try {
        const response = await axios.post(
            `${WEBHOOK_URL}${endpoint}`,
            testWebhookPayload,
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );
        
        console.log(`\n✅ Response: ${response.status} ${response.statusText}`);
        if (response.data) {
            console.log(`📝 Message: ${JSON.stringify(response.data)}`);
        }
        
        console.log('\n🎉 Webhook test successful!');
        console.log('\n📊 Next steps:');
        console.log('1. Check the webhook server logs for processing details');
        console.log('2. Verify the recording was processed correctly');
        console.log('3. Check Google Drive for uploaded files');
        console.log('4. Check Google Sheets for updated metadata');
        
    } catch (error) {
        console.log(`\n❌ Error: ${error.message}`);
        if (error.response) {
            console.log(`   Status: ${error.response.status}`);
            console.log(`   Data: ${JSON.stringify(error.response.data)}`);
        }
        
        console.log('\n🔧 Troubleshooting:');
        console.log('1. Verify the WEBHOOK_URL is correct');
        console.log('2. Check if the webhook server is running');
        console.log('3. Verify network connectivity');
        console.log('4. Check server logs for errors');
    }
    
    console.log('\n' + '=' .repeat(60));
}

// Run the test
testWebhook().catch(console.error); 