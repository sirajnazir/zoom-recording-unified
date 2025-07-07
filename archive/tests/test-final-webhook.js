/**
 * Final webhook test with proper credentials
 */

require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

const WEBHOOK_URL = process.env.WEBHOOK_BASE_URL || 'https://zoom-webhook-v2.onrender.com';
const WEBHOOK_SECRET = process.env.ZOOM_WEBHOOK_SECRET_TOKEN || '_UVqGOAeRsqzrz0PWKP_zw';

function generateSignature(payload, timestamp, secret) {
    const message = `v0:${timestamp}:${JSON.stringify(payload)}`;
    return `v0=${crypto.createHmac('sha256', secret).update(message).digest('hex')}`;
}

async function testFinalWebhook() {
    console.log('🚀 Final Webhook Test\n');
    console.log(`📡 Webhook URL: ${WEBHOOK_URL}`);
    console.log('=' .repeat(60));
    
    // Create a realistic test recording
    const testRecording = {
        event: "recording.completed",
        event_ts: Date.now(),
        payload: {
            account_id: "D222nJC2QJiqPoQbV15Kvw",
            object: {
                id: "final_test_recording_001",
                uuid: "FinalTestUUID999==",
                host_id: "siraj123",
                host_email: "siraj@ivylevel.co",
                topic: "Final Test - Short Admin Recording",
                type: 2,
                start_time: new Date().toISOString(),
                duration: 8, // Short duration for TRIVIAL
                total_size: 2000000, // Small size for TRIVIAL
                recording_count: 1,
                recording_files: [
                    {
                        id: "file_final_001",
                        meeting_id: "final_test_recording_001",
                        recording_start: new Date().toISOString(),
                        recording_end: new Date(Date.now() + 8*60*1000).toISOString(),
                        file_type: "MP4",
                        file_size: 2000000,
                        play_url: "https://zoom.us/rec/play/final-test-recording",
                        download_url: "https://zoom.us/rec/download/final-test-recording",
                        status: "completed",
                        recording_type: "shared_screen_with_speaker_view"
                    }
                ]
            }
        }
    };
    
    console.log('\n📤 Sending final test webhook...');
    console.log(`   Topic: ${testRecording.payload.object.topic}`);
    console.log(`   Duration: ${testRecording.payload.object.duration} minutes`);
    console.log(`   Host: ${testRecording.payload.object.host_email}`);
    console.log(`   Expected Category: TRIVIAL (short admin recording)`);
    
    try {
        const timestamp = Date.now().toString();
        const signature = generateSignature(testRecording, timestamp, WEBHOOK_SECRET);
        
        const response = await axios.post(
            `${WEBHOOK_URL}/webhook`,
            testRecording,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-zm-signature': signature,
                    'x-zm-request-timestamp': timestamp
                },
                timeout: 30000
            }
        );
        
        console.log(`\n   ✅ Response: ${response.status} ${response.statusText}`);
        if (response.data) {
            console.log(`   📝 Message: ${JSON.stringify(response.data)}`);
        }
        
    } catch (error) {
        console.log(`\n   ❌ Error: ${error.message}`);
        if (error.response) {
            console.log(`   Status: ${error.response.status}`);
            console.log(`   Data: ${JSON.stringify(error.response.data)}`);
        }
    }
    
    console.log('\n' + '=' .repeat(60));
    console.log('\n🔍 Check Render Logs for:');
    console.log('1. "Using service account credentials" (should work now)');
    console.log('2. "Successfully authenticated with Google"');
    console.log('3. "Uploading to Google Drive"');
    console.log('4. "Successfully saved to Google Sheets"');
    console.log('5. Category should be TRIVIAL (8 min Siraj recording)');
    
    console.log('\n📊 Then check Google Sheets:');
    console.log(`https://docs.google.com/spreadsheets/d/${process.env.MASTER_INDEX_SHEET_ID}`);
    console.log('Look for "Final Test - Short Admin Recording"');
}

// Run test
testFinalWebhook().catch(console.error);