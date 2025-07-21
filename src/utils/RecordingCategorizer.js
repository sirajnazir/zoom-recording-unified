/**
 * Enhanced Categorization Rules for Zoom Recordings
 * 
 * Priority order:
 * 1. Game Plan Session → Coaching_GamePlan_Jenny_[Student]_Wk1
 * 2. Coaching session pattern with valid participants → Coaching
 * 3. Coach AND Student identified → Coaching_[Type]_[Coach]_[Student]
 * 4. MISC hosts (Ivylevel/Siraj) without student → MISC_
 * 5. TRIVIAL sessions (MISC + duration < 15min) → TRIVIAL_
 * 6. Other cases → contextual decision
 */

class RecordingCategorizer {
    constructor(logger) {
        this.logger = logger || console;
        
        // Define ADMIN/MANAGEMENT accounts (NOT coaches/students)
        this.adminAccounts = [
            { name: 'Ivylevel', email: 'contact@ivymentors.co' },
            { name: 'Siraj', email: 'siraj@ivymentors.co' },
            { name: 'Siraj Nazir', email: 'siraj@ivymentors.co' }
        ];
        
        // Define MISC hosts/indicators
        this.miscIndicators = [
            'ivylevel',
            'siraj',
            'siraj nazir',
            'ivy mentor',
            'ivymentor',
            'ivy mentors',
            'ivymentors'
        ];
        
        // Game Plan indicators
        this.gamePlanIndicators = [
            'game plan',
            'gameplan',
            'game-plan'
        ];
        
        // TRIVIAL duration threshold (in seconds)
        this.trivialDurationThreshold = 15 * 60; // 15 minutes
    }
    
    /**
     * Main categorization method
     */
    categorize(components, recording = {}) {
        const { coach, student, sessionType } = components;
        const topic = recording.topic || '';
        const hostEmail = recording.host_email || '';
        const hostName = recording.host_name || '';
        const duration = recording.duration || 0;
        
        this.logger.debug('Categorizing:', { coach, student, topic, duration });
        
        // Rule 1: Game Plan Session → Special Coaching
        if (this.isGamePlanSession(topic, components)) {
            this.logger.info('Rule 1 matched: Game Plan Session → Coaching_GamePlan');
            return 'Coaching_GamePlan';
        }
        
        // Rule 2: Coaching session pattern with valid participants
        if (this.isCoachingSessionPattern(topic, components)) {
            this.logger.info('Rule 2 matched: Coaching session pattern → Coaching');
            return 'Coaching';
        }
        
        // Rule 3: Both coach AND student identified → Coaching
        if (this.hasValidCoach(coach) && this.hasValidStudent(student)) {
            this.logger.info('Rule 3 matched: Coach AND Student → Coaching');
            return 'Coaching';
        }
        
        // Rule 4: Check if this is a MISC host/session
        if (this.isMiscSession(components, recording)) {
            // Rule 4a: Check if TRIVIAL (MISC + short duration)
            if (this.isTrivialSession(duration, topic)) {
                this.logger.info('Rule 4a matched: MISC + short duration → TRIVIAL');
                return 'TRIVIAL';
            }
            
            this.logger.info('Rule 4b matched: MISC host without student → MISC');
            return 'MISC';
        }
        
        // Rule 5: Personal Meeting Room with valid coach → Coaching
        if (this.isPMR(topic) && this.hasValidCoach(coach)) {
            this.logger.info('Rule 5 matched: PMR with coach → Coaching');
            return 'Coaching';
        }
        
        // Rule 6: If we have a coach but no student, still Coaching
        if (this.hasValidCoach(coach)) {
            this.logger.info('Rule 6 matched: Coach identified → Coaching');
            return 'Coaching';
        }
        
        // Rule 7: Check if TRIVIAL (any short session)
        if (this.isTrivialSession(duration, topic)) {
            this.logger.info('Rule 7 matched: Short duration → TRIVIAL');
            return 'TRIVIAL';
        }
        
        // Default: MISC
        this.logger.info('No rules matched → MISC');
        return 'MISC';
    }
    
    /**
     * Check if this is a Game Plan session
     */
    isGamePlanSession(topic, components) {
        const topicLower = topic.toLowerCase();
        
        // Check for Game Plan indicators in topic
        const hasGamePlanIndicator = this.gamePlanIndicators.some(indicator => 
            topicLower.includes(indicator)
        );
        
        if (!hasGamePlanIndicator) {
            return false;
        }
        
        // Game Plan sessions should have a student (even if coach is unclear)
        const { student } = components;
        return this.hasValidStudent(student);
    }
    
    /**
     * Check if coach is valid (not unknown/empty and not admin)
     */
    hasValidCoach(coach) {
        if (!coach || 
            coach === 'unknown' || 
            coach === 'Unknown' || 
            coach.trim() === '') {
            return false;
        }
        
        // Only treat true admin/management accounts as invalid coaches
        const adminNames = ['siraj', 'ivylevel']; // Management only
        const coachLower = coach.toLowerCase();
        
        // Valid coaches include: noor, jenny, rishi, aditi, jamie, etc.
        return !adminNames.includes(coachLower);
    }
    
    /**
     * Check if student is valid (not unknown/empty and not admin)
     */
    hasValidStudent(student) {
        if (!student || 
            student === 'Unknown' || 
            student === 'unknown' || 
            student.trim() === '') {
            return false;
        }
        
        // Check if student is an admin account
        return !this.isAdminAccount(student);
    }
    
    /**
     * Check if name/email belongs to admin account
     */
    isAdminAccount(name, email = '') {
        const nameLower = name.toLowerCase();
        const emailLower = email.toLowerCase();
        
        // Only true admin/management accounts
        const adminAccounts = [
            { name: 'Siraj', email: 'siraj@ivymentors.co' },
            { name: 'Siraj Nazir', email: 'siraj@ivymentors.co' },
            { name: 'Ivylevel', email: 'contact@ivymentors.co' }
        ];
        
        return adminAccounts.some(admin => 
            admin.name.toLowerCase() === nameLower ||
            admin.email === emailLower
        );
    }
    
    /**
     * Check if this is a MISC session based on host/topic
     */
    isMiscSession(components, recording) {
        const { coach, student } = components;
        const topic = (recording.topic || '').toLowerCase();
        const hostEmail = (recording.host_email || '').toLowerCase();
        const hostName = (recording.host_name || '').toLowerCase();
        const coachLower = (coach || '').toLowerCase();
        
        // Check if any MISC indicator is present
        // Extract username from email for comparison (ignore domain)
        const emailUsername = hostEmail.split('@')[0].toLowerCase();
        
        const hasMiscIndicator = this.miscIndicators.some(indicator => 
            topic.includes(indicator) ||
            emailUsername.includes(indicator) || // Check username part only, not domain
            hostName.includes(indicator) ||
            coachLower.includes(indicator)
        );
        
        // MISC if: has MISC indicator AND no valid student AND not a coaching session
        const hasValidStudent = this.hasValidStudent(student);
        const hasValidCoach = this.hasValidCoach(coach);
        
        // Don't categorize as MISC if it looks like a coaching session
        if (hasValidStudent && hasValidCoach) {
            return false;
        }
        
        return hasMiscIndicator && !hasValidStudent;
    }
    
    /**
     * Check if session is TRIVIAL (short duration)
     */
    isTrivialSession(duration, topic = '') {
        // Handle null/undefined duration - don't categorize as TRIVIAL if duration unknown
        if (!duration || duration === null || duration === undefined) {
            return false;
        }
        
        // Duration-based check
        if (duration > 0 && duration < this.trivialDurationThreshold) {
            return true;
        }
        
        // Topic-based check for obvious trivial sessions
        const topicLower = topic.toLowerCase();
        const trivialIndicators = [
            'test',
            'mic test',
            'quick test',
            'brief',
            'short',
            'check',
            'demo'
        ];
        
        return trivialIndicators.some(indicator => topicLower.includes(indicator));
    }
    
    /**
     * Check if topic indicates Personal Meeting Room
     */
    isPMR(topic) {
        return topic && topic.toLowerCase().includes('personal meeting room');
    }
    
    /**
     * Check if this is a coaching session pattern
     */
    isCoachingSessionPattern(topic, components) {
        const topicLower = topic.toLowerCase();
        const { coach, student } = components;
        
        // Coaching session indicators
        const coachingPatterns = [
            'week', 'session', 'coaching', 'mentor', 'prep program',
            'comprehensive', 'ultimate prep', 'app program'
        ];
        
        const hasCoachingPattern = coachingPatterns.some(pattern => 
            topicLower.includes(pattern)
        );
        
        // If topic has coaching patterns and we have valid participants
        return hasCoachingPattern && 
               this.hasValidCoach(coach) && 
               this.hasValidStudent(student);
    }
    
    /**
     * Build the standardized folder name with correct prefix
     */
    buildFolderName(category, components, date, uuid = '') {
        const { coach = 'unknown', student = 'Unknown', week = 'WkUnknown' } = components;
        
        // Special handling for Game Plan sessions
        if (category === 'Coaching_GamePlan') {
            return `Coaching_GamePlan_Jenny_${student}_Wk1_${date}_M:${uuid}`;
        }
        
        // Special handling for TRIVIAL sessions
        if (category === 'TRIVIAL') {
            return `TRIVIAL_${coach}_${student}_${date}_M:${uuid}`;
        }
        
        // Standard naming
        return `${category}_${coach}_${student}_${week}_${date}_M:${uuid}`;
    }
    
    /**
     * Get coach for Game Plan sessions (always Jenny)
     */
    getGamePlanCoach() {
        return 'Jenny';
    }
    
    /**
     * Get week for Game Plan sessions (always Week 1)
     */
    getGamePlanWeek() {
        return 1;
    }
}

module.exports = { RecordingCategorizer };
