#!/usr/bin/env node
/**
 * Monitor webhook processing status
 * Checks the server health and queue status
 */

const axios = require('axios');

async function checkServerStatus(baseUrl) {
  console.log('🔍 Checking server status...\n');

  try {
    // Check health endpoint
    console.log('1️⃣ Health Check:');
    const healthResponse = await axios.get(`${baseUrl}/health`, { timeout: 5000 });
    console.log(`   Status: ${healthResponse.status}`);
    console.log(`   Response: ${JSON.stringify(healthResponse.data, null, 2)}`);

    // Check queue status
    console.log('\n2️⃣ Queue Status:');
    const queueResponse = await axios.get(`${baseUrl}/queue-status`, { timeout: 5000 });
    console.log(`   Status: ${queueResponse.status}`);
    console.log(`   Response: ${JSON.stringify(queueResponse.data, null, 2)}`);

    // Check recent logs
    console.log('\n3️⃣ Recent Logs:');
    try {
      const logsResponse = await axios.get(`${baseUrl}/logs/latest`, { timeout: 5000 });
      const logs = logsResponse.data.split('\n').slice(-20).join('\n');
      console.log(logs);
    } catch (error) {
      console.log('   Logs endpoint not available');
    }

  } catch (error) {
    console.error('❌ Error checking server:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   Server appears to be down or not accepting connections');
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const serverUrl = args[0] || 'https://zoom-webhook-v2.onrender.com';
  
  console.log(`📡 Monitoring server: ${serverUrl}\n`);

  // Initial check
  await checkServerStatus(serverUrl);

  // Monitor continuously if requested
  if (args.includes('--watch')) {
    console.log('\n👁️ Monitoring mode - checking every 30 seconds...\n');
    setInterval(async () => {
      console.log('\n' + '='.repeat(60) + '\n');
      console.log(`⏰ Check at ${new Date().toISOString()}`);
      await checkServerStatus(serverUrl);
    }, 30000);
  }
}

// Run the monitor
main().catch(console.error);