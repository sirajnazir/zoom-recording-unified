// RecordingProcessor stub implementation
class RecordingProcessor {
    constructor({ logger, insightsGenerator, outcomesProcessor, googleSheetsService }) {
        this.logger = logger;
        this.insightsGenerator = insightsGenerator;
        this.outcomesProcessor = outcomesProcessor;
        this.googleSheetsService = googleSheetsService;
    }

    async processRecording(recordingData) {
        this.logger.info('Processing recording (stub)', { recordingId: recordingData.id });
        
        // Return mock result
        return {
            success: true,
            recordingId: recordingData.id,
            session: { id: 'session-stub', topic: recordingData.topic },
            insights: { stub: true },
            outcomes: { stub: true }
        };
    }
}

module.exports = { RecordingProcessor };