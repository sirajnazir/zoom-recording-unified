#!/usr/bin/env node
/**
 * Lightweight webhook simulation - excludes large video files
 * Sends only transcript, chat, and metadata for faster processing
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const LIGHTWEIGHT_RECORDINGS = [
  {
    name: "Jamie JudahBram's Recording (Lightweight)",
    webhook: {
      event: 'recording.completed',
      event_ts: Date.now(),
      payload: {
        account_id: process.env.ZOOM_ACCOUNT_ID || 'D222nJC2QJiqPoQbV15Kvw',
        object: {
          uuid: 'SsXeFZHsSCe99P1kAbOz5Q==',
          id: '8390038905',
          host_id: '1LBQMEuwRUimDfPDCrgEFQ',
          host_email: 'jamie@ivymentors.co',
          topic: "Jamie JudahBram's Personal Meeting Room",
          type: 4,
          start_time: '2025-07-04T02:00:13Z',
          duration: 4291, // Keep original duration in seconds
          timezone: 'America/Los_Angeles',
          total_size: 92219, // Only transcript + chat size
          recording_count: 2,
          share_url: 'https://us06web.zoom.us/rec/share/3-C_pp2YNa4Y6Q0x2_G5ik90BeI2oAJOiC2wdCmVNYM7Nj-_In0rCS_rkzn5ird0.avXq26T7byq4VhOW',
          recording_files: [
            {
              id: 'daf0764e-e02f-40d8-8cc4-c7c727f535f2',
              meeting_id: 'SsXeFZHsSCe99P1kAbOz5Q==',
              recording_start: '2025-07-04T02:00:13Z',
              recording_end: '2025-07-04T03:11:44Z',
              file_type: 'TRANSCRIPT',
              file_extension: 'VTT',
              file_size: 90309,
              play_url: 'https://us06web.zoom.us/rec/play/cypctpbndXCmJqZahl3q1sScGtgdubwFLFToz6XDi9MG_GEZwHKaiGqJTCSC7809rApoEKZ2zFg3dX7V.WeJ-VtJwJBnhxrnB',
              download_url: 'https://us06web.zoom.us/rec/download/cypctpbndXCmJqZahl3q1sScGtgdubwFLFToz6XDi9MG_GEZwHKaiGqJTCSC7809rApoEKZ2zFg3dX7V.WeJ-VtJwJBnhxrnB',
              status: 'completed',
              recording_type: 'audio_transcript'
            },
            {
              id: '1ce2e1f6-89d3-4cf7-a4e5-bc892ad96db9',
              meeting_id: 'SsXeFZHsSCe99P1kAbOz5Q==',
              recording_start: '2025-07-04T02:00:13Z',
              recording_end: '2025-07-04T03:11:44Z',
              file_type: 'CHAT',
              file_extension: 'TXT',
              file_size: 1910,
              play_url: 'https://us06web.zoom.us/rec/play/vSsQoP--YwzPOgQNAguBN6nJnQj0dO7UJKLjnZZeq7wpCMRgRGP7fnAuKXOFXUYyGjz51A_VNaYcU-dJ.bCqBSM-fq5U-mzOk',
              download_url: 'https://us06web.zoom.us/rec/download/vSsQoP--YwzPOgQNAguBN6nJnQj0dO7UJKLjnZZeq7wpCMRgRGP7fnAuKXOFXUYyGjz51A_VNaYcU-dJ.bCqBSM-fq5U-mzOk',
              status: 'completed',
              recording_type: 'chat_file'
            }
          ],
          participant_audio_files: [],
          password: '',
          recording_play_passcode: '',
          on_demand: false
        }
      }
    }
  },
  {
    name: "Noor Hiba's Recording (Lightweight)",
    webhook: {
      event: 'recording.completed',
      event_ts: Date.now(),
      payload: {
        account_id: process.env.ZOOM_ACCOUNT_ID || 'D222nJC2QJiqPoQbV15Kvw',
        object: {
          uuid: 'mOjpJueTSx6FAMuHis3GxQ==',
          id: '3242527137',
          host_id: 'j5WdbsYcRRKOcMRHlPyKjA',
          host_email: 'noor@ivymentors.co',
          topic: 'Hiba | IvyLevel Week 4',
          type: 4,
          start_time: '2025-07-04T23:29:44Z',
          duration: 3886, // Keep original duration in seconds
          timezone: 'America/Los_Angeles',
          total_size: 90706, // Only transcript size
          recording_count: 1,
          share_url: 'https://us06web.zoom.us/rec/share/3mjdoA-4FGgpHXJjwgO3Ldu8Zs9MUTsJuuiuT-8MKJ8pMOwQCOVMR54J_lJYVwWH.bNxtxoD1vP1g3Hxv',
          recording_files: [
            {
              id: '5bb6b079-cf48-4cc0-829e-c12fe2e6f5db',
              meeting_id: 'mOjpJueTSx6FAMuHis3GxQ==',
              recording_start: '2025-07-04T23:29:44Z',
              recording_end: '2025-07-05T00:34:30Z',
              file_type: 'TRANSCRIPT',
              file_extension: 'VTT',
              file_size: 90706,
              play_url: 'https://us06web.zoom.us/rec/play/SQjG1RMrLQRa4_Ny0sIE_HJZJkiMKN4dTHOFP0VKW-l41ypNfP4uCxsO42hcdCYnM4lGUiD1p9K_fxvN.oQBEoS3Y0fkEO3gY',
              download_url: 'https://us06web.zoom.us/rec/download/SQjG1RMrLQRa4_Ny0sIE_HJZJkiMKN4dTHOFP0VKW-l41ypNfP4uCxsO42hcdCYnM4lGUiD1p9K_fxvN.oQBEoS3Y0fkEO3gY',
              status: 'completed',
              recording_type: 'audio_transcript'
            }
          ],
          participant_audio_files: [],
          password: '',
          recording_play_passcode: '',
          on_demand: false
        }
      }
    }
  }
];

async function sendWebhook(webhookUrl, payload) {
  try {
    const response = await axios.post(webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-zm-signature': 'test-signature',
        'x-zm-request-timestamp': Date.now().toString()
      },
      timeout: 120000 // 2 minute timeout
    });
    return { success: true, status: response.status, data: response.data };
  } catch (error) {
    return { 
      success: false, 
      error: error.message, 
      status: error.response?.status,
      data: error.response?.data 
    };
  }
}

async function main() {
  console.log('🚀 Lightweight Webhook Simulator\n');
  console.log('📝 This version sends only transcript and chat files to avoid timeouts\n');

  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log(`
Lightweight Webhook Simulator
=============================

Sends webhook events with only small files (transcript, chat) for faster processing.

Usage:
  node simulate-webhook-lightweight.js [options]

Options:
  --webhook-url <url>    Webhook URL (default: http://localhost:3001/webhook-test)
  --recording <name>     Send specific recording: "jamie" or "noor"
  --production          Use production webhook endpoint (with signature validation)
  --help                Show this help

Examples:
  # Send to local test endpoint
  node simulate-webhook-lightweight.js

  # Send to production test endpoint
  node simulate-webhook-lightweight.js --webhook-url https://zoom-webhook-v2.onrender.com/webhook-test
    `);
    process.exit(0);
  }

  // Parse webhook URL
  let webhookUrl = 'http://localhost:3001/webhook-test';
  const urlIndex = args.findIndex(arg => arg === '--webhook-url');
  if (urlIndex !== -1 && args[urlIndex + 1]) {
    webhookUrl = args[urlIndex + 1];
  } else if (args.includes('--production')) {
    webhookUrl = 'https://zoom-webhook-v2.onrender.com/webhook-test';
  }

  // Filter recordings
  let recordings = [...LIGHTWEIGHT_RECORDINGS];
  const recordingIndex = args.findIndex(arg => arg === '--recording');
  if (recordingIndex !== -1 && args[recordingIndex + 1]) {
    const name = args[recordingIndex + 1].toLowerCase();
    recordings = recordings.filter(r => r.name.toLowerCase().includes(name));
  }

  console.log(`📡 Webhook URL: ${webhookUrl}`);
  console.log(`📦 Recordings: ${recordings.length}\n`);

  // Create log directory
  const logDir = path.join(__dirname, 'output', 'webhook-simulation-logs');
  await fs.mkdir(logDir, { recursive: true });

  // Process each recording
  for (const recording of recordings) {
    console.log(`\n📹 Sending: ${recording.name}`);
    console.log(`   UUID: ${recording.webhook.payload.object.uuid}`);
    console.log(`   Files: ${recording.webhook.payload.object.recording_files.length}`);
    console.log(`   Total Size: ${(recording.webhook.payload.object.total_size / 1024).toFixed(1)} KB`);

    // Log the payload
    const logFile = path.join(logDir, `lightweight-${recording.webhook.payload.object.id}-${Date.now()}.json`);
    await fs.writeFile(logFile, JSON.stringify(recording.webhook, null, 2));
    console.log(`   📝 Logged to: ${logFile}`);

    // Send webhook
    console.log('   📤 Sending webhook...');
    const startTime = Date.now();
    const result = await sendWebhook(webhookUrl, recording.webhook);
    const duration = Date.now() - startTime;

    if (result.success) {
      console.log(`   ✅ Success! (${duration}ms)`);
      console.log(`   Status: ${result.status}`);
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
      if (result.status) {
        console.log(`   Status: ${result.status}`);
      }
    }

    // Wait between recordings
    if (recordings.indexOf(recording) < recordings.length - 1) {
      console.log('\n⏳ Waiting 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  console.log('\n✅ Simulation complete!');
  console.log(`📁 Logs saved to: ${logDir}`);
}

// Run the simulator
main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});