/**
 * WebhookRecordingAdapter
 * 
 * Adapts webhook recording data to be compatible with the batch processing pipeline
 * Ensures webhook recordings are processed exactly like batch recordings
 */

const { Logger } = require('../../shared/logging/logger');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { createWriteStream } = require('fs');

class WebhookRecordingAdapter {
    constructor(container) {
        this.container = container;
        this.logger = container.resolve('logger') || new Logger();
        this.config = container.resolve('config');
        this.downloadDir = path.join(process.env.OUTPUT_DIR || './output', 'webhook-recordings');
    }

    /**
     * Transform webhook recording data to match batch processor format
     * @param {Object} webhookPayload - The raw webhook payload
     * @returns {Object} Recording object compatible with batch processor
     */
    async transformWebhookRecording(webhookPayload) {
        const webhookRecording = webhookPayload.payload?.object;
        if (!webhookRecording) {
            throw new Error('Invalid webhook payload: missing recording object');
        }

        this.logger.info(`Transforming webhook recording: ${webhookRecording.id} - ${webhookRecording.topic}`);

        // Transform to match the format expected by ProductionZoomProcessor
        const transformedRecording = {
            // Core identifiers
            uuid: webhookRecording.uuid,
            id: webhookRecording.id?.toString(),
            meeting_id: webhookRecording.id?.toString(),
            
            // Meeting details
            topic: webhookRecording.topic,
            start_time: webhookRecording.start_time,
            duration: this.ensureValidDuration(webhookRecording),
            timezone: webhookRecording.timezone,
            
            // Host information
            host_id: webhookRecording.host_id,
            host_email: webhookRecording.host_email,
            host_name: this.extractHostName(webhookRecording),
            
            // Recording metadata
            type: webhookRecording.type || 8, // Default to scheduled meeting
            recording_count: webhookRecording.recording_files?.length || 0,
            total_size: this.calculateTotalSize(webhookRecording.recording_files),
            share_url: webhookRecording.share_url,
            
            // Recording files
            recording_files: this.transformRecordingFiles(webhookRecording.recording_files),
            
            // Additional webhook-specific data
            download_access_token: webhookRecording.download_access_token,
            password: webhookRecording.password || webhookRecording.recording_play_passcode,
            participant_count: webhookRecording.participant_count,
            
            // Processing metadata
            source: 'webhook',
            dataSource: 'webhook',  // Ensure dataSource is set for indicators
            webhook_received_at: new Date().toISOString(),
            processing_status: 'pending'
        };

        // Add any custom fields that might be in the webhook
        if (webhookRecording.on_prem) {
            transformedRecording.on_prem = webhookRecording.on_prem;
        }

        return transformedRecording;
    }

    /**
     * Extract host name from webhook data
     */
    extractHostName(webhookRecording) {
        // Try different sources for host name
        if (webhookRecording.host_name) return webhookRecording.host_name;
        if (webhookRecording.host_email) {
            const emailParts = webhookRecording.host_email.split('@');
            return emailParts[0].replace(/[._-]/g, ' ')
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        }
        return 'Unknown Host';
    }

    /**
     * Transform recording files to match batch processor format
     */
    transformRecordingFiles(files) {
        if (!files || !Array.isArray(files)) return [];

        return files.map(file => ({
            id: file.id,
            meeting_id: file.meeting_id,
            recording_start: file.recording_start,
            recording_end: file.recording_end,
            file_type: file.file_type,
            file_size: file.file_size || 0,
            file_extension: file.file_extension || this.getFileExtension(file.file_type),
            play_url: file.play_url,
            download_url: file.download_url,
            status: file.status || 'completed',
            recording_type: file.recording_type || file.file_type
        }));
    }

    /**
     * Calculate total size of all recording files
     */
    calculateTotalSize(files) {
        if (!files || !Array.isArray(files)) return 0;
        return files.reduce((total, file) => total + (file.file_size || 0), 0);
    }

    /**
     * Get file extension based on file type
     */
    getFileExtension(fileType) {
        const typeToExtension = {
            'MP4': 'mp4',
            'M4A': 'm4a',
            'CHAT': 'txt',
            'TRANSCRIPT': 'vtt',
            'CC': 'vtt',
            'CSV': 'csv',
            'TIMELINE': 'json'
        };
        return typeToExtension[fileType?.toUpperCase()] || 'unknown';
    }

    /**
     * Ensure valid duration from webhook data
     * Webhooks sometimes provide duration in milliseconds or have timing issues
     */
    ensureValidDuration(webhookRecording) {
        const duration = webhookRecording.duration;
        
        // Always try to calculate from recording files first for accuracy
        if (webhookRecording.recording_files?.length > 0) {
            for (const file of webhookRecording.recording_files) {
                if (file.recording_start && file.recording_end) {
                    const start = new Date(file.recording_start).getTime();
                    const end = new Date(file.recording_end).getTime();
                    const calculatedDuration = Math.floor((end - start) / 1000); // Convert to seconds
                    if (calculatedDuration > 0) {
                        // Check if calculated duration significantly differs from webhook duration
                        if (duration && Math.abs(calculatedDuration - duration) > 60) {
                            this.logger.warn(`Duration mismatch detected! Webhook: ${duration}s, Calculated: ${calculatedDuration}s`);
                            this.logger.info(`Using calculated duration from recording file timestamps: ${calculatedDuration} seconds`);
                        } else {
                            this.logger.info(`Calculated duration from recording file: ${calculatedDuration} seconds`);
                        }
                        return calculatedDuration;
                    }
                }
            }
        }
        
        // Check if duration seems to be in milliseconds (unreasonably large number)
        if (duration > 86400) { // More than 24 hours in seconds
            // Might be milliseconds
            const durationInSeconds = Math.floor(duration / 1000);
            if (durationInSeconds < 86400) { // Less than 24 hours
                this.logger.info(`Converting duration from milliseconds: ${duration}ms -> ${durationInSeconds}s`);
                return durationInSeconds;
            }
        }
        
        // Log the duration for debugging
        this.logger.info(`Using webhook duration: ${duration} seconds`);
        return duration || 0;
    }

    /**
     * Download recording files using the webhook access token
     * This is needed because webhook recordings might have different auth
     */
    async downloadWebhookRecordingFiles(recording) {
        const downloadResults = [];
        
        if (!recording.recording_files || recording.recording_files.length === 0) {
            this.logger.warn('No recording files to download');
            return downloadResults;
        }

        // Create download directory
        await fs.mkdir(this.downloadDir, { recursive: true });

        // Use WebhookFileDownloader if available
        const downloader = this.container.resolve('webhookFileDownloader');

        for (const file of recording.recording_files) {
            try {
                const fileName = `${recording.id}_${file.file_type}.${file.file_extension}`;
                const filePath = path.join(this.downloadDir, fileName);

                // Use the enhanced downloader if available
                if (downloader && typeof downloader.downloadFile === 'function') {
                    const result = await downloader.downloadFile(file.download_url, filePath, {
                        fileName,
                        fileType: file.file_type,
                        accessToken: recording.download_access_token
                    });
                    
                    downloadResults.push({
                        file_type: file.file_type,
                        file_path: result.success ? result.path : null,
                        file_size: result.size || file.file_size,
                        success: result.success,
                        error: result.error
                    });
                } else {
                    // Fallback to direct download
                    // Parse URL to check for embedded access token
                    const urlObj = new URL(file.download_url);
                    const hasEmbeddedToken = urlObj.searchParams.has('access_token');
                    
                    let finalUrl = file.download_url;
                    
                    // Add access token to URL if not already present
                    if (!hasEmbeddedToken && recording.download_access_token) {
                        urlObj.searchParams.set('access_token', recording.download_access_token);
                        finalUrl = urlObj.toString();
                        this.logger.info(`Added webhook access token to URL`);
                    }
                    
                    const headers = {
                        'User-Agent': 'zoom-recording-processor/1.0'
                    };

                    this.logger.info(`Downloading webhook file: ${fileName}`);
                    this.logger.debug(`Download URL: ${finalUrl.replace(/access_token=[^&]+/, 'access_token=***')}`);
                    this.logger.debug(`Has access token: ${hasEmbeddedToken || !!recording.download_access_token}`);
                    
                    const response = await axios({
                        method: 'GET',
                        url: finalUrl,
                        headers,
                        responseType: 'stream',
                        timeout: 300000, // 5 minutes timeout
                        maxRedirects: 5,
                        validateStatus: (status) => status < 500 // Accept redirects
                    });

                    const writer = createWriteStream(filePath);
                    response.data.pipe(writer);

                    await new Promise((resolve, reject) => {
                        writer.on('finish', resolve);
                        writer.on('error', reject);
                    });

                    downloadResults.push({
                        file_type: file.file_type,
                        file_path: filePath,
                        file_size: file.file_size,
                        success: true
                    });

                    this.logger.info(`Successfully downloaded: ${fileName}`);
                }
            } catch (error) {
                this.logger.error(`Error downloading file ${file.file_type}:`, error.message);
                if (error.response) {
                    this.logger.error(`Response status: ${error.response.status}`);
                    this.logger.error(`Response headers:`, error.response.headers);
                }
                downloadResults.push({
                    file_type: file.file_type,
                    success: false,
                    error: error.message,
                    statusCode: error.response?.status
                });
            }
        }

        // Check if all downloads failed
        const allFailed = downloadResults.every(result => !result.success);
        
        // Check if failures are authentication-related (401/403)
        const authFailures = downloadResults.filter(result => 
            !result.success && (result.statusCode === 401 || result.statusCode === 403)
        );
        
        // Only attempt fallback if we have auth failures or all downloads failed
        if (allFailed && recording.id && authFailures.length > 0) {
            this.logger.warn(`All webhook downloads failed (${authFailures.length} auth failures). Attempting fallback to Zoom API...`);
            return await this.fallbackToZoomAPI(recording, downloadResults);
        } else if (allFailed && recording.id) {
            this.logger.warn('All downloads failed but no auth failures detected. Skipping API fallback.');
        }
        
        return downloadResults;
    }

    /**
     * Fallback to Zoom API when webhook downloads fail
     * @param {Object} recording - The recording object
     * @param {Array} failedResults - The failed download results
     * @returns {Array} Download results after fallback attempt
     */
    async fallbackToZoomAPI(recording, failedResults) {
        try {
            // Prevent infinite loops - check if we already tried API fallback
            if (recording._fallbackAttempted) {
                this.logger.warn('Fallback already attempted for this recording. Skipping to prevent loop.');
                return failedResults;
            }
            
            const zoomService = this.container.resolve('zoomService');
            if (!zoomService) {
                this.logger.error('ZoomService not available for fallback');
                return failedResults;
            }

            this.logger.info(`Attempting to fetch recording ${recording.id} via Zoom API...`);
            
            // Mark that we attempted fallback to prevent loops
            recording._fallbackAttempted = true;
            
            // Fetch the recording from Zoom API
            const apiRecording = await zoomService.getRecording(recording.id);
            
            if (!apiRecording || !apiRecording.recording_files) {
                this.logger.error('No recording files found via Zoom API');
                return failedResults;
            }

            this.logger.info(`Found ${apiRecording.recording_files.length} files via Zoom API. Attempting download...`);
            
            // Download files using Zoom API auth
            const apiDownloadResults = [];
            const token = await zoomService.getZoomToken();
            
            for (const file of apiRecording.recording_files) {
                try {
                    const fileName = `${recording.id}_${file.file_type}.${file.file_extension || this.getFileExtension(file.file_type)}`;
                    const filePath = path.join(this.downloadDir, fileName);
                    
                    // Use bearer token authentication for API downloads
                    const headers = {
                        'Authorization': `Bearer ${token}`,
                        'User-Agent': 'zoom-recording-processor/1.0'
                    };

                    this.logger.info(`Downloading via API: ${fileName}`);
                    
                    const response = await axios({
                        method: 'GET',
                        url: file.download_url,
                        headers,
                        responseType: 'stream',
                        timeout: 300000, // 5 minutes timeout
                        maxRedirects: 5,
                        validateStatus: (status) => status < 500
                    });

                    const writer = createWriteStream(filePath);
                    response.data.pipe(writer);

                    await new Promise((resolve, reject) => {
                        writer.on('finish', resolve);
                        writer.on('error', reject);
                    });

                    apiDownloadResults.push({
                        file_type: file.file_type,
                        file_path: filePath,
                        file_size: file.file_size,
                        success: true,
                        fallback_method: 'zoom_api'
                    });

                    this.logger.info(`Successfully downloaded via API: ${fileName}`);
                } catch (error) {
                    this.logger.error(`API download failed for ${file.file_type}:`, error.message);
                    apiDownloadResults.push({
                        file_type: file.file_type,
                        success: false,
                        error: error.message,
                        statusCode: error.response?.status,
                        fallback_method: 'zoom_api'
                    });
                }
            }

            // Log fallback results
            const successCount = apiDownloadResults.filter(r => r.success).length;
            this.logger.info(`Fallback download complete: ${successCount}/${apiDownloadResults.length} files downloaded successfully`);
            
            return apiDownloadResults;
        } catch (error) {
            this.logger.error('Error in Zoom API fallback:', error.message);
            return failedResults;
        }
    }

    /**
     * Queue recording for batch processor
     * This allows webhook recordings to be processed through the same pipeline
     */
    async queueForBatchProcessing(transformedRecording) {
        try {
            // Create a queue file that the batch processor can pick up
            const queueDir = path.join(process.env.OUTPUT_DIR || './output', 'webhook-queue');
            await fs.mkdir(queueDir, { recursive: true });

            const queueFile = path.join(queueDir, `${transformedRecording.uuid}.json`);
            await fs.writeFile(queueFile, JSON.stringify(transformedRecording, null, 2));

            this.logger.info(`Queued webhook recording for batch processing: ${queueFile}`);
            return { success: true, queueFile };
        } catch (error) {
            this.logger.error('Error queueing recording:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Process webhook recording immediately using batch processor
     */
    async processWebhookRecording(webhookPayload, productionProcessor) {
        try {
            // Transform webhook data
            const transformedRecording = await this.transformWebhookRecording(webhookPayload);
            
            // Download files if needed
            if (transformedRecording.download_access_token) {
                const downloadResults = await this.downloadWebhookRecordingFiles(transformedRecording);
                transformedRecording.webhook_download_results = downloadResults;
                
                // Log download summary
                const successCount = downloadResults.filter(r => r.success).length;
                const totalCount = downloadResults.length;
                this.logger.info(`Download summary: ${successCount}/${totalCount} files downloaded successfully`);
                
                if (successCount === 0 && totalCount > 0) {
                    this.logger.warn('No files were successfully downloaded for this recording');
                }
            }

            // Process using the production processor
            const processingResult = await productionProcessor.processRecording(transformedRecording);
            
            return {
                success: true,
                recording: transformedRecording,
                processingResult
            };
        } catch (error) {
            this.logger.error('Error processing webhook recording:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = { WebhookRecordingAdapter };