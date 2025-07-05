/**
 * Test Webhook with AI Insights Generation
 * 
 * This script tests the webhook with a realistic payload that would trigger
 * AI insights generation to verify the logging fix works.
 */

const axios = require('axios');

// Configuration
const WEBHOOK_URL = 'https://zoom-webhook-v2.onrender.com';
const USE_TEST_ENDPOINT = true;

// Realistic test webhook payload that would trigger AI insights
const testWebhookPayload = {
    event: "recording.completed",
    event_ts: Date.now(),
    payload: {
        account_id: "D222nJC2QJiqPoQbV15Kvw",
        object: {
            id: "test_ai_insights_001",
            uuid: "TestAIInsightsUUID123==",
            host_id: "test_host_123",
            host_email: "jenny.duan@ivymentors.co",
            host_name: "Jenny Duan",
            topic: "Coaching Session - Jenny Duan & Test Student",
            type: 2, // Scheduled meeting
            start_time: new Date().toISOString(),
            duration: 3600, // 60 minutes - long enough to trigger AI insights
            total_size: 157286400, // 150MB - substantial size
            recording_count: 4,
            share_url: "https://ivymentors.zoom.us/rec/share/test123",
            recording_play_passcode: "TestPass123",
            download_access_token: "eyJhbGciOiJIUzI1NiJ9.testtoken123",
            password: "TestPass123",
            on_prem: false,
            participant_audio_files: [
                {
                    id: "audio1",
                    recording_start: new Date().toISOString(),
                    recording_end: new Date(Date.now() + 3600000).toISOString(),
                    file_name: "Audio only",
                    file_type: "M4A",
                    file_size: 10485760,
                    download_url: "https://ivymentors.zoom.us/rec/download/test-audio"
                }
            ],
            recording_files: [
                {
                    id: "video1",
                    meeting_id: "test_ai_insights_001",
                    recording_start: new Date().toISOString(),
                    recording_end: new Date(Date.now() + 3600000).toISOString(),
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
                    meeting_id: "test_ai_insights_001",
                    recording_start: new Date().toISOString(),
                    recording_end: new Date(Date.now() + 3600000).toISOString(),
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
                    meeting_id: "test_ai_insights_001",
                    recording_start: new Date().toISOString(),
                    recording_end: new Date(Date.now() + 3600000).toISOString(),
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
                    meeting_id: "test_ai_insights_001",
                    recording_start: new Date().toISOString(),
                    recording_end: new Date(Date.now() + 3600000).toISOString(),
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

async function testWebhookWithAIInsights() {
    console.log('🚀 Testing Webhook with AI Insights Generation\n');
    console.log(`📡 Webhook URL: ${WEBHOOK_URL}`);
    console.log(`🔧 Endpoint: ${USE_TEST_ENDPOINT ? '/webhook-test' : '/webhook'}`);
    console.log('=' .repeat(60));
    
    const endpoint = USE_TEST_ENDPOINT ? '/webhook-test' : '/webhook';
    
    console.log('\n📤 Sending test webhook with AI insights payload...');
    console.log(`   Topic: ${testWebhookPayload.payload.object.topic}`);
    console.log(`   Duration: ${testWebhookPayload.payload.object.duration} seconds (${Math.round(testWebhookPayload.payload.object.duration / 60)} minutes)`);
    console.log(`   Host: ${testWebhookPayload.payload.object.host_email}`);
    console.log(`   Files: ${testWebhookPayload.payload.object.recording_files.length} files`);
    console.log(`   Expected: Should trigger AI insights generation`);
    
    try {
        const response = await axios.post(
            `${WEBHOOK_URL}${endpoint}`,
            testWebhookPayload,
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 60000 // 60 seconds timeout for AI processing
            }
        );
        
        console.log(`\n✅ Response: ${response.status} ${response.statusText}`);
        if (response.data) {
            console.log(`📝 Message: ${JSON.stringify(response.data)}`);
        }
        
        console.log('\n🎉 Webhook test successful!');
        console.log('\n📊 Next steps:');
        console.log('1. Check the webhook server logs for AI insights processing');
        console.log('2. Verify no numbered array output in logs');
        console.log('3. Check if AI insights were generated successfully');
        console.log('4. Verify the recording was processed correctly');
        console.log('5. Check Google Drive for uploaded files');
        console.log('6. Check Google Sheets for updated metadata');
        
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
testWebhookWithAIInsights().catch(console.error); 