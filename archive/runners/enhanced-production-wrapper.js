#!/usr/bin/env node
/**
 * Enhanced Production Wrapper
 * 
 * This wrapper adds download enhancements, batching, and progress tracking
 * to the existing complete-production-processor.js WITHOUT replacing any core logic.
 * 
 * All original console output and processing logic is preserved.
 */

require('dotenv').config();

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const { Logger } = require('./src/shared/Logger');

class EnhancedProductionWrapper extends EventEmitter {
    constructor(options = {}) {
        super();
        this.logger = new Logger('EnhancedProductionWrapper');
        
        // Enhanced settings
        this.maxConcurrent = options.maxConcurrent || 3;
        this.batchSize = options.batchSize || 5;
        this.resumeFromFile = options.resumeFromFile || './enhanced-progress.json';
        this.skipDuplicates = options.skipDuplicates !== false;
        
        // Download enhancements
        this.useParallelDownloads = options.useParallelDownloads !== false;
        this.useStreamingDownloads = options.useStreamingDownloads !== false;
        this.downloadConcurrency = options.downloadConcurrency || 4;
        this.enableResumeDownloads = options.enableResumeDownloads !== false;
        
        // Processing state
        this.processedRecordings = new Set();
        this.failedRecordings = new Set();
        this.currentBatch = [];
        this.isProcessing = false;
        this.startTime = null;
        
        // Load progress if resuming
        this.loadProgress();
    }

    /**
     * Load processing progress from file
     */
    async loadProgress() {
        try {
            if (await fs.access(this.resumeFromFile).then(() => true).catch(() => false)) {
                const progressData = JSON.parse(await fs.readFile(this.resumeFromFile, 'utf8'));
                this.processedRecordings = new Set(progressData.processed || []);
                this.failedRecordings = new Set(progressData.failed || []);
                this.logger.info(`📋 Loaded progress: ${this.processedRecordings.size} processed, ${this.failedRecordings.size} failed`);
            }
        } catch (error) {
            this.logger.warn('Could not load progress file, starting fresh');
        }
    }

    /**
     * Save processing progress to file
     */
    async saveProgress() {
        try {
            const progressData = {
                processed: Array.from(this.processedRecordings),
                failed: Array.from(this.failedRecordings),
                timestamp: new Date().toISOString(),
                stats: this.getStats()
            };
            await fs.writeFile(this.resumeFromFile, JSON.stringify(progressData, null, 2));
        } catch (error) {
            this.logger.error('Failed to save progress:', error);
        }
    }

    /**
     * Process recordings using the actual complete-production-processor.js
     */
    async processRecordings(recordings, options = {}) {
        if (this.isProcessing) {
            throw new Error('Processor is already running');
        }

        this.isProcessing = true;
        this.startTime = Date.now();
        
        try {
            this.logger.info(`🚀 Starting ENHANCED production processing of ${recordings.length} recordings`);
            this.logger.info(`📊 Enhanced Settings:`);
            this.logger.info(`   - Max Concurrent: ${this.maxConcurrent}`);
            this.logger.info(`   - Batch Size: ${this.batchSize}`);
            this.logger.info(`   - Parallel Downloads: ${this.useParallelDownloads ? 'ENABLED' : 'DISABLED'}`);
            this.logger.info(`   - Streaming Downloads: ${this.useStreamingDownloads ? 'ENABLED' : 'DISABLED'}`);
            this.logger.info(`   - Resume Downloads: ${this.enableResumeDownloads ? 'ENABLED' : 'DISABLED'}`);
            this.logger.info(`   - Skip Duplicates: ${this.skipDuplicates ? 'ENABLED' : 'DISABLED'}`);
            console.log('');
            
            this.emit('processingStart', { totalRecordings: recordings.length });

            // Filter out already processed recordings
            const unprocessedRecordings = recordings.filter(recording => {
                const recordingId = recording.uuid || recording.id;
                return !this.processedRecordings.has(recordingId);
            });

            this.logger.info(`📋 Found ${unprocessedRecordings.length} unprocessed recordings out of ${recordings.length} total`);
            console.log('');

            // Process in batches
            for (let i = 0; i < unprocessedRecordings.length; i += this.batchSize) {
                const batch = unprocessedRecordings.slice(i, i + this.batchSize);
                this.currentBatch = batch;
                
                const batchNumber = Math.floor(i / this.batchSize) + 1;
                const totalBatches = Math.ceil(unprocessedRecordings.length / this.batchSize);
                
                this.logger.info(`📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} recordings)`);
                this.emit('batchStart', { 
                    batchNumber,
                    totalBatches,
                    batchSize: batch.length 
                });

                // Process batch with concurrency control
                const batchPromises = batch.map(recording => 
                    this.processRecordingWithConcurrency(recording, options)
                );

                const batchResults = await Promise.allSettled(batchPromises);
                
                // Log batch results
                const successful = batchResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
                const failed = batchResults.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;
                
                this.logger.info(`📦 Batch ${batchNumber} complete: ${successful} successful, ${failed} failed`);
                this.emit('batchComplete', { 
                    batchNumber,
                    totalBatches,
                    successful,
                    failed,
                    processed: this.processedRecordings.size,
                    failed: this.failedRecordings.size
                });
                
                // Save progress after each batch
                await this.saveProgress();
                
                // Brief pause between batches to prevent overwhelming the system
                if (batchNumber < totalBatches) {
                    this.logger.info('⏸️  Pausing briefly between batches...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }

            const duration = Date.now() - this.startTime;
            const stats = this.getStats();
            
            this.logger.info(`🎉 ENHANCED production processing completed!`);
            this.logger.info(`📈 Final Statistics:`);
            this.logger.info(`   - Total Processed: ${stats.processed}/${stats.total}`);
            this.logger.info(`   - Success Rate: ${stats.successRate.toFixed(1)}%`);
            this.logger.info(`   - Duration: ${(duration / 1000 / 60).toFixed(1)} minutes`);
            this.logger.info(`   - Average Time per Recording: ${(stats.averageTimePerRecording / 1000).toFixed(1)} seconds`);
            
            this.emit('processingComplete', { ...stats, duration });

            return stats;

        } catch (error) {
            this.logger.error('❌ ENHANCED production processing failed:', error);
            this.emit('processingError', error);
            throw error;
        } finally {
            this.isProcessing = false;
            this.currentBatch = [];
        }
    }

    /**
     * Process single recording with concurrency control
     */
    async processRecordingWithConcurrency(recording, options) {
        const semaphore = new Semaphore(this.maxConcurrent);
        
        return semaphore.acquire().then(async (release) => {
            try {
                const result = await this.processSingleRecording(recording, options);
                return result;
            } finally {
                release();
            }
        });
    }

    /**
     * Process a single recording using the actual complete-production-processor.js
     */
    async processSingleRecording(recording, options) {
        const recordingId = recording.uuid || recording.id;
        
        // Check if already processed
        if (this.processedRecordings.has(recordingId)) {
            this.logger.info(`⏭️  Skipping already processed recording: ${recordingId}`);
            return { success: true, skipped: true, recordingId };
        }

        // Check if failed before
        if (this.failedRecordings.has(recordingId)) {
            this.logger.info(`🔄 Retrying previously failed recording: ${recordingId}`);
        }

        try {
            this.logger.info(`📥 Processing recording: ${recordingId} (${recording.topic || 'No topic'})`);
            
            // Call the actual complete-production-processor.js for this recording
            const result = await this.runCompleteProductionProcessor(recording, options);
            
            if (result.success) {
                // Mark as processed
                this.processedRecordings.add(recordingId);
                this.failedRecordings.delete(recordingId);
                
                this.logger.info(`✅ Successfully processed recording: ${recordingId}`);
                this.emit('recordingProcessed', {
                    recordingId,
                    result
                });

                return {
                    success: true,
                    recordingId,
                    result
                };
            } else {
                throw new Error(result.error || 'Processing failed');
            }

        } catch (error) {
            this.failedRecordings.add(recordingId);
            
            this.logger.error(`❌ Failed to process recording ${recordingId}:`, error.message);
            this.emit('recordingProcessingError', { recordingId, error: error.message });
            
            return { success: false, error: error.message, recordingId };
        }
    }

    /**
     * Run the actual complete-production-processor.js for a single recording
     */
    async runCompleteProductionProcessor(recording, options) {
        return new Promise((resolve, reject) => {
            const recordingId = recording.uuid || recording.id;
            
            // Prepare arguments for the complete production processor
            const args = [
                'complete-production-processor.js',
                '--mode', 'single',
                '--recording', recordingId,
                '--auto-approve'
            ];

            // Add download enhancement flags if enabled
            if (this.useParallelDownloads) {
                args.push('--parallel-downloads');
            }
            if (this.useStreamingDownloads) {
                args.push('--streaming-downloads');
            }
            if (this.enableResumeDownloads) {
                args.push('--resume-downloads');
            }

            console.log(`🔧 Running complete-production-processor.js for recording: ${recordingId}`);
            console.log(`📋 Command: node ${args.join(' ')}`);
            console.log('');

            // Spawn the complete production processor
            const child = spawn('node', args, {
                stdio: ['inherit', 'pipe', 'pipe'],
                cwd: process.cwd()
            });

            let stdout = '';
            let stderr = '';

            // Capture stdout (preserve all original console output)
            child.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                // Forward all output to console (preserve original logging)
                process.stdout.write(output);
            });

            // Capture stderr
            child.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                // Forward all error output to console
                process.stderr.write(output);
            });

            // Handle completion
            child.on('close', (code) => {
                if (code === 0) {
                    resolve({
                        success: true,
                        recordingId,
                        stdout,
                        stderr,
                        exitCode: code
                    });
                } else {
                    reject(new Error(`Complete production processor failed with exit code ${code}: ${stderr}`));
                }
            });

            // Handle errors
            child.on('error', (error) => {
                reject(new Error(`Failed to spawn complete production processor: ${error.message}`));
            });

            // Set a timeout for the process
            setTimeout(() => {
                child.kill('SIGTERM');
                reject(new Error(`Complete production processor timed out for recording ${recordingId}`));
            }, 300000); // 5 minutes timeout
        });
    }

    /**
     * Get processing statistics
     */
    getStats() {
        const duration = this.startTime ? Date.now() - this.startTime : 0;
        
        return {
            total: this.processedRecordings.size + this.failedRecordings.size,
            processed: this.processedRecordings.size,
            failed: this.failedRecordings.size,
            duration,
            averageTimePerRecording: this.processedRecordings.size > 0 ? duration / this.processedRecordings.size : 0,
            successRate: this.processedRecordings.size / (this.processedRecordings.size + this.failedRecordings.size) * 100
        };
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        this.logger.info('🧹 Cleaning up enhanced production wrapper...');
        await this.saveProgress();
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

module.exports = { EnhancedProductionWrapper }; 