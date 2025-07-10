#!/usr/bin/env node
/**
 * Resume Processing from Recording 222
 * 
 * This script reads the CSV file and processes recordings starting from #222
 * It processes them one by one to ensure proper tracking and error handling
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const csv = require('csv-parse/sync');

const RECORDINGS_TO_SKIP = 221;
const CSV_FILE = 'recordings-last30days-2025-07-07.csv';
const CHECKPOINT_FILE = '.resume-checkpoint.json';

// Helper to read checkpoint
function readCheckpoint() {
    try {
        if (fs.existsSync(CHECKPOINT_FILE)) {
            return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
        }
    } catch (e) {
        console.warn('⚠️ Could not read checkpoint file:', e.message);
    }
    return { lastProcessed: RECORDINGS_TO_SKIP, errors: [] };
}

// Helper to save checkpoint
function saveCheckpoint(data) {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2));
}

async function resumeProcessing() {
    console.log(`
================================================================================
📋 RESUME PROCESSING FROM RECORDING 222
================================================================================
📅 Date: ${new Date().toISOString()}
📄 CSV File: ${CSV_FILE}
================================================================================
`);

    // Check if CSV file exists
    const csvPath = path.join(process.cwd(), CSV_FILE);
    if (!fs.existsSync(csvPath)) {
        console.error(`❌ CSV file not found: ${csvPath}`);
        process.exit(1);
    }

    // Read checkpoint
    const checkpoint = readCheckpoint();
    const startFrom = checkpoint.lastProcessed + 1;

    // Read and parse CSV
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    let records;
    
    try {
        records = csv.parse(csvContent, {
            columns: true,
            skip_empty_lines: true
        });
    } catch (error) {
        console.error('❌ Error parsing CSV:', error.message);
        process.exit(1);
    }

    const totalRecordings = records.length;
    const recordingsToProcess = records.slice(startFrom - 1); // 0-based index

    console.log(`📊 Total recordings in CSV: ${totalRecordings}`);
    console.log(`📊 Starting from recording: ${startFrom}`);
    console.log(`📊 Recordings to process: ${recordingsToProcess.length}`);

    if (recordingsToProcess.length === 0) {
        console.log('\n✅ All recordings have been processed!');
        return;
    }

    // Show first few recordings
    console.log('\n📋 Next 5 recordings to process:');
    for (let i = 0; i < Math.min(5, recordingsToProcess.length); i++) {
        const rec = recordingsToProcess[i];
        const num = startFrom + i;
        console.log(`   ${num}. ${rec.topic || 'No Topic'} (ID: ${rec.meeting_id || rec.id})`);
    }

    // Ask for confirmation
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log(`
================================================================================
⚠️  IMPORTANT: This will process ${recordingsToProcess.length} recordings
⚠️  Starting from recording #${startFrom}
================================================================================
`);

    const answer = await new Promise(resolve => {
        readline.question('Do you want to continue? (yes/no): ', resolve);
    });
    readline.close();

    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
        console.log('❌ Processing cancelled by user.');
        process.exit(0);
    }

    // Process recordings one by one
    console.log('\n🚀 Starting individual processing...\n');
    
    let processed = 0;
    let errors = checkpoint.errors || [];

    for (let i = 0; i < recordingsToProcess.length; i++) {
        const recording = recordingsToProcess[i];
        const recordingNum = startFrom + i;
        const meetingId = recording.meeting_id || recording.id;
        
        console.log(`
================================================================================
🔄 Processing Recording ${recordingNum}/${totalRecordings}
📋 Topic: ${recording.topic || 'No Topic'}
🆔 Meeting ID: ${meetingId}
================================================================================
`);

        try {
            // Process single recording
            const command = `node complete-production-processor.js --mode=single --recording=${meetingId} --auto-approve`;
            console.log(`🔧 Executing: ${command}\n`);
            
            execSync(command, { 
                stdio: 'inherit',
                cwd: process.cwd()
            });
            
            processed++;
            console.log(`\n✅ Recording ${recordingNum} processed successfully`);
            
            // Update checkpoint
            saveCheckpoint({
                lastProcessed: recordingNum,
                errors: errors,
                lastUpdate: new Date().toISOString()
            });
            
        } catch (error) {
            console.error(`\n❌ Error processing recording ${recordingNum}:`, error.message);
            errors.push({
                recordingNum,
                meetingId,
                topic: recording.topic,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            
            // Save error to checkpoint
            saveCheckpoint({
                lastProcessed: recordingNum - 1, // Don't count failed recording
                errors: errors,
                lastUpdate: new Date().toISOString()
            });
            
            // Ask if user wants to continue
            const continueAnswer = await new Promise(resolve => {
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                rl.question('Continue with next recording? (yes/no): ', (answer) => {
                    rl.close();
                    resolve(answer);
                });
            });
            
            if (continueAnswer.toLowerCase() !== 'yes' && continueAnswer.toLowerCase() !== 'y') {
                console.log('❌ Processing stopped by user.');
                break;
            }
        }
        
        // Add a small delay between recordings to avoid overwhelming the system
        if (i < recordingsToProcess.length - 1) {
            console.log('\n⏳ Waiting 2 seconds before next recording...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    // Final summary
    console.log(`
================================================================================
📊 PROCESSING SUMMARY
================================================================================
✅ Successfully processed: ${processed}
❌ Errors: ${errors.length}
📍 Last processed: Recording #${checkpoint.lastProcessed}
================================================================================
`);

    if (errors.length > 0) {
        console.log('\n❌ Recordings with errors:');
        errors.forEach(err => {
            console.log(`   - Recording ${err.recordingNum}: ${err.topic} (${err.meetingId})`);
            console.log(`     Error: ${err.error}`);
        });
        console.log(`\n💾 Error details saved to: ${CHECKPOINT_FILE}`);
    }

    if (processed === recordingsToProcess.length) {
        console.log('\n🎉 All recordings processed successfully!');
        // Clean up checkpoint file
        try {
            fs.unlinkSync(CHECKPOINT_FILE);
            console.log('✅ Checkpoint file cleaned up');
        } catch (e) {
            // Ignore
        }
    } else {
        console.log(`\n📍 Resume from recording #${checkpoint.lastProcessed + 1} by running this script again`);
    }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log('\n\n🛑 Process interrupted by user');
    console.log('📍 Progress saved to checkpoint file');
    console.log('📍 Run this script again to resume');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n🛑 Process terminated');
    console.log('📍 Progress saved to checkpoint file');
    console.log('📍 Run this script again to resume');
    process.exit(0);
});

// Check if csv-parse is installed
try {
    require('csv-parse/sync');
} catch (e) {
    console.error('❌ csv-parse module not found. Installing...');
    try {
        execSync('npm install csv-parse', { stdio: 'inherit' });
        console.log('✅ csv-parse installed successfully');
        // Re-require after installation
        delete require.cache[require.resolve('csv-parse/sync')];
        require('csv-parse/sync');
    } catch (installError) {
        console.error('❌ Failed to install csv-parse:', installError.message);
        console.log('\nPlease run: npm install csv-parse');
        process.exit(1);
    }
}

// Run the resume processing
resumeProcessing().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});