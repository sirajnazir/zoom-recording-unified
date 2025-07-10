const MultiTabGoogleSheetsService = require('../src/infrastructure/services/MultiTabGoogleSheetsService.js');
const { Logger } = require('../src/shared/Logger.js');
const config = require('../config/index.js');

const logger = new Logger('DriveImportStatusChecker');

async function checkDriveImportStatus() {
    try {
        logger.info('Checking Drive Import tabs status...');
        
        const sheetsService = new MultiTabGoogleSheetsService({ config, logger });
        
        // Wait a moment for initialization to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Get recordings from Drive Import source
        const driveRecordings = await sheetsService.getRecordingsBySource('drive');
        
        logger.info('Drive Import recordings found:', {
            totalCount: driveRecordings.length
        });
        
        // Get data source statistics
        const stats = await sheetsService.getDataSourceStats();
        logger.info('Data source statistics:', stats);
        
        // Show sample of recent Drive Import data if any exists
        if (driveRecordings.length > 0) {
            logger.info('Sample of recent Drive Import recordings (first 5):');
            driveRecordings.slice(0, 5).forEach((recording, index) => {
                logger.info(`Recording ${index + 1}:`, {
                    uuid: recording.uuid,
                    meetingId: recording.meetingId,
                    topic: recording.topic,
                    startTime: recording.startTime,
                    fileName: recording.fileName,
                    status: recording.status
                });
            });
        } else {
            logger.info('No Drive Import recordings found in the sheets.');
        }
        
    } catch (error) {
        logger.error('Error checking Drive Import status:', error);
    }
}

// Run the check
checkDriveImportStatus();