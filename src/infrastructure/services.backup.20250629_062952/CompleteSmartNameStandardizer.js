/**
 * Final Complete Smart Name Standardizer
 * Incorporates all logic from RecordingAnalyzer, SmartRecordingStandardizer,
 * and proper session type categorization
 * 
 * Format: {SessionType}_{coach}_{student}_Wk{number}_{date}
 * Example: Coaching_jenny_Arshiya_Wk16_2025-06-04
 */

class CompleteSmartNameStandardizer {
    constructor(dependencies = {}) {
        this.logger = dependencies.logger || console;
        this.cache = dependencies.cache;
        this.knowledgeBase = dependencies.knowledgeBase;
        
        // Coach mappings from SmartRecordingStandardizer
        this.coachMappings = {
            'jenny': 'jenny',
            'jenny duan': 'jenny',
            'jennyduan': 'jenny',
            'jamie': 'jamie',
            'ivylevel jamie': 'jamie',
            'rishi': 'rishi',
            'rishi padmanabhan': 'rishi',
            'aditi': 'aditi',
            'aditi b': 'aditi',
            'aditi bhaskar': 'aditi',
            'noor': 'noor',
            'noor hassan': 'noor',
            'juli': 'juli',
            'julie': 'juli',
            'kelvin': 'kelvin',
            'erin': 'erin',
            'erin ye': 'erin',
            'steven': 'steven',
            'steven zhou': 'steven',
            'marissa': 'marissa',
            'andrew': 'andrew',
            'janice': 'janice',
            'janice teoh': 'janice',
            'siraj': 'siraj',
            'katie': 'katie',
            'alan': 'alan',
            'alice': 'alice',
            'vilina': 'vilina'
        };
        
        // Initialize comprehensive student mappings
        this.studentMappings = this.loadComprehensiveStudentMappings();
        
        // Meeting patterns
        this.meetingPatterns = [
            {
                regex: /^(?:Ivylevel\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*<>\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*\|\s*Session\s*#?\s*(\d+)/i,
                fields: { coach: 1, student: 2, session: 3 },
                sessionType: 'Coaching'
            },
            {
                regex: /^(?:Ivylevel\s+)?([A-Za-z]+)\s*&\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*:\s*Week\s*(\d+)/i,
                fields: { coach: 1, student: 2, week: 3 },
                sessionType: 'Coaching'
            },
            {
                regex: /^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*<->\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
                fields: { coach: 1, student: 2 },
                sessionType: 'Coaching'
            },
            {
                regex: /^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*&\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
                fields: { coach: 1, student: 2 },
                sessionType: 'Coaching'
            },
            {
                regex: /^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*-\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
                fields: { coach: 1, student: 2 },
                sessionType: 'Coaching'
            },
            {
                regex: /^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*<>\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
                fields: { coach: 1, student: 2 },
                sessionType: 'Coaching'
            },
            {
                regex: /Game\s*Plan/i,
                sessionType: 'GamePlan'
            },
            {
                regex: /SAT\s*Prep|SAT\s*Session/i,
                sessionType: 'SAT'
            },
            {
                regex: /^(.+?)(?:'s|'s)\s+Personal\s+Meeting\s+Room$/i,
                fields: { coach: 1 },
                sessionType: 'Coaching'
            }
        ];
        
        // Week patterns
        this.weekPatterns = [
            { regex: /[Ww]k\s*#?\s*(\d+[A-Z]?)/, priority: 1 },
            { regex: /[Ww]eek\s*#?\s*(\d+[A-Z]?)/, priority: 1 },
            { regex: /Session\s*#?\s*(\d+)/, priority: 2 },
            { regex: /#(\d+)/, priority: 3 }
        ];
    }
    
    /**
     * Load comprehensive student mappings from CSV file
     */
    loadComprehensiveStudentMappings() {
        const fs = require('fs');
        const path = require('path');
        
        try {
            // Try to load from comprehensive CSV file
            const csvPath = path.join(__dirname, '../../../data/students-comprehensive.csv');
            if (fs.existsSync(csvPath)) {
                const csvContent = fs.readFileSync(csvPath, 'utf8');
                const lines = csvContent.split('\n');
                const mappings = {};
                
                // Skip header line
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;
                    
                    const columns = line.split(',');
                    if (columns.length >= 7) {
                        const name = columns[1]?.trim();
                        const firstName = columns[2]?.trim();
                        const lastName = columns[3]?.trim();
                        const alternateNames = columns[5]?.trim();
                        const parentName = columns[6]?.trim();
                        const parentAlternateNames = columns[8]?.trim();
                        
                        if (name) {
                            // Add primary name mapping
                            mappings[name.toLowerCase()] = this.capitalizeName(name);
                            
                            // Add first name mapping
                            if (firstName) {
                                mappings[firstName.toLowerCase()] = this.capitalizeName(firstName);
                            }
                            
                            // Add last name mapping (maps to first name)
                            if (lastName) {
                                mappings[lastName.toLowerCase()] = this.capitalizeName(firstName || name);
                            }
                            
                            // Add alternate names
                            if (alternateNames) {
                                const alternates = alternateNames.split('|');
                                for (const alt of alternates) {
                                    const cleanAlt = alt.trim();
                                    if (cleanAlt) {
                                        mappings[cleanAlt.toLowerCase()] = this.capitalizeName(firstName || name);
                                    }
                                }
                            }
                            
                            // Add parent name mappings (maps to student's first name)
                            if (parentName) {
                                mappings[parentName.toLowerCase()] = this.capitalizeName(firstName || name);
                                
                                // Add parent alternate names
                                if (parentAlternateNames) {
                                    const parentAlternates = parentAlternateNames.split('|');
                                    for (const alt of parentAlternates) {
                                        const cleanAlt = alt.trim();
                                        if (cleanAlt) {
                                            mappings[cleanAlt.toLowerCase()] = this.capitalizeName(firstName || name);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                
                this.logger?.info(`✅ Loaded ${Object.keys(mappings).length} comprehensive student mappings`);
                return mappings;
            }
        } catch (error) {
            this.logger?.warn(`⚠️ Failed to load comprehensive student mappings: ${error.message}`);
        }
        
        // Fallback to basic mappings if CSV loading fails
        this.logger?.info(`📋 Using fallback student mappings`);
        return {
            'zainab': 'Zainab',
            'arshiya': 'Arshiya',
            'arshya': 'Arshiya',
            'kavya': 'Kavya',
            'kavya venkatesan': 'Kavya',
            'aaryan': 'Aaryan',
            'aaryan shah': 'Aaryan',
            'shah': 'Aaryan', // Maps last name to first name
            'leena': 'Aaryan', // Maps parent name to student
            'leena shah': 'Aaryan', // Maps parent full name to student
            'priya': 'Priya',
            'priya patel': 'Priya',
            'patel family': 'Priya',
            'patel': 'Priya',
            'aisha': 'Aisha',
            'aisha khan': 'Aisha',
            'khan family': 'Aisha',
            'khan': 'Aisha',
            'anoushka': 'Anoushka',
            'anoushka chakravarty': 'Anoushka',
            'minseo': 'Minseo',
            'minseo kim': 'Minseo',
            'victoria': 'Victoria',
            'ananyaa': 'Ananyaa',
            'arushi': 'Arushi',
            'huda': 'Huda',
            'emma': 'Emma',
            'abhi': 'Abhi',
            'kabir': 'Kabir',
            'netra': 'Netra',
            'shashank': 'Shashank',
            'sameeha': 'Sameeha',
            'danait': 'Danait',
            'vihana': 'Vihana'
        };
    }
    
    /**
     * Main standardization method - RESTORED FROM BACKUP WORKING VERSION
     * Simple, direct approach that worked reliably
     */
    async standardizeName(input, context = {}) {
        try {
            if (!input || typeof input !== 'string') {
                return this.createErrorResult(input);
            }
            
            // Build recording object
            const recording = {
                topic: input,
                title: input,
                duration: context.duration,
                ...context
            };
            
            // Extract all components (including enhanced student extraction)
            const components = await this.extractComponents(recording);
            
            // --- ENHANCED: For Personal Meeting Room, ensure student extraction is complete before session type ---
            if ((recording.topic || '').toLowerCase().includes('personal meeting room') && components.student === 'Unknown') {
                this.logger?.info(`🔍 [ENHANCED] Personal Meeting Room detected, trying enhanced student extraction...`);
                
                // Debug: Log what context we have
                this.logger?.info(`[DEBUG] Context transcriptContent length: ${context.transcriptContent?.length || 0}`);
                this.logger?.info(`[DEBUG] Context chatContent length: ${context.chatContent?.length || 0}`);
                this.logger?.info(`[DEBUG] Context participants count: ${context.participants?.length || 0}`);
                
                // Try to extract student from participants
                if (recording.participants && recording.participants.length > 0) {
                    const studentFromParticipants = this.extractStudentFromParticipants(recording.participants, components.coach);
                    if (studentFromParticipants) {
                        components.student = await this.standardizeStudentName(studentFromParticipants);
                        components.method = components.method === 'unknown' ? 'participants' : components.method;
                        this.logger?.info(`✅ [ENHANCED] Student extracted from participants: ${components.student}`);
                    }
                }
                
                // Try to extract student from transcript content (now passed in context)
                if (components.student === 'Unknown' && context.transcriptContent && context.transcriptContent.length > 50) {
                    this.logger?.info(`[DEBUG] Attempting transcript extraction with ${context.transcriptContent.length} characters`);
                    const studentFromTranscript = this.extractStudentFromTranscript(context.transcriptContent, components.coach);
                    if (studentFromTranscript) {
                        components.student = await this.standardizeStudentName(studentFromTranscript);
                        components.method = components.method === 'unknown' ? 'transcript' : components.method;
                        this.logger?.info(`✅ [ENHANCED] Student extracted from transcript: ${components.student}`);
                    } else {
                        this.logger?.info(`[DEBUG] No student found in transcript content`);
                    }
                } else {
                    this.logger?.info(`[DEBUG] Skipping transcript extraction - content length: ${context.transcriptContent?.length || 0}`);
                }
                
                // Try to extract student from chat content (now passed in context)
                if (components.student === 'Unknown' && context.chatContent && context.chatContent.length > 20) {
                    const studentFromChat = this.extractStudentFromChat(context.chatContent, components.coach);
                    if (studentFromChat) {
                        components.student = await this.standardizeStudentName(studentFromChat);
                        components.method = components.method === 'unknown' ? 'chat' : components.method;
                        this.logger?.info(`✅ [ENHANCED] Student extracted from chat: ${components.student}`);
                    }
                }
            }
            
            // Determine session type AFTER enhanced student extraction
            const sessionType = this.determineSessionType(components, recording);
            components.sessionType = sessionType;
            
            // Build standardized name
            const standardizedName = this.buildStandardizedFolderName({
                coach: components.coach,
                student: components.student,
                weekNumber: components.week,
                sessionType: sessionType,
                date: this.getDate(context),
                meetingId: context.id || context.meeting_id,
                uuid: context.uuid
            });
            
            // Calculate confidence
            const confidence = this.calculateConfidence(components, sessionType);
            
            this.logger?.info(`✅ [PRIORITY] Final result - Coach: ${components.coach}, Student: ${components.student}, Method: ${components.method}`);
            
            return {
                standardized: standardizedName,
                components: {
                    coach: components.coach,
                    student: components.student,
                    week: components.week,
                    sessionType: sessionType
                },
                method: components.method,
                confidence: confidence,
                raw: input
            };
            
        } catch (error) {
            this.logger?.error('Error in standardizeName:', error);
            return this.createErrorResult(input, error);
        }
    }
    
    /**
     * Extract components from recording - RESTORED FROM BACKUP WORKING VERSION
     */
    async extractComponents(recording) {
        const topic = recording.topic || '';
        const result = {
            coach: 'Unknown',
            student: 'Unknown',
            week: null,
            method: 'unknown',
            matchedPattern: null
        };
        
        this.logger?.info(`[DEBUG] extractComponents: topic="${topic}"`);
        
        // Try meeting patterns
        for (const pattern of this.meetingPatterns) {
            const match = topic.match(pattern.regex);
            if (match) {
                this.logger?.info(`[DEBUG] Pattern matched: ${pattern.regex.source}`);
                this.logger?.info(`[DEBUG] Match groups:`, match);
                
                if (pattern.fields?.coach) {
                    const coachMatch = match[pattern.fields.coach];
                    this.logger?.info(`[DEBUG] Coach match: "${coachMatch}"`);
                    result.coach = await this.standardizeCoachName(coachMatch);
                    this.logger?.info(`[DEBUG] Standardized coach: "${result.coach}"`);
                }
                if (pattern.fields?.student) {
                    const studentMatch = match[pattern.fields.student];
                    this.logger?.info(`[DEBUG] Student match: "${studentMatch}"`);
                    result.student = await this.standardizeStudentName(studentMatch);
                    this.logger?.info(`[DEBUG] Standardized student: "${result.student}"`);
                }
                if (pattern.fields?.week) {
                    result.week = parseInt(match[pattern.fields.week]) || null;
                } else if (pattern.fields?.session) {
                    result.week = parseInt(match[pattern.fields.session]) || null;
                }
                
                result.method = 'pattern_match';
                result.matchedPattern = pattern;
                break;
            }
        }
        
        // Try host-based extraction if no coach
        if (result.coach === 'Unknown') {
            if (recording.host_email) {
                const hostEmail = recording.host_email.toLowerCase();
                for (const [key, value] of Object.entries(this.coachMappings)) {
                    if (hostEmail.includes(key) || hostEmail.includes(value)) {
                        result.coach = value;
                        result.method = result.method === 'unknown' ? 'host_email' : result.method;
                        break;
                    }
                }
            }
            
            if (result.coach === 'Unknown' && recording.host_name) {
                const coachName = await this.standardizeCoachName(recording.host_name);
                if (coachName !== 'unknown') {
                    result.coach = coachName;
                    result.method = result.method === 'unknown' ? 'host_name' : result.method;
                }
            }
        }
        
        // Extract week if not found
        if (!result.week) {
            result.week = this.extractWeekFromText(topic);
        }
        
        this.logger?.info(`[DEBUG] Final result:`, result);
        return result;
    }
    
    /**
     * Extract student name from participants list
     */
    extractStudentFromParticipants(participants, coachName) {
        if (!participants || participants.length === 0) return null;
        
        const coachLower = coachName.toLowerCase();
        
        // Filter out the coach and look for the first non-coach participant
        for (const participant of participants) {
            const participantName = participant.name || participant.user_name || '';
            const participantEmail = participant.email || '';
            
            // Skip if this is the coach
            if (participantName.toLowerCase().includes(coachLower) || 
                participantEmail.toLowerCase().includes(coachLower) ||
                participantEmail.includes('@ivymentors.co') ||
                participantEmail.includes('@ivylevel.com')) {
                continue;
            }
            
            // This is likely the student
            if (participantName && participantName.trim()) {
                return participantName.trim();
            }
        }
        
        return null;
    }
    
    /**
     * Extract student name from transcript content
     */
    extractStudentFromTranscript(transcriptContent, coachName) {
        if (!transcriptContent || transcriptContent.length < 50) return null;
        
        const coachLower = coachName.toLowerCase();
        const lines = transcriptContent.split('\n');
        
        // Look for patterns that indicate student names
        for (const line of lines) {
            const trimmedLine = line.trim();
            const lineLower = trimmedLine.toLowerCase();
            // Skip lines that mention the coach (speaker label)
            if (lineLower.includes(coachLower)) continue;
            
            // Look for patterns like "Student Name:" or "Name: Student"
            const namePatterns = [
                /\d{2}:\d{2}:\d{2}\s*[-–]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?):/,
                /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?):/,
                /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[-–]\s*[A-Z]/,
                /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*\(/,
                /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*\[/
            ];
            
            for (const pattern of namePatterns) {
                const match = trimmedLine.match(pattern);
                if (match) {
                    const potentialName = match[1].trim();
                    // Check if it's a known student name
                    if (this.isKnownStudent(potentialName)) {
                        return potentialName;
                    }
                }
            }
            // --- ENHANCED: Look for any known student name in the line (not just as label) ---
            this.logger?.info(`[DEBUG] Checking line: ${trimmedLine}`);
            for (const [key, value] of Object.entries(this.studentMappings)) {
                this.logger?.info(`[DEBUG]   Checking student mapping: key='${key}', value='${value}'`);
                const keyLower = key.toLowerCase();
                const valueLower = value.toLowerCase();
                if (lineLower.includes(keyLower) || lineLower.includes(valueLower)) {
                    // Avoid false positives for coach
                    if (!lineLower.includes(coachLower)) {
                        this.logger?.info(`[DEBUG] Matched student '${value}' in line: ${trimmedLine}`);
                        return value;
                    }
                }
            }
        }
        
        return null;
    }
    
    /**
     * Extract student name from chat content
     */
    extractStudentFromChat(chatContent, coachName) {
        if (!chatContent || chatContent.length < 20) return null;
        
        const coachLower = coachName.toLowerCase();
        const lines = chatContent.split('\n');
        
        // Look for chat messages that might indicate student names
        for (const line of lines) {
            // Skip lines that mention the coach
            if (line.toLowerCase().includes(coachLower)) continue;
            
            // Look for patterns like "Student Name:" or "From Student Name"
            const namePatterns = [
                /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?):/,
                /From\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
                /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[-–]/
            ];
            
            for (const pattern of namePatterns) {
                const match = line.match(pattern);
                if (match) {
                    const potentialName = match[1].trim();
                    // Check if it's a known student name
                    if (this.isKnownStudent(potentialName)) {
                        return potentialName;
                    }
                }
            }
            // --- ENHANCED: Look for any known student name in the line (not just as label) ---
            for (const [key, value] of Object.entries(this.studentMappings)) {
                if (line.toLowerCase().includes(key) || line.toLowerCase().includes(value.toLowerCase())) {
                    // Avoid false positives for coach
                    if (!line.toLowerCase().includes(coachLower)) {
                        this.logger?.info(`[DEBUG] Matched student '${value}' in line: ${line}`);
                        return value;
                    }
                }
            }
        }
        
        return null;
    }
    
    /**
     * Check if a name is a known student
     */
    isKnownStudent(name) {
        if (!name) return false;
        
        const nameLower = name.toLowerCase();
        
        // Check against student mappings
        for (const [key, value] of Object.entries(this.studentMappings)) {
            if (nameLower.includes(key) || nameLower.includes(value.toLowerCase())) {
                return true;
            }
        }
        
        // Check against coach names to avoid false positives
        for (const [key, value] of Object.entries(this.coachMappings)) {
            if (nameLower.includes(key) || nameLower.includes(value)) {
                return false; // This is a coach, not a student
            }
        }
        
        // If it's a reasonable name format and not a coach, it might be a student
        return /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?$/.test(name);
    }
    
    /**
     * Determine session type
     */
    determineSessionType(components, recording) {
        const topic = (recording.topic || '').toLowerCase();
        
        this.logger?.info(`[DEBUG] determineSessionType: topic='${topic}', coach='${components.coach}', student='${components.student}'`);
        
        // Check for specific session types
        if (topic.includes('game plan')) {
            this.logger?.info(`[DEBUG] determineSessionType: returning 'GamePlan' (game plan detected)`);
            return 'GamePlan';
        }
        
        if (topic.includes('sat prep') || topic.includes('sat session')) {
            this.logger?.info(`[DEBUG] determineSessionType: returning 'SAT' (SAT prep/session detected)`);
            return 'SAT';
        }
        
        // Check for test sessions
        if (topic.includes('test')) {
            this.logger?.info(`[DEBUG] determineSessionType: returning 'MISC' (test session detected)`);
            return 'MISC';
        }
        
        // If both coach and student are present, always Coaching (regardless of duration)
        if (components.coach !== 'Unknown' && components.student !== 'Unknown') {
            this.logger?.info(`[DEBUG] determineSessionType: returning 'Coaching' (both coach and student present)`);
            return 'Coaching';
        }
        
        // Personal Meeting Room with coach = Coaching (fallback)
        if (topic.includes('personal meeting room') && components.coach !== 'Unknown' && components.coach !== 'unknown') {
            this.logger?.info(`[DEBUG] determineSessionType: returning 'Coaching' (Personal Meeting Room with coach)`);
            return 'Coaching';
        }
        
        // Check duration for trivial sessions (only if no coach-student pair found)
        if (recording.duration && recording.duration < 300) { // Less than 5 minutes
            this.logger?.info(`[DEBUG] determineSessionType: returning 'MISC' (duration < 300s)`);
            return 'MISC';
        }
        
        // No student identified = Admin/MISC
        if (components.student === 'Unknown' || !components.student) {
            this.logger?.info(`[DEBUG] determineSessionType: returning 'MISC' (no student identified)`);
            return 'MISC';
        }
        
        this.logger?.info(`[DEBUG] determineSessionType: returning 'MISC' (default fallback)`);
        return 'MISC';
    }
    
    /**
     * Determine folder category for Google Drive organization
     */
    determineFolderCategory({ coach, student, sessionType, topic, duration }) {
        // Check for trivial sessions (very short)
        if (duration && duration < 300) { // Less than 5 minutes
            return 'trivial';
        }
        
        // Check for test sessions
        if (topic && topic.toLowerCase().includes('test')) {
            return 'trivial';
        }
        
        // Admin/MISC sessions
        if (sessionType === 'Admin' || sessionType === 'MISC') {
            return 'misc';
        }
        
        // No student identified
        if (!student || student === 'Unknown') {
            return 'misc';
        }
        
        // Coach sessions with students go to both coaches and students folders
        if (coach && coach !== 'Unknown' && student && student !== 'Unknown') {
            return 'students'; // Primary location, with shortcut in coaches
        }
        
        // Default
        return 'misc';
    }
    
    /**
     * Build standardized folder name
     * Format: {SessionType}_{coach}_{student}_Wk{number}_{date}_M:{meetingId}U:{uuid}
     */
    buildStandardizedFolderName({ coach, student, weekNumber, sessionType, date, meetingId, uuid }) {
        const parts = [];
        
        // Session type prefix
        switch (sessionType) {
            case 'GamePlan':
                parts.push('GamePlan');
                break;
            case 'SAT':
                parts.push('SAT');
                break;
            case 'Admin':
            case 'MISC':
                parts.push('MISC');
                break;
            default:
                parts.push('Coaching');
        }
        
        // Coach name (remove spaces for consistency)
        const coachName = coach.replace(/\s+/g, '');
        parts.push(coachName !== 'Unknown' ? coachName : 'unknown');
        
        // Student name (first name only)
        const studentFirstName = student.split(' ')[0];
        parts.push(studentFirstName !== 'Unknown' ? studentFirstName : 'Unknown');
        
        // Week number
        if (weekNumber && sessionType !== 'Admin' && sessionType !== 'MISC') {
            // Handle special week formats (e.g., Wk00B)
            const weekStr = String(weekNumber);
            if (weekStr.match(/^\d+$/)) {
                parts.push(`Wk${weekStr.padStart(2, '0')}`);
            } else {
                parts.push(`Wk${weekStr}`);
            }
        } else {
            parts.push('WkUnknown');
        }
        
        // Date in YYYY-MM-DD format
        parts.push(date);
        
        // CRITICAL FIX: Add unique identifier suffix to prevent conflicts
        if (meetingId && uuid) {
            parts.push(`M:${meetingId}U:${uuid}`);
        }
        
        return parts.join('_');
    }
    
    /**
     * Standardize coach name
     */
    async standardizeCoachName(coachName) {
        if (!coachName || typeof coachName !== 'string') return 'Unknown';
        const normalized = coachName.trim().toLowerCase();
        // Check exact matches first
        for (const [key, value] of Object.entries(this.coachMappings)) {
            if (normalized === key.toLowerCase() || normalized === value.toLowerCase()) {
                return this.capitalizeName(value);
            }
        }
        // Check partial matches
        for (const [key, value] of Object.entries(this.coachMappings)) {
            if (normalized.includes(key.toLowerCase()) || normalized.includes(value.toLowerCase())) {
                return this.capitalizeName(value);
            }
        }
        // If no match found, capitalize the original name
        return this.capitalizeName(coachName);
    }
    
    /**
     * Standardize student name
     */
    async standardizeStudentName(studentName) {
        if (!studentName || typeof studentName !== 'string') return 'Unknown';
        const normalized = studentName.trim().toLowerCase();
        // Check exact matches first
        for (const [key, value] of Object.entries(this.studentMappings)) {
            if (normalized === key.toLowerCase() || normalized === value.toLowerCase()) {
                return this.capitalizeName(value);
            }
        }
        // Check partial matches (more flexible)
        for (const [key, value] of Object.entries(this.studentMappings)) {
            const keyLower = key.toLowerCase();
            const valueLower = value.toLowerCase();
            if (normalized.includes(keyLower) || normalized.includes(valueLower)) {
                return this.capitalizeName(value);
            }
            if (keyLower.includes(normalized) || valueLower.includes(normalized)) {
                return this.capitalizeName(value);
            }
        }
        // Special handling for common student names that might not be in mappings
        const commonStudentNames = [
            'aarnav', 'aarnav shah', 'aarnav patel', 'aarnav kumar',
            'kavya', 'kavya venkatesan', 'kavya patel',
            'arshiya', 'arshya', 'arshiya patel',
            'priya', 'priya patel', 'priya shah',
            'aisha', 'aisha khan', 'aisha patel',
            'anoushka', 'anoushka chakravarty',
            'minseo', 'minseo kim',
            'victoria', 'ananyaa', 'arushi', 'huda', 'emma',
            'abhi', 'kabir', 'netra', 'shashank', 'sameeha', 'danait', 'vihana'
        ];
        for (const commonName of commonStudentNames) {
            if (normalized === commonName.toLowerCase() || normalized.includes(commonName.toLowerCase())) {
                return this.capitalizeName(commonName.split(' ')[0]); // Return first name only
            }
        }
        // If no match found, capitalize the original name
        return this.capitalizeName(studentName);
    }
    
    /**
     * Extract week from text
     */
    extractWeekFromText(text) {
        if (!text) return null;
        
        for (const pattern of this.weekPatterns) {
            const match = text.match(pattern.regex);
            if (match) {
                const weekStr = match[1];
                // Handle numeric weeks
                if (/^\d+$/.test(weekStr)) {
                    const weekNum = parseInt(weekStr);
                    if (weekNum > 0 && weekNum <= 52) {
                        return weekNum;
                    }
                } else {
                    // Handle special formats like "2B"
                    return weekStr;
                }
            }
        }
        
        return null;
    }
    
    /**
     * Get date
     */
    getDate(context) {
        if (context.timestamp) return context.timestamp.split('T')[0];
        if (context.start_time) return context.start_time.split('T')[0];
        if (context.recordingDate) return context.recordingDate;
        return new Date().toISOString().split('T')[0];
    }
    
    /**
     * Calculate confidence
     */
    calculateConfidence(components, sessionType) {
        let confidence = 0;
        
        // Base confidence from extraction method
        if (components.method === 'pattern_match') {
            confidence += 40;
        } else if (components.method.includes('host_')) {
            confidence += 30;
        } else {
            confidence += 10;
        }
        
        // Coach identification
        if (components.coach !== 'Unknown' && components.coach !== 'unknown') {
            confidence += 20;
        }
        
        // Student identification
        if (components.student !== 'Unknown') {
            confidence += 20;
        }
        
        // Week extraction
        if (components.week) {
            confidence += 10;
        }
        
        // Session type identification
        if (sessionType !== 'MISC') {
            confidence += 10;
        }
        
        return Math.min(100, confidence);
    }
    
    /**
     * Create error result
     */
    createErrorResult(input, error = null) {
        return {
            standardized: 'MISC_unknown_Unknown_WkUnknown_' + new Date().toISOString().split('T')[0],
            confidence: 0,
            original: input || '',
            method: 'error',
            components: {
                coach: 'unknown',
                student: 'Unknown',
                week: null,
                sessionType: 'MISC',
                folderCategory: 'misc'
            },
            folderCategory: 'misc',
            sessionType: 'MISC',
            standardizedName: 'MISC_unknown_Unknown_WkUnknown_' + new Date().toISOString().split('T')[0],
            error: error
        };
    }

    /**
     * Capitalize the first letter of a name
     */
    capitalizeName(name) {
        if (!name || typeof name !== 'string') return name;
        
        // Handle multiple words (e.g., "john doe" -> "John Doe")
        return name.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }
}

module.exports = { CompleteSmartNameStandardizer };
