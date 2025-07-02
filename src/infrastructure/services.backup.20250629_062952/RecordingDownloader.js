// src/infrastructure/services/RecordingDownloader.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class RecordingDownloader {
    constructor({ logger, config, zoomService }) {
        this.logger = logger;
        this.config = config;
        this.zoomService = zoomService;
    }

    /**
     * Download all files for a recording
     */
    async downloadRecordingFiles(recording, outputDir) {
        const results = {
            success: true,
            files: {},
            errors: []
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

            // Download each file
            for (const file of recordingDetails.recording_files) {
                try {
                    const fileName = this.generateFileName(file, recording);
                    const filePath = path.join(outputDir, fileName);
                    
                    // Map file type to lowercase key
                    const mappedType = fileTypeMapping[file.file_type] || file.file_type.toLowerCase();
                    
                    this.logger.info(`Downloading ${mappedType}: ${fileName}`);
                    
                    if (file.download_url) {
                        await this.downloadFile(file.download_url, filePath);
                        results.files[mappedType] = filePath;
                        this.logger.info(`✅ Downloaded ${mappedType}: ${fileName}`);
                    } else {
                        this.logger.warn(`No download URL for ${mappedType}`);
                    }
                } catch (error) {
                    this.logger.error(`Failed to download ${file.file_type}:`, error);
                    results.errors.push({ file: file.file_type, error: error.message });
                    results.success = false;
                }
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
     * Download a single file from URL
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
                timeout: 300000, // 5 minutes
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
     * Download transcript content
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
     * Generate filename for recording file
     */
    generateFileName(file, recording) {
        const timestamp = new Date(recording.start_time).toISOString().split('T')[0];
        const sanitizedTopic = (recording.topic || 'recording').replace(/[^a-z0-9]/gi, '_');
        const fileType = file.file_type.toLowerCase();
        const extension = file.file_extension || this.getFileExtension(file.file_type);
        
        return `${sanitizedTopic}_${timestamp}_${fileType}.${extension}`;
    }

    /**
     * Get file extension based on file type
     */
    getFileExtension(fileType) {
        const extensions = {
            'MP4': 'mp4',
            'M4A': 'm4a',
            'TIMELINE': 'json',
            'TRANSCRIPT': 'vtt',
            'CHAT': 'txt',
            'CC': 'vtt',
            'CSV': 'csv'
        };
        
        return extensions[fileType.toUpperCase()] || 'dat';
    }

    /**
     * Check if downloads are enabled
     */
    isDownloadEnabled() {
        return this.config?.processing?.downloadFiles !== false;
    }

    /**
     * Get download directory for a recording
     */
    getDownloadDirectory(recording) {
        const baseDir = this.config?.processing?.outputDir || './output';
        const timestamp = new Date(recording.start_time).toISOString().split('T')[0];
        const sanitizedTopic = (recording.topic || 'recording').replace(/[^a-z0-9]/gi, '_');
        
        return path.join(baseDir, 'recordings', timestamp, sanitizedTopic);
    }
}

module.exports = RecordingDownloader; 