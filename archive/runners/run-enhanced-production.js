#!/usr/bin/env node

/**
 * Enhanced Production Processor with Robust Signal Handling
 * Processes all 324 recordings with enhanced download capabilities
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { EventEmitter } = require('events');
const { Logger } = require('./src/shared/Logger');

// Global state for graceful shutdown
let isShuttingDown = false;
let currentBatch = 0;
let processedCount = 0;
let failedCount = 0;
let totalRecordings = 0;

// Signal handling for graceful shutdown
process.on('SIGTERM', () => {
    console.log('⚠️  Received SIGTERM, initiating graceful shutdown...');
    isShuttingDown = true;
    // Don't exit immediately, let the current processing complete
});

process.on('SIGINT', () => {
    console.log('⚠️  Received SIGINT, initiating graceful shutdown...');
    isShuttingDown = true;
    // Don't exit immediately, let the current processing complete
});

// Save progress to resume later
async function saveProgress() {
    const progress = {
        currentBatch,
        processedCount,
        failedCount,
        totalRecordings,
        timestamp: new Date().toISOString()
    };
    
    try {
        await fs.writeFile('processing-progress.json', JSON.stringify(progress, null, 2));
        console.log('💾 Progress saved for potential resume');
    } catch (error) {
        console.log('⚠️  Could not save progress:', error.message);
    }
}

// Load progress if available
async function loadProgress() {
    try {
        const progressData = await fs.readFile('processing-progress.json', 'utf8');
        const progress = JSON.parse(progressData);
        
        // Only use progress if it's from today
        const today = new Date().toDateString();
        const progressDate = new Date(progress.timestamp).toDateString();
        
        if (today === progressDate) {
            console.log('🔄 Found previous progress, resuming from batch', progress.currentBatch);
            currentBatch = progress.currentBatch;
            processedCount = progress.processedCount;
            failedCount = progress.failedCount;
            totalRecordings = progress.totalRecordings;
            return true;
        }
    } catch (error) {
        // No previous progress, start fresh
    }
    return false;
}

async function runEnhancedProduction() {
    try {
        console.log('🚀 Starting Enhanced Production Processor');
        console.log('📋 This will process all 324 recordings with enhanced download capabilities');
        console.log('🛡️  Robust signal handling enabled - will resume on interruption');
        console.log('');

        // Load previous progress if available
        const resumed = await loadProgress();
        if (resumed) {
            console.log(`📊 Resuming: ${processedCount} processed, ${failedCount} failed`);
        }

        // Check if CSV file already exists
        const csvPath = path.join(__dirname, 'data', 'ALL-324-zoomus_recordings_in_cloud__20250702.csv');
        const csvExists = await fs.access(csvPath).then(() => true).catch(() => false);

        let recordings;
        
        if (csvExists) {
            console.log('✅ Found existing CSV file, loading recordings directly...');
            recordings = await loadRecordingsFromCSV();
            
            if (!recordings || recordings.length === 0) {
                throw new Error('No recordings found in existing CSV file');
            }
            
            console.log(`📋 Loaded ${recordings.length} recordings from existing CSV`);
        } else {
            console.log('📋 No existing CSV found, generating new one...');
            
            // Generate CSV with complete processor
            await generateCSVWithCompleteProcessor();
            
            // Load recordings from the generated CSV
            recordings = await loadRecordingsFromCSV();
            
            if (!recordings || recordings.length === 0) {
                throw new Error('No recordings found after CSV generation');
            }
        }

        // Update total if not resumed
        if (!resumed) {
            totalRecordings = recordings.length;
        }

        console.log('');
        console.log(`🎯 Ready to process ${recordings.length} recordings`);
        console.log('📊 Sample recording:', recordings[0]);
        console.log('');

        // Process recordings with complete processor
        const results = await processRecordingsWithCompleteProcessor(recordings);

        console.log('');
        console.log('🎉 Enhanced Production Processing Complete!');
        console.log('📊 Final Results:');
        console.log(`   ✅ Successfully processed: ${results.processed}`);
        console.log(`   ❌ Failed: ${results.failed}`);
        console.log(`   📋 Total: ${results.total}`);
        console.log(`   ⏱️  Duration: ${Math.round(results.duration / 1000)}s`);
        console.log(`   📈 Success rate: ${results.successRate.toFixed(1)}%`);

        // Clean up progress file on successful completion
        try {
            await fs.unlink('processing-progress.json');
            console.log('🧹 Progress file cleaned up');
        } catch (error) {
            // Ignore if file doesn't exist
        }

    } catch (error) {
        console.error('❌ Enhanced production run failed:', error.message);
        
        // Save progress on failure for potential resume
        await saveProgress();
        
        process.exit(1);
    }
}

/**
 * Generate CSV using complete-production-processor.js with proper mode
 */
async function generateCSVWithCompleteProcessor() {
    return new Promise((resolve, reject) => {
        console.log('🔧 Running complete-production-processor.js to generate CSV...');
        console.log('📋 Command: node complete-production-processor.js --mode custom --from 2022-01-01 --to 2025-12-31 --limit 324 --auto-approve --parallel-downloads --streaming-downloads --download-concurrency 6 --resume-downloads');
        console.log('');

        // Run the complete production processor to generate CSV
        const child = spawn('node', [
            'complete-production-processor.js',
            '--mode', 'custom',
            '--from', '2022-01-01',
            '--to', '2025-12-31',
            '--limit', '324',
            '--auto-approve',
            '--parallel-downloads',
            '--streaming-downloads',
            '--download-concurrency', '6',
            '--resume-downloads'
        ], {
            stdio: 'inherit', // Show all output
            cwd: process.cwd()
        });

        // Handle completion
        child.on('close', (code) => {
            if (code === 0) {
                console.log('✅ CSV generation completed successfully');
                resolve(true);
            } else {
                console.error(`❌ CSV generation failed with exit code ${code}`);
                reject(new Error(`CSV generation failed with exit code ${code}`));
            }
        });

        // Handle errors
        child.on('error', (error) => {
            console.error('❌ Failed to spawn CSV generation process:', error.message);
            reject(error);
        });

        // Set a timeout for the process
        setTimeout(() => {
            child.kill('SIGTERM');
            reject(new Error('CSV generation timed out'));
        }, 600000); // 10 minutes timeout
    });
}

/**
 * Process recordings using complete-production-processor.js
 */
async function processRecordingsWithCompleteProcessor(recordings) {
    const startTime = Date.now();
    const total = recordings.length;

    console.log(`🚀 Processing ${total} recordings with complete-production-processor.js...`);
    console.log('📋 Each recording will be processed individually with full logic');
    console.log('');

    // Process recordings in smaller batches to avoid overwhelming the system
    const batchSize = 3;
    const maxConcurrent = 2;

    // Start from the current batch if resuming
    const startIndex = currentBatch * batchSize;
    
    for (let i = startIndex; i < recordings.length; i += batchSize) {
        // Check if we're shutting down
        if (isShuttingDown) {
            console.log('⚠️  Shutdown requested, saving progress and stopping gracefully...');
            await saveProgress();
            break;
        }
        
        const batch = recordings.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(recordings.length / batchSize);
        
        console.log(`📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} recordings)`);
        
        // Process batch with limited concurrency
        const batchPromises = batch.map(recording => 
            processSingleRecording(recording, maxConcurrent)
        );

        const batchResults = await Promise.allSettled(batchPromises);
        
        // Count results
        const successful = batchResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
        const batchFailed = batchResults.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;
        
        processedCount += successful;
        failedCount += batchFailed;
        currentBatch = batchNumber;
        
        console.log(`📦 Batch ${batchNumber} complete: ${successful} successful, ${batchFailed} failed`);
        console.log(`📊 Total Progress: ${processedCount}/${total} processed, ${failedCount} failed`);
        console.log('');
        
        // Save progress after each batch
        await saveProgress();
        
        // Brief pause between batches
        if (batchNumber < totalBatches) {
            console.log('⏸️  Pausing briefly between batches...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    const duration = Date.now() - startTime;
    const successRate = processedCount / total * 100;

    return {
        processed: processedCount,
        failed: failedCount,
        total,
        duration,
        successRate
    };
}

/**
 * Process a single recording using complete-production-processor.js
 */
async function processSingleRecording(recording, maxConcurrent) {
    const semaphore = new Semaphore(maxConcurrent);
    
    return semaphore.acquire().then(async (release) => {
        try {
            const recordingId = recording.uuid || recording.id;
            
            console.log(`📥 Processing recording: ${recordingId} (${recording.topic || 'No topic'})`);
            
            return new Promise((resolve, reject) => {
                // Run complete-production-processor.js for this recording
                const child = spawn('node', [
                    'complete-production-processor.js',
                    '--mode', 'single',
                    '--recording', recordingId,
                    '--auto-approve',
                    '--parallel-downloads',
                    '--streaming-downloads',
                    '--download-concurrency', '6',
                    '--resume-downloads'
                ], {
                    stdio: 'inherit', // Show all output
                    cwd: process.cwd()
                });

                // Handle completion
                child.on('close', (code) => {
                    if (code === 0) {
                        console.log(`✅ Successfully processed recording: ${recordingId}`);
                        resolve({ success: true, recordingId });
                    } else {
                        console.log(`❌ Failed to process recording: ${recordingId} (exit code: ${code})`);
                        resolve({ success: false, recordingId, error: `Exit code ${code}` });
                    }
                });

                // Handle errors
                child.on('error', (error) => {
                    console.log(`❌ Error processing recording: ${recordingId} - ${error.message}`);
                    resolve({ success: false, recordingId, error: error.message });
                });

                // Set a timeout for the process
                setTimeout(() => {
                    child.kill('SIGTERM');
                    console.log(`⏰ Timeout processing recording: ${recordingId}`);
                    resolve({ success: false, recordingId, error: 'Timeout' });
                }, 300000); // 5 minutes timeout
            });
        } finally {
            release();
        }
    });
}

/**
 * Load recordings from CSV file
 */
async function loadRecordingsFromCSV() {
    try {
        // Try to load from the CSV file generated by your processor
        const csvPath = path.join(__dirname, 'data', 'ALL-324-zoomus_recordings_in_cloud__20250702.csv');
        
        if (await fs.access(csvPath).then(() => true).catch(() => false)) {
            const csvContent = await fs.readFile(csvPath, 'utf8');
            const lines = csvContent.split('\n').filter(line => line.trim());
            
            // Parse CSV properly handling quoted fields
            function parseCSVLine(line) {
                const result = [];
                let current = '';
                let inQuotes = false;
                
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        result.push(current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }
                
                result.push(current.trim());
                return result.map(field => field.replace(/^"|"$/g, '')); // Remove outer quotes
            }
            
            const headers = parseCSVLine(lines[0]);
            console.log('📋 CSV Headers:', headers);
            
            const recordings = [];
            for (let i = 1; i < lines.length; i++) {
                const values = parseCSVLine(lines[i]);
                const recording = {};
                
                headers.forEach((header, index) => {
                    recording[header] = values[index] || '';
                });
                
                // Map CSV fields to expected recording structure
                const mappedRecording = {
                    uuid: (recording.ID || recording.id || '').replace(/\s+/g, ''), // Remove all spaces
                    id: (recording.ID || recording.id || '').replace(/\s+/g, ''), // Remove all spaces
                    topic: recording.Topic || recording.topic,
                    start_time: recording['Start Time'] || recording.start_time,
                    host_email: recording.Host || recording.host_email,
                    file_size: recording['File Size (MB)'] || recording.file_size,
                    file_count: recording['File Count'] || recording.file_count,
                    total_views: recording['Total Views'] || recording.total_views,
                    total_downloads: recording['Total Downloads'] || recording.total_downloads,
                    last_accessed: recording['Last Accessed'] || recording.last_accessed,
                    auto_delete_status: recording['Auto Delete Status'] || recording.auto_delete_status,
                    auto_delete_date: recording['Auto Delete Date'] || recording.auto_delete_date
                };
                
                // Ensure required fields exist
                if (mappedRecording.uuid || mappedRecording.id) {
                    recordings.push(mappedRecording);
                }
            }
            
            console.log(`📋 Loaded ${recordings.length} recordings from CSV`);
            console.log(`📊 Sample recording:`, recordings[0]);
            return recordings;
        } else {
            throw new Error(`CSV file not found: ${csvPath}`);
        }
    } catch (error) {
        console.error('❌ Failed to load recordings from CSV:', error.message);
        throw error;
    }
}

/**
 * Semaphore for concurrency control
 */
class Semaphore {
    constructor(max) {
        this.max = max;
        this.current = 0;
        this.queue = [];
    }

    async acquire() {
        return new Promise((resolve) => {
            if (this.current < this.max) {
                this.current++;
                resolve(() => this.release());
            } else {
                this.queue.push(resolve);
            }
        });
    }

    release() {
        this.current--;
        if (this.queue.length > 0) {
            this.current++;
            const next = this.queue.shift();
            next(() => this.release());
        }
    }
}

// Run the enhanced production processor
if (require.main === module) {
    runEnhancedProduction()
        .then((results) => {
            console.log('🎉 Enhanced production run completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Enhanced production run failed:', error);
            process.exit(1);
        });
}

module.exports = { runEnhancedProduction }; 