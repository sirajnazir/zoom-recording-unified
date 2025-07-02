const { WeekNumber, ConfidenceScore } = require('../value-objects');

/**
 * Service for inferring week numbers from various sources
 */
class WeekInferenceService {
    constructor() {
        this.sessionChronologies = new Map();
        this.weekPatterns = [
            /[Ww]k\s*#?\s*(\d+)/,
            /[Ww]eek\s*#?\s*(\d+)/,
            /Session\s*#\s*(\d+)/,
            /_W(\d+)_/,
            /\bW(\d+)\b/,
            /Week(\d+)/i,
            /Class\s*(\d+)/i,
            /_(\d+)_\d{4}-\d{2}-\d{2}/,
            /(\d+)\s*week/i
        ];
    }

    /**
     * Infer week number from multiple sources
     */
    async inferWeekNumber(recording, session) {
        const methods = [
            () => this._inferFromFilename(recording.topic),
            () => this._inferFromTimeline(recording, session),
            () => this._inferFromChronology(session),
            () => this._inferFromDate(recording.startTime),
            () => this._inferFromTranscript(recording.transcript)
        ];

        for (const method of methods) {
            try {
                const result = await method();
                if (result && result.weekNumber) {
                    return result;
                }
            } catch (error) {
                // Continue to next method
            }
        }

        // Fallback: assign sequential week
        return this._assignSequentialWeek(session);
    }

    _inferFromFilename(filename) {
        if (!filename) return null;

        for (const pattern of this.weekPatterns) {
            const match = filename.match(pattern);
            if (match) {
                const weekNum = parseInt(match[1]);
                if (weekNum > 0 && weekNum <= 100) {
                    return {
                        weekNumber: new WeekNumber(weekNum),
                        confidence: new ConfidenceScore(100),
                        method: 'filename',
                        evidence: `Week ${weekNum} extracted from filename`
                    };
                }
            }
        }

        return null;
    }

    _inferFromTimeline(recording, session) {
        if (!session.coach || !session.student) return null;

        // Calculate based on program timeline
        const programInfo = this._getProgramInfo(session.student);
        if (!programInfo || !programInfo.startDate) return null;

        const sessionDate = new Date(recording.startTime);
        const programStart = new Date(programInfo.startDate);
        const weeksSinceStart = Math.floor((sessionDate - programStart) / (7 * 24 * 60 * 60 * 1000));

        if (weeksSinceStart >= 0 && weeksSinceStart < programInfo.totalWeeks) {
            return {
                weekNumber: new WeekNumber(weeksSinceStart + 1),
                confidence: new ConfidenceScore(95),
                method: 'timeline',
                evidence: `Week ${weeksSinceStart + 1} calculated from program start date`
            };
        }

        return null;
    }

    _inferFromChronology(session) {
        if (!session.coach || !session.student) return null;

        const key = `${session.coach}_${session.student}`;
        const chronology = this.sessionChronologies.get(key);

        if (!chronology || chronology.length === 0) return null;

        // Find the most recent session before this one
        const sessionDate = new Date(session.startTime);
        const previousSessions = chronology
            .filter(s => new Date(s.date) < sessionDate)
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        if (previousSessions.length > 0) {
            const lastSession = previousSessions[0];
            if (lastSession.weekNumber) {
                const daysDiff = Math.floor((sessionDate - new Date(lastSession.date)) / (24 * 60 * 60 * 1000));
                const weeksDiff = Math.round(daysDiff / 7);
                const estimatedWeek = lastSession.weekNumber + weeksDiff;

                if (estimatedWeek > 0 && estimatedWeek <= 100) {
                    return {
                        weekNumber: new WeekNumber(estimatedWeek),
                        confidence: new ConfidenceScore(85),
                        method: 'chronology',
                        evidence: `Week ${estimatedWeek} inferred from previous session`
                    };
                }
            }
        }

        return null;
    }

    _inferFromDate(startTime) {
        const sessionDate = new Date(startTime);
        const year = sessionDate.getFullYear();
        
        // Academic year typically starts in September
        const academicYearStart = new Date(year, 8, 1); // September 1
        if (sessionDate.getMonth() < 8) {
            academicYearStart.setFullYear(year - 1);
        }

        const weeksSinceStart = Math.floor((sessionDate - academicYearStart) / (7 * 24 * 60 * 60 * 1000));

        if (weeksSinceStart >= 0 && weeksSinceStart <= 52) {
            return {
                weekNumber: new WeekNumber(weeksSinceStart + 1),
                confidence: new ConfidenceScore(70),
                method: 'date',
                evidence: `Week ${weeksSinceStart + 1} inferred from academic year`
            };
        }

        return null;
    }

    _inferFromTranscript(transcript) {
        if (!transcript) return null;

        // Look for week mentions in transcript
        for (const pattern of this.weekPatterns) {
            const match = transcript.match(pattern);
            if (match) {
                const weekNum = parseInt(match[1]);
                if (weekNum > 0 && weekNum <= 100) {
                    return {
                        weekNumber: new WeekNumber(weekNum),
                        confidence: new ConfidenceScore(90),
                        method: 'transcript',
                        evidence: `Week ${weekNum} found in transcript`
                    };
                }
            }
        }

        return null;
    }

    _assignSequentialWeek(session) {
        // Default to week 1 for new sessions
        return {
            weekNumber: new WeekNumber(1),
            confidence: new ConfidenceScore(50),
            method: 'sequential',
            evidence: 'Week 1 assigned as default'
        };
    }

    _getProgramInfo(studentName) {
        // This would be retrieved from knowledge base
        const programDatabase = {
            'Anoushka': { totalWeeks: 12, startDate: '2024-09-01' },
            'Huda': { totalWeeks: 24, startDate: '2024-09-01' },
            'Rayaan': { totalWeeks: 48, startDate: '2024-09-01' }
        };

        return programDatabase[studentName] || null;
    }

    /**
     * Update session chronology
     */
    updateChronology(session) {
        if (!session.coach || !session.student || !session.weekNumber) return;

        const key = `${session.coach}_${session.student}`;
        
        if (!this.sessionChronologies.has(key)) {
            this.sessionChronologies.set(key, []);
        }

        const chronology = this.sessionChronologies.get(key);
        chronology.push({
            date: session.startTime,
            weekNumber: session.weekNumber,
            recordingId: session.recordingId
        });

        // Sort by date
        chronology.sort((a, b) => new Date(a.date) - new Date(b.date));
    }
}

module.exports = { WeekInferenceService }; 