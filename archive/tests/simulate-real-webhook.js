#!/usr/bin/env node
/**
 * Simulate webhook events with real recording data
 * This version uses hardcoded real recording data for testing
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Real recording data based on actual Zoom recordings
const REAL_RECORDINGS = [
  {
    name: "Jamie JudahBram's Recording",
    webhook: {
      event: 'recording.completed',
      event_ts: Date.now(),
      payload: {
        account_id: process.env.ZOOM_ACCOUNT_ID || 'test_account',
        object: {
          uuid: 'SsXeFZHsSCe99P1kAbOz5Q==',
          id: '8390038905',
          host_id: 'jamie_host_id',
          host_email: 'jamie@ivymentors.co',
          topic: "Jamie JudahBram's Personal Meeting Room",
          start_time: '2025-07-04T02:00:13Z',
          duration: 4291, // 71.5 minutes
          total_size: 500000000, // 500MB estimate
          recording_count: 3,
          recording_files: [
            {
              id: 'jamie_video_1',
              meeting_id: '8390038905',
              recording_start: '2025-07-04T02:00:13Z',
              recording_end: '2025-07-04T03:11:44Z',
              file_type: 'MP4',
              file_extension: 'MP4',
              file_size: 400000000,
              play_url: 'https://zoom.us/rec/play/jamie_video',
              download_url: 'https://zoom.us/rec/download/jamie_video?access_token=test_token',
              status: 'completed',
              recording_type: 'shared_screen_with_speaker_view',
            },
            {
              id: 'jamie_audio_1',
              meeting_id: '8390038905',
              recording_start: '2025-07-04T02:00:13Z',
              recording_end: '2025-07-04T03:11:44Z',
              file_type: 'M4A',
              file_extension: 'M4A',
              file_size: 50000000,
              play_url: 'https://zoom.us/rec/play/jamie_audio',
              download_url: 'https://zoom.us/rec/download/jamie_audio?access_token=test_token',
              status: 'completed',
              recording_type: 'audio_only',
            },
            {
              id: 'jamie_transcript_1',
              meeting_id: '8390038905',
              recording_start: '2025-07-04T02:00:13Z',
              recording_end: '2025-07-04T03:11:44Z',
              file_type: 'TRANSCRIPT',
              file_extension: 'VTT',
              file_size: 100000,
              play_url: '',
              download_url: 'https://zoom.us/rec/download/jamie_transcript?access_token=test_token',
              status: 'completed',
              recording_type: 'audio_transcript',
            }
          ],
          participant_audio_files: [],
          meeting_type: 2,
          timezone: 'America/Los_Angeles',
          host_name: 'Jamie JudahBram',
          participant_count: 2
        }
      }
    }
  },
  {
    name: "Noor Hiba's Recording",
    webhook: {
      event: 'recording.completed',
      event_ts: Date.now(),
      payload: {
        account_id: process.env.ZOOM_ACCOUNT_ID || 'test_account',
        object: {
          uuid: 'mOjpJueTSx6FAMuHis3GxQ==',
          id: '3242527137',
          host_id: 'noor_host_id',
          host_email: 'noor@ivymentors.co',
          topic: 'Hiba | IvyLevel Week 4',
          start_time: '2025-07-04T23:29:44Z',
          duration: 3886, // 64.8 minutes
          total_size: 450000000, // 450MB estimate
          recording_count: 3,
          recording_files: [
            {
              id: 'noor_video_1',
              meeting_id: '3242527137',
              recording_start: '2025-07-04T23:29:44Z',
              recording_end: '2025-07-05T00:34:30Z',
              file_type: 'MP4',
              file_extension: 'MP4',
              file_size: 350000000,
              play_url: 'https://zoom.us/rec/play/noor_video',
              download_url: 'https://zoom.us/rec/download/noor_video?access_token=test_token',
              status: 'completed',
              recording_type: 'shared_screen_with_speaker_view',
            },
            {
              id: 'noor_audio_1',
              meeting_id: '3242527137',
              recording_start: '2025-07-04T23:29:44Z',
              recording_end: '2025-07-05T00:34:30Z',
              file_type: 'M4A',
              file_extension: 'M4A',
              file_size: 45000000,
              play_url: 'https://zoom.us/rec/play/noor_audio',
              download_url: 'https://zoom.us/rec/download/noor_audio?access_token=test_token',
              status: 'completed',
              recording_type: 'audio_only',
            },
            {
              id: 'noor_transcript_1',
              meeting_id: '3242527137',
              recording_start: '2025-07-04T23:29:44Z',
              recording_end: '2025-07-05T00:34:30Z',
              file_type: 'TRANSCRIPT',
              file_extension: 'VTT',
              file_size: 95000,
              play_url: '',
              download_url: 'https://zoom.us/rec/download/noor_transcript?access_token=test_token',
              status: 'completed',
              recording_type: 'audio_transcript',
            }
          ],
          participant_audio_files: [],
          meeting_type: 2,
          timezone: 'America/Los_Angeles',
          host_name: 'Noor',
          participant_count: 2
        }
      }
    }
  }
];

async function simulateWebhooks() {
  console.log('🚀 Starting real recording webhook simulation\n');

  const webhookUrl = process.env.WEBHOOK_SERVER_URL || 'http://localhost:3001/webhook';
  console.log(`📡 Webhook URL: ${webhookUrl}\n`);

  // Create output directory for logging
  const logDir = path.join(__dirname, 'output', 'webhook-simulation-logs');
  await fs.mkdir(logDir, { recursive: true });

  for (const recording of REAL_RECORDINGS) {
    console.log(`\n📹 Simulating webhook for: ${recording.name}`);
    console.log(`   UUID: ${recording.webhook.payload.object.uuid}`);
    console.log(`   Topic: ${recording.webhook.payload.object.topic}`);
    console.log(`   Duration: ${(recording.webhook.payload.object.duration / 60).toFixed(1)} minutes`);
    console.log(`   Files: ${recording.webhook.payload.object.recording_files.length}`);

    try {
      // Log the webhook payload
      const logFile = path.join(logDir, `webhook-${recording.webhook.payload.object.id}-${Date.now()}.json`);
      await fs.writeFile(logFile, JSON.stringify(recording.webhook, null, 2));
      console.log(`   📝 Logged to: ${logFile}`);

      // Send to webhook endpoint
      console.log('   📤 Sending webhook...');
      const response = await axios.post(webhookUrl, recording.webhook, {
        headers: {
          'Content-Type': 'application/json',
          'x-zm-signature': 'test-signature',
          'x-zm-request-timestamp': Date.now().toString()
        },
        timeout: 30000 // 30 second timeout
      });

      console.log(`   ✅ Webhook sent successfully!`);
      console.log(`   Response status: ${response.status}`);
      
      if (response.data) {
        console.log(`   Response data: ${typeof response.data === 'object' ? JSON.stringify(response.data) : response.data}`);
      }

    } catch (error) {
      console.error(`   ❌ Failed to send webhook: ${error.message}`);
      
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Response: ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        console.error('   No response received from server');
        console.error('   Is the webhook server running?');
      }
    }

    // Wait between webhooks
    console.log('\n⏳ Waiting 3 seconds...');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  console.log('\n✅ Webhook simulation complete!');
  console.log(`📁 Logs saved to: ${logDir}`);
}

// Command line interface
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Real Recording Webhook Simulator
================================

Simulates webhook events for Jamie and Noor's real recordings.

Usage:
  node simulate-real-webhook.js [options]

Options:
  --webhook-url <url>    Webhook server URL (default: http://localhost:3001/webhook)
  --recording <name>     Send specific recording: "jamie" or "noor"
  --delay <seconds>      Delay between webhooks (default: 3)
  --help, -h            Show this help

Environment Variables:
  WEBHOOK_SERVER_URL    Default webhook server URL

Examples:
  # Send to local server
  node simulate-real-webhook.js

  # Send to production
  node simulate-real-webhook.js --webhook-url https://zoom-webhook-v2.onrender.com/webhook

  # Send only Jamie's recording
  node simulate-real-webhook.js --recording jamie
  `);
  process.exit(0);
}

// Parse command line options
const webhookUrlIndex = args.findIndex(arg => arg === '--webhook-url');
if (webhookUrlIndex !== -1 && args[webhookUrlIndex + 1]) {
  process.env.WEBHOOK_SERVER_URL = args[webhookUrlIndex + 1];
}

const recordingIndex = args.findIndex(arg => arg === '--recording');
if (recordingIndex !== -1 && args[recordingIndex + 1]) {
  const recordingName = args[recordingIndex + 1].toLowerCase();
  if (recordingName === 'jamie') {
    REAL_RECORDINGS.splice(1, 1); // Remove Noor's recording
  } else if (recordingName === 'noor') {
    REAL_RECORDINGS.splice(0, 1); // Remove Jamie's recording
  }
}

// Run the simulation
simulateWebhooks().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});