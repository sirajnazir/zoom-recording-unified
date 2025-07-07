/**
 * Comprehensive webhook test with detailed logging
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

async function testComprehensiveWebhook() {
    console.log('🚀 Comprehensive Webhook Test\n');
    console.log(`📡 Webhook URL: ${WEBHOOK_URL}`);
    console.log('=' .repeat(60));
    
    // Test 1: Health Check
    console.log('\n1️⃣ Testing Server Health...');
    try {
        const healthResponse = await axios.get(WEBHOOK_URL);
        console.log('✅ Server Status:', healthResponse.data);
    } catch (error) {
        console.log('❌ Health check failed:', error.message);
    }
    
    // Test 2: Invalid webhook (should fail auth)
    console.log('\n2️⃣ Testing Webhook Authentication...');
    try {
        const invalidResponse = await axios.post(
            `${WEBHOOK_URL}/webhook`,
            { event: 'test' },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-zm-signature': 'invalid',
                    'x-zm-request-timestamp': Date.now().toString()
                },
                validateStatus: () => true
            }
        );
        console.log(`⚠️  Invalid signature response: ${invalidResponse.status} (Expected 401)`);
    } catch (error) {
        console.log('✅ Correctly rejected invalid signature');
    }
    
    // Test 3: Valid webhook with TRIVIAL recording
    console.log('\n3️⃣ Testing TRIVIAL Recording Processing...');
    const trivialRecording = {
        event: "recording.completed",
        event_ts: Date.now(),
        payload: {
            account_id: "D222nJC2QJiqPoQbV15Kvw",
            object: {
                uuid: `test_trivial_${Date.now()}`,
                id: `83579417389`,
                topic: "Jenny Duan's Zoom Meeting - Test",
                start_time: new Date().toISOString(),
                duration: 15, // 15 seconds = TRIVIAL
                total_size: 500000, // 0.5MB = TRIVIAL
                recording_count: 1,
                host_email: "jennyduan@ivymentors.co",
                host_name: "Jenny Duan",
                recording_files: [
                    {
                        id: "trivial_file_001",
                        meeting_id: "83579417389",
                        recording_start: new Date().toISOString(),
                        recording_end: new Date(Date.now() + 15000).toISOString(),
                        file_type: "MP4",
                        file_size: 500000,
                        play_url: "https://zoom.us/rec/play/trivial-test",
                        download_url: "https://zoom.us/rec/download/trivial-test",
                        status: "completed",
                        recording_type: "shared_screen_with_speaker_view"
                    }
                ]
            }
        }
    };
    
    try {
        const timestamp = Date.now().toString();
        const signature = generateSignature(trivialRecording, timestamp, WEBHOOK_SECRET);
        
        console.log('📤 Sending TRIVIAL recording webhook...');
        console.log(`   Duration: ${trivialRecording.payload.object.duration} seconds`);
        console.log(`   File size: ${trivialRecording.payload.object.total_size} bytes`);
        console.log(`   Expected category: TRIVIAL`);
        
        const response = await axios.post(
            `${WEBHOOK_URL}/webhook`,
            trivialRecording,
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
    
    // Test 4: Valid webhook with COACHING recording
    console.log('\n4️⃣ Testing COACHING Recording Processing...');
    const coachingRecording = {
        event: "recording.completed",
        event_ts: Date.now(),
        payload: {
            account_id: "D222nJC2QJiqPoQbV15Kvw",
            object: {
                uuid: `test_coaching_${Date.now()}`,
                id: `83579417390`,
                topic: "Rishi's Personal Meeting Room",
                start_time: new Date().toISOString(),
                duration: 3600, // 60 minutes = COACHING
                total_size: 150000000, // 150MB = COACHING
                recording_count: 1,
                host_email: "rishi@ivymentors.co",
                host_name: "Rishi",
                recording_files: [
                    {
                        id: "coaching_file_001",
                        meeting_id: "83579417390",
                        recording_start: new Date().toISOString(),
                        recording_end: new Date(Date.now() + 3600000).toISOString(),
                        file_type: "MP4",
                        file_size: 150000000,
                        play_url: "https://zoom.us/rec/play/coaching-test",
                        download_url: "https://zoom.us/rec/download/coaching-test",
                        status: "completed",
                        recording_type: "shared_screen_with_speaker_view"
                    }
                ]
            }
        }
    };
    
    try {
        const timestamp = Date.now().toString();
        const signature = generateSignature(coachingRecording, timestamp, WEBHOOK_SECRET);
        
        console.log('📤 Sending COACHING recording webhook...');
        console.log(`   Duration: ${coachingRecording.payload.object.duration} seconds (${Math.round(coachingRecording.payload.object.duration/60)} minutes)`);
        console.log(`   File size: ${coachingRecording.payload.object.total_size} bytes (${Math.round(coachingRecording.payload.object.total_size/1024/1024)} MB)`);
        console.log(`   Expected category: COACHING`);
        
        const response = await axios.post(
            `${WEBHOOK_URL}/webhook`,
            coachingRecording,
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
    console.log('\n📊 Next Steps:');
    console.log('1. Check Render logs at https://dashboard.render.com');
    console.log('2. Look for processing messages for both recordings');
    console.log('3. Verify Google Sheets entries');
    console.log('4. Check Google Drive folders (Trivial Sessions & Coaching Sessions)');
    console.log('\n📝 Expected Results:');
    console.log('- Jenny Duan recording → TRIVIAL category → Trivial Sessions folder');
    console.log('- Rishi recording → COACHING category → Coaches/Rishi folder');
}

// Run test
testComprehensiveWebhook().catch(console.error);