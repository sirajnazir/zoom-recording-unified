const { logger } = require('../../shared');

class EnhancedMetadataExtractor {
    constructor({ cache, nameStandardizer, fileContentAnalyzer, knowledgeBase }) {
        this.cache = cache;
        this.nameStandardizer = nameStandardizer;
        this.fileContentAnalyzer = fileContentAnalyzer;
        this.knowledgeBase = knowledgeBase;
        
        // Comprehensive topic patterns - EXPANDED from 5 to 14 patterns
        this.topicPatterns = [
            // Existing strict patterns (keep these first for highest confidence)
            {
                regex: /^([A-Za-z]+)\s*<>\s*([A-Za-z]+)\s*\|\s*Wk\s*#?(\d+)\s*\|\s*(\d+)\s*Wk\s*Program/i,
                description: 'Coach <> Student | Wk #X | Y Wk Program',
                fields: { coach: 1, student: 2, week: 3, program: 4 },
                confidence: 100
            },
            {
                regex: /^([A-Za-z]+)\s*<>\s*([A-Za-z]+)\s*\|\s*Week\s*(\d+)\s*\|\s*(\d+)\s*Wk\s*Program/i,
                description: 'Coach <> Student | Week X | Y Wk Program',
                fields: { coach: 1, student: 2, week: 3, program: 4 },
                confidence: 100
            },
            {
                regex: /^([A-Za-z]+)\s*<>\s*([A-Za-z]+)\s*\|\s*Wk\s*#?(\d+)/i,
                description: 'Coach <> Student | Wk #X',
                fields: { coach: 1, student: 2, week: 3 },
                confidence: 95
            },
            {
                regex: /^([A-Za-z]+)\s*<>\s*([A-Za-z]+)\s*Game\s*Plan\s*Session\s*\|\s*Wk\s*#?(\d+)/i,
                description: 'Coach <> Student Game Plan Session | Wk #X',
                fields: { coach: 1, student: 2, week: 3, sessionType: 'Game Plan' },
                confidence: 100
            },
            {
                regex: /^([A-Za-z]+)\s*<>\s*([A-Za-z]+)/i,
                description: 'Coach <> Student',
                fields: { coach: 1, student: 2 },
                confidence: 85
            },
            // NEW PATTERNS for better extraction
            {
                regex: /^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+and\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(?:ivy\s*level\s*)?meeting/i,
                description: 'Name1 and Name2 (ivy level) meeting',
                fields: { person1: 1, person2: 2 },
                confidence: 80,
                needsResolution: true
            },
            {
                regex: /^([A-Za-z]+)\s+and\s+([A-Za-z]+)\s+meeting$/i,
                description: 'Name1 and Name2 meeting (simple)',
                fields: { person1: 1, person2: 2 },
                confidence: 75,
                needsResolution: true
            },
            {
                regex: /^Weekly\s+Check-?in:?\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*&\s*Coach\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
                description: 'Weekly Check-in: Student & Coach Name',
                fields: { student: 1, coach: 2 },
                confidence: 90
            },
            {
                regex: /^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*&\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*(?:meeting|session|check-?in)/i,
                description: 'Name1 & Name2 meeting/session',
                fields: { person1: 1, person2: 2 },
                confidence: 75,
                needsResolution: true
            },
            {
                regex: /^(?:Essay|College|SAT|Application)\s*(?:Review|Prep|Planning|Session)?\s*[-–]\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
                description: 'Activity - Student Name',
                fields: { student: 1, sessionType: 'match' },
                confidence: 85
            },
            {
                regex: /^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*[-–]\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*(?:meeting|session|discussion)/i,
                description: 'Name1 - Name2 meeting/session',
                fields: { person1: 1, person2: 2 },
                confidence: 75,
                needsResolution: true
            },
            {
                regex: /^(?:Week|Wk)\s*#?(\d+)\s*[-–:]\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*(?:and|&|with)?\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)?/i,
                description: 'Week X: Name1 and/with Name2',
                fields: { week: 1, person1: 2, person2: 3 },
                confidence: 80,
                needsResolution: true
            },
            {
                regex: /^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*[:|-]\s*Week\s*(\d+)\s*(?:Review|Session|Meeting)?/i,
                description: 'Name: Week X Review/Session',
                fields: { person1: 1, week: 2 },
                confidence: 75,
                needsResolution: true
            },
            {
                regex: /^(?:Coach\s+)?([A-Za-z]+)\s*(?:x|X|×)\s*([A-Za-z]+)/i,
                description: 'Coach x Student',
                fields: { coach: 1, student: 2 },
                confidence: 85
            },
            {
                regex: /^([A-Za-z]+)\s*\/\s*([A-Za-z]+)\s*(?:Session|Meeting)?/i,
                description: 'Name1 / Name2 Session',
                fields: { person1: 1, person2: 2 },
                confidence: 70,
                needsResolution: true
            }
        ];
        
        // Coach aliases
        this.coachAliases = {
            'noor': ['noor', 'noor hassan', 'noor@ivymentors.co'],
            'rishi': ['rishi', 'rishi padmanabhan', 'rishi@ivymentors.co'],
            'aditi': ['aditi', 'aditi b', 'aditi bhaskar', 'aditi@ivymentors.co'],
            'jenny': ['jenny', 'jenny duan', 'jenny@ivymentors.co'],
            'jamie': ['jamie', 'jamie@ivymentors.co'],
            'kelvin': ['kelvin', 'kelvin@ivymentors.co'],
            'juli': ['juli', 'julie', 'julie@ivymentors.co'],
            'erin': ['erin', 'erin ye', 'erin@ivymentors.co'],
            'steven': ['steven', 'steven zhou', 'steven@ivymentors.co'],
            'marissa': ['marissa', 'marissa@ivymentors.co'],
            'andrew': ['andrew', 'andrew@ivymentors.co'],
            'janice': ['janice', 'janice teoh', 'janice@ivymentors.co']
        };
        
        // Zoom metadata fields we care about
        this.zoomFields = {
            core: ['id', 'uuid', 'topic', 'start_time', 'duration', 'host_email', 'host_name'],
            participants: ['user_id', 'user_name', 'user_email', 'join_time', 'leave_time'],
            recording: ['recording_start', 'recording_end', 'file_type', 'file_size', 'download_url']
        };
    }

    /**
     * Extract comprehensive metadata from recording
     * ENHANCED: Now prioritizes files over topic parsing
     */
    async extractMetadata(recording) {
        const extraction = {
            // Core results
            coach: null,
            student: null,
            weekNumber: null,
            programDuration: null,
            sessionType: null,
            participantCount: 0,
            
            // Confidence scores
            confidence: {
                coach: 0,
                student: 0,
                weekNumber: 0,
                programDuration: 0,
                sessionType: 0,
                overall: 0
            },
            
            // Evidence tracking
            evidence: [],
            dataSources: [],
            
            // Raw data
            raw: {
                hostEmail: recording.host_email,
                hostName: recording.host_name,
                topic: recording.topic,
                participants: recording.participants || [],
                duration: recording.duration,
                startTime: recording.start_time,
                downloadedFiles: recording.downloadedFiles || {}
            },
            
            // Processing metadata
            processing: {
                timestamp: new Date().toISOString(),
                methods: []
            }
        };

        try {
            // Calculate participant count first
            extraction.participantCount = this.calculateParticipantCount(recording);
            
            // PRIORITY 1: Extract from downloaded files (HIGHEST FIDELITY)
            if (recording.downloadedFiles && Object.keys(recording.downloadedFiles).length > 0) {
                await this.extractFromFiles(recording, extraction);
            }
            
            // PRIORITY 2: Extract from participants data
            await this.extractFromParticipants(recording, extraction);
            
            // PRIORITY 3: Extract from host information
            await this.extractFromHost(recording, extraction);
            
            // PRIORITY 4: Extract from topic (LOWEST FIDELITY - only if needed)
            if (!extraction.coach || !extraction.student || extraction.confidence.coach < 50 || extraction.confidence.student < 50) {
                await this.extractFromTopic(recording, extraction);
            }
            
            // PRIORITY 5: Extract from folder path (if available)
            await this.extractFromFolderPath(recording, extraction);
            
            
            // Infer week number using SmartWeekInferencer
            await this.inferWeekNumber(recording, extraction);
            
            // Apply name standardization
            await this.standardizeNames(extraction);
            
            // Determine session type
            this.determineSessionType(extraction);
            
            // Calculate overall confidence
            extraction.confidence.overall = this.calculateOverallConfidence(extraction.confidence);
            
            logger.info('Metadata extraction completed', {
                coach: extraction.coach,
                student: extraction.student,
                week: extraction.weekNumber,
                participantCount: extraction.participantCount,
                confidence: extraction.confidence.overall,
                dataSources: extraction.dataSources
            });

        } catch (error) {
            extraction.processing.errors = [error.message];
            logger.error('Metadata extraction error:', error);
        }

        return extraction;
    }

    /**
     * Calculate participant count from recording data
     */
    calculateParticipantCount(recording) {
        // If we have participants array, count unique participants
        if (recording.participants && Array.isArray(recording.participants)) {
            const uniqueParticipants = new Set();
            
            for (const participant of recording.participants) {
                const email = participant.user_email || participant.email;
                const name = participant.user_name || participant.name;
                
                // Use email as unique identifier, fallback to name
                const identifier = email || name;
                if (identifier) {
                    uniqueParticipants.add(identifier.toLowerCase());
                }
            }
            
            return uniqueParticipants.size;
        }
        
        // Fallback to recording's participant_count if available
        if (recording.participant_count && typeof recording.participant_count === 'number') {
            return recording.participant_count;
        }
        
        // Default to 2 for coaching sessions (coach + student)
        return 2;
    }

    /**
     * Extract from downloaded files - HIGHEST PRIORITY
     * NEW METHOD - This is what was missing!
     */
    async extractFromFiles(recording, extraction) {
        if (!recording.downloadedFiles || Object.keys(recording.downloadedFiles).length === 0) {
            extraction.evidence.push('No downloaded files available');
            return;
        }
        
        extraction.evidence.push(`Analyzing ${Object.keys(recording.downloadedFiles).length} downloaded files`);
        extraction.dataSources.push('files');
        
        // Use FileContentAnalyzer if available
        if (this.fileContentAnalyzer) {
            const fileAnalysis = await this.fileContentAnalyzer.analyzeRecordingFiles(
                recording.downloadedFiles,
                recording
            );
            
            // Apply results with highest confidence
            if (fileAnalysis.coach && fileAnalysis.coach !== 'unknown' && fileAnalysis.coach !== 'Unknown') {
                const coachConfidence = this.calculateFileConfidence(fileAnalysis.coachSources);
                if (coachConfidence > extraction.confidence.coach) {
                    extraction.coach = fileAnalysis.coach;
                    extraction.confidence.coach = coachConfidence;
                    extraction.processing.methods.push('file_analysis_coach');
                    extraction.evidence.push(`Coach "${extraction.coach}" from files: ${fileAnalysis.coachSources.join(', ')}`);
                }
            }
            
            if (fileAnalysis.student && fileAnalysis.student !== 'Unknown') {
                const studentConfidence = this.calculateFileConfidence(fileAnalysis.studentSources);
                if (studentConfidence > extraction.confidence.student) {
                    extraction.student = fileAnalysis.student;
                    extraction.confidence.student = studentConfidence;
                    extraction.processing.methods.push('file_analysis_student');
                    extraction.evidence.push(`Student "${extraction.student}" from files: ${fileAnalysis.studentSources.join(', ')}`);
                }
            }
            
            if (fileAnalysis.week) {
                const weekConfidence = this.calculateFileConfidence(fileAnalysis.weekSources);
                if (weekConfidence > extraction.confidence.weekNumber) {
                    extraction.weekNumber = fileAnalysis.week;
                    extraction.confidence.weekNumber = weekConfidence;
                    extraction.processing.methods.push('file_analysis_week');
                    extraction.evidence.push(`Week ${extraction.weekNumber} from files: ${fileAnalysis.weekSources.join(', ')}`);
                }
            }
            
            // Store file analysis details
            extraction.fileAnalysis = fileAnalysis;
        }
    }

    /**
     * Calculate confidence based on file sources
     * NEW METHOD
     */
    calculateFileConfidence(sources) {
        if (!sources || sources.length === 0) return 0;
        
        const sourceWeights = {
            'transcript': 95,
            'timeline': 85,
            'metadata': 75,
            'chat': 70
        };
        
        let maxConfidence = 0;
        for (const source of sources) {
            const confidence = sourceWeights[source] || 60;
            maxConfidence = Math.max(maxConfidence, confidence);
        }
        
        // Boost confidence if multiple sources agree
        if (sources.length > 1) {
            maxConfidence = Math.min(100, maxConfidence + (sources.length - 1) * 5);
        }
        
        return maxConfidence;
    }

    /**
     * Extract from host information
     */
    async extractFromHost(recording, extraction) {
        if (!recording.host_email && !recording.host_name) return;

        const hostEmail = recording.host_email?.toLowerCase() || '';
        const hostName = recording.host_name || '';

        // Check email against coach aliases
        for (const [coachName, aliases] of Object.entries(this.coachAliases)) {
            if (aliases.some(alias => hostEmail.includes(alias))) {
                if (!extraction.coach || extraction.coach === 'Unknown' || extraction.confidence.coach < 100) {
                    extraction.coach = coachName.charAt(0).toUpperCase() + coachName.slice(1);
                    extraction.confidence.coach = 100;
                    extraction.evidence.push(`Coach identified from host email: ${hostEmail}`);
                    extraction.dataSources.push('host_email');
                    extraction.processing.methods.push('host_email_match');
                }
                break;
            }
        }

        // If no email match, try name
        if ((!extraction.coach || extraction.coach === 'Unknown') && hostName && this.nameStandardizer) {
            const standardized = await this.nameStandardizer.standardizeName(hostName);
            if (standardized.confidence > 80) {
                extraction.coach = standardized.standardized;
                extraction.confidence.coach = standardized.confidence;
                extraction.evidence.push(`Coach identified from host name: ${hostName}`);
                extraction.dataSources.push('host_name');
                extraction.processing.methods.push('host_name_standardization');
            }
        }
    }

    /**
     * Extract from meeting topic
     * ENHANCED: Now handles more patterns and ambiguous names
     */
    async extractFromTopic(recording, extraction) {
        if (!recording.topic) return;

        const topic = recording.topic;
        extraction.evidence.push(`Analyzing topic: "${topic}"`);
        extraction.dataSources.push('topic');

        // Try patterns in order of confidence
        let patternMatched = false;
        for (const pattern of this.topicPatterns) {
            const match = topic.match(pattern.regex);
            if (match) {
                await this.applyPatternMatch(match, pattern, extraction);
                extraction.processing.methods.push(`topic_pattern_${pattern.description}`);
                patternMatched = true;
                break;
            }
        }

        // If no pattern matched but we have "and" in the topic, try to extract names
        if (!patternMatched && topic.toLowerCase().includes(' and ')) {
            const parts = topic.split(/\s+and\s+/i);
            if (parts.length === 2) {
                const person1 = parts[0].trim();
                const person2Parts = parts[1].trim().split(/\s+/);
                const person2 = person2Parts[0]; // Get just the first word after 'and'
                // Manually resolve coach/student
                const resolution = await this.resolveCoachStudent(person1, person2, extraction);
                if (resolution.student && (!extraction.student || extraction.student === 'Unknown' || extraction.confidence.student < 70)) {
                    extraction.student = resolution.student;
                    extraction.confidence.student = 70; // Lower confidence for manual extraction
                    extraction.evidence.push(`Student "${extraction.student}" extracted from topic (manual)`);
                }
                if (resolution.coach && (!extraction.coach || extraction.coach === 'Unknown' || extraction.confidence.coach < 70)) {
                    extraction.coach = resolution.coach;
                    extraction.confidence.coach = 70;
                    extraction.evidence.push(`Coach "${extraction.coach}" extracted from topic (manual)`);
                }
            }
        }
        // Check for Personal Meeting Room
        if (this.nameStandardizer && this.nameStandardizer.extractFromPersonalMeetingRoom) {
            const pmrResult = this.nameStandardizer.extractFromPersonalMeetingRoom(topic);
            if (pmrResult && pmrResult.coach) {
                if (!extraction.coach || extraction.coach === 'Unknown' || extraction.confidence.coach < pmrResult.confidence) {
                    extraction.coach = pmrResult.coach;
                    extraction.confidence.coach = pmrResult.confidence;
                    extraction.evidence.push('Coach identified from Personal Meeting Room');
                    extraction.processing.methods.push('personal_meeting_room');
                }
                if (pmrResult.student && pmrResult.student !== 'Unknown' && (!extraction.student || extraction.student === 'Unknown' || extraction.confidence.student < (pmrResult.confidence - 10))) {
                    extraction.student = pmrResult.student;
                    extraction.confidence.student = pmrResult.confidence - 10; // Slightly lower confidence
                    extraction.evidence.push('Student inferred from Personal Meeting Room pattern');
                }
            }
        }
    }

    /**
     * Extract from participants
     */
    async extractFromParticipants(recording, extraction) {
        if (!recording.participants || recording.participants.length === 0) return;

        extraction.evidence.push(`Analyzing ${recording.participants.length} participants`);
        extraction.dataSources.push('participants');

        const participants = recording.participants;
        const nonCoachParticipants = [];

        for (const participant of participants) {
            const name = participant.user_name || participant.name || '';
            const email = participant.user_email || participant.email || '';

            // Skip if this is an ivymentors email (staff, not students)
            if (email && email.toLowerCase().includes('@ivymentors.co')) {
                continue;
            }

            // Check if participant is a coach
            let isCoach = false;
            for (const [coachName, aliases] of Object.entries(this.coachAliases)) {
                if (aliases.some(alias => 
                    email.toLowerCase().includes(alias) || 
                    name.toLowerCase().includes(alias)
                )) {
                    isCoach = true;
                    if (!extraction.coach || extraction.coach === 'Unknown' || extraction.confidence.coach < 90) {
                        extraction.coach = coachName.charAt(0).toUpperCase() + coachName.slice(1);
                        extraction.confidence.coach = 90;
                        extraction.evidence.push(`Coach identified from participant: ${name}`);
                        extraction.processing.methods.push('participant_coach');
                    }
                    break;
                }
            }

            if (!isCoach && name) {
                nonCoachParticipants.push({ name, email });
            }
        }

        // First non-coach participant is likely the student
        if (nonCoachParticipants.length > 0 && (!extraction.student || extraction.student === 'Unknown' || extraction.confidence.student < 85) && this.nameStandardizer) {
            const studentParticipant = nonCoachParticipants[0];
            const standardized = await this.nameStandardizer.standardizeName(studentParticipant.name);
            if (standardized.standardized && standardized.standardized !== 'Unknown') {
                extraction.student = standardized.standardized;
                extraction.confidence.student = Math.min(85, standardized.confidence);
                extraction.evidence.push(`Student identified from participant: ${studentParticipant.name}`);
                extraction.processing.methods.push('participant_student');
                
                // Check if this was a family name resolution
                if (standardized.method === 'family_name_resolution') {
                    extraction.evidence.push(`Family name resolved: ${studentParticipant.name} → ${standardized.standardized}`);
                }
            }
        }
    }

    /**
     * Extract from folder path or file name
     */
    async extractFromFolderPath(recording, extraction) {
        const path = recording.folder_path || recording.file_path || recording.folder_name || '';
        if (!path) return;

        extraction.evidence.push(`Analyzing path: "${path}"`);
        extraction.dataSources.push('folder_path');

        // Path patterns
        const pathPatterns = [
            {
                regex: /([A-Za-z]+)_([A-Za-z]+)_Wk(\d+)/,
                description: 'Coach_Student_WkX',
                fields: { coach: 1, student: 2, week: 3 },
                confidence: 80
            },
            {
                regex: /(\w+)_(\w+)_Week(\d+)/,
                description: 'Coach_Student_WeekX',
                fields: { coach: 1, student: 2, week: 3 },
                confidence: 80
            }
        ];

        for (const pattern of pathPatterns) {
            const match = path.match(pattern.regex);
            if (match) {
                await this.applyPatternMatch(match, pattern, extraction);
                extraction.processing.methods.push(`path_pattern_${pattern.description}`);
                break;
            }
        }
    }

    /**
     * Apply pattern match results
     * ENHANCED: Now handles ambiguous patterns with needsResolution
     */
    async applyPatternMatch(match, pattern, extraction) {
        const fields = pattern.fields;

        // Handle patterns that need coach/student resolution
        if (pattern.needsResolution && (fields.person1 || fields.person2)) {
            const person1 = match[fields.person1];
            const person2 = match[fields.person2] || null;
            
            // Try to determine who is coach and who is student
            const resolution = await this.resolveCoachStudent(person1, person2, extraction);
            
            if (resolution.coach && (!extraction.coach || extraction.coach === 'Unknown' || extraction.confidence.coach < pattern.confidence)) {
                extraction.coach = resolution.coach;
                extraction.confidence.coach = pattern.confidence;
                extraction.evidence.push(`Coach "${extraction.coach}" resolved from pattern: ${pattern.description}`);
            }
            
            if (resolution.student && (!extraction.student || extraction.student === 'Unknown' || extraction.confidence.student < pattern.confidence)) {
                extraction.student = resolution.student;
                extraction.confidence.student = pattern.confidence;
                extraction.evidence.push(`Student "${extraction.student}" resolved from pattern: ${pattern.description}`);
            }
        }

        // Handle explicit coach field
        if (fields.coach && match[fields.coach] && this.nameStandardizer) {
            const coachName = match[fields.coach];
            const standardized = await this.nameStandardizer.standardizeName(coachName, 'coach');
            
            if ((!extraction.coach || extraction.coach === 'Unknown' || extraction.confidence.coach < pattern.confidence) && standardized.standardized && standardized.standardized !== 'Unknown') {
                extraction.coach = standardized.standardized;
                extraction.confidence.coach = Math.min(pattern.confidence, standardized.confidence);
                extraction.evidence.push(`Coach "${extraction.coach}" from pattern: ${pattern.description}`);
            }
        }

        // Handle explicit student field
        if (fields.student && match[fields.student] && this.nameStandardizer) {
            const studentName = match[fields.student];
            const standardized = await this.nameStandardizer.standardizeName(studentName, 'student');
            
            if ((!extraction.student || extraction.student === 'Unknown' || extraction.confidence.student < pattern.confidence) && standardized.standardized && standardized.standardized !== 'Unknown') {
                extraction.student = standardized.standardized;
                extraction.confidence.student = Math.min(pattern.confidence, standardized.confidence);
                extraction.evidence.push(`Student "${extraction.student}" from pattern: ${pattern.description}`);
            }
        }

        // Handle week number
        if (fields.week && match[fields.week]) {
            const week = parseInt(match[fields.week]);
            if (week > 0 && week <= 52 && (!extraction.weekNumber || extraction.confidence.weekNumber < pattern.confidence)) {
                extraction.weekNumber = week;
                extraction.confidence.weekNumber = pattern.confidence;
                extraction.evidence.push(`Week ${week} from pattern: ${pattern.description}`);
            }
        }

        // Handle program duration
        if (fields.program && match[fields.program]) {
            const program = parseInt(match[fields.program]);
            if (program > 0 && (!extraction.programDuration || extraction.confidence.programDuration < pattern.confidence)) {
                extraction.programDuration = program;
                extraction.confidence.programDuration = pattern.confidence;
                extraction.evidence.push(`${program}-week program from pattern: ${pattern.description}`);
            }
        }

        // Handle session type
        if (fields.sessionType) {
            if (fields.sessionType === 'match') {
                // Extract session type from the topic itself
                const topic = match[0];
                if (topic.match(/essay/i)) extraction.sessionType = 'Essay Review';
                else if (topic.match(/college/i)) extraction.sessionType = 'College Planning';
                else if (topic.match(/sat/i)) extraction.sessionType = 'SAT Prep';
                else if (topic.match(/application/i)) extraction.sessionType = 'Application Review';
            } else {
                extraction.sessionType = fields.sessionType;
            }
            extraction.confidence.sessionType = pattern.confidence;
            extraction.evidence.push(`Session type "${extraction.sessionType}" from pattern`);
        }
    }

    /**
     * Resolve which person is coach and which is student
     * NEW METHOD - This handles ambiguous patterns like "ananyaa and juli"
     */
    async resolveCoachStudent(person1, person2, extraction) {
        const result = { coach: null, student: null };
        
        // If we already have a coach from host email, the other person is likely the student
        if (extraction.coach) {
            const coachLower = extraction.coach.toLowerCase();
            const person1Lower = person1.toLowerCase();
            const person2Lower = person2 ? person2.toLowerCase() : '';
            
            if (coachLower === person1Lower || person1Lower.includes(coachLower) || coachLower.includes(person1Lower)) {
                result.student = person2;
                result.coach = person1;
            } else if (coachLower === person2Lower || person2Lower.includes(coachLower) || coachLower.includes(person2Lower)) {
                result.student = person1;
                result.coach = person2;
            } else {
                // Coach doesn't match either person, so assume the first is student
                result.student = person1;
            }
            
            return result;
        }
        
        // Original logic for when coach is not known
        const person1Coach = await this.isKnownCoach(person1);
        const person2Coach = person2 ? await this.isKnownCoach(person2) : false;
        
        if (person1Coach && !person2Coach) {
            result.coach = person1;
            result.student = person2;
        } else if (!person1Coach && person2Coach) {
            result.coach = person2;
            result.student = person1;
        } else if (!person1Coach && !person2Coach) {
            // Use knowledge base to check
            if (this.knowledgeBase) {
                const kb1 = await this.knowledgeBase.findCoachByName(person1);
                const kb2 = person2 ? await this.knowledgeBase.findCoachByName(person2) : null;
                
                if (kb1 && !kb2) {
                    result.coach = person1;
                    result.student = person2;
                } else if (!kb1 && kb2) {
                    result.coach = person2;
                    result.student = person1;
                } else {
                    // Default: assume second person is coach in "student and coach" pattern
                    result.student = person1;
                    result.coach = person2;
                }
            } else {
                // No knowledge base - use heuristics
                // For "name1 and name2 ivy level meeting", assume second is coach
                result.student = person1;
                result.coach = person2;
            }
        } else {
            // Both are coaches? Unusual - log it
            extraction.evidence.push('Warning: Both names appear to be coaches');
            result.coach = person1;
        }
        
        return result;
    }
    
    /**
     * Check if a name is a known coach
     * NEW METHOD
     */
    async isKnownCoach(name) {
        if (!name) return false;
        
        const nameLower = name.toLowerCase();
        
        // Check against coach aliases
        for (const [coachName, aliases] of Object.entries(this.coachAliases)) {
            if (aliases.some(alias => nameLower.includes(alias.toLowerCase()))) {
                return true;
            }
        }
        
        // Check with name standardizer
        if (this.nameStandardizer) {
            const standardized = await this.nameStandardizer.standardizeName(name, 'coach');
            if (standardized.confidence > 80 && standardized.method !== 'no_match') {
                return true;
            }
        }
        
        // Check knowledge base if available
        if (this.knowledgeBase) {
            const coach = await this.knowledgeBase.findCoachByName(name);
            return !!coach;
        }
        
        return false;
    }

    /**
     * Standardize extracted names
     */
    async standardizeNames(extraction) {
        // Standardize coach name
        if (extraction.coach && this.nameStandardizer) {
            const standardized = await this.nameStandardizer.standardizeName(extraction.coach, 'coach');
            if (standardized.confidence > 0) {
                extraction.coach = standardized.standardized;
                if (standardized.method !== 'no_match') {
                    extraction.evidence.push(`Coach name standardized: ${standardized.method}`);
                }
            }
        }

        // Standardize student name
        if (extraction.student && this.nameStandardizer) {
            const standardized = await this.nameStandardizer.standardizeName(extraction.student, 'student');
            if (standardized.confidence > 0) {
                extraction.student = standardized.standardized;
                if (standardized.method !== 'no_match') {
                    extraction.evidence.push(`Student name standardized: ${standardized.method}`);
                }
            }
        }
    }

    /**
     * Determine session type
     */
    determineSessionType(extraction) {
        if (extraction.sessionType) return; // Already determined

        // Rules for session type
        if (extraction.coach && extraction.student) {
            extraction.sessionType = 'Coaching';
            extraction.confidence.sessionType = 90;
            extraction.evidence.push('Session type: Coaching (coach + student present)');
        } else if (extraction.raw?.topic && extraction.raw.topic.toLowerCase().includes('game plan')) {
            extraction.sessionType = 'Game Plan';
            extraction.confidence.sessionType = 95;
            extraction.evidence.push('Session type: Game Plan (from topic)');
        } else if (extraction.raw?.topic && extraction.raw.topic.toLowerCase().includes('sat')) {
            extraction.sessionType = 'SAT Prep';
            extraction.confidence.sessionType = 95;
            extraction.evidence.push('Session type: SAT Prep (from topic)');
        } else if (!extraction.student || extraction.student === 'Unknown') {
            extraction.sessionType = 'Admin';
            extraction.confidence.sessionType = 70;
            extraction.evidence.push('Session type: Admin (no student identified)');
        } else {
            extraction.sessionType = 'Other';
            extraction.confidence.sessionType = 50;
            extraction.evidence.push('Session type: Other (default)');
        }
    }

    /**
     * Calculate overall confidence
     */
    calculateOverallConfidence(confidence) {
        const weights = {
            coach: 0.3,
            student: 0.3,
            weekNumber: 0.2,
            sessionType: 0.1,
            programDuration: 0.1
        };

        let totalWeight = 0;
        let weightedSum = 0;

        for (const [field, weight] of Object.entries(weights)) {
            if (confidence[field] > 0) {
                weightedSum += confidence[field] * weight;
                totalWeight += weight;
            }
        }

        return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
    }

    /**
     * Get available metadata fields
     */
    getAvailableFields() {
        return this.zoomFields;
    }

    /**
     * Get topic patterns for testing
     */
    getTopicPatterns() {
        return this.topicPatterns;
    }


    /**
     * Use SmartWeekInferencer for intelligent week number detection
     */
    async inferWeekNumber(recording, extraction) {
        // First check if we already have a high-confidence week from files/patterns
        if (extraction.weekNumber && extraction.confidence.weekNumber >= 90) {
            extraction.evidence.push(`Week ${extraction.weekNumber} already extracted with high confidence`);
            return;
        }

        // Use SmartWeekInferencer if available
        if (this.weekInferencer) {
            try {
                const context = {
                    studentName: extraction.student,
                    coachName: extraction.coach,
                    programStartDate: recording.programStartDate,
                    existingWeek: extraction.weekNumber
                };

                const weekResult = await this.weekInferencer.inferWeekNumber(recording, context);
                
                // Only update if SmartWeekInferencer has higher confidence
                if (weekResult.weekNumber && 
                    (weekResult.confidence * 100) > extraction.confidence.weekNumber) {
                    
                    extraction.weekNumber = weekResult.weekNumber;
                    extraction.confidence.weekNumber = weekResult.confidence * 100;
                    extraction.evidence.push(`Week ${weekResult.weekNumber} inferred by SmartWeekInferencer`);
                    extraction.evidence.push(`Method: ${weekResult.method} (confidence: ${Math.round(weekResult.confidence * 100)}%)`);
                    
                    if (weekResult.evidence) {
                        extraction.weekInferenceDetails = weekResult;
                    }
                }
            } catch (error) {
                logger.error('SmartWeekInferencer error:', error);
            }
        }
    }

    /**
     * Set the week inferencer (dependency injection)
     */
    setWeekInferencer(weekInferencer) {
        this.weekInferencer = weekInferencer;
    }
}

module.exports = { EnhancedMetadataExtractor };