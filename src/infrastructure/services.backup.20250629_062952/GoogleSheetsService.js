/**
 * Google Sheets Service - Smart Schema Implementation
 * 
 * Direct replacement for unified-spreadsheet-updater.js
 * Handles complete smart data schema with all enhanced fields
 */

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

class GoogleSheetsService {
    constructor({ config, eventBus, logger, cache, metricsCollector, nameStandardizer, weekInferencer, metadataExtractor, transcriptionAnalyzer }) {
        this.config = config;
        this.eventBus = eventBus || new EventBus();
        this.logger = logger || new Logger('GoogleSheetsService');
        this.cache = cache || new Cache();
        this.metrics = metricsCollector || new MetricsCollector();
        
        // Enhanced services for smart data (optional dependencies)
        this.nameStandardizer = nameStandardizer || null;
        this.weekInferencer = weekInferencer || null;
        this.metadataExtractor = metadataExtractor || null;
        this.transcriptionAnalyzer = transcriptionAnalyzer || null;
        
        // Google API clients
        this.auth = null;
        this.sheets = null;
        this.drive = null;
        
        // Spreadsheet configuration
        this.spreadsheetId = config.google.sheets.masterIndexSheetId;
        this.sheetName = 'Smart Schema Master Index';
        
        // Column mappings for smart schema
        this.columns = this._defineColumns();
        
        // Processing configuration
        this.batchSize = config.SHEETS_BATCH_SIZE || 100;
        this.rateLimitDelay = config.SHEETS_RATE_LIMIT_DELAY || 100;
        
        this._initialize();
    }
    
    _defineColumns() {
        return {
            // A-H: Core Identity & Name Resolution
            uuid: 'A',
            fingerprint: 'B',
            recordingDate: 'C',
            rawName: 'D',
            standardizedName: 'E',
            nameConfidence: 'F',
            nameResolutionMethod: 'G',
            familyAccount: 'H',
            
            // I-K: Smart Week Inference
            weekNumber: 'I',
            weekConfidence: 'J',
            weekInferenceMethod: 'K',
            
            // L-Q: Meeting Metadata
            hostEmail: 'L',
            hostName: 'M',
            meetingTopic: 'N',
            participants: 'O',
            participantCount: 'P',
            meetingId: 'Q',
            
            // R-V: Recording Details
            duration: 'R',
            startTime: 'S',
            endTime: 'T',
            recordingType: 'U',
            fileSize: 'V',
            
            // W-AD: Transcript Analysis
            hasTranscript: 'W',
            transcriptQuality: 'X',
            speakerCount: 'Y',
            primarySpeaker: 'Z',
            speakingTimeDistribution: 'AA',
            emotionalJourney: 'AB',
            engagementScore: 'AC',
            keyMoments: 'AD',
            
            // AE-AH: Coaching Insights
            coachingTopics: 'AE',
            coachingStyle: 'AF',
            studentResponsePattern: 'AG',
            interactionQuality: 'AH',
            
            // AI-AL: AI-Generated Insights
            keyThemes: 'AI',
            actionItems: 'AJ',
            challengesIdentified: 'AK',
            breakthroughs: 'AL',
            
            // AM-AP: Tangible Outcomes
            goalsSet: 'AM',
            progressTracked: 'AN',
            nextSteps: 'AO',
            followUpRequired: 'AP',
            
            // AQ-AT: File Management
            driveFolder: 'AQ',
            driveFolderId: 'AR',
            videoFileId: 'AS',
            transcriptFileId: 'AT',
            
            // AU-AX: Processing Metadata
            processedDate: 'AU',
            processingVersion: 'AV',
            dataSource: 'AW',
            lastUpdated: 'AX'
        };
    }
    
    async _initialize() {
        try {
            // Check if we have credentials in the expected format
            if (!this.config.google.clientEmail || !this.config.google.privateKey) {
                throw new Error('Missing Google credentials: clientEmail and privateKey are required');
            }

            // Create credentials object from config
            const credentials = {
                client_email: this.config.google.clientEmail,
                private_key: this.config.google.privateKey,
                type: 'service_account'
            };
            
            // Debug: Log credential structure (without sensitive data)
            this.logger.info('Credential format detected', {
                hasClientEmail: !!credentials.client_email,
                hasPrivateKey: !!credentials.private_key,
                hasType: !!credentials.type
            });
            
            // Service account credentials
            this.auth = new google.auth.GoogleAuth({
                credentials,
                scopes: [
                    'https://www.googleapis.com/auth/spreadsheets',
                    'https://www.googleapis.com/auth/drive.readonly'
                ]
            });
            
            // Get the client
            const authClient = await this.auth.getClient();
            this.sheets = google.sheets({ version: 'v4', auth: authClient });
            this.drive = google.drive({ version: 'v3', auth: authClient });
            
            // Initialize spreadsheet
            await this._initializeSpreadsheet();
            
            this.logger.info('Google Sheets Service initialized successfully');
            this.eventBus.emit('service:initialized', { service: 'GoogleSheetsService' });
            
        } catch (error) {
            this.logger.error('Failed to initialize Google Sheets Service', error);
            throw new Error(`Google Sheets initialization failed: ${error.message}`);
        }
    }
    
    async _initializeSpreadsheet() {
        try {
            // Verify access
            const spreadsheet = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });
            
            this.logger.info(`Connected to spreadsheet: ${spreadsheet.data.properties.title}`);
            
            // Check if our sheet exists
            const sheets = spreadsheet.data.sheets || [];
            const sheetExists = sheets.some(s => s.properties.title === this.sheetName);
            
            if (!sheetExists) {
                // Create new sheet
                await this._createSheet();
                await this._setupHeaders();
                this.logger.info(`Created new sheet: ${this.sheetName}`);
            } else {
                // Verify headers are correct
                await this._verifyHeaders();
            }
            
        } catch (error) {
            throw new Error(`Cannot initialize spreadsheet: ${error.message}`);
        }
    }
    
    async _createSheet() {
        const requests = [{
            addSheet: {
                properties: {
                    title: this.sheetName,
                    gridProperties: {
                        rowCount: 10000,
                        columnCount: 50
                    }
                }
            }
        }];
        
        await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            requestBody: { requests }
        });
    }
    
    async _setupHeaders() {
        const headers = [
            // Core Identity & Name
            'UUID', 'Fingerprint', 'Recording Date', 
            'Raw Name', 'Standardized Name', 'Name Confidence %', 'Name Resolution Method', 'Family Account',
            
            // Week Inference
            'Week Number', 'Week Confidence %', 'Week Inference Method',
            
            // Meeting Metadata
            'Host Email', 'Host Name', 'Meeting Topic', 'Participants', 'Participant Count', 'Meeting ID',
            
            // Recording Details
            'Duration (min)', 'Start Time', 'End Time', 'Recording Type', 'File Size (MB)',
            
            // Transcript Analysis
            'Has Transcript', 'Transcript Quality', 'Speaker Count', 'Primary Speaker', 
            'Speaking Time Distribution', 'Emotional Journey', 'Engagement Score', 'Key Moments',
            
            // Coaching Insights
            'Coaching Topics', 'Coaching Style', 'Student Response Pattern', 'Interaction Quality',
            
            // AI Insights
            'Key Themes', 'Action Items', 'Challenges Identified', 'Breakthroughs',
            
            // Outcomes
            'Goals Set', 'Progress Tracked', 'Next Steps', 'Follow-up Required',
            
            // File Management
            'Drive Folder', 'Drive Folder ID', 'Video File ID', 'Transcript File ID',
            
            // Metadata
            'Processed Date', 'Processing Version', 'Data Source', 'Last Updated'
        ];
        
        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `${this.sheetName}!A1:AX1`,
            valueInputOption: 'RAW',
            requestBody: {
                values: [headers]
            }
        });
        
        // Format headers
        await this._formatHeaders();
    }
    
    /**
     * Main method to update spreadsheet with processed recording
     */
    async updateMasterSpreadsheet(processedRecording, source = 'Reprocessing') {
        const startTime = Date.now();
        
        try {
            if (!processedRecording || !processedRecording.processed) {
                throw new ValidationError('Invalid processed recording data');
            }
            
            const { processed, original } = processedRecording;
            
            // Generate comprehensive smart data
            const smartData = await this._generateSmartData(processed, original, source);
            
            // Check for duplicates
            if (await this._isDuplicate(smartData.uuid, smartData.fingerprint)) {
                this.logger.info(`Skipping duplicate: ${smartData.standardizedName}`);
                // Metrics disabled
                return {
                    success: true,
                    duplicate: true,
                    standardizedName: smartData.standardizedName
                };
            }
            
            // Prepare row data
            const rowData = this._prepareRowData(smartData);
            
            // Append to sheet
            await this._appendRow(rowData);
            
            // Update cache
            await this._updateCache(smartData);
            
            // Emit event
            this.eventBus.emit('spreadsheet:updated', {
                uuid: smartData.uuid,
                standardizedName: smartData.standardizedName,
                weekNumber: smartData.weekNumber,
                source
            });
            
            // Metrics disabled
            // this.metrics.timing('sheets.update.duration', Date.now() - startTime);
            
            this.logger.info(`Successfully updated: ${smartData.standardizedName}`);
            
            return {
                success: true,
                duplicate: false,
                folderId: smartData.driveFolderId,
                standardizedName: smartData.standardizedName,
                source,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            this.logger.error('Failed to update spreadsheet', error);
            // Metrics disabled
            
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
     * Batch update multiple recordings
     */
    async updateMasterSpreadsheetBatch(processedRecordings, source = 'Reprocessing') {
        const startTime = Date.now();
        
        if (!Array.isArray(processedRecordings) || processedRecordings.length === 0) {
            return {
                total: 0,
                successful: 0,
                failed: 0,
                duplicates: 0,
                errors: [],
                success: true,
                successRate: 100
            };
        }
        
        this.logger.info(`Starting batch update for ${processedRecordings.length} recordings`);
        
        const results = {
            total: processedRecordings.length,
            successful: 0,
            failed: 0,
            duplicates: 0,
            errors: []
        };
        
        // Process in batches
        for (let i = 0; i < processedRecordings.length; i += this.batchSize) {
            const batch = processedRecordings.slice(i, i + this.batchSize);
            const batchNum = Math.floor(i / this.batchSize) + 1;
            const totalBatches = Math.ceil(processedRecordings.length / this.batchSize);
            
            this.logger.info(`Processing batch ${batchNum}/${totalBatches}`);
            
            const batchRows = [];
            const processedData = [];
            
            // Generate smart data for each recording
            for (const recording of batch) {
                try {
                    const smartData = await this._generateSmartData(
                        recording.processed,
                        recording.original,
                        source
                    );
                    
                    // Check duplicate
                    if (await this._isDuplicate(smartData.uuid, smartData.fingerprint)) {
                        results.duplicates++;
                        continue;
                    }
                    
                    batchRows.push(this._prepareRowData(smartData));
                    processedData.push(smartData);
                    
                } catch (error) {
                    results.failed++;
                    results.errors.push({
                        recording: recording.processed?.standardizedName || 'Unknown',
                        error: error.message
                    });
                }
            }
            
            // Batch append
            if (batchRows.length > 0) {
                try {
                    await this._appendRows(batchRows);
                    results.successful += batchRows.length;
                    
                    // Update cache for each
                    for (const data of processedData) {
                        await this._updateCache(data);
                    }
                    
                    // Emit events
                    processedData.forEach(data => {
                        this.eventBus.emit('spreadsheet:updated', {
                            uuid: data.uuid,
                            standardizedName: data.standardizedName,
                            weekNumber: data.weekNumber,
                            source
                        });
                    });
                    
                } catch (error) {
                    results.failed += batchRows.length;
                    results.errors.push({
                        batch: batchNum,
                        error: error.message
                    });
                }
            }
            
            // Rate limiting
            if (i + this.batchSize < processedRecordings.length) {
                await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
            }
        }
        
        results.success = results.failed === 0;
        results.successRate = Math.round((results.successful / results.total) * 100);
        
        // this.metrics.timing('sheets.batch.duration', Date.now() - startTime);
        // this.metrics.gauge('sheets.batch.size', processedRecordings.length);
        
        this.logger.info(`Batch complete: ${results.successful} successful, ${results.duplicates} duplicates, ${results.failed} failed`);
        
        return results;
    }
    
    /**
     * Generate comprehensive smart data using all enhanced services
     */
    async _generateSmartData(processed, original, source) {
        // Get enhanced name analysis
        const nameAnalysis = await this.nameStandardizer.standardizeName(
            processed.standardizedName || original.topic || original.originalName || ''
        );
        
        // Get smart week inference
        const weekAnalysis = await this.weekInferencer.inferWeek({
            timestamp: original.start_time,
            metadata: original,
            folderPath: processed.folderId,
            recordingName: nameAnalysis.standardizedName
        });
        
        // Get enhanced metadata
        const metadata = await this.metadataExtractor.extractMetadata(original);
        
        // Get transcript analysis if available
        let transcriptAnalysis = {};
        if (processed.analysis?.transcript || original.transcript_file_id) {
            transcriptAnalysis = await this.transcriptionAnalyzer.analyzeTranscript(
                processed.analysis?.transcript?.content || '',
                {
                    recordingId: original.uuid,
                    studentName: nameAnalysis.standardizedName
                }
            );
        }
        
        // Generate unique identifiers
        const uuid = processed.uuid || original.uuid || original.id || this._generateUUID();
        const fingerprint = this._generateFingerprint(uuid, original.start_time || '');
        
        return {
            // Core identifiers
            uuid,
            fingerprint,
            recordingDate: this._formatDate(original.start_time),
            
            // Name resolution
            rawName: original.topic || original.originalName || '',
            standardizedName: nameAnalysis.standardizedName,
            nameConfidence: nameAnalysis.confidence,
            nameResolutionMethod: nameAnalysis.method,
            familyAccount: nameAnalysis.isFamilyAccount,
            
            // Week inference
            weekNumber: weekAnalysis.weekNumber,
            weekConfidence: weekAnalysis.confidence,
            weekInferenceMethod: weekAnalysis.method,
            
            // Meeting metadata
            hostEmail: metadata.hostEmail || original.host_email || '',
            hostName: metadata.hostName || '',
            meetingTopic: metadata.topic || original.topic || '',
            participants: metadata.participants || [],
            participantCount: metadata.participants?.length || 0,
            meetingId: original.meeting_id || original.id || '',
            
            // Recording details
            duration: Math.round((original.duration || 0) / 60), // minutes
            startTime: original.start_time || '',
            endTime: this._calculateEndTime(original.start_time, original.duration),
            recordingType: original.recording_type || 'cloud_recording',
            fileSize: this._bytesToMB(original.file_size || 0),
            
            // Transcript analysis
            hasTranscript: !!transcriptAnalysis.content || !!processed.analysis?.transcript,
            transcriptQuality: transcriptAnalysis.quality || 'N/A',
            speakerCount: transcriptAnalysis.speakers?.length || 0,
            primarySpeaker: transcriptAnalysis.primarySpeaker?.name || '',
            speakingTimeDistribution: transcriptAnalysis.speakingDistribution || {},
            emotionalJourney: transcriptAnalysis.emotionalJourney || [],
            engagementScore: transcriptAnalysis.engagementScore || 0,
            keyMoments: transcriptAnalysis.keyMoments || [],
            
            // Coaching insights
            coachingTopics: transcriptAnalysis.topics || processed.insights?.themes || [],
            coachingStyle: transcriptAnalysis.coachingStyle || '',
            studentResponsePattern: transcriptAnalysis.studentPattern || '',
            interactionQuality: transcriptAnalysis.interactionQuality || '',
            
            // AI insights
            keyThemes: processed.insights?.themes || [],
            actionItems: processed.insights?.actionItems || [],
            challengesIdentified: processed.insights?.challenges || [],
            breakthroughs: processed.insights?.breakthroughs || [],
            
            // Outcomes
            goalsSet: processed.outcomes?.goals || [],
            progressTracked: processed.outcomes?.progress || '',
            nextSteps: processed.outcomes?.nextSteps || [],
            followUpRequired: processed.outcomes?.followUpRequired || false,
            
            // File management
            driveFolder: processed.folderName || '',
            driveFolderId: processed.folderId || '',
            videoFileId: processed.videoFileId || original.download_url || '',
            transcriptFileId: processed.transcriptFileId || original.transcript_file_id || '',
            
            // Processing metadata
            processedDate: new Date().toISOString(),
            processingVersion: '2.0-smart',
            dataSource: source,
            lastUpdated: new Date().toISOString()
        };
    }
    
    /**
     * Prepare row data for spreadsheet
     */
    _prepareRowData(smartData) {
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
            
            // Processing Metadata
            smartData.processedDate,
            smartData.processingVersion,
            smartData.dataSource,
            smartData.lastUpdated
        ];
    }
    
    /**
     * Check for duplicate recordings
     */
    async _isDuplicate(uuid, fingerprint) {
        const cacheKey = `duplicate:${uuid}:${fingerprint}`;
        
        // Check cache
        const cached = await this.cache.get(cacheKey);
        if (cached !== null) return cached;
        
        // Get existing IDs
        const existingIds = await this.getExistingRecordings();
        const isDuplicate = existingIds.has(uuid) || existingIds.has(fingerprint);
        
        // Cache result
        await this.cache.set(cacheKey, isDuplicate, 3600);
        
        return isDuplicate;
    }
    
    /**
     * Get existing recording IDs for deduplication
     */
    async getExistingRecordings() {
        const cacheKey = 'sheets:existing-ids';
        
        // Check cache
        const cached = await this.cache.get(cacheKey);
        if (cached) return new Set(cached);
        
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.sheetName}!A:B`
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
            this.logger.error('Failed to get existing recordings', error);
            return new Set();
        }
    }
    
    /**
     * Append single row to spreadsheet
     */
    async _appendRow(rowData) {
        await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.spreadsheetId,
            range: `${this.sheetName}!A:AX`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            requestBody: {
                values: [rowData]
            }
        });
    }
    
    /**
     * Append multiple rows to spreadsheet
     */
    async _appendRows(rowsData) {
        await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.spreadsheetId,
            range: `${this.sheetName}!A:AX`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            requestBody: {
                values: rowsData
            }
        });
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
        await this.cache.delete('sheets:existing-ids');
    }
    
    /**
     * Get spreadsheet statistics
     */
    async getSpreadsheetStats() {
        const cacheKey = 'sheets:stats';
        
        // Check cache
        const cached = await this.cache.get(cacheKey);
        if (cached) return cached;
        
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.sheetName}!A:A`
            });
            
            const totalRows = (response.data.values?.length || 1) - 1; // Subtract header
            
            // Get additional stats
            const weekStats = await this._getWeekStats();
            const nameStats = await this._getNameStats();
            
            const stats = {
                success: true,
                totalRecordings: totalRows,
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
     * Get week distribution statistics
     */
    async _getWeekStats() {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.sheetName}!I:I` // Week Number column
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
     * Get name/student statistics
     */
    async _getNameStats() {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.sheetName}!E:E` // Standardized Name column
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
     * Check for duplicates (convenience method)
     */
    async checkForDuplicates(recordingData) {
        const uuid = recordingData.uuid || recordingData.id;
        const fingerprint = this._generateFingerprint(uuid, recordingData.start_time || '');
        
        const isDuplicate = await this._isDuplicate(uuid, fingerprint);
        const existingIds = await this.getExistingRecordings();
        
        return {
            success: true,
            isDuplicate,
            uuid,
            fingerprint,
            existingCount: existingIds.size
        };
    }
    
    /**
     * Format headers with styling
     */
    async _formatHeaders() {
        const sheetId = await this._getSheetId(this.sheetName);
        
        const requests = [
            {
                repeatCell: {
                    range: {
                        sheetId: sheetId,
                        startRowIndex: 0,
                        endRowIndex: 1
                    },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: { red: 0.1, green: 0.1, blue: 0.4 },
                            textFormat: {
                                foregroundColor: { red: 1, green: 1, blue: 1 },
                                bold: true,
                                fontSize: 11
                            }
                        }
                    },
                    fields: 'userEnteredFormat(backgroundColor,textFormat)'
                }
            },
            {
                updateDimensionProperties: {
                    range: {
                        sheetId: sheetId,
                        dimension: 'ROWS',
                        startIndex: 0,
                        endIndex: 1
                    },
                    properties: {
                        pixelSize: 35
                    },
                    fields: 'pixelSize'
                }
            }
        ];
        
        await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            requestBody: { requests }
        });
    }
    
    async _verifyHeaders() {
        // Optional: Implement header verification logic
        // For now, we'll skip this since we're reprocessing everything
    }
    
    async _getSheetId(sheetName) {
        const response = await this.sheets.spreadsheets.get({
            spreadsheetId: this.spreadsheetId
        });
        
        const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
        return sheet ? sheet.properties.sheetId : null;
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
            // Get all recordings to search for UUID
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.sheetName}!A:AX`
            });
            
            const values = response.data.values || [];
            
            // Skip header row, search for UUID in column A
            for (let i = 1; i < values.length; i++) {
                const row = values[i];
                if (row[0] === uuid) { // UUID is in column A
                    // Reconstruct recording data from row
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
}

module.exports = { GoogleSheetsService };