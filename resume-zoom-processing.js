#!/usr/bin/env node
/**
 * Resume Zoom Processing Script
 * 
 * This script reads the CSV file and processes recordings starting from #222
 * It uses the UUID (not meeting ID) for each recording
 * Includes checkpoint support for resuming if interrupted
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const csv = require('csv-parse/sync');
const readline = require('readline');

// Configuration
const RECORDINGS_TO_SKIP = 221; // Skip first 221 recordings (process from #222)
const CSV_FILE = 'recordings-last30days-2025-07-07.csv';
const CHECKPOINT_FILE = '.resume-zoom-checkpoint.json';
const PROCESSING_DELAY = 2000; // 2 seconds between recordings

// Helper to read checkpoint
function readCheckpoint() {
    try {
        if (fs.existsSync(CHECKPOINT_FILE)) {
            const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
            console.log(`📍 Found checkpoint: Last processed recording #${data.lastProcessed}`);
            return data;
        }
    } catch (e) {
        console.warn('⚠️ Could not read checkpoint file:', e.message);
    }
    return { 
        lastProcessed: RECORDINGS_TO_SKIP, 
        errors: [],
        successfullyProcessed: []
    };
}

// Helper to save checkpoint
function saveCheckpoint(data) {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2));
}

// Helper to create readline interface
function createReadlineInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

// Main processing function
async function resumeZoomProcessing() {
    console.log(`
================================================================================
📋 RESUME ZOOM PROCESSING FROM RECORDING #222
================================================================================
📅 Date: ${new Date().toISOString()}
📄 CSV File: ${CSV_FILE}
🔄 Using UUID for processing (not meeting ID)
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
            skip_empty_lines: true,
            trim: true
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
    console.log(`✅ Previously processed: ${checkpoint.successfullyProcessed.length}`);
    console.log(`❌ Previous errors: ${checkpoint.errors.length}`);

    if (recordingsToProcess.length === 0) {
        console.log('\n✅ All recordings have been processed!');
        return;
    }

    // Show next recordings to process
    console.log('\n📋 Next 5 recordings to process:');
    for (let i = 0; i < Math.min(5, recordingsToProcess.length); i++) {
        const rec = recordingsToProcess[i];
        const num = startFrom + i;
        const uuid = rec.uuid || rec.uuid_base64;
        console.log(`   ${num}. ${rec.topic || 'No Topic'}`);
        console.log(`      UUID: ${uuid}`);
        console.log(`      Meeting ID: ${rec.meeting_id}`);
        console.log(`      Host: ${rec.host_email}`);
    }

    // Ask for confirmation
    const rl = createReadlineInterface();
    console.log(`
================================================================================
⚠️  IMPORTANT: This will process ${recordingsToProcess.length} recordings
⚠️  Starting from recording #${startFrom}
⚠️  Using UUID for each recording
================================================================================
`);

    const answer = await new Promise(resolve => {
        rl.question('Do you want to continue? (yes/no): ', resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
        console.log('❌ Processing cancelled by user.');
        process.exit(0);
    }

    // Process recordings one by one
    console.log('\n🚀 Starting individual processing...\n');
    
    let processed = 0;
    let errors = checkpoint.errors || [];
    let successfullyProcessed = checkpoint.successfullyProcessed || [];

    for (let i = 0; i < recordingsToProcess.length; i++) {
        const recording = recordingsToProcess[i];
        const recordingNum = startFrom + i;
        const uuid = recording.uuid || recording.uuid_base64;
        const meetingId = recording.meeting_id;
        
        if (!uuid) {
            console.error(`❌ No UUID found for recording ${recordingNum}`);
            errors.push({
                recordingNum,
                meetingId,
                topic: recording.topic,
                error: 'No UUID found in CSV',
                timestamp: new Date().toISOString()
            });
            continue;
        }

        console.log(`
================================================================================
🔄 Processing Recording ${recordingNum}/${totalRecordings}
📋 Topic: ${recording.topic || 'No Topic'}
🆔 UUID: ${uuid}
📝 Meeting ID: ${meetingId}
👤 Host: ${recording.host_email}
📅 Start Time: ${recording.start_time}
================================================================================
`);

        try {
            // Process single recording using UUID
            const command = `node complete-production-processor.js --mode=single --recording=${uuid} --auto-approve`;
            console.log(`🔧 Executing: ${command}\n`);
            
            execSync(command, { 
                stdio: 'inherit',
                cwd: process.cwd()
            });
            
            processed++;
            successfullyProcessed.push({
                recordingNum,
                uuid,
                meetingId,
                topic: recording.topic,
                processedAt: new Date().toISOString()
            });
            
            console.log(`\n✅ Recording ${recordingNum} processed successfully`);
            
            // Update checkpoint
            saveCheckpoint({
                lastProcessed: recordingNum,
                errors: errors,
                successfullyProcessed: successfullyProcessed,
                lastUpdate: new Date().toISOString()
            });
            
        } catch (error) {
            console.error(`\n❌ Error processing recording ${recordingNum}:`, error.message);
            errors.push({
                recordingNum,
                uuid,
                meetingId,
                topic: recording.topic,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            
            // Save error to checkpoint but still mark as processed
            saveCheckpoint({
                lastProcessed: recordingNum,
                errors: errors,
                successfullyProcessed: successfullyProcessed,
                lastUpdate: new Date().toISOString()
            });
            
            // Ask if user wants to continue after error
            const rl2 = createReadlineInterface();
            const continueAnswer = await new Promise(resolve => {
                rl2.question('\n❓ Continue with next recording? (yes/no): ', resolve);
            });
            rl2.close();
            
            if (continueAnswer.toLowerCase() !== 'yes' && continueAnswer.toLowerCase() !== 'y') {
                console.log('❌ Processing stopped by user.');
                break;
            }
        }
        
        // Add delay between recordings
        if (i < recordingsToProcess.length - 1) {
            console.log(`\n⏳ Waiting ${PROCESSING_DELAY/1000} seconds before next recording...`);
            await new Promise(resolve => setTimeout(resolve, PROCESSING_DELAY));
        }
    }

    // Final summary
    console.log(`
================================================================================
📊 PROCESSING SUMMARY
================================================================================
✅ Successfully processed in this session: ${processed}
✅ Total successfully processed: ${successfullyProcessed.length}
❌ Total errors: ${errors.length}
📍 Last processed: Recording #${checkpoint.lastProcessed}
================================================================================
`);

    if (errors.length > 0) {
        console.log('\n❌ Recordings with errors:');
        errors.forEach(err => {
            console.log(`   - Recording ${err.recordingNum}: ${err.topic}`);
            console.log(`     UUID: ${err.uuid}`);
            console.log(`     Meeting ID: ${err.meetingId}`);
            console.log(`     Error: ${err.error}`);
            console.log(`     Time: ${err.timestamp}`);
        });
        console.log(`\n💾 Full error details saved to: ${CHECKPOINT_FILE}`);
    }

    if (checkpoint.lastProcessed >= totalRecordings) {
        console.log('\n🎉 All recordings have been processed!');
        console.log(`✅ Total successful: ${successfullyProcessed.length}`);
        console.log(`❌ Total errors: ${errors.length}`);
        
        // Ask if user wants to clean up checkpoint
        const rl3 = createReadlineInterface();
        const cleanupAnswer = await new Promise(resolve => {
            rl3.question('\n🧹 Delete checkpoint file? (yes/no): ', resolve);
        });
        rl3.close();
        
        if (cleanupAnswer.toLowerCase() === 'yes' || cleanupAnswer.toLowerCase() === 'y') {
            try {
                fs.unlinkSync(CHECKPOINT_FILE);
                console.log('✅ Checkpoint file cleaned up');
            } catch (e) {
                console.error('⚠️ Could not delete checkpoint file:', e.message);
            }
        }
    } else {
        console.log(`\n📍 Resume from recording #${checkpoint.lastProcessed + 1} by running this script again`);
        console.log('💾 Progress saved to checkpoint file');
    }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log('\n\n🛑 Process interrupted by user (Ctrl+C)');
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
resumeZoomProcessing().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});