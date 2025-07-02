const { google } = require('googleapis');
const { Readable } = require('stream');
const { ExternalServiceError, ValidationError } = require('../../shared/errors');
const { retryWithBackoff } = require('../../shared/errors');

/**
 * Google Drive service for file operations
 */
class GoogleDriveService {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.drive = null;
        this.auth = null;
        
        this._initialize();
    }

    /**
     * Initialize Google Drive client
     */
    _initialize() {
        try {
            // Check if we have the required credentials
            if (!this.config.clientEmail || !this.config.privateKey) {
                throw new Error('Missing Google service account credentials (clientEmail or privateKey)');
            }

            // Create credentials object
            const credentials = {
                client_email: this.config.clientEmail,
                private_key: this.config.privateKey
            };

            // Create auth client
            this.auth = new google.auth.GoogleAuth({
                credentials: credentials,
                scopes: ['https://www.googleapis.com/auth/drive']
            });

            // Create drive client
            this.drive = google.drive({ version: 'v3', auth: this.auth });
            
            this.logger.info('Google Drive service initialized');
        } catch (error) {
            this.logger.error('Failed to initialize Google Drive service', error);
            throw new ExternalServiceError('Google Drive', 'Failed to initialize service', error);
        }
    }

    /**
     * Upload files to Google Drive
     */
    async uploadFiles(files, folderName, metadata = {}) {
        if (!files || !folderName) {
            throw new ValidationError('Files and folder name are required');
        }

        try {
            this.logger.info('Starting Google Drive upload', { 
                folderName, 
                fileCount: Object.keys(files).filter(k => k !== 'fileInfo').length 
            });

            // Determine target folder based on session type
            const targetFolder = await this._determineTargetFolder(metadata);
            
            // Create session folder
            const sessionFolder = await this._createSessionFolder(
                targetFolder.id, 
                folderName, 
                metadata
            );

            // Upload files with rate limiting
            const uploadedFiles = await this._uploadFilesWithRateLimit(
                files, 
                sessionFolder.id, 
                folderName
            );

            // Create shortcuts if applicable
            if (targetFolder.createShortcuts && metadata.coach && metadata.student) {
                await this._createShortcuts(sessionFolder, targetFolder.shortcuts);
            }

            const result = {
                folderId: sessionFolder.id,
                folderLink: `https://drive.google.com/drive/folders/${sessionFolder.id}`,
                uploadedFiles,
                fileInfo: this._calculateFileInfo(uploadedFiles)
            };

            this.logger.info('Google Drive upload completed', {
                folderId: result.folderId,
                filesUploaded: uploadedFiles.length
            });

            return result;

        } catch (error) {
            this.logger.error('Google Drive upload failed', error);
            throw new ExternalServiceError('Google Drive', 'Upload failed', error);
        }
    }

    /**
     * Determine target folder based on session metadata
     */
    async _determineTargetFolder(metadata) {
        const { sessionType, coach, student } = metadata;
        
        // Get base folder IDs from config
        const folderIds = {
            root: this.config.drive.parentFolderId,
            coaches: this.config.drive.coachesFolderId || await this._ensureFolder(this.config.drive.parentFolderId, 'Coaches'),
            students: this.config.drive.studentsFolderId || await this._ensureFolder(this.config.drive.parentFolderId, 'Students'),
            misc: this.config.drive.miscFolderId || await this._ensureFolder(this.config.drive.parentFolderId, 'MISC'),
            trivial: this.config.drive.trivialFolderId || await this._ensureFolder(this.config.drive.parentFolderId, 'TRIVIAL')
        };
    
        // Determine folder based on session type
        if (sessionType === 'MISC' || !student || student === 'Unknown') {
            return {
                id: folderIds.misc,
                type: 'misc',
                createShortcuts: false
            };
        }
    
        if (sessionType === 'TRIVIAL') {
            return {
                id: folderIds.trivial,
                type: 'trivial',
                createShortcuts: false
            };
        }
    
        // Coach-Student session - create nested folders
        if (coach && student && student !== 'Unknown') {
            // Primary location: Students/[Student]/[Coach] Sessions/
            const studentFolder = await this._ensureFolder(folderIds.students, student);
            const studentCoachFolder = await this._ensureFolder(studentFolder, `${coach} Sessions`);
            
            // Secondary location for shortcut: Coaches/[Coach]/[Student] Sessions/
            const coachFolder = await this._ensureFolder(folderIds.coaches, coach);
            const coachStudentFolder = await this._ensureFolder(coachFolder, `${student} Sessions`);
            
            return {
                id: studentCoachFolder, // Primary location
                type: 'coaching',
                createShortcuts: true,
                shortcuts: [{
                    parentId: coachStudentFolder,
                    name: null // Will use same name as source folder
                }]
            };
        }
    
        // Default to MISC
        return {
            id: folderIds.misc,
            type: 'misc',
            createShortcuts: false
        };
    }
    
    async uploadProcessedRecording(recording, files, nameStandardizer) {
        // Get standardized name and metadata
        const nameAnalysis = await nameStandardizer.standardizeName(
            recording.topic || recording.originalName
        );
        
        // Extract metadata from standardized name
        const parts = nameAnalysis.standardizedName.split('_');
        const metadata = {
            sessionType: nameAnalysis.sessionType,
            coach: parts[1],
            student: parts[2],
            week: parts[3],
            date: parts[4],
            standardizedName: nameAnalysis.standardizedName
        };
        
        // Upload files with proper folder structure
        return await this.uploadFiles(files, nameAnalysis.standardizedName, metadata);
    }
    

    /**
     * Create session folder
     */
    async _createSessionFolder(parentId, folderName, metadata) {
        const sessionFolderName = this._buildSessionFolderName(folderName, metadata);
        return await this._ensureFolder(parentId, sessionFolderName);
    }

    /**
     * Build session folder name
     */
    _buildSessionFolderName(standardizedName, metadata) {
        // Extract parts from standardized name
        // Format: "Coaching_Jamie_Zainab_Wk02_2025-06-23"
        const parts = standardizedName.split('_');
        const sessionType = parts[0]; // Coaching, MISC, etc.
        const coach = parts[1];
        const student = parts[2];
        const week = parts[3]; // Wk02 or WkUnknown
        const date = parts[4]; // 2025-06-23
        
        // Build folder name based on your requirements
        if (date && coach && student) {
            if (week && week !== 'WkUnknown') {
                // Include week if known: "2025-05-31_Rishi_Aarav_Wk07"
                return `${date}_${coach}_${student}_${week}`;
            } else {
                // No week: "2025-06-17_Rishi_Aarav"
                return `${date}_${coach}_${student}`;
            }
        }
        
        // Fallback to date + standardized name
        return date ? `${date}_${standardizedName}` : standardizedName;
    }

    /**
     * Upload files with rate limiting
     */
    async _uploadFilesWithRateLimit(files, folderId, standardizedName) {
        const uploadedFiles = [];
        const fileEntries = Object.entries(files).filter(([key]) => key !== 'fileInfo');
        
        // Upload files with delay between each to avoid rate limits
        for (const [fileType, fileStream] of fileEntries) {
            if (!fileStream) continue;
            
            try {
                const fileName = this._getFileName(fileType, standardizedName);
                const mimeType = this._getMimeType(fileType, fileName);
                
                const uploadedFile = await retryWithBackoff(
                    () => this._uploadSingleFile(fileStream, fileName, mimeType, folderId),
                    {
                        maxAttempts: this.config.drive.retryAttempts || 3,
                        initialDelay: 2000,
                        onRetry: (error, attempt) => {
                            this.logger.warn(`Retrying file upload (attempt ${attempt})`, {
                                fileName,
                                error: error.message
                            });
                        }
                    }
                );
                
                if (uploadedFile) {
                    uploadedFiles.push(uploadedFile);
                }
                
                // Add delay between uploads
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                this.logger.error(`Failed to upload ${fileType}`, error);
                // Continue with other files
            }
        }
        
        return uploadedFiles;
    }

    /**
     * Upload a single file
     */
    async _uploadSingleFile(fileStream, fileName, mimeType, parentFolderId) {
        // Create fresh stream from buffer if available
        let uploadStream;
        if (fileStream.buffer) {
            const buffer = Buffer.isBuffer(fileStream.buffer) 
                ? fileStream.buffer 
                : Buffer.from(fileStream.buffer);
                
            uploadStream = new Readable({
                read() {
                    this.push(buffer);
                    this.push(null);
                }
            });
        } else {
            uploadStream = fileStream;
        }

        const fileMetadata = {
            name: fileName,
            parents: [parentFolderId]
        };

        const media = {
            mimeType: mimeType,
            body: uploadStream
        };

        const response = await this.drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, name, size, webViewLink',
            timeout: this.config.drive.uploadTimeout || 600000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        this.logger.debug(`Uploaded ${fileName}`, {
            fileId: response.data.id,
            size: response.data.size
        });

        return response.data;
    }

    /**
     * Create or get existing folder
     */
    async _ensureFolder(parentId, folderName) {
        try {
            // Check if folder exists
            const response = await this.drive.files.list({
                q: `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                fields: 'files(id, name)',
                spaces: 'drive'
            });

            if (response.data.files?.length > 0) {
                return response.data.files[0].id;
            }

            // Create folder
            const fileMetadata = {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId]
            };

            const folder = await this.drive.files.create({
                resource: fileMetadata,
                fields: 'id, name'
            });

            this.logger.debug(`Created folder: ${folderName}`, {
                folderId: folder.data.id,
                parentId
            });

            return folder.data.id;

        } catch (error) {
            this.logger.error(`Failed to ensure folder: ${folderName}`, error);
            throw error;
        }
    }

    /**
     * Create shortcuts
     */
    async _createShortcuts(sourceFolder, shortcuts) {
        if (!shortcuts || !Array.isArray(shortcuts)) return;
        
        for (const shortcut of shortcuts) {
            try {
                const shortcutName = shortcut.name || sourceFolder.name;
                
                // Check if shortcut already exists
                const existing = await this.drive.files.list({
                    q: `name='${shortcutName}' and '${shortcut.parentId}' in parents and mimeType='application/vnd.google-apps.shortcut' and trashed=false`,
                    fields: 'files(id)',
                    spaces: 'drive'
                });
                
                if (existing.data.files?.length > 0) {
                    this.logger.debug('Shortcut already exists', {
                        name: shortcutName,
                        parentId: shortcut.parentId
                    });
                    continue;
                }
                
                // Create shortcut
                await this.drive.files.create({
                    resource: {
                        name: shortcutName,
                        mimeType: 'application/vnd.google-apps.shortcut',
                        shortcutDetails: {
                            targetId: sourceFolder.id
                        },
                        parents: [shortcut.parentId]
                    },
                    fields: 'id, name'
                });
                
                this.logger.debug('Created shortcut', {
                    name: shortcutName,
                    targetFolder: shortcut.parentId,
                    sourceFolder: sourceFolder.id
                });
            } catch (error) {
                this.logger.warn('Failed to create shortcut', error);
                // Don't fail the upload if shortcut creation fails
            }
        }
    }

    /**
     * Get file name based on type
     */
    _getFileName(fileType, standardizedName) {
        const fileNameMap = {
            video: `${standardizedName}.mp4`,
            audio: `${standardizedName}_audio.m4a`,
            transcript: `${standardizedName}_transcript.vtt`,
            timeline: `${standardizedName}_timeline.json`,
            insights: `${standardizedName}_insights.json`,
            outcomes: `${standardizedName}_outcomes.json`,
            summary: `${standardizedName}_summary.txt`,
            highlights: `${standardizedName}_highlights.json`,
            actionItems: `${standardizedName}_action_items.json`,
            coachingNotes: `${standardizedName}_coaching_notes.json`,
            chat: `${standardizedName}_chat.txt`
        };
        
        return fileNameMap[fileType] || fileType;
    }

    /**
     * Get MIME type based on file type
     */
    _getMimeType(fileType, fileName) {
        const mimeTypeMap = {
            video: 'video/mp4',
            audio: 'audio/m4a',
            transcript: 'text/vtt',
            timeline: 'application/json',
            insights: 'application/json',
            outcomes: 'application/json',
            summary: 'text/plain',
            highlights: 'application/json',
            actionItems: 'application/json',
            coachingNotes: 'application/json',
            chat: 'text/plain'
        };
        
        if (mimeTypeMap[fileType]) {
            return mimeTypeMap[fileType];
        }
        
        // Fallback to extension-based detection
        const ext = fileName.split('.').pop().toLowerCase();
        const extMimeMap = {
            'mp4': 'video/mp4',
            'm4a': 'audio/m4a',
            'vtt': 'text/vtt',
            'json': 'application/json',
            'txt': 'text/plain'
        };
        
        return extMimeMap[ext] || 'application/octet-stream';
    }

    /**
     * Calculate file info from uploaded files
     */
    _calculateFileInfo(uploadedFiles) {
        const fileInfo = {};
        let totalSize = 0;
        
        for (const file of uploadedFiles) {
            const fileType = this._getFileTypeFromName(file.name);
            fileInfo[fileType] = {
                id: file.id,
                name: file.name,
                size: parseInt(file.size || 0),
                link: file.webViewLink
            };
            totalSize += parseInt(file.size || 0);
        }
        
        fileInfo.totalSize = totalSize;
        fileInfo.totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
        
        return fileInfo;
    }

    /**
     * Get file type from name
     */
    _getFileTypeFromName(fileName) {
        if (fileName.includes('_transcript')) return 'transcript';
        if (fileName.includes('_audio')) return 'audio';
        if (fileName.includes('_timeline')) return 'timeline';
        if (fileName.includes('_insights')) return 'insights';
        if (fileName.includes('_outcomes')) return 'outcomes';
        if (fileName.includes('_summary')) return 'summary';
        if (fileName.includes('_highlights')) return 'highlights';
        if (fileName.includes('_action_items')) return 'actionItems';
        if (fileName.includes('_coaching_notes')) return 'coachingNotes';
        if (fileName.includes('_chat')) return 'chat';
        if (fileName.endsWith('.mp4')) return 'video';
        return 'other';
    }

    /**
     * Check if folder exists
     */
    async folderExists(folderId) {
        try {
            const response = await this.drive.files.get({
                fileId: folderId,
                fields: 'id, name, trashed'
            });
            
            return response.data && !response.data.trashed;
        } catch (error) {
            if (error.code === 404) {
                return false;
            }
            throw error;
        }
    }

    /**
     * Get file count in folder
     */
    async getFileCount(folderId) {
        try {
            const response = await this.drive.files.list({
                q: `'${folderId}' in parents and trashed=false`,
                fields: 'files(id)',
                pageSize: 1000
            });
            
            return response.data.files?.length || 0;
        } catch (error) {
            this.logger.error('Failed to get file count', error);
            return 0;
        }
    }

    /**
     * Get service health status
     */
    async getHealthStatus() {
        try {
            // Try a simple API call
            await this.drive.files.list({
                pageSize: 1,
                fields: 'files(id)'
            });
            
            return {
                healthy: true,
                authenticated: true
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message
            };
        }
    }
}



module.exports = { GoogleDriveService }; 