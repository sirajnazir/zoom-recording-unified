// src/infrastructure/services/GoogleDriveService.js
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const { DriveIntegrationError } = require('../../shared/errors');
const stream = require('stream');

class GoogleDriveService {
    constructor({ logger, config, cache, eventBus }) {
        this.logger = logger;
        this.config = config;
        this.cache = cache;
        this.eventBus = eventBus;
        this.drive = null;
        this.isInitialized = false;
    }

    async initialize() {
        try {
            // Check if we have service account credentials
            if (this.config.google?.clientEmail && this.config.google?.privateKey) {
                // Use JWT authentication with impersonation for service account
                const jwtClient = new google.auth.JWT({
                    email: this.config.google.clientEmail,
                    key: this.config.google.privateKey,
                    scopes: ['https://www.googleapis.com/auth/drive'],
                    subject: 'contact@ivymentors.co' // Impersonate the admin user to access 24TB storage pool
                });
                
                // Authorize the JWT client
                await jwtClient.authorize();
                
                this.drive = google.drive({ version: 'v3', auth: jwtClient });
                this.isInitialized = true;
                
                // Test connection
                await this.testConnection();
                
                this.logger.info('Google Drive service initialized successfully with JWT impersonation');
            } else if (this.config.google?.credentialsBase64 && this.config.google?.tokenBase64) {
                // Original OAuth2 flow
                const credentials = JSON.parse(
                    Buffer.from(this.config.google.credentialsBase64, 'base64').toString()
                );
                
                const token = JSON.parse(
                    Buffer.from(this.config.google.tokenBase64, 'base64').toString()
                );
                
                const { client_id, client_secret, redirect_uris } = credentials.installed;
                const oAuth2Client = new google.auth.OAuth2(
                    client_id,
                    client_secret,
                    redirect_uris[0]
                );
                
                oAuth2Client.setCredentials({
                    access_token: token.token,
                    refresh_token: token.refresh_token,
                    scope: token.scopes.join(' '),
                    token_type: 'Bearer',
                    expiry_date: new Date(token.expiry).getTime()
                });
                
                oAuth2Client.on('tokens', (tokens) => {
                    this.logger.info('Token refreshed', { 
                        expiry: new Date(tokens.expiry_date) 
                    });
                    if (this.eventBus) {
                        this.eventBus.emit('google.token.refreshed', tokens);
                    }
                });
                
                this.drive = google.drive({ version: 'v3', auth: oAuth2Client });
                this.isInitialized = true;
                
                await this.testConnection();
                
                this.logger.info('Google Drive service initialized successfully with OAuth2');
            } else {
                throw new Error('No valid Google Drive credentials found in config');
            }
        } catch (error) {
            this.logger.error('Failed to initialize Google Drive service', {
                error: error.message || error.toString(),
                code: error.code,
                errors: error.errors,
                response: error.response?.data
            });
            throw new DriveIntegrationError('Failed to initialize Google Drive service', error);
        }
    }

    async testConnection() {
        try {
            const response = await this.drive.files.list({
                pageSize: 1,
                fields: 'files(id, name)'
            });
            return true;
        } catch (error) {
            throw new DriveIntegrationError('Failed to connect to Google Drive', error);
        }
    }

    async uploadFile(filePath, metadata) {
        if (!this.isInitialized) await this.initialize();
        
        const startTime = Date.now();
        const maxRetries = 3;
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const fileSize = (await fs.stat(filePath)).size;
                const media = {
                    mimeType: metadata.mimeType || 'application/octet-stream',
                    body: await this._createReadStream(filePath)
                };

                const fileMetadata = {
                    name: metadata.name,
                    parents: metadata.parents || [this.config.google.drive.recordingsRootFolderId]
                };

                if (metadata.description) {
                    fileMetadata.description = metadata.description;
                }

                const response = await this.drive.files.create({
                    requestBody: fileMetadata,
                    media: media,
                    fields: 'id, name, webViewLink, webContentLink, size',
                    timeout: 600000 // 10 minutes timeout for large files
                });

                const uploadTime = Date.now() - startTime;
                
                this.logger.info('File uploaded successfully', {
                    fileId: response.data.id,
                    fileName: response.data.name,
                    uploadTime,
                    fileSize,
                    attempt
                });

                this.eventBus.emit('drive.file.uploaded', {
                    fileId: response.data.id,
                    metadata,
                    uploadTime,
                    fileSize
                });

                return response.data;
            } catch (error) {
                lastError = error;
                this.logger.warn(`Upload attempt ${attempt} failed for ${metadata.name}`, {
                    error: error.message,
                    fileSize: (await fs.stat(filePath)).size,
                    attempt,
                    maxRetries
                });
                
                if (attempt < maxRetries) {
                    // Exponential backoff: 2s, 4s, 8s
                    const delay = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
                    this.logger.info(`Retrying upload in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        // All retries failed
        this.logger.error('Failed to upload file after all retries', { 
            filePath, 
            metadata, 
            error: lastError.message,
            fileSize: (await fs.stat(filePath)).size
        });
        throw new DriveIntegrationError('Failed to upload file to Google Drive after all retries', lastError);
    }

    async createFolder(name, parentId = null) {
        if (!this.isInitialized) await this.initialize();
        
        try {
            const fileMetadata = {
                name: name,
                mimeType: 'application/vnd.google-apps.folder',
                parents: parentId ? [parentId] : [this.config.google.drive.recordingsRootFolderId]
            };

            const response = await this.drive.files.create({
                requestBody: fileMetadata,
                fields: 'id, name, webViewLink'
            });

            this.logger.info('Folder created successfully', {
                folderId: response.data.id,
                folderName: response.data.name
            });

            return response.data;
        } catch (error) {
            this.logger.error('Failed to create folder', { name, parentId, error });
            throw new DriveIntegrationError('Failed to create folder in Google Drive', error);
        }
    }

    async createShortcut(targetFolderId, parentFolderId, shortcutName) {
        if (!this.isInitialized) await this.initialize();
        
        try {
            const shortcutMetadata = {
                name: shortcutName,
                mimeType: 'application/vnd.google-apps.shortcut',
                parents: [parentFolderId],
                shortcutDetails: {
                    targetId: targetFolderId,
                    targetMimeType: 'application/vnd.google-apps.folder'
                }
            };

            const response = await this.drive.files.create({
                requestBody: shortcutMetadata,
                fields: 'id, name, webViewLink, shortcutDetails'
            });

            this.logger.info('Shortcut created successfully', {
                shortcutId: response.data.id,
                shortcutName: response.data.name,
                targetId: response.data.shortcutDetails?.targetId
            });

            return response.data;
        } catch (error) {
            this.logger.error('Failed to create shortcut', { 
                targetFolderId, 
                parentFolderId, 
                shortcutName, 
                error: error.message 
            });
            throw new DriveIntegrationError('Failed to create shortcut in Google Drive', error);
        }
    }

    async findFolder(name, parentId = null) {
        if (!this.isInitialized) await this.initialize();
        
        const cacheKey = `folder:${name}:${parentId}`;
        const cached = await this.cache.get(cacheKey);
        if (cached) return cached;

        try {
            // Escape the folder name for the query
            const escapedName = name.replace(/'/g, "\\'");
            
            const query = [
                `name = '${escapedName}'`,
                `mimeType = 'application/vnd.google-apps.folder'`,
                'trashed = false'
            ];

            if (parentId) {
                query.push(`'${parentId}' in parents`);
            }

            const response = await this.drive.files.list({
                q: query.join(' and '),
                fields: 'files(id, name, webViewLink)',
                pageSize: 1
            });

            if (response.data.files.length > 0) {
                const folder = response.data.files[0];
                await this.cache.set(cacheKey, folder, 3600); // Cache for 1 hour
                return folder;
            }

            return null;
        } catch (error) {
            this.logger.error('Failed to find folder', { name, parentId, error });
            throw new DriveIntegrationError('Failed to search for folder', error);
        }
    }

    async getOrCreateFolder(name, parentId = null) {
        let folder = await this.findFolder(name, parentId);
        
        if (!folder) {
            folder = await this.createFolder(name, parentId);
            
            // Add a small delay to allow Google Drive API to propagate
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Try to find the folder again after creation
            const foundFolder = await this.findFolder(name, parentId);
            if (foundFolder) {
                return foundFolder;
            }
            
            // If still not found, return the created folder
            return folder;
        }
        
        return folder;
    }

    async shareFile(fileId, email, role = 'reader') {
        if (!this.isInitialized) await this.initialize();
        
        try {
            const permission = {
                type: 'user',
                role: role,
                emailAddress: email
            };

            await this.drive.permissions.create({
                fileId: fileId,
                requestBody: permission,
                sendNotificationEmail: true
            });

            this.logger.info('File shared successfully', { fileId, email, role });
        } catch (error) {
            this.logger.error('Failed to share file', { fileId, email, error });
            throw new DriveIntegrationError('Failed to share file', error);
        }
    }

    async deleteFile(fileId) {
        if (!this.isInitialized) await this.initialize();
        
        try {
            await this.drive.files.delete({ fileId });
            this.logger.info('File deleted successfully', { fileId });
        } catch (error) {
            this.logger.error('Failed to delete file', { fileId, error });
            throw new DriveIntegrationError('Failed to delete file', error);
        }
    }

    async _createReadStream(filePath) {
        const fileStream = require('fs').createReadStream(filePath);
        const passThrough = new stream.PassThrough();
        
        fileStream.pipe(passThrough);
        
        return passThrough;
    }

    async organizeRecordingFiles(recording, files) {
        // Handle different date formats and validate
        let sessionDate;
        try {
            const startTime = recording.start_time || recording.startTime;
            if (!startTime) {
                sessionDate = new Date().toISOString().split('T')[0];
            } else {
                sessionDate = new Date(startTime).toISOString().split('T')[0];
            }
        } catch (error) {
            this.logger.warn('Invalid date format, using current date', { startTime: recording.start_time || recording.startTime });
            sessionDate = new Date().toISOString().split('T')[0];
        }
        
        const sanitizedTopic = recording.topic.replace(/[<>:"/\\|?*]/g, '-');
        
        // Create session folder
        const sessionFolderName = `${sanitizedTopic}-${sessionDate}`;
        const parentFolderId = this._determineParentFolder(recording);
        
        const sessionFolder = await this.getOrCreateFolder(
            sessionFolderName, 
            parentFolderId
        );

        const uploadedFiles = {};
        
        for (const [type, filePath] of Object.entries(files)) {
            if (!filePath) continue;
            
            const fileName = path.basename(filePath);
            const mimeType = this._getMimeType(fileName);
            
            const uploadedFile = await this.uploadFile(filePath, {
                name: fileName,
                parents: [sessionFolder.id],
                mimeType,
                description: `${type} for ${recording.topic} on ${sessionDate}`
            });
            
            uploadedFiles[type] = uploadedFile;
        }

        return {
            sessionFolder,
            files: uploadedFiles
        };
    }

    _determineParentFolder(recording) {
        const topic = recording.topic.toLowerCase();
        
        if (topic.includes('coach') || topic.includes('mentor')) {
            return this.config.google.drive.coachesFolderId;
        } else if (topic.includes('student') || topic.includes('ivylevel')) {
            return this.config.google.drive.studentsFolderId;
        } else if (topic.includes('test') || topic.includes('trivial')) {
            return this.config.google.drive.trivialFolderId;
        } else {
            return this.config.google.drive.miscFolderId;
        }
    }

    _getMimeType(fileName) {
        const ext = path.extname(fileName).toLowerCase();
        const mimeTypes = {
            '.mp4': 'video/mp4',
            '.txt': 'text/plain',
            '.json': 'application/json',
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        };
        
        return mimeTypes[ext] || 'application/octet-stream';
    }

    async getHealthStatus() {
        if (!this.isInitialized) {
            return { healthy: false, message: 'Not initialized' };
        }
        
        try {
            await this.drive.files.list({ pageSize: 1 });
            return { healthy: true, message: 'Connected to Google Drive' };
        } catch (error) {
            return { healthy: false, message: error.message };
        }
    }
}

module.exports = { GoogleDriveService };