// TranscriptAnalyzer stub implementation
class TranscriptAnalyzer {
    constructor({ logger }) {
        this.logger = logger;
    }

    async analyzeTranscript(transcript) {
        this.logger.info('Analyzing transcript (stub)');
        return {
            insights: [],
            speakerAnalysis: {},
            questions: [],
            sentiment: { overall: 'neutral' }
        };
    }
}

module.exports = { TranscriptAnalyzer };