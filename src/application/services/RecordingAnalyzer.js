const { logger } = require('../../shared');

class RecordingAnalyzer {
    constructor({ 
        metadataExtractor, 
        outcomeExtractor, 
        relationshipAnalyzer,
        smartWeekInferencer,
        knowledgeBase 
    }) {
        this.metadataExtractor = metadataExtractor;
        this.outcomeExtractor = outcomeExtractor;
        this.relationshipAnalyzer = relationshipAnalyzer;
        this.smartWeekInferencer = smartWeekInferencer;
        this.knowledgeBase = knowledgeBase;
        
        // Wire SmartWeekInferencer into MetadataExtractor
        if (this.metadataExtractor && this.smartWeekInferencer) {
            this.metadataExtractor.setWeekInferencer(this.smartWeekInferencer);
        }
    }

    async analyzeRecording(recording) {
        const startTime = Date.now();
        const analysis = {
            recordingId: recording.id || recording.uuid,
            topic: recording.topic,
            startTime: recording.start_time,
            duration: recording.duration,
            // Initialize with empty values
            coach: '',
            student: '',
            weekNumber: null,
            sessionType: '',
            confidence: 0,
            outcomes: [],
            relationships: [],
            metadata: {},
            extractionSources: []
        };

        try {
            // Step 1: Extract metadata (names, week, session type)
            logger.info('Starting metadata extraction', { 
                recordingId: analysis.recordingId,
                hasFiles: !!recording.downloadedFiles && Object.keys(recording.downloadedFiles).length > 0
            });
            
            const metadata = await this.metadataExtractor.extractMetadata(recording);
            
            // Apply metadata results
            analysis.coach = metadata.coach || '';
            analysis.student = metadata.student || '';
            analysis.weekNumber = metadata.weekNumber;
            analysis.sessionType = metadata.sessionType || 'Unknown';
            analysis.confidence = metadata.confidence.overall || 0;
            analysis.metadata = metadata;
            analysis.extractionSources = metadata.dataSources || [];

            // Log extraction details
            logger.info('Metadata extraction complete', {
                recordingId: analysis.recordingId,
                coach: analysis.coach,
                student: analysis.student,
                week: analysis.weekNumber,
                sessionType: analysis.sessionType,
                confidence: analysis.confidence,
                sources: analysis.extractionSources
            });

            // Step 2: Extract outcomes if we have transcript
            if (recording.downloadedFiles?.transcript && this.outcomeExtractor) {
                try {
                    const outcomes = await this.outcomeExtractor.extractOutcomes(
                        recording.downloadedFiles.transcript,
                        { 
                            coach: analysis.coach, 
                            student: analysis.student,
                            week: analysis.weekNumber 
                        }
                    );
                    analysis.outcomes = outcomes;
                } catch (error) {
                    logger.error('Outcome extraction failed', { error: error.message });
                }
            }

            // Step 3: Analyze relationships
            if (this.relationshipAnalyzer) {
                try {
                    const relationships = await this.relationshipAnalyzer.analyzeRelationships({
                        participants: recording.participants || [],
                        coach: analysis.coach,
                        student: analysis.student,
                        transcript: recording.downloadedFiles?.transcript
                    });
                    analysis.relationships = relationships;
                } catch (error) {
                    logger.error('Relationship analysis failed', { error: error.message });
                }
            }

            // Step 4: Enrich with knowledge base data
            if (this.knowledgeBase && (analysis.coach || analysis.student)) {
                try {
                    const enrichment = await this.knowledgeBase.getEnrichmentData([
                        { name: analysis.coach, role: 'coach' },
                        { name: analysis.student, role: 'student' }
                    ]);
                    analysis.enrichment = enrichment;
                } catch (error) {
                    logger.error('Knowledge base enrichment failed', { error: error.message });
                }
            }

            // Calculate processing time
            analysis.processingTime = Date.now() - startTime;

            // Generate standardized name for filing
            analysis.standardizedName = this.buildStandardizedName(analysis);

            logger.info('Recording analysis complete', {
                recordingId: analysis.recordingId,
                standardizedName: analysis.standardizedName,
                processingTime: analysis.processingTime,
                confidence: analysis.confidence
            });

            return analysis;

        } catch (error) {
            logger.error('Recording analysis failed', {
                recordingId: recording.id,
                error: error.message,
                stack: error.stack
            });

            // Return partial analysis on error
            analysis.error = error.message;
            analysis.processingTime = Date.now() - startTime;
            return analysis;
        }
    }

    buildStandardizedName(analysis) {
        const parts = [];

        // Session type
        if (analysis.sessionType === 'Game Plan') {
            parts.push('GamePlan');
        } else if (analysis.sessionType === 'SAT Prep') {
            parts.push('SAT');
        } else if (analysis.sessionType === 'Admin' || !analysis.student || analysis.student === 'Unknown') {
            parts.push('MISC');
        } else {
            parts.push('Coaching');
        }

        // Coach name (remove spaces)
        if (analysis.coach && analysis.coach !== 'Unknown') {
            parts.push(analysis.coach.replace(/\s+/g, ''));
        } else {
            parts.push('Unknown');
        }

        // Student name
        if (analysis.student && analysis.student !== 'Unknown') {
            parts.push(analysis.student);
        } else {
            parts.push('Unknown');
        }

        // Week number
        if (analysis.weekNumber) {
            parts.push(`Wk${String(analysis.weekNumber).padStart(2, '0')}`);
        } else {
            parts.push('WkUnknown');
        }

        // Date
        if (analysis.startTime) {
            const date = new Date(analysis.startTime);
            parts.push(date.toISOString().split('T')[0]);
        } else {
            parts.push('Unknown');
        }

        return parts.join('_');
    }
}

module.exports = RecordingAnalyzer;