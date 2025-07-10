#!/usr/bin/env node

/**
 * Test that Zoom recordings get the _A_ indicator
 */

const { spawn } = require('child_process');

console.log('🧪 Testing Zoom API Recording with A Indicator\n');

// Run production processor for just 1 recording
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
        console.log('\n✅ Test completed successfully');
        console.log('\n📊 Please check:');
        console.log('1. The "Zoom API - Raw" tab for the raw recording data');
        console.log('2. The "Zoom API - Standardized" tab for the processed recording');
        console.log('3. The standardizedName column should contain _A_ indicator');
        console.log('4. Example: Coaching_A_Jenny_Huda_Wk01_2024-01-01_M_abc123U_abc123');
    } else {
        console.log(`\n❌ Process exited with code ${code}`);
    }
});

processor.on('error', (err) => {
    console.error('Failed to start process:', err);
});