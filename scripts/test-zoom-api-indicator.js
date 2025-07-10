#!/usr/bin/env node

/**
 * Test Zoom API recordings to verify A indicator
 */

const { spawn } = require('child_process');

console.log('🧪 Testing Zoom API Recording with A Indicator\n');

// Run production processor in test mode for Zoom API
const processor = spawn('node', [
    'complete-production-processor.js',
    '--mode=test',
    '--limit=1'
], {
    stdio: 'inherit',
    env: {
        ...process.env,
        NODE_ENV: 'production'
    }
});

processor.on('close', (code) => {
    if (code === 0) {
        console.log('\n✅ Zoom API test completed successfully');
        console.log('📊 Check the Zoom API tabs in Google Sheets for recordings with _A_ indicator');
    } else {
        console.log(`\n❌ Process exited with code ${code}`);
    }
});

processor.on('error', (err) => {
    console.error('Failed to start process:', err);
});