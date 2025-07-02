const { ConfidenceScore } = require('../value-objects');

/**
 * Service for standardizing coach and student names
 */
class NameStandardizationService {
    constructor(knowledgeBase) {
        this.knowledgeBase = knowledgeBase;
        this.nameVariations = new Map();
        this.coachDatabase = this._initializeCoachDatabase();
        this._buildNameVariationsMap();
    }

    _initializeCoachDatabase() {
        return {
            'Juli': ['Ananyaa Srivastava', 'Ananyaa', 'AnanyaaSrivastava'],
            'Janice Teoh': ['Victoria Tan', 'Victoria'],
            'Janice': ['Victoria Tan', 'Victoria'],
            'Jenny Duan': ['Arushi Gupta', 'Anoushka', 'Minseo', 'Huda', 'Sakshi', 'Andrea', 'Priya'],
            'Jenny': ['Arushi Gupta', 'Anoushka', 'Minseo', 'Huda', 'Sakshi', 'Andrea', 'Priya'],
            'Summer': ['Soham'],
            'Alice': ['Rayaan'],
            'Andrew': ['Rayaan', 'Aarnav', 'Advay'],
            'Andrew Ai': ['Rayaan', 'Aarnav', 'Advay'],
            'Marissa': ['Emma', 'Oliver', 'Iqra', 'Sophia'],
            'Rishi': ['Aarav', 'Aarnav', 'Huda'],
            'Katie': ['Iqra'],
            'Erin': ['Srinidhi'],
            'Aditi': ['Kavya', 'Kavya Venkatesan'],
            'Aditi Bhaskar': ['Kavya', 'Kavya Venkatesan'],
            'Steven': ['Huda'],
            'Alan': ['Aarnav'],
            'Vilina': [],
            'Kelvin': ['Anoushka']
        };
    }

    _buildNameVariationsMap() {
        // Build coach variations
        Object.keys(this.coachDatabase).forEach(coachName => {
            this._addNameVariations(coachName, coachName);
        });

        // Build student variations
        Object.values(this.coachDatabase).flat().forEach(studentName => {
            this._addNameVariations(studentName, studentName);
        });

        // Add knowledge base entries
        if (this.knowledgeBase) {
            this.knowledgeBase.coaches?.forEach(coach => {
                this._addNameVariations(coach.name, coach.name);
                coach.alternateNames?.forEach(altName => {
                    this.nameVariations.set(altName.toLowerCase(), coach.name);
                });
            });

            this.knowledgeBase.students?.forEach(student => {
                this._addNameVariations(student.name, student.name);
                student.alternateNames?.forEach(altName => {
                    this.nameVariations.set(altName.toLowerCase(), student.name);
                });
            });
        }
    }

    _addNameVariations(name, canonicalName) {
        const nameLower = name.toLowerCase();
        
        // Add exact match
        this.nameVariations.set(nameLower, canonicalName);
        
        // Add concatenated version
        if (name.includes(' ')) {
            const concatenated = name.replace(/\s+/g, '').toLowerCase();
            this.nameVariations.set(concatenated, canonicalName);
        }
        
        // Add first name only
        const firstName = name.split(' ')[0];
        if (firstName && firstName !== name) {
            this.nameVariations.set(firstName.toLowerCase(), canonicalName);
        }
    }

    /**
     * Standardize a name using the variations map
     */
    standardizeName(name) {
        if (!name) return { name: null, confidence: new ConfidenceScore(0) };
        
        const nameLower = name.toLowerCase().trim();
        
        // Check exact match
        if (this.nameVariations.has(nameLower)) {
            return {
                name: this.nameVariations.get(nameLower),
                confidence: new ConfidenceScore(95)
            };
        }
        
        // Check partial matches
        for (const [variation, standard] of this.nameVariations.entries()) {
            if (nameLower.includes(variation) || variation.includes(nameLower)) {
                return {
                    name: standard,
                    confidence: new ConfidenceScore(80)
                };
            }
        }
        
        // Return original with low confidence
        return {
            name: name,
            confidence: new ConfidenceScore(50)
        };
    }

    /**
     * Check if a name is a known coach
     */
    isCoach(name) {
        const standardized = this.standardizeName(name);
        return Object.keys(this.coachDatabase).includes(standardized.name);
    }

    /**
     * Check if a name is a known student
     */
    isStudent(name) {
        const standardized = this.standardizeName(name);
        const allStudents = Object.values(this.coachDatabase).flat();
        return allStudents.includes(standardized.name);
    }

    /**
     * Get students for a coach
     */
    getStudentsForCoach(coachName) {
        const standardized = this.standardizeName(coachName);
        return this.coachDatabase[standardized.name] || [];
    }

    /**
     * Extract names from text using patterns
     */
    extractNamesFromText(text) {
        if (!text) return [];
        
        const patterns = [
            /([A-Za-z]+)\s*<->\s*([A-Za-z]+)/,
            /([A-Za-z]+)\s*<>\s*([A-Za-z]+)/,
            /([A-Za-z]+)\s+and\s+([A-Za-z]+)/,
            /([A-Za-z]+)\s+with\s+([A-Za-z]+)/
        ];
        
        const names = new Set();
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                if (match[1]) names.add(match[1]);
                if (match[2]) names.add(match[2]);
            }
        }
        
        // Also extract individual words that might be names
        const words = text.split(/[_\-\s]+/);
        for (const word of words) {
            const cleaned = word.replace(/[^\w]/g, '');
            if (cleaned.length > 2 && /^[A-Z]/.test(cleaned)) {
                names.add(cleaned);
            }
        }
        
        return Array.from(names);
    }

    /**
     * Build standardized filename
     */
    buildStandardizedFilename(session) {
        const parts = [];
        
        if (session.sessionType === 'Coach-Student' && session.coach && session.student) {
            parts.push(session.coach);
            parts.push(session.student);
        } else if (session.sessionType === 'Admin' && session.coach) {
            parts.push(session.coach);
            parts.push('Admin');
        } else if (session.sessionType === 'MISC') {
            parts.push('MISC');
        } else if (session.sessionType === 'Trivial') {
            parts.push('Trivial');
        } else {
            parts.push('Unknown');
        }
        
        if (session.weekNumber) {
            parts.push(`Week${session.weekNumber}`);
        }
        
        const dateStr = new Date(session.startTime).toISOString().split('T')[0];
        parts.push(dateStr);
        
        return parts.filter(Boolean).join('_');
    }
}

module.exports = { NameStandardizationService }; 