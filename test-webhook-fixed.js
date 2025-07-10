require('dotenv').config();

const axios = require('axios');
const crypto = require('crypto');

async function sendTestWebhook() {
    // Your live server URL
    const webhookUrl = 'https://zoom-recording-unified.onrender.com/webhook';
    
    // Generate a unique recording ID for this test
    const testRecordingId = Date.now();
    const downloadToken = 'test-token-' + crypto.randomBytes(16).toString('hex');
    
    const payload = {
        event: 'recording.completed',
        event_ts: Date.now(),
        payload: {
            account_id: 'test-account',
            object: {
                id: testRecordingId,
                uuid: 'TestWebhook' + Buffer.from(testRecordingId.toString()).toString('base64'),
                topic: 'Webhook Test - Jenny & Arshiya Session',
                start_time: new Date().toISOString(),
                duration: 1800,
                recording_count: 3,
                recording_files: [
                    {
                        id: 'video-file-1',
                        recording_type: 'shared_screen_with_speaker_view',
                        recording_start: new Date().toISOString(),
                        recording_end: new Date(Date.now() + 1800000).toISOString(),
                        file_size: 100000000,
                        download_url: `https://zoom.us/rec/download/test-video.mp4?access_token=${downloadToken}`
                    },
                    {
                        id: 'audio-file-1',
                        recording_type: 'audio_only',
                        recording_start: new Date().toISOString(),
                        recording_end: new Date(Date.now() + 1800000).toISOString(),
                        file_size: 20000000,
                        download_url: `https://zoom.us/rec/download/test-audio.m4a?access_token=${downloadToken}`
                    },
                    {
                        id: 'transcript-file-1',
                        recording_type: 'audio_transcript',
                        recording_start: new Date().toISOString(),
                        recording_end: new Date(Date.now() + 1800000).toISOString(),
                        file_size: 50000,
                        download_url: `https://zoom.us/rec/download/test-transcript.vtt?access_token=${downloadToken}`
                    }
                ]
            }
        },
        download_access_token: downloadToken
    };

    console.log('\n🧪 WEBHOOK TEST WITH FIXES');
    console.log('================================================================================');
    console.log('Sending webhook to:', webhookUrl);
    console.log('Recording ID:', testRecordingId);
    console.log('UUID:', payload.payload.object.uuid);
    console.log('\nThis test will verify:');
    console.log('✓ Webhook routing to correct tabs (Webhook - Raw/Standardized)');
    console.log('✓ File ID extraction (no struct_value errors)');
    console.log('✓ Proper data source detection');
    console.log('================================================================================\n');

    try {
        const response = await axios.post(webhookUrl, payload);
        
        console.log('✅ Webhook sent successfully!');
        console.log('Response status:', response.status);
        console.log('\n📋 Next steps:');
        console.log('1. Check Render logs for processing details');
        console.log('2. Verify data appears in "Webhook - Raw" and "Webhook - Standardized" tabs');
        console.log('3. Look for any struct_value errors (should be fixed now)');
        console.log('4. Confirm Drive files are uploaded correctly');
        
    } catch (error) {
        console.error('❌ Error sending webhook:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

sendTestWebhook();