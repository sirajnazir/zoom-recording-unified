const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class EnhancedRecordingDownloader extends EventEmitter {
    constructor({ logger, config, zoomService, options = {} }) {
        super();
        this.logger = logger;
        this.config = config;
        this.zoomService = zoomService;
        
        // Enhanced download settings
        this.useParallelDownloads = options.useParallelDownloads || false;
        this.useStreamingDownloads = options.useStreamingDownloads || false;
        this.downloadConcurrency = options.downloadConcurrency || 4;
        this.downloadTimeout = options.downloadTimeout || 300000; // 5 minutes
        this.enableResumeDownloads = options.enableResumeDownloads !== false;
        this.maxRetries = options.maxRetries || 3;
        
        // Connection pool for parallel downloads
        this.connectionPool = new Map();
        this.maxConnections = options.maxConnections || 20;
        
        this.logger.info(`Enhanced Recording Downloader initialized with:`);
        this.logger.info(`  - Parallel Downloads: ${this.useParallelDownloads ? 'ENABLED' : 'DISABLED'}`);
        this.logger.info(`  - Streaming Downloads: ${this.useStreamingDownloads ? 'ENABLED' : 'DISABLED'}`);
        this.logger.info(`  - Download Concurrency: ${this.downloadConcurrency}`);
        this.logger.info(`  - Resume Downloads: ${this.enableResumeDownloads ? 'ENABLED' : 'DISABLED'}`);
    }

    /**
     * Download all files for a recording with enhanced capabilities
     */
    async downloadRecordingFiles(recording, outputDir, options = {}) {
        const { lightweight = false, skipVideo = false, skipAudio = false } = options;
        
        const results = {
            success: true,
            files: {},
            errors: [],
            downloadMethod: 'standard'
        };

        try {
            // Create output directory if it doesn't exist
            await fs.promises.mkdir(outputDir, { recursive: true });

            // Get detailed recording info if we only have basic data
            let recordingDetails = recording;
            if (!recording.recording_files && recording.uuid) {
                recordingDetails = await this.zoomService.getRecording(recording.uuid);
            }

            if (!recordingDetails || !recordingDetails.recording_files) {
                throw new Error('No recording files found');
            }

            // File type mapping to ensure consistent lowercase keys
            const fileTypeMapping = {
                'MP4': 'video',
                'M4A': 'audio',
                'TRANSCRIPT': 'transcript',
                'TIMELINE': 'timeline',
                'CHAT': 'chat',
                'CC': 'captions',
                'CSV': 'participants',
                'VTT': 'transcript'
            };

            // Define which files to download based on mode
            const criticalFileTypes = ['transcript', 'timeline', 'chat', 'participants', 'captions'];
            const heavyFileTypes = ['video', 'audio'];

            // Filter files to download
            const filesToDownload = [];
            for (const file of recordingDetails.recording_files) {
                const mappedType = fileTypeMapping[file.file_type] || file.file_type.toLowerCase();
                
                // Skip files based on mode
                if (skipVideo && mappedType === 'video') {
                    this.logger.info(`☁️ CLOUD LIGHTWEIGHT: Skipping video file: ${file.file_name}`);
                    continue;
                }
                
                if (skipAudio && mappedType === 'audio') {
                    this.logger.info(`☁️ CLOUD LIGHTWEIGHT: Skipping audio file: ${file.file_name}`);
                    continue;
                }
                
                if (lightweight && heavyFileTypes.includes(mappedType)) {
                    this.logger.info(`⏭️ Skipping heavy file in lightweight mode: ${mappedType} (${file.file_name})`);
                    continue;
                }
                
                if (lightweight && !criticalFileTypes.includes(mappedType)) {
                    this.logger.info(`⏭️ Skipping non-critical file in lightweight mode: ${mappedType} (${file.file_name})`);
                    continue;
                }
                
                if (file.download_url) {
                    filesToDownload.push({
                        file,
                        mappedType,
                        fileName: this.generateFileName(file, recording),
                        filePath: path.join(outputDir, this.generateFileName(file, recording))
                    });
                } else {
                    this.logger.warn(`No download URL for ${mappedType}`);
                }
            }

            // Choose download strategy
            if (this.useParallelDownloads && filesToDownload.length > 1) {
                this.logger.info(`🚀 Using PARALLEL download for ${filesToDownload.length} files`);
                results.downloadMethod = 'parallel';
                await this.downloadFilesParallel(filesToDownload, results);
            } else if (this.useStreamingDownloads) {
                this.logger.info(`🌊 Using STREAMING download for ${filesToDownload.length} files`);
                results.downloadMethod = 'streaming';
                await this.downloadFilesStreaming(filesToDownload, results);
            } else {
                this.logger.info(`📥 Using STANDARD download for ${filesToDownload.length} files`);
                results.downloadMethod = 'standard';
                await this.downloadFilesStandard(filesToDownload, results);
            }

            // Download transcript if available (only if not already downloaded)
            if (recordingDetails.transcript_url && !results.files.transcript) {
                try {
                    const transcriptPath = path.join(outputDir, 'transcript.vtt');
                    await this.downloadFile(recordingDetails.transcript_url, transcriptPath);
                    results.files.transcript = transcriptPath;
                    this.logger.info('✅ Downloaded transcript');
                } catch (error) {
                    this.logger.error('Failed to download transcript:', error);
                    results.errors.push({ file: 'transcript', error: error.message });
                }
            }

            return results;
        } catch (error) {
            this.logger.error('Failed to download recording files:', error);
            results.success = false;
            results.errors.push({ file: 'general', error: error.message });
            return results;
        }
    }

    /**
     * Download files using parallel processing
     */
    async downloadFilesParallel(filesToDownload, results) {
        const semaphore = new Semaphore(this.downloadConcurrency);
        
        const downloadPromises = filesToDownload.map(async (fileInfo) => {
            return semaphore.acquire().then(async (release) => {
                try {
                    const { file, mappedType, fileName, filePath } = fileInfo;
                    
                    this.logger.info(`📥 [PARALLEL] Downloading ${mappedType}: ${fileName}`);
                    this.emit('downloadStart', { fileType: mappedType, fileName, method: 'parallel' });
                    
                    await this.downloadFileWithRetry(file.download_url, filePath, this.maxRetries);
                    
                    results.files[mappedType] = filePath;
                    this.logger.info(`✅ [PARALLEL] Downloaded ${mappedType}: ${fileName}`);
                    this.emit('downloadComplete', { fileType: mappedType, fileName, method: 'parallel' });
                    
                    return { success: true, mappedType, filePath };
                } catch (error) {
                    this.logger.error(`❌ [PARALLEL] Failed to download ${fileInfo.mappedType}:`, error);
                    results.errors.push({ file: fileInfo.mappedType, error: error.message });
                    results.success = false;
                    this.emit('downloadError', { fileType: fileInfo.mappedType, fileName: fileInfo.fileName, error: error.message, method: 'parallel' });
                    
                    return { success: false, mappedType: fileInfo.mappedType, error: error.message };
                } finally {
                    release();
                }
            });
        });

        await Promise.all(downloadPromises);
    }

    /**
     * Download files using streaming with resume capability
     */
    async downloadFilesStreaming(filesToDownload, results) {
        for (const fileInfo of filesToDownload) {
            try {
                const { file, mappedType, fileName, filePath } = fileInfo;
                
                this.logger.info(`🌊 [STREAMING] Downloading ${mappedType}: ${fileName}`);
                this.emit('downloadStart', { fileType: mappedType, fileName, method: 'streaming' });
                
                await this.downloadFileStreaming(file.download_url, filePath);
                
                results.files[mappedType] = filePath;
                this.logger.info(`✅ [STREAMING] Downloaded ${mappedType}: ${fileName}`);
                this.emit('downloadComplete', { fileType: mappedType, fileName, method: 'streaming' });
                
            } catch (error) {
                this.logger.error(`❌ [STREAMING] Failed to download ${fileInfo.mappedType}:`, error);
                results.errors.push({ file: fileInfo.mappedType, error: error.message });
                results.success = false;
                this.emit('downloadError', { fileType: fileInfo.mappedType, fileName: fileInfo.fileName, error: error.message, method: 'streaming' });
            }
        }
    }

    /**
     * Download files using standard sequential method
     */
    async downloadFilesStandard(filesToDownload, results) {
        for (const fileInfo of filesToDownload) {
            try {
                const { file, mappedType, fileName, filePath } = fileInfo;
                
                this.logger.info(`📥 [STANDARD] Downloading ${mappedType}: ${fileName}`);
                this.emit('downloadStart', { fileType: mappedType, fileName, method: 'standard' });
                
                await this.downloadFile(file.download_url, filePath);
                
                results.files[mappedType] = filePath;
                this.logger.info(`✅ [STANDARD] Downloaded ${mappedType}: ${fileName}`);
                this.emit('downloadComplete', { fileType: mappedType, fileName, method: 'standard' });
                
            } catch (error) {
                this.logger.error(`❌ [STANDARD] Failed to download ${fileInfo.mappedType}:`, error);
                results.errors.push({ file: fileInfo.mappedType, error: error.message });
                results.success = false;
                this.emit('downloadError', { fileType: fileInfo.mappedType, fileName: fileInfo.fileName, error: error.message, method: 'standard' });
            }
        }
    }

    /**
     * Download a single file with retry capability
     */
    async downloadFileWithRetry(downloadUrl, outputPath, maxRetries = 3) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await this.downloadFile(downloadUrl, outputPath);
                return outputPath;
            } catch (error) {
                lastError = error;
                this.logger.warn(`Download attempt ${attempt}/${maxRetries} failed: ${error.message}`);
                
                if (attempt < maxRetries) {
                    // Wait before retry (exponential backoff)
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        throw lastError;
    }

    /**
     * Download a single file with streaming and resume capability
     */
    async downloadFileStreaming(downloadUrl, outputPath) {
        if (!downloadUrl || typeof downloadUrl !== 'string') {
            throw new Error('Invalid download URL');
        }

        try {
            // Check if file exists for resume
            let startByte = 0;
            if (this.enableResumeDownloads && await fs.promises.access(outputPath).then(() => true).catch(() => false)) {
                const stats = await fs.promises.stat(outputPath);
                startByte = stats.size;
                this.logger.info(`🔄 Resuming download from byte ${startByte}`);
            }

            // Use Zoom service's download method if available
            if (this.zoomService && this.zoomService.downloadFile) {
                const data = await this.zoomService.downloadFile(downloadUrl, path.basename(outputPath));
                if (data) {
                    await fs.promises.writeFile(outputPath, data);
                    return outputPath;
                }
            }

            // Fallback to streaming download
            const headers = this.zoomService?.headers || {};
            const authenticatedUrl = `${downloadUrl}?access_token=${headers.Authorization?.split(' ')[1] || ''}`;
            
            const requestHeaders = { ...headers };
            if (startByte > 0) {
                requestHeaders['Range'] = `bytes=${startByte}-`;
            }
            
            const response = await axios({
                method: 'GET',
                url: authenticatedUrl,
                responseType: 'stream',
                timeout: this.downloadTimeout,
                headers: requestHeaders
            });

            const writer = fs.createWriteStream(outputPath, { flags: startByte > 0 ? 'a' : 'w' });
            
            let downloadedBytes = startByte;
            const totalBytes = parseInt(response.headers['content-length']) || 0;
            
            response.data.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                const progress = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;
                this.emit('downloadProgress', { 
                    downloadedBytes, 
                    totalBytes, 
                    progress: Math.round(progress),
                    fileName: path.basename(outputPath)
                });
            });

            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(outputPath));
                writer.on('error', reject);
                response.data.on('error', reject);
            });
        } catch (error) {
            this.logger.error(`Failed to download file from ${downloadUrl}:`, error.message);
            throw error;
        }
    }

    /**
     * Download a single file from URL (original method preserved)
     */
    async downloadFile(downloadUrl, outputPath) {
        if (!downloadUrl || typeof downloadUrl !== 'string') {
            throw new Error('Invalid download URL');
        }

        try {
            // Use Zoom service's download method if available
            if (this.zoomService && this.zoomService.downloadFile) {
                const data = await this.zoomService.downloadFile(downloadUrl, path.basename(outputPath));
                if (data) {
                    await fs.promises.writeFile(outputPath, data);
                    return outputPath;
                }
            }

            // Fallback to direct download
            const headers = this.zoomService?.headers || {};
            const authenticatedUrl = `${downloadUrl}?access_token=${headers.Authorization?.split(' ')[1] || ''}`;
            
            const response = await axios({
                method: 'GET',
                url: authenticatedUrl,
                responseType: 'stream',
                timeout: this.downloadTimeout,
                headers: headers
            });

            const writer = fs.createWriteStream(outputPath);
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(outputPath));
                writer.on('error', reject);
            });
        } catch (error) {
            this.logger.error(`Failed to download file from ${downloadUrl}:`, error.message);
            throw error;
        }
    }

    /**
     * Download transcript content (preserved from original)
     */
    async downloadTranscript(transcriptUrl) {
        try {
            if (!transcriptUrl) {
                return null;
            }

            // Use Zoom service's transcript download if available
            if (this.zoomService && this.zoomService.downloadTranscript) {
                const result = await this.zoomService.downloadTranscript(transcriptUrl);
                return result.content;
            }

            // Fallback to direct download
            const headers = this.zoomService?.headers || {};
            const response = await axios.get(transcriptUrl, {
                headers: headers,
                timeout: 30000
            });

            return response.data;
        } catch (error) {
            this.logger.error('Failed to download transcript:', error);
            throw error;
        }
    }

    /**
     * Generate filename for recording file (preserved from original)
     */
    generateFileName(file, recording) {
        const fileType = file.file_type.toLowerCase();
        const extension = this.getFileExtension(fileType);
        
        // Don't include UUID in filename since it's already in the directory path
        // Just use the file type with extension
        return `${fileType}${extension}`;
    }

    /**
     * Get file extension based on file type (preserved from original)
     */
    getFileExtension(fileType) {
        const extensions = {
            'mp4': '.mp4',
            'm4a': '.m4a',
            'transcript': '.vtt',
            'timeline': '.json',
            'chat': '.txt',
            'cc': '.vtt',
            'csv': '.csv',
            'vtt': '.vtt'
        };
        
        return extensions[fileType.toLowerCase()] || '';
    }

    /**
     * Check if download is enabled (preserved from original)
     */
    isDownloadEnabled() {
        return this.config?.download?.enabled !== false;
    }

    /**
     * Get download directory for recording (preserved from original)
     */
    getDownloadDirectory(recording) {
        const baseDir = this.config?.download?.outputDir || './downloads';
        const recordingId = recording.uuid || recording.id || 'unknown';
        return path.join(baseDir, recordingId);
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

module.exports = { EnhancedRecordingDownloader }; 