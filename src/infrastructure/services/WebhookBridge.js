/**
 * WebhookBridge
 * 
 * Bridges the existing webhook system with the batch processor
 * Allows batch processor to fetch and process recordings from the webhook system
 */

const axios = require('axios');
const { Logger } = require('../../shared/logging/logger');
const fs = require('fs').promises;
const path = require('path');

class WebhookBridge {
    constructor(container) {
        this.container = container;
        this.logger = container.resolve('logger') || new Logger();
        this.config = container.resolve('config');
        
        // Webhook system endpoints
        this.webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://zoom-webhook-v2.onrender.com';
        this.webhookApiToken = process.env.WEBHOOK_API_TOKEN || process.env.ADMIN_TOKEN;
    }

    /**
     * Fetch recent recordings from webhook system
     * @param {Object} options - Query options
     * @returns {Array} Array of webhook recordings
     */
    async fetchWebhookRecordings(options = {}) {
        try {
            const { limit = 10, since = null } = options;
            
            this.logger.info(`Fetching webhook recordings from: ${this.webhookBaseUrl}`);
            
            // Call webhook system's stats or recordings endpoint
            const response = await axios.get(`${this.webhookBaseUrl}/stats`, {
                headers: {
                    'Authorization': `Bearer ${this.webhookApiToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            if (response.data && response.data.stats) {
                this.logger.info(`Webhook system stats:`, response.data.stats);
            }

            // Return empty array for now - would need webhook system to expose recordings API
            return [];
        } catch (error) {
            this.logger.error('Error fetching webhook recordings:', error);
            return [];
        }
    }

    /**
     * Import recordings from webhook system's Google Drive
     * Since webhook system already uploads to Drive, we can process from there
     */
    async importFromWebhookDrive(googleDriveService) {
        try {
            this.logger.info('Importing recordings from webhook system Google Drive folders');
            
            // Get folder IDs from config
            const foldersToCheck = [
                { id: process.env.RECORDINGS_ROOT_FOLDER_ID, name: 'Recordings Root' },
                { id: process.env.STUDENTS_FOLDER_ID, name: 'Students' },
                { id: process.env.COACHES_FOLDER_ID, name: 'Coaches' }
            ];

            const recordings = [];
            
            for (const folder of foldersToCheck) {
                if (!folder.id) continue;
                
                this.logger.info(`Checking folder: ${folder.name}`);
                
                // List recent files in the folder
                const files = await googleDriveService.listFiles({
                    folderId: folder.id,
                    pageSize: 100,
                    orderBy: 'createdTime desc',
                    fields: 'files(id,name,mimeType,size,createdTime,parents,webViewLink)'
                });

                // Filter for recording folders (they should have standardized names)
                const recordingFolders = files.filter(file => 
                    file.mimeType === 'application/vnd.google-apps.folder' &&
                    (file.name.includes('Coaching_') || 
                     file.name.includes('MISC_') || 
                     file.name.includes('TRIVIAL_'))
                );

                recordings.push(...recordingFolders);
            }

            this.logger.info(`Found ${recordings.length} recording folders from webhook system`);
            return recordings;
        } catch (error) {
            this.logger.error('Error importing from webhook Drive:', error);
            return [];
        }
    }

    /**
     * Sync webhook system's Google Sheets with batch processor
     */
    async syncWebhookSheets(googleSheetsService) {
        try {
            const webhookSheetId = process.env.WEBHOOK_SHEET_ID || process.env.MASTER_INDEX_SHEET_ID;
            
            if (!webhookSheetId) {
                this.logger.warn('No webhook sheet ID configured');
                return { success: false, error: 'No sheet ID' };
            }

            this.logger.info(`Syncing with webhook system sheet: ${webhookSheetId}`);
            
            // Read data from webhook system's sheet
            const sheetData = await googleSheetsService.getSheetData(webhookSheetId, 'Standardized Master Index');
            
            if (!sheetData || sheetData.length === 0) {
                this.logger.info('No data in webhook sheet');
                return { success: true, recordsCount: 0 };
            }

            // Process sheet data
            const headers = sheetData[0];
            const records = sheetData.slice(1).map(row => {
                const record = {};
                headers.forEach((header, index) => {
                    record[header] = row[index] || '';
                });
                return record;
            });

            this.logger.info(`Found ${records.length} records in webhook sheet`);
            
            return {
                success: true,
                recordsCount: records.length,
                records: records
            };
        } catch (error) {
            this.logger.error('Error syncing webhook sheets:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Create a unified view of recordings from both systems
     */
    async getUnifiedRecordings(batchRecordings = [], webhookRecordings = []) {
        const recordingMap = new Map();
        
        // Add batch recordings
        for (const recording of batchRecordings) {
            const key = `${recording.id}_${recording.uuid}`;
            recordingMap.set(key, {
                ...recording,
                source: 'batch',
                processingSystem: 'batch_processor'
            });
        }

        // Add/merge webhook recordings
        for (const recording of webhookRecordings) {
            const key = `${recording.id}_${recording.uuid}`;
            if (recordingMap.has(key)) {
                // Recording exists in both systems - merge data
                const existing = recordingMap.get(key);
                recordingMap.set(key, {
                    ...existing,
                    ...recording,
                    source: 'both',
                    processingSystem: 'unified',
                    batchData: existing,
                    webhookData: recording
                });
            } else {
                // Only in webhook system
                recordingMap.set(key, {
                    ...recording,
                    source: 'webhook',
                    processingSystem: 'webhook_processor'
                });
            }
        }

        return Array.from(recordingMap.values());
    }

    /**
     * Monitor webhook system health
     */
    async checkWebhookHealth() {
        try {
            const response = await axios.get(`${this.webhookBaseUrl}/health`, {
                timeout: 10000
            });

            return {
                healthy: response.data.status === 'healthy',
                status: response.data.status,
                timestamp: response.data.timestamp,
                environment: response.data.environment
            };
        } catch (error) {
            this.logger.error('Webhook health check failed:', error);
            return {
                healthy: false,
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * Get webhook system configuration
     */
    getWebhookConfig() {
        return {
            baseUrl: this.webhookBaseUrl,
            hasApiToken: !!this.webhookApiToken,
            sharedFolders: {
                recordings: process.env.RECORDINGS_ROOT_FOLDER_ID,
                students: process.env.STUDENTS_FOLDER_ID,
                coaches: process.env.COACHES_FOLDER_ID,
                misc: process.env.MISC_FOLDER_ID,
                trivial: process.env.TRIVIAL_FOLDER_ID
            },
            sharedSheet: process.env.MASTER_INDEX_SHEET_ID
        };
    }
}

module.exports = { WebhookBridge };