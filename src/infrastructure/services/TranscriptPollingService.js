const { BaseService } = require('./BaseService');
const path = require('path');

/**
 * Service to poll for and download missing transcripts
 * This handles cases where transcript webhooks might be missed
 */
class TranscriptPollingService extends BaseService {
    constructor({ config, logger, zoomService, googleSheetsService, driveService, aiService }) {
        super({ config, logger });
        this.zoomService = zoomService;
        this.googleSheetsService = googleSheetsService;
        this.driveService = driveService;
        this.aiService = aiService;
        this.pollingInterval = config.transcriptPolling?.interval || 300000; // 5 minutes default
        this.maxRetries = config.transcriptPolling?.maxRetries || 3;
        this.isPolling = false;
    }
    
    /**
     * Start polling for missing transcripts
     */
    async startPolling() {
        if (this.isPolling) {
            this.logger.warn('Transcript polling already running');
            return;
        }
        
        this.isPolling = true;
        this.logger.info('Starting transcript polling service');
        
        // Run immediately, then on interval
        await this.checkForMissingTranscripts();
        
        this.pollingTimer = setInterval(async () => {
            try {
                await this.checkForMissingTranscripts();
            } catch (error) {
                this.logger.error('Error in transcript polling cycle:', error);
            }
        }, this.pollingInterval);
    }
    
    /**
     * Stop polling
     */
    stopPolling() {
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
        }
        this.isPolling = false;
        this.logger.info('Stopped transcript polling service');
    }
    
    /**
     * Check for recordings without transcripts
     */
    async checkForMissingTranscripts() {
        try {
            this.logger.info('Checking for recordings missing transcripts...');
            
            // Get recordings from the last 7 days that don't have transcripts
            const recentRecordings = await this.googleSheetsService.getRecentRecordingsWithoutTranscripts(7);
            
            if (!recentRecordings || recentRecordings.length === 0) {
                this.logger.info('No recordings missing transcripts');
                return;
            }
            
            this.logger.info(`Found ${recentRecordings.length} recordings without transcripts`);
            
            for (const recording of recentRecordings) {
                try {
                    await this.checkAndDownloadTranscript(recording);
                } catch (error) {
                    this.logger.error(`Failed to check transcript for ${recording.uuid}:`, error);
                }
            }
            
        } catch (error) {
            this.logger.error('Error checking for missing transcripts:', error);
        }
    }
    
    /**
     * Check if transcript is available and download it
     */
    async checkAndDownloadTranscript(recording) {
        try {
            // Skip if already retried too many times
            const retryCount = parseInt(recording.transcript_retry_count || 0);
            if (retryCount >= this.maxRetries) {
                return;
            }
            
            this.logger.info(`Checking transcript for recording ${recording.uuid} (attempt ${retryCount + 1})`);
            
            // Get recording details from Zoom API
            const zoomRecording = await this.zoomService.getRecording(recording.uuid);
            
            if (!zoomRecording || !zoomRecording.recording_files) {
                this.logger.warn(`No recording data found for ${recording.uuid}`);
                await this.updateRetryCount(recording.uuid, retryCount + 1);
                return;
            }
            
            // Look for transcript file
            const transcriptFile = zoomRecording.recording_files.find(file => 
                file.file_type === 'TRANSCRIPT' || 
                file.file_extension === 'VTT' ||
                file.recording_type === 'audio_transcript'
            );
            
            if (!transcriptFile) {
                this.logger.info(`No transcript available yet for ${recording.uuid}`);
                await this.updateRetryCount(recording.uuid, retryCount + 1);
                return;
            }
            
            this.logger.info(`Transcript found for ${recording.uuid}, downloading...`);
            
            // Download transcript
            const transcriptPath = await this.downloadTranscript(recording, transcriptFile);
            
            if (!transcriptPath) {
                this.logger.error(`Failed to download transcript for ${recording.uuid}`);
                await this.updateRetryCount(recording.uuid, retryCount + 1);
                return;
            }
            
            // Read transcript content
            const transcriptContent = await require('fs').promises.readFile(transcriptPath, 'utf8');
            
            // Update recording with transcript
            await this.updateRecordingWithTranscript(recording, transcriptContent, transcriptPath);
            
            this.logger.info(`Successfully processed transcript for ${recording.uuid}`);
            
        } catch (error) {
            this.logger.error(`Error processing transcript for ${recording.uuid}:`, error);
            const retryCount = parseInt(recording.transcript_retry_count || 0);
            await this.updateRetryCount(recording.uuid, retryCount + 1);
        }
    }
    
    /**
     * Download transcript file
     */
    async downloadTranscript(recording, transcriptFile) {
        try {
            const outputDir = path.join(
                process.env.OUTPUT_DIR || './output',
                `M:${recording.meeting_id}U:${recording.uuid}`
            );
            
            await require('fs').promises.mkdir(outputDir, { recursive: true });
            
            const transcriptPath = path.join(outputDir, 'transcript.vtt');
            
            // Get auth token
            const token = await this.zoomService.getZoomToken();
            
            const response = await require('axios')({
                method: 'GET',
                url: transcriptFile.download_url,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'zoom-recording-processor/1.0'
                },
                responseType: 'stream',
                timeout: 60000
            });
            
            const writer = require('fs').createWriteStream(transcriptPath);
            response.data.pipe(writer);
            
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            
            return transcriptPath;
            
        } catch (error) {
            this.logger.error('Error downloading transcript:', error);
            return null;
        }
    }
    
    /**
     * Update recording with transcript data (similar to webhook handler)
     */
    async updateRecordingWithTranscript(recording, transcriptContent, transcriptPath) {
        try {
            // Generate AI insights
            const aiInsights = await this.aiService.generateAIInsights(transcriptContent, {
                topic: recording.raw_name || recording.topic,
                start_time: recording.start_time,
                duration: Math.round((recording.duration || 0) / 60),
                host_email: recording.host_email,
                host_name: recording.host_name,
                uuid: recording.uuid
            });
            
            // Upload transcript to Drive if folder exists
            if (recording.drive_folder_id && this.driveService) {
                const standardizedName = recording.standardized_name || `Recording_${recording.meeting_id}`;
                const transcriptFileName = `${standardizedName}.vtt`;
                
                await this.driveService.files.create({
                    requestBody: {
                        name: transcriptFileName,
                        parents: [recording.drive_folder_id],
                        mimeType: 'text/vtt'
                    },
                    media: {
                        mimeType: 'text/vtt',
                        body: require('fs').createReadStream(transcriptPath)
                    }
                });
            }
            
            // Update Google Sheets
            const updateData = {
                uuid: recording.uuid,
                has_transcript: true,
                transcript_file_id: transcriptPath,
                transcript_quality: 'Good',
                transcript_retry_count: 0, // Reset retry count on success
                
                // AI insights
                insights_version: '2.0-smart-transcript',
                insights_generated: true,
                executive_summary: aiInsights.executiveSummary?.summary || '',
                key_topics: aiInsights.thematicAnalysis?.keyThemes?.join(', ') || '',
                engagement_score: aiInsights.engagementAnalysis?.overallScore || 0,
                action_items: aiInsights.actionItemsAnalysis?.items?.map(item => item.description).join('; ') || '',
                
                last_updated: new Date().toISOString(),
                update_reason: 'Transcript downloaded via polling'
            };
            
            await this.googleSheetsService.updateRecordingByUUID(recording.uuid, updateData);
            
        } catch (error) {
            this.logger.error('Error updating recording with transcript:', error);
            throw error;
        }
    }
    
    /**
     * Update retry count for a recording
     */
    async updateRetryCount(uuid, count) {
        try {
            await this.googleSheetsService.updateRecordingByUUID(uuid, {
                transcript_retry_count: count,
                transcript_last_check: new Date().toISOString()
            });
        } catch (error) {
            this.logger.error(`Error updating retry count for ${uuid}:`, error);
        }
    }
}

module.exports = { TranscriptPollingService };