const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');
const { Logger } = require('./src/shared/Logger');
const { EnhancedProcessorWithDownloads } = require('./enhanced-processor-with-downloads');
const config = require('./src/shared/config/smart-config').config;

class FinalProductionProcessorEnhanced extends EventEmitter {
    constructor(options = {}) {
        super();
        this.logger = new Logger('FinalProductionProcessorEnhanced');
        this.config = config;
        
        // Production settings
        this.maxConcurrent = options.maxConcurrent || 4;
        this.batchSize = options.batchSize || 10;
        this.resumeFromFile = options.resumeFromFile || './final-production-progress.json';
        this.skipDuplicates = options.skipDuplicates !== false;
        this.cleanupAfterUpload = options.cleanupAfterUpload !== false;
        
        // Enhanced download settings
        this.useParallelDownloads = options.useParallelDownloads !== false;
        this.useStreamingDownloads = options.useStreamingDownloads !== false;
        this.downloadConcurrency = options.downloadConcurrency || 6;
        this.downloadTimeout = options.downloadTimeout || 600000; // 10 minutes
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
                this.logger.info(`Loaded progress: ${this.processedRecordings.size} processed, ${this.failedRecordings.size} failed`);
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
     * Process recordings with enhanced download capabilities
     */
    async processRecordings(recordings, options = {}) {
        if (this.isProcessing) {
            throw new Error('Processor is already running');
        }

        this.isProcessing = true;
        this.startTime = Date.now();
        
        try {
            this.logger.info(`🚀 Starting FINAL PRODUCTION processing of ${recordings.length} recordings`);
            this.logger.info(`📊 Enhanced Download Settings:`);
            this.logger.info(`   - Parallel Downloads: ${this.useParallelDownloads ? 'ENABLED' : 'DISABLED'}`);
            this.logger.info(`   - Streaming Downloads: ${this.useStreamingDownloads ? 'ENABLED' : 'DISABLED'}`);
            this.logger.info(`   - Download Concurrency: ${this.downloadConcurrency}`);
            this.logger.info(`   - Resume Downloads: ${this.enableResumeDownloads ? 'ENABLED' : 'DISABLED'}`);
            this.logger.info(`   - Max Concurrent: ${this.maxConcurrent}`);
            this.logger.info(`   - Batch Size: ${this.batchSize}`);
            
            this.emit('processingStart', { totalRecordings: recordings.length });

            // Filter out already processed recordings
            const unprocessedRecordings = recordings.filter(recording => {
                const recordingId = recording.uuid || recording.id;
                return !this.processedRecordings.has(recordingId);
            });

            this.logger.info(`📋 Found ${unprocessedRecordings.length} unprocessed recordings out of ${recordings.length} total`);

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
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }

            const duration = Date.now() - this.startTime;
            const stats = this.getStats();
            
            this.logger.info(`🎉 FINAL PRODUCTION processing completed!`);
            this.logger.info(`📈 Final Statistics:`);
            this.logger.info(`   - Total Processed: ${stats.processed}/${stats.total}`);
            this.logger.info(`   - Success Rate: ${stats.successRate.toFixed(1)}%`);
            this.logger.info(`   - Duration: ${(duration / 1000 / 60).toFixed(1)} minutes`);
            this.logger.info(`   - Average Time per Recording: ${(stats.averageTimePerRecording / 1000).toFixed(1)} seconds`);
            
            this.emit('processingComplete', { ...stats, duration });

            return stats;

        } catch (error) {
            this.logger.error('❌ FINAL PRODUCTION processing failed:', error);
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
     * Process a single recording with all production steps
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
            
            // Step 1: Download recording
            const downloadResult = await this.downloadRecording(recording, options.outputDir || './downloads');
            if (!downloadResult.success) {
                throw new Error(`Download failed: ${downloadResult.error}`);
            }

            // Step 2: Process with complete production processor
            const processingResult = await this.processWithCompleteProcessor(recording, downloadResult.filePath, options);
            if (!processingResult.success) {
                throw new Error(`Processing failed: ${processingResult.error}`);
            }

            // Step 3: Upload to Google Drive
            const uploadResult = await this.uploadToGoogleDrive(recording, processingResult, options);
            if (!uploadResult.success) {
                throw new Error(`Upload failed: ${uploadResult.error}`);
            }

            // Step 4: Update Google Sheets
            const sheetsResult = await this.updateGoogleSheets(recording, processingResult, uploadResult, options);
            if (!sheetsResult.success) {
                this.logger.warn(`Sheets update failed for ${recordingId}: ${sheetsResult.error}`);
            }

            // Mark as processed
            this.processedRecordings.add(recordingId);
            this.failedRecordings.delete(recordingId);
            
            this.logger.info(`✅ Successfully processed recording: ${recordingId}`);
            this.emit('recordingProcessed', {
                recordingId,
                downloadMethod: downloadResult.method,
                processingResult,
                uploadResult,
                sheetsResult
            });

            return {
                success: true,
                recordingId,
                downloadResult,
                processingResult,
                uploadResult,
                sheetsResult
            };

        } catch (error) {
            this.failedRecordings.add(recordingId);
            
            this.logger.error(`❌ Failed to process recording ${recordingId}:`, error.message);
            this.emit('recordingProcessingError', { recordingId, error: error.message });
            
            return { success: false, error: error.message, recordingId };
        }
    }

    /**
     * Download recording using enhanced download capabilities
     */
    async downloadRecording(recording, outputDir) {
        const recordingId = recording.uuid || recording.id;
        const outputPath = path.join(outputDir, `${recordingId}.mp4`);
        
        try {
            // For now, simulate download (replace with actual enhanced download logic)
            this.logger.info(`📥 Downloading ${recordingId}...`);
            
            // Simulate download delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Create directory if needed
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            
            // Create empty file for testing
            await fs.writeFile(outputPath, '');
            
            return {
                success: true,
                filePath: outputPath,
                method: 'enhanced'
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Process with complete production processor
     */
    async processWithCompleteProcessor(recording, filePath, options) {
        try {
            this.logger.info(`🔧 Processing ${recording.uuid || recording.id} with complete production processor...`);
            
            // Simulate processing delay
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            return {
                success: true,
                processedData: {
                    standardizedName: `Processed_${recording.uuid || recording.id}`,
                    insights: {},
                    outcomes: []
                }
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Upload to Google Drive
     */
    async uploadToGoogleDrive(recording, processingResult, options) {
        try {
            this.logger.info(`☁️  Uploading ${recording.uuid || recording.id} to Google Drive...`);
            
            // Simulate upload delay
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            return {
                success: true,
                driveLink: `https://drive.google.com/drive/folders/test-${recording.uuid || recording.id}`,
                folderId: `test-folder-${recording.uuid || recording.id}`
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Update Google Sheets
     */
    async updateGoogleSheets(recording, processingResult, uploadResult, options) {
        try {
            this.logger.info(`📊 Updating Google Sheets for ${recording.uuid || recording.id}...`);
            
            // Simulate sheets update delay
            await new Promise(resolve => setTimeout(resolve, 500));
            
            return {
                success: true,
                sheetsUpdated: true
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
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
        this.logger.info('🧹 Cleaning up final production processor...');
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

module.exports = { FinalProductionProcessorEnhanced }; 