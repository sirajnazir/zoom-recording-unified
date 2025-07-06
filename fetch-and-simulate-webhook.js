#!/usr/bin/env node
/**
 * Fetch real recordings from Zoom and simulate webhook events
 * This script fetches Jamie and Noor's actual recordings and sends them to the webhook server
 */

require('dotenv').config();
const axios = require('axios');
const { ZoomService } = require('./src/infrastructure/services/ZoomService');

// Recording details from test-webhook-recordings.js
const TARGET_RECORDINGS = [
  {
    name: "Jamie JudahBram's Recording",
    uuid: 'SsXeFZHsSCe99P1kAbOz5Q==',
    id: '8390038905',
    meeting_id: '8390038905',
    topic: "Jamie JudahBram's Personal Meeting Room",
    start_time: '2025-07-04T02:00:13Z',
    duration: 4291,
    host_email: 'jamie@ivymentors.co',
    host_name: 'Jamie'
  },
  {
    name: "Noor Hiba's Recording",
    uuid: 'mOjpJueTSx6FAMuHis3GxQ==',
    id: '3242527137',
    meeting_id: '3242527137',
    topic: 'Hiba | IvyLevel Week 4',
    start_time: '2025-07-04T23:29:44Z',
    duration: 3886,
    host_email: 'noor@ivymentors.co',
    host_name: 'Noor'
  }
];

async function fetchAndSimulateWebhooks() {
  console.log('🚀 Starting real recording fetch and webhook simulation\n');

  // Initialize Zoom service
  const config = {
    zoom: {
      accountId: process.env.ZOOM_ACCOUNT_ID,
      clientId: process.env.ZOOM_CLIENT_ID,
      clientSecret: process.env.ZOOM_CLIENT_SECRET
    }
  };

  const logger = {
    info: (...args) => console.log('[INFO]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args),
    debug: (...args) => console.log('[DEBUG]', ...args)
  };

  const zoomService = new ZoomService(config, logger);

  // Process each recording
  for (const targetRecording of TARGET_RECORDINGS) {
    console.log(`\n📹 Processing: ${targetRecording.name}`);
    console.log(`   UUID: ${targetRecording.uuid}`);
    console.log(`   ID: ${targetRecording.id}`);
    
    try {
      // Fetch the full recording details from Zoom
      console.log('\n1️⃣ Fetching recording details from Zoom...');
      const recordingDetails = await zoomService.getRecording(targetRecording.uuid);
      
      if (!recordingDetails) {
        console.error(`❌ Could not fetch recording details for ${targetRecording.name}`);
        continue;
      }

      console.log('✅ Recording fetched successfully');
      console.log(`   Files: ${recordingDetails.recording_files?.length || 0}`);
      console.log(`   Topic: ${recordingDetails.topic}`);
      console.log(`   Duration: ${recordingDetails.duration} seconds`);

      // Transform to webhook format
      console.log('\n2️⃣ Transforming to webhook format...');
      const webhookPayload = {
        event: 'recording.completed',
        event_ts: Date.now(),
        payload: {
          account_id: process.env.ZOOM_ACCOUNT_ID,
          object: {
            uuid: recordingDetails.uuid,
            id: recordingDetails.id || targetRecording.id,
            host_id: recordingDetails.host_id,
            host_email: recordingDetails.host_email || targetRecording.host_email,
            topic: recordingDetails.topic,
            start_time: recordingDetails.start_time,
            duration: recordingDetails.duration,
            total_size: recordingDetails.total_size || 0,
            recording_count: recordingDetails.recording_count || recordingDetails.recording_files?.length || 0,
            recording_files: recordingDetails.recording_files || [],
            participant_audio_files: recordingDetails.participant_audio_files || [],
            // Additional metadata
            meeting_type: recordingDetails.type,
            timezone: recordingDetails.timezone,
            host_name: targetRecording.host_name,
            participant_count: recordingDetails.participant_count || 2
          }
        }
      };

      console.log('✅ Webhook payload created');
      console.log(`   Recording files: ${webhookPayload.payload.object.recording_files.length}`);

      // Send to webhook endpoint
      console.log('\n3️⃣ Sending to webhook server...');
      const webhookUrl = process.env.WEBHOOK_SERVER_URL || 'http://localhost:3001/webhook';
      
      try {
        const response = await axios.post(webhookUrl, webhookPayload, {
          headers: {
            'Content-Type': 'application/json',
            'x-zm-signature': 'test-signature', // Test signature
            'x-zm-request-timestamp': Date.now().toString()
          }
        });

        console.log('✅ Webhook sent successfully');
        console.log(`   Status: ${response.status}`);
        console.log(`   Response: ${response.data}`);
      } catch (webhookError) {
        console.error('❌ Failed to send webhook:', webhookError.message);
        if (webhookError.response) {
          console.error(`   Status: ${webhookError.response.status}`);
          console.error(`   Data: ${JSON.stringify(webhookError.response.data)}`);
        }
      }

      // Wait a bit between recordings
      console.log('\n⏳ Waiting 5 seconds before next recording...');
      await new Promise(resolve => setTimeout(resolve, 5000));

    } catch (error) {
      console.error(`❌ Error processing ${targetRecording.name}:`, error.message);
      if (error.stack) {
        console.error(error.stack);
      }
    }
  }

  console.log('\n✅ All recordings processed!');
}

// Command line options
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Fetch and Simulate Webhook Script
=================================

This script fetches real recordings from Zoom and simulates webhook events.

Usage:
  node fetch-and-simulate-webhook.js [options]

Options:
  --webhook-url <url>   Webhook server URL (default: http://localhost:3001/webhook)
  --help, -h           Show this help message

Environment Variables:
  ZOOM_ACCOUNT_ID      Zoom account ID
  ZOOM_CLIENT_ID       Zoom OAuth client ID  
  ZOOM_CLIENT_SECRET   Zoom OAuth client secret
  WEBHOOK_SERVER_URL   Webhook server URL (optional)

Examples:
  # Use local webhook server
  node fetch-and-simulate-webhook.js

  # Use custom webhook URL
  node fetch-and-simulate-webhook.js --webhook-url https://zoom-webhook-v2.onrender.com/webhook
  `);
  process.exit(0);
}

// Parse webhook URL from args if provided
const webhookUrlIndex = args.findIndex(arg => arg === '--webhook-url');
if (webhookUrlIndex !== -1 && args[webhookUrlIndex + 1]) {
  process.env.WEBHOOK_SERVER_URL = args[webhookUrlIndex + 1];
  console.log(`📡 Using webhook URL: ${process.env.WEBHOOK_SERVER_URL}`);
}

// Run the script
fetchAndSimulateWebhooks().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});