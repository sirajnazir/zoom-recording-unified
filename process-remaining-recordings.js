#!/usr/bin/env node

const fs = require('fs');
const { spawn } = require('child_process');

// Configuration
const CSV_FILE = 'recordings-last30days-2025-07-07.csv';
const START_FROM = 222;
const CHECKPOINT_FILE = '.process-checkpoint.json';

// Load checkpoint
function loadCheckpoint() {
    if (fs.existsSync(CHECKPOINT_FILE)) {
        return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    }
    return { lastProcessed: START_FROM - 1, processed: [], errors: [] };
}

function saveCheckpoint(data) {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2));
}

// Parse CSV manually
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

async function processRecording(recording, num) {
    return new Promise((resolve, reject) => {
        const uuid = recording.uuid || recording.uuid_base64;
        
        console.log(`\n🔄 Processing Recording ${num}/329`);
        console.log(`📋 Topic: ${recording.topic}`);
        console.log(`🆔 UUID: ${uuid}`);
        console.log(`📅 Date: ${recording.start_time}`);
        
        const args = [
            'complete-production-processor.js',
            '--mode=single',
            `--recording=${uuid}`,
            '--auto-approve',
            '--parallel-downloads=true',
            '--download-concurrency=8'
        ];
        
        const child = spawn('node', args, {
            stdio: 'inherit',
            shell: false
        });
        
        child.on('exit', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Process exited with code ${code}`));
            }
        });
        
        child.on('error', reject);
    });
}

async function main() {
    // Load data
    const checkpoint = loadCheckpoint();
    const csvContent = fs.readFileSync(CSV_FILE, 'utf8');
    const allRecordings = parseCSV(csvContent);
    
    console.log(`📊 Total recordings: ${allRecordings.length}`);
    console.log(`✅ Already processed: ${checkpoint.processed.length}`);
    console.log(`❌ Previous errors: ${checkpoint.errors.length}`);
    
    // Process from checkpoint
    const startFrom = Math.max(checkpoint.lastProcessed + 1, START_FROM);
    console.log(`📍 Starting from recording #${startFrom}\n`);
    
    for (let i = startFrom - 1; i < allRecordings.length; i++) {
        const recording = allRecordings[i];
        const recordingNum = i + 1;
        
        try {
            await processRecording(recording, recordingNum);
            
            checkpoint.lastProcessed = recordingNum;
            checkpoint.processed.push({
                num: recordingNum,
                uuid: recording.uuid || recording.uuid_base64,
                topic: recording.topic,
                timestamp: new Date().toISOString()
            });
            saveCheckpoint(checkpoint);
            
            console.log(`✅ Recording ${recordingNum} completed`);
            
            // Small delay between recordings
            if (i < allRecordings.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
        } catch (error) {
            console.error(`❌ Error processing recording ${recordingNum}:`, error.message);
            
            checkpoint.errors.push({
                num: recordingNum,
                uuid: recording.uuid || recording.uuid_base64,
                topic: recording.topic,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            saveCheckpoint(checkpoint);
            
            // Continue with next recording
        }
    }
    
    console.log('\n📊 Processing Complete!');
    console.log(`✅ Processed: ${checkpoint.processed.length}`);
    console.log(`❌ Errors: ${checkpoint.errors.length}`);
}

// Handle SIGINT
process.on('SIGINT', () => {
    console.log('\n🔄 Saving progress...');
    process.exit(0);
});

main().catch(console.error);