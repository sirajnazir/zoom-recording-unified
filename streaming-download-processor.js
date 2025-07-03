const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const axios = require('axios');
const { Logger } = require('./src/shared/Logger');
const config = require('./src/shared/config/smart-config').config;

class StreamingDownloadProcessor extends EventEmitter {
    constructor(options = {}) {
        super();
        this.logger = new Logger('StreamingDownloadProcessor');
        this.config = config;
        
        // Download settings
        this.chunkSize = options.chunkSize || 1024 * 1024; // 1MB chunks
        this.maxConcurrent = options.maxConcurrent || 4;
        this.resumeDownloads = options.resumeDownloads !== false;
        this.verifyChecksums = options.verifyChecksums || false;
        
        // Progress tracking
        this.downloads = new Map();
        this.activeDownloads = 0;
        
        // HTTP client with streaming support
        this.httpClient = axios.create({
            timeout: 300000,
            maxRedirects: 5,
            responseType: 'stream'
        });
    }

    /**
     * Download file with streaming and resume capability
     */
    async downloadFile(recording, outputPath) {
        const downloadId = recording.uuid || recording.id;
        const downloadInfo = {
            id: downloadId,
            url: recording.download_url,
            outputPath,
            filename: path.basename(outputPath),
            size: 0,
            downloaded: 0,
            startTime: Date.now(),
            status: 'starting'
        };

        this.downloads.set(downloadId, downloadInfo);
        this.emit('downloadStart', downloadInfo);

        try {
            // Check if file exists and can be resumed
            let startByte = 0;
            if (this.resumeDownloads && fs.existsSync(outputPath)) {
                const stats = fs.statSync(outputPath);
                startByte = stats.size;
                downloadInfo.downloaded = startByte;
                this.logger.info(`Resuming download for ${downloadInfo.filename} from byte ${startByte}`);
            }

            // Create directory if needed
            await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

            // Get file size if resuming
            if (startByte > 0) {
                try {
                    const headResponse = await axios.head(recording.download_url);
                    const totalSize = parseInt(headResponse.headers['content-length']);
                    downloadInfo.size = totalSize;
                    
                    if (startByte >= totalSize) {
                        this.logger.info(`File ${downloadInfo.filename} already complete`);
                        downloadInfo.status = 'completed';
                        this.emit('downloadComplete', downloadInfo);
                        return downloadInfo;
                    }
                } catch (error) {
                    this.logger.warn(`Could not get file size for ${downloadInfo.filename}, starting fresh`);
                    startByte = 0;
                    downloadInfo.downloaded = 0;
                }
            }

            // Start streaming download
            downloadInfo.status = 'downloading';
            const response = await this.httpClient.get(recording.download_url, {
                headers: startByte > 0 ? { 'Range': `bytes=${startByte}-` } : {},
                responseType: 'stream'
            });

            // Get total size
            const contentLength = response.headers['content-length'];
            if (contentLength) {
                downloadInfo.size = parseInt(contentLength) + startByte;
            }

            // Create write stream
            const writeStream = fs.createWriteStream(outputPath, { 
                flags: startByte > 0 ? 'a' : 'w' 
            });

            // Track progress
            let lastProgressUpdate = Date.now();
            response.data.on('data', (chunk) => {
                downloadInfo.downloaded += chunk.length;
                
                // Emit progress every 100ms
                const now = Date.now();
                if (now - lastProgressUpdate > 100) {
                    this.emit('downloadProgress', {
                        ...downloadInfo,
                        progress: downloadInfo.size > 0 ? (downloadInfo.downloaded / downloadInfo.size) * 100 : 0,
                        speed: this.calculateSpeed(downloadInfo)
                    });
                    lastProgressUpdate = now;
                }
            });

            // Handle completion
            await new Promise((resolve, reject) => {
                writeStream.on('finish', () => {
                    downloadInfo.status = 'completed';
                    downloadInfo.duration = Date.now() - downloadInfo.startTime;
                    this.emit('downloadComplete', downloadInfo);
                    resolve();
                });

                writeStream.on('error', (error) => {
                    downloadInfo.status = 'error';
                    downloadInfo.error = error.message;
                    this.emit('downloadError', downloadInfo);
                    reject(error);
                });

                response.data.pipe(writeStream);
            });

            return downloadInfo;

        } catch (error) {
            downloadInfo.status = 'error';
            downloadInfo.error = error.message;
            this.emit('downloadError', downloadInfo);
            throw error;
        }
    }

    /**
     * Download multiple files with concurrency control
     */
    async downloadFiles(recordings, outputDir) {
        const downloadPromises = [];
        const semaphore = new Semaphore(this.maxConcurrent);

        for (const recording of recordings) {
            const outputPath = path.join(outputDir, `${recording.uuid || recording.id}.mp4`);
            
            const downloadPromise = semaphore.acquire().then(async (release) => {
                try {
                    const result = await this.downloadFile(recording, outputPath);
                    return result;
                } finally {
                    release();
                }
            });

            downloadPromises.push(downloadPromise);
        }

        return Promise.allSettled(downloadPromises);
    }

    /**
     * Calculate download speed
     */
    calculateSpeed(downloadInfo) {
        const elapsed = (Date.now() - downloadInfo.startTime) / 1000;
        return elapsed > 0 ? downloadInfo.downloaded / elapsed : 0;
    }

    /**
     * Get download statistics
     */
    getStats() {
        const downloads = Array.from(this.downloads.values());
        const completed = downloads.filter(d => d.status === 'completed');
        const failed = downloads.filter(d => d.status === 'error');
        const inProgress = downloads.filter(d => d.status === 'downloading');

        return {
            total: downloads.length,
            completed: completed.length,
            failed: failed.length,
            inProgress: inProgress.length,
            totalBytes: completed.reduce((sum, d) => sum + d.downloaded, 0),
            averageSpeed: completed.length > 0 
                ? completed.reduce((sum, d) => sum + this.calculateSpeed(d), 0) / completed.length 
                : 0
        };
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

module.exports = { StreamingDownloadProcessor }; 