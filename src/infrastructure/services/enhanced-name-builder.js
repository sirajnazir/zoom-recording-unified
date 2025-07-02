/**
 * Enhanced Name Builder
 * 
 * Sophisticated name standardization system from ivylevel-knowledge-base
 * Handles concatenated names, alternate names, and canonical name resolution
 */

require('dotenv').config();
const { logger } = require('../../shared/Logger.js');

class EnhancedNameBuilder {
    constructor() {
        this.nameVariations = new Map();
        this.canonicalNames = new Map();
        this.stats = {
            namesProcessed: 0,
            namesStandardized: 0,
            concatenatedNamesFixed: 0,
            alternateNamesResolved: 0
        };
        this._coaches = null;
        this._students = null;
        this.coachDatabase = {};
        this.studentDatabase = {};
        
        // OLD SMART LOGIC: Legacy mappings
        this.roomOwnerMap = {
            "Noor Hassan's Personal Meeting Room": "Noor",
            "Rishi Padmanabhan's Zoom Meeting": "Rishi",
            "Rishi Padmanabhan's Personal Meeting Room": "Rishi",
            "Aditi B's Personal Meeting Room": "Aditi",
            "Ivylevel's Personal Meeting Room": "Admin"
        };
        
        // OLD SMART LOGIC: Legacy coach mappings
        this.coachMapping = {
            'jenny': 'Jenny Duan',
            'jenny duan': 'Jenny Duan',
            'steven': 'Steven',
            'steven zhou': 'Steven Zhou',
            'rishi': 'Rishi',
            'rishi padmanabhan': 'Rishi',
            'marissa': 'Marissa',
            'erin': 'Erin Ye',
            'andrew': 'Andrew',
            'janice': 'Janice Teoh',
            'aditi': 'Aditi Bhaskar',
            'aditi b': 'Aditi Bhaskar',
            'noor': 'Noor',
            'noor hassan': 'Noor',
            'juli': 'Juli',
            'kelvin': 'Kelvin'
        };
    }

    /**
     * Initialize the name builder with knowledge base data
     */
    async initialize() {
        logger.info('Initializing Enhanced Name Builder');
        
        // Load coach and student databases
        await this.loadCoachDatabase();
        await this.loadStudentDatabase();
        
        // Build comprehensive name variations map
        await this.buildNameVariationsMap();
        
        logger.info(`Enhanced Name Builder initialized with ${this.nameVariations.size} variations`);
    }

    /**
     * Load coach database for enhanced extraction
     */
    async loadCoachDatabase() {
        try {
            const coaches = await this.loadCoaches();
            this.coachDatabase = {};
            
            coaches.forEach(coach => {
                this.coachDatabase[coach.name] = coach;
                if (coach.firstName) {
                    this.coachDatabase[coach.firstName] = coach;
                }
                if (coach.alternateNames) {
                    coach.alternateNames.forEach(alt => {
                        this.coachDatabase[alt] = coach;
                    });
                }
            });
            
            logger.info(`Loaded ${Object.keys(this.coachDatabase).length} coach entries`);
        } catch (error) {
            logger.error('Error loading coach database:', error);
        }
    }

    /**
     * Load student database for enhanced extraction
     */
    async loadStudentDatabase() {
        try {
            const students = await this.loadStudents();
            this.studentDatabase = {};
            
            students.forEach(student => {
                this.studentDatabase[student.name] = student;
                if (student.firstName) {
                    this.studentDatabase[student.firstName] = student;
                }
                if (student.alternateNames) {
                    student.alternateNames.forEach(alt => {
                        this.studentDatabase[alt] = student;
                    });
                }
            });
            
            logger.info(`Loaded ${Object.keys(this.studentDatabase).length} student entries`);
        } catch (error) {
            logger.error('Error loading student database:', error);
        }
    }

    /**
     * Build comprehensive name variations map from ivylevel-knowledge-base logic
     */
    async buildNameVariationsMap() {
        const coaches = await this.loadCoaches();
        const students = await this.loadStudents();
        
        // Process coaches
        coaches.forEach(coach => {
            const canonicalName = coach.name;
            
            // Store canonical name
            this.canonicalNames.set(canonicalName.toLowerCase(), canonicalName);
            
            // Map all variations to canonical name
            this.nameVariations.set(coach.name.toLowerCase(), canonicalName);
            
            if (coach.firstName) {
                this.nameVariations.set(coach.firstName.toLowerCase(), canonicalName);
            }
            
            // Handle concatenated names (e.g., JennyDuan → Jenny Duan)
            if (coach.name.includes(' ')) {
                const concatenated = coach.name.replace(/\s+/g, '');
                this.nameVariations.set(concatenated.toLowerCase(), canonicalName);
            }
            
            // Add alternate names
            if (coach.alternateNames) {
                coach.alternateNames.forEach(alt => {
                    this.nameVariations.set(alt.toLowerCase(), canonicalName);
                });
            }
            
            // Handle email-based names
            if (coach.email) {
                const emailName = coach.email.split('@')[0];
                this.nameVariations.set(emailName.toLowerCase(), canonicalName);
            }
        });
        
        // Process students
        students.forEach(student => {
            const canonicalName = student.name;
            
            // Store canonical name
            this.canonicalNames.set(canonicalName.toLowerCase(), canonicalName);
            
            this.nameVariations.set(student.name.toLowerCase(), canonicalName);
            
            if (student.firstName) {
                this.nameVariations.set(student.firstName.toLowerCase(), canonicalName);
            }
            
            if (student.name.includes(' ')) {
                const concatenated = student.name.replace(/\s+/g, '');
                this.nameVariations.set(concatenated.toLowerCase(), canonicalName);
            }
            
            if (student.alternateNames) {
                student.alternateNames.forEach(alt => {
                    this.nameVariations.set(alt.toLowerCase(), canonicalName);
                });
            }
            
            // Handle email-based names
            if (student.email) {
                const emailName = student.email.split('@')[0];
                this.nameVariations.set(emailName.toLowerCase(), canonicalName);
            }
        });
    }

    /**
     * Standardize a name using sophisticated logic
     */
    standardizeName(name, type = 'auto') {
        if (!name) return null;
        
        this.stats.namesProcessed++;
        
        const searchName = name.toLowerCase().trim();
        
        // Direct match
        if (this.nameVariations.has(searchName)) {
            this.stats.namesStandardized++;
            return this.nameVariations.get(searchName);
        }
        
        // Check for concatenated names
        const concatenatedMatch = this.detectConcatenatedName(searchName);
        if (concatenatedMatch) {
            this.stats.concatenatedNamesFixed++;
            this.stats.namesStandardized++;
            return concatenatedMatch;
        }
        
        // Partial match
        const partialMatch = this.findPartialMatch(searchName);
        if (partialMatch) {
            this.stats.namesStandardized++;
            return partialMatch;
        }
        
        // Fuzzy match
        const fuzzyMatch = this.fuzzyMatch(searchName);
        if (fuzzyMatch) {
            this.stats.namesStandardized++;
            return fuzzyMatch;
        }
        
        // Return original if no match found
        return name;
    }

    /**
     * Detect and fix concatenated names
     */
    detectConcatenatedName(searchName) {
        // Look for patterns like "JennyDuan" → "Jenny Duan"
        for (const [variation, canonical] of this.nameVariations) {
            if (variation.includes(searchName) || searchName.includes(variation)) {
                // Check if this is a concatenated version
                const words = canonical.split(' ');
                if (words.length > 1) {
                    const concatenated = words.join('');
                    if (concatenated.toLowerCase() === searchName) {
                        return canonical;
                    }
                }
            }
        }
        return null;
    }

    /**
     * Find partial matches
     */
    findPartialMatch(searchName) {
        for (const [variation, canonical] of this.nameVariations) {
            if (variation.includes(searchName) || searchName.includes(variation)) {
                return canonical;
            }
        }
        return null;
    }

    /**
     * Fuzzy matching with similarity threshold
     */
    fuzzyMatch(searchName) {
        let bestMatch = null;
        let bestSimilarity = 0.8; // 80% similarity threshold
        
        for (const [variation, canonical] of this.nameVariations) {
            const similarity = this.calculateStringSimilarity(searchName, variation);
            if (similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestMatch = canonical;
            }
        }
        
        return bestMatch;
    }

    /**
     * Calculate string similarity using Levenshtein distance
     */
    calculateStringSimilarity(str1, str2) {
        const distance = this.levenshteinDistance(str1, str2);
        const maxLength = Math.max(str1.length, str2.length);
        return 1 - (distance / maxLength);
    }

    /**
     * Calculate Levenshtein distance between two strings
     */
    levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    /**
     * Load coaches from data file
     */
    async loadCoaches() {
        if (this._coaches) return this._coaches;
        
        try {
            this._coaches = require('../../data/coaches.json');
            return this._coaches;
        } catch (error) {
            logger.error('Error loading coaches:', error);
            return [];
        }
    }

    /**
     * Load students from data file
     */
    async loadStudents() {
        if (this._students) return this._students;
        
        try {
            this._students = require('../../data/students.json');
            return this._students;
        } catch (error) {
            logger.error('Error loading students:', error);
            return [];
        }
    }

    /**
     * Get statistics
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Build enhanced name with improved matching against authoritative sources
     */
    async buildEnhancedName(recording) {
        try {
            logger.info(`🔤 Building enhanced name for recording: ${recording.id}`);
            
            // Initialize analysis with confidence tracking
            const analysis = {
                coach: '',
                student: '',
                weekNumber: null,
                sessionType: '',
                date: recording.start_time,
                duration: recording.duration,
                topic: recording.topic,
                confidence: {
                    coach: 0,
                    student: 0,
                    weekNumber: 0,
                    sessionType: 0
                },
                extractionSources: []
            };
            
            const coaches = await this.loadCoaches();
            const students = await this.loadStudents();
            const topicNames = this.extractNamesFromTopic(recording.topic || '');
            const weekNumber = this.extractWeekFromTopic(recording.topic || '');
            
            logger.info('Analyzing recording:', {
                topic: recording.topic,
                start_time: recording.start_time,
                uuid: recording.uuid,
                topicNames: topicNames
            });
            
            // Step 1: Try to match against authoritative sources first
            const authoritativeMatch = this.findAuthoritativeMatch(topicNames, coaches, students);
            if (authoritativeMatch) {
                logger.info(`✅ Found authoritative match: ${authoritativeMatch.coach} <> ${authoritativeMatch.student}`);
                analysis.coach = authoritativeMatch.coach;
                analysis.student = authoritativeMatch.student;
                analysis.confidence.coach = 95;
                analysis.confidence.student = 95;
                analysis.extractionSources.push('authoritative_match');
                analysis.weekNumber = weekNumber;
            } else {
                // Step 2: Try fuzzy matching against authoritative sources
                const fuzzyMatch = this.findFuzzyMatch(topicNames, coaches, students);
                if (fuzzyMatch) {
                    logger.info(`✅ Found fuzzy match: ${fuzzyMatch.coach} <> ${fuzzyMatch.student}`);
                    analysis.coach = fuzzyMatch.coach;
                    analysis.student = fuzzyMatch.student;
                    analysis.confidence.coach = fuzzyMatch.confidence || 85;
                    analysis.confidence.student = fuzzyMatch.confidence || 85;
                    analysis.extractionSources.push('fuzzy_match');
                    analysis.weekNumber = weekNumber;
                } else {
                    // Step 3: Try to extract from meeting topic with improved logic
                    const topicMatch = this.extractFromTopic(recording.topic || '', coaches, students);
                    
                    // Step 4: Handle Personal Meeting Room case (coach found but no student)
                    if (topicMatch && topicMatch.coach && (!topicMatch.student || topicMatch.student === 'Unknown' || topicMatch.student === 'Unknown Student')) {
                        logger.info(`✅ Found coach from Personal Meeting Room: ${topicMatch.coach}`);
                        analysis.coach = topicMatch.coach;
                        analysis.student = 'Unknown';
                        analysis.confidence.coach = topicMatch.confidence || 60;
                        analysis.confidence.student = 0;
                        analysis.extractionSources.push('personal_meeting_room');
                        analysis.weekNumber = weekNumber;
                    } else if (topicMatch && topicMatch.coach && topicMatch.student && topicMatch.student !== 'Unknown' && topicMatch.student !== 'Unknown Student') {
                        // Step 4b: Handle Personal Meeting Room case with student found
                        logger.info(`✅ Found coach and student from Personal Meeting Room: ${topicMatch.coach} <> ${topicMatch.student}`);
                        
                        // If participants are available, prefer participant data over default student
                        const participantMatch = this.extractFromParticipants(recording, coaches, students);
                        if (participantMatch && participantMatch.student && participantMatch.student !== topicMatch.student) {
                            logger.info(`✅ Overriding default student with participant data: ${topicMatch.student} → ${participantMatch.student}`);
                            analysis.coach = topicMatch.coach;
                            analysis.student = participantMatch.student;
                            analysis.confidence.coach = topicMatch.confidence || 70;
                            analysis.confidence.student = participantMatch.confidence || 85;
                            analysis.extractionSources.push('personal_meeting_room_with_participant_override');
                            analysis.weekNumber = weekNumber;
                        } else {
                            analysis.coach = topicMatch.coach;
                            analysis.student = topicMatch.student;
                            analysis.confidence.coach = topicMatch.confidence || 70;
                            analysis.confidence.student = topicMatch.confidence || 70;
                            analysis.extractionSources.push('personal_meeting_room_with_student');
                            analysis.weekNumber = weekNumber;
                        }
                    } else {
                        // Step 5: Try to extract from host name
                        const hostMatch = this.extractFromHost(recording.host_email || '', coaches, students);
                        if (hostMatch) {
                            logger.info(`✅ Extracted from host: ${hostMatch.coach} <> ${hostMatch.student || 'Unknown'}`);
                            analysis.coach = hostMatch.coach;
                            analysis.student = hostMatch.student || 'Unknown';
                            analysis.confidence.coach = hostMatch.confidence || 60;
                            analysis.confidence.student = hostMatch.student ? (hostMatch.confidence || 60) : 0;
                            analysis.extractionSources.push('host_email');
                            analysis.weekNumber = weekNumber;
                        } else {
                            // Step 6: Try to extract from participants (old logic fallback)
                            const participantMatch = this.extractFromParticipants(recording, coaches, students);
                            if (participantMatch && participantMatch.student) {
                                logger.info(`✅ Extracted student from participants: ${participantMatch.student}`);
                                analysis.student = participantMatch.student;
                                analysis.confidence.student = participantMatch.confidence || 85;
                                analysis.extractionSources.push(participantMatch.method);
                                analysis.weekNumber = weekNumber;
                            } else {
                                // Step 7: Fallback to topic-based extraction
                                const fallbackMatch = this.fallbackExtraction(recording.topic || '', coaches);
                                logger.info(`⚠️ Using fallback extraction: ${fallbackMatch.coach} <> ${fallbackMatch.student}`);
                                
                                analysis.coach = fallbackMatch.coach || 'Unknown';
                                analysis.student = fallbackMatch.student || 'Unknown';
                                analysis.confidence.coach = fallbackMatch.confidence || 30;
                                analysis.confidence.student = fallbackMatch.confidence || 30;
                                analysis.extractionSources.push('fallback');
                                analysis.weekNumber = weekNumber;
                            }
                        }
                    }
                }
            }
            
            // Use enhanced session type determination AFTER name extraction
            const sessionTypeResult = this.determineSessionType(recording, {
                coach: analysis.coach,
                student: analysis.student,
                confidence: analysis.confidence
            });
            analysis.sessionType = sessionTypeResult.sessionType;
            analysis.confidence.sessionType = sessionTypeResult.confidence;
            
            // Log final analysis with confidence
            logger.info('Final analysis:', {
                coach: analysis.coach,
                student: analysis.student,
                sessionType: analysis.sessionType,
                weekNumber: analysis.weekNumber,
                confidence: analysis.confidence,
                extractionSources: analysis.extractionSources
            });
            
            // Build standardized name using old logic
            const standardizedName = this.buildStandardizedName(analysis);
            
            return {
                coach: analysis.coach,
                student: analysis.student,
                standardizedName: standardizedName,
                confidence: analysis.confidence.coach, // Use coach confidence as overall
                source: 'enhanced_extraction',
                method: analysis.extractionSources.join('_'),
                sessionType: analysis.sessionType,
                weekNumber: analysis.weekNumber
            };
            
        } catch (error) {
            logger.error(`❌ Error building enhanced name: ${error.message}`);
            return {
                coach: 'Unknown',
                student: 'Unknown',
                standardizedName: 'Unknown <> Unknown',
                confidence: 0.1,
                source: 'error',
                method: 'error_fallback',
                sessionType: 'MISC',
                weekNumber: null
            };
        }
    }

    /**
     * Find exact match against authoritative sources
     */
    findAuthoritativeMatch(topicNames, coaches, students) {
        for (const name of topicNames) {
            // Check for coach match
            const coach = coaches.find(c => 
                c.name.toLowerCase() === name.toLowerCase() ||
                (c.firstName && c.firstName.toLowerCase() === name.toLowerCase()) ||
                (c.alternateNames && c.alternateNames.some(alt => alt.toLowerCase() === name.toLowerCase()))
            );
            
            if (coach) {
                // Look for student in remaining names
                const remainingNames = topicNames.filter(n => n.toLowerCase() !== name.toLowerCase());
                for (const studentName of remainingNames) {
                    const student = students.find(s => 
                        s.name.toLowerCase() === studentName.toLowerCase() ||
                        (s.firstName && s.firstName.toLowerCase() === studentName.toLowerCase()) ||
                        (s.alternateNames && s.alternateNames.some(alt => alt.toLowerCase() === studentName.toLowerCase()))
                    );
                    
                    if (student) {
                        return { coach: coach.name, student: student.name };
                    }
                }
            }
        }
        return null;
    }

    /**
     * Find fuzzy match against authoritative sources
     */
    findFuzzyMatch(topicNames, coaches, students) {
        for (const name of topicNames) {
            // Check for coach match
            for (const coach of coaches) {
                const similarity = this.calculateStringSimilarity(name.toLowerCase(), coach.name.toLowerCase());
                if (similarity > 0.8) {
                    // Look for student in remaining names
                    const remainingNames = topicNames.filter(n => n.toLowerCase() !== name.toLowerCase());
                    for (const studentName of remainingNames) {
                        for (const student of students) {
                            const studentSimilarity = this.calculateStringSimilarity(studentName.toLowerCase(), student.name.toLowerCase());
                            if (studentSimilarity > 0.8) {
                                return { 
                                    coach: coach.name, 
                                    student: student.name,
                                    confidence: Math.min(similarity, studentSimilarity) * 100
                                };
                            }
                        }
                    }
                }
            }
        }
        return null;
    }

    /**
     * Extract names from topic
     */
    extractNamesFromTopic(topic) {
        if (!topic) return [];
        
        // Remove common prefixes
        let cleanTopic = topic.replace(/^ivylevel\s+/i, '');
        
        // Split by common separators
        const separators = ['<>', '|', '-', ':', 'with', 'and', '&'];
        let parts = [cleanTopic];
        
        for (const separator of separators) {
            const newParts = [];
            for (const part of parts) {
                newParts.push(...part.split(separator));
            }
            parts = newParts;
        }
        
        // Clean and filter parts
        return parts
            .map(part => part.trim())
            .filter(part => part.length > 0)
            .filter(part => !part.match(/^(week|session|meeting|zoom|test|demo|#)/i))
            .filter(part => part.length > 1);
    }

    /**
     * Extract from topic with improved logic
     */
    extractFromTopic(topic, coaches, students) {
        const names = this.extractNamesFromTopic(topic);
        if (names.length === 0) return null;
        
        // Try to find coach and student
        let coach = null;
        let student = null;
        
        for (const name of names) {
            // Check if it's a coach
            const coachMatch = coaches.find(c => 
                c.name.toLowerCase() === name.toLowerCase() ||
                (c.firstName && c.firstName.toLowerCase() === name.toLowerCase()) ||
                (c.alternateNames && c.alternateNames.some(alt => alt.toLowerCase() === name.toLowerCase()))
            );
            
            if (coachMatch && !coach) {
                coach = coachMatch;
            } else if (!student) {
                // Check if it's a student
                const studentMatch = students.find(s => 
                    s.name.toLowerCase() === name.toLowerCase() ||
                    (s.firstName && s.firstName.toLowerCase() === name.toLowerCase()) ||
                    (s.alternateNames && s.alternateNames.some(alt => alt.toLowerCase() === name.toLowerCase()))
                );
                
                if (studentMatch) {
                    student = studentMatch;
                }
            }
        }
        
        return {
            coach: coach ? coach.name : null,
            student: student ? student.name : null,
            confidence: coach && student ? 70 : coach ? 60 : 30
        };
    }

    /**
     * Extract from host email
     */
    extractFromHost(hostEmail, coaches, students) {
        if (!hostEmail) return null;
        
        const emailName = hostEmail.split('@')[0];
        
        // Check if it's a coach
        const coach = coaches.find(c => 
            c.email === hostEmail ||
            (c.email && c.email.split('@')[0] === emailName)
        );
        
        if (coach) {
            return {
                coach: coach.name,
                student: null,
                confidence: 60
            };
        }
        
        return null;
    }

    /**
     * Extract from participants
     */
    extractFromParticipants(recording, coaches, students) {
        // This is a simplified version - in the real implementation, you'd parse participant data
        return {
            student: null,
            confidence: 0,
            method: 'participants'
        };
    }

    /**
     * Fallback extraction
     */
    fallbackExtraction(topic, coaches) {
        // Simple fallback - try to extract any coach name from topic
        const names = this.extractNamesFromTopic(topic);
        
        for (const name of names) {
            const coach = coaches.find(c => 
                c.name.toLowerCase().includes(name.toLowerCase()) ||
                name.toLowerCase().includes(c.name.toLowerCase())
            );
            
            if (coach) {
                return {
                    coach: coach.name,
                    student: 'Unknown',
                    confidence: 30
                };
            }
        }
        
        return {
            coach: 'Unknown',
            student: 'Unknown',
            confidence: 10
        };
    }

    /**
     * Extract week from topic
     */
    extractWeekFromTopic(topic) {
        if (!topic) return null;
        
        const weekMatch = topic.match(/week\s*(\d+)/i);
        if (weekMatch) {
            return parseInt(weekMatch[1]);
        }
        
        return null;
    }

    /**
     * Determine session type
     */
    determineSessionType(metadata, nameAnalysis) {
        const topic = (metadata.topic || '').toLowerCase();
        
        // Check for specific session types
        if (topic.includes('coaching') || topic.includes('session')) {
            return { sessionType: 'COACHING', confidence: 90 };
        }
        if (topic.includes('meeting') || topic.includes('discussion')) {
            return { sessionType: 'MEETING', confidence: 80 };
        }
        if (topic.includes('training') || topic.includes('workshop')) {
            return { sessionType: 'TRAINING', confidence: 85 };
        }
        if (topic.includes('consultation') || topic.includes('advice')) {
            return { sessionType: 'CONSULTATION', confidence: 75 };
        }
        
        // Default based on name analysis
        if (nameAnalysis.coach && nameAnalysis.student && nameAnalysis.student !== 'Unknown') {
            return { sessionType: 'COACHING', confidence: 70 };
        }
        
        return { sessionType: 'MISC', confidence: 50 };
    }

    /**
     * Build standardized name
     */
    buildStandardizedName(analysis) {
        const coach = analysis.coach || 'Unknown';
        const student = analysis.student || 'Unknown';
        return `${coach} <> ${student}`;
    }

    /**
     * Extract from Personal Meeting Room
     */
    extractFromPersonalMeetingRoom(topic, coaches) {
        if (!topic) return null;
        
        // Check if this is a personal meeting room
        const personalRoomPatterns = [
            /personal meeting room/i,
            /zoom meeting/i,
            /meeting room/i
        ];
        
        const isPersonalRoom = personalRoomPatterns.some(pattern => pattern.test(topic));
        
        if (!isPersonalRoom) return null;
        
        // Try to extract coach name from the topic
        const names = this.extractNamesFromTopic(topic);
        
        for (const name of names) {
            const coach = coaches.find(c => 
                c.name.toLowerCase() === name.toLowerCase() ||
                (c.firstName && c.firstName.toLowerCase() === name.toLowerCase()) ||
                (c.alternateNames && c.alternateNames.some(alt => alt.toLowerCase() === name.toLowerCase()))
            );
            
            if (coach) {
                return {
                    coach: coach.name,
                    student: 'Unknown',
                    confidence: 60
                };
            }
        }
        
        return null;
    }
}

module.exports = EnhancedNameBuilder; 