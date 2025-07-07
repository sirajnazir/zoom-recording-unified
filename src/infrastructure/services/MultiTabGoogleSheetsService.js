// src/infrastructure/services/MultiTabGoogleSheetsService.js
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
} = require('../../shared/errors/index.js');

/**
 * Enhanced Google Sheets Service that uses separate tab pairs for each data source:
 * - Zoom Cloud API: Raw & Standardized tabs
 * - Webhooks: Raw & Standardized tabs  
 * - Google Drive Import: Raw & Standardized tabs
 */
class MultiTabGoogleSheetsService {
    constructor({ config, eventBus, logger, cache, metricsCollector, nameStandardizer, weekInferencer, metadataExtractor, transcriptionAnalyzer }) {
        this.config = config;
        this.eventBus = eventBus || new EventBus();
        this.logger = logger || new Logger('MultiTabGoogleSheetsService');
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
        
        // Define all 6 tabs (3 pairs for 3 data sources)
        this.tabs = {
            // Legacy tabs (for backward compatibility)
            raw: {
                name: 'Raw Master Index',
                gid: 0,
                columns: this._defineRawColumns(),
                dataSource: 'legacy'
            },
            standardized: {
                name: 'Standardized Master Index', 
                gid: 674892161,
                columns: this._defineStandardizedColumns(),
                dataSource: 'legacy'
            },
            
            // Zoom Cloud API tabs
            zoomRaw: {
                name: 'Zoom API - Raw',
                gid: null, // Will be created
                columns: this._defineRawColumns(),
                dataSource: 'zoom-api'
            },
            zoomStandardized: {
                name: 'Zoom API - Standardized',
                gid: null, // Will be created
                columns: this._defineStandardizedColumns(),
                dataSource: 'zoom-api'
            },
            
            // Webhook tabs
            webhookRaw: {
                name: 'Webhook - Raw',
                gid: null, // Will be created
                columns: this._defineRawColumns(),
                dataSource: 'webhook'
            },
            webhookStandardized: {
                name: 'Webhook - Standardized',
                gid: null, // Will be created
                columns: this._defineStandardizedColumns(),
                dataSource: 'webhook'
            },
            
            // Google Drive Import tabs
            driveRaw: {
                name: 'Drive Import - Raw',
                gid: null, // Will be created
                columns: this._defineRawColumns(),
                dataSource: 'google-drive'
            },
            driveStandardized: {
                name: 'Drive Import - Standardized',
                gid: null, // Will be created
                columns: this._defineStandardizedColumns(),
                dataSource: 'google-drive'
            }
        };
        
        // Map data sources to their tab pairs
        this.dataSourceTabMap = {
            'zoom-api': { raw: 'zoomRaw', standardized: 'zoomStandardized' },
            'webhook': { raw: 'webhookRaw', standardized: 'webhookStandardized' },
            'google-drive': { raw: 'driveRaw', standardized: 'driveStandardized' },
            'Google Drive Import': { raw: 'driveRaw', standardized: 'driveStandardized' },
            // Legacy mapping for backward compatibility
            'batch': { raw: 'raw', standardized: 'standardized' },
            'unknown': { raw: 'raw', standardized: 'standardized' }
        };
        
        // Processing configuration
        this.batchSize = config.SHEETS_BATCH_SIZE || 100;
        this.rateLimitDelay = config.SHEETS_RATE_LIMIT_DELAY || 100;
        
        // Track initialization state
        this.isInitialized = false;
        this.initializationPromise = this._initialize();
    }
    
    /**
     * Initialize the service and ensure all tabs exist
     */
    async _initialize() {
        try {
            await this._setupAuth();
            await this._ensureAllTabsExist();
            this.isInitialized = true;
            this.logger.info('MultiTabGoogleSheetsService initialized with 6 tabs');
        } catch (error) {
            this.logger.error('Failed to initialize MultiTabGoogleSheetsService', error);
            throw error;
        }
    }
    
    /**
     * Ensure the service is initialized before operations
     */
    async ensureInitialized() {
        if (!this.isInitialized) {
            await this.initializationPromise;
        }
    }
    
    /**
     * Ensure all required tabs exist in the spreadsheet
     */
    async _ensureAllTabsExist() {
        try {
            // Get current spreadsheet metadata
            const response = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId,
                includeGridData: false
            });
            
            const existingSheets = response.data.sheets || [];
            const existingSheetNames = existingSheets.map(sheet => sheet.properties.title);
            const existingSheetMap = new Map(
                existingSheets.map(sheet => [sheet.properties.title, sheet.properties.sheetId])
            );
            
            // Check which tabs need to be created
            const tabsToCreate = [];
            for (const [key, tab] of Object.entries(this.tabs)) {
                if (existingSheetNames.includes(tab.name)) {
                    // Tab exists, update its GID
                    this.tabs[key].gid = existingSheetMap.get(tab.name);
                    this.logger.info(`Found existing tab: ${tab.name} (GID: ${this.tabs[key].gid})`);
                } else if (tab.gid === null) {
                    // New tab needs to be created
                    tabsToCreate.push({ key, tab });
                }
            }
            
            // Create missing tabs
            if (tabsToCreate.length > 0) {
                await this._createMissingTabs(tabsToCreate);
            }
            
            // Ensure headers are set for all tabs
            await this._ensureAllHeaders();
            
        } catch (error) {
            this.logger.error('Failed to ensure all tabs exist', error);
            throw error;
        }
    }
    
    /**
     * Create missing tabs in the spreadsheet
     */
    async _createMissingTabs(tabsToCreate) {
        this.logger.info(`Creating ${tabsToCreate.length} new tabs`);
        
        const requests = tabsToCreate.map(({ tab }) => ({
            addSheet: {
                properties: {
                    title: tab.name,
                    gridProperties: {
                        rowCount: 10000,
                        columnCount: 50
                    }
                }
            }
        }));
        
        try {
            const response = await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                requestBody: {
                    requests
                }
            });
            
            // Update GIDs for newly created tabs
            const newSheets = response.data.replies;
            tabsToCreate.forEach(({ key }, index) => {
                this.tabs[key].gid = newSheets[index].addSheet.properties.sheetId;
                this.logger.info(`Created tab: ${this.tabs[key].name} (GID: ${this.tabs[key].gid})`);
            });
            
        } catch (error) {
            this.logger.error('Failed to create tabs', error);
            throw error;
        }
    }
    
    /**
     * Ensure all tabs have proper headers
     */
    async _ensureAllHeaders() {
        for (const [key, tab] of Object.entries(this.tabs)) {
            try {
                await this._ensureHeaders(key);
            } catch (error) {
                this.logger.error(`Failed to ensure headers for tab: ${tab.name}`, error);
            }
        }
    }
    
    /**
     * Add or update recording with automatic data source detection
     */
    async addRecording(recordingData, source = 'unknown') {
        try {
            await this.ensureInitialized();
            // Determine which tab pair to use based on data source
            const normalizedSource = this._normalizeDataSource(source, recordingData);
            const tabPair = this.dataSourceTabMap[normalizedSource] || this.dataSourceTabMap['unknown'];
            
            this.logger.info(`Adding recording to ${normalizedSource} tabs (${tabPair.raw}, ${tabPair.standardized})`);
            this.logger.info(`Recording data: UUID=${recordingData.uuid}, Topic=${recordingData.topic}, StandardizedName=${recordingData.standardizedName || recordingData.processedData?.standardizedName}`);
            
            // Check for existing recording in the appropriate tabs
            const existingRow = await this._findExistingRecording(
                recordingData.uuid || recordingData.id,
                tabPair.raw
            );
            
            if (existingRow) {
                // Update existing recording
                await this._updateRawRecording(existingRow, recordingData, tabPair.raw);
                await this._updateStandardizedRecording(existingRow, recordingData, source, tabPair.standardized);
                
                this.eventBus.emit('recording.updated', {
                    uuid: recordingData.uuid,
                    source: normalizedSource,
                    tabs: tabPair
                });
                
                return { action: 'updated', row: existingRow, tabs: tabPair };
            } else {
                // Add new recording
                await this._addRawRecording(recordingData, tabPair.raw);
                await this._addStandardizedRecording(recordingData, source, tabPair.standardized);
                
                this.eventBus.emit('recording.added', {
                    uuid: recordingData.uuid,
                    source: normalizedSource,
                    tabs: tabPair
                });
                
                return { action: 'added', tabs: tabPair };
            }
        } catch (error) {
            this.logger.error('Failed to add/update recording', error);
            throw new GoogleSheetsError('Failed to add/update recording', error);
        }
    }
    
    /**
     * Normalize data source to match our mapping
     */
    _normalizeDataSource(source, recordingData) {
        // Check explicit source
        if (source === 'webhook' || recordingData.source === 'webhook') {
            return 'webhook';
        }
        if (source === 'google-drive' || 
            source === 'Google Drive Import' || 
            source === 'Google Drive Import - Full Pipeline' ||
            recordingData.dataSource === 'google-drive' ||
            recordingData.dataSource === 'Google Drive Import') {
            return 'google-drive';
        }
        if (source === 'zoom-api' || source === 'batch') {
            return 'zoom-api';
        }
        
        // Try to infer from data structure
        if (recordingData.webhook_received_at) {
            return 'webhook';
        }
        if (recordingData.driveFileId || recordingData.googleDriveImport) {
            return 'google-drive';
        }
        
        // Default to zoom-api for batch processing
        return 'zoom-api';
    }
    
    /**
     * Get all recordings from a specific data source
     */
    async getRecordingsBySource(dataSource) {
        try {
            await this.ensureInitialized();
            const normalizedSource = this._normalizeDataSource(dataSource, {});
            const tabPair = this.dataSourceTabMap[normalizedSource];
            
            if (!tabPair) {
                throw new Error(`Unknown data source: ${dataSource}`);
            }
            
            const standardizedTab = this.tabs[tabPair.standardized];
            const range = `'${standardizedTab.name}'!A2:BZ`;
            
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range
            });
            
            const rows = response.data.values || [];
            return rows.map(row => this._rowToRecordingObject(row, standardizedTab.columns));
            
        } catch (error) {
            this.logger.error(`Failed to get recordings for source: ${dataSource}`, error);
            throw error;
        }
    }
    
    /**
     * Get summary statistics for all data sources
     */
    async getDataSourceStats() {
        const stats = {};
        
        for (const [source, tabPair] of Object.entries(this.dataSourceTabMap)) {
            if (source === 'unknown' || source === 'batch') continue;
            
            try {
                const recordings = await this.getRecordingsBySource(source);
                stats[source] = {
                    total: recordings.length,
                    lastUpdated: recordings.length > 0 ? 
                        Math.max(...recordings.map(r => new Date(r.lastUpdated || 0))) : null
                };
            } catch (error) {
                stats[source] = { total: 0, error: error.message };
            }
        }
        
        return stats;
    }
    
    // Copy all methods from DualTabGoogleSheetsService
    // (I'll include the key methods here, the rest remain the same)
    
    /**
     * Define columns for Raw tabs (same for all sources)
     */
    _defineRawColumns() {
        return {
            uuid: 'A',
            meetingId: 'B',
            topic: 'C',
            startTime: 'D',
            endTime: 'E',
            duration: 'F',
            hostEmail: 'G',
            hostName: 'H',
            participantCount: 'I',
            recordingType: 'J',
            fileSize: 'K',
            downloadUrl: 'L',
            status: 'M',
            createdAt: 'N',
            lastModified: 'O',
            dataSource: 'P' // Added to track source in raw data
        };
    }
    
    /**
     * Define columns for Standardized tabs (same for all sources)
     */
    _defineStandardizedColumns() {
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
            
            // AU-AY: Processing Metadata
            processedDate: 'AU',
            processingVersion: 'AV',
            dataSource: 'AW',
            lastUpdated: 'AX',
            driveLink: 'AY'
        };
    }
    
    // Include all the helper methods from DualTabGoogleSheetsService
    // (Authentication, data transformation, etc.)
    async _setupAuth() {
        try {
            // Use the same authentication approach as DualTabGoogleSheetsService
            let authClient;
            
            // Check if we have parsed service account credentials
            if (this.config.google?.serviceAccountJson) {
                // Use parsed service account JSON
                this.auth = new google.auth.GoogleAuth({
                    credentials: this.config.google.serviceAccountJson,
                    scopes: [
                        'https://www.googleapis.com/auth/spreadsheets',
                        'https://www.googleapis.com/auth/drive'
                    ]
                });
                authClient = await this.auth.getClient();
            } else if (this.config.google?.clientEmail && this.config.google?.privateKey) {
                // Use individual credentials
                authClient = new google.auth.JWT({
                    email: this.config.google.clientEmail,
                    key: this.config.google.privateKey,
                    scopes: [
                        'https://www.googleapis.com/auth/spreadsheets',
                        'https://www.googleapis.com/auth/drive'
                    ]
                });
                await authClient.authorize();
            } else {
                // Try default application credentials
                this.auth = new google.auth.GoogleAuth({
                    scopes: [
                        'https://www.googleapis.com/auth/spreadsheets',
                        'https://www.googleapis.com/auth/drive'
                    ]
                });
                authClient = await this.auth.getClient();
            }
            
            // Initialize API clients
            this.sheets = google.sheets({ version: 'v4', auth: authClient });
            this.drive = google.drive({ version: 'v3', auth: authClient });
            
            this.logger.info('Google APIs authenticated successfully');
        } catch (error) {
            this.logger.error('Failed to setup Google auth', error);
            throw new Error(`Authentication failed: ${error.message}`);
        }
    }
    
    /**
     * Add raw recording data to the appropriate tab
     */
    async _addRawRecording(rawData, tabKey) {
        const tab = this.tabs[tabKey];
        const range = `'${tab.name}'!A:O`;
        
        const values = [[
            rawData.uuid || rawData.id,
            rawData.meeting_id || rawData.id,
            rawData.topic || '',
            rawData.start_time || '',
            this._calculateEndTime(rawData.start_time, rawData.duration),
            rawData.duration || 0,
            rawData.host_email || '',
            rawData.host_name || this._extractHostName(rawData.host_email),
            rawData.participant_count || 0,
            rawData.recording_type || 'cloud_recording',
            rawData.total_size || rawData.file_size || 0,
            rawData.share_url || rawData.download_url || '',
            rawData.status || 'completed',
            new Date().toISOString(),
            new Date().toISOString(),
            rawData.source || rawData.dataSource || 'unknown'
        ]];
        
        await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.spreadsheetId,
            range,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            requestBody: { values }
        });
    }
    
    /**
     * Add standardized recording data to the appropriate tab
     */
    async _addStandardizedRecording(recordingData, source, tabKey) {
        try {
            const tab = this.tabs[tabKey];
            const smartData = await this._generateSmartData(recordingData, source);
            const values = [this._smartDataToRow(smartData)];
            
            this.logger.info(`Adding to standardized tab ${tab.name} - standardizedName: ${smartData.standardizedName}`);
            
            const range = `'${tab.name}'!A:BZ`;
            
            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range,
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                requestBody: { values }
            });
            
            this.logger.info(`Successfully added to ${tab.name}`);
            
            await this._updateCache(smartData);
        } catch (error) {
            this.logger.error(`Failed to add standardized recording: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Update existing raw recording
     */
    async _updateRawRecording(row, rawData, tabKey) {
        const tab = this.tabs[tabKey];
        const range = `'${tab.name}'!A${row}:P${row}`;
        
        const values = [[
            rawData.uuid || rawData.id,
            rawData.meeting_id || rawData.id,
            rawData.topic || '',
            rawData.start_time || '',
            this._calculateEndTime(rawData.start_time, rawData.duration),
            rawData.duration || 0,
            rawData.host_email || '',
            rawData.host_name || this._extractHostName(rawData.host_email),
            rawData.participant_count || 0,
            rawData.recording_type || 'cloud_recording',
            rawData.total_size || rawData.file_size || 0,
            rawData.share_url || rawData.download_url || '',
            rawData.status || 'completed',
            rawData.created_at || new Date().toISOString(),
            new Date().toISOString(),
            rawData.source || rawData.dataSource || 'unknown'
        ]];
        
        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range,
            valueInputOption: 'RAW',
            requestBody: { values }
        });
    }
    
    /**
     * Update existing standardized recording
     */
    async _updateStandardizedRecording(row, recordingData, source, tabKey) {
        const tab = this.tabs[tabKey];
        const smartData = await this._generateSmartData(recordingData, source);
        const values = [this._smartDataToRow(smartData)];
        
        const range = `'${tab.name}'!A${row}:BZ${row}`;
        
        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range,
            valueInputOption: 'RAW',
            requestBody: { values }
        });
        
        await this._updateCache(smartData);
    }
    
    /**
     * Find existing recording in a specific tab
     */
    async _findExistingRecording(uuid, tabKey) {
        if (!uuid) return null;
        
        const tab = this.tabs[tabKey];
        const range = `'${tab.name}'!A:A`;
        
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range
            });
            
            const values = response.data.values || [];
            const rowIndex = values.findIndex(row => row[0] === uuid);
            
            return rowIndex > 0 ? rowIndex + 1 : null;
        } catch (error) {
            this.logger.error(`Failed to find recording in ${tab.name}`, error);
            return null;
        }
    }
    
    /**
     * Ensure headers exist for a specific tab
     */
    async _ensureHeaders(tabKey) {
        const tab = this.tabs[tabKey];
        const columns = tab.columns;
        const headers = [];
        
        // Build headers based on column definitions
        const isRawTab = tabKey.includes('Raw') || tabKey === 'raw';
        
        if (isRawTab) {
            headers.push(
                'uuid', 'meetingId', 'topic', 'startTime', 'endTime',
                'duration', 'hostEmail', 'hostName', 'participantCount',
                'recordingType', 'fileSize', 'downloadUrl', 'status',
                'createdAt', 'lastModified', 'dataSource'
            );
        } else {
            // Standardized headers - simplified list
            headers.push(
                'uuid', 'fingerprint', 'recordingDate', 'rawName', 'standardizedName',
                'nameConfidence', 'nameResolutionMethod', 'familyAccount',
                'weekNumber', 'weekConfidence', 'weekInferenceMethod',
                'hostEmail', 'hostName', 'meetingTopic', 'participants', 'participantCount',
                'meetingId', 'duration', 'startTime', 'endTime', 'recordingType', 'fileSize',
                'hasTranscript', 'transcriptQuality', 'speakerCount', 'primarySpeaker',
                'speakingTimeDistribution', 'emotionalJourney', 'engagementScore', 'keyMoments',
                'coachingTopics', 'coachingStyle', 'studentResponsePattern', 'interactionQuality',
                'keyThemes', 'actionItems', 'challengesIdentified', 'breakthroughs',
                'goalsSet', 'progressTracked', 'nextSteps', 'followUpRequired',
                'driveFolder', 'driveFolderId', 'videoFileId', 'transcriptFileId',
                'processedDate', 'processingVersion', 'dataSource', 'lastUpdated', 'driveLink'
            );
        }
        
        // Calculate the correct column letter for headers
        let lastColumn;
        if (headers.length <= 26) {
            lastColumn = String.fromCharCode(65 + headers.length - 1);
        } else {
            // Handle columns beyond Z (AA, AB, etc.)
            const firstLetter = String.fromCharCode(65 + Math.floor((headers.length - 1) / 26) - 1);
            const secondLetter = String.fromCharCode(65 + ((headers.length - 1) % 26));
            lastColumn = firstLetter + secondLetter;
        }
        const range = `'${tab.name}'!A1:${lastColumn}1`;
        
        try {
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [headers]
                }
            });
            
            this.logger.info(`Headers set for ${tab.name}`);
        } catch (error) {
            this.logger.error(`Failed to set headers for ${tab.name}`, error);
        }
    }
    
    /**
     * Generate smart data from recording
     */
    async _generateSmartData(original, source) {
        // This is a simplified version - copy the full implementation from DualTabGoogleSheetsService
        const processedData = original.processedData || original;
        
        // Get standardized name - it's passed directly in the processedData
        const standardizedNameWithSuffix = processedData.standardizedName || original.standardizedName || '';
        
        // Log for debugging
        this.logger.info(`_generateSmartData - Input data sources:`);
        this.logger.info(`  - processedData.standardizedName: ${processedData.standardizedName}`);
        this.logger.info(`  - original.standardizedName: ${original.standardizedName}`);
        this.logger.info(`  - Final standardizedName: ${standardizedNameWithSuffix}`);
        
        // Get name analysis - the nameStandardizer doesn't have an analyze method
        const nameAnalysis = processedData.nameAnalysis || {};
        
        // Get week analysis - use the data already processed
        const weekAnalysis = processedData.weekAnalysis || {
            weekNumber: processedData.weekNumber || 0,
            confidence: processedData.weekConfidence || 0,
            method: processedData.weekInferenceMethod || 'unknown'
        };
        
        // Extract components from standardized name or name analysis
        const nameParts = standardizedNameWithSuffix.split('_');
        const coachName = nameAnalysis.components?.coach || (nameParts.length > 2 ? nameParts[2] : '');
        const studentName = nameAnalysis.components?.student || (nameParts.length > 3 ? nameParts[3] : '');
        
        // Extract insights and analysis
        const aiInsights = processedData.aiInsights || processedData.insights || {};
        const transcriptAnalysis = processedData.transcriptAnalysis || {};
        const outcomes = processedData.outcomes || [];
        const enhancedMetadata = processedData.enhancedMetadata || {};
        
        // Calculate file size
        const fileManagement = {
            driveFolder: processedData.driveFolder || '',
            driveFolderId: processedData.upload_result_folder_id || processedData.driveFolderId || '',
            driveFileIds: processedData.driveFileIds || {},
            driveLink: processedData.upload_result_drive_link || processedData.driveLink || '',
            downloadedFiles: processedData.downloadedFiles || {}
        };
        
        const totalFileSize = Object.values(fileManagement.downloadedFiles).reduce((total, filePath) => {
            if (filePath && require('fs').existsSync(filePath)) {
                const stats = require('fs').statSync(filePath);
                return total + stats.size;
            }
            return total;
        }, 0);
        
        // Generate UUID and fingerprint
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
            nameConfidence: nameAnalysis.confidence || 0,
            nameResolutionMethod: nameAnalysis.method || '',
            familyAccount: nameAnalysis.isFamilyAccount || false,
            
            // Week inference
            weekNumber: weekAnalysis.weekNumber || 'Unknown',
            weekConfidence: weekAnalysis.confidence || 0,
            weekInferenceMethod: weekAnalysis.method || '',
            
            // Meeting metadata
            hostEmail: enhancedMetadata.hostEmail || original.host_email || '',
            hostName: coachName,
            meetingTopic: enhancedMetadata.topic || original.topic || '',
            participants: enhancedMetadata.participants || processedData.participants || [],
            participantCount: enhancedMetadata.participantCount || processedData.participantCount || original.participant_count || 2,
            meetingId: original.meeting_id || original.id || '',
            
            // Recording details
            duration: processedData.duration || Math.round((original.duration || 0) / 60),
            startTime: original.start_time || '',
            endTime: this._calculateEndTime(original.start_time, original.duration),
            recordingType: original.recording_type || 'cloud_recording',
            fileSize: this._bytesToMB(totalFileSize || original.file_size || 0),
            
            // Transcript analysis
            hasTranscript: transcriptAnalysis.content || processedData.hasTranscript ? 'Yes' : 'No',
            transcriptQuality: transcriptAnalysis.quality || aiInsights.transcriptQuality || 'Good',
            speakerCount: transcriptAnalysis.speakers?.length || enhancedMetadata.speakerCount || 2,
            primarySpeaker: transcriptAnalysis.primarySpeaker?.name || enhancedMetadata.primarySpeaker || coachName,
            speakingTimeDistribution: transcriptAnalysis.speakingDistribution || aiInsights.speakingTimeDistribution || {},
            emotionalJourney: transcriptAnalysis.emotionalJourney || aiInsights.emotionalJourney || [],
            engagementScore: transcriptAnalysis.engagementScore || aiInsights.engagementScore || 0,
            keyMoments: transcriptAnalysis.keyMoments || aiInsights.keyMoments || [],
            
            // Coaching insights
            coachingTopics: aiInsights.coachingTopics || aiInsights.themes || [],
            coachingStyle: aiInsights.coachingStyle || '',
            studentResponsePattern: aiInsights.studentResponsePattern || '',
            interactionQuality: aiInsights.interactionQuality || '',
            
            // AI insights
            keyThemes: aiInsights.themes || aiInsights.keyThemes || [],
            actionItems: aiInsights.actionItems || [],
            challengesIdentified: aiInsights.challenges || [],
            breakthroughs: aiInsights.breakthroughs || [],
            
            // Outcomes
            goalsSet: outcomes.filter(o => o.type === 'goal').map(o => o.description) || [],
            progressTracked: outcomes.filter(o => o.type === 'progress').map(o => o.description).join(', ') || '',
            nextSteps: outcomes.filter(o => o.type === 'next_step').map(o => o.description) || [],
            followUpRequired: outcomes.some(o => o.type === 'follow_up') || false,
            
            // File management
            driveFolder: fileManagement.driveFolder || standardizedNameWithSuffix,
            driveFolderId: fileManagement.driveFolderId || '',
            videoFileId: fileManagement.driveFileIds?.video || '',
            transcriptFileId: fileManagement.driveFileIds?.transcript || '',
            driveLink: fileManagement.driveLink || '',
            
            // Processing metadata
            processedDate: new Date().toISOString(),
            processingVersion: '2.0-smart',
            dataSource: source,
            lastUpdated: new Date().toISOString()
        };
    }
    
    /**
     * Convert smart data to row array
     */
    _smartDataToRow(smartData) {
        return [
            smartData.uuid,
            smartData.fingerprint,
            smartData.recordingDate,
            smartData.rawName,
            smartData.standardizedName,
            smartData.nameConfidence,
            smartData.nameResolutionMethod,
            smartData.familyAccount ? 'Yes' : 'No',
            smartData.weekNumber,
            smartData.weekConfidence,
            smartData.weekInferenceMethod,
            smartData.hostEmail,
            smartData.hostName,
            smartData.meetingTopic,
            Array.isArray(smartData.participants) ? smartData.participants.join(', ') : '',
            smartData.participantCount,
            smartData.meetingId,
            smartData.duration,
            smartData.startTime,
            smartData.endTime,
            smartData.recordingType,
            smartData.fileSize,
            smartData.hasTranscript,
            smartData.transcriptQuality,
            smartData.speakerCount,
            smartData.primarySpeaker,
            JSON.stringify(smartData.speakingTimeDistribution),
            JSON.stringify(smartData.emotionalJourney),
            smartData.engagementScore,
            JSON.stringify(smartData.keyMoments),
            JSON.stringify(smartData.coachingTopics),
            smartData.coachingStyle,
            smartData.studentResponsePattern,
            smartData.interactionQuality,
            JSON.stringify(smartData.keyThemes),
            JSON.stringify(smartData.actionItems),
            JSON.stringify(smartData.challengesIdentified),
            JSON.stringify(smartData.breakthroughs),
            JSON.stringify(smartData.goalsSet),
            smartData.progressTracked,
            JSON.stringify(smartData.nextSteps),
            smartData.followUpRequired ? 'Yes' : 'No',
            smartData.driveFolder,
            smartData.driveFolderId,
            smartData.videoFileId,
            smartData.transcriptFileId,
            smartData.processedDate,
            smartData.processingVersion,
            smartData.dataSource,
            smartData.lastUpdated,
            smartData.driveLink
        ];
    }
    
    /**
     * Convert row to recording object
     */
    _rowToRecordingObject(row, columns) {
        const obj = {};
        Object.entries(columns).forEach(([key, col]) => {
            const colIndex = col.charCodeAt(0) - 65;
            if (row[colIndex] !== undefined) {
                obj[key] = row[colIndex];
            }
        });
        return obj;
    }
    
    /**
     * Extract host name from email
     */
    _extractHostName(email) {
        if (!email) return '';
        const name = email.split('@')[0];
        return name.replace(/[._-]/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
    
    /**
     * Update cache with recording data
     */
    async _updateCache(smartData) {
        await this.cache.set(
            `recording:${smartData.uuid}`,
            smartData,
            86400 // 24 hours
        );
        
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
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        
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
    
    _convertUuidToBase64(uuid) {
        if (!uuid) return '';
        
        if (uuid.includes('==') || /[A-Za-z0-9+/]=$/.test(uuid)) {
            return uuid;
        }
        
        const cleanUuid = uuid.replace(/-/g, '');
        const isHexUuid = /^[0-9a-fA-F]{32}$/.test(cleanUuid);
        
        if (!isHexUuid) {
            return uuid;
        }
        
        try {
            const buffer = Buffer.from(cleanUuid, 'hex');
            const base64 = buffer.toString('base64');
            return base64;
        } catch (error) {
            this.logger.warn(`Failed to convert UUID to Base64: ${uuid}`, error);
            return uuid;
        }
    }
    
    /**
     * Backward compatibility method
     */
    async addOrUpdateRecording(recordingData, source = 'unknown') {
        return this.addRecording(recordingData, source);
    }
    
    /**
     * Get all recordings (legacy method for compatibility)
     */
    async getAllRecordings() {
        // Return recordings from all sources combined
        const allRecordings = [];
        
        for (const source of ['zoom-api', 'webhook', 'google-drive']) {
            try {
                const recordings = await this.getRecordingsBySource(source);
                allRecordings.push(...recordings);
            } catch (error) {
                this.logger.warn(`Failed to get recordings for source: ${source}`, error);
            }
        }
        
        return allRecordings;
    }
    
    /**
     * Check if a recording exists by UUID and return details if found
     */
    async checkRecordingExists(uuid) {
        await this.ensureInitialized();
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
            // Check across all standardized tabs
            const allSources = ['zoom-api', 'webhook', 'google-drive'];
            
            for (const source of allSources) {
                const tabPair = this.dataSourceTabMap[source];
                if (!tabPair) continue;
                
                const standardizedTab = this.tabs[tabPair.standardized];
                const range = `'${standardizedTab.name}'!A:AY`;
                
                const response = await this.sheets.spreadsheets.values.get({
                    spreadsheetId: this.spreadsheetId,
                    range
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
                            driveFolder: row[41] || '',
                            driveFolderId: row[42] || '',
                            videoFileId: row[43] || '',
                            transcriptFileId: row[44] || '',
                            processedDate: row[45] || '',
                            processingVersion: row[46] || '',
                            dataSource: row[47] || source,
                            lastUpdated: row[48] || '',
                            driveLink: row[49] || ''
                        };
                        
                        // Cache the result
                        await this.cache.set(cacheKey, recording, 86400); // 24 hours
                        
                        return {
                            exists: true,
                            recording,
                            source
                        };
                    }
                }
            }
            
            // Not found in any tab
            return {
                exists: false,
                recording: null
            };
            
        } catch (error) {
            this.logger.error('Error checking if recording exists', error);
            return {
                exists: false,
                recording: null,
                error: error.message
            };
        }
    }
    
    /**
     * Update master spreadsheet (legacy method for compatibility)
     * This method determines the data source and routes to appropriate tabs
     */
    async updateMasterSpreadsheet(processedRecording, source = 'Reprocessing') {
        const startTime = Date.now();
        
        try {
            if (!processedRecording || !processedRecording.processed) {
                throw new ValidationError('Invalid processed recording data');
            }
            
            const { processed, original } = processedRecording;
            
            // Determine the actual data source
            let dataSource = source;
            
            // Log for debugging
            this.logger.info(`Determining data source - Source: ${source}, original.dataSource: ${original.dataSource}`);
            
            if (source === 'Comprehensive Processing' || source === 'Reprocessing') {
                // This is from batch processing, use 'zoom-api'
                dataSource = 'zoom-api';
            } else if (source === 'Google Drive Import - Full Pipeline' || 
                      original.dataSource === 'google-drive' || 
                      original.dataSource === 'Google Drive Import' || 
                      original.driveFileId) {
                dataSource = 'google-drive';
                this.logger.info('Detected Google Drive source');
            } else if (original.source === 'webhook' || original.webhook_received_at) {
                dataSource = 'webhook';
            }
            
            this.logger.info(`Final determined dataSource: ${dataSource}`);
            
            // Add the recording to appropriate tabs
            const enrichedRecording = {
                ...original,
                ...processed,
                processedData: processed,
                source: dataSource,
                dataSource: dataSource
            };
            
            const result = await this.addRecording(enrichedRecording, dataSource);
            
            const duration = Date.now() - startTime;
            if (this.metrics && typeof this.metrics.recordHistogram === 'function') {
                this.metrics.recordHistogram('sheets.update.duration', duration);
            }
            
            this.logger.info(`Recording ${result.action} in ${dataSource} tabs (${duration}ms)`);
            
            return result;
            
        } catch (error) {
            if (this.metrics && typeof this.metrics.incrementCounter === 'function') {
                this.metrics.incrementCounter('sheets.update.error');
            }
            this.logger.error('Failed to update master spreadsheet', error);
            throw error;
        }
    }
}

module.exports = MultiTabGoogleSheetsService;