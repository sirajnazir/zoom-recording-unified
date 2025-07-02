const fs = require('fs').promises;
const path = require('path');
const Papa = require('papaparse');
const { ServiceError } = require('../../shared/errors');

class KnowledgeBaseService {
    constructor({ config, logger, cache }) {
        this.config = config;
        this.logger = logger;
        this.cache = cache;
        
        this.data = {
            students: new Map(),
            coaches: new Map(),
            programs: new Map()
        };
        
        this.loaded = false;
        this.loadPromise = null;
    }

    async initialize() {
        if (this.loaded) return;
        
        if (this.loadPromise) {
            return this.loadPromise;
        }
        
        this.loadPromise = this._loadAllData();
        await this.loadPromise;
        this.loaded = true;
    }

    async _loadAllData() {
        try {
            this.logger.info('Loading knowledge base data');
            
            await Promise.all([
                this._loadStudents(),
                this._loadCoaches(),
                this._loadPrograms()
            ]);
            
            this.logger.info('Knowledge base loaded successfully', {
                students: this.data.students.size,
                coaches: this.data.coaches.size,
                programs: this.data.programs.size
            });
            
        } catch (error) {
            this.logger.error('Failed to load knowledge base', { error });
            throw new ServiceError('Knowledge base initialization failed', error);
        }
    }

    async _loadStudents() {
        const dataPath = this.config?.dataPath || './data';
        const filePath = path.join(dataPath, 'students-comprehensive.csv');
        
        try {
            const fileContent = await fs.readFile(filePath, 'utf8');
            const parsed = Papa.parse(fileContent, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                transformHeader: header => header.trim()
            });
            
            if (parsed.errors.length > 0) {
                this.logger.warn('CSV parsing warnings for students', { 
                    errors: parsed.errors 
                });
            }
            
            parsed.data.forEach(row => {
                const student = this._normalizeStudent(row);
                if (student.email) {
                    this.data.students.set(student.email.toLowerCase(), student);
                }
                if (student.name) {
                    this.data.students.set(student.name.toLowerCase(), student);
                }
            });
            
        } catch (error) {
            this.logger.error('Failed to load students data', { error });
            // Continue without students data
        }
    }

    async _loadCoaches() {
        const dataPath = this.config?.dataPath || './data';
        const filePath = path.join(dataPath, 'coaches.csv');
        
        try {
            const fileContent = await fs.readFile(filePath, 'utf8');
            const parsed = Papa.parse(fileContent, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                transformHeader: header => header.trim()
            });
            
            parsed.data.forEach(row => {
                const coach = this._normalizeCoach(row);
                if (coach.email) {
                    this.data.coaches.set(coach.email.toLowerCase(), coach);
                }
                if (coach.name) {
                    this.data.coaches.set(coach.name.toLowerCase(), coach);
                }
            });
            
        } catch (error) {
            this.logger.error('Failed to load coaches data', { error });
            // Continue without coaches data
        }
    }

    async _loadPrograms() {
        const dataPath = this.config?.dataPath || './data';
        const filePath = path.join(dataPath, 'programs.csv');
        
        try {
            const fileContent = await fs.readFile(filePath, 'utf8');
            const parsed = Papa.parse(fileContent, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                transformHeader: header => header.trim()
            });
            
            parsed.data.forEach(row => {
                const program = this._normalizeProgram(row);
                if (program.id) {
                    this.data.programs.set(program.id, program);
                }
                if (program.name) {
                    this.data.programs.set(program.name.toLowerCase(), program);
                }
            });
            
        } catch (error) {
            this.logger.error('Failed to load programs data', { error });
            // Continue without programs data
        }
    }

    _normalizeStudent(row) {
        return {
            id: row.id || row.student_id,
            name: this._normalizeName(row.name || row.student_name),
            email: this._normalizeEmail(row.email || row.student_email),
            grade: row.grade || row.current_grade,
            school: row.school || row.high_school,
            program: row.program || row.program_name,
            enrollmentDate: row.enrollment_date,
            graduationYear: row.graduation_year,
            goals: this._parseGoals(row.goals || row.student_goals),
            interests: this._parseList(row.interests),
            achievements: this._parseList(row.achievements),
            coach: row.coach || row.assigned_coach,
            status: row.status || 'active',
            metadata: {
                lastUpdated: row.last_updated || new Date().toISOString(),
                source: 'csv'
            }
        };
    }

    _normalizeCoach(row) {
        return {
            id: row.id || row.coach_id,
            name: this._normalizeName(row.name || row.coach_name),
            email: this._normalizeEmail(row.email || row.coach_email),
            expertise: this._parseList(row.expertise || row.specializations),
            style: row.coaching_style || row.style,
            yearsExperience: parseInt(row.years_experience || row.experience || 0),
            certifications: this._parseList(row.certifications),
            students: this._parseList(row.students || row.assigned_students),
            availability: row.availability,
            timezone: row.timezone,
            rating: parseFloat(row.rating || row.average_rating || 0),
            status: row.status || 'active',
            metadata: {
                lastUpdated: row.last_updated || new Date().toISOString(),
                source: 'csv'
            }
        };
    }

    _normalizeProgram(row) {
        return {
            id: row.id || row.program_id,
            name: row.name || row.program_name,
            description: row.description,
            type: row.type || row.program_type,
            duration: row.duration,
            focusAreas: this._parseList(row.focus_areas || row.areas),
            objectives: this._parseList(row.objectives || row.goals),
            targetGrades: this._parseList(row.target_grades || row.grades),
            maxStudents: parseInt(row.max_students || row.capacity || 0),
            currentStudents: parseInt(row.current_students || row.enrolled || 0),
            startDate: row.start_date,
            endDate: row.end_date,
            emphasizesActionPlanning: this._parseBoolean(row.action_planning),
            status: row.status || 'active',
            metadata: {
                lastUpdated: row.last_updated || new Date().toISOString(),
                source: 'csv'
            }
        };
    }

    // Public methods
    async getStudent(identifier) {
        await this.initialize();
        
        const key = identifier.toLowerCase();
        const cached = await this.cache?.get(`student:${key}`);
        if (cached) return cached;
        
        const student = this.data.students.get(key);
        if (student) {
            await this.cache?.set(`student:${key}`, student, 3600); // 1 hour
        }
        
        return student;
    }

    async getCoach(identifier) {
        await this.initialize();
        
        const key = identifier.toLowerCase();
        const cached = await this.cache?.get(`coach:${key}`);
        if (cached) return cached;
        
        const coach = this.data.coaches.get(key);
        if (coach) {
            await this.cache?.set(`coach:${key}`, coach, 3600);
        }
        
        return coach;
    }

    async getProgram(identifier) {
        await this.initialize();
        
        const program = this.data.programs.get(identifier) ||
                       this.data.programs.get(identifier.toLowerCase());
        
        return program || null;
    }

    async findStudentByName(name) {
        await this.initialize();
        
        const normalizedName = this._normalizeName(name);
        const searchKey = normalizedName.toLowerCase();
        
        // Try exact match first
        let student = this.data.students.get(searchKey);
        if (student) return student;
        
        // Try fuzzy match
        for (const [key, studentData] of this.data.students) {
            if (studentData.name && 
                studentData.name.toLowerCase().includes(searchKey) ||
                searchKey.includes(studentData.name.toLowerCase())) {
                return studentData;
            }
        }
        
        return null;
    }

    async findCoachByName(name) {
        await this.initialize();
        
        const normalizedName = this._normalizeName(name);
        const searchKey = normalizedName.toLowerCase();
        
        // Try exact match first
        let coach = this.data.coaches.get(searchKey);
        if (coach) return coach;
        
        // Try fuzzy match
        for (const [key, coachData] of this.data.coaches) {
            if (coachData.name && 
                coachData.name.toLowerCase().includes(searchKey) ||
                searchKey.includes(coachData.name.toLowerCase())) {
                return coachData;
            }
        }
        
        return null;
    }

    async getEnrichmentData(participants) {
        await this.initialize();
        
        const enrichment = {
            student: null,
            coach: null,
            program: null
        };
        
        for (const participant of participants) {
            if (participant.role === 'student' && !enrichment.student) {
                enrichment.student = await this.findStudentByName(participant.name) ||
                                   await this.getStudent(participant.email || participant.name);
            }
            
            if (participant.role === 'coach' && !enrichment.coach) {
                enrichment.coach = await this.findCoachByName(participant.name) ||
                                 await this.getCoach(participant.email || participant.name);
            }
        }
        
        // Get program data if student is found
        if (enrichment.student?.program) {
            enrichment.program = await this.getProgram(enrichment.student.program);
        }
        
        return enrichment;
    }

    async enrichOutcome(outcome) {
        const enrichment = {
            strategies: {},
            metrics: {},
            historicalContext: null
        };
        
        // Add strategies based on outcome type
        if (outcome.type === 'ACTION_ITEM') {
            enrichment.strategies.components = ['planning', 'execution', 'tracking'];
        }
        
        // Add metrics based on category
        if (outcome.category === 'Test Preparation') {
            enrichment.metrics.importance = 0.9;
            enrichment.metrics.urgency = 0.8;
        }
        
        return enrichment;
    }

    async getStatistics() {
        await this.initialize();
        
        return {
            totalStudents: this.data.students.size,
            totalCoaches: this.data.coaches.size,
            totalPrograms: this.data.programs.size,
            dataQuality: {
                studentsWithEmail: Array.from(this.data.students.values())
                    .filter(s => s.email).length,
                coachesWithExpertise: Array.from(this.data.coaches.values())
                    .filter(c => c.expertise && c.expertise.length > 0).length,
                programsActive: Array.from(this.data.programs.values())
                    .filter(p => p.status === 'active').length
            }
        };
    }

    async getAll() {
        await this.initialize();
        
        return {
            students: Array.from(this.data.students.values()),
            coaches: Array.from(this.data.coaches.values()),
            programs: Array.from(this.data.programs.values())
        };
    }

    // Utility methods
    _normalizeName(name) {
        if (!name) return '';
        
        return name
            .trim()
            .split(/\s+/)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join(' ');
    }

    _normalizeEmail(email) {
        if (!email) return '';
        return email.trim().toLowerCase();
    }

    _parseList(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        
        return value
            .toString()
            .split(/[,;|]/)
            .map(item => item.trim())
            .filter(item => item.length > 0);
    }

    _parseGoals(value) {
        const goals = this._parseList(value);
        return goals.map(goal => ({
            text: goal,
            category: this._categorizeGoal(goal)
        }));
    }

    _categorizeGoal(goal) {
        const goalLower = goal.toLowerCase();
        
        if (goalLower.includes('college') || goalLower.includes('university')) {
            return 'college_admission';
        }
        if (goalLower.includes('scholarship')) {
            return 'financial_aid';
        }
        if (goalLower.includes('test') || goalLower.includes('sat') || goalLower.includes('act')) {
            return 'test_prep';
        }
        if (goalLower.includes('essay') || goalLower.includes('writing')) {
            return 'writing';
        }
        
        return 'general';
    }

    _parseBoolean(value) {
        if (typeof value === 'boolean') return value;
        if (!value) return false;
        
        const stringValue = value.toString().toLowerCase();
        return stringValue === 'true' || stringValue === 'yes' || stringValue === '1';
    }

    // Refresh data (for updates)
    async refresh() {
        this.logger.info('Refreshing knowledge base data');
        
        this.data.students.clear();
        this.data.coaches.clear();
        this.data.programs.clear();
        this.loaded = false;
        this.loadPromise = null;
        
        await this.initialize();
        
        // Clear cache if available
        if (this.cache) {
            await this.cache.clear('student:*');
            await this.cache.clear('coach:*');
        }
    }

    /**
     * Returns statistics about the loaded knowledge base
     */
    getStats() {
        return {
            students: this.data.students.size,
            coaches: this.data.coaches.size,
            programs: this.data.programs.size,
            loaded: this.loaded
        };
    }

    /**
     * Check if a name belongs to a student
     */
    async isStudent(name) {
        await this.initialize();
        
        if (!name) return false;
        
        const student = await this.findStudentByName(name) || 
                       await this.getStudent(name);
        
        return !!student;
    }

    /**
     * Check if a name belongs to a coach
     */
    async isCoach(name) {
        await this.initialize();
        
        if (!name) return false;
        
        const coach = await this.findCoachByName(name) || 
                     await this.getCoach(name);
        
        return !!coach;
    }

    /**
     * Get all coaches
     */
    getCoaches() {
        return Array.from(this.data.coaches.values());
    }

    /**
     * Get all students
     */
    getStudents() {
        return Array.from(this.data.students.values());
    }
}

module.exports = KnowledgeBaseService; 