const fs = require('fs').promises;
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { EventEmitter } = require('events');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { Logger } = require('./src/shared/Logger');
const config = require('./src/shared/config/smart-config').config;

class ParallelDownloadProcessor extends EventEmitter {
    constructor(options = {}) {
        super();
        this.logger = new Logger('ParallelDownloadProcessor');
        this.config = config;
        
        // Performance settings
        this.maxConcurrent = options.maxConcurrent || 8;
        this.maxRetries = options.maxRetries || 3;
        this.timeout = options.timeout || 300000; // 5 minutes
        this.chunkSize = options.chunkSize || 1024 * 1024; // 1MB chunks
        this.connectionPool = options.connectionPool || 20;
        
        // Queue management
        this.downloadQueue = [];
        this.activeDownloads = new Map();
        this.completedDownloads = new Map();
        this.failedDownloads = new Map();
        
        // Progress tracking
        this.totalFiles = 0;
        this.completedFiles = 0;
        this.failedFiles = 0;
        
        // Performance metrics
        this.startTime = null;
        this.totalBytesDownloaded = 0;
        this.downloadSpeeds = [];
        
        // HTTP client with connection pooling
        this.httpClient = axios.create({
            timeout: this.timeout,
            maxRedirects: 5,
            httpAgent: new (require('http').Agent)({
                keepAlive: true,
                maxSockets: this.connectionPool,
                maxFreeSockets: 10,
                timeout: 60000
            }),
            httpsAgent: new (require('https').Agent)({
                keepAlive: true,
                maxSockets: this.connectionPool,
                maxFreeSockets: 10,
                timeout: 60000
            })
        });
    }

    /**
     * Add recordings to download queue
     */
    addRecordings(recordings) {
        this.totalFiles = recordings.length;
        this.downloadQueue = recordings.map((recording, index) => ({
            id: recording.uuid || recording.id,
            url: recording.download_url,
            filename: recording.filename || `${recording.uuid}.mp4`,
            priority: recording.priority || 0,
            retries: 0,
            index
        }));
        
        this.logger.info(`Added ${recordings.length} recordings to download queue`);
        return this;
    }

    /**
     * Start parallel download processing
     */
    async start() {
        this.startTime = Date.now();
        this.logger.info(`Starting parallel download with ${this.maxConcurrent} workers`);
        
        // Create worker pool
        const workers = [];
        for (let i = 0; i < this.maxConcurrent; i++) {
            workers.push(this.createWorker(i));
        }
        
        // Start processing
        await this.processQueue(workers);
        
        // Cleanup workers
        await Promise.all(workers.map(worker => worker.terminate()));
        
        this.logger.info('Parallel download completed');
        this.emit('complete', {
            total: this.totalFiles,
            completed: this.completedFiles,
            failed: this.failedFiles,
            duration: Date.now() - this.startTime,
            totalBytes: this.totalBytesDownloaded,
            averageSpeed: this.calculateAverageSpeed()
        });
    }

    /**
     * Create a download worker
     */
    createWorker(workerId) {
        const worker = new Worker(__filename, {
            workerData: {
                workerId,
                config: this.config,
                timeout: this.timeout,
                chunkSize: this.chunkSize
            }
        });

        worker.on('message', (message) => {
            this.handleWorkerMessage(message);
        });

        worker.on('error', (error) => {
            this.logger.error(`Worker ${workerId} error:`, error);
        });

        return worker;
    }

    /**
     * Process download queue with workers
     */
    async processQueue(workers) {
        return new Promise((resolve) => {
            const processNext = () => {
                if (this.downloadQueue.length === 0) {
                    if (this.activeDownloads.size === 0) {
                        resolve();
                    } else {
                        setTimeout(processNext, 100);
                    }
                    return;
                }

                // Find available worker
                const availableWorker = workers.find(worker => 
                    !this.activeDownloads.has(worker.threadId)
                );

                if (availableWorker) {
                    const download = this.downloadQueue.shift();
                    this.activeDownloads.set(availableWorker.threadId, download);
                    
                    availableWorker.postMessage({
                        type: 'download',
                        download
                    });
                }

                setTimeout(processNext, 10);
            };

            processNext();
        });
    }

    /**
     * Handle worker messages
     */
    handleWorkerMessage(message) {
        switch (message.type) {
            case 'progress':
                this.emit('progress', message);
                break;
                
            case 'complete':
                this.completedFiles++;
                this.totalBytesDownloaded += message.bytesDownloaded;
                this.downloadSpeeds.push(message.speed);
                this.completedDownloads.set(message.downloadId, message);
                this.activeDownloads.delete(message.workerId);
                this.emit('fileComplete', message);
                break;
                
            case 'error':
                this.failedFiles++;
                this.failedDownloads.set(message.downloadId, message);
                this.activeDownloads.delete(message.workerId);
                this.emit('fileError', message);
                
                // Retry logic
                const download = this.activeDownloads.get(message.workerId);
                if (download && download.retries < this.maxRetries) {
                    download.retries++;
                    this.downloadQueue.unshift(download);
                }
                break;
        }
    }

    /**
     * Calculate average download speed
     */
    calculateAverageSpeed() {
        if (this.downloadSpeeds.length === 0) return 0;
        return this.downloadSpeeds.reduce((a, b) => a + b, 0) / this.downloadSpeeds.length;
    }

    /**
     * Get download statistics
     */
    getStats() {
        return {
            total: this.totalFiles,
            completed: this.completedFiles,
            failed: this.failedFiles,
            inProgress: this.activeDownloads.size,
            queued: this.downloadQueue.length,
            duration: this.startTime ? Date.now() - this.startTime : 0,
            totalBytes: this.totalBytesDownloaded,
            averageSpeed: this.calculateAverageSpeed()
        };
    }
}

// Worker thread code
if (!isMainThread) {
    const { workerId, config, timeout, chunkSize } = workerData;
    const logger = new Logger(`DownloadWorker-${workerId}`);

    parentPort.on('message', async (message) => {
        if (message.type === 'download') {
            await downloadFile(message.download);
        }
    });

    async function downloadFile(download) {
        const startTime = Date.now();
        let bytesDownloaded = 0;
        
        try {
            logger.info(`Starting download: ${download.filename}`);
            
            // Create output directory
            const outputDir = path.join(config.processing.files.outputDir, 'downloads');
            await fs.mkdir(outputDir, { recursive: true });
            
            const outputPath = path.join(outputDir, download.filename);
            
            // Download with progress tracking
            const response = await axios({
                method: 'GET',
                url: download.url,
                responseType: 'stream',
                timeout,
                onDownloadProgress: (progressEvent) => {
                    bytesDownloaded = progressEvent.loaded;
                    const speed = bytesDownloaded / ((Date.now() - startTime) / 1000);
                    
                    parentPort.postMessage({
                        type: 'progress',
                        downloadId: download.id,
                        workerId,
                        bytesDownloaded,
                        speed,
                        filename: download.filename
                    });
                }
            });

            // Stream to file
            const writer = fs.createWriteStream(outputPath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            const duration = Date.now() - startTime;
            const speed = bytesDownloaded / (duration / 1000);

            parentPort.postMessage({
                type: 'complete',
                downloadId: download.id,
                workerId,
                filename: download.filename,
                outputPath,
                bytesDownloaded,
                duration,
                speed
            });

        } catch (error) {
            logger.error(`Download failed for ${download.filename}:`, error.message);
            
            parentPort.postMessage({
                type: 'error',
                downloadId: download.id,
                workerId,
                filename: download.filename,
                error: error.message
            });
        }
    }
}

module.exports = { ParallelDownloadProcessor }; 