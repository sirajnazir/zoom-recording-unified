const { NotFoundError, ValidationError } = require('../../shared/errors');

/**
 * Service for managing recordings and sessions
 */
class RecordingService {
    constructor({ recordingProcessor, googleSheetsService, logger }) {
        this.recordingProcessor = recordingProcessor;
        this.googleSheetsService = googleSheetsService;
        this.logger = logger;
        
        // In-memory cache (in production, use Redis)
        this.recordingsCache = new Map();
        this.sessionsCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * List recordings with pagination and filters
     */
    async listRecordings({ page = 1, limit = 20, filters = {} }) {
        try {
            // In production, this would query from database
            // For now, we'll use Google Sheets as data source
            const allRecordings = await this._fetchRecordingsFromSheet();
            
            // Apply filters
            let filtered = allRecordings;
            
            if (filters.status) {
                filtered = filtered.filter(r => r.processingStatus === filters.status);
            }
            
            if (filters.coach) {
                filtered = filtered.filter(r => 
                    r.coach?.toLowerCase().includes(filters.coach.toLowerCase())
                );
            }
            
            if (filters.student) {
                filtered = filtered.filter(r => 
                    r.student?.toLowerCase().includes(filters.student.toLowerCase())
                );
            }
            
            // Pagination
            const start = (page - 1) * limit;
            const end = start + limit;
            const paginatedRecordings = filtered.slice(start, end);
            
            return {
                data: paginatedRecordings,
                pagination: {
                    page,
                    limit,
                    total: filtered.length,
                    totalPages: Math.ceil(filtered.length / limit)
                }
            };
            
        } catch (error) {
            this.logger.error('Error listing recordings', error);
            throw error;
        }
    }

    /**
     * Get a specific recording
     */
    async getRecording(recordingId) {
        // Check cache first
        if (this.recordingsCache.has(recordingId)) {
            const cached = this.recordingsCache.get(recordingId);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        try {
            const recordings = await this._fetchRecordingsFromSheet();
            const recording = recordings.find(r => r.id === recordingId);
            
            if (!recording) {
                throw new NotFoundError('Recording', recordingId);
            }
            
            // Cache the result
            this.recordingsCache.set(recordingId, {
                data: recording,
                timestamp: Date.now()
            });
            
            return recording;
            
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            this.logger.error('Error getting recording', error);
            throw error;
        }
    }

    /**
     * Reprocess a recording
     */
    async reprocessRecording(recordingId) {
        try {
            // Get recording data
            const recording = await this.getRecording(recordingId);
            
            if (!recording.zoomData) {
                throw new ValidationError('Recording data not available for reprocessing');
            }
            
            // Process the recording
            const result = await this.recordingProcessor.processRecording(recording.zoomData);
            
            if (result.success) {
                // Update cache
                this.recordingsCache.delete(recordingId);
                
                return {
                    success: true,
                    message: 'Recording reprocessed successfully',
                    data: result.data
                };
            } else {
                return {
                    success: false,
                    message: 'Reprocessing failed',
                    error: result.error
                };
            }
            
        } catch (error) {
            this.logger.error('Error reprocessing recording', error);
            throw error;
        }
    }

    /**
     * List sessions with filters
     */
    async listSessions({ page = 1, limit = 20, filters = {} }) {
        try {
            const allSessions = await this._fetchSessionsFromSheet();
            
            // Apply filters
            let filtered = allSessions;
            
            if (filters.coach) {
                filtered = filtered.filter(s => 
                    s.coach?.toLowerCase().includes(filters.coach.toLowerCase())
                );
            }
            
            if (filters.student) {
                filtered = filtered.filter(s => 
                    s.student?.toLowerCase().includes(filters.student.toLowerCase())
                );
            }
            
            if (filters.weekNumber) {
                filtered = filtered.filter(s => s.weekNumber === parseInt(filters.weekNumber));
            }
            
            if (filters.sessionType) {
                filtered = filtered.filter(s => s.sessionType === filters.sessionType);
            }
            
            // Sort by date descending
            filtered.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
            
            // Pagination
            const start = (page - 1) * limit;
            const end = start + limit;
            const paginatedSessions = filtered.slice(start, end);
            
            return {
                data: paginatedSessions,
                pagination: {
                    page,
                    limit,
                    total: filtered.length,
                    totalPages: Math.ceil(filtered.length / limit)
                }
            };
            
        } catch (error) {
            this.logger.error('Error listing sessions', error);
            throw error;
        }
    }

    /**
     * Get a specific session
     */
    async getSession(sessionId) {
        // Check cache first
        if (this.sessionsCache.has(sessionId)) {
            const cached = this.sessionsCache.get(sessionId);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        try {
            const sessions = await this._fetchSessionsFromSheet();
            const session = sessions.find(s => s.id === sessionId);
            
            if (!session) {
                throw new NotFoundError('Session', sessionId);
            }
            
            // Cache the result
            this.sessionsCache.set(sessionId, {
                data: session,
                timestamp: Date.now()
            });
            
            return session;
            
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            this.logger.error('Error getting session', error);
            throw error;
        }
    }

    /**
     * List all coaches
     */
    async listCoaches() {
        try {
            const sessions = await this._fetchSessionsFromSheet();
            
            // Extract unique coaches
            const coachesMap = new Map();
            
            sessions.forEach(session => {
                if (session.coach && !coachesMap.has(session.coach)) {
                    coachesMap.set(session.coach, {
                        name: session.coach,
                        sessionCount: 0,
                        students: new Set()
                    });
                }
                
                if (session.coach) {
                    const coach = coachesMap.get(session.coach);
                    coach.sessionCount++;
                    if (session.student) {
                        coach.students.add(session.student);
                    }
                }
            });
            
            // Convert to array
            const coaches = Array.from(coachesMap.values()).map(coach => ({
                name: coach.name,
                sessionCount: coach.sessionCount,
                studentCount: coach.students.size,
                students: Array.from(coach.students)
            }));
            
            // Sort by session count
            coaches.sort((a, b) => b.sessionCount - a.sessionCount);
            
            return coaches;
            
        } catch (error) {
            this.logger.error('Error listing coaches', error);
            throw error;
        }
    }

    /**
     * Get students for a coach
     */
    async getCoachStudents(coachName) {
        try {
            const sessions = await this._fetchSessionsFromSheet();
            
            // Filter sessions for this coach
            const coachSessions = sessions.filter(s => 
                s.coach?.toLowerCase() === coachName.toLowerCase()
            );
            
            if (coachSessions.length === 0) {
                throw new NotFoundError('Coach', coachName);
            }
            
            // Extract unique students
            const studentsMap = new Map();
            
            coachSessions.forEach(session => {
                if (session.student && !studentsMap.has(session.student)) {
                    studentsMap.set(session.student, {
                        name: session.student,
                        sessionCount: 0,
                        lastSession: null,
                        weekNumbers: new Set()
                    });
                }
                
                if (session.student) {
                    const student = studentsMap.get(session.student);
                    student.sessionCount++;
                    
                    const sessionDate = new Date(session.startTime);
                    if (!student.lastSession || sessionDate > student.lastSession) {
                        student.lastSession = sessionDate;
                    }
                    
                    if (session.weekNumber) {
                        student.weekNumbers.add(session.weekNumber);
                    }
                }
            });
            
            // Convert to array
            const students = Array.from(studentsMap.values()).map(student => ({
                name: student.name,
                sessionCount: student.sessionCount,
                lastSession: student.lastSession?.toISOString(),
                weeksCompleted: student.weekNumbers.size,
                weekNumbers: Array.from(student.weekNumbers).sort((a, b) => a - b)
            }));
            
            return {
                coach: coachName,
                studentCount: students.length,
                students: students
            };
            
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            this.logger.error('Error getting coach students', error);
            throw error;
        }
    }

    /**
     * List all students
     */
    async listStudents() {
        try {
            const sessions = await this._fetchSessionsFromSheet();
            
            // Extract unique students
            const studentsMap = new Map();
            
            sessions.forEach(session => {
                if (session.student && !studentsMap.has(session.student)) {
                    studentsMap.set(session.student, {
                        name: session.student,
                        sessionCount: 0,
                        coaches: new Set(),
                        lastSession: null
                    });
                }
                
                if (session.student) {
                    const student = studentsMap.get(session.student);
                    student.sessionCount++;
                    
                    if (session.coach) {
                        student.coaches.add(session.coach);
                    }
                    
                    const sessionDate = new Date(session.startTime);
                    if (!student.lastSession || sessionDate > student.lastSession) {
                        student.lastSession = sessionDate;
                    }
                }
            });
            
            // Convert to array
            const students = Array.from(studentsMap.values()).map(student => ({
                name: student.name,
                sessionCount: student.sessionCount,
                coachCount: student.coaches.size,
                coaches: Array.from(student.coaches),
                lastSession: student.lastSession?.toISOString()
            }));
            
            // Sort by session count
            students.sort((a, b) => b.sessionCount - a.sessionCount);
            
            return students;
            
        } catch (error) {
            this.logger.error('Error listing students', error);
            throw error;
        }
    }

    /**
     * Get sessions for a student
     */
    async getStudentSessions(studentName) {
        try {
            const sessions = await this._fetchSessionsFromSheet();
            
            // Filter sessions for this student
            const studentSessions = sessions.filter(s => 
                s.student?.toLowerCase() === studentName.toLowerCase()
            );
            
            if (studentSessions.length === 0) {
                throw new NotFoundError('Student', studentName);
            }
            
            // Sort by date
            studentSessions.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
            
            return {
                student: studentName,
                sessionCount: studentSessions.length,
                sessions: studentSessions
            };
            
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            this.logger.error('Error getting student sessions', error);
            throw error;
        }
    }

    /**
     * Fetch recordings from Google Sheets
     */
    async _fetchRecordingsFromSheet() {
        // This is a simplified implementation
        // In production, use a proper database
        try {
            const spreadsheetId = this.googleSheetsService.config.sheets.masterSpreadsheetId;
            const range = 'Raw Master Index!A:Z'; // Adjust range as needed
            
            const response = await this.googleSheetsService.getRange(spreadsheetId, range);
            
            if (!response.data.values || response.data.values.length <= 1) {
                return [];
            }
            
            const headers = response.data.values[0];
            const rows = response.data.values.slice(1);
            
            return rows.map(row => this._parseRecordingRow(headers, row));
            
        } catch (error) {
            this.logger.error('Error fetching recordings from sheet', error);
            return [];
        }
    }

    /**
     * Fetch sessions from Google Sheets
     */
    async _fetchSessionsFromSheet() {
        try {
            const spreadsheetId = this.googleSheetsService.config.sheets.masterSpreadsheetId;
            const range = 'Standardized Master Index!A:Z'; // Adjust range as needed
            
            const response = await this.googleSheetsService.getRange(spreadsheetId, range);
            
            if (!response.data.values || response.data.values.length <= 1) {
                return [];
            }
            
            const headers = response.data.values[0];
            const rows = response.data.values.slice(1);
            
            return rows.map(row => this._parseSessionRow(headers, row));
            
        } catch (error) {
            this.logger.error('Error fetching sessions from sheet', error);
            return [];
        }
    }

    /**
     * Parse recording row from sheet
     */
    _parseRecordingRow(headers, row) {
        const getCell = (columnName) => {
            const index = headers.indexOf(columnName);
            return index >= 0 ? row[index] : null;
        };
        
        return {
            id: getCell('recording_id') || getCell('standardized_name'),
            meetingId: getCell('meeting_id'),
            uuid: getCell('meeting_uuid'),
            topic: getCell('topic'),
            startTime: getCell('start_time'),
            duration: parseInt(getCell('duration')) || 0,
            coach: getCell('coach_name'),
            student: getCell('student_name'),
            processingStatus: getCell('processing_success') === 'TRUE' ? 'completed' : 'failed',
            driveLink: getCell('drive_link')
        };
    }

    /**
     * Parse session row from sheet
     */
    _parseSessionRow(headers, row) {
        const getCell = (columnName) => {
            const index = headers.indexOf(columnName);
            return index >= 0 ? row[index] : null;
        };
        
        return {
            id: getCell('recording_id'),
            coach: getCell('coach_name'),
            student: getCell('student_name'),
            weekNumber: parseInt(getCell('week_number')) || null,
            sessionType: getCell('session_type'),
            startTime: getCell('meeting_start_time'),
            duration: parseInt(getCell('meeting_duration_seconds')) || 0,
            driveLink: getCell('drive_link'),
            coachingEffectivenessScore: parseFloat(getCell('coaching_effectiveness_score')) || 0,
            studentProgressConfidence: parseFloat(getCell('student_progress_confidence')) || 0,
            actionItemsCount: parseInt(getCell('action_items_count')) || 0
        };
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.recordingsCache.clear();
        this.sessionsCache.clear();
        this.logger.info('Recording service cache cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            recordingsCacheSize: this.recordingsCache.size,
            sessionsCacheSize: this.sessionsCache.size,
            cacheTimeout: this.cacheTimeout
        };
    }
}

module.exports = { RecordingService }; 