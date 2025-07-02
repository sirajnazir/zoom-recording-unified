// ParticipantAnalyzer stub implementation
class ParticipantAnalyzer {
    constructor({ logger, knowledgeBaseService }) {
        this.logger = logger;
        this.knowledgeBaseService = knowledgeBaseService;
    }

    async analyzeParticipants(participants) {
        this.logger.info('Analyzing participants (stub)');
        return {
            balance: 0.5,
            coach: { engagement: 0.7 },
            student: { engagement: 0.7 },
            insights: []
        };
    }
}

module.exports = { ParticipantAnalyzer };