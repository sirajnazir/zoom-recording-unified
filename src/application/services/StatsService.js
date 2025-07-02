// StatsService stub implementation
class StatsService {
    constructor({ logger }) {
        this.logger = logger;
    }

    async getOverviewStats() {
        this.logger.info('Getting overview stats (stub)');
        return {
            totalRecordings: 0,
            totalSessions: 0,
            totalStudents: 0,
            totalCoaches: 0,
            processingStats: {
                successful: 0,
                failed: 0,
                pending: 0
            }
        };
    }
}

module.exports = { StatsService };