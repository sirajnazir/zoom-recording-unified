#!/usr/bin/env node
/**
 * Webhook simulation for Aditi's recording
 * Tests TRIVIAL categorization (short duration, unknown student)
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

async function simulateAditiWebhook() {
  const webhook = {
    event: 'recording.completed',
    event_ts: Date.now(),
    payload: {
      account_id: process.env.ZOOM_ACCOUNT_ID || 'D222nJC2QJiqPoQbV15Kvw',
      object: {
        uuid: 'pP9T6kSQTjSLiMnQT9h7dA==',
        id: '4762651206',
        host_id: 'aditi_host_id',
        host_email: 'aditi@ivymentors.co',
        topic: "Aditi Bhaskar's Personal Meeting Room",
        type: 4,
        start_time: '2025-07-05T23:48:16Z',
        duration: 658, // INCORRECT from Zoom API - actual is 1+ hour based on file sizes
        timezone: 'America/Los_Angeles',
        total_size: 329932800, // 314.6MB total (256MB + 56MB + 70KB)
        recording_count: 3,
        share_url: 'https://us06web.zoom.us/rec/share/test_aditi',
        recording_files: [
          {
            id: 'aditi_video_1',
            meeting_id: '4762651206',
            recording_start: '2025-07-05T23:48:16Z',
            recording_end: '2025-07-06T01:00:00Z', // Corrected to show ~1hr 12min recording
            file_type: 'MP4',
            file_extension: 'MP4',
            file_size: 268435456, // 256MB video (actual from Zoom Cloud)
            play_url: 'https://us06web.zoom.us/rec/play/aditi_video',
            download_url: 'https://us06web.zoom.us/rec/download/aditi_video?access_token=test_token',
            status: 'completed',
            recording_type: 'shared_screen_with_gallery_view'
          },
          {
            id: 'aditi_audio_1',
            meeting_id: '4762651206',
            recording_start: '2025-07-05T23:48:16Z',
            recording_end: '2025-07-06T01:00:00Z', // Corrected to show ~1hr 12min recording
            file_type: 'M4A',
            file_extension: 'M4A',
            file_size: 58720256, // 56MB audio (actual from Zoom Cloud)
            play_url: 'https://us06web.zoom.us/rec/play/aditi_audio',
            download_url: 'https://us06web.zoom.us/rec/download/aditi_audio?access_token=test_token',
            status: 'completed',
            recording_type: 'audio_only'
          },
          {
            id: 'aditi_transcript_1',
            meeting_id: '4762651206',
            recording_start: '2025-07-05T23:48:16Z',
            recording_end: '2025-07-06T01:00:00Z', // Corrected to show ~1hr 12min recording
            file_type: 'TRANSCRIPT',
            file_extension: 'VTT',
            file_size: 71680, // 70KB transcript (actual from Zoom Cloud)
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
        participant_count: 1  // Only one participant
      }
    }
  };

  // Store webhook data for debugging
  const outputDir = './output/webhook-simulation-logs';
  await fs.mkdir(outputDir, { recursive: true });
  
  const filename = `webhook-${webhook.payload.object.id}-${Date.now()}.json`;
  const filepath = path.join(outputDir, filename);
  await fs.writeFile(filepath, JSON.stringify(webhook, null, 2));
  
  console.log(`📝 Webhook data saved to: ${filepath}`);
  
  // Send to render.com webhook endpoint
  const renderWebhookUrl = 'https://zoom-webhook-v2.onrender.com/webhook-test';
  
  try {
    console.log(`\n📡 Sending webhook to: ${renderWebhookUrl}`);
    console.log(`📋 Recording Details:`);
    console.log(`   Topic: ${webhook.payload.object.topic}`);
    console.log(`   Duration (from API): ${webhook.payload.object.duration} seconds (${(webhook.payload.object.duration/60).toFixed(1)} minutes) - INCORRECT`);
    console.log(`   Actual Duration: ~4304 seconds (~72 minutes) based on file timestamps`);
    console.log(`   File Size: ${webhook.payload.object.total_size} bytes (${(webhook.payload.object.total_size/1024/1024).toFixed(1)} MB)`);
    console.log(`   Participants: ${webhook.payload.object.participant_count}`);
    console.log(`   Expected Category: MISC (1+ hour recording, coach only, no student identified)`);
    
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
  } catch (error) {
    console.error(`\n❌ Failed to send webhook:`, error.message);
    if (error.response) {
      console.error(`📊 Response Status: ${error.response.status} ${error.response.statusText}`);
      console.error(`📄 Response Data:`, error.response.data);
    }
  }
  
  console.log(`\n💡 Check the render.com logs to see how this recording is processed`);
  console.log(`🔗 https://dashboard.render.com/web/srv-csu80m2j1k6c73d0aihg/logs`);
}

// Run the simulation
simulateAditiWebhook().catch(console.error);