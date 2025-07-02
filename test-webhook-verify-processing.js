/**
 * Verify webhook processing is working correctly
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

async function verifyWebhookProcessing() {
    console.log('🔍 Webhook Processing Verification Test\n');
    console.log(`📡 Webhook URL: ${WEBHOOK_URL}`);
    console.log('=' .repeat(60));
    
    // Create a unique test recording
    const timestamp = Date.now();
    const testRecording = {
        event: "recording.completed",
        event_ts: timestamp,
        payload: {
            account_id: "D222nJC2QJiqPoQbV15Kvw",
            object: {
                uuid: `verify_test_${timestamp}`,
                id: `test_${timestamp}`,
                topic: `Webhook Test Recording ${new Date().toLocaleTimeString()}`,
                start_time: new Date().toISOString(),
                duration: 300, // 5 minutes - should be TRIVIAL
                total_size: 2500000, // 2.5MB
                recording_count: 1,
                host_email: "siraj@ivylevel.co",
                host_name: "Siraj (Test)",
                recording_files: [
                    {
                        id: `file_${timestamp}`,
                        meeting_id: `test_${timestamp}`,
                        recording_start: new Date().toISOString(),
                        recording_end: new Date(Date.now() + 300000).toISOString(),
                        file_type: "MP4",
                        file_size: 2500000,
                        play_url: `https://zoom.us/rec/play/test-${timestamp}`,
                        download_url: `https://zoom.us/rec/download/test-${timestamp}`,
                        status: "completed",
                        recording_type: "shared_screen_with_speaker_view"
                    }
                ]
            }
        }
    };
    
    console.log('\n📤 Sending Test Recording:');
    console.log(`   UUID: ${testRecording.payload.object.uuid}`);
    console.log(`   Topic: ${testRecording.payload.object.topic}`);
    console.log(`   Host: ${testRecording.payload.object.host_email}`);
    console.log(`   Duration: ${testRecording.payload.object.duration} seconds`);
    console.log(`   Size: ${testRecording.payload.object.total_size} bytes`);
    console.log(`   Expected: TRIVIAL category (short admin recording)`);
    
    try {
        const requestTimestamp = Date.now().toString();
        const signature = generateSignature(testRecording, requestTimestamp, WEBHOOK_SECRET);
        
        const response = await axios.post(
            `${WEBHOOK_URL}/webhook`,
            testRecording,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-zm-signature': signature,
                    'x-zm-request-timestamp': requestTimestamp
                },
                timeout: 30000
            }
        );
        
        console.log(`\n✅ Webhook Response: ${response.status} ${response.statusText}`);
        if (response.data) {
            console.log(`📝 Message: ${JSON.stringify(response.data)}`);
        }
        
    } catch (error) {
        console.log(`\n❌ Error: ${error.message}`);
        if (error.response) {
            console.log(`   Status: ${error.response.status}`);
            console.log(`   Data: ${JSON.stringify(error.response.data)}`);
        }
    }
    
    console.log('\n' + '=' .repeat(60));
    console.log('\n🔍 Verification Steps:');
    console.log('\n1. Check Render Logs:');
    console.log('   - Go to https://dashboard.render.com');
    console.log('   - Look for these messages:');
    console.log('     ✓ "Using service account credentials"');
    console.log('     ✓ "Successfully authenticated with Google"');
    console.log('     ✓ "Processing recording: verify_test_..."');
    console.log('     ✓ "Category: TRIVIAL"');
    console.log('     ✓ "Uploading to Google Drive"');
    console.log('     ✓ "Successfully saved to Google Sheets"');
    
    console.log('\n2. Check Google Sheets:');
    console.log(`   - Open: https://docs.google.com/spreadsheets/d/${process.env.MASTER_INDEX_SHEET_ID || '1xa4E5PcrxRVaMbJfWH_d5LLSqY3RlCf6Ur3rwKtq2jQ'}`);
    console.log(`   - Look for: "${testRecording.payload.object.topic}"`);
    console.log('   - Should be in Master Index with category: TRIVIAL');
    
    console.log('\n3. Check Google Drive:');
    console.log('   - Navigate to Zoom Recordings → Trivial Sessions');
    console.log(`   - Look for folder: "${new Date().toISOString().split('T')[0]}_TRIVIAL_..."`);
    
    console.log('\n⚠️  Common Issues:');
    console.log('   - Missing ZOOM_* credentials → Can\'t fetch access token');
    console.log('   - Missing folder IDs → 404 errors creating folders');
    console.log('   - Wrong service account → Authentication errors');
    console.log('   - Test download URLs → Expected DNS errors for fake URLs');
}

// Run verification
verifyWebhookProcessing().catch(console.error);