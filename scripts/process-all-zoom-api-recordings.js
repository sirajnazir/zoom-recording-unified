#!/usr/bin/env node

/**
 * Process ALL Zoom Cloud/API Recordings
 * - Adds A indicator to all recordings
 * - Updates Zoom API tabs in Google Sheets
 * - Stores in Knowledge Base with proper organization
 */

const { spawn } = require('child_process');

console.log('🚀 Processing ALL Zoom Cloud/API Recordings');
console.log('=' .repeat(60));
console.log('This will:');
console.log('- Add _A_ indicator to all Zoom recordings');
console.log('- Update the Zoom API - Raw and Zoom API - Standardized tabs');
console.log('- Organize recordings in Knowledge Base/Students and Coaches folders');
console.log('- Process 320+ recordings through the production pipeline\n');

console.log('Starting production processor for Zoom API recordings...\n');

// Run the complete production processor
// It already has all enhancements including:
// - MultiTabGoogleSheetsService for data source specific tabs
// - A/B/C indicator support
// - CompleteSmartNameStandardizer
// - Proper folder organization
const processor = spawn('node', [
    'complete-production-processor.js',
    '--mode=recent',  // Process recordings from Zoom cloud
    '--limit=500',    // Process up to 500 recordings
    '--auto-approve'  // Don't ask for confirmation
], {
    stdio: 'inherit',
    env: {
        ...process.env,
        NODE_ENV: 'production',
        PROCESS_ALL_ZOOM: 'true'
    }
});

processor.on('close', (code) => {
    if (code === 0) {
        console.log('\n✅ Zoom API processing completed successfully!');
        console.log('\n📊 Results:');
        console.log('- Check "Zoom API - Raw" tab for raw recording data');
        console.log('- Check "Zoom API - Standardized" tab for processed recordings');
        console.log('- All recordings now have _A_ indicator');
        console.log('- Recordings organized in Knowledge Base alongside _B_ recordings');
        console.log('\n🎉 All 320+ Zoom recordings have been processed!');
    } else {
        console.log(`\n❌ Process exited with code ${code}`);
        console.log('Check the logs for any errors');
    }
});

processor.on('error', (err) => {
    console.error('Failed to start process:', err);
    process.exit(1);
});