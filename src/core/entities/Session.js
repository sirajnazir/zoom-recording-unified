/**
 * Session entity representing an analyzed coaching session
 */
class Session {
    constructor({
        recordingId,
        coach,
        student,
        sessionType,
        weekNumber,
        startTime,
        duration,
        confidence = {},
        evidence = [],
        insights = {},
        outcomes = []
    }) {
        this.recordingId = recordingId;
        this.coach = coach;
        this.student = student;
        this.sessionType = sessionType;
        this.weekNumber = weekNumber;
        this.startTime = new Date(startTime);
        this.duration = duration;
        this.confidence = confidence;
        this.evidence = evidence;
        this.insights = insights;
        this.outcomes = outcomes;
        
        this._validate();
    }

    _validate() {
        if (!this.recordingId) throw new Error('Recording ID is required');
        if (!this.sessionType) throw new Error('Session type is required');
        if (!this.startTime) throw new Error('Start time is required');
        if (typeof this.duration !== 'number' || this.duration < 0) {
            throw new Error('Duration must be a positive number');
        }
        
        const validSessionTypes = ['Coach-Student', 'Admin', 'MISC', 'Trivial'];
        if (!validSessionTypes.includes(this.sessionType)) {
            throw new Error(`Session type must be one of: ${validSessionTypes.join(', ')}`);
        }
    }

    get standardizedName() {
        const parts = [];
        
        if (this.sessionType === 'Coach-Student' && this.coach && this.student) {
            parts.push(this.coach, this.student);
        } else if (this.sessionType === 'Admin' && this.coach) {
            parts.push(this.coach, 'Admin');
        } else if (this.sessionType === 'MISC') {
            parts.push('MISC');
        } else if (this.sessionType === 'Trivial') {
            parts.push('Trivial');
        }
        
        if (this.weekNumber) {
            parts.push(`Week${this.weekNumber}`);
        }
        
        const dateStr = this.startTime.toISOString().split('T')[0];
        parts.push(dateStr);
        
        return parts.filter(Boolean).join('_');
    }

    get overallConfidence() {
        const scores = Object.values(this.confidence).filter(score => score > 0);
        if (scores.length === 0) return 0;
        
        const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        const highConfidenceCount = scores.filter(score => score >= 80).length;
        const boost = Math.min(highConfidenceCount * 5, 20);
        
        return Math.min(average + boost, 100);
    }

    isValid() {
        return this.overallConfidence >= 60;
    }

    isCoachingSession() {
        return this.sessionType === 'Coach-Student';
    }

    hasCompleteData() {
        return !!(this.coach && this.student && this.weekNumber && this.sessionType);
    }

    toJSON() {
        return {
            recordingId: this.recordingId,
            coach: this.coach,
            student: this.student,
            sessionType: this.sessionType,
            weekNumber: this.weekNumber,
            startTime: this.startTime.toISOString(),
            duration: this.duration,
            confidence: this.confidence,
            evidence: this.evidence,
            standardizedName: this.standardizedName,
            overallConfidence: this.overallConfidence,
            isValid: this.isValid(),
            hasCompleteData: this.hasCompleteData()
        };
    }
}

module.exports = { Session }; 