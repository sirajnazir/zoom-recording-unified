/**
 * Recording Analyzer Enhanced - Integration Update
 * 
 * Updates to RecordingAnalyzerEnhanced to properly use the NameStandardizerAdapter
 * Save this as a patch to src/infrastructure/services/RecordingAnalyzerEnhanced.js
 */

// In RecordingAnalyzerEnhanced.js, update the constructor and methods:

class RecordingAnalyzerEnhanced {
    constructor() {
        // CHANGE: Use the adapter instead of CompleteSmartNameStandardizer
        this.nameStandardizer = require('./NameStandardizerAdapter');
        this.knowledgeBase = require('./KnowledgeBaseService');
        this.logger = require('../../shared/Logger').logger;
        
        // ... rest of constructor
    }

    async initialize() {
        this.logger.info('Initializing RecordingAnalyzerEnhanced');
        
        // Initialize name standardizer
        await this.nameStandardizer.initialize();
        
        // ... rest of initialization
    }

    // Update the analyzeRecording method to use the adapter properly:
    async analyzeRecording(recording, additionalData = {}) {
        try {
            const startTime = Date.now();
            
            // Create analysis object
            const analysis = {
                recordingId: recording.uuid || recording.id,
                topic: recording.topic || '',
                startTime: recording.start_time,
                duration: recording.duration || 0,
                coach: '',
                student: '',
                sessionType: '',
                weekNumber: null,
                confidence: {
                    overall: 0,
                    coach: 0,
                    student: 0,
                    sessionType: 0
                },
                evidence: [],
                metadata: {}
            };

            // CHANGE: Use the standardize method properly
            const standardizationResult = await this.nameStandardizer.standardize(recording);
            
            // Apply standardization results
            analysis.coach = standardizationResult.coach;
            analysis.student = standardizationResult.student;
            analysis.sessionType = standardizationResult.sessionType;
            analysis.weekNumber = standardizationResult.weekNumber;
            analysis.confidence = {
                overall: standardizationResult.confidence,
                coach: standardizationResult.confidence,
                student: standardizationResult.confidence,
                sessionType: 80
            };

            // Add evidence
            if (standardizationResult.method) {
                analysis.evidence.push(`Names extracted using: ${standardizationResult.method}`);
            }

            // Build standardized name
            analysis.standardizedName = this.nameStandardizer.buildStandardizedName(analysis);

            // Additional processing...
            
            const processingTime = Date.now() - startTime;
            analysis.metadata.processingTime = processingTime;

            this.logger.info(`Recording analysis completed in ${processingTime}ms`, {
                recordingId: analysis.recordingId,
                standardizedName: analysis.standardizedName,
                confidence: analysis.confidence.overall
            });

            return analysis;

        } catch (error) {
            this.logger.error('Error analyzing recording:', error);
            throw error;
        }
    }

    // Update extractCoachFromEmail to work with the adapter
    extractCoachFromEmail(email) {
        if (!email) return null;
        
        try {
            // Extract username from email
            const username = email.split('@')[0].toLowerCase();
            
            // Try to standardize the username as a coach name
            const result = this.nameStandardizer.standardizeName(username, 'coach');
            
            if (result && result.confidence > 50) {
                return result.standardized;
            }
            
            // Fallback to basic mapping
            const emailToCoachMap = {
                'noor': 'Noor',
                'aditi': 'Aditi Bhaskar',
                'rishi': 'Rishi',
                'jenny': 'Jenny Duan',
                'jennyduan': 'Jenny Duan',
                'erin': 'Erin Ye',
                'steven': 'Steven',
                'juli': 'Juli',
                'andrew': 'Andrew',
                'kelvin': 'Kelvin',
                'marissa': 'Marissa'
            };
            
            return emailToCoachMap[username] || null;
        } catch (error) {
            this.logger.error('Error extracting coach from email:', error);
            return null;
        }
    }
}