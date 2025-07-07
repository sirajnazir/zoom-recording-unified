#!/usr/bin/env node
/**
 * Download recordings from Zoom and simulate webhooks with local file serving
 * This ensures 100% real webhook simulation with all files available
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const url = require('url');
const crypto = require('crypto');

// Target recordings
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

class ZoomRecordingDownloader {
  constructor() {
    this.ZOOM_API_URL = 'https://api.zoom.us/v2';
    this.accountId = process.env.ZOOM_ACCOUNT_ID;
    this.clientId = process.env.ZOOM_CLIENT_ID;
    this.clientSecret = process.env.ZOOM_CLIENT_SECRET;
    this.token = null;
    this.tokenExpiry = null;
    this.downloadDir = path.join(__dirname, 'temp', 'webhook-recordings');
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
      console.log('✅ Zoom token obtained');
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
      console.error(`❌ Failed to get recording ${meetingId}:`, error.message);
      throw error;
    }
  }

  async downloadFile(url, filePath) {
    try {
      console.log(`   📥 Downloading: ${path.basename(filePath)}`);
      const token = await this.getZoomToken();
      
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        timeout: 300000 // 5 minute timeout
      });

      const writer = require('fs').createWriteStream(filePath);
      
      // Track download progress
      let downloadedBytes = 0;
      const totalBytes = parseInt(response.headers['content-length'], 10);
      
      response.data.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const percentComplete = ((downloadedBytes / totalBytes) * 100).toFixed(1);
        process.stdout.write(`\r   📥 Downloading: ${path.basename(filePath)} - ${percentComplete}%`);
      });

      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          console.log(`\n   ✅ Downloaded: ${path.basename(filePath)}`);
          resolve();
        });
        writer.on('error', reject);
      });
    } catch (error) {
      console.error(`\n   ❌ Failed to download ${path.basename(filePath)}:`, error.message);
      throw error;
    }
  }

  async downloadRecording(targetRecording) {
    console.log(`\n📹 Downloading: ${targetRecording.name}`);
    
    // Create directory for this recording
    const recordingDir = path.join(this.downloadDir, targetRecording.meetingId);
    await fs.mkdir(recordingDir, { recursive: true });

    try {
      // Get recording details
      const recording = await this.getRecording(targetRecording.meetingId);
      console.log(`✅ Found ${recording.recording_files.length} files`);

      // Save recording metadata
      const metadataPath = path.join(recordingDir, 'metadata.json');
      await fs.writeFile(metadataPath, JSON.stringify(recording, null, 2));

      // Download each file
      const downloadedFiles = [];
      for (const file of recording.recording_files) {
        const fileName = `${file.file_type.toLowerCase()}_${file.id}.${file.file_extension.toLowerCase()}`;
        const filePath = path.join(recordingDir, fileName);
        
        try {
          await this.downloadFile(file.download_url, filePath);
          
          // Store file info for webhook payload
          downloadedFiles.push({
            ...file,
            localPath: filePath,
            localFileName: fileName
          });
        } catch (error) {
          console.error(`   ⚠️ Skipping file due to error`);
        }
      }

      return {
        recording,
        downloadedFiles,
        recordingDir
      };

    } catch (error) {
      console.error(`❌ Failed to download recording:`, error.message);
      throw error;
    }
  }
}

class LocalFileServer {
  constructor(port = 3002) {
    this.port = port;
    this.server = null;
    this.baseUrl = `http://localhost:${port}`;
  }

  async start() {
    return new Promise((resolve) => {
      this.server = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;
        
        // Check if it's a recording request
        if (pathname.startsWith('/recordings/')) {
          // Validate access token
          const token = parsedUrl.query.access_token;
          if (!token || token !== 'local_test_token') {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
          }

          // Serve the file
          const filePath = path.join(__dirname, 'temp', 'webhook-recordings', pathname.replace('/recordings/', ''));
          
          try {
            const stats = await fs.stat(filePath);
            const fileStream = require('fs').createReadStream(filePath);
            
            res.writeHead(200, {
              'Content-Type': 'application/octet-stream',
              'Content-Length': stats.size
            });
            
            fileStream.pipe(res);
          } catch (error) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'File not found' }));
          }
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
        }
      });

      this.server.listen(this.port, () => {
        console.log(`📡 Local file server running at ${this.baseUrl}`);
        resolve();
      });
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log('📡 Local file server stopped');
    }
  }

  getFileUrl(meetingId, fileName) {
    return `${this.baseUrl}/recordings/${meetingId}/${fileName}?access_token=local_test_token`;
  }
}

class WebhookSimulator {
  constructor(fileServer) {
    this.fileServer = fileServer;
  }

  createWebhookPayload(recording, downloadedFiles, targetInfo) {
    // Update file URLs to use local server
    const updatedFiles = recording.recording_files.map(file => {
      const downloadedFile = downloadedFiles.find(df => df.id === file.id);
      if (downloadedFile) {
        return {
          ...file,
          download_url: this.fileServer.getFileUrl(targetInfo.meetingId, downloadedFile.localFileName),
          play_url: this.fileServer.getFileUrl(targetInfo.meetingId, downloadedFile.localFileName)
        };
      }
      return file;
    });

    // Calculate actual duration in seconds
    const duration = this.calculateDuration(recording.start_time, recording.recording_files[0]?.recording_end);

    return {
      event: 'recording.completed',
      event_ts: Date.now(),
      payload: {
        account_id: process.env.ZOOM_ACCOUNT_ID || 'D222nJC2QJiqPoQbV15Kvw',
        object: {
          uuid: recording.uuid || targetInfo.uuid,
          id: recording.id || targetInfo.meetingId,
          host_id: recording.host_id || recording.host_user_id,
          host_email: recording.host_email || targetInfo.hostEmail,
          topic: recording.topic,
          type: recording.type || 4,
          start_time: recording.start_time,
          duration: duration || recording.duration * 60, // Convert minutes to seconds if needed
          timezone: recording.timezone || 'America/Los_Angeles',
          total_size: recording.total_size || 0,
          recording_count: recording.recording_count || updatedFiles.length,
          share_url: recording.share_url || '',
          recording_files: updatedFiles,
          participant_audio_files: recording.participant_audio_files || [],
          password: recording.password || '',
          recording_play_passcode: recording.recording_play_passcode || '',
          on_demand: recording.on_demand || false
        }
      }
    };
  }

  calculateDuration(startTime, endTime) {
    if (!startTime || !endTime) return null;
    const start = new Date(startTime);
    const end = new Date(endTime);
    return Math.floor((end - start) / 1000); // Duration in seconds
  }

  async sendWebhook(webhookUrl, payload) {
    try {
      console.log('📤 Sending webhook...');
      const response = await axios.post(webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'x-zm-signature': 'test-signature',
          'x-zm-request-timestamp': Date.now().toString()
        },
        timeout: 300000 // 5 minute timeout
      });

      console.log('✅ Webhook sent successfully!');
      return { success: true, status: response.status, data: response.data };
    } catch (error) {
      console.error('❌ Webhook failed:', error.message);
      return { 
        success: false, 
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      };
    }
  }
}

async function main() {
  console.log('🚀 Complete Webhook Simulation with Local File Downloads\n');

  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log(`
Complete Webhook Simulator
==========================

Downloads recordings from Zoom and simulates webhooks with local file serving.

Usage:
  node download-and-simulate-webhook.js [options]

Options:
  --webhook-url <url>    Webhook URL (default: http://localhost:3001/webhook-test)
  --recording <name>     Process specific recording: "jamie" or "noor"
  --skip-download       Skip downloading if files already exist
  --production          Use production webhook endpoint
  --help                Show this help

Steps:
  1. Downloads all recording files from Zoom to local storage
  2. Starts a local file server to serve the downloaded files
  3. Creates webhook payloads with local file URLs
  4. Sends webhooks to the specified endpoint
  5. Processes recordings with all files available

Examples:
  # Download and process both recordings
  node download-and-simulate-webhook.js

  # Use production endpoint
  node download-and-simulate-webhook.js --webhook-url https://zoom-webhook-v2.onrender.com/webhook-test

  # Process only Jamie's recording
  node download-and-simulate-webhook.js --recording jamie
    `);
    process.exit(0);
  }

  // Parse options
  let webhookUrl = 'http://localhost:3001/webhook-test';
  const urlIndex = args.findIndex(arg => arg === '--webhook-url');
  if (urlIndex !== -1 && args[urlIndex + 1]) {
    webhookUrl = args[urlIndex + 1];
  } else if (args.includes('--production')) {
    webhookUrl = 'https://zoom-webhook-v2.onrender.com/webhook-test';
  }

  // Filter recordings
  let recordings = [...TARGET_RECORDINGS];
  const recordingIndex = args.findIndex(arg => arg === '--recording');
  if (recordingIndex !== -1 && args[recordingIndex + 1]) {
    const name = args[recordingIndex + 1].toLowerCase();
    recordings = recordings.filter(r => r.name.toLowerCase().includes(name));
  }

  const skipDownload = args.includes('--skip-download');

  console.log(`📡 Webhook URL: ${webhookUrl}`);
  console.log(`📹 Recordings: ${recordings.length}`);
  console.log(`💾 Skip download: ${skipDownload}\n`);

  // Check environment
  if (!process.env.ZOOM_ACCOUNT_ID || !process.env.ZOOM_CLIENT_ID || !process.env.ZOOM_CLIENT_SECRET) {
    console.error('❌ Missing required environment variables!');
    console.error('   Required: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET');
    process.exit(1);
  }

  // Initialize services
  const downloader = new ZoomRecordingDownloader();
  const fileServer = new LocalFileServer();
  const simulator = new WebhookSimulator(fileServer);

  try {
    // Start file server
    await fileServer.start();

    // Process each recording
    for (const targetRecording of recordings) {
      console.log(`\n${'='.repeat(60)}`);
      
      let recordingData;
      
      // Check if already downloaded
      const metadataPath = path.join(downloader.downloadDir, targetRecording.meetingId, 'metadata.json');
      
      if (skipDownload && await fs.access(metadataPath).then(() => true).catch(() => false)) {
        console.log(`📁 Using existing download for: ${targetRecording.name}`);
        const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
        
        // Rebuild downloadedFiles from metadata
        const downloadedFiles = [];
        for (const file of metadata.recording_files) {
          const fileName = `${file.file_type.toLowerCase()}_${file.id}.${file.file_extension.toLowerCase()}`;
          downloadedFiles.push({
            ...file,
            localPath: path.join(downloader.downloadDir, targetRecording.meetingId, fileName),
            localFileName: fileName
          });
        }
        
        recordingData = {
          recording: metadata,
          downloadedFiles
        };
      } else {
        // Download recording
        recordingData = await downloader.downloadRecording(targetRecording);
      }

      // Create webhook payload
      console.log('\n📝 Creating webhook payload...');
      const webhookPayload = simulator.createWebhookPayload(
        recordingData.recording,
        recordingData.downloadedFiles,
        targetRecording
      );

      // Log payload
      const logDir = path.join(__dirname, 'output', 'webhook-simulation-logs');
      await fs.mkdir(logDir, { recursive: true });
      const logFile = path.join(logDir, `complete-${targetRecording.meetingId}-${Date.now()}.json`);
      await fs.writeFile(logFile, JSON.stringify(webhookPayload, null, 2));
      console.log(`📝 Logged to: ${logFile}`);

      // Display summary
      console.log('\n📊 Recording Summary:');
      console.log(`   Topic: ${webhookPayload.payload.object.topic}`);
      console.log(`   Duration: ${webhookPayload.payload.object.duration} seconds (${(webhookPayload.payload.object.duration/60).toFixed(1)} minutes)`);
      console.log(`   Files: ${webhookPayload.payload.object.recording_files.length}`);
      console.log(`   Total Size: ${(webhookPayload.payload.object.total_size / 1024 / 1024).toFixed(1)} MB`);
      
      console.log('\n📁 Files:');
      webhookPayload.payload.object.recording_files.forEach(file => {
        console.log(`   - ${file.file_type}: ${(file.file_size / 1024 / 1024).toFixed(1)} MB`);
      });

      // Send webhook
      const result = await simulator.sendWebhook(webhookUrl, webhookPayload);
      
      if (!result.success) {
        console.error(`\n⚠️ Webhook failed for ${targetRecording.name}`);
      }

      // Wait before next recording
      if (recordings.indexOf(targetRecording) < recordings.length - 1) {
        console.log('\n⏳ Waiting 10 seconds before next recording...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    console.log('\n✅ All recordings processed!');
    console.log('\n⏳ Keeping file server running for 5 minutes to allow processing...');
    
    // Keep server running for processing
    await new Promise(resolve => setTimeout(resolve, 300000)); // 5 minutes

  } catch (error) {
    console.error('💥 Fatal error:', error);
  } finally {
    // Clean up
    fileServer.stop();
    console.log('\n🏁 Simulation complete!');
  }
}

// Run the script
main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});