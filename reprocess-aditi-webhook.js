#!/usr/bin/env node
/**
 * Reprocess Aditi's Recording Through Full Webhook Pipeline
 * 
 * This script:
 * 1. Uses the already downloaded files from previous run
 * 2. Creates a proper webhook payload with correct data
 * 3. Sends it to the production webhook endpoint
 * 4. Processes through the complete pipeline
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

async function reprocessAditiWebhook() {
    console.log(`
🔄 Reprocessing Aditi's Recording Through Webhook Pipeline
========================================================
Recording: Aditi B's Personal Meeting Room
UUID: +fUQYcozSiC/ZVx44MH8YA==
Meeting ID: 4919793886
Expected: Coaching_Aditi_Kavya_Wk26 with correct duration
    `);

    // Create webhook payload with correct data from our analysis
    const webhook = {
        event: 'recording.completed',
        event_ts: Date.now(),
        payload: {
            account_id: process.env.ZOOM_ACCOUNT_ID || 'D222nJC2QJiqPoQbV15Kvw',
            object: {
                uuid: '+fUQYcozSiC/ZVx44MH8YA==',
                id: '4919793886',
                host_id: 'aditi_host_id',
                host_email: 'aditi@ivymentors.co',
                topic: "Aditi B's Personal Meeting Room",
                type: 4,
                start_time: '2025-07-06T02:58:55Z',
                duration: 61, // Incorrect duration from Zoom API (will be fixed by our pipeline)
                timezone: 'America/Los_Angeles',
                total_size: 608866024, // Correct total size (581 MB)
                recording_count: 5,
                share_url: 'https://us06web.zoom.us/rec/share/test_aditi_reprocess',
                recording_files: [
                    {
                        id: 'aditi_video_1',
                        meeting_id: '4919793886',
                        recording_start: '2025-07-06T02:58:55Z',
                        recording_end: '2025-07-06T04:00:21Z', // Correct end time for 61 minutes
                        file_type: 'MP4',
                        file_extension: 'MP4',
                        file_size: 279683046, // 266.7 MB
                        play_url: 'https://us06web.zoom.us/rec/play/aditi_video1',
                        download_url: 'https://us06web.zoom.us/rec/download/aditi_video1?access_token=test_token',
                        status: 'completed',
                        recording_type: 'shared_screen_with_speaker_view'
                    },
                    {
                        id: 'aditi_video_2',
                        meeting_id: '4919793886',
                        recording_start: '2025-07-06T02:58:55Z',
                        recording_end: '2025-07-06T04:00:21Z',
                        file_type: 'MP4',
                        file_extension: 'MP4',
                        file_size: 268935478, // 256.5 MB
                        play_url: 'https://us06web.zoom.us/rec/play/aditi_video2',
                        download_url: 'https://us06web.zoom.us/rec/download/aditi_video2?access_token=test_token',
                        status: 'completed',
                        recording_type: 'gallery_view'
                    },
                    {
                        id: 'aditi_audio_1',
                        meeting_id: '4919793886',
                        recording_start: '2025-07-06T02:58:55Z',
                        recording_end: '2025-07-06T04:00:21Z',
                        file_type: 'M4A',
                        file_extension: 'M4A',
                        file_size: 58654160, // 55.9 MB
                        play_url: 'https://us06web.zoom.us/rec/play/aditi_audio',
                        download_url: 'https://us06web.zoom.us/rec/download/aditi_audio?access_token=test_token',
                        status: 'completed',
                        recording_type: 'audio_only'
                    },
                    {
                        id: 'aditi_timeline_1',
                        meeting_id: '4919793886',
                        recording_start: '2025-07-06T02:58:55Z',
                        recording_end: '2025-07-06T04:00:21Z',
                        file_type: 'TIMELINE',
                        file_extension: 'JSON',
                        file_size: 1521334, // 1.5 MB
                        play_url: '',
                        download_url: 'https://us06web.zoom.us/rec/download/aditi_timeline?access_token=test_token',
                        status: 'completed',
                        recording_type: 'timeline'
                    },
                    {
                        id: 'aditi_transcript_1',
                        meeting_id: '4919793886',
                        recording_start: '2025-07-06T02:58:55Z',
                        recording_end: '2025-07-06T04:00:21Z',
                        file_type: 'TRANSCRIPT',
                        file_extension: 'VTT',
                        file_size: 72006, // 70.3 KB
                        play_url: '',
                        download_url: 'https://us06web.zoom.us/rec/download/aditi_transcript?access_token=test_token',
                        status: 'completed',
                        recording_type: 'audio_transcript'
                    }
                ],
                participant_audio_files: [],
                password: '',
                recording_play_passcode: '',
                on_demand: false,
                host_name: 'Aditi Bhaskar',
                participant_count: 2  // Aditi and Kavya
            }
        }
    };

    // Save webhook payload for debugging
    const outputDir = './output/webhook-simulation-logs';
    await fs.mkdir(outputDir, { recursive: true });
    
    const filename = `webhook-aditi-reprocess-${Date.now()}.json`;
    const filepath = path.join(outputDir, filename);
    await fs.writeFile(filepath, JSON.stringify(webhook, null, 2));
    
    console.log(`📝 Webhook payload saved to: ${filepath}`);
    
    // Show what we expect to happen
    console.log(`
📋 Expected Processing Results:
   ✅ Duration fix: 61s → 3686s (61 minutes)
   ✅ Participants extracted: Aditi (coach), Kavya (student)
   ✅ Category: Coaching (not TRIVIAL)
   ✅ Week inference: Week 26
   ✅ Standardized name: Coaching_Aditi_Kavya_Wk26_2025-07-06
   ✅ Google Drive: Dual path organization
   ✅ Google Sheets: Both tabs updated
    `);
    
    // Send to render.com webhook endpoint
    const renderWebhookUrl = 'https://zoom-webhook-v2.onrender.com/webhook-test';
    
    try {
        console.log(`📡 Sending webhook to: ${renderWebhookUrl}`);
        
        const response = await axios.post(renderWebhookUrl, webhook, {
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Event': webhook.event,
                'X-Webhook-Timestamp': webhook.event_ts.toString()
            }
        });
        
        console.log(`\n✅ Webhook sent successfully!`);
        console.log(`📊 Response Status: ${response.status} ${response.statusText}`);
        console.log(`📄 Response Data:`, response.data);
        
        console.log(`
🔍 Next Steps:
1. Check render.com logs: https://dashboard.render.com/web/srv-csu80m2j1k6c73d0aihg/logs
2. Verify Google Sheets updates
3. Check Google Drive for proper organization
4. Confirm all fixes are working in production
        `);
        
    } catch (error) {
        console.error(`\n❌ Failed to send webhook:`, error.message);
        if (error.response) {
            console.error(`📊 Response Status: ${error.response.status} ${error.response.statusText}`);
            console.error(`📄 Response Data:`, error.response.data);
        }
        
        // Option to process locally instead
        console.log(`
💡 Alternative: Run local processing with downloaded files
   node download-and-reprocess-zoom-recording.js +fUQYcozSiC/ZVx44MH8YA== --skip-download
        `);
    }
}

// Run the webhook simulation
reprocessAditiWebhook().catch(console.error);