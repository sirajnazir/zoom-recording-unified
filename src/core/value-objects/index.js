/**
 * Confidence score value object
 */
class ConfidenceScore {
    constructor(value) {
        if (typeof value !== 'number' || value < 0 || value > 100) {
            throw new Error('Confidence score must be a number between 0 and 100');
        }
        this.value = value;
    }

    isHigh() {
        return this.value >= 80;
    }

    isMedium() {
        return this.value >= 60 && this.value < 80;
    }

    isLow() {
        return this.value < 60;
    }

    toString() {
        return `${this.value}%`;
    }
}

/**
 * Week number value object
 */
class WeekNumber {
    constructor(value) {
        if (!Number.isInteger(value) || value < 1 || value > 100) {
            throw new Error('Week number must be an integer between 1 and 100');
        }
        this.value = value;
    }

    toString() {
        return `Week ${this.value}`;
    }

    toFilenamePart() {
        return `Week${this.value}`;
    }
}

/**
 * Session type value object
 */
class SessionType {
    static COACH_STUDENT = 'Coach-Student';
    static ADMIN = 'Admin';
    static MISC = 'MISC';
    static TRIVIAL = 'Trivial';

    static validTypes = [
        SessionType.COACH_STUDENT,
        SessionType.ADMIN,
        SessionType.MISC,
        SessionType.TRIVIAL
    ];

    constructor(value) {
        if (!SessionType.validTypes.includes(value)) {
            throw new Error(`Invalid session type. Must be one of: ${SessionType.validTypes.join(', ')}`);
        }
        this.value = value;
    }

    isCoaching() {
        return this.value === SessionType.COACH_STUDENT;
    }

    isAdmin() {
        return this.value === SessionType.ADMIN;
    }

    isMisc() {
        return this.value === SessionType.MISC;
    }

    isTrivial() {
        return this.value === SessionType.TRIVIAL;
    }

    toString() {
        return this.value;
    }
}

/**
 * Processing result value object
 */
class ProcessingResult {
    constructor({
        success,
        data = null,
        error = null,
        warnings = [],
        duration = 0,
        metadata = {}
    }) {
        this.success = success;
        this.data = data;
        this.error = error;
        this.warnings = warnings;
        this.duration = duration;
        this.metadata = metadata;
        this.timestamp = new Date();
    }

    static success(data, metadata = {}) {
        return new ProcessingResult({
            success: true,
            data,
            metadata
        });
    }

    static failure(error, metadata = {}) {
        return new ProcessingResult({
            success: false,
            error: error instanceof Error ? error.message : error,
            metadata
        });
    }

    withWarning(warning) {
        this.warnings.push(warning);
        return this;
    }

    withDuration(duration) {
        this.duration = duration;
        return this;
    }

    toJSON() {
        return {
            success: this.success,
            data: this.data,
            error: this.error,
            warnings: this.warnings,
            duration: this.duration,
            metadata: this.metadata,
            timestamp: this.timestamp.toISOString()
        };
    }
}

module.exports = {
    ConfidenceScore,
    WeekNumber,
    SessionType,
    ProcessingResult
}; 