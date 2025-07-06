#!/usr/bin/env node
/**
 * Real-time webhook processing monitor
 * Shows live updates of webhook processing progress
 */

const axios = require('axios');

class WebhookMonitor {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
    this.lastStatus = null;
    this.startTime = Date.now();
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async checkStatus() {
    try {
      const response = await axios.get(`${this.serverUrl}/queue-status`, { 
        timeout: 5000,
        validateStatus: () => true 
      });

      if (response.status === 200 && response.data) {
        return response.data;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  displayStatus(status) {
    // Clear console
    console.clear();
    
    const elapsed = Date.now() - this.startTime;
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('   📊 WEBHOOK PROCESSING MONITOR');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log();
    console.log(`Server: ${this.serverUrl}`);
    console.log(`Monitoring Duration: ${this.formatDuration(elapsed)}`);
    console.log(`Last Update: ${new Date().toLocaleTimeString()}`);
    console.log();

    if (!status) {
      console.log('❌ Unable to connect to server');
      return;
    }

    // Queue status
    console.log('📋 Queue Status:');
    console.log(`   Active: ${status.activeCount || 0}`);
    console.log(`   Pending: ${status.pendingCount || 0}`);
    console.log(`   Completed: ${status.completedCount || 0}`);
    console.log();

    // Active recordings
    if (status.activeRecordings && status.activeRecordings.length > 0) {
      console.log('🔄 Active Recordings:');
      status.activeRecordings.forEach(recording => {
        const duration = Date.now() - new Date(recording.startTime).getTime();
        console.log();
        console.log(`   ${recording.topic || recording.id}`);
        console.log(`   ID: ${recording.id}`);
        console.log(`   Status: ${recording.status || 'Processing'}`);
        console.log(`   Duration: ${this.formatDuration(duration)}`);
        
        if (recording.progress) {
          console.log(`   Progress: ${recording.progress}%`);
        }
        
        if (recording.currentStep) {
          console.log(`   Step: ${recording.currentStep}`);
        }
      });
    }

    // Recent completions
    if (status.recentCompletions && status.recentCompletions.length > 0) {
      console.log();
      console.log('✅ Recent Completions:');
      status.recentCompletions.slice(0, 5).forEach(completion => {
        const time = new Date(completion.completedAt).toLocaleTimeString();
        console.log(`   ${time} - ${completion.topic || completion.id} (${this.formatDuration(completion.duration)})`);
      });
    }

    // System stats
    if (status.systemStats) {
      console.log();
      console.log('💻 System Stats:');
      console.log(`   Memory: ${status.systemStats.memoryUsage || 'N/A'}`);
      console.log(`   CPU: ${status.systemStats.cpuUsage || 'N/A'}`);
      console.log(`   Uptime: ${this.formatDuration(status.systemStats.uptime || 0)}`);
    }

    console.log();
    console.log('Press Ctrl+C to exit');
  }

  async start() {
    console.log('Starting webhook monitor...');
    
    // Initial check
    const status = await this.checkStatus();
    this.displayStatus(status);

    // Update every 2 seconds
    setInterval(async () => {
      const status = await this.checkStatus();
      this.displayStatus(status);
    }, 2000);
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log(`
Webhook Processing Monitor
==========================

Real-time monitoring of webhook processing status.

Usage:
  node monitor-webhook-realtime.js [server-url]

Options:
  --help    Show this help

Examples:
  # Monitor local server
  node monitor-webhook-realtime.js

  # Monitor production server
  node monitor-webhook-realtime.js https://zoom-webhook-v2.onrender.com
    `);
    process.exit(0);
  }

  const serverUrl = args[0] || 'http://localhost:3001';

  const monitor = new WebhookMonitor(serverUrl);
  await monitor.start();
}

// Handle exit gracefully
process.on('SIGINT', () => {
  console.log('\n\nMonitor stopped.');
  process.exit(0);
});

main().catch(console.error);