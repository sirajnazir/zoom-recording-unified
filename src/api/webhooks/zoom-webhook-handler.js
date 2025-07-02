const crypto = require('crypto');
const { Recording } = require('../../core/entities/Recording');
const { ValidationError, AuthenticationError } = require('../../shared/errors');
const logger = require('../../shared/logging/logger');
const config = require('../../config');

/**
 * Zoom webhook handler
 */
class ZoomWebhookHandler {
    constructor(recordingProcessor) {
        this.recordingProcessor = recordingProcessor;
        this.logger = logger.child('ZoomWebhook');
    }

    /**
     * Validate webhook signature
     */
    validateSignature(req) {
        const message = `v0:${req.headers['x-zm-request-timestamp']}:${JSON.stringify(req.body)}`;
        const hashForValidate = crypto
            .createHmac('sha256', config.zoom.webhookSecretToken)
            .update(message)
            .digest('hex');
        
        const signature = `v0=${hashForValidate}`;
        
        if (req.headers['x-zm-signature'] !== signature) {
            throw new AuthenticationError('Invalid webhook signature');
        }
    }

    /**
     * Handle webhook request
     */
    async handleWebhook(req, res) {
        const { event, payload } = req.body;
        
        this.logger.info('Webhook received', { event });
        
        // Acknowledge webhook immediately
        res.status(200).json({ message: 'Webhook acknowledged' });
        
        // Process event asynchronously
        this.processEvent(event, payload).catch(error => {
            this.logger.error('Error processing webhook event', error, { event });
        });
    }

    /**
     * Process webhook event
     */
    async processEvent(event, payload) {
        switch (event) {
            case 'recording.completed':
                await this.handleRecordingCompleted(payload);
                break;
                
            case 'recording.started':
                await this.handleRecordingStarted(payload);
                break;
                
            case 'recording.stopped':
                await this.handleRecordingStopped(payload);
                break;
                
            case 'recording.deleted':
                await this.handleRecordingDeleted(payload);
                break;
                
            default:
                this.logger.warn('Unhandled webhook event', { event });
        }
    }

    /**
     * Handle recording completed event
     */
    async handleRecordingCompleted(payload) {
        try {
            if (!payload.object) {
                throw new ValidationError('Invalid webhook payload: missing object');
            }

            const recordingData = payload.object;
            
            // Log recording details
            this.logger.info('Processing recording.completed', {
                id: recordingData.id,
                uuid: recordingData.uuid,
                topic: recordingData.topic,
                duration: recordingData.duration,
                hasDownloadToken: !!recordingData.download_access_token,
                filesCount: recordingData.recording_files?.length || 0
            });

            // Create Recording entity
            const recording = new Recording({
                id: recordingData.id,
                uuid: recordingData.uuid,
                meetingId: recordingData.meeting_id,
                topic: recordingData.topic,
                startTime: recordingData.start_time,
                duration: recordingData.duration,
                participants: recordingData.participants || [],
                recordingFiles: this._normalizeRecordingFiles(recordingData.recording_files || []),
                hostEmail: recordingData.host_email,
                downloadToken: recordingData.download_access_token,
                password: recordingData.password || recordingData.recording_play_passcode
            });

            // Process recording
            const result = await this.recordingProcessor.processRecording(recording);
            
            if (result.success) {
                this.logger.info('Recording processed successfully', {
                    recordingId: recording.id,
                    sessionName: result.data.standardizedName,
                    processingTime: result.duration
                });
            } else {
                this.logger.error('Recording processing failed', null, {
                    recordingId: recording.id,
                    error: result.error
                });
            }

        } catch (error) {
            this.logger.error('Error handling recording.completed', error, {
                recordingId: payload.object?.id
            });
        }
    }

    /**
     * Handle recording started event
     */
    async handleRecordingStarted(payload) {
        this.logger.info('Recording started', {
            meetingId: payload.object?.meeting_id,
            topic: payload.object?.topic
        });
    }

    /**
     * Handle recording stopped event
     */
    async handleRecordingStopped(payload) {
        this.logger.info('Recording stopped', {
            meetingId: payload.object?.meeting_id,
            topic: payload.object?.topic
        });
    }

    /**
     * Handle recording deleted event
     */
    async handleRecordingDeleted(payload) {
        this.logger.warn('Recording deleted', {
            recordingId: payload.object?.id,
            uuid: payload.object?.uuid
        });
        
        // TODO: Implement cleanup logic if needed
    }

    /**
     * Normalize recording files data
     */
    _normalizeRecordingFiles(files) {
        return files.map(file => ({
            id: file.id,
            recordingType: file.recording_type,
            fileType: file.file_type,
            fileExtension: file.file_extension,
            fileSize: file.file_size,
            downloadUrl: file.download_url,
            status: file.status,
            recordingStart: file.recording_start,
            recordingEnd: file.recording_end
        }));
    }
}

/**
 * Express middleware for webhook validation
 */
function webhookValidationMiddleware(req, res, next) {
    try {
        const handler = new ZoomWebhookHandler();
        handler.validateSignature(req);
        next();
    } catch (error) {
        next(error);
    }
}

module.exports = {
    ZoomWebhookHandler,
    webhookValidationMiddleware
}; 