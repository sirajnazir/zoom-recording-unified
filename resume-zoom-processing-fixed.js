#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const readline = require('readline');

// Configuration
const CSV_FILE = 'recordings-last30days-2025-07-07.csv';
const START_FROM = 222; // Resume from recording #222
const CHECKPOINT_FILE = '.resume-zoom-checkpoint.json';

// Check if CSV file exists
if (!fs.existsSync(CSV_FILE)) {
    console.error(`❌ CSV file not found: ${CSV_FILE}`);
    console.error(`Please ensure you have the correct CSV file from the initial Zoom export.`);
    process.exit(1);
}

// Load or create checkpoint
function loadCheckpoint() {
    if (fs.existsSync(CHECKPOINT_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
        } catch (error) {
            console.warn('⚠️ Could not load checkpoint file, starting fresh');
            return { lastProcessed: START_FROM - 1, errors: [], successfullyProcessed: [] };
        }
    }
    return { lastProcessed: START_FROM - 1, errors: [], successfullyProcessed: [] };
}

function saveCheckpoint(checkpoint) {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

// Parse CSV manually to avoid dependency issues
function parseCSV(content) {
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const recordings = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const recording = {};
        headers.forEach((header, index) => {
            recording[header] = values[index] || '';
        });
        recordings.push(recording);
    }
    
    return recordings;
}

// Create readline interface for user prompts
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.toLowerCase().trim());
        });
    });
}

async function resumeProcessing() {
    console.log(`
================================================================================
📋 RESUME ZOOM PROCESSING FROM RECORDING #${START_FROM}
================================================================================
📅 Date: ${new Date().toISOString()}
📄 CSV File: ${CSV_FILE}
🔄 Using UUID for processing (not meeting ID)
================================================================================
`);

    // Load checkpoint
    const checkpoint = loadCheckpoint();
    const startFrom = Math.max(checkpoint.lastProcessed + 1, START_FROM);
    const errors = checkpoint.errors || [];
    const successfullyProcessed = checkpoint.successfullyProcessed || [];

    // Read and parse CSV
    const csvContent = fs.readFileSync(CSV_FILE, 'utf8');
    const allRecordings = parseCSV(csvContent);
    const totalRecordings = allRecordings.length;

    // Get recordings to process
    const recordingsToProcess = allRecordings.slice(startFrom - 1);
    
    console.log(`📊 Total recordings in CSV: ${totalRecordings}`);
    console.log(`📊 Starting from recording: ${startFrom}`);
    console.log(`📊 Recordings to process: ${recordingsToProcess.length}`);
    console.log(`✅ Previously processed: ${successfullyProcessed.length}`);
    console.log(`❌ Previous errors: ${errors.length}`);

    if (recordingsToProcess.length === 0) {
        console.log('\n✅ All recordings have been processed!');
        rl.close();
        return;
    }

    // Show next 5 recordings
    console.log('\n📋 Next 5 recordings to process:');
    recordingsToProcess.slice(0, 5).forEach((rec, idx) => {
        const recordingNum = startFrom + idx;
        console.log(`   ${recordingNum}. ${rec.topic || 'No Topic'}`);
        console.log(`      UUID: ${rec.uuid || rec.uuid_base64 || 'NO UUID'}`);
        console.log(`      Meeting ID: ${rec.meeting_id}`);
        console.log(`      Host: ${rec.host_email}`);
    });

    console.log(`
================================================================================
⚠️  IMPORTANT: This will process ${recordingsToProcess.length} recordings
⚠️  Starting from recording #${startFrom}
⚠️  Using UUID for each recording
================================================================================
`);

    const answer = await askQuestion('Do you want to continue? (yes/no): ');
    if (answer !== 'yes' && answer !== 'y') {
        console.log('❌ Processing cancelled by user');
        rl.close();
        return;
    }

    console.log('\n🚀 Starting individual processing...\n');

    // Process each recording
    let processed = 0;
    
    for (let i = 0; i < recordingsToProcess.length; i++) {
        const recording = recordingsToProcess[i];
        const recordingNum = startFrom + i;
        
        // Get UUID (try different possible field names)
        const uuid = recording.uuid || recording.uuid_base64 || recording.uuid_hex || recording.uuid_hex_with_dashes;
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
            // Use spawn instead of execSync to handle special characters better
            const { spawn } = require('child_process');
            
            console.log(`🔧 Executing: node complete-production-processor.js --mode=single --recording=[UUID] --auto-approve\n`);
            
            const child = spawn('node', [
                'complete-production-processor.js',
                '--mode=single',
                `--recording=${uuid}`,
                '--auto-approve'
            ], {
                stdio: 'inherit',
                cwd: process.cwd(),
                shell: false // Don't use shell to avoid special character issues
            });
            
            // Wait for process to complete
            await new Promise((resolve, reject) => {
                child.on('exit', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`Process exited with code ${code}`));
                    }
                });
                child.on('error', reject);
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
            
            // Ask if user wants to continue
            const continueAnswer = await askQuestion('\n❓ Continue with next recording? (yes/no): ');
            if (continueAnswer !== 'yes' && continueAnswer !== 'y') {
                console.log('❌ Processing stopped by user');
                break;
            }
        }
        
        // Add delay between recordings to avoid overwhelming the system
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
❌ Errors encountered: ${errors.length}
📊 Total progress: ${checkpoint.lastProcessed}/${totalRecordings}
================================================================================
`);

    if (errors.length > 0) {
        console.log('\n❌ Recordings with errors:');
        errors.forEach(err => {
            console.log(`   ${err.recordingNum}. ${err.topic} (${err.error})`);
        });
    }

    rl.close();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n🔄 Gracefully shutting down...');
    console.log('✅ Progress saved to checkpoint file');
    rl.close();
    process.exit(0);
});

// Start processing
resumeProcessing().catch(error => {
    console.error('❌ Fatal error:', error);
    rl.close();
    process.exit(1);
});