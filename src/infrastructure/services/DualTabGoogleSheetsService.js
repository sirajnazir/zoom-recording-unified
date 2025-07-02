// src/infrastructure/services/DualTabGoogleSheetsService.js
const { google } = require('googleapis');
const crypto = require('crypto');
const { EventBus } = require('../../shared/EventBus');
const { Logger } = require('../../shared/Logger');
const { Cache } = require('../../shared/Cache');
const { MetricsCollector } = require('../../shared/MetricsCollector');
const { 
    GoogleSheetsError, 
    ValidationError, 
    RateLimitError 
} = require('../../shared/errors');

/**
 * Google Sheets Service that properly uses existing tabs:
 * Tab 1: Raw Master Index - Original recording data
 * Tab 2: Standardized Master Index - Processed/standardized data with smart schema
 */
class DualTabGoogleSheetsService {
    constructor({ config, eventBus, logger, cache, metricsCollector, nameStandardizer, weekInferencer, metadataExtractor, transcriptionAnalyzer }) {
        this.config = config;
        this.eventBus = eventBus || new EventBus();
        this.logger = logger || new Logger('DualTabGoogleSheetsService');
        this.cache = cache || new Cache();
        this.metrics = metricsCollector || new MetricsCollector();
        
        // Enhanced services for smart data
        this.nameStandardizer = nameStandardizer;
        this.weekInferencer = weekInferencer;
        this.metadataExtractor = metadataExtractor;
        this.transcriptionAnalyzer = transcriptionAnalyzer;
        
        // Google API clients
        this.auth = null;
        this.sheets = null;
        this.drive = null;
        
        // Spreadsheet configuration
        this.spreadsheetId = config.google.sheets.masterIndexSheetId;
        
        // Tab names - using your existing tabs
        this.tabs = {
            raw: {
                name: 'Raw Master Index',
                gid: 0,
                columns: this._defineRawColumns()
            },
            standardized: {
                name: 'Standardized Master Index', 
                gid: 674892161,
                columns: this._defineStandardizedColumns()
            }
        };
        
        // Processing configuration
        this.batchSize = config.SHEETS_BATCH_SIZE || 100;
        this.rateLimitDelay = config.SHEETS_RATE_LIMIT_DELAY || 100;
        
        this._initialize();
    }
    
    /**
     * Define columns for Raw Master Index (Tab 1)
     * Original recording data as it comes from Zoom
     */
    _defineRawColumns() {
        return {
            uuid: 'A',                    // Original Zoom UUID (primary identifier)
            meetingId: 'B',               // Zoom meeting ID
            topic: 'C',                   // Meeting topic/title
            startTime: 'D',               // Start time (ISO format)
            endTime: 'E',                 // Calculated end time
            duration: 'F',                // Duration in seconds (from Zoom API)
            hostEmail: 'G',               // Host email address
            hostName: 'H',                // Host name (extracted from email)
            participantCount: 'I',        // Number of participants
            recordingType: 'J',           // Type of recording (cloud_recording)
            fileSize: 'K',                // Total file size in bytes
            downloadUrl: 'L',             // Download URL (if available)
            status: 'M',                  // Processing status
            createdAt: 'N',               // Original creation time
            lastModified: 'O'             // Last modification time
        };
    }
    
    /**
     * Define columns for Standardized Master Index (Tab 2)
     * Full smart schema with all processed data
     */
    _defineStandardizedColumns() {
        return {
            // A-H: Core Identity & Name Resolution
            uuid: 'A',                    // Original Zoom UUID
            fingerprint: 'B',              // Unique fingerprint
            recordingDate: 'C',            // Recording date (YYYY-MM-DD)
            rawName: 'D',                  // Original meeting topic
            standardizedName: 'E',         // Standardized name (Coach_Student_WkXX_Date)
            nameConfidence: 'F',           // Name resolution confidence (0-100)
            nameResolutionMethod: 'G',     // Method used for name resolution
            familyAccount: 'H',            // Is this a family account? (Yes/No)
            
            // I-K: Smart Week Inference
            weekNumber: 'I',               // Week number extracted/inferred
            weekConfidence: 'J',           // Week inference confidence (0-100)
            weekInferenceMethod: 'K',      // Method used for week inference
            
            // L-Q: Meeting Metadata
            hostEmail: 'L',                // Host email address
            hostName: 'M',                 // Host name (coach name)
            meetingTopic: 'N',             // Meeting topic/title
            participants: 'O',             // List of participants
            participantCount: 'P',         // Number of participants
            meetingId: 'Q',                // Zoom meeting ID
            
            // R-V: Recording Details
            duration: 'R',                 // Duration in minutes
            startTime: 'S',                // Start time (ISO format)
            endTime: 'T',                  // End time (ISO format)
            recordingType: 'U',            // Type of recording
            fileSize: 'V',                 // Total file size in MB
            
            // W-AD: Transcript Analysis
            hasTranscript: 'W',            // Has transcript? (Yes/No)
            transcriptQuality: 'X',        // Transcript quality (Good/Fair/Poor)
            speakerCount: 'Y',             // Number of speakers
            primarySpeaker: 'Z',           // Primary speaker name
            speakingTimeDistribution: 'AA', // JSON: speaking time distribution
            emotionalJourney: 'AB',        // JSON: emotional journey data
            engagementScore: 'AC',         // Engagement score (0-100)
            keyMoments: 'AD',              // JSON: key moments array
            
            // AE-AH: Coaching Insights
            coachingTopics: 'AE',          // List of coaching topics
            coachingStyle: 'AF',           // Coaching style identified
            studentResponsePattern: 'AG',  // Student response pattern
            interactionQuality: 'AH',      // Interaction quality score
            
            // AI-AL: AI-Generated Insights
            keyThemes: 'AI',               // List of key themes
            actionItems: 'AJ',             // List of action items
            challengesIdentified: 'AK',    // List of challenges
            breakthroughs: 'AL',           // List of breakthroughs
            
            // AM-AP: Tangible Outcomes
            goalsSet: 'AM',                // List of goals set
            progressTracked: 'AN',         // Progress tracking info
            nextSteps: 'AO',               // List of next steps
            followUpRequired: 'AP',        // Follow-up required? (Yes/No)
            
            // AQ-AT: File Management
            driveFolder: 'AQ',             // Google Drive folder name
            driveFolderId: 'AR',           // Google Drive folder ID
            videoFileId: 'AS',             // Video file ID in Drive
            transcriptFileId: 'AT',        // Transcript file ID in Drive
            
            // AU-AX: Processing Metadata
            processedDate: 'AU',           // Processing date
            processingVersion: 'AV',       // Processing version
            dataSource: 'AW',              // Data source
            lastUpdated: 'AX'              // Last updated timestamp
        };
    }
    
    async _initialize() {
        try {
            // Debug logging
            console.log('\n🔍 DEBUG: DualTabGoogleSheetsService Config Check');
            console.log('================================================');
            console.log('this.config exists:', !!this.config);
            console.log('this.config.google exists:', !!this.config.google);
            console.log('this.config.google.clientEmail:', this.config.google?.clientEmail || 'UNDEFINED');
            console.log('this.config.google.privateKey exists:', !!this.config.google?.privateKey);
            console.log('================================================\n');
            
            // Initialize Google Auth
            if (!this.config.google.clientEmail || !this.config.google.privateKey) {
                throw new Error('Missing Google credentials');
            }

            this.auth = new google.auth.GoogleAuth({
                credentials: {
                    client_email: this.config.google.clientEmail,
                    private_key: this.config.google.privateKey,
                    type: 'service_account'
                },
                scopes: [
                    'https://www.googleapis.com/auth/spreadsheets',
                    'https://www.googleapis.com/auth/drive.readonly'
                ]
            });
            
            const authClient = await this.auth.getClient();
            this.sheets = google.sheets({ version: 'v4', auth: authClient });
            this.drive = google.drive({ version: 'v3', auth: authClient });
            
            // Verify tabs exist (don't create new ones)
            await this._verifyTabs();
            
            this.logger.info('Dual-Tab Google Sheets Service initialized successfully');
            this.eventBus.emit('service:initialized', { service: 'DualTabGoogleSheetsService' });
            
        } catch (error) {
            this.logger.error('Failed to initialize Dual-Tab Google Sheets Service', error);
            throw new Error(`Sheets initialization failed: ${error.message}`);
        }
    }
    
    async _verifyTabs() {
        try {
            const spreadsheet = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });
            
            this.logger.info(`Connected to spreadsheet: ${spreadsheet.data.properties.title}`);
            
            const sheets = spreadsheet.data.sheets || [];
            const sheetNames = sheets.map(s => s.properties.title);
            
            // Verify our required tabs exist
            const rawTabExists = sheetNames.includes(this.tabs.raw.name);
            const standardizedTabExists = sheetNames.includes(this.tabs.standardized.name);
            
            if (!rawTabExists || !standardizedTabExists) {
                throw new Error(`Required tabs missing. Found: ${sheetNames.join(', ')}`);
            }
            
            this.logger.info('Both required tabs verified:');
            this.logger.info(`  - ${this.tabs.raw.name} (Tab 1)`);
            this.logger.info(`  - ${this.tabs.standardized.name} (Tab 2)`);
            
            // Check if the unwanted "Smart Schema Master Index" tab exists
            const unwantedTab = sheets.find(s => s.properties.title === 'Smart Schema Master Index');
            if (unwantedTab) {
                this.logger.warn('Found temporary test tab "Smart Schema Master Index" - consider removing it');
            }
            
        } catch (error) {
            throw new Error(`Cannot verify spreadsheet tabs: ${error.message}`);
        }
    }
    
    /**
     * Main method to update BOTH tabs with recording data
     */
    async updateMasterSpreadsheet(processedRecording, source = 'Reprocessing') {
        const startTime = Date.now();
        
        try {
            if (!processedRecording || !processedRecording.processed) {
                throw new ValidationError('Invalid processed recording data');
            }
            
            const { processed, original } = processedRecording;
            
            // Update Tab 1: Raw Master Index
            await this._updateRawTab(original, source);
            
            // Generate comprehensive smart data for Tab 2
            const smartData = await this._generateSmartData(processed, original, source);
            
            // Check for duplicates in Tab 2
            if (await this._isDuplicate(smartData.uuid, smartData.fingerprint)) {
                this.logger.info(`Skipping duplicate in standardized tab: ${smartData.standardizedName}`);
                return {
                    success: true,
                    duplicate: true,
                    standardizedName: smartData.standardizedName
                };
            }
            
            // Update Tab 2: Standardized Master Index
            await this._updateStandardizedTab(smartData);
            
            // Update cache
            await this._updateCache(smartData);
            
            // Emit event
            this.eventBus.emit('spreadsheet:updated', {
                uuid: smartData.uuid,
                standardizedName: smartData.standardizedName,
                weekNumber: smartData.weekNumber,
                source,
                tabs: ['raw', 'standardized']
            });
            
            this.logger.info(`Successfully updated both tabs for: ${smartData.standardizedName}`);
            
            return {
                success: true,
                duplicate: false,
                folderId: smartData.driveFolderId,
                standardizedName: smartData.standardizedName,
                source,
                timestamp: new Date().toISOString(),
                tabsUpdated: ['raw', 'standardized']
            };
            
        } catch (error) {
            this.logger.error('Failed to update spreadsheet', error);
            
            return {
                success: false,
                error: error.message,
                standardizedName: processedRecording?.processed?.standardizedName || 'Unknown',
                source,
                timestamp: new Date().toISOString()
            };
        }
    }
    
    /**
     * Update Tab 1: Raw Master Index with original recording data
     */
    async _updateRawTab(originalRecording, source) {
        // Extract processed data from the processor's structure
        const processedData = originalRecording.processed || {};
        
        // Use the ORIGINAL Zoom UUID and convert to Base64 for Zoom API compatibility
        const originalUuid = originalRecording.uuid || originalRecording.id;
        const uuidBase64 = this._convertUuidToBase64(originalUuid);
        
        // Use meeting_id if available, otherwise fall back to id
        const meetingId = originalRecording.meeting_id || originalRecording.id || '';
        
        const rowData = [
            uuidBase64, // Use Base64 UUID for Zoom API compatibility
            meetingId, // Use meeting_id or fall back to id
            originalRecording.topic,
            originalRecording.start_time,
            this._calculateEndTime(originalRecording.start_time, originalRecording.duration),
            // Keep duration in seconds as it comes from Zoom API
            originalRecording.duration || 0,
            originalRecording.host_email || '',
            originalRecording.host_name || originalRecording.host_email?.split('@')[0] || '',
            // Use actual participant count from Zoom
            originalRecording.participant_count || 0,
            originalRecording.recording_type || 'cloud_recording',
            // Use actual file size from Zoom or processed data
            processedData.totalFileSize || originalRecording.file_size || 0,
            originalRecording.download_url || processedData.downloadUrl || '',
            'Processed',
            originalRecording.created_at || originalRecording.start_time,
            new Date().toISOString()
        ];
        
        await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.spreadsheetId,
            range: `'${this.tabs.raw.name}'!A:O`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            requestBody: {
                values: [rowData]
            }
        });
        
        this.logger.debug(`Updated raw tab for recording: ${originalRecording.id}`);
    }
    
    /**
     * Update Tab 2: Standardized Master Index with smart schema data
     */
    async _updateStandardizedTab(smartData) {
        const rowData = this._prepareStandardizedRowData(smartData);
        
        await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.spreadsheetId,
            range: `'${this.tabs.standardized.name}'!A:AX`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            requestBody: {
                values: [rowData]
            }
        });
        
        this.logger.debug(`Updated standardized tab for: ${smartData.standardizedName}`);
    }
    
    /**
     * Generate comprehensive smart data (same as before)
     */
    async _generateSmartData(processed, original, source) {
        // Extract processed data from the processor's structure
        const processedData = processed || {};
        
        // Use the already processed standardized name from the processor
        const nameAnalysis = {
            standardizedName: processedData.standardizedName || original.topic || 'Unknown',
            confidence: processedData.nameConfidence || 0,
            method: processedData.nameResolutionMethod || 'fallback'
        };
        
        // Extract coach and student names from the standardized name
        // Format: "Coaching_CoachName_StudentName_WkXX_Date"
        const nameParts = nameAnalysis.standardizedName.split('_');
        const coachName = nameParts.length > 1 ? nameParts[1] : 'unknown';
        const studentName = nameParts.length > 2 ? nameParts[2] : 'Unknown';
        
        // Get meeting ID and UUID for the suffix
        const meetingId = original.meeting_id || original.id || '';
        
        // Create standardized name with proper M:<meeting_id>_U:<UUID> suffix
        // First, clean any existing suffixes from the standardized name
        const baseStandardizedName = nameAnalysis.standardizedName.replace(/U:[a-f0-9-]+$/, '').replace(/M:\d+/, '');
        
        // Convert UUID to Base64 for the suffix (will use originalUuid defined later)
        const uuidBase64 = this._convertUuidToBase64(original.uuid || original.id || '');
        
        // Add the proper suffix with Base64 UUID
        const standardizedNameWithSuffix = `${baseStandardizedName}_M:${meetingId}_U:${uuidBase64}`;
        
        // Use the week number that was already correctly inferred by the processor
        const weekAnalysis = {
            weekNumber: processedData.week_number || processedData.weekNumber || 0,
            confidence: processedData.week_confidence || processedData.weekConfidence || 0,
            method: processedData.week_method || processedData.weekMethod || 'fallback'
        };
        
        // Extract AI insights from processed data
        const aiInsights = processedData.aiInsights || processedData.insights || {};
        
        // Extract transcript analysis from processed data
        const transcriptAnalysis = processedData.transcriptAnalysis || {};
        
        // Extract outcomes from processed data
        const outcomes = processedData.outcomes || [];
        
        // Extract file management data from processed data
        const fileManagement = {
            driveFolder: processedData.driveFolder || '',
            driveFolderId: processedData.driveFolderId || '',
            driveFileIds: processedData.driveFileIds || {},
            driveLink: processedData.driveLink || '',
            downloadedFiles: processedData.downloadedFiles || {}
        };
        
        // Calculate total file size from downloaded files
        const totalFileSize = Object.values(fileManagement.downloadedFiles).reduce((total, filePath) => {
            if (filePath && require('fs').existsSync(filePath)) {
                const stats = require('fs').statSync(filePath);
                return total + stats.size;
            }
            return total;
        }, 0);
        
        // Extract enhanced metadata from processed data
        const enhancedMetadata = processedData.enhancedMetadata || {};
        
        // Extract quality metrics from processed data
        const qualityMetrics = processedData.qualityMetrics || {};
        
        // Extract processing metrics from processed data
        const processingMetrics = processedData.processingMetrics || {};
        
        // Extract comprehensive AI insights data
        const comprehensiveAIInsights = processedData.comprehensiveAIInsights || {};
        
        // Extract outcomes metadata
        const outcomesMetadata = processedData.outcomesMetadata || {};
        
        // Use ORIGINAL Zoom UUID and convert to Base64 for Zoom API compatibility
        const originalUuid = original.uuid || original.id;
        const uuid = this._convertUuidToBase64(originalUuid);
        const fingerprint = this._generateFingerprint(originalUuid, original.start_time || '');
        
        return {
            // Core identifiers
            uuid,
            fingerprint,
            recordingDate: this._formatDate(original.start_time),
            
            // Name resolution
            rawName: original.topic || original.originalName || '',
            standardizedName: standardizedNameWithSuffix,
            nameConfidence: nameAnalysis.confidence,
            nameResolutionMethod: nameAnalysis.method,
            familyAccount: nameAnalysis.isFamilyAccount || false,
            
            // Week inference - use the values from the processor
            weekNumber: weekAnalysis.weekNumber,
            weekConfidence: weekAnalysis.confidence,
            weekInferenceMethod: weekAnalysis.method,
            
            // Meeting metadata
            hostEmail: enhancedMetadata.hostEmail || original.host_email || '',
            hostName: coachName, // Use extracted coach name
            meetingTopic: enhancedMetadata.topic || original.topic || '',
            participants: enhancedMetadata.participants || processedData.participants || [],
            participantCount: enhancedMetadata.participantCount || processedData.participantCount || original.participant_count || 2, // Default to 2 for coach+student
            meetingId: original.meeting_id || original.id || '',
            
            // Recording details - use processed data
            duration: processedData.duration || Math.round((original.duration || 0) / 60), // minutes for standardized tab
            startTime: original.start_time || '',
            endTime: this._calculateEndTime(original.start_time, original.duration),
            recordingType: original.recording_type || 'cloud_recording',
            fileSize: this._bytesToMB(totalFileSize || original.file_size || 0),
            
            // Transcript analysis - comprehensive mapping
            hasTranscript: transcriptAnalysis.content || processedData.hasTranscript ? 'Yes' : 'No',
            transcriptQuality: transcriptAnalysis.quality || aiInsights.transcriptQuality || 'Good',
            speakerCount: transcriptAnalysis.speakers?.length || enhancedMetadata.speakerCount || 2, // Default to 2 for coach+student
            primarySpeaker: transcriptAnalysis.primarySpeaker?.name || enhancedMetadata.primarySpeaker || coachName,
            speakingTimeDistribution: transcriptAnalysis.speakingDistribution || aiInsights.speakingTimeDistribution || {},
            emotionalJourney: transcriptAnalysis.emotionalJourney || aiInsights.emotionalJourney || [],
            engagementScore: transcriptAnalysis.engagementScore || aiInsights.engagementScore || 0,
            keyMoments: transcriptAnalysis.keyMoments || aiInsights.keyMoments || [],
            
            // Coaching insights - comprehensive AI insights
            coachingTopics: aiInsights.coachingTopics || aiInsights.themes || comprehensiveAIInsights.coachingTopics || [],
            coachingStyle: aiInsights.coachingStyle || comprehensiveAIInsights.coachingStyle || '',
            studentResponsePattern: aiInsights.studentResponsePattern || comprehensiveAIInsights.studentResponsePattern || '',
            interactionQuality: aiInsights.interactionQuality || comprehensiveAIInsights.interactionQuality || '',
            
            // AI insights - comprehensive mapping
            keyThemes: aiInsights.themes || aiInsights.keyThemes || aiInsights.aiTopics || comprehensiveAIInsights.keyThemes || [],
            actionItems: aiInsights.actionItems || aiInsights.aiActionItems || comprehensiveAIInsights.actionItems || [],
            challengesIdentified: aiInsights.challenges || aiInsights.aiChallenges || comprehensiveAIInsights.challengesIdentified || [],
            breakthroughs: aiInsights.breakthroughs || aiInsights.aiBreakthroughs || comprehensiveAIInsights.breakthroughs || [],
            
            // Outcomes - comprehensive mapping
            goalsSet: outcomes.filter(o => o.type === 'goal').map(o => o.description) || [],
            progressTracked: outcomes.filter(o => o.type === 'progress').map(o => o.description).join(', ') || '',
            nextSteps: outcomes.filter(o => o.type === 'next_step').map(o => o.description) || [],
            followUpRequired: outcomes.some(o => o.type === 'follow_up') || false,
            
            // File management - use processed file data
            driveFolder: fileManagement.driveFolder || standardizedNameWithSuffix,
            driveFolderId: fileManagement.driveFolderId || '',
            videoFileId: fileManagement.driveFileIds?.video || '',
            transcriptFileId: fileManagement.driveFileIds?.transcript || '',
            driveLink: fileManagement.driveLink || '',
            
            // Processing metadata
            processedDate: new Date().toISOString(),
            processingVersion: '2.0-smart',
            dataSource: source,
            lastUpdated: new Date().toISOString(),
            
            // Enhanced metadata
            coach: enhancedMetadata.coach || coachName,
            student: enhancedMetadata.student || studentName,
            sessionType: enhancedMetadata.sessionType || processedData.session_type || 'coaching',
            
            // ===== COMPREHENSIVE AI INSIGHTS MAPPING =====
            // Session Overview
            session_overview: comprehensiveAIInsights.sessionOverview || aiInsights.sessionOverview || '',
            main_discussion_points: comprehensiveAIInsights.mainDiscussionPoints || aiInsights.mainDiscussionPoints || [],
            coaching_strengths: comprehensiveAIInsights.coachingStrengths || aiInsights.coachingStrengths || [],
            coaching_improvements: comprehensiveAIInsights.coachingImprovements || aiInsights.coachingImprovements || [],
            student_progress_indicators: comprehensiveAIInsights.studentProgressIndicators || aiInsights.studentProgressIndicators || [],
            
            // Emotional Journey
            emotional_journey_overall: comprehensiveAIInsights.emotionalJourneyOverall || aiInsights.emotionalJourneyOverall || '',
            emotional_stability_score: comprehensiveAIInsights.emotionalStabilityScore || aiInsights.emotionalStabilityScore || 0,
            risk_factors_count: comprehensiveAIInsights.riskFactorsCount || aiInsights.riskFactorsCount || 0,
            success_predictors_count: comprehensiveAIInsights.successPredictorsCount || aiInsights.successPredictorsCount || 0,
            
            // Conversation Analysis
            conversation_flow: comprehensiveAIInsights.conversationFlow || aiInsights.conversationFlow || '',
            response_patterns: comprehensiveAIInsights.responsePatterns || aiInsights.responsePatterns || '',
            session_phases: comprehensiveAIInsights.sessionPhases || aiInsights.sessionPhases || [],
            pacing_analysis: comprehensiveAIInsights.pacingAnalysis || aiInsights.pacingAnalysis || '',
            balance_analysis: comprehensiveAIInsights.balanceAnalysis || aiInsights.balanceAnalysis || '',
            
            // Executive Summary
            executive_summary: comprehensiveAIInsights.executiveSummary || aiInsights.executiveSummary || '',
            key_outcomes: comprehensiveAIInsights.keyOutcomes || aiInsights.keyOutcomes || [],
            next_steps: comprehensiveAIInsights.nextSteps || aiInsights.nextSteps || [],
            
            // Recommendations
            immediate_recommendations: comprehensiveAIInsights.immediateRecommendations || aiInsights.immediateRecommendations || [],
            short_term_recommendations: comprehensiveAIInsights.shortTermRecommendations || aiInsights.shortTermRecommendations || [],
            long_term_recommendations: comprehensiveAIInsights.longTermRecommendations || aiInsights.longTermRecommendations || [],
            coach_recommendations: comprehensiveAIInsights.coachRecommendations || aiInsights.coachRecommendations || [],
            student_recommendations: comprehensiveAIInsights.studentRecommendations || aiInsights.studentRecommendations || [],
            
            // ===== PROCESSING METRICS =====
            processing_start_time: processingMetrics.startTime || new Date().toISOString(),
            processing_end_time: processingMetrics.endTime || new Date().toISOString(),
            processing_errors: processingMetrics.errors || [],
            processing_warnings: processingMetrics.warnings || [],
            processing_steps_count: processingMetrics.stepsCount || 0,
            processing_steps_successful: processingMetrics.stepsSuccessful || 0,
            processing_steps_failed: processingMetrics.stepsFailed || 0,
            
            // ===== QUALITY METRICS =====
            quality_data_completeness: qualityMetrics.dataCompleteness || 0,
            quality_data_accuracy: qualityMetrics.dataAccuracy || 0,
            quality_data_consistency: qualityMetrics.dataConsistency || 0,
            quality_processing_success_rate: qualityMetrics.processingSuccessRate || 0,
            quality_processing_error_rate: qualityMetrics.processingErrorRate || 0,
            quality_processing_warning_rate: qualityMetrics.processingWarningRate || 0,
            quality_insights_zoom_available: qualityMetrics.insightsZoomAvailable || false,
            quality_insights_transcript_available: qualityMetrics.insightsTranscriptAvailable || false,
            quality_insights_outcomes_processed: qualityMetrics.insightsOutcomesProcessed || false,
            quality_file_completeness: qualityMetrics.fileCompleteness || 0,
            quality_file_expected_count: qualityMetrics.fileExpectedCount || 0,
            quality_file_generated_count: qualityMetrics.fileGeneratedCount || 0,
            
            // ===== MATCHING CONFIDENCE =====
            coach_match_confidence: enhancedMetadata.coachMatchConfidence || 0,
            coach_match_method: enhancedMetadata.coachMatchMethod || '',
            student_match_confidence: enhancedMetadata.studentMatchConfidence || 0,
            student_match_method: enhancedMetadata.studentMatchMethod || '',
            week_confidence: weekAnalysis.confidence,
            week_method: weekAnalysis.method,
            week_extracted_from_topic: weekAnalysis.extractedFromTopic || false,
            week_inferred_from_date: weekAnalysis.inferredFromDate || false,
            week_historical_pattern: weekAnalysis.historicalPattern || false,
            
            // ===== COACHING ANALYSIS =====
            coaching_techniques: comprehensiveAIInsights.coachingTechniques || aiInsights.coachingTechniques || [],
            coaching_effectiveness_factors: comprehensiveAIInsights.coachingEffectivenessFactors || aiInsights.coachingEffectivenessFactors || [],
            coaching_student_response: comprehensiveAIInsights.coachingStudentResponse || aiInsights.coachingStudentResponse || '',
            student_progress_learning: comprehensiveAIInsights.studentProgressLearning || aiInsights.studentProgressLearning || '',
            student_progress_growth: comprehensiveAIInsights.studentProgressGrowth || aiInsights.studentProgressGrowth || '',
            student_progress_motivation_factors: comprehensiveAIInsights.studentProgressMotivationFactors || aiInsights.studentProgressMotivationFactors || [],
            
            // ===== KEY MOMENTS =====
            breakthrough_moments: comprehensiveAIInsights.breakthroughMoments || aiInsights.breakthroughMoments || [],
            important_questions: comprehensiveAIInsights.importantQuestions || aiInsights.importantQuestions || [],
            action_items_details: comprehensiveAIInsights.actionItemsDetails || aiInsights.actionItemsDetails || [],
            key_highlights_details: comprehensiveAIInsights.keyHighlightsDetails || aiInsights.keyHighlightsDetails || [],
            key_topics_details: comprehensiveAIInsights.keyTopicsDetails || aiInsights.keyTopicsDetails || [],
            
            // ===== SENTIMENT ANALYSIS =====
            sentiment_positive_moments: comprehensiveAIInsights.sentimentPositiveMoments || aiInsights.sentimentPositiveMoments || [],
            sentiment_negative_moments: comprehensiveAIInsights.sentimentNegativeMoments || aiInsights.sentimentNegativeMoments || [],
            engagement_factors: comprehensiveAIInsights.engagementFactors || aiInsights.engagementFactors || [],
            
            // ===== CONVERSATION PATTERNS =====
            interruption_patterns: comprehensiveAIInsights.interruptionPatterns || aiInsights.interruptionPatterns || [],
            silence_patterns: comprehensiveAIInsights.silencePatterns || aiInsights.silencePatterns || [],
            transitions_count: comprehensiveAIInsights.transitionsCount || aiInsights.transitionsCount || 0,
            emotional_phases_count: comprehensiveAIInsights.emotionalPhasesCount || aiInsights.emotionalPhasesCount || 0,
            emotional_peaks_count: comprehensiveAIInsights.emotionalPeaksCount || aiInsights.emotionalPeaksCount || 0,
            emotional_valleys_count: comprehensiveAIInsights.emotionalValleysCount || aiInsights.emotionalValleysCount || 0,
            
            // ===== ZOOM ANALYTICS =====
            zoom_analytics_available: enhancedMetadata.zoomAnalyticsAvailable || false,
            transcript_duration: transcriptAnalysis.duration || 0,
            transcript_quality_score: transcriptAnalysis.qualityScore || 0,
            
            // ===== OUTCOMES SUMMARY =====
            outcomes_summary: outcomesMetadata.summary || '',
            outcomes_types: outcomesMetadata.types || [],
            outcomes_effectiveness_score: outcomesMetadata.effectivenessScore || 0,
            outcomes_completeness: outcomesMetadata.completeness || 0,
            outcomes_specificity: outcomesMetadata.specificity || 0,
            outcomes_actionability: outcomesMetadata.actionability || 0,
            outcomes_measurability: outcomesMetadata.measurability || 0,
            
            // ===== COMBINED ANALYSIS =====
            combined_analysis_session_overview_duration: comprehensiveAIInsights.combinedAnalysis?.sessionOverview?.duration || 0,
            combined_analysis_session_overview_participants: comprehensiveAIInsights.combinedAnalysis?.sessionOverview?.participants || 0,
            combined_analysis_session_overview_main_topics: comprehensiveAIInsights.combinedAnalysis?.sessionOverview?.mainTopics || [],
            combined_analysis_session_overview_overall_sentiment: comprehensiveAIInsights.combinedAnalysis?.sessionOverview?.overallSentiment || '',
            combined_analysis_session_overview_engagement_level: comprehensiveAIInsights.combinedAnalysis?.sessionOverview?.engagementLevel || '',
            
            // ===== FOLLOW UP RECOMMENDATIONS =====
            follow_up_recommendations_immediate: comprehensiveAIInsights.followUpRecommendations?.immediate || [],
            follow_up_recommendations_short_term: comprehensiveAIInsights.followUpRecommendations?.shortTerm || [],
            follow_up_recommendations_long_term: comprehensiveAIInsights.followUpRecommendations?.longTerm || [],
            follow_up_recommendations_coach_recommendations: comprehensiveAIInsights.followUpRecommendations?.coachRecommendations || [],
            follow_up_recommendations_student_recommendations: comprehensiveAIInsights.followUpRecommendations?.studentRecommendations || [],
            
            // ===== QUALITY METRICS OVERALL =====
            quality_metrics_overall_score: qualityMetrics.overallScore || 0,
            quality_metrics_data_quality_completeness: qualityMetrics.dataQualityCompleteness || 0,
            quality_metrics_data_quality_accuracy: qualityMetrics.dataQualityAccuracy || 0,
            quality_metrics_data_quality_consistency: qualityMetrics.dataQualityConsistency || 0,
            quality_metrics_data_quality_zoom_insights: qualityMetrics.dataQualityZoomInsights || false,
            quality_metrics_data_quality_transcript_analysis: qualityMetrics.dataQualityTranscriptAnalysis || false,
            quality_metrics_session_metrics_engagement: qualityMetrics.sessionMetricsEngagement || 0,
            quality_metrics_session_metrics_participation: qualityMetrics.sessionMetricsParticipation || 0,
            quality_metrics_session_metrics_interaction: qualityMetrics.sessionMetricsInteraction || 0,
            quality_metrics_coaching_metrics_effectiveness: qualityMetrics.coachingMetricsEffectiveness || 0,
            quality_metrics_coaching_metrics_techniques: qualityMetrics.coachingMetricsTechniques || 0,
            quality_metrics_coaching_metrics_responsiveness: qualityMetrics.coachingMetricsResponsiveness || 0,
            quality_metrics_student_metrics_progress: qualityMetrics.studentMetricsProgress || 0,
            quality_metrics_student_metrics_satisfaction: qualityMetrics.studentMetricsSatisfaction || 0,
            quality_metrics_student_metrics_learning: qualityMetrics.studentMetricsLearning || 0,
            
            // ===== ZOOM INSIGHTS =====
            zoom_insights_summary: comprehensiveAIInsights.zoomInsights?.summary || '',
            zoom_insights_highlights: comprehensiveAIInsights.zoomInsights?.highlights || [],
            zoom_insights_analytics: comprehensiveAIInsights.zoomInsights?.analytics || {},
            zoom_insights_ai_summary: comprehensiveAIInsights.zoomInsights?.aiSummary || '',
            zoom_insights_topics: comprehensiveAIInsights.zoomInsights?.topics || [],
            zoom_insights_action_items: comprehensiveAIInsights.zoomInsights?.actionItems || [],
            zoom_insights_questions: comprehensiveAIInsights.zoomInsights?.questions || [],
            zoom_insights_sentiment: comprehensiveAIInsights.zoomInsights?.sentiment || '',
            zoom_insights_engagement: comprehensiveAIInsights.zoomInsights?.engagement || 0,
            zoom_insights_breakthrough_moments: comprehensiveAIInsights.zoomInsights?.breakthroughMoments || [],
            zoom_insights_coaching_techniques: comprehensiveAIInsights.zoomInsights?.coachingTechniques || [],
            zoom_insights_student_progress: comprehensiveAIInsights.zoomInsights?.studentProgress || '',
            zoom_insights_errors: comprehensiveAIInsights.zoomInsights?.errors || [],
            
            // ===== TRANSCRIPT INSIGHTS =====
            transcript_insights_summary: comprehensiveAIInsights.transcriptInsights?.summary || '',
            transcript_insights_key_moments: comprehensiveAIInsights.transcriptInsights?.keyMoments || [],
            transcript_insights_speaker_analysis: comprehensiveAIInsights.transcriptInsights?.speakerAnalysis || {},
            transcript_insights_topics: comprehensiveAIInsights.transcriptInsights?.topics || [],
            transcript_insights_action_items: comprehensiveAIInsights.transcriptInsights?.actionItems || [],
            transcript_insights_questions: comprehensiveAIInsights.transcriptInsights?.questions || [],
            transcript_insights_sentiment: comprehensiveAIInsights.transcriptInsights?.sentiment || '',
            transcript_insights_engagement: comprehensiveAIInsights.transcriptInsights?.engagement || 0,
            transcript_insights_coaching_insights: comprehensiveAIInsights.transcriptInsights?.coachingInsights || '',
            transcript_insights_emotional_journey: comprehensiveAIInsights.transcriptInsights?.emotionalJourney || [],
            transcript_insights_conversation_patterns: comprehensiveAIInsights.transcriptInsights?.conversationPatterns || [],
            transcript_insights_session_structure: comprehensiveAIInsights.transcriptInsights?.sessionStructure || '',
            transcript_insights_breakthrough_moments: comprehensiveAIInsights.transcriptInsights?.breakthroughMoments || [],
            transcript_insights_risk_factors: comprehensiveAIInsights.transcriptInsights?.riskFactors || [],
            transcript_insights_success_predictors: comprehensiveAIInsights.transcriptInsights?.successPredictors || [],
            transcript_insights_metadata_total_duration: comprehensiveAIInsights.transcriptInsights?.metadata?.totalDuration || 0,
            transcript_insights_metadata_word_count: comprehensiveAIInsights.transcriptInsights?.metadata?.wordCount || 0,
            transcript_insights_metadata_speaker_count: comprehensiveAIInsights.transcriptInsights?.metadata?.speakerCount || 0,
            transcript_insights_metadata_analyzed_at: comprehensiveAIInsights.transcriptInsights?.metadata?.analyzedAt || '',
            
            // ===== OUTCOMES DETAILED =====
            outcomes_outcomes: outcomesMetadata.outcomes || [],
            outcomes_quality_metrics: outcomesMetadata.qualityMetrics || {},
            outcomes_metadata_version: outcomesMetadata.version || '2.0',
            outcomes_metadata_generated_at: outcomesMetadata.generatedAt || new Date().toISOString(),
            outcomes_metadata_recording_id: outcomesMetadata.recordingId || original.id,
            outcomes_metadata_meeting_id: outcomesMetadata.meetingId || original.meeting_id,
            outcomes_metadata_meeting_uuid: outcomesMetadata.meetingUuid || original.uuid,
            outcomes_metadata_topic: outcomesMetadata.topic || original.topic,
            outcomes_metadata_start_time: outcomesMetadata.startTime || original.start_time,
            outcomes_metadata_duration: outcomesMetadata.duration || original.duration,
            outcomes_metadata_summary_total_outcomes: outcomesMetadata.summary?.totalOutcomes || outcomes.length,
            outcomes_metadata_summary_outcome_types: outcomesMetadata.summary?.outcomeTypes || [],
            outcomes_metadata_summary_outcome_categories: outcomesMetadata.summary?.outcomeCategories || [],
            outcomes_metadata_summary_status_breakdown_planned: outcomesMetadata.summary?.statusBreakdown?.planned || 0,
            outcomes_metadata_summary_status_breakdown_in_progress: outcomesMetadata.summary?.statusBreakdown?.inProgress || 0,
            outcomes_metadata_summary_status_breakdown_achieved: outcomesMetadata.summary?.statusBreakdown?.achieved || 0,
            outcomes_metadata_summary_status_breakdown_failed: outcomesMetadata.summary?.statusBreakdown?.failed || 0,
            outcomes_metadata_summary_effectiveness_score: outcomesMetadata.summary?.effectivenessScore || 0,
            outcomes_metadata_summary_key_outcomes: outcomesMetadata.summary?.keyOutcomes || [],
            outcomes_metadata_quality_overall_score: outcomesMetadata.quality?.overallScore || 0,
            outcomes_metadata_quality_completeness: outcomesMetadata.quality?.completeness || 0,
            outcomes_metadata_quality_specificity: outcomesMetadata.quality?.specificity || 0,
            outcomes_metadata_quality_actionability: outcomesMetadata.quality?.actionability || 0,
            outcomes_metadata_quality_measurability: outcomesMetadata.quality?.measurability || 0,
            
            // ===== GENERATED FILES =====
            generated_files_summary: comprehensiveAIInsights.generatedFiles?.summary || '',
            generated_files_highlights: comprehensiveAIInsights.generatedFiles?.highlights || [],
            generated_files_action_items: comprehensiveAIInsights.generatedFiles?.actionItems || [],
            generated_files_coaching_notes: comprehensiveAIInsights.generatedFiles?.coachingNotes || [],
            generated_files_insights_path: comprehensiveAIInsights.generatedFiles?.insightsPath || '',
            generated_files_outcomes_path: comprehensiveAIInsights.generatedFiles?.outcomesPath || '',
            generated_files_summary_path: comprehensiveAIInsights.generatedFiles?.summaryPath || '',
            generated_files_highlights_path: comprehensiveAIInsights.generatedFiles?.highlightsPath || '',
            generated_files_action_items_path: comprehensiveAIInsights.generatedFiles?.actionItemsPath || '',
            generated_files_coaching_notes_path: comprehensiveAIInsights.generatedFiles?.coachingNotesPath || '',
            
            // ===== UPLOAD METRICS =====
            files_uploaded_count: fileManagement.uploadMetrics?.filesUploadedCount || Object.keys(fileManagement.downloadedFiles).length,
            total_upload_size: fileManagement.uploadMetrics?.totalUploadSize || this._bytesToMB(totalFileSize),
            upload_success: fileManagement.uploadMetrics?.uploadSuccess || true,
            upload_duration_ms: fileManagement.uploadMetrics?.uploadDurationMs || 0,
            
            // ===== PROCESSING METADATA =====
            processing_id: processedData.processingId || this._generateUUID(),
            insights_version: processedData.insightsVersion || '2.0-smart',
            metadata_version: processedData.metadataVersion || '2.0-smart',
            insights_metadata_version: processedData.insightsMetadataVersion || '2.0-smart',
            insights_metadata_generated_at: processedData.insightsMetadataGeneratedAt || new Date().toISOString(),
            insights_metadata_recording_id: processedData.insightsMetadataRecordingId || original.id,
            insights_metadata_meeting_id: processedData.insightsMetadataMeetingId || original.meeting_id,
            insights_metadata_meeting_uuid: processedData.insightsMetadataMeetingUuid || original.uuid,
            insights_metadata_topic: processedData.insightsMetadataTopic || original.topic,
            insights_metadata_start_time: processedData.insightsMetadataStartTime || original.start_time,
            insights_metadata_duration: processedData.insightsMetadataDuration || original.duration,
            insights_metadata_processing_version: processedData.insightsMetadataProcessingVersion || '2.0-smart',
            
            // ===== NAME ANALYSIS DETAILED =====
            name_analysis_standardized_name: processedData.nameAnalysis?.standardizedName || nameAnalysis.standardizedName,
            name_analysis_confidence: processedData.nameAnalysis?.confidence || nameAnalysis.confidence,
            name_analysis_method: processedData.nameAnalysis?.method || nameAnalysis.method,
            name_analysis_details_coach: processedData.nameAnalysis?.details?.coach || '',
            name_analysis_details_student: processedData.nameAnalysis?.details?.student || '',
            name_analysis_details_week: processedData.nameAnalysis?.details?.week || '',
            name_analysis_details_session_type: processedData.nameAnalysis?.details?.sessionType || '',
            name_analysis_details_name_variations: processedData.nameAnalysis?.details?.nameVariations || [],
            name_analysis_details_confidence_factors: processedData.nameAnalysis?.details?.confidenceFactors || [],
            
            // ===== WEEK ANALYSIS DETAILED =====
            week_analysis_week_number: processedData.weekAnalysis?.weekNumber || weekAnalysis.weekNumber,
            week_analysis_confidence: processedData.weekAnalysis?.confidence || weekAnalysis.confidence,
            week_analysis_method: processedData.weekAnalysis?.method || weekAnalysis.method,
            week_analysis_standardized_name: processedData.weekAnalysis?.standardizedName || '',
            week_analysis_details_extracted_week: processedData.weekAnalysis?.details?.extractedWeek || '',
            week_analysis_details_inferred_week: processedData.weekAnalysis?.details?.inferredWeek || '',
            week_analysis_details_confidence_factors: processedData.weekAnalysis?.details?.confidenceFactors || [],
            week_analysis_details_alternatives: processedData.weekAnalysis?.details?.alternatives || [],
            
            // ===== DOWNLOAD RESULT DETAILED =====
            download_result_folder_path: processedData.downloadResult?.folderPath || '',
            download_result_downloaded_files: processedData.downloadResult?.downloadedFiles || [],
            download_result_organized_files: processedData.downloadResult?.organizedFiles || '',
            download_result_details_file_count: processedData.downloadResult?.details?.fileCount || Object.keys(fileManagement.downloadedFiles).length,
            download_result_details_total_size: processedData.downloadResult?.details?.totalSize || this._bytesToMB(totalFileSize),
            download_result_details_has_video: processedData.downloadResult?.details?.hasVideo || !!fileManagement.downloadedFiles.video,
            download_result_details_has_audio: processedData.downloadResult?.details?.hasAudio || !!fileManagement.downloadedFiles.audio,
            download_result_details_has_transcript: processedData.downloadResult?.details?.hasTranscript || !!fileManagement.downloadedFiles.transcript,
            
            // ===== INSIGHTS RESULT DETAILED =====
            insights_result_insights_path: processedData.insightsResult?.insightsPath || '',
            insights_result_details_insights_version: processedData.insightsResult?.details?.insightsVersion || '2.0-smart',
            insights_result_details_data_quality: processedData.insightsResult?.details?.dataQuality || '',
            insights_result_details_overall_score: processedData.insightsResult?.details?.overallScore || 0,
            
            // ===== OUTCOMES RESULT DETAILED =====
            outcomes_result_outcomes_path: processedData.outcomesResult?.outcomesPath || '',
            outcomes_result_details_outcomes_count: processedData.outcomesResult?.details?.outcomesCount || outcomes.length,
            outcomes_result_details_outcome_types: processedData.outcomesResult?.details?.outcomeTypes || [],
            
            // ===== FILE GENERATION RESULT DETAILED =====
            file_generation_result_files: processedData.fileGenerationResult?.files || [],
            file_generation_result_details_files_generated: processedData.fileGenerationResult?.details?.filesGenerated || 0,
            file_generation_result_details_file_types: processedData.fileGenerationResult?.details?.fileTypes || [],
            
            // ===== QUALITY RESULT DETAILED =====
            quality_result_metrics_overall_score: processedData.qualityResult?.metrics?.overallScore || 0,
            quality_result_metrics_data_quality_completeness: processedData.qualityResult?.metrics?.dataQualityCompleteness || 0,
            quality_result_metrics_data_quality_accuracy: processedData.qualityResult?.metrics?.dataQualityAccuracy || 0,
            quality_result_metrics_data_quality_consistency: processedData.qualityResult?.metrics?.dataQualityConsistency || 0,
            quality_result_metrics_processing_quality_success_rate: processedData.qualityResult?.metrics?.processingQualitySuccessRate || 0,
            quality_result_metrics_processing_quality_error_rate: processedData.qualityResult?.metrics?.processingQualityErrorRate || 0,
            quality_result_metrics_processing_quality_warning_rate: processedData.qualityResult?.metrics?.processingQualityWarningRate || 0,
            quality_result_metrics_insights_quality_zoom_insights: processedData.qualityResult?.metrics?.insightsQualityZoomInsights || false,
            quality_result_metrics_insights_quality_transcript_analysis: processedData.qualityResult?.metrics?.insightsQualityTranscriptAnalysis || false,
            quality_result_metrics_insights_quality_outcomes_processing: processedData.qualityResult?.metrics?.insightsQualityOutcomesProcessing || false,
            quality_result_metrics_file_quality_files_generated: processedData.qualityResult?.metrics?.fileQualityFilesGenerated || 0,
            quality_result_metrics_file_quality_expected_files: processedData.qualityResult?.metrics?.fileQualityExpectedFiles || 0,
            quality_result_metrics_file_quality_completeness: processedData.qualityResult?.metrics?.fileQualityCompleteness || 0,
            
            // ===== UPLOAD RESULT DETAILED =====
            upload_result_folder_id: processedData.uploadResult?.folderId || fileManagement.driveFolderId,
            upload_result_drive_link: processedData.uploadResult?.driveLink || fileManagement.driveLink,
            upload_result_details_files_uploaded: processedData.uploadResult?.details?.filesUploaded || 0,
            upload_result_details_total_size: processedData.uploadResult?.details?.totalSize || 0,
            
            // ===== PROCESSING STEPS =====
            processing_steps_name_and_week_processing_success: processedData.processingSteps?.nameAndWeekProcessing?.success || true,
            processing_steps_name_and_week_processing_duration: processedData.processingSteps?.nameAndWeekProcessing?.duration || 0,
            processing_steps_name_and_week_processing_details: processedData.processingSteps?.nameAndWeekProcessing?.details || '',
            processing_steps_file_download_and_organization_success: processedData.processingSteps?.fileDownloadAndOrganization?.success || false,
            processing_steps_file_download_and_organization_duration: processedData.processingSteps?.fileDownloadAndOrganization?.duration || 0,
            processing_steps_file_download_and_organization_details: processedData.processingSteps?.fileDownloadAndOrganization?.details || '',
            processing_steps_comprehensive_insights_generation_success: processedData.processingSteps?.comprehensiveInsightsGeneration?.success || false,
            processing_steps_comprehensive_insights_generation_duration: processedData.processingSteps?.comprehensiveInsightsGeneration?.duration || 0,
            processing_steps_comprehensive_insights_generation_details: processedData.processingSteps?.comprehensiveInsightsGeneration?.details || '',
            processing_steps_tangible_outcomes_processing_success: processedData.processingSteps?.tangibleOutcomesProcessing?.success || false,
            processing_steps_tangible_outcomes_processing_duration: processedData.processingSteps?.tangibleOutcomesProcessing?.duration || 0,
            processing_steps_tangible_outcomes_processing_details: processedData.processingSteps?.tangibleOutcomesProcessing?.details || '',
            processing_steps_additional_file_generation_success: processedData.processingSteps?.additionalFileGeneration?.success || false,
            processing_steps_additional_file_generation_duration: processedData.processingSteps?.additionalFileGeneration?.duration || 0,
            processing_steps_additional_file_generation_details: processedData.processingSteps?.additionalFileGeneration?.details || '',
            processing_steps_quality_assessment_success: processedData.processingSteps?.qualityAssessment?.success || false,
            processing_steps_quality_assessment_duration: processedData.processingSteps?.qualityAssessment?.duration || 0,
            processing_steps_quality_assessment_details: processedData.processingSteps?.qualityAssessment?.details || '',
            processing_steps_google_drive_upload_success: processedData.processingSteps?.googleDriveUpload?.success || false,
            processing_steps_google_drive_upload_duration: processedData.processingSteps?.googleDriveUpload?.duration || 0,
            processing_steps_google_drive_upload_details: processedData.processingSteps?.googleDriveUpload?.details || '',
            
            // ===== DATA SOURCE =====
            data_source: processedData.dataSource || 'zoom_cloud_processing',
            driveFolderId: fileManagement.driveFolderId,
            driveLink: fileManagement.driveLink,
            driveFileIds: fileManagement.driveFileIds
        };
    }
    
    /**
     * Prepare row data for standardized tab
     */
    _prepareStandardizedRowData(smartData) {
        return [
            // Core Identity & Name
            smartData.uuid,
            smartData.fingerprint,
            smartData.recordingDate,
            smartData.rawName,
            smartData.standardizedName,
            smartData.nameConfidence,
            smartData.nameResolutionMethod,
            smartData.familyAccount ? 'Yes' : 'No',
            
            // Week Inference
            smartData.weekNumber,
            smartData.weekConfidence,
            smartData.weekInferenceMethod,
            
            // Meeting Metadata
            smartData.hostEmail,
            smartData.hostName,
            smartData.meetingTopic,
            Array.isArray(smartData.participants) ? smartData.participants.join(', ') : '',
            smartData.participantCount,
            smartData.meetingId,
            
            // Recording Details
            smartData.duration,
            smartData.startTime,
            smartData.endTime,
            smartData.recordingType,
            smartData.fileSize,
            
            // Transcript Analysis
            smartData.hasTranscript ? 'Yes' : 'No',
            smartData.transcriptQuality,
            smartData.speakerCount,
            smartData.primarySpeaker,
            JSON.stringify(smartData.speakingTimeDistribution),
            JSON.stringify(smartData.emotionalJourney),
            smartData.engagementScore,
            JSON.stringify(smartData.keyMoments),
            
            // Coaching Insights
            Array.isArray(smartData.coachingTopics) ? smartData.coachingTopics.join(', ') : '',
            smartData.coachingStyle,
            smartData.studentResponsePattern,
            smartData.interactionQuality,
            
            // AI Insights
            Array.isArray(smartData.keyThemes) ? smartData.keyThemes.join(', ') : '',
            Array.isArray(smartData.actionItems) ? smartData.actionItems.join(' | ') : '',
            Array.isArray(smartData.challengesIdentified) ? smartData.challengesIdentified.join(' | ') : '',
            Array.isArray(smartData.breakthroughs) ? smartData.breakthroughs.join(' | ') : '',
            
            // Outcomes
            Array.isArray(smartData.goalsSet) ? smartData.goalsSet.join(' | ') : '',
            smartData.progressTracked,
            Array.isArray(smartData.nextSteps) ? smartData.nextSteps.join(' | ') : '',
            smartData.followUpRequired ? 'Yes' : 'No',
            
            // File Management
            smartData.driveFolder,
            smartData.driveFolderId,
            smartData.videoFileId,
            smartData.transcriptFileId,
            smartData.driveLink,
            
            // Processing Metadata
            smartData.processedDate,
            smartData.processingVersion,
            smartData.dataSource,
            smartData.lastUpdated,
            
            // ===== COMPREHENSIVE AI INSIGHTS =====
            // Session Overview
            smartData.session_overview || '',
            Array.isArray(smartData.main_discussion_points) ? smartData.main_discussion_points.join(', ') : '',
            Array.isArray(smartData.coaching_strengths) ? smartData.coaching_strengths.join(', ') : '',
            Array.isArray(smartData.coaching_improvements) ? smartData.coaching_improvements.join(', ') : '',
            Array.isArray(smartData.student_progress_indicators) ? smartData.student_progress_indicators.join(', ') : '',
            
            // Emotional Journey
            smartData.emotional_journey_overall || '',
            smartData.emotional_stability_score || 0,
            smartData.risk_factors_count || 0,
            smartData.success_predictors_count || 0,
            
            // Conversation Analysis
            smartData.conversation_flow || '',
            smartData.response_patterns || '',
            Array.isArray(smartData.session_phases) ? smartData.session_phases.join(', ') : '',
            smartData.pacing_analysis || '',
            smartData.balance_analysis || '',
            
            // Executive Summary
            smartData.executive_summary || '',
            Array.isArray(smartData.key_outcomes) ? smartData.key_outcomes.join(', ') : '',
            Array.isArray(smartData.next_steps) ? smartData.next_steps.join(', ') : '',
            
            // Recommendations
            Array.isArray(smartData.immediate_recommendations) ? smartData.immediate_recommendations.join(', ') : '',
            Array.isArray(smartData.short_term_recommendations) ? smartData.short_term_recommendations.join(', ') : '',
            Array.isArray(smartData.long_term_recommendations) ? smartData.long_term_recommendations.join(', ') : '',
            Array.isArray(smartData.coach_recommendations) ? smartData.coach_recommendations.join(', ') : '',
            Array.isArray(smartData.student_recommendations) ? smartData.student_recommendations.join(', ') : '',
            
            // ===== PROCESSING METRICS =====
            smartData.processing_start_time || '',
            smartData.processing_end_time || '',
            Array.isArray(smartData.processing_errors) ? smartData.processing_errors.join(', ') : '',
            Array.isArray(smartData.processing_warnings) ? smartData.processing_warnings.join(', ') : '',
            smartData.processing_steps_count || 0,
            smartData.processing_steps_successful || 0,
            smartData.processing_steps_failed || 0,
            
            // ===== QUALITY METRICS =====
            smartData.quality_data_completeness || 0,
            smartData.quality_data_accuracy || 0,
            smartData.quality_data_consistency || 0,
            smartData.quality_processing_success_rate || 0,
            smartData.quality_processing_error_rate || 0,
            smartData.quality_processing_warning_rate || 0,
            smartData.quality_insights_zoom_available ? 'Yes' : 'No',
            smartData.quality_insights_transcript_available ? 'Yes' : 'No',
            smartData.quality_insights_outcomes_processed ? 'Yes' : 'No',
            smartData.quality_file_completeness || 0,
            smartData.quality_file_expected_count || 0,
            smartData.quality_file_generated_count || 0,
            
            // ===== MATCHING CONFIDENCE =====
            smartData.coach_match_confidence || 0,
            smartData.coach_match_method || '',
            smartData.student_match_confidence || 0,
            smartData.student_match_method || '',
            smartData.week_confidence || 0,
            smartData.week_method || '',
            smartData.week_extracted_from_topic ? 'Yes' : 'No',
            smartData.week_inferred_from_date ? 'Yes' : 'No',
            smartData.week_historical_pattern ? 'Yes' : 'No',
            
            // ===== COACHING ANALYSIS =====
            Array.isArray(smartData.coaching_techniques) ? smartData.coaching_techniques.join(', ') : '',
            Array.isArray(smartData.coaching_effectiveness_factors) ? smartData.coaching_effectiveness_factors.join(', ') : '',
            smartData.coaching_student_response || '',
            smartData.student_progress_learning || '',
            smartData.student_progress_growth || '',
            Array.isArray(smartData.student_progress_motivation_factors) ? smartData.student_progress_motivation_factors.join(', ') : '',
            
            // ===== KEY MOMENTS =====
            Array.isArray(smartData.breakthrough_moments) ? smartData.breakthrough_moments.join(', ') : '',
            Array.isArray(smartData.important_questions) ? smartData.important_questions.join(', ') : '',
            Array.isArray(smartData.action_items_details) ? smartData.action_items_details.join(', ') : '',
            Array.isArray(smartData.key_highlights_details) ? smartData.key_highlights_details.join(', ') : '',
            Array.isArray(smartData.key_topics_details) ? smartData.key_topics_details.join(', ') : '',
            
            // ===== SENTIMENT ANALYSIS =====
            Array.isArray(smartData.sentiment_positive_moments) ? smartData.sentiment_positive_moments.join(', ') : '',
            Array.isArray(smartData.sentiment_negative_moments) ? smartData.sentiment_negative_moments.join(', ') : '',
            Array.isArray(smartData.engagement_factors) ? smartData.engagement_factors.join(', ') : '',
            
            // ===== CONVERSATION PATTERNS =====
            Array.isArray(smartData.interruption_patterns) ? smartData.interruption_patterns.join(', ') : '',
            Array.isArray(smartData.silence_patterns) ? smartData.silence_patterns.join(', ') : '',
            smartData.transitions_count || 0,
            smartData.emotional_phases_count || 0,
            smartData.emotional_peaks_count || 0,
            smartData.emotional_valleys_count || 0,
            
            // ===== ZOOM ANALYTICS =====
            smartData.zoom_analytics_available ? 'Yes' : 'No',
            smartData.transcript_duration || 0,
            smartData.transcript_quality_score || 0,
            
            // ===== OUTCOMES SUMMARY =====
            smartData.outcomes_summary || '',
            Array.isArray(smartData.outcomes_types) ? smartData.outcomes_types.join(', ') : '',
            smartData.outcomes_effectiveness_score || 0,
            smartData.outcomes_completeness || 0,
            smartData.outcomes_specificity || 0,
            smartData.outcomes_actionability || 0,
            smartData.outcomes_measurability || 0,
            
            // ===== COMBINED ANALYSIS =====
            smartData.combined_analysis_session_overview_duration || 0,
            smartData.combined_analysis_session_overview_participants || 0,
            Array.isArray(smartData.combined_analysis_session_overview_main_topics) ? smartData.combined_analysis_session_overview_main_topics.join(', ') : '',
            smartData.combined_analysis_session_overview_overall_sentiment || '',
            smartData.combined_analysis_session_overview_engagement_level || '',
            
            // ===== FOLLOW UP RECOMMENDATIONS =====
            Array.isArray(smartData.follow_up_recommendations_immediate) ? smartData.follow_up_recommendations_immediate.join(', ') : '',
            Array.isArray(smartData.follow_up_recommendations_short_term) ? smartData.follow_up_recommendations_short_term.join(', ') : '',
            Array.isArray(smartData.follow_up_recommendations_long_term) ? smartData.follow_up_recommendations_long_term.join(', ') : '',
            Array.isArray(smartData.follow_up_recommendations_coach_recommendations) ? smartData.follow_up_recommendations_coach_recommendations.join(', ') : '',
            Array.isArray(smartData.follow_up_recommendations_student_recommendations) ? smartData.follow_up_recommendations_student_recommendations.join(', ') : '',
            
            // ===== QUALITY METRICS OVERALL =====
            smartData.quality_metrics_overall_score || 0,
            smartData.quality_metrics_data_quality_completeness || 0,
            smartData.quality_metrics_data_quality_accuracy || 0,
            smartData.quality_metrics_data_quality_consistency || 0,
            smartData.quality_metrics_data_quality_zoom_insights ? 'Yes' : 'No',
            smartData.quality_metrics_data_quality_transcript_analysis ? 'Yes' : 'No',
            smartData.quality_metrics_session_metrics_engagement || 0,
            smartData.quality_metrics_session_metrics_participation || 0,
            smartData.quality_metrics_session_metrics_interaction || 0,
            smartData.quality_metrics_coaching_metrics_effectiveness || 0,
            smartData.quality_metrics_coaching_metrics_techniques || 0,
            smartData.quality_metrics_coaching_metrics_responsiveness || 0,
            smartData.quality_metrics_student_metrics_progress || 0,
            smartData.quality_metrics_student_metrics_satisfaction || 0,
            smartData.quality_metrics_student_metrics_learning || 0,
            
            // ===== ZOOM INSIGHTS =====
            smartData.zoom_insights_summary || '',
            Array.isArray(smartData.zoom_insights_highlights) ? smartData.zoom_insights_highlights.join(', ') : '',
            JSON.stringify(smartData.zoom_insights_analytics || {}),
            smartData.zoom_insights_ai_summary || '',
            Array.isArray(smartData.zoom_insights_topics) ? smartData.zoom_insights_topics.join(', ') : '',
            Array.isArray(smartData.zoom_insights_action_items) ? smartData.zoom_insights_action_items.join(', ') : '',
            Array.isArray(smartData.zoom_insights_questions) ? smartData.zoom_insights_questions.join(', ') : '',
            smartData.zoom_insights_sentiment || '',
            smartData.zoom_insights_engagement || 0,
            Array.isArray(smartData.zoom_insights_breakthrough_moments) ? smartData.zoom_insights_breakthrough_moments.join(', ') : '',
            Array.isArray(smartData.zoom_insights_coaching_techniques) ? smartData.zoom_insights_coaching_techniques.join(', ') : '',
            smartData.zoom_insights_student_progress || '',
            Array.isArray(smartData.zoom_insights_errors) ? smartData.zoom_insights_errors.join(', ') : '',
            
            // ===== TRANSCRIPT INSIGHTS =====
            smartData.transcript_insights_summary || '',
            Array.isArray(smartData.transcript_insights_key_moments) ? smartData.transcript_insights_key_moments.join(', ') : '',
            JSON.stringify(smartData.transcript_insights_speaker_analysis || {}),
            Array.isArray(smartData.transcript_insights_topics) ? smartData.transcript_insights_topics.join(', ') : '',
            Array.isArray(smartData.transcript_insights_action_items) ? smartData.transcript_insights_action_items.join(', ') : '',
            Array.isArray(smartData.transcript_insights_questions) ? smartData.transcript_insights_questions.join(', ') : '',
            smartData.transcript_insights_sentiment || '',
            smartData.transcript_insights_engagement || 0,
            smartData.transcript_insights_coaching_insights || '',
            JSON.stringify(smartData.transcript_insights_emotional_journey || []),
            JSON.stringify(smartData.transcript_insights_conversation_patterns || []),
            smartData.transcript_insights_session_structure || '',
            Array.isArray(smartData.transcript_insights_breakthrough_moments) ? smartData.transcript_insights_breakthrough_moments.join(', ') : '',
            Array.isArray(smartData.transcript_insights_risk_factors) ? smartData.transcript_insights_risk_factors.join(', ') : '',
            Array.isArray(smartData.transcript_insights_success_predictors) ? smartData.transcript_insights_success_predictors.join(', ') : '',
            smartData.transcript_insights_metadata_total_duration || 0,
            smartData.transcript_insights_metadata_word_count || 0,
            smartData.transcript_insights_metadata_speaker_count || 0,
            smartData.transcript_insights_metadata_analyzed_at || '',
            
            // ===== OUTCOMES DETAILED =====
            Array.isArray(smartData.outcomes_outcomes) ? smartData.outcomes_outcomes.join(', ') : '',
            JSON.stringify(smartData.outcomes_quality_metrics || {}),
            smartData.outcomes_metadata_version || '2.0',
            smartData.outcomes_metadata_generated_at || '',
            smartData.outcomes_metadata_recording_id || '',
            smartData.outcomes_metadata_meeting_id || '',
            smartData.outcomes_metadata_meeting_uuid || '',
            smartData.outcomes_metadata_topic || '',
            smartData.outcomes_metadata_start_time || '',
            smartData.outcomes_metadata_duration || 0,
            smartData.outcomes_metadata_summary_total_outcomes || 0,
            Array.isArray(smartData.outcomes_metadata_summary_outcome_types) ? smartData.outcomes_metadata_summary_outcome_types.join(', ') : '',
            Array.isArray(smartData.outcomes_metadata_summary_outcome_categories) ? smartData.outcomes_metadata_summary_outcome_categories.join(', ') : '',
            smartData.outcomes_metadata_summary_status_breakdown_planned || 0,
            smartData.outcomes_metadata_summary_status_breakdown_in_progress || 0,
            smartData.outcomes_metadata_summary_status_breakdown_achieved || 0,
            smartData.outcomes_metadata_summary_status_breakdown_failed || 0,
            smartData.outcomes_metadata_summary_effectiveness_score || 0,
            Array.isArray(smartData.outcomes_metadata_summary_key_outcomes) ? smartData.outcomes_metadata_summary_key_outcomes.join(', ') : '',
            smartData.outcomes_metadata_quality_overall_score || 0,
            smartData.outcomes_metadata_quality_completeness || 0,
            smartData.outcomes_metadata_quality_specificity || 0,
            smartData.outcomes_metadata_quality_actionability || 0,
            smartData.outcomes_metadata_quality_measurability || 0,
            
            // ===== GENERATED FILES =====
            smartData.generated_files_summary || '',
            Array.isArray(smartData.generated_files_highlights) ? smartData.generated_files_highlights.join(', ') : '',
            Array.isArray(smartData.generated_files_action_items) ? smartData.generated_files_action_items.join(', ') : '',
            Array.isArray(smartData.generated_files_coaching_notes) ? smartData.generated_files_coaching_notes.join(', ') : '',
            smartData.generated_files_insights_path || '',
            smartData.generated_files_outcomes_path || '',
            smartData.generated_files_summary_path || '',
            smartData.generated_files_highlights_path || '',
            smartData.generated_files_action_items_path || '',
            smartData.generated_files_coaching_notes_path || '',
            
            // ===== UPLOAD METRICS =====
            smartData.files_uploaded_count || 0,
            smartData.total_upload_size || 0,
            smartData.upload_success ? 'Yes' : 'No',
            smartData.upload_duration_ms || 0,
            
            // ===== PROCESSING METADATA =====
            smartData.processing_id || '',
            smartData.insights_version || '2.0-smart',
            smartData.metadata_version || '2.0-smart',
            smartData.insights_metadata_version || '2.0-smart',
            smartData.insights_metadata_generated_at || '',
            smartData.insights_metadata_recording_id || '',
            smartData.insights_metadata_meeting_id || '',
            smartData.insights_metadata_meeting_uuid || '',
            smartData.insights_metadata_topic || '',
            smartData.insights_metadata_start_time || '',
            smartData.insights_metadata_duration || 0,
            smartData.insights_metadata_processing_version || '2.0-smart',
            
            // ===== NAME ANALYSIS DETAILED =====
            smartData.name_analysis_standardized_name || '',
            smartData.name_analysis_confidence || 0,
            smartData.name_analysis_method || '',
            smartData.name_analysis_details_coach || '',
            smartData.name_analysis_details_student || '',
            smartData.name_analysis_details_week || '',
            smartData.name_analysis_details_session_type || '',
            Array.isArray(smartData.name_analysis_details_name_variations) ? smartData.name_analysis_details_name_variations.join(', ') : '',
            Array.isArray(smartData.name_analysis_details_confidence_factors) ? smartData.name_analysis_details_confidence_factors.join(', ') : '',
            
            // ===== WEEK ANALYSIS DETAILED =====
            smartData.week_analysis_week_number || 0,
            smartData.week_analysis_confidence || 0,
            smartData.week_analysis_method || '',
            smartData.week_analysis_standardized_name || '',
            smartData.week_analysis_details_extracted_week || '',
            smartData.week_analysis_details_inferred_week || '',
            Array.isArray(smartData.week_analysis_details_confidence_factors) ? smartData.week_analysis_details_confidence_factors.join(', ') : '',
            Array.isArray(smartData.week_analysis_details_alternatives) ? smartData.week_analysis_details_alternatives.join(', ') : '',
            
            // ===== DOWNLOAD RESULT DETAILED =====
            smartData.download_result_folder_path || '',
            Array.isArray(smartData.download_result_downloaded_files) ? smartData.download_result_downloaded_files.join(', ') : '',
            smartData.download_result_organized_files || '',
            smartData.download_result_details_file_count || 0,
            smartData.download_result_details_total_size || 0,
            smartData.download_result_details_has_video ? 'Yes' : 'No',
            smartData.download_result_details_has_audio ? 'Yes' : 'No',
            smartData.download_result_details_has_transcript ? 'Yes' : 'No',
            
            // ===== INSIGHTS RESULT DETAILED =====
            smartData.insights_result_insights_path || '',
            smartData.insights_result_details_insights_version || '2.0-smart',
            smartData.insights_result_details_data_quality || '',
            smartData.insights_result_details_overall_score || 0,
            
            // ===== OUTCOMES RESULT DETAILED =====
            smartData.outcomes_result_outcomes_path || '',
            smartData.outcomes_result_details_outcomes_count || 0,
            Array.isArray(smartData.outcomes_result_details_outcome_types) ? smartData.outcomes_result_details_outcome_types.join(', ') : '',
            
            // ===== FILE GENERATION RESULT DETAILED =====
            Array.isArray(smartData.file_generation_result_files) ? smartData.file_generation_result_files.join(', ') : '',
            smartData.file_generation_result_details_files_generated || 0,
            Array.isArray(smartData.file_generation_result_details_file_types) ? smartData.file_generation_result_details_file_types.join(', ') : '',
            
            // ===== QUALITY RESULT DETAILED =====
            smartData.quality_result_metrics_overall_score || 0,
            smartData.quality_result_metrics_data_quality_completeness || 0,
            smartData.quality_result_metrics_data_quality_accuracy || 0,
            smartData.quality_result_metrics_data_quality_consistency || 0,
            smartData.quality_result_metrics_processing_quality_success_rate || 0,
            smartData.quality_result_metrics_processing_quality_error_rate || 0,
            smartData.quality_result_metrics_processing_quality_warning_rate || 0,
            smartData.quality_result_metrics_insights_quality_zoom_insights ? 'Yes' : 'No',
            smartData.quality_result_metrics_insights_quality_transcript_analysis ? 'Yes' : 'No',
            smartData.quality_result_metrics_insights_quality_outcomes_processing ? 'Yes' : 'No',
            smartData.quality_result_metrics_file_quality_files_generated || 0,
            smartData.quality_result_metrics_file_quality_expected_files || 0,
            smartData.quality_result_metrics_file_quality_completeness || 0,
            
            // ===== UPLOAD RESULT DETAILED =====
            smartData.upload_result_folder_id || '',
            smartData.upload_result_drive_link || '',
            smartData.upload_result_details_files_uploaded || 0,
            smartData.upload_result_details_total_size || 0,
            
            // ===== PROCESSING STEPS =====
            smartData.processing_steps_name_and_week_processing_success ? 'Yes' : 'No',
            smartData.processing_steps_name_and_week_processing_duration || 0,
            smartData.processing_steps_name_and_week_processing_details || '',
            smartData.processing_steps_file_download_and_organization_success ? 'Yes' : 'No',
            smartData.processing_steps_file_download_and_organization_duration || 0,
            smartData.processing_steps_file_download_and_organization_details || '',
            smartData.processing_steps_comprehensive_insights_generation_success ? 'Yes' : 'No',
            smartData.processing_steps_comprehensive_insights_generation_duration || 0,
            smartData.processing_steps_comprehensive_insights_generation_details || '',
            smartData.processing_steps_tangible_outcomes_processing_success ? 'Yes' : 'No',
            smartData.processing_steps_tangible_outcomes_processing_duration || 0,
            smartData.processing_steps_tangible_outcomes_processing_details || '',
            smartData.processing_steps_additional_file_generation_success ? 'Yes' : 'No',
            smartData.processing_steps_additional_file_generation_duration || 0,
            smartData.processing_steps_additional_file_generation_details || '',
            smartData.processing_steps_quality_assessment_success ? 'Yes' : 'No',
            smartData.processing_steps_quality_assessment_duration || 0,
            smartData.processing_steps_quality_assessment_details || '',
            smartData.processing_steps_google_drive_upload_success ? 'Yes' : 'No',
            smartData.processing_steps_google_drive_upload_duration || 0,
            smartData.processing_steps_google_drive_upload_details || '',
            
            // ===== DATA SOURCE =====
            smartData.data_source || 'zoom_cloud_processing',
            smartData.driveFolderId || '',
            smartData.driveLink || ''
        ];
    }
    
    /**
     * Check for duplicates in Tab 2 (Standardized)
     */
    async _isDuplicate(uuid, fingerprint) {
        const cacheKey = `duplicate:${uuid}:${fingerprint}`;
        
        // Check cache
        const cached = await this.cache.get(cacheKey);
        if (cached !== null) return cached;
        
        // Get existing IDs from Tab 2
        const existingIds = await this.getExistingStandardizedRecordings();
        const isDuplicate = existingIds.has(uuid) || existingIds.has(fingerprint);
        
        // Cache result
        await this.cache.set(cacheKey, isDuplicate, 3600);
        
        return isDuplicate;
    }
    
    /**
     * Get existing recording IDs from Tab 2 for deduplication
     */
    async getExistingStandardizedRecordings() {
        const cacheKey = 'sheets:existing-standardized-ids';
        
        // Check cache
        const cached = await this.cache.get(cacheKey);
        if (cached) return new Set(cached);
        
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.tabs.standardized.name}!A:B`
            });
            
            const values = response.data.values || [];
            const ids = [];
            
            // Skip header row
            for (let i = 1; i < values.length; i++) {
                if (values[i][0]) ids.push(values[i][0]); // UUID
                if (values[i][1]) ids.push(values[i][1]); // Fingerprint
            }
            
            // Cache for 5 minutes
            await this.cache.set(cacheKey, ids, 300);
            
            return new Set(ids);
            
        } catch (error) {
            this.logger.error('Failed to get existing standardized recordings', error);
            return new Set();
        }
    }

    /**
     * Check if a recording exists by UUID and return details if found
     */
    async checkRecordingExists(uuid) {
        const cacheKey = `recording:${uuid}`;
        
        // Check cache first
        const cached = await this.cache.get(cacheKey);
        if (cached) {
            return {
                exists: true,
                recording: cached
            };
        }
        
        try {
            // Get all recordings from standardized tab to search for UUID
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.tabs.standardized.name}!A:AX`
            });
            
            const values = response.data.values || [];
            
            // Skip header row, search for UUID in column A
            for (let i = 1; i < values.length; i++) {
                const row = values[i];
                if (row[0] === uuid) { // UUID is in column A
                    // Reconstruct recording data from row using standardized columns
                    const recording = {
                        uuid: row[0] || '',
                        fingerprint: row[1] || '',
                        recordingDate: row[2] || '',
                        rawName: row[3] || '',
                        standardizedName: row[4] || '',
                        nameConfidence: row[5] || '',
                        nameResolutionMethod: row[6] || '',
                        familyAccount: row[7] || '',
                        weekNumber: row[8] || '',
                        weekConfidence: row[9] || '',
                        weekInferenceMethod: row[10] || '',
                        hostEmail: row[11] || '',
                        hostName: row[12] || '',
                        meetingTopic: row[13] || '',
                        participants: row[14] || '',
                        participantCount: row[15] || '',
                        meetingId: row[16] || '',
                        duration: row[17] || '',
                        startTime: row[18] || '',
                        endTime: row[19] || '',
                        recordingType: row[20] || '',
                        fileSize: row[21] || '',
                        hasTranscript: row[22] || '',
                        transcriptQuality: row[23] || '',
                        speakerCount: row[24] || '',
                        primarySpeaker: row[25] || '',
                        speakingTimeDistribution: row[26] || '',
                        emotionalJourney: row[27] || '',
                        engagementScore: row[28] || '',
                        keyMoments: row[29] || '',
                        coachingTopics: row[30] || '',
                        coachingStyle: row[31] || '',
                        studentResponsePattern: row[32] || '',
                        interactionQuality: row[33] || '',
                        keyThemes: row[34] || '',
                        actionItems: row[35] || '',
                        challengesIdentified: row[36] || '',
                        breakthroughs: row[37] || '',
                        goalsSet: row[38] || '',
                        progressTracked: row[39] || '',
                        nextSteps: row[40] || '',
                        followUpRequired: row[41] || '',
                        driveFolder: row[42] || '',
                        driveFolderId: row[43] || '',
                        videoFileId: row[44] || '',
                        transcriptFileId: row[45] || '',
                        processedDate: row[46] || '',
                        processingVersion: row[47] || '',
                        dataSource: row[48] || '',
                        lastUpdated: row[49] || ''
                    };
                    
                    // Cache the recording
                    await this.cache.set(cacheKey, recording, 3600); // 1 hour
                    
                    return {
                        exists: true,
                        recording
                    };
                }
            }
            
            return {
                exists: false,
                recording: null
            };
            
        } catch (error) {
            this.logger.error('Failed to check if recording exists', error);
            return {
                exists: false,
                recording: null,
                error: error.message
            };
        }
    }
    
    /**
     * Get spreadsheet statistics from both tabs
     */
    async getSpreadsheetStats() {
        const cacheKey = 'sheets:stats';
        
        // Check cache
        const cached = await this.cache.get(cacheKey);
        if (cached) return cached;
        
        try {
            // Get raw tab count
            const rawResponse = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `'${this.tabs.raw.name}'!A:A`
            });
            const rawCount = (rawResponse.data.values?.length || 1) - 1;
            
            // Get standardized tab count
            const standardizedResponse = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `'${this.tabs.standardized.name}'!A:A`
            });
            const standardizedCount = (standardizedResponse.data.values?.length || 1) - 1;
            
            // Get additional stats from standardized tab
            const weekStats = await this._getWeekStats();
            const nameStats = await this._getNameStats();
            
            const stats = {
                success: true,
                rawRecordings: rawCount,
                standardizedRecordings: standardizedCount,
                processingRate: rawCount > 0 ? Math.round((standardizedCount / rawCount) * 100) : 0,
                weekDistribution: weekStats,
                topStudents: nameStats,
                lastUpdated: new Date().toISOString()
            };
            
            // Cache for 5 minutes
            await this.cache.set(cacheKey, stats, 300);
            
            return stats;
            
        } catch (error) {
            this.logger.error('Failed to get stats', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Get week distribution from standardized tab
     */
    async _getWeekStats() {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `'${this.tabs.standardized.name}'!I:I` // Week Number column
            });
            
            const values = response.data.values || [];
            const weekCounts = {};
            
            for (let i = 1; i < values.length; i++) {
                const week = values[i][0];
                if (week) {
                    weekCounts[week] = (weekCounts[week] || 0) + 1;
                }
            }
            
            return weekCounts;
            
        } catch (error) {
            return {};
        }
    }
    
    /**
     * Get name/student statistics from standardized tab
     */
    async _getNameStats() {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `'${this.tabs.standardized.name}'!E:E` // Standardized Name column
            });
            
            const values = response.data.values || [];
            const nameCounts = {};
            
            for (let i = 1; i < values.length; i++) {
                const name = values[i][0];
                if (name) {
                    nameCounts[name] = (nameCounts[name] || 0) + 1;
                }
            }
            
            // Get top 10 students
            return Object.entries(nameCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .reduce((acc, [name, count]) => {
                    acc[name] = count;
                    return acc;
                }, {});
            
        } catch (error) {
            return {};
        }
    }
    
    /**
     * Update cache with recording data
     */
    async _updateCache(smartData) {
        // Cache recording data
        await this.cache.set(
            `recording:${smartData.uuid}`,
            smartData,
            86400 // 24 hours
        );
        
        // Invalidate stats cache
        await this.cache.delete('sheets:stats');
        await this.cache.delete('sheets:standardized-ids');
    }
    
    /**
     * Helper methods
     */
    _generateFingerprint(uuid, date) {
        const data = `${uuid}-${date}`;
        return crypto.createHash('md5').update(data).digest('hex').substring(0, 16);
    }
    
    _generateUUID() {
        const bytes = crypto.randomBytes(16);
        bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 1
        
        const hex = bytes.toString('hex');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    }
    
    _formatDate(timestamp) {
        if (!timestamp) return '';
        try {
            return new Date(timestamp).toISOString().split('T')[0];
        } catch {
            return timestamp;
        }
    }
    
    _calculateEndTime(startTime, duration) {
        if (!startTime || !duration) return '';
        try {
            const start = new Date(startTime);
            const end = new Date(start.getTime() + (duration * 1000));
            return end.toISOString();
        } catch {
            return '';
        }
    }
    
    _bytesToMB(bytes) {
        return Math.round((bytes / 1024 / 1024) * 100) / 100;
    }
    
    /**
     * Convert UUID to Base64 format for Zoom API compatibility
     * @param {string} uuid - UUID string
     * @returns {string} Base64 encoded UUID
     */
    _convertUuidToBase64(uuid) {
        if (!uuid) return '';
        
        try {
            // Remove dashes if present
            const cleanUuid = uuid.replace(/-/g, '');
            
            // Convert hex to buffer
            const buffer = Buffer.from(cleanUuid, 'hex');
            
            // Convert to Base64
            return buffer.toString('base64');
        } catch (error) {
            this.logger.warn(`Failed to convert UUID to Base64: ${uuid}`, error);
            return uuid; // Return original if conversion fails
        }
    }
}

module.exports = { DualTabGoogleSheetsService };