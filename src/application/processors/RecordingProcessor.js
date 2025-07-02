const path = require('path');
const fs = require('fs').promises;

class RecordingProcessor {
    constructor(
        logger,
        recordingAnalyzer,
        googleDriveService,
        googleSheetsService,
        zoomService,
        eventBus,
        recordingDownloader = null,
        driveOrganizer = null,
        outcomeExtractor = null,
        relationshipAnalyzer = null,
        config = {},
        lightweight = false
    ) {
        // Ensure logger has required methods
        this.logger = this._ensureLogger(logger);
        this.recordingAnalyzer = recordingAnalyzer;
        this.googleDriveService = googleDriveService;
        this.googleSheetsService = googleSheetsService;
        this.zoomService = zoomService;
        this.eventBus = eventBus;
        this.recordingDownloader = recordingDownloader;
        this.driveOrganizer = driveOrganizer;
        this.outcomeExtractor = outcomeExtractor;
        this.relationshipAnalyzer = relationshipAnalyzer;
        this.processingCache = new Map();
        this.config = {
            downloadFiles: process.env.DOWNLOAD_FILES === 'true',
            lightweight: lightweight,
            ...config
        };
    }

    _ensureLogger(logger) {
        // If logger is already properly structured, return it
        if (logger && typeof logger.info === 'function' && typeof logger.error === 'function') {
            return logger;
        }

        // Create a console-based fallback logger
        const fallbackLogger = {
            info: (message, meta = {}) => {
                console.log(`info: ${message}`, JSON.stringify(meta));
            },
            error: (message, meta = {}) => {
                console.error(`error: ${message}`, JSON.stringify(meta));
            },
            warn: (message, meta = {}) => {
                console.warn(`warn: ${message}`, JSON.stringify(meta));
            },
            debug: (message, meta = {}) => {
                console.log(`debug: ${message}`, JSON.stringify(meta));
            }
        };

        // If logger exists but doesn't have the right methods, wrap it
        if (logger && (logger.log || logger.write)) {
            return {
                info: (msg, meta) => logger.log ? logger.log('info', msg, meta) : fallbackLogger.info(msg, meta),
                error: (msg, meta) => logger.log ? logger.log('error', msg, meta) : fallbackLogger.error(msg, meta),
                warn: (msg, meta) => logger.log ? logger.log('warn', msg, meta) : fallbackLogger.warn(msg, meta),
                debug: (msg, meta) => logger.log ? logger.log('debug', msg, meta) : fallbackLogger.debug(msg, meta)
            };
        }

        // Return fallback logger
        return fallbackLogger;
    }

    async processRecording(recording) {
        const processingId = `proc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            this.logger.info('Starting recording processing', {
                recordingId: recording.id,
                topic: recording.topic,
                uuid: recording.uuid,
                processingId,
                useContentFirst: recording.useContentFirst || false,
                downloadFiles: process.env.DOWNLOAD_FILES === 'true'
            });

            if (this.eventBus && typeof this.eventBus.emit === 'function') {
                this.eventBus.emit('recording:processing:start', {
                    recordingId: recording.id,
                    processingId
                });
            }

            // PRIORITY 1: Download recording files FIRST (for high-fidelity extraction)
            let downloadedFiles = {};
            if ((process.env.DOWNLOAD_FILES === 'true' || this.config.downloadFiles) && recording.recording_files) {
                try {
                    downloadedFiles = await this._downloadRecordingFiles(recording);
                    recording.downloadedFiles = downloadedFiles; // Attach to recording object
                    
                    this.logger.info('Downloaded recording files', {
                        recordingId: recording.id,
                        fileTypes: Object.keys(downloadedFiles),
                        hasTranscript: !!downloadedFiles.transcript,
                        hasTimeline: !!downloadedFiles.timeline,
                        hasChat: !!downloadedFiles.chat
                    });
                } catch (error) {
                    this.logger.error('Failed to download recording files', {
                        recordingId: recording.id,
                        error: error.message
                    });
                    recording.downloadedFiles = {}; // Empty object on failure
                }
            } else {
                recording.downloadedFiles = {}; // Ensure it exists
            }

            // PRIORITY 2: Get participants
            const participants = await this._getParticipants(recording.uuid);
            recording.participants = participants; // Attach to recording object
            
            // PRIORITY 3: Analyze recording with all available data
            const analysis = await this._analyzeRecording(recording, participants, processingId);
            
            // PRIORITY 4: Process results
            const result = await this._processAnalysisResults(recording, analysis, processingId);
            
            if (this.eventBus && typeof this.eventBus.emit === 'function') {
                this.eventBus.emit('recording:processing:complete', {
                    recordingId: recording.id,
                    processingId,
                    result
                });
            }

            return result;

        } catch (error) {
            this.logger.error('Recording processing failed', {
                error: error.message,
                stack: error.stack,
                recordingId: recording.id,
                processingId
            });

            if (this.eventBus && typeof this.eventBus.emit === 'function') {
                this.eventBus.emit('recording:processing:error', {
                    recordingId: recording.id,
                    processingId,
                    error: error.message
                });
            }

            throw error;
        }
    }

    /**
     * Download all recording files (transcript, timeline, chat, etc.)
     * ENHANCED: Returns object with file types as keys
     */
    async _downloadRecordingFiles(recording) {
        const downloadedFiles = {};
        
        if (!recording.recording_files) {
            return downloadedFiles;
        }

        // Use recordingDownloader service if available
        if (this.recordingDownloader && typeof this.recordingDownloader.downloadRecordingFiles === 'function') {
            try {
                this.logger.info('Using recordingDownloader service', {
                    recordingId: recording.id,
                    lightweight: this.config.lightweight
                });
                
                const result = await this.recordingDownloader.downloadRecordingFiles(recording, null, {
                    lightweight: this.config.lightweight
                });
                
                // Extract files from the result structure
                if (result && result.files) {
                    // Convert uppercase keys to lowercase to prevent duplicates
                    const fileTypeMapping = {
                        'MP4': 'video',
                        'M4A': 'audio',
                        'TRANSCRIPT': 'transcript',
                        'TIMELINE': 'timeline',
                        'CHAT': 'chat',
                        'CC': 'captions',
                        'CSV': 'participants',
                        'VTT': 'transcript'
                    };
                    
                    for (const [originalType, filePath] of Object.entries(result.files)) {
                        const mappedType = fileTypeMapping[originalType];
                        if (mappedType) {
                            downloadedFiles[mappedType] = filePath;
                            this.logger.info(`Mapped file type: ${originalType} -> ${mappedType}`);
                        }
                    }
                }
                
                return downloadedFiles;
            } catch (error) {
                this.logger.error('recordingDownloader failed, falling back to zoomService', {
                    recordingId: recording.id,
                    error: error.message
                });
            }
        }

        // Fallback to zoomService
        if (!this.zoomService) {
            return downloadedFiles;
        }

        const fileTypeMapping = {
            'MP4': 'video',
            'M4A': 'audio',
            'TRANSCRIPT': 'transcript',
            'TIMELINE': 'timeline',
            'CHAT': 'chat',
            'CC': 'captions',
            'CSV': 'participants',
            'VTT': 'transcript'  // Some transcripts come as VTT
        };

        for (const file of recording.recording_files) {
            const fileType = file.file_type || file.file_extension?.toUpperCase() || '';
            const mappedType = fileTypeMapping[fileType];
            
            if (mappedType && ['transcript', 'timeline', 'chat', 'participants'].includes(mappedType)) {
                try {
                    this.logger.info('Downloading file', {
                        recordingId: recording.id,
                        fileType: fileType,
                        mappedType: mappedType,
                        fileSize: file.file_size
                    });

                    // Download file using ZoomService
                    if (this.zoomService.downloadFile) {
                        const filePath = await this.zoomService.downloadFile(
                            file.download_url,
                            recording.id,
                            fileType,
                            file.recording_start || recording.start_time
                        );

                        // Read file content for text-based files
                        if (['transcript', 'timeline', 'chat'].includes(mappedType)) {
                            try {
                                const content = await fs.readFile(filePath, 'utf8');
                                downloadedFiles[mappedType] = content;
                                downloadedFiles[`${mappedType}Path`] = filePath;
                            } catch (readError) {
                                this.logger.error('Failed to read downloaded file', {
                                    filePath,
                                    error: readError.message
                                });
                                downloadedFiles[`${mappedType}Path`] = filePath;
                            }
                        } else {
                            downloadedFiles[`${mappedType}Path`] = filePath;
                        }
                    } else {
                        // Fallback: Just store the download URL
                        downloadedFiles[`${mappedType}Url`] = file.download_url;
                    }
                } catch (error) {
                    this.logger.error('Failed to download file', {
                        recordingId: recording.id,
                        fileType: fileType,
                        error: error.message
                    });
                }
            }
        }

        return downloadedFiles;
    }

    async _getParticipants(uuid) {
        try {
            if (!this.zoomService || typeof this.zoomService.getParticipants !== 'function') {
                this.logger.warn('ZoomService not available or missing getParticipants method', { uuid });
                return [];
            }
            
            const participants = await this.zoomService.getParticipants(uuid);
            return participants || [];
        } catch (error) {
            this.logger.warn('Failed to get participants', {
                uuid,
                error: error.message
            });
            return [];
        }
    }

    async _analyzeRecording(recording, participants, processingId) {
        // Ensure recording has all necessary data
        const enhancedRecording = {
            ...recording,
            participants: participants || recording.participants || [],
            downloadedFiles: recording.downloadedFiles || {},
            processingId
        };

        // Use the recording analyzer if available
        if (this.recordingAnalyzer && typeof this.recordingAnalyzer.analyzeRecording === 'function') {
            try {
                const analysis = await this.recordingAnalyzer.analyzeRecording(enhancedRecording);
                
                // Log extraction sources for debugging
                if (analysis.metadata?.extractionSources) {
                    this.logger.info('Analysis extraction sources', {
                        recordingId: recording.id,
                        sources: analysis.metadata.extractionSources,
                        hasFiles: Object.keys(enhancedRecording.downloadedFiles).length > 0,
                        confidence: analysis.confidence
                    });
                }

                return analysis || {
                    sessionType: 'Unknown',
                    confidence: 0,
                    metadata: {}
                };
            } catch (error) {
                this.logger.error('Analysis failed', {
                    processingId,
                    recordingId: recording.id,
                    error: error.message
                });
                
                return this._fallbackAnalysis(recording, participants);
            }
        }

        // Use fallback analysis if no analyzer available
        return this._fallbackAnalysis(recording, participants);
    }

    _fallbackAnalysis(recording, participants) {
        this.logger.warn('Using fallback analysis', {
            recordingId: recording.id,
            hasAnalyzer: !!this.recordingAnalyzer
        });

        const topicLower = (recording.topic || '').toLowerCase();
        let sessionType = 'Unknown';
        let confidence = 0;
        let studentName = '';
        let coachName = '';
        let weekNumber = null;
        
        // Basic pattern matching
        const weekMatch = topicLower.match(/week\s*(\d+)|wk\s*#?(\d+)/i);
        if (weekMatch) {
            weekNumber = parseInt(weekMatch[1] || weekMatch[2]);
            sessionType = 'Coaching';
            confidence = 60;
        }
        
        // Extract names from topic
        const namePatterns = [
            /^([A-Za-z]+)\s*<>\s*([A-Za-z]+)/i,  // Coach <> Student
            /^([A-Za-z]+)\s+and\s+([A-Za-z]+)/i,  // Name and Name
            /^([A-Za-z]+)\s*&\s*([A-Za-z]+)/i,    // Name & Name
            /^([A-Za-z]+)\s*-\s*([A-Za-z]+)/i     // Name - Name
        ];
        
        for (const pattern of namePatterns) {
            const match = recording.topic.match(pattern);
            if (match) {
                // For now, assume first is student, second is coach
                studentName = match[1];
                coachName = match[2];
                confidence = Math.max(confidence, 50);
                break;
            }
        }
        
        // Session type detection
        if (topicLower.includes('game plan')) {
            sessionType = 'Game Plan';
            confidence = 70;
        } else if (topicLower.includes('essay') || topicLower.includes('writing')) {
            sessionType = 'Essay Review';
            confidence = 65;
        } else if (topicLower.includes('sat')) {
            sessionType = 'SAT Prep';
            confidence = 65;
        } else if (studentName && coachName) {
            sessionType = 'Coaching';
            confidence = Math.max(confidence, 60);
        }
        
        return {
            sessionType,
            confidence,
            coach: coachName,
            student: studentName,
            week: weekNumber,
            metadata: {
                recordingId: recording.id,
                topic: recording.topic,
                studentName,
                coachName,
                weekNumber,
                participants: participants.length,
                analyzedAt: new Date().toISOString(),
                method: 'fallback',
                extractionSources: ['topic']
            }
        };
    }

    async _processAnalysisResults(recording, analysis, processingId) {
        const result = {
            recordingId: recording.id,
            processingId,
            topic: recording.topic,
            startTime: recording.start_time,
            duration: recording.duration,
            analysis,
            processedAt: new Date().toISOString(),
            files: this._getMappedFileTypes(recording.downloadedFiles || {})
        };

        // Add standardized fields from analysis
        if (analysis.coach) result.coach = analysis.coach;
        if (analysis.student) result.student = analysis.student;
        if (analysis.week || analysis.weekNumber) result.week = analysis.week || analysis.weekNumber;
        if (analysis.sessionType) result.sessionType = analysis.sessionType;
        if (analysis.confidence) result.confidence = analysis.confidence;
        
        // Extract outcomes using outcomeExtractor service if available
        if (this.outcomeExtractor && typeof this.outcomeExtractor.extractOutcomes === 'function') {
            try {
                this.logger.info('Extracting outcomes using outcomeExtractor service', {
                    recordingId: recording.id
                });
                
                const outcomes = await this.outcomeExtractor.extractOutcomes(recording, analysis);
                result.outcomes = outcomes;
            } catch (error) {
                this.logger.error('outcomeExtractor failed', {
                    recordingId: recording.id,
                    error: error.message
                });
            }
        }
        
        // Analyze relationships using relationshipAnalyzer service if available
        if (this.relationshipAnalyzer && typeof this.relationshipAnalyzer.analyzeRelationships === 'function') {
            try {
                this.logger.info('Analyzing relationships using relationshipAnalyzer service', {
                    recordingId: recording.id
                });
                
                const relationships = await this.relationshipAnalyzer.analyzeRelationships(recording, analysis);
                result.relationships = relationships;
            } catch (error) {
                this.logger.error('relationshipAnalyzer failed', {
                    recordingId: recording.id,
                    error: error.message
                });
            }
        }
        
        // Save to Google Sheets if enabled
        if (process.env.SAVE_TO_SHEETS === 'true' && this.googleSheetsService) {
            try {
                const sheetRow = await this._saveToGoogleSheets(result);
                result.sheetRow = sheetRow;
            } catch (error) {
                this.logger.error('Failed to save to Google Sheets', {
                    processingId,
                    error: error.message
                });
            }
        }

        // Save to local file
        if (process.env.OUTPUT_DIR) {
            try {
                const filePath = await this._saveToFile(result);
                result.filePath = filePath;
            } catch (error) {
                this.logger.error('Failed to save to file', {
                    processingId,
                    error: error.message
                });
            }
        }

        // Save to Google Drive using driveOrganizer service
        console.log('🔍 DEBUG: Checking driveOrganizer availability...');
        console.log('🔍 DEBUG: this.driveOrganizer exists:', !!this.driveOrganizer);
        console.log('🔍 DEBUG: this.driveOrganizer type:', typeof this.driveOrganizer);
        console.log('🔍 DEBUG: this.driveOrganizer.organizeRecording exists:', !!this.driveOrganizer.organizeRecording);
        console.log('🔍 DEBUG: this.driveOrganizer.organizeRecording type:', typeof this.driveOrganizer.organizeRecording);
        
        if (this.driveOrganizer && typeof this.driveOrganizer.organizeRecording === 'function') {
            try {
                console.log('🗂️ DEBUG: Starting Drive organization...');
                this.logger.info('🗂️ Organizing files in Google Drive using driveOrganizer service', {
                    recordingId: recording.id
                });
                
                // Create a clean processedData object with only mapped file types
                const cleanProcessedData = {
                    ...result,
                    files: this._getMappedFileTypes(recording.downloadedFiles || {})
                };
                
                const driveResult = await this.driveOrganizer.organizeRecording(recording, cleanProcessedData);
                console.log('🗂️ DEBUG: Drive organization result:', driveResult);
                result.driveResult = driveResult;
                
                if (driveResult && driveResult.success) {
                    this.logger.info('✅ Files organized successfully in Google Drive', {
                        recordingId: recording.id,
                        folderUrl: driveResult.folderUrl,
                        folderId: driveResult.folders?.primaryPath?.sessionFolder?.id
                    });
                } else {
                    this.logger.warn('⚠️ Drive organization failed', {
                        recordingId: recording.id,
                        error: driveResult?.error || 'Unknown error'
                    });
                }
            } catch (error) {
                console.log('❌ DEBUG: Drive organization error:', error.message);
                this.logger.error('Failed to organize files in Google Drive', {
                    recordingId: recording.id,
                    processingId,
                    error: error.message
                });
            }
        } else {
            console.log('⚠️ DEBUG: Drive organizer service not available');
            this.logger.warn('⚠️ Drive organizer service not available', {
                recordingId: recording.id
            });
        }

        return result;
    }

    /**
     * Get only the mapped lowercase file types, excluding original uppercase types
     */
    _getMappedFileTypes(downloadedFiles) {
        const mappedTypes = ['transcript', 'timeline', 'chat', 'audio', 'video', 'captions', 'participants'];
        const result = {};
        
        // Only include mapped lowercase types
        for (const type of mappedTypes) {
            if (downloadedFiles[type] || downloadedFiles[`${type}Path`]) {
                result[type] = downloadedFiles[`${type}Path`] || downloadedFiles[type];
            }
        }
        
        return result;
    }

    async _saveToGoogleSheets(result) {
        if (!this.googleSheetsService || typeof this.googleSheetsService.updateMasterSpreadsheet !== 'function') {
            this.logger.warn('GoogleSheetsService not available or missing updateMasterSpreadsheet method');
            return null;
        }
        
        try {
            // Transform the result into the format expected by GoogleSheetsService
            const processedRecording = {
                processed: {
                    id: result.recordingId,
                    topic: result.topic,
                    startTime: result.startTime,
                    duration: result.duration,
                    sessionType: result.sessionType || result.analysis?.sessionType || 'Unknown',
                    metadata: {
                        studentName: result.student || result.analysis?.student || result.analysis?.metadata?.studentName || '',
                        coachName: result.coach || result.analysis?.coach || result.analysis?.metadata?.coachName || '',
                        weekNumber: result.week || result.analysis?.week || result.analysis?.metadata?.weekNumber || '',
                        sessionType: result.sessionType || result.analysis?.sessionType || 'Unknown'
                    },
                    confidence: result.confidence || result.analysis?.confidence || 0,
                    processedAt: result.processedAt,
                    analysis: result.analysis || {},
                    files: result.files || []
                },
                original: recording || {
                    id: result.recordingId,
                    topic: result.topic,
                    start_time: result.startTime,
                    duration: result.duration
                }
            };
            
            // Call the GoogleSheetsService method
            const sheetResult = await this.googleSheetsService.updateMasterSpreadsheet(
                processedRecording, 
                'Recording Processing'
            );
            
            this.logger.info('Recording saved to Google Sheets', {
                recordingId: result.recordingId,
                sheetResult
            });
            
            return sheetResult;
        } catch (error) {
            this.logger.error('Failed to save to Google Sheets', {
                recordingId: result.recordingId,
                error: error.message
            });
            return null;
        }
    }

    async _saveToFile(result) {
        const outputDir = process.env.OUTPUT_DIR || './output';
        const fileName = `recording-${result.recordingId}-${result.processingId}.json`;
        const filePath = path.join(outputDir, fileName);

        // Ensure output directory exists
        try {
            await fs.mkdir(outputDir, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }

        await fs.writeFile(filePath, JSON.stringify(result, null, 2));
        return filePath;
    }

    async _saveToGoogleDrive(recording, result) {
        // Note: organizeRecording is already called in _processAnalysisResults
        // This method now only handles fallback to googleDriveService if needed
        
        // Fallback to googleDriveService only if driveOrganizer is not available
        if (!this.googleDriveService) {
            this.logger.warn('GoogleDriveService not available');
            return null;
        }
        
        try {
            // Use enhanced metadata for better folder organization
            const sessionType = result.sessionType || result.analysis?.sessionType || 'Unknown';
            const coach = result.coach || result.analysis?.coach;
            const student = result.student || result.analysis?.student;
            
            const config = this.googleDriveService.config;
            let parentFolderId;
            
            // Determine parent folder based on enhanced metadata
            if (sessionType === 'TRIVIAL' || result.analysis?.confidence < 20) {
                parentFolderId = config.google.driveFolders?.trivial || config.google.driveRootFolderId;
            } else if (coach && coach !== 'Unknown') {
                parentFolderId = config.google.driveFolders?.coaches || config.google.driveRootFolderId;
            } else if (student && student !== 'Unknown') {
                parentFolderId = config.google.driveFolders?.students || config.google.driveRootFolderId;
            } else {
                parentFolderId = config.google.driveFolders?.misc || config.google.driveRootFolderId;
            }
            
            // Create folder name with enhanced metadata
            const dateStr = new Date(recording.start_time).toISOString().split('T')[0];
            let folderName = recording.topic;
            
            // If we have better metadata, create a more descriptive folder name
            if (coach && student && coach !== 'Unknown' && student !== 'Unknown') {
                folderName = `${coach} - ${student} - ${dateStr}`;
                if (result.week) {
                    folderName = `${coach} - ${student} - Week ${result.week} - ${dateStr}`;
                }
            } else {
                folderName = `${recording.topic} - ${dateStr}`;
            }
            
            // Create or get folder in the appropriate parent
            const folder = await this.googleDriveService.createFolder(folderName, parentFolderId);
            
            // Create a temporary file path for the analysis
            const tempDir = process.env.OUTPUT_DIR || './output';
            const tempFileName = `analysis-${recording.id}.json`;
            const tempFilePath = path.join(tempDir, tempFileName);
            
            // Ensure directory exists
            await fs.mkdir(tempDir, { recursive: true });
            
            // Write the analysis to a temporary file
            await fs.writeFile(tempFilePath, JSON.stringify(result, null, 2));
            
            // Upload the file
            const analysisFile = await this.googleDriveService.uploadFile(tempFilePath, {
                name: tempFileName,
                parents: [folder.id]
            });
            
            // Clean up temp file
            try {
                await fs.unlink(tempFilePath);
            } catch (e) {
                // Ignore cleanup errors
            }
            
            return {
                folderUrl: folder.webViewLink || folder.webLink || `https://drive.google.com/drive/folders/${folder.id}`,
                folderId: folder.id,
                parentFolder: parentFolderId,
                files: [analysisFile]
            };
        } catch (error) {
            this.logger.error('Failed to save to Google Drive', {
                recordingId: recording.id,
                error: error.message
            });
            return null;
        }
    }

    // Setter methods for dependency injection
    setDriveOrganizer(driveOrganizer) {
        this.driveOrganizer = driveOrganizer;
        this.logger.info('Drive organizer service injected');
    }

    setRecordingDownloader(recordingDownloader) {
        this.recordingDownloader = recordingDownloader;
        this.logger.info('Recording downloader service injected');
    }

    setOutcomeExtractor(outcomeExtractor) {
        this.outcomeExtractor = outcomeExtractor;
        this.logger.info('Outcome extractor service injected');
    }

    setRelationshipAnalyzer(relationshipAnalyzer) {
        this.relationshipAnalyzer = relationshipAnalyzer;
        this.logger.info('Relationship analyzer service injected');
    }
}

module.exports = RecordingProcessor;
