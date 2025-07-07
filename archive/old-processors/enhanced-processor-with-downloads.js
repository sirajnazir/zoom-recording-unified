const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');
const { Logger } = require('./src/shared/Logger');
const { ParallelDownloadProcessor } = require('./parallel-download-processor');
const { StreamingDownloadProcessor } = require('./streaming-download-processor');
const config = require('./src/shared/config/smart-config').config;

class EnhancedProcessorWithDownloads extends EventEmitter {
    constructor(options = {}) {
        super();
        this.logger = new Logger('EnhancedProcessorWithDownloads');
        this.config = config;
        
        // Enhanced processor settings (from original)
        this.maxConcurrent = options.maxConcurrent || 3;
        this.batchSize = options.batchSize || 10;
        this.resumeFromFile = options.resumeFromFile || './processing-progress.json';
        this.skipDuplicates = options.skipDuplicates !== false;
        this.cleanupAfterUpload = options.cleanupAfterUpload !== false;
        
        // NEW: Download processor settings
        this.useParallelDownloads = options.useParallelDownloads || false;
        this.useStreamingDownloads = options.useStreamingDownloads || false;
        this.downloadConcurrency = options.downloadConcurrency || 4;
        this.downloadTimeout = options.downloadTimeout || 300000; // 5 minutes
        this.enableResumeDownloads = options.enableResumeDownloads !== false;
        
        // Processing state
        this.processedRecordings = new Set();
        this.failedRecordings = new Set();
        this.currentBatch = [];
        this.isProcessing = false;
        this.startTime = null;
        
        // NEW: Download processors
        this.parallelDownloader = null;
        this.streamingDownloader = null;
        
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
                timestamp: new Date().toISOString()
            };
            await fs.writeFile(this.resumeFromFile, JSON.stringify(progressData, null, 2));
        } catch (error) {
            this.logger.error('Failed to save progress:', error);
        }
    }

    /**
     * Initialize download processors based on configuration
     */
    async initializeDownloadProcessors() {
        if (this.useParallelDownloads) {
            this.logger.info('Initializing parallel download processor...');
            this.parallelDownloader = new ParallelDownloadProcessor({
                maxConcurrent: this.downloadConcurrency,
                maxRetries: 3,
                timeout: this.downloadTimeout,
                connectionPool: 20
            });
            
            // Set up event listeners
            this.parallelDownloader
                .on('progress', (data) => {
                    this.emit('downloadProgress', {
                        type: 'parallel',
                        ...data
                    });
                })
                .on('fileComplete', (data) => {
                    this.emit('downloadComplete', {
                        type: 'parallel',
                        ...data
                    });
                })
                .on('fileError', (data) => {
                    this.emit('downloadError', {
                        type: 'parallel',
                        ...data
                    });
                });
        }

        if (this.useStreamingDownloads) {
            this.logger.info('Initializing streaming download processor...');
            this.streamingDownloader = new StreamingDownloadProcessor({
                maxConcurrent: this.downloadConcurrency,
                resumeDownloads: this.enableResumeDownloads,
                verifyChecksums: false
            });
            
            // Set up event listeners
            this.streamingDownloader
                .on('downloadStart', (data) => {
                    this.emit('downloadStart', {
                        type: 'streaming',
                        ...data
                    });
                })
                .on('downloadProgress', (data) => {
                    this.emit('downloadProgress', {
                        type: 'streaming',
                        ...data
                    });
                })
                .on('downloadComplete', (data) => {
                    this.emit('downloadComplete', {
                        type: 'streaming',
                        ...data
                    });
                })
                .on('downloadError', (data) => {
                    this.emit('downloadError', {
                        type: 'streaming',
                        ...data
                    });
                });
        }
    }

    /**
     * Enhanced download method with multiple strategies
     */
    async downloadRecording(recording, outputDir) {
        const recordingId = recording.uuid || recording.id;
        
        // Check if already processed
        if (this.processedRecordings.has(recordingId)) {
            this.logger.info(`Skipping already processed recording: ${recordingId}`);
            return { success: true, skipped: true, recordingId };
        }

        // Check if failed before
        if (this.failedRecordings.has(recordingId)) {
            this.logger.info(`Retrying previously failed recording: ${recordingId}`);
        }

        try {
            let downloadResult;

            // Choose download strategy
            if (this.useParallelDownloads && this.parallelDownloader) {
                this.logger.info(`Using parallel download for: ${recordingId}`);
                downloadResult = await this.downloadWithParallel(recording, outputDir);
            } else if (this.useStreamingDownloads && this.streamingDownloader) {
                this.logger.info(`Using streaming download for: ${recordingId}`);
                downloadResult = await this.downloadWithStreaming(recording, outputDir);
            } else {
                // Fallback to original download method
                this.logger.info(`Using fallback download for: ${recordingId}`);
                downloadResult = await this.downloadWithFallback(recording, outputDir);
            }

            if (downloadResult.success) {
                this.processedRecordings.add(recordingId);
                this.failedRecordings.delete(recordingId);
                await this.saveProgress();
                
                this.emit('recordingDownloaded', {
                    recordingId,
                    filePath: downloadResult.filePath,
                    method: downloadResult.method
                });
            }

            return downloadResult;

        } catch (error) {
            this.failedRecordings.add(recordingId);
            await this.saveProgress();
            
            this.logger.error(`Download failed for ${recordingId}:`, error);
            this.emit('recordingDownloadError', { recordingId, error: error.message });
            
            return { success: false, error: error.message, recordingId };
        }
    }

    /**
     * Download using parallel processor
     */
    async downloadWithParallel(recording, outputDir) {
        return new Promise((resolve, reject) => {
            const recordingId = recording.uuid || recording.id;
            const outputPath = path.join(outputDir, `${recordingId}.mp4`);
            
            // Add to parallel downloader
            this.parallelDownloader.addRecordings([recording]);
            
            // Listen for completion
            const onComplete = (data) => {
                if (data.downloadId === recordingId) {
                    this.parallelDownloader.removeListener('fileComplete', onComplete);
                    this.parallelDownloader.removeListener('fileError', onError);
                    resolve({
                        success: true,
                        filePath: outputPath,
                        method: 'parallel',
                        duration: data.duration,
                        speed: data.speed
                    });
                }
            };
            
            const onError = (data) => {
                if (data.downloadId === recordingId) {
                    this.parallelDownloader.removeListener('fileComplete', onComplete);
                    this.parallelDownloader.removeListener('fileError', onError);
                    reject(new Error(data.error));
                }
            };
            
            this.parallelDownloader
                .on('fileComplete', onComplete)
                .on('fileError', onError)
                .start();
        });
    }

    /**
     * Download using streaming processor
     */
    async downloadWithStreaming(recording, outputDir) {
        const recordingId = recording.uuid || recording.id;
        const outputPath = path.join(outputDir, `${recordingId}.mp4`);
        
        const result = await this.streamingDownloader.downloadFile(recording, outputPath);
        
        return {
            success: result.status === 'completed',
            filePath: outputPath,
            method: 'streaming',
            duration: result.duration,
            speed: this.streamingDownloader.calculateSpeed(result)
        };
    }

    /**
     * Fallback download method (original implementation)
     */
    async downloadWithFallback(recording, outputDir) {
        // This would be your original download implementation
        // For now, we'll simulate it
        const recordingId = recording.uuid || recording.id;
        const outputPath = path.join(outputDir, `${recordingId}.mp4`);
        
        // Simulate download delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Create empty file for testing
        await fs.writeFile(outputPath, '');
        
        return {
            success: true,
            filePath: outputPath,
            method: 'fallback'
        };
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
            // Initialize download processors
            await this.initializeDownloadProcessors();
            
            this.logger.info(`Starting enhanced processing of ${recordings.length} recordings`);
            this.emit('processingStart', { totalRecordings: recordings.length });

            // Filter out already processed recordings
            const unprocessedRecordings = recordings.filter(recording => {
                const recordingId = recording.uuid || recording.id;
                return !this.processedRecordings.has(recordingId);
            });

            this.logger.info(`Found ${unprocessedRecordings.length} unprocessed recordings`);

            // Process in batches
            for (let i = 0; i < unprocessedRecordings.length; i += this.batchSize) {
                const batch = unprocessedRecordings.slice(i, i + this.batchSize);
                this.currentBatch = batch;
                
                this.logger.info(`Processing batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(unprocessedRecordings.length / this.batchSize)}`);
                this.emit('batchStart', { 
                    batchNumber: Math.floor(i / this.batchSize) + 1,
                    batchSize: batch.length 
                });

                // Process batch with concurrency control
                const batchPromises = batch.map(recording => 
                    this.processRecordingWithConcurrency(recording, options)
                );

                await Promise.allSettled(batchPromises);
                
                this.emit('batchComplete', { 
                    batchNumber: Math.floor(i / this.batchSize) + 1,
                    processed: this.processedRecordings.size,
                    failed: this.failedRecordings.size
                });
            }

            const duration = Date.now() - this.startTime;
            const stats = this.getStats();
            
            this.logger.info(`Enhanced processing completed in ${(duration / 1000).toFixed(2)}s`);
            this.emit('processingComplete', { ...stats, duration });

            return stats;

        } catch (error) {
            this.logger.error('Enhanced processing failed:', error);
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
                const result = await this.downloadRecording(recording, options.outputDir || './downloads');
                
                // Additional processing steps would go here
                // (transcription, analysis, upload, etc.)
                
                return result;
            } finally {
                release();
            }
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
     * Get download processor statistics
     */
    getDownloadStats() {
        const stats = {};
        
        if (this.parallelDownloader) {
            stats.parallel = this.parallelDownloader.getStats();
        }
        
        if (this.streamingDownloader) {
            stats.streaming = this.streamingDownloader.getStats();
        }
        
        return stats;
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        this.logger.info('Cleaning up enhanced processor...');
        
        if (this.parallelDownloader) {
            // Cleanup parallel downloader if needed
        }
        
        if (this.streamingDownloader) {
            // Cleanup streaming downloader if needed
        }
        
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

module.exports = { EnhancedProcessorWithDownloads }; 