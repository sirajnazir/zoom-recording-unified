#!/usr/bin/env node
/**
 * Resume Processing Script - Starts from Recording 222
 * 
 * This script resumes processing from where it left off (recording 222)
 * It reads the CSV file and skips the first 221 recordings that were already processed
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RECORDINGS_TO_SKIP = 221; // Number of recordings already processed
const CSV_FILE = 'recordings-last30days-2025-07-07.csv';

async function resumeProcessing() {
    console.log(`
================================================================================
📋 RESUME PROCESSING FROM RECORDING 222
================================================================================
📅 Date: ${new Date().toISOString()}
⏭️ Skipping first ${RECORDINGS_TO_SKIP} recordings
📄 CSV File: ${CSV_FILE}
================================================================================
`);

    // Check if CSV file exists
    const csvPath = path.join(process.cwd(), CSV_FILE);
    if (!fs.existsSync(csvPath)) {
        console.error(`❌ CSV file not found: ${csvPath}`);
        console.log('Please ensure the CSV file exists in the current directory.');
        process.exit(1);
    }

    // Read and parse CSV
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    const headers = lines[0];
    const dataLines = lines.slice(1); // Skip header

    console.log(`📊 Total recordings in CSV: ${dataLines.length}`);
    console.log(`📊 Recordings already processed: ${RECORDINGS_TO_SKIP}`);
    console.log(`📊 Recordings to process: ${dataLines.length - RECORDINGS_TO_SKIP}`);

    // Create a new CSV with only unprocessed recordings
    const resumeCsvPath = path.join(process.cwd(), `resume-recordings-${Date.now()}.csv`);
    const resumeLines = [headers, ...dataLines.slice(RECORDINGS_TO_SKIP)];
    fs.writeFileSync(resumeCsvPath, resumeLines.join('\n'));

    console.log(`\n✅ Created resume CSV file: ${resumeCsvPath}`);
    console.log(`📊 Resume CSV contains ${resumeLines.length - 1} recordings`);

    // Parse first few recordings to show what will be processed
    console.log('\n📋 First 5 recordings to be processed:');
    for (let i = 0; i < Math.min(5, resumeLines.length - 1); i++) {
        const line = resumeLines[i + 1]; // Skip header
        const fields = line.split(',');
        const recordingNum = RECORDINGS_TO_SKIP + i + 1;
        const topic = fields[2] || 'No Topic'; // Assuming topic is 3rd column
        console.log(`   ${recordingNum}. ${topic}`);
    }

    // Ask for confirmation
    console.log(`
================================================================================
⚠️  IMPORTANT: This will process ${resumeLines.length - 1} recordings
================================================================================
`);

    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const answer = await new Promise(resolve => {
        readline.question('Do you want to continue? (yes/no): ', resolve);
    });
    readline.close();

    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
        console.log('❌ Processing cancelled by user.');
        process.exit(0);
    }

    // Execute the production processor with the resume CSV
    console.log('\n🚀 Starting processing with resume CSV...');
    console.log('================================================================================\n');

    try {
        // Use the complete-production-processor with auto-approve
        const command = `node complete-production-processor.js --mode=csv --csv-file="${resumeCsvPath}" --auto-approve --limit=500`;
        console.log(`🔧 Executing: ${command}\n`);
        
        execSync(command, { 
            stdio: 'inherit',
            cwd: process.cwd()
        });
        
        console.log('\n✅ Processing completed successfully!');
    } catch (error) {
        console.error('\n❌ Error during processing:', error.message);
        console.log('\n💡 You can manually run:');
        console.log(`   node complete-production-processor.js --mode=csv --csv-file="${resumeCsvPath}" --auto-approve --limit=500`);
    }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log('\n\n🛑 Process interrupted by user');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n🛑 Process terminated');
    process.exit(0);
});

// Run the resume processing
resumeProcessing().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});