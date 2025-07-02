/**
 * Service for analyzing meeting participants
 */
class ParticipantAnalyzer {
    constructor() {
        // Email domain patterns
        this.domainPatterns = {
            management: ['ivylevel.com', 'ivymentors.com'],
            coach: ['coach', 'mentor', 'tutor'],
            student: ['student', 'gmail.com', 'yahoo.com', 'outlook.com']
        };
        
        // Name patterns for role detection
        this.rolePatterns = {
            coach: /coach|mentor|tutor|instructor|teacher/i,
            student: /student|learner|mentee/i,
            admin: /admin|manager|director|coordinator/i
        };
    }

    /**
     * Analyze participants list
     */
    analyzeParticipants(participants) {
        if (!participants || participants.length === 0) {
            return {
                count: 0,
                roles: {},
                identified: {},
                confidence: 0
            };
        }

        const analysis = {
            count: participants.length,
            roles: {
                coach: [],
                student: [],
                admin: [],
                unknown: []
            },
            identified: {
                coach: null,
                student: null
            },
            confidence: 0,
            details: []
        };

        // Analyze each participant
        participants.forEach(participant => {
            const participantInfo = this._analyzeParticipant(participant);
            analysis.details.push(participantInfo);
            
            // Categorize by role
            analysis.roles[participantInfo.role].push(participantInfo);
            
            // Update identified coach/student with highest confidence
            if (participantInfo.role === 'coach' && participantInfo.confidence > (analysis.identified.coach?.confidence || 0)) {
                analysis.identified.coach = participantInfo;
            }
            if (participantInfo.role === 'student' && participantInfo.confidence > (analysis.identified.student?.confidence || 0)) {
                analysis.identified.student = participantInfo;
            }
        });

        // Calculate overall confidence
        analysis.confidence = this._calculateOverallConfidence(analysis);

        return analysis;
    }

    /**
     * Analyze individual participant
     */
    _analyzeParticipant(participant) {
        const info = {
            id: participant.id || participant.user_id,
            name: participant.name || participant.display_name || 'Unknown',
            email: participant.email || participant.user_email || '',
            joinTime: participant.join_time,
            leaveTime: participant.leave_time,
            duration: participant.duration || 0,
            role: 'unknown',
            confidence: 0,
            indicators: []
        };

        // Analyze by email
        if (info.email) {
            const emailAnalysis = this._analyzeEmail(info.email);
            info.role = emailAnalysis.role;
            info.confidence = emailAnalysis.confidence;
            info.indicators.push(...emailAnalysis.indicators);
        }

        // Analyze by name
        const nameAnalysis = this._analyzeName(info.name);
        if (nameAnalysis.confidence > info.confidence) {
            info.role = nameAnalysis.role;
            info.confidence = nameAnalysis.confidence;
        }
        info.indicators.push(...nameAnalysis.indicators);

        // Analyze by behavior
        const behaviorAnalysis = this._analyzeBehavior(participant);
        if (behaviorAnalysis.indicators.length > 0) {
            info.indicators.push(...behaviorAnalysis.indicators);
            // Boost confidence if behavior matches role
            if (behaviorAnalysis.suggestedRole === info.role) {
                info.confidence = Math.min(info.confidence + 10, 100);
            }
        }

        return info;
    }

    /**
     * Analyze email for role detection
     */
    _analyzeEmail(email) {
        const result = {
            role: 'unknown',
            confidence: 0,
            indicators: []
        };

        if (!email) return result;

        const emailLower = email.toLowerCase();
        const domain = email.split('@')[1]?.toLowerCase() || '';

        // Check for management domains
        if (this.domainPatterns.management.some(d => domain.includes(d))) {
            result.role = 'admin';
            result.confidence = 90;
            result.indicators.push(`Management domain: ${domain}`);
            return result;
        }

        // Check for role keywords in email
        if (emailLower.includes('coach') || emailLower.includes('mentor')) {
            result.role = 'coach';
            result.confidence = 85;
            result.indicators.push('Coach keyword in email');
        } else if (emailLower.includes('student')) {
            result.role = 'student';
            result.confidence = 85;
            result.indicators.push('Student keyword in email');
        } else if (this.domainPatterns.student.some(d => domain.includes(d))) {
            // Common personal email domains suggest student
            result.role = 'student';
            result.confidence = 60;
            result.indicators.push(`Personal email domain: ${domain}`);
        }

        return result;
    }

    /**
     * Analyze name for role detection
     */
    _analyzeName(name) {
        const result = {
            role: 'unknown',
            confidence: 0,
            indicators: []
        };

        if (!name || name === 'Unknown') return result;

        const nameLower = name.toLowerCase();

        // Check role patterns in name
        if (this.rolePatterns.coach.test(name)) {
            result.role = 'coach';
            result.confidence = 70;
            result.indicators.push('Coach keyword in name');
        } else if (this.rolePatterns.student.test(name)) {
            result.role = 'student';
            result.confidence = 70;
            result.indicators.push('Student keyword in name');
        } else if (this.rolePatterns.admin.test(name)) {
            result.role = 'admin';
            result.confidence = 70;
            result.indicators.push('Admin keyword in name');
        }

        // Check against known names (simplified list)
        const knownCoaches = ['jenny', 'janice', 'juli', 'andrew', 'marissa', 'rishi', 'katie'];
        const knownStudents = ['ananyaa', 'victoria', 'arushi', 'anoushka', 'huda', 'emma'];

        if (knownCoaches.some(coach => nameLower.includes(coach))) {
            result.role = 'coach';
            result.confidence = Math.max(result.confidence, 95);
            result.indicators.push('Known coach name');
        } else if (knownStudents.some(student => nameLower.includes(student))) {
            result.role = 'student';
            result.confidence = Math.max(result.confidence, 95);
            result.indicators.push('Known student name');
        }

        return result;
    }

    /**
     * Analyze participant behavior
     */
    _analyzeBehavior(participant) {
        const result = {
            suggestedRole: 'unknown',
            indicators: []
        };

        // Check if host
        if (participant.is_host || participant.role === 'host') {
            result.suggestedRole = 'coach';
            result.indicators.push('Meeting host');
        }

        // Check if co-host
        if (participant.is_co_host || participant.role === 'co-host') {
            result.suggestedRole = 'coach';
            result.indicators.push('Meeting co-host');
        }

        // Check join/leave patterns
        if (participant.join_time && participant.leave_time) {
            const joinTime = new Date(participant.join_time);
            const leaveTime = new Date(participant.leave_time);
            
            // First to join and last to leave often indicates host/coach
            if (participant.is_first_to_join && participant.is_last_to_leave) {
                result.suggestedRole = 'coach';
                result.indicators.push('First to join and last to leave');
            }
        }

        // Check participation duration
        if (participant.duration) {
            const durationMinutes = participant.duration / 60;
            if (durationMinutes < 5) {
                result.indicators.push('Very short participation');
            }
        }

        return result;
    }

    /**
     * Calculate overall confidence
     */
    _calculateOverallConfidence(analysis) {
        let totalConfidence = 0;
        let count = 0;

        if (analysis.identified.coach) {
            totalConfidence += analysis.identified.coach.confidence;
            count++;
        }

        if (analysis.identified.student) {
            totalConfidence += analysis.identified.student.confidence;
            count++;
        }

        // Reduce confidence if we have ambiguous results
        if (analysis.roles.unknown.length > 0) {
            totalConfidence *= 0.9;
        }

        // Boost confidence if we have exactly one coach and one student
        if (analysis.roles.coach.length === 1 && analysis.roles.student.length === 1) {
            totalConfidence = Math.min(totalConfidence * 1.1, 100);
        }

        return count > 0 ? Math.round(totalConfidence / count) : 0;
    }

    /**
     * Get participant by role
     */
    getParticipantByRole(analysis, role) {
        return analysis.identified[role] || null;
    }

    /**
     * Check if analysis has required roles
     */
    hasRequiredRoles(analysis, requiredRoles = ['coach', 'student']) {
        return requiredRoles.every(role => analysis.identified[role] !== null);
    }

    /**
     * Get role distribution
     */
    getRoleDistribution(analysis) {
        const distribution = {};
        Object.keys(analysis.roles).forEach(role => {
            distribution[role] = analysis.roles[role].length;
        });
        return distribution;
    }

    /**
     * Validate participant data
     */
    validateParticipantData(participant) {
        const required = ['id', 'name'];
        const missing = required.filter(field => !participant[field]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required participant fields: ${missing.join(', ')}`);
        }
        
        return true;
    }

    /**
     * Update known names list
     */
    updateKnownNames(role, names) {
        if (role === 'coach') {
            this.knownCoaches = names;
        } else if (role === 'student') {
            this.knownStudents = names;
        }
    }

    /**
     * Add custom domain patterns
     */
    addDomainPatterns(role, domains) {
        if (this.domainPatterns[role]) {
            this.domainPatterns[role].push(...domains);
        } else {
            this.domainPatterns[role] = domains;
        }
    }

    /**
     * Get analysis summary
     */
    getAnalysisSummary(analysis) {
        return {
            totalParticipants: analysis.count,
            identifiedCoach: analysis.identified.coach?.name || 'Unknown',
            identifiedStudent: analysis.identified.student?.name || 'Unknown',
            confidence: analysis.confidence,
            roleDistribution: this.getRoleDistribution(analysis),
            hasRequiredRoles: this.hasRequiredRoles(analysis)
        };
    }
}

module.exports = { ParticipantAnalyzer }; 