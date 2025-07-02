class TranscriptionAnalyzer {
    constructor({ logger = console, cache = null, config = {}, openaiApiKey = null } = {}) {
        this.logger = logger;
        this.cache = cache;
        this.config = config;
        this.openaiApiKey = openaiApiKey;
    }

    analyzeTranscript(transcript, options = {}) {
        // Dummy implementation: just return a summary
        return {
            content: transcript ? transcript.slice(0, 100) : '',
            summary: 'Dummy summary',
            speakers: [],
            topics: [],
            engagementScore: 0
        };
    }
}

module.exports = { TranscriptionAnalyzer }; 