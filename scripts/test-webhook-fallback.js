/**
 * Test script to verify webhook download fallback logic
 */

require('dotenv').config();
const { getContainer } = require('../src/container');
const { WebhookRecordingAdapter } = require('../src/infrastructure/services/WebhookRecordingAdapter');

async function testWebhookFallback() {
    const container = getContainer();
    const logger = container.resolve('logger');
    const adapter = new WebhookRecordingAdapter(container);

    // Mock webhook payload with invalid access token to trigger fallback
    const mockWebhookPayload = {
        payload: {
            object: {
                uuid: "test-uuid-123",
                id: "123456789", // This should be a real recording ID from your Zoom account for testing
                topic: "Test Recording - Webhook Fallback",
                start_time: new Date().toISOString(),
                duration: 3600,
                timezone: "America/New_York",
                host_id: "test-host-id",
                host_email: "test@example.com",
                type: 8,
                share_url: "https://zoom.us/share/test",
                download_access_token: "invalid-token-to-trigger-fallback", // Invalid token
                recording_files: [
                    {
                        id: "file-1",
                        meeting_id: "123456789",
                        recording_start: new Date().toISOString(),
                        recording_end: new Date(Date.now() + 3600000).toISOString(),
                        file_type: "MP4",
                        file_size: 1024000,
                        play_url: "https://zoom.us/play/test",
                        download_url: "https://zoom.us/rec/download/test-file",
                        status: "completed",
                        recording_type: "shared_screen_with_speaker_view"
                    },
                    {
                        id: "file-2",
                        meeting_id: "123456789",
                        recording_start: new Date().toISOString(),
                        recording_end: new Date(Date.now() + 3600000).toISOString(),
                        file_type: "TRANSCRIPT",
                        file_size: 10240,
                        play_url: "https://zoom.us/play/test-transcript",
                        download_url: "https://zoom.us/rec/download/test-transcript",
                        status: "completed",
                        recording_type: "audio_transcript"
                    }
                ]
            }
        }
    };

    try {
        logger.info('Testing webhook download with fallback...');
        
        // Transform the webhook recording
        const transformedRecording = await adapter.transformWebhookRecording(mockWebhookPayload);
        logger.info('Transformed recording:', {
            id: transformedRecording.id,
            topic: transformedRecording.topic,
            fileCount: transformedRecording.recording_files.length
        });

        // Test download with fallback
        logger.info('Attempting downloads (should fail and trigger fallback)...');
        const downloadResults = await adapter.downloadWebhookRecordingFiles(transformedRecording);
        
        // Analyze results
        const successCount = downloadResults.filter(r => r.success).length;
        const fallbackCount = downloadResults.filter(r => r.fallback_method === 'zoom_api').length;
        
        logger.info('Download results:', {
            total: downloadResults.length,
            successful: successCount,
            failed: downloadResults.length - successCount,
            usedFallback: fallbackCount
        });

        // Display detailed results
        downloadResults.forEach(result => {
            logger.info(`File ${result.file_type}:`, {
                success: result.success,
                method: result.fallback_method || 'webhook',
                error: result.error,
                path: result.file_path
            });
        });

    } catch (error) {
        logger.error('Test failed:', error);
    }
}

// Run the test
testWebhookFallback().catch(console.error);