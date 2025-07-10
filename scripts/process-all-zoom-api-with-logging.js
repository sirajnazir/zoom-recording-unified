#!/usr/bin/env node

/**
 * Process ALL Zoom Cloud/API Recordings with Enhanced Logging
 * - Adds A indicator to all recordings
 * - Updates Zoom API tabs in Google Sheets
 * - Stores in Knowledge Base with proper organization
 * - Captures all console output to log files
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Create a unique log file for this run
const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
const logFile = path.join(logsDir, `zoom-api-processing-${timestamp}.log`);
const progressFile = path.join(logsDir, `zoom-api-progress-${timestamp}.log`);

console.log('🚀 Processing ALL Zoom Cloud/API Recordings with Enhanced Logging');
console.log('=' .repeat(70));
console.log('This will:');
console.log('- Add _A_ indicator to all Zoom recordings');
console.log('- Update the Zoom API - Raw and Zoom API - Standardized tabs');
console.log('- Organize recordings in Knowledge Base/Students and Coaches folders');
console.log('- Process 320+ recordings through the production pipeline');
console.log('- Capture all output to log files for debugging\n');

console.log(`📝 Main log file: ${logFile}`);
console.log(`📊 Progress log: ${progressFile}\n`);

// Create write streams for logging
const logStream = fs.createWriteStream(logFile, { flags: 'a' });
const progressStream = fs.createWriteStream(progressFile, { flags: 'a' });

// Write header to log files
const header = `
================================================================================
Zoom API Recording Processing - Started at ${new Date().toISOString()}
================================================================================
`;
logStream.write(header);
progressStream.write(header);

console.log('Starting production processor for Zoom API recordings...\n');

// Run the complete production processor
const processor = spawn('node', [
    'complete-production-processor.js',
    '--mode=recent',     // Process recordings from Zoom cloud
    '--limit=500',       // Process up to 500 recordings
    '--auto-approve',    // Don't ask for confirmation
    '--max-retries=5',   // More retries for network issues
    '--download-timeout=600000'  // 10 minutes timeout per file
], {
    env: {
        ...process.env,
        NODE_ENV: 'production',
        PROCESS_ALL_ZOOM: 'true'
    }
});

// Track progress
let recordingCount = 0;
let successCount = 0;
let errorCount = 0;
let lastUpdate = Date.now();

// Process stdout
processor.stdout.on('data', (data) => {
    const output = data.toString();
    
    // Write to console and log file
    process.stdout.write(output);
    logStream.write(output);
    
    // Extract progress information
    if (output.includes('Processing recording')) {
        recordingCount++;
        const progressMsg = `[${new Date().toISOString()}] Processing recording #${recordingCount}\n`;
        progressStream.write(progressMsg);
    }
    
    if (output.includes('✅') && output.includes('successfully')) {
        successCount++;
    }
    
    if (output.includes('❌') || output.includes('Error') || output.includes('Failed')) {
        errorCount++;
        progressStream.write(`[${new Date().toISOString()}] ERROR: ${output}\n`);
    }
    
    // Periodic progress update (every 30 seconds)
    const now = Date.now();
    if (now - lastUpdate > 30000) {
        const progressUpdate = `
[${new Date().toISOString()}] Progress Update:
  - Recordings processed: ${recordingCount}
  - Successful: ${successCount}
  - Errors: ${errorCount}
  - Processing rate: ${(recordingCount / ((now - startTime) / 1000 / 60)).toFixed(1)} recordings/minute
`;
        console.log(progressUpdate);
        progressStream.write(progressUpdate);
        lastUpdate = now;
    }
});

// Process stderr
processor.stderr.on('data', (data) => {
    const error = data.toString();
    process.stderr.write(error);
    logStream.write(`[STDERR] ${error}`);
    progressStream.write(`[${new Date().toISOString()}] ERROR: ${error}\n`);
});

const startTime = Date.now();

// Handle process completion
processor.on('close', (code) => {
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    const summary = `
================================================================================
Processing Complete - ${new Date().toISOString()}
================================================================================
Exit Code: ${code}
Duration: ${duration} minutes
Total Recordings Processed: ${recordingCount}
Successful: ${successCount}
Errors: ${errorCount}
Success Rate: ${recordingCount > 0 ? ((successCount / recordingCount) * 100).toFixed(1) : 0}%
================================================================================
`;
    
    console.log(summary);
    logStream.write(summary);
    progressStream.write(summary);
    
    if (code === 0) {
        console.log('\n✅ Zoom API processing completed successfully!');
        console.log('\n📊 Results:');
        console.log('- Check "Zoom API - Raw" tab for raw recording data');
        console.log('- Check "Zoom API - Standardized" tab for processed recordings');
        console.log('- All recordings now have _A_ indicator');
        console.log('- Recordings organized in Knowledge Base alongside _B_ recordings');
        console.log(`\n🎉 Processed ${successCount} recordings successfully!`);
    } else {
        console.log(`\n❌ Process exited with code ${code}`);
        console.log('Check the logs for detailed error information:');
        console.log(`  - Main log: ${logFile}`);
        console.log(`  - Progress log: ${progressFile}`);
    }
    
    // Close log streams
    logStream.end();
    progressStream.end();
});

processor.on('error', (err) => {
    const errorMsg = `Failed to start process: ${err}\n`;
    console.error(errorMsg);
    logStream.write(errorMsg);
    progressStream.write(errorMsg);
    process.exit(1);
});

// Handle script interruption
process.on('SIGINT', () => {
    console.log('\n\n⚠️  Processing interrupted by user');
    const interruptMsg = `
================================================================================
Processing Interrupted - ${new Date().toISOString()}
================================================================================
Recordings processed before interruption: ${recordingCount}
Successful: ${successCount}
Errors: ${errorCount}

To resume processing, check the last processed recording in:
${progressFile}
================================================================================
`;
    console.log(interruptMsg);
    logStream.write(interruptMsg);
    progressStream.write(interruptMsg);
    
    processor.kill('SIGTERM');
    process.exit(1);
});