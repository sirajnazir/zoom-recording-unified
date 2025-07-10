#!/usr/bin/env node
require('dotenv').config();

// Run the complete production processor for Zoom API recordings
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Processing Zoom API Recordings with Complete Production Logic\n');

// Prepare arguments
const args = [
    'complete-production-processor.js',
    '--mode=recent',
    '--limit=320',  // Process all 320+ recordings
    '--auto-approve'
];

console.log('📋 Running command:', 'node', args.join(' '));
console.log('');

// Spawn the process
const processor = spawn('node', args, {
    cwd: __dirname,
    stdio: 'inherit',  // Inherit stdio to see output directly
    env: {
        ...process.env,
        DOWNLOAD_FILES: 'true'  // Ensure downloads are enabled
    }
});

// Handle exit
processor.on('exit', (code) => {
    if (code === 0) {
        console.log('\n✅ All recordings processed successfully!');
    } else {
        console.log(`\n❌ Process exited with code ${code}`);
    }
});

// Handle errors
processor.on('error', (error) => {
    console.error('❌ Failed to start processor:', error);
    process.exit(1);
});