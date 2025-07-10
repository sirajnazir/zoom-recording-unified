#!/usr/bin/env node

/**
 * Monitor Processing Logs in Real-Time
 * Shows progress and key events from the processing logs
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Find the most recent log file
const logsDir = path.join(process.cwd(), 'logs');
const files = fs.readdirSync(logsDir)
    .filter(f => f.startsWith('processing-') && f.endsWith('.log'))
    .map(f => ({
        name: f,
        path: path.join(logsDir, f),
        mtime: fs.statSync(path.join(logsDir, f)).mtime
    }))
    .sort((a, b) => b.mtime - a.mtime);

if (files.length === 0) {
    console.log('❌ No processing log files found');
    process.exit(1);
}

const latestLog = files[0];
console.log(`📝 Monitoring log file: ${latestLog.name}`);
console.log(`📅 Started: ${latestLog.mtime.toISOString()}`);
console.log('=' .repeat(70));
console.log('Press Ctrl+C to stop monitoring\n');

// Use tail to follow the log file
const tail = spawn('tail', ['-f', latestLog.path]);

let recordingCount = 0;
let successCount = 0;
let errorCount = 0;

tail.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    
    lines.forEach(line => {
        // Filter and highlight important lines
        if (line.includes('Processing recording')) {
            recordingCount++;
            console.log(`\n🎬 [${recordingCount}] ${line}`);
        } else if (line.includes('✅') && line.includes('successfully')) {
            successCount++;
            console.log(`✅ ${line}`);
        } else if (line.includes('❌') || line.includes('Error:')) {
            errorCount++;
            console.log(`❌ ${line}`);
        } else if (line.includes('Downloading')) {
            console.log(`📥 ${line}`);
        } else if (line.includes('Uploaded to')) {
            console.log(`📤 ${line}`);
        } else if (line.includes('AI analysis')) {
            console.log(`🤖 ${line}`);
        } else if (line.includes('SUMMARY') || line.includes('Complete')) {
            console.log(`\n📊 ${line}`);
        } else if (line.includes('Rate limit')) {
            console.log(`⏳ ${line}`);
        } else if (line.includes('Retrying')) {
            console.log(`🔄 ${line}`);
        }
    });
});

// Periodic summary
setInterval(() => {
    console.log(`\n📊 Progress: ${recordingCount} processed (✅ ${successCount} success, ❌ ${errorCount} errors)`);
}, 60000); // Every minute

tail.on('close', () => {
    console.log('\n📊 Final Summary:');
    console.log(`  - Total processed: ${recordingCount}`);
    console.log(`  - Successful: ${successCount}`);
    console.log(`  - Errors: ${errorCount}`);
    console.log(`  - Success rate: ${recordingCount > 0 ? ((successCount / recordingCount) * 100).toFixed(1) : 0}%`);
});