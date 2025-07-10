/**
 * Final Complete Smart Name Standardizer
 * Incorporates all logic from RecordingAnalyzer, SmartRecordingStandardizer,
 * and proper session type categorization
 * 
 * Format: {SessionType}_{coach}_{student}_Wk{number}_{date}
 * Example: Coaching_jenny_Arshiya_Wk16_2025-06-04
 */

const { RecordingCategorizer } = require('../../utils/RecordingCategorizer');

class CompleteSmartNameStandardizer {
    constructor(dependencies = {}) {
        this.logger = dependencies.logger || console;
        this.cache = dependencies.cache;
        this.knowledgeBase = dependencies.knowledgeBase;
        
        // Initialize the enhanced categorizer
        this.categorizer = new RecordingCategorizer(this.logger);
        
        // Coach mappings from SmartRecordingStandardizer
        this.coachMappings = {
            'jenny': 'Jenny',
            'jenny duan': 'Jenny',
            'jennyduan': 'Jenny',
            'jamie': 'Jamie',
            'jamie judahbram': 'Jamie',
            'jamiejudahbram': 'Jamie',
            'ivylevel jamie': 'Jamie',
            'rishi': 'Rishi',
            'rishi padmanabhan': 'Rishi',
            'aditi': 'Aditi',
            'aditi b': 'Aditi',
            'aditi bhaskar': 'Aditi',
            'noor': 'Noor',
            'noor hassan': 'Noor',
            'juli': 'Juli',
            'julie': 'Juli',
            'kelvin': 'Kelvin',
            'erin': 'Erin',
            'erin ye': 'Erin',
            'steven': 'Steven',
            'steven zhou': 'Steven',
            'marissa': 'Marissa',
            'andrew': 'Andrew',
            'janice': 'Janice',
            'janice teoh': 'Janice',
            'siraj': 'Siraj',
            'katie': 'Katie',
            'alan': 'Alan',
            'alice': 'Alice',
            'vilina': 'Vilina'
        };
        
        // Initialize comprehensive student mappings
        this.studentMappings = this.loadComprehensiveStudentMappings();
        
        // Meeting patterns - ORDER MATTERS! More specific patterns first
        this.meetingPatterns = [
            // Pattern for "Name | IvyLevel Week X" format (must come FIRST)
            {
                regex: /^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*\|\s*IvyLevel\s+Week\s+(\d+)/i,
                fields: { student: 1, week: 2 },
                sessionType: 'Coaching'
            },
            
            // GamePlan pattern MUST come before generic patterns
            {
                regex: /Game\s*Plan/i,
                sessionType: 'GamePlan',
                skipFieldExtraction: true,  // Don't extract coach/student from pattern
                extractStudent: (topic) => {
                    // Extract student name from GamePlan title
                    // Examples: "Gameplan & JennyDuan", "Game Plan - JennyDuan & Arshiya"
                    
                    // First check for patterns with & separating names
                    // Specifically handle "Game Plan - JennyDuan & Arshiya" format
                    const complexPattern = /Game\s*Plan\s*[-–]\s*\w+\s*&\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i;
                    const complexMatch = topic.match(complexPattern);
                    if (complexMatch && complexMatch[1]) {
                        return complexMatch[1].trim();
                    }
                    
                    // Also try pattern where names are together like "JennyDuan" before &
                    const compoundPattern = /Game\s*Plan\s*[-–]\s*(\w+)(\w+)\s*&\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i;
                    const compoundMatch = topic.match(compoundPattern);
                    if (compoundMatch && compoundMatch[3]) {
                        return compoundMatch[3].trim();
                    }
                    
                    // Standard patterns
                    const patterns = [
                        /Game\s*Plan\s*&\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
                        /Game\s*Plan\s*-\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
                        /Game\s*Plan\s*:\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
                        /Game\s*Plan\s+for\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
                        /Game\s*Plan\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i
                    ];
                    
                    for (const pattern of patterns) {
                        const match = topic.match(pattern);
                        if (match && match[1]) {
                            // Clean up the student name
                            let studentName = match[1].trim();
                            // Handle cases like "JennyDuan" where Jenny is the coach
                            if (studentName.toLowerCase().startsWith('jenny')) {
                                studentName = studentName.substring(5).trim();
                            }
                            // Handle compound names like "JennyDuan"
                            if (studentName.toLowerCase() === 'duan' || studentName.toLowerCase() === 'jennyduan') {
                                // If we only got part of the name, look for the full pattern
                                const fullMatch = topic.match(/&\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
                                if (fullMatch && fullMatch[1]) {
                                    return fullMatch[1].trim();
                                }
                            }
                            return studentName;
                        }
                    }
                    return null;
                }
            },
            // Specific session patterns with delimiters
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
                regex: /^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*<>\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
                fields: { coach: 1, student: 2 },
                sessionType: 'Coaching'
            },
            // Generic patterns that could match GamePlan incorrectly
            {
                regex: /^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*&\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
                fields: { coach: 1, student: 2 },
                sessionType: 'Coaching',
                // Skip if GamePlan is detected
                condition: (topic) => !topic.match(/Game\s*Plan/i)
            },
            {
                regex: /^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*-\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
                fields: { coach: 1, student: 2 },
                sessionType: 'Coaching'
            },
            {
                regex: /^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+and\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
                fields: { name1: 1, name2: 2 },
                sessionType: 'Coaching',
                smartDetection: true
            },
            {
                regex: /SAT\s*Prep|SAT\s*Session/i,
                sessionType: 'SAT'
            },
            {
                regex: /^(.+?)(?:'s|'s)\s+Personal\s+Meeting\s+Room$/i,
                fields: { coach: 1 },
                sessionType: 'Coaching',
                extractStudent: (topic, match) => {
                    // Extract student from "Jamie JudahBram's Personal Meeting Room"
                    const fullName = match[1];
                    
                    // Check if the full name is a known coach (e.g., "Jamie JudahBram")
                    const fullNameLower = fullName.toLowerCase();
                    if (this.coachMappings && this.coachMappings[fullNameLower]) {
                        // This is just the coach's full name, no student in the title
                        this.logger?.info(`[DEBUG] Personal Meeting Room belongs to coach: ${fullName}`);
                        return null; // Will need to extract student from transcript/chat
                    }
                    
                    // Check if it's a known coach followed by student name
                    const coachStudentPattern = /^(jamie|noor|jenny|rishi|aditi|kelvin|erin|steven|marissa|andrew|janice|siraj|katie|alan|alice|vilina)\s+(.+)$/i;
                    const coachStudentMatch = fullName.match(coachStudentPattern);
                    if (coachStudentMatch) {
                        const coachPart = coachStudentMatch[1];
                        const remainingPart = coachStudentMatch[2];
                        
                        // Check if this might be the coach's last name (like "JudahBram")
                        const fullCoachName = `${coachPart} ${remainingPart}`.toLowerCase();
                        if (this.coachMappings && this.coachMappings[fullCoachName]) {
                            // This is the coach's full name
                            this.logger?.info(`[DEBUG] Personal Meeting Room belongs to coach: ${coachPart} ${remainingPart}`);
                            return null;
                        }
                        
                        // Otherwise, the remaining part is likely the student
                        return remainingPart;
                    }
                    
                    // Check if it's a compound name
                    const parts = fullName.split(/\s+/);
                    if (parts.length >= 2) {
                        // If first part is a known coach first name
                        const firstPart = parts[0].toLowerCase();
                        if (this.coachMappings && this.coachMappings[firstPart]) {
                            // Check if the full name is a coach
                            const fullNameCheck = parts.join(' ').toLowerCase();
                            if (this.coachMappings[fullNameCheck]) {
                                return null; // It's the coach's full name
                            }
                            
                            // Otherwise return the rest as student
                            return parts.slice(1).join(' ');
                        }
                        
                        // Otherwise, check if last part looks like a name
                        const possibleStudent = parts[parts.length - 1];
                        if (possibleStudent.length > 3 && /^[A-Z][a-z]+/.test(possibleStudent)) {
                            return possibleStudent;
                        }
                    }
                    return null;
                }
            },
            // Add pattern for "Name | IvyLevel Week X" format
            {
                regex: /^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*\|\s*IvyLevel\s+Week\s+(\d+)/i,
                fields: { student: 1, week: 2 },
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
            'vihana': 'Vihana',
            'zainab': 'Zainab',
            'hiba': 'Hiba',
            'judah': 'Judah',
            'bram': 'Bram'
        };
    }
    
    /**
     * Helper to check if a UUID is base64 (Zoom format)
     */
    isBase64Uuid(uuid) {
        // Zoom base64 UUIDs are typically 22 chars and end with ==
        return typeof uuid === 'string' && uuid.length >= 22 && uuid.endsWith('==');
    }

    /**
     * Helper to check if a UUID is hex or hex-with-dashes
     */
    isHexUuid(uuid) {
        return typeof uuid === 'string' && (
            /^[a-f0-9]{32}$/i.test(uuid) ||
            /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(uuid)
        );
    }

    /**
     * Main standardization method - RESTORED FROM BACKUP WORKING VERSION
     * Simple, direct approach that worked reliably
     */
    async standardizeName(input, context = {}) {
        try {
            if (!input || typeof input !== 'string') {
                return this.createErrorResult(input, null, context.dataSource || context.data_source || context.source);
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
                // For Personal Meeting Room, we need to check if the full name is just the coach's name
                const match = recording.topic.match(/^(.+?)(?:'s|'s)\s+Personal\s+Meeting\s+Room$/i);
                if (match && match[1]) {
                    const fullName = match[1];
                    const fullNameLower = fullName.toLowerCase();
                    
                    // Don't extract student if this is just the coach's full name
                    if (this.coachMappings && !this.coachMappings[fullNameLower]) {
                        // Only try to extract if it's NOT a known coach full name
                        const parts = fullName.split(/\s+/);
                        if (parts.length >= 2) {
                            const possibleStudent = parts[parts.length - 1];
                            if (possibleStudent.length > 3 && /^[A-Z][a-z]+/.test(possibleStudent)) {
                                components.student = possibleStudent;
                                this.logger?.info(`🔍 [PMR] Extracted student from Personal Meeting Room: ${possibleStudent}`);
                            }
                        }
                    }
                }
            }
            // Determine session type AFTER enhanced student extraction
            const sessionType = this.determineSessionType(components, recording);
            components.sessionType = sessionType;
            // --- ENHANCED: Re-standardize coach name if this is a Game Plan session ---
            if (sessionType === 'GamePlan' && components.coach !== 'Jenny') {
                this.logger?.info(`🔍 [GAME PLAN] Re-standardizing coach to Jenny for Game Plan session`);
                components.coach = 'Jenny';
                components.method = components.method === 'unknown' ? 'game_plan_override' : components.method;
            }
            // Always use the original base64 UUID for naming
            let uuid = context.uuid;
            if (this.isHexUuid(uuid)) {
                this.logger?.warn(`⚠️ Hex or hex-dash UUID detected for naming: ${uuid}. Please use base64 UUID as from Zoom.`);
                // Try to use context.originalUuid if available
                if (context.originalUuid && this.isBase64Uuid(context.originalUuid)) {
                    uuid = context.originalUuid;
                } else {
                    // Fallback: leave as is, but warn
                }
            }
            // Build standardized name
            const standardizedName = this.buildStandardizedFolderName({
                coach: components.coach,
                student: components.student,
                weekNumber: components.week,
                sessionType: sessionType,
                date: this.getDate(context),
                meetingId: context.id || context.meeting_id,
                uuid: uuid,
                topic: recording.topic,
                dataSource: context.dataSource || context.data_source || context.source
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
            return this.createErrorResult(input, error, context.dataSource || context.data_source || context.source);
        }
    }
    
    /**
     * Extract components from recording - PRIORITY: HIGH-FIDELITY DATA SOURCES FIRST
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
        
        // ===== PRIORITY 1: HIGH-FIDELITY DATA SOURCES =====
        // 1.1 Extract from participants (timeline JSON, chat, transcript)
        if (recording.participants && recording.participants.length > 0) {
            this.logger?.info(`[DEBUG] Attempting participant extraction from ${recording.participants.length} participants`);
            
            const participantAnalysis = this.extractFromParticipants(recording.participants);
            if (participantAnalysis.coach && participantAnalysis.coach !== 'Unknown') {
                result.coach = await this.standardizeCoachName(participantAnalysis.coach);
                result.method = 'participants';
                this.logger?.info(`✅ [HIGH-FIDELITY] Coach extracted from participants: ${result.coach}`);
            }
            if (participantAnalysis.student && participantAnalysis.student !== 'Unknown') {
                result.student = await this.standardizeStudentName(participantAnalysis.student);
                result.method = result.method === 'unknown' ? 'participants' : result.method;
                this.logger?.info(`✅ [HIGH-FIDELITY] Student extracted from participants: ${result.student}`);
            }
        }
        
        // 1.2 Extract from transcript content
        if ((result.coach === 'Unknown' || result.student === 'Unknown') && recording.transcriptContent && recording.transcriptContent.length > 50) {
            this.logger?.info(`[DEBUG] Attempting transcript extraction with ${recording.transcriptContent.length} characters`);
            
            if (result.coach === 'Unknown') {
                const coachFromTranscript = this.extractCoachFromTranscript(recording.transcriptContent);
                if (coachFromTranscript) {
                    result.coach = await this.standardizeCoachName(coachFromTranscript);
                    result.method = result.method === 'unknown' ? 'transcript' : result.method;
                    this.logger?.info(`✅ [HIGH-FIDELITY] Coach extracted from transcript: ${result.coach}`);
                }
            }
            
            if (result.student === 'Unknown') {
                const studentFromTranscript = this.extractStudentFromTranscript(recording.transcriptContent, result.coach);
                if (studentFromTranscript) {
                    result.student = await this.standardizeStudentName(studentFromTranscript);
                    result.method = result.method === 'unknown' ? 'transcript' : result.method;
                    this.logger?.info(`✅ [HIGH-FIDELITY] Student extracted from transcript: ${result.student}`);
                }
            }
        }
        
        // 1.3 Extract from chat content
        if ((result.coach === 'Unknown' || result.student === 'Unknown') && recording.chatContent && recording.chatContent.length > 20) {
            this.logger?.info(`[DEBUG] Attempting chat extraction with ${recording.chatContent.length} characters`);
            
            if (result.coach === 'Unknown') {
                const coachFromChat = this.extractCoachFromChat(recording.chatContent);
                if (coachFromChat) {
                    result.coach = await this.standardizeCoachName(coachFromChat);
                    result.method = result.method === 'unknown' ? 'chat' : result.method;
                    this.logger?.info(`✅ [HIGH-FIDELITY] Coach extracted from chat: ${result.coach}`);
                }
            }
            
            if (result.student === 'Unknown') {
                const studentFromChat = this.extractStudentFromChat(recording.chatContent, result.coach);
                if (studentFromChat) {
                    result.student = await this.standardizeStudentName(studentFromChat);
                    result.method = result.method === 'unknown' ? 'chat' : result.method;
                    this.logger?.info(`✅ [HIGH-FIDELITY] Student extracted from chat: ${result.student}`);
                }
            }
        }
        
        // 1.4 Extract from host email (if still unknown)
        if (result.coach === 'Unknown' && recording.host_email) {
            const hostEmail = recording.host_email.toLowerCase();
            for (const [key, value] of Object.entries(this.coachMappings)) {
                if (hostEmail.includes(key) || hostEmail.includes(value)) {
                    result.coach = value;
                    result.method = result.method === 'unknown' ? 'host_email' : result.method;
                    this.logger?.info(`✅ [HIGH-FIDELITY] Coach extracted from host email: ${result.coach}`);
                    break;
                }
            }
        }
        
        // ===== PRIORITY 2: LOW-FIDELITY FALLBACK (PATTERN MATCHING) =====
        // Only use pattern matching if high-fidelity sources failed
        if (result.coach === 'Unknown' || result.student === 'Unknown') {
            this.logger?.info(`[DEBUG] High-fidelity extraction incomplete, falling back to pattern matching`);
            this.logger?.info(`[DEBUG] Current state - Coach: ${result.coach}, Student: ${result.student}`);
            
            // Try meeting patterns as last resort
            for (const pattern of this.meetingPatterns) {
                // Check condition if present
                if (pattern.condition && !pattern.condition(topic)) {
                    continue;
                }
                
                const match = topic.match(pattern.regex);
                if (match) {
                    this.logger?.info(`[DEBUG] Pattern matched: ${pattern.regex.source}`);
                    this.logger?.info(`[DEBUG] Match groups:`, match);
                    
                    // Skip field extraction if specified (e.g., for GamePlan)
                    if (pattern.skipFieldExtraction) {
                        result.matchedPattern = pattern;
                        result.method = result.method === 'unknown' ? 'pattern_match' : result.method;
                        
                        // Handle special extraction functions
                        if (pattern.extractStudent && result.student === 'Unknown') {
                            const extractedStudent = pattern.extractStudent(topic);
                            if (extractedStudent) {
                                result.student = await this.standardizeStudentName(extractedStudent);
                                this.logger?.info(`[DEBUG] Extracted student from GamePlan pattern: ${result.student}`);
                            }
                        }
                        
                        // GamePlan sessions always have Jenny as coach
                        if (pattern.sessionType === 'GamePlan' && result.coach === 'Unknown') {
                            result.coach = 'Jenny';
                            this.logger?.info(`[DEBUG] Set coach to Jenny for GamePlan session`);
                        }
                        
                        break;
                    }
                    
                    // Handle smart detection for "and" format
                    if (pattern.smartDetection) {
                        const name1 = match[pattern.fields.name1];
                        const name2 = match[pattern.fields.name2];
                        
                        this.logger?.info(`[DEBUG] Smart detection: name1="${name1}", name2="${name2}"`);
                        
                        // Determine which is coach and which is student
                        const name1IsCoach = await this.isKnownCoach(name1);
                        const name2IsCoach = await this.isKnownCoach(name2);
                        const name1IsStudent = await this.isKnownStudent(name1);
                        const name2IsStudent = await this.isKnownStudent(name2);
                        
                        this.logger?.info(`[DEBUG] Coach check: name1="${name1}" isCoach=${name1IsCoach}, name2="${name2}" isCoach=${name2IsCoach}`);
                        this.logger?.info(`[DEBUG] Student check: name1="${name1}" isStudent=${name1IsStudent}, name2="${name2}" isStudent=${name2IsStudent}`);
                        
                        if (name1IsCoach && name2IsStudent) {
                            if (result.coach === 'Unknown') result.coach = await this.standardizeCoachName(name1);
                            if (result.student === 'Unknown') result.student = await this.standardizeStudentName(name2);
                        } else if (name2IsCoach && name1IsStudent) {
                            if (result.coach === 'Unknown') result.coach = await this.standardizeCoachName(name2);
                            if (result.student === 'Unknown') result.student = await this.standardizeStudentName(name1);
                        } else if (name1IsCoach) {
                            if (result.coach === 'Unknown') result.coach = await this.standardizeCoachName(name1);
                            if (result.student === 'Unknown') result.student = await this.standardizeStudentName(name2);
                        } else if (name2IsCoach) {
                            if (result.coach === 'Unknown') result.coach = await this.standardizeCoachName(name2);
                            if (result.student === 'Unknown') result.student = await this.standardizeStudentName(name1);
                        } else {
                            // Fallback: assume first name is student, second is coach
                            if (result.student === 'Unknown') result.student = await this.standardizeStudentName(name1);
                            if (result.coach === 'Unknown') result.coach = await this.standardizeCoachName(name2);
                        }
                        
                        result.method = result.method === 'unknown' ? 'smart_detection' : result.method;
                        result.matchedPattern = pattern;
                        break;
                    }
                    
                    // Handle regular patterns
                    if (pattern.fields?.coach && result.coach === 'Unknown') {
                        const coachMatch = match[pattern.fields.coach];
                        this.logger?.info(`[DEBUG] Coach match: "${coachMatch}"`);
                        result.coach = await this.standardizeCoachName(coachMatch);
                        this.logger?.info(`[DEBUG] Standardized coach: "${result.coach}"`);
                    }
                    
                    // Special handling for extractStudent function
                    if (pattern.extractStudent && result.student === 'Unknown') {
                        const extractedStudent = pattern.extractStudent(topic, match);
                        if (extractedStudent) {
                            result.student = await this.standardizeStudentName(extractedStudent);
                            this.logger?.info(`[DEBUG] Student extracted via custom function: "${result.student}"`);
                        }
                    }
                    
                    if (pattern.fields?.student && result.student === 'Unknown') {
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
                    
                    result.method = result.method === 'unknown' ? 'pattern_match' : result.method;
                    result.matchedPattern = pattern;
                    break;
                }
            }
        }
        
        // ===== FINAL FALLBACK =====
        // If still unknown, use host email as absolute last resort
        if (result.coach === 'Unknown' && recording.host_email) {
            const hostEmail = recording.host_email.toLowerCase();
            for (const [key, value] of Object.entries(this.coachMappings)) {
                if (hostEmail.includes(key) || hostEmail.includes(value)) {
                    result.coach = value;
                    result.method = result.method === 'unknown' ? 'host_email_fallback' : result.method;
                    this.logger?.info(`⚠️ [FALLBACK] Coach extracted from host email (fallback): ${result.coach}`);
                    break;
                }
            }
        }
        
        this.logger?.info(`[DEBUG] Final result - Coach: ${result.coach}, Student: ${result.student}, Method: ${result.method}`);
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
        
        const lines = transcriptContent.split('\n');
        const studentCandidates = new Map();
        
        // Check if this is VTT format
        const isVTT = lines[0] && lines[0].trim() === 'WEBVTT';
        
        this.logger?.info(`[DEBUG] extractStudentFromTranscript: VTT format detected: ${isVTT}, total lines: ${lines.length}`);
        
        let speakerLinesFound = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Skip empty lines
            if (!line) continue;
            
            // For VTT format, skip line numbers and timestamps
            if (isVTT) {
                // Skip if this is a number (subtitle index)
                if (/^\d+$/.test(line)) continue;
                // Skip if this is a timestamp line
                if (/^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}$/.test(line)) continue;
            }
            
            // Look for speaker patterns: "Name: message"
            const match = line.match(/^([^:]+):\s*(.+)$/);
            if (match) {
                speakerLinesFound++;
                const speakerName = match[1].trim();
                const message = match[2].trim();
                
                if (speakerLinesFound <= 5) {
                    this.logger?.info(`[DEBUG] Found speaker line ${speakerLinesFound}: "${speakerName}: ${message.substring(0, 50)}..."`);
                }
                
                if (!speakerName || speakerName.length < 2) continue;
                
                // Skip if this is the coach (check both first name and full name)
                if (coachName && speakerName.toLowerCase().includes(coachName.toLowerCase())) {
                    continue;
                }
                
                // Also skip if it's a known coach full name
                const speakerLower = speakerName.toLowerCase();
                if (this.coachMappings[speakerLower]) {
                    continue;
                }
                
                // Check if this speaker is a known student by comprehensive mappings
                for (const [studentKey, studentValue] of Object.entries(this.studentMappings)) {
                    const speakerLower = speakerName.toLowerCase();
                    if (speakerLower.includes(studentKey.toLowerCase()) || speakerLower.includes(studentValue.toLowerCase())) {
                        const count = studentCandidates.get(speakerName) || 0;
                        studentCandidates.set(speakerName, count + 1);
                        this.logger?.info(`[DEBUG] Student candidate found in transcript: ${speakerName} -> ${studentValue} (count: ${count + 1})`);
                        break;
                    }
                }
                
                // If not in mappings but not the coach, still consider as a student candidate
                if (!coachName || !speakerName.toLowerCase().includes(coachName.toLowerCase())) {
                    if (speakerName.length > 2 && !speakerName.toLowerCase().includes('judahbram')) {
                        const count = studentCandidates.get(speakerName) || 0;
                        studentCandidates.set(speakerName, count + 1);
                        this.logger?.info(`[DEBUG] Potential student found in transcript: ${speakerName} (count: ${count + 1})`);
                    }
                }
                
                // Also check common student names
                const commonStudentNames = [
                    'aarnav', 'aarnav shah', 'aarnav patel', 'aarnav kumar',
                    'kavya', 'kavya venkatesan', 'kavya patel',
                    'arshiya', 'arshya', 'arshiya patel',
                    'priya', 'priya patel', 'priya shah',
                    'aisha', 'aisha khan', 'aisha patel',
                    'anoushka', 'anoushka chakravarty',
                    'minseo', 'minseo kim',
                    'victoria', 'ananyaa', 'arushi', 'huda', 'emma',
                    'abhi', 'kabir', 'netra', 'shashank', 'sameeha', 'danait', 'vihana',
                    'zainab', 'hiba', 'judah', 'bram'
                ];
                
                for (const commonName of commonStudentNames) {
                    const speakerLower = speakerName.toLowerCase();
                    if (speakerLower.includes(commonName.toLowerCase())) {
                        const count = studentCandidates.get(speakerName) || 0;
                        studentCandidates.set(speakerName, count + 1);
                        this.logger?.info(`[DEBUG] Student candidate found in transcript (common name): ${speakerName} -> ${commonName} (count: ${count + 1})`);
                        break;
                    }
                }
            }
        }
        
        // Return the most frequently mentioned student candidate
        this.logger?.info(`[DEBUG] Total speaker lines found: ${speakerLinesFound}`);
        this.logger?.info(`[DEBUG] Student candidates found: ${studentCandidates.size}`);
        
        if (studentCandidates.size > 0) {
            const sortedCandidates = Array.from(studentCandidates.entries())
                .sort((a, b) => b[1] - a[1]);
            this.logger?.info(`[DEBUG] Top student candidate: ${sortedCandidates[0][0]} (count: ${sortedCandidates[0][1]})`);
            return sortedCandidates[0][0];
        }
        
        this.logger?.info(`[DEBUG] No student candidates found in transcript`);
        return null;
    }
    
    /**
     * Extract student name from chat content
     */
    extractStudentFromChat(chatContent, coachName) {
        if (!chatContent || chatContent.length < 20) return null;
        
        const lines = chatContent.split('\n');
        const studentCandidates = new Map();
        
        for (const line of lines) {
            // Look for chat patterns: "timestamp\tName: message"
            const match = line.match(/^\d{2}:\d{2}:\d{2}\t([^:]+):/);
            if (match) {
                const speakerName = match[1].trim();
                
                if (!speakerName || speakerName.length < 2) continue;
                
                // Skip if this is the coach
                if (coachName && speakerName.toLowerCase().includes(coachName.toLowerCase())) {
                    continue;
                }
                
                // Check if this speaker is a known student by comprehensive mappings
                for (const [studentKey, studentValue] of Object.entries(this.studentMappings)) {
                    const speakerLower = speakerName.toLowerCase();
                    if (speakerLower.includes(studentKey.toLowerCase()) || speakerLower.includes(studentValue.toLowerCase())) {
                        const count = studentCandidates.get(speakerName) || 0;
                        studentCandidates.set(speakerName, count + 1);
                        this.logger?.info(`[DEBUG] Student candidate found in chat: ${speakerName} -> ${studentValue} (count: ${count + 1})`);
                        break;
                    }
                }
                
                // Also check common student names
                const commonStudentNames = [
                    'aarnav', 'aarnav shah', 'aarnav patel', 'aarnav kumar',
                    'kavya', 'kavya venkatesan', 'kavya patel',
                    'arshiya', 'arshya', 'arshiya patel',
                    'priya', 'priya patel', 'priya shah',
                    'aisha', 'aisha khan', 'aisha patel',
                    'anoushka', 'anoushka chakravarty',
                    'minseo', 'minseo kim',
                    'victoria', 'ananyaa', 'arushi', 'huda', 'emma',
                    'abhi', 'kabir', 'netra', 'shashank', 'sameeha', 'danait', 'vihana',
                    'zainab', 'hiba', 'judah', 'bram'
                ];
                
                for (const commonName of commonStudentNames) {
                    const speakerLower = speakerName.toLowerCase();
                    if (speakerLower.includes(commonName.toLowerCase())) {
                        const count = studentCandidates.get(speakerName) || 0;
                        studentCandidates.set(speakerName, count + 1);
                        this.logger?.info(`[DEBUG] Student candidate found in chat (common name): ${speakerName} -> ${commonName} (count: ${count + 1})`);
                        break;
                    }
                }
            }
        }
        
        // Return the most frequently mentioned student candidate
        this.logger?.info(`[DEBUG] Total speaker lines found: ${speakerLinesFound}`);
        this.logger?.info(`[DEBUG] Student candidates found: ${studentCandidates.size}`);
        
        if (studentCandidates.size > 0) {
            const sortedCandidates = Array.from(studentCandidates.entries())
                .sort((a, b) => b[1] - a[1]);
            this.logger?.info(`[DEBUG] Top student candidate: ${sortedCandidates[0][0]} (count: ${sortedCandidates[0][1]})`);
            return sortedCandidates[0][0];
        }
        
        this.logger?.info(`[DEBUG] No student candidates found in transcript`);
        return null;
    }
    
    /**
     * Check if a name is a known student
     */
    isKnownStudent(name) {
        if (!name) return false;
        const normalized = name.toLowerCase().trim();
        
        // Check in student mappings
        if (this.studentMappings[normalized]) {
            return true;
        }
        
        // Check in common student names
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
        
        return commonStudentNames.some(commonName => 
            normalized === commonName.toLowerCase() || 
            normalized.includes(commonName.toLowerCase()) ||
            commonName.toLowerCase().includes(normalized)
        );
    }
    
    /**
     * Check if a name is a known coach
     */
    isKnownCoach(name) {
        if (!name) return false;
        const normalized = name.toLowerCase().trim();
        
        // Check in coach mappings
        if (this.coachMappings[normalized]) {
            return true;
        }
        
        // Check partial matches in coach mappings
        for (const [key, value] of Object.entries(this.coachMappings)) {
            if (normalized.includes(key.toLowerCase()) || 
                key.toLowerCase().includes(normalized) ||
                normalized.includes(value.toLowerCase()) ||
                value.toLowerCase().includes(normalized)) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Determine session type
     */
    determineSessionType(components, recording) {
        this.logger?.info(`[DEBUG] determineSessionType: topic='${recording.topic}', coach='${components.coach}', student='${components.student}'`);
        
        // Use the enhanced categorizer for better categorization
        const category = this.categorizer.categorize(components, recording);
        
        this.logger?.info(`[DEBUG] determineSessionType: categorizer returned '${category}'`);
        
        // Map categorizer results to session types
        switch (category) {
            case 'Coaching_GamePlan':
                return 'GamePlan';
            case 'Coaching':
                return 'Coaching';
            case 'MISC':
                return 'MISC';
            case 'TRIVIAL':
                return 'TRIVIAL';
            default:
                return 'MISC';
        }
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
        
        // NEW: NO SHOW scenarios (coach identified but didn't join)
        if (sessionType === 'MISC' && 
            coach && coach !== 'Unknown' && 
            student && student !== 'Unknown' &&
            topic.toLowerCase().includes('personal meeting room') &&
            duration >= 1800) { // At least 30 minutes (student waited)
            return 'misc'; // NO SHOW scenarios go to misc folder
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
     * Format: {SessionType}_{indicator}_{coach}_{student}_Wk{number}_{date}_M:{meetingId}U:{uuid}
     * Where indicator is: A (Zoom API), B (Google Drive), or C (Webhook)
     * Always use base64 UUID for the U: part
     */
    buildStandardizedFolderName({ coach, student, weekNumber, sessionType, date, meetingId, uuid, topic, dataSource }) {
        // Determine data source indicator
        let indicator = '';
        if (dataSource) {
            const source = dataSource.toLowerCase();
            if (source.includes('zoom') && (source.includes('api') || source.includes('cloud') || source.includes('batch'))) {
                indicator = 'A';
            } else if (source.includes('google') || source.includes('drive')) {
                indicator = 'B';
            } else if (source.includes('webhook')) {
                indicator = 'C';
            }
        }
        
        // Only use base64 UUID for naming
        let safeUuid = uuid;
        if (this.isHexUuid(uuid)) {
            this.logger?.warn(`⚠️ Hex or hex-dash UUID detected in buildStandardizedFolderName: ${uuid}. Please use base64 UUID as from Zoom.`);
            safeUuid = uuid; // fallback, but warn
        }
        if (!this.isBase64Uuid(uuid)) {
            this.logger?.warn(`⚠️ Non-base64 UUID detected in buildStandardizedFolderName: ${uuid}. Folder/file names may not match Google Sheet.`);
        }
        // Special handling for Game Plan sessions
        if (sessionType === 'GamePlan') {
            const studentFirstName = student.split(' ')[0];
            const parts = [
                `Coaching_GamePlan${indicator ? '_' + indicator : ''}`,
                'Jenny',
                studentFirstName !== 'Unknown' ? studentFirstName : 'Unknown',
                'Wk1',
                date,
                `M:${meetingId}U:${safeUuid}`
            ];
            return parts.join('_');
        }
        if (sessionType === 'TRIVIAL') {
            const parts = [
                `TRIVIAL${indicator ? '_' + indicator : ''}`,
                coach.replace(/\s+/g, '') !== 'Unknown' ? coach.replace(/\s+/g, '') : 'unknown',
                student.split(' ')[0] !== 'Unknown' ? student.split(' ')[0] : 'Unknown',
                date,
                `M:${meetingId}U:${safeUuid}`
            ];
            return parts.join('_');
        }
        const parts = [];
        switch (sessionType) {
            case 'SAT':
                parts.push(`SAT${indicator ? '_' + indicator : ''}`);
                break;
            case 'Admin':
                parts.push(`MISC${indicator ? '_' + indicator : ''}`);
                break;
            case 'MISC':
                if (topic && topic.toLowerCase().includes('personal meeting room') && 
                    coach && coach !== 'Unknown' && 
                    student && student !== 'Unknown') {
                    parts.push(`NO_SHOW${indicator ? '_' + indicator : ''}`);
                } else {
                    parts.push(`MISC${indicator ? '_' + indicator : ''}`);
                }
                break;
            default:
                parts.push(`Coaching${indicator ? '_' + indicator : ''}`);
        }
        const coachName = coach.replace(/\s+/g, '');
        parts.push(coachName !== 'Unknown' ? coachName : 'unknown');
        const studentFirstName = student.split(' ')[0];
        parts.push(studentFirstName !== 'Unknown' ? studentFirstName : 'Unknown');
        if (weekNumber && sessionType !== 'Admin' && sessionType !== 'MISC') {
            const weekStr = String(weekNumber);
            if (weekStr.match(/^\d+$/)) {
                parts.push(`Wk${weekStr.padStart(2, '0')}`);
            } else {
                parts.push(`Wk${weekStr}`);
            }
        } else {
            parts.push('WkUnknown');
        }
        parts.push(date);
        if (meetingId && safeUuid) {
            parts.push(`M:${meetingId}U:${safeUuid}`);
        }
        return parts.join('_');
    }
    
    /**
     * Standardize coach name
     */
    async standardizeCoachName(coachName, sessionType = null) {
        // Special handling for Game Plan sessions - always Jenny
        if (sessionType === 'GamePlan') {
            return 'Jenny';
        }
        
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
                // Always return first name only for consistency
                return this.capitalizeName(value.split(' ')[0]);
            }
        }
        
        // Check partial matches (more flexible)
        for (const [key, value] of Object.entries(this.studentMappings)) {
            const keyLower = key.toLowerCase();
            const valueLower = value.toLowerCase();
            if (normalized.includes(keyLower) || normalized.includes(valueLower)) {
                // Always return first name only for consistency
                return this.capitalizeName(value.split(' ')[0]);
            }
            if (keyLower.includes(normalized) || valueLower.includes(normalized)) {
                // Always return first name only for consistency
                return this.capitalizeName(value.split(' ')[0]);
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
                // Always return first name only for consistency
                return this.capitalizeName(commonName.split(' ')[0]);
            }
        }
        
        // If no match found, return first name only for consistency
        return this.capitalizeName(studentName.split(' ')[0]);
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
    createErrorResult(input, error = null, dataSource = null) {
        // Determine indicator based on data source
        let indicator = '';
        if (dataSource) {
            const source = dataSource.toLowerCase();
            if (source.includes('zoom') && (source.includes('api') || source.includes('cloud') || source.includes('batch'))) {
                indicator = '_A';
            } else if (source.includes('google') || source.includes('drive')) {
                indicator = '_B';
            } else if (source.includes('webhook')) {
                indicator = '_C';
            }
        }
        
        const errorName = `MISC${indicator}_unknown_Unknown_WkUnknown_` + new Date().toISOString().split('T')[0];
        return {
            standardized: errorName,
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
            standardizedName: errorName,
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

    /**
     * Extract coach and student from participants (timeline JSON data)
     */
    extractFromParticipants(participants) {
        const result = {
            coach: 'Unknown',
            student: 'Unknown',
            method: 'participants'
        };
        
        if (!participants || !Array.isArray(participants) || participants.length === 0) {
            return result;
        }
        
        this.logger?.info(`[DEBUG] Extracting from ${participants.length} participants`);
        
        // First pass: identify coach by email domain or known coach names
        for (const participant of participants) {
            const name = participant.name || participant.username || '';
            const email = participant.email || participant.email_address || '';
            
            if (!name) continue;
            
            // Check if this is a coach by email domain
            if (email && email.toLowerCase().includes('@ivymentors.co')) {
                if (result.coach === 'Unknown') {
                    result.coach = name;
                    this.logger?.info(`[DEBUG] Coach identified by email domain: ${name}`);
                }
            }
            
            // Check if this is a known coach by name
            for (const [coachKey, coachValue] of Object.entries(this.coachMappings)) {
                const nameLower = name.toLowerCase();
                if (nameLower.includes(coachKey.toLowerCase()) || nameLower.includes(coachValue.toLowerCase())) {
                    if (result.coach === 'Unknown') {
                        result.coach = name;
                        this.logger?.info(`[DEBUG] Coach identified by name mapping: ${name} -> ${coachValue}`);
                    }
                    break;
                }
            }
        }
        
        // Second pass: identify student (non-coach participants)
        for (const participant of participants) {
            const name = participant.name || participant.username || '';
            const email = participant.email || participant.email_address || '';
            
            if (!name) continue;
            
            // Skip if this is already identified as coach
            if (name === result.coach) continue;
            
            // Skip if this is a coach by email domain
            if (email && email.toLowerCase().includes('@ivymentors.co')) continue;
            
            // Check if this is a known student by name
            for (const [studentKey, studentValue] of Object.entries(this.studentMappings)) {
                const nameLower = name.toLowerCase();
                if (nameLower.includes(studentKey.toLowerCase()) || nameLower.includes(studentValue.toLowerCase())) {
                    if (result.student === 'Unknown') {
                        result.student = name;
                        this.logger?.info(`[DEBUG] Student identified by name mapping: ${name} -> ${studentValue}`);
                        break;
                    }
                }
            }
            
            // If no mapping found but we have a non-coach participant, use them as student
            if (result.student === 'Unknown') {
                result.student = name;
                this.logger?.info(`[DEBUG] Student identified as non-coach participant: ${name}`);
            }
        }
        
        return result;
    }
    
    /**
     * Extract coach from transcript content
     */
    extractCoachFromTranscript(transcriptContent) {
        if (!transcriptContent || transcriptContent.length < 50) return null;
        
        const lines = transcriptContent.split('\n');
        const coachCandidates = new Map();
        
        for (const line of lines) {
            // Look for speaker patterns: "Name: message"
            const match = line.match(/^([^:]+):\s*(.+)$/);
            if (match) {
                const speakerName = match[1].trim();
                const message = match[2].trim();
                
                if (!speakerName || speakerName.length < 2) continue;
                
                // Check if this speaker is a known coach
                for (const [coachKey, coachValue] of Object.entries(this.coachMappings)) {
                    const speakerLower = speakerName.toLowerCase();
                    if (speakerLower.includes(coachKey.toLowerCase()) || speakerLower.includes(coachValue.toLowerCase())) {
                        const count = coachCandidates.get(speakerName) || 0;
                        coachCandidates.set(speakerName, count + 1);
                        this.logger?.info(`[DEBUG] Coach candidate found in transcript: ${speakerName} (count: ${count + 1})`);
                        break;
                    }
                }
            }
        }
        
        // Return the most frequently mentioned coach candidate
        if (coachCandidates.size > 0) {
            const sortedCandidates = Array.from(coachCandidates.entries())
                .sort((a, b) => b[1] - a[1]);
            return sortedCandidates[0][0];
        }
        
        return null;
    }
    
    /**
     * Extract coach from chat content
     */
    extractCoachFromChat(chatContent) {
        if (!chatContent || chatContent.length < 20) return null;
        
        const lines = chatContent.split('\n');
        const coachCandidates = new Map();
        
        for (const line of lines) {
            // Look for chat patterns: "timestamp\tName: message"
            const match = line.match(/^\d{2}:\d{2}:\d{2}\t([^:]+):/);
            if (match) {
                const speakerName = match[1].trim();
                
                if (!speakerName || speakerName.length < 2) continue;
                
                // Check if this speaker is a known coach
                for (const [coachKey, coachValue] of Object.entries(this.coachMappings)) {
                    const speakerLower = speakerName.toLowerCase();
                    if (speakerLower.includes(coachKey.toLowerCase()) || speakerLower.includes(coachValue.toLowerCase())) {
                        const count = coachCandidates.get(speakerName) || 0;
                        coachCandidates.set(speakerName, count + 1);
                        this.logger?.info(`[DEBUG] Coach candidate found in chat: ${speakerName} (count: ${count + 1})`);
                        break;
                    }
                }
            }
        }
        
        // Return the most frequently mentioned coach candidate
        if (coachCandidates.size > 0) {
            const sortedCandidates = Array.from(coachCandidates.entries())
                .sort((a, b) => b[1] - a[1]);
            return sortedCandidates[0][0];
        }
        
        return null;
    }
}

module.exports = { CompleteSmartNameStandardizer };
