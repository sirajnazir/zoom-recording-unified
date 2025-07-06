#!/usr/bin/env node
/**
 * Fetch real recordings from Zoom API and simulate webhook events
 * This script fetches actual recording data and creates accurate webhook payloads
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Target recordings based on the data provided
const TARGET_RECORDINGS = [
  {
    name: "Jamie JudahBram's Recording",
    uuid: 'SsXeFZHsSCe99P1kAbOz5Q==',
    meetingId: '8390038905',
    hostEmail: 'jamie@ivymentors.co'
  },
  {
    name: "Noor Hiba's Recording", 
    uuid: 'mOjpJueTSx6FAMuHis3GxQ==',
    meetingId: '3242527137',
    hostEmail: 'noor@ivymentors.co'
  }
];

class ZoomWebhookSimulator {
  constructor() {
    this.ZOOM_API_URL = 'https://api.zoom.us/v2';
    this.accountId = process.env.ZOOM_ACCOUNT_ID;
    this.clientId = process.env.ZOOM_CLIENT_ID;
    this.clientSecret = process.env.ZOOM_CLIENT_SECRET;
    this.token = null;
    this.tokenExpiry = null;
  }

  async getZoomToken() {
    if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.token;
    }

    try {
      const response = await axios.post('https://zoom.us/oauth/token', null, {
        params: {
          grant_type: 'account_credentials',
          account_id: this.accountId
        },
        auth: {
          username: this.clientId,
          password: this.clientSecret
        }
      });

      this.token = response.data.access_token;
      this.tokenExpiry = new Date(Date.now() + (response.data.expires_in - 60) * 1000);
      console.log('✅ Zoom token obtained successfully');
      return this.token;
    } catch (error) {
      console.error('❌ Failed to get Zoom token:', error.message);
      throw error;
    }
  }

  async getRecording(meetingId) {
    try {
      const token = await this.getZoomToken();
      const response = await axios.get(`${this.ZOOM_API_URL}/meetings/${meetingId}/recordings`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`⚠️ Recording not found for meeting ${meetingId}`);
        return null;
      }
      throw error;
    }
  }

  transformToWebhookPayload(recording, targetInfo) {
    // Create webhook payload matching Zoom's format
    const payload = {
      event: 'recording.completed',
      event_ts: Date.now(),
      payload: {
        account_id: this.accountId,
        object: {
          uuid: recording.uuid || targetInfo.uuid,
          id: recording.id || targetInfo.meetingId,
          host_id: recording.host_id || recording.host_user_id,
          host_email: recording.host_email || targetInfo.hostEmail,
          topic: recording.topic,
          type: recording.type || 2,
          start_time: recording.start_time,
          duration: recording.duration,
          timezone: recording.timezone || 'America/Los_Angeles',
          total_size: recording.total_size || 0,
          recording_count: recording.recording_count || recording.recording_files?.length || 0,
          share_url: recording.share_url || '',
          recording_files: recording.recording_files || [],
          password: recording.password || '',
          participant_audio_files: recording.participant_audio_files || [],
          download_access_token: recording.download_access_token || '',
          on_demand: recording.on_demand || false,
          recording_play_passcode: recording.recording_play_passcode || ''
        }
      }
    };

    // Ensure all recording files have proper structure
    if (payload.payload.object.recording_files.length > 0) {
      payload.payload.object.recording_files = payload.payload.object.recording_files.map(file => ({
        id: file.id,
        meeting_id: file.meeting_id || targetInfo.meetingId,
        recording_start: file.recording_start,
        recording_end: file.recording_end,
        file_type: file.file_type,
        file_extension: file.file_extension || file.file_type,
        file_size: file.file_size || 0,
        play_url: file.play_url || '',
        download_url: file.download_url || '',
        status: file.status || 'completed',
        recording_type: file.recording_type || 'shared_screen_with_speaker_view',
        participant_email: file.participant_email || '',
        participant_join_time: file.participant_join_time || '',
        participant_leave_time: file.participant_leave_time || ''
      }));
    }

    return payload;
  }

  async simulateWebhook(webhookUrl, payload) {
    try {
      const response = await axios.post(webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'x-zm-signature': 'test-signature',
          'x-zm-request-timestamp': Date.now().toString()
        },
        timeout: 30000
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

  async processRecording(targetRecording, webhookUrl) {
    console.log(`\n📹 Processing: ${targetRecording.name}`);
    console.log(`   UUID: ${targetRecording.uuid}`);
    console.log(`   Meeting ID: ${targetRecording.meetingId}`);

    try {
      // Fetch recording from Zoom API
      console.log('\n1️⃣ Fetching recording from Zoom API...');
      const recording = await this.getRecording(targetRecording.meetingId);

      if (!recording) {
        console.log('❌ Recording not found in Zoom');
        
        // Create a simulated recording with realistic data
        console.log('📝 Creating simulated recording data...');
        return this.createSimulatedRecording(targetRecording, webhookUrl);
      }

      console.log('✅ Recording fetched successfully');
      console.log(`   Topic: ${recording.topic}`);
      console.log(`   Duration: ${recording.duration} seconds (${(recording.duration/60).toFixed(1)} minutes)`);
      console.log(`   Files: ${recording.recording_files?.length || 0}`);
      
      // List all files
      if (recording.recording_files?.length > 0) {
        console.log('   Recording files:');
        recording.recording_files.forEach(file => {
          console.log(`     - ${file.file_type} (${(file.file_size/1024/1024).toFixed(1)} MB)`);
        });
      }

      // Transform to webhook payload
      console.log('\n2️⃣ Creating webhook payload...');
      const webhookPayload = this.transformToWebhookPayload(recording, targetRecording);

      // Log payload
      const logDir = path.join(__dirname, 'output', 'webhook-simulation-logs');
      await fs.mkdir(logDir, { recursive: true });
      const logFile = path.join(logDir, `webhook-${targetRecording.meetingId}-${Date.now()}.json`);
      await fs.writeFile(logFile, JSON.stringify(webhookPayload, null, 2));
      console.log(`   📝 Logged to: ${logFile}`);

      // Send webhook
      console.log('\n3️⃣ Sending webhook...');
      const result = await this.simulateWebhook(webhookUrl, webhookPayload);
      
      if (result.success) {
        console.log(`   ✅ Webhook sent successfully!`);
        console.log(`   Status: ${result.status}`);
      } else {
        console.log(`   ❌ Webhook failed: ${result.error}`);
        if (result.status) {
          console.log(`   Status: ${result.status}`);
        }
      }

      return result;

    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async createSimulatedRecording(targetRecording, webhookUrl) {
    console.log('📝 Using realistic simulated data...');
    
    // Create realistic recording data based on the target
    const isJamie = targetRecording.hostEmail.includes('jamie');
    const simulatedData = {
      uuid: targetRecording.uuid,
      id: targetRecording.meetingId,
      host_id: isJamie ? 'jamie_host_id' : 'noor_host_id',
      host_email: targetRecording.hostEmail,
      topic: isJamie ? "Jamie JudahBram's Personal Meeting Room" : "Hiba | IvyLevel Week 4",
      type: 2,
      start_time: isJamie ? '2025-07-04T02:00:13Z' : '2025-07-04T23:29:44Z',
      duration: isJamie ? 4291 : 3886,
      timezone: 'America/Los_Angeles',
      total_size: isJamie ? 485000000 : 445000000,
      recording_count: 4,
      share_url: `https://zoom.us/rec/share/${targetRecording.uuid}`,
      recording_files: [
        {
          id: `${targetRecording.meetingId}_video`,
          meeting_id: targetRecording.meetingId,
          recording_start: isJamie ? '2025-07-04T02:00:13Z' : '2025-07-04T23:29:44Z',
          recording_end: isJamie ? '2025-07-04T03:11:44Z' : '2025-07-05T00:34:30Z',
          file_type: 'MP4',
          file_extension: 'MP4',
          file_size: isJamie ? 380000000 : 350000000,
          play_url: `https://zoom.us/rec/play/${targetRecording.uuid}`,
          download_url: `https://zoom.us/rec/download/${targetRecording.uuid}?access_token=eyJhbGciOiJIUzI1NiJ9.test`,
          status: 'completed',
          recording_type: 'shared_screen_with_speaker_view'
        },
        {
          id: `${targetRecording.meetingId}_audio`,
          meeting_id: targetRecording.meetingId,
          recording_start: isJamie ? '2025-07-04T02:00:13Z' : '2025-07-04T23:29:44Z',
          recording_end: isJamie ? '2025-07-04T03:11:44Z' : '2025-07-05T00:34:30Z',
          file_type: 'M4A',
          file_extension: 'M4A',
          file_size: isJamie ? 48000000 : 45000000,
          play_url: `https://zoom.us/rec/play/${targetRecording.uuid}_audio`,
          download_url: `https://zoom.us/rec/download/${targetRecording.uuid}_audio?access_token=eyJhbGciOiJIUzI1NiJ9.test`,
          status: 'completed',
          recording_type: 'audio_only'
        },
        {
          id: `${targetRecording.meetingId}_transcript`,
          meeting_id: targetRecording.meetingId,
          recording_start: isJamie ? '2025-07-04T02:00:13Z' : '2025-07-04T23:29:44Z',
          recording_end: isJamie ? '2025-07-04T03:11:44Z' : '2025-07-05T00:34:30Z',
          file_type: 'TRANSCRIPT',
          file_extension: 'VTT',
          file_size: isJamie ? 98000 : 95000,
          play_url: '',
          download_url: `https://zoom.us/rec/download/${targetRecording.uuid}_transcript?access_token=eyJhbGciOiJIUzI1NiJ9.test`,
          status: 'completed',
          recording_type: 'audio_transcript'
        },
        {
          id: `${targetRecording.meetingId}_chat`,
          meeting_id: targetRecording.meetingId,
          recording_start: isJamie ? '2025-07-04T02:00:13Z' : '2025-07-04T23:29:44Z',
          recording_end: isJamie ? '2025-07-04T03:11:44Z' : '2025-07-05T00:34:30Z',
          file_type: 'CHAT',
          file_extension: 'TXT',
          file_size: isJamie ? 5200 : 4800,
          play_url: '',
          download_url: `https://zoom.us/rec/download/${targetRecording.uuid}_chat?access_token=eyJhbGciOiJIUzI1NiJ9.test`,
          status: 'completed',
          recording_type: 'chat_file'
        }
      ],
      participant_audio_files: [],
      password: '',
      recording_play_passcode: ''
    };

    const webhookPayload = this.transformToWebhookPayload(simulatedData, targetRecording);

    // Log payload
    const logDir = path.join(__dirname, 'output', 'webhook-simulation-logs');
    await fs.mkdir(logDir, { recursive: true });
    const logFile = path.join(logDir, `webhook-${targetRecording.meetingId}-${Date.now()}.json`);
    await fs.writeFile(logFile, JSON.stringify(webhookPayload, null, 2));
    console.log(`   📝 Logged to: ${logFile}`);

    // Send webhook
    console.log('\n3️⃣ Sending webhook...');
    const result = await this.simulateWebhook(webhookUrl, webhookPayload);
    
    if (result.success) {
      console.log(`   ✅ Webhook sent successfully!`);
      console.log(`   Status: ${result.status}`);
    } else {
      console.log(`   ❌ Webhook failed: ${result.error}`);
      if (result.status) {
        console.log(`   Status: ${result.status}`);
      }
    }

    return result;
  }
}

async function main() {
  console.log('🚀 Zoom Webhook Simulator - Using Real API Data\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Zoom Webhook Simulator - Real API Version
=========================================

Fetches actual recordings from Zoom API and simulates webhook events.

Usage:
  node simulate-zoom-webhook-from-api.js [options]

Options:
  --webhook-url <url>    Webhook server URL (default: http://localhost:3001/webhook-test)
  --recording <name>     Process specific recording: "jamie" or "noor"
  --delay <seconds>      Delay between recordings (default: 5)
  --help, -h            Show this help

Environment Variables Required:
  ZOOM_ACCOUNT_ID       Zoom account ID
  ZOOM_CLIENT_ID        Zoom OAuth client ID
  ZOOM_CLIENT_SECRET    Zoom OAuth client secret

Examples:
  # Send to local test endpoint
  node simulate-zoom-webhook-from-api.js

  # Send to production test endpoint
  node simulate-zoom-webhook-from-api.js --webhook-url https://zoom-webhook-v2.onrender.com/webhook-test

  # Process only Jamie's recording
  node simulate-zoom-webhook-from-api.js --recording jamie
    `);
    process.exit(0);
  }

  // Get webhook URL
  let webhookUrl = 'http://localhost:3001/webhook-test';
  const urlIndex = args.findIndex(arg => arg === '--webhook-url');
  if (urlIndex !== -1 && args[urlIndex + 1]) {
    webhookUrl = args[urlIndex + 1];
  }

  // Filter recordings if specified
  let recordings = [...TARGET_RECORDINGS];
  const recordingIndex = args.findIndex(arg => arg === '--recording');
  if (recordingIndex !== -1 && args[recordingIndex + 1]) {
    const name = args[recordingIndex + 1].toLowerCase();
    recordings = recordings.filter(r => r.name.toLowerCase().includes(name));
  }

  // Get delay
  let delay = 5000;
  const delayIndex = args.findIndex(arg => arg === '--delay');
  if (delayIndex !== -1 && args[delayIndex + 1]) {
    delay = parseInt(args[delayIndex + 1]) * 1000;
  }

  console.log(`📡 Webhook URL: ${webhookUrl}`);
  console.log(`⏱️ Delay between recordings: ${delay/1000} seconds`);
  console.log(`📹 Recordings to process: ${recordings.length}\n`);

  // Check environment variables
  if (!process.env.ZOOM_ACCOUNT_ID || !process.env.ZOOM_CLIENT_ID || !process.env.ZOOM_CLIENT_SECRET) {
    console.error('❌ Missing required environment variables!');
    console.error('   Please set: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET');
    process.exit(1);
  }

  // Create simulator
  const simulator = new ZoomWebhookSimulator();

  // Process each recording
  const results = [];
  for (let i = 0; i < recordings.length; i++) {
    const recording = recordings[i];
    const result = await simulator.processRecording(recording, webhookUrl);
    results.push({ recording: recording.name, ...result });

    if (i < recordings.length - 1) {
      console.log(`\n⏳ Waiting ${delay/1000} seconds...\n`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Summary
  console.log('\n📊 Summary:');
  console.log('===========');
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${result.recording}: ${result.success ? 'Success' : result.error}`);
  });

  console.log('\n✅ Simulation complete!');
}

// Run the script
main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});