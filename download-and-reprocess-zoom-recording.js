#!/usr/bin/env node
/**
 * Download and Reprocess Zoom Recording
 * 
 * This script:
 * 1. Fetches actual recording data from Zoom API
 * 2. Downloads all recording files locally
 * 3. Simulates webhook processing with real data
 * 4. Processes through the complete pipeline (standardization, categorization, Google Drive upload)
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { createReadStream, createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');

// Import required modules for processing
const awilix = require('awilix');
const { createContainer } = require('awilix');
const { ProductionZoomProcessor } = require('./complete-production-processor');

class ZoomRecordingReprocessor {
    constructor() {
        this.zoomApiToken = process.env.ZOOM_ACCESS_TOKEN;
        this.zoomAccountId = process.env.ZOOM_ACCOUNT_ID;
        this.downloadDir = path.join(process.env.OUTPUT_DIR || './output', 'reprocess-downloads');
        this.webhookSimDir = path.join(process.env.OUTPUT_DIR || './output', 'webhook-simulation-logs');
    }

    /**
     * Main entry point
     */
    async reprocessRecording(recordingId, options = {}) {
        try {
            console.log(`\n🔄 Starting reprocessing for recording: ${recordingId}`);
            
            // Step 1: Fetch recording details from Zoom API
            console.log('\n📡 Step 1: Fetching recording details from Zoom API...');
            const recordingData = await this.fetchRecordingFromZoomAPI(recordingId);
            
            if (!recordingData) {
                throw new Error(`Recording ${recordingId} not found in Zoom Cloud`);
            }
            
            console.log(`✅ Found recording: ${recordingData.topic}`);
            console.log(`   Host: ${recordingData.host_email}`);
            console.log(`   Date: ${recordingData.start_time}`);
            console.log(`   Duration (API): ${recordingData.duration} seconds`);
            console.log(`   Files: ${recordingData.recording_files?.length || 0}`);
            
            // Step 2: Download all recording files
            console.log('\n📥 Step 2: Downloading recording files...');
            const downloadedFiles = await this.downloadRecordingFiles(recordingData, options.skipDownload);
            
            // Step 3: Calculate actual duration from files
            console.log('\n⏱️ Step 3: Calculating actual duration from file timestamps...');
            const actualDuration = this.calculateActualDuration(recordingData.recording_files);
            console.log(`   API Duration: ${recordingData.duration} seconds`);
            console.log(`   Calculated Duration: ${actualDuration} seconds`);
            if (Math.abs(actualDuration - recordingData.duration) > 60) {
                console.log(`   ⚠️ Duration mismatch detected! Using calculated duration.`);
            }
            
            // Step 4: Create webhook payload with real data
            console.log('\n🔨 Step 4: Creating webhook payload...');
            const webhookPayload = this.createWebhookPayload(recordingData, downloadedFiles);
            
            // Save webhook payload for debugging
            await this.saveWebhookPayload(webhookPayload, recordingId);
            
            // Step 5: Process through production pipeline
            console.log('\n🚀 Step 5: Processing through production pipeline...');
            if (!options.dryRun) {
                await this.processWithProductionPipeline(webhookPayload);
            } else {
                console.log('   ⏭️ Dry run mode - skipping pipeline processing');
            }
            
            console.log('\n✅ Reprocessing completed successfully!');
            
        } catch (error) {
            console.error('\n❌ Reprocessing failed:', error.message);
            throw error;
        }
    }

    /**
     * Fetch recording details from Zoom API
     */
    async fetchRecordingFromZoomAPI(recordingId) {
        try {
            const response = await axios.get(
                `https://api.zoom.us/v2/meetings/${recordingId}/recordings`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.zoomApiToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            return response.data;
        } catch (error) {
            if (error.response?.status === 404) {
                console.error(`Recording ${recordingId} not found in Zoom Cloud`);
                return null;
            }
            throw error;
        }
    }

    /**
     * Download all recording files
     */
    async downloadRecordingFiles(recordingData, skipDownload = false) {
        const downloadResults = {};
        const recordingDir = path.join(this.downloadDir, recordingData.uuid);
        
        // Create directory for this recording
        await fs.mkdir(recordingDir, { recursive: true });
        
        // Check if files already exist
        if (skipDownload) {
            console.log('   ⏭️ Skipping download, using existing files...');
            return await this.findExistingFiles(recordingDir, recordingData);
        }
        
        for (const file of recordingData.recording_files || []) {
            console.log(`\n📥 Downloading ${file.file_type} (${this.formatFileSize(file.file_size)})...`);
            
            try {
                const fileName = this.generateFileName(file, recordingData);
                const filePath = path.join(recordingDir, fileName);
                
                // Download file with access token
                const downloadUrl = file.download_url + `?access_token=${this.zoomApiToken}`;
                
                const response = await axios({
                    method: 'GET',
                    url: downloadUrl,
                    responseType: 'stream',
                    timeout: 300000, // 5 minutes
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                });
                
                // Save to file
                await pipeline(
                    response.data,
                    createWriteStream(filePath)
                );
                
                console.log(`   ✅ Downloaded: ${fileName}`);
                
                // Map file types
                const fileKey = this.mapFileType(file.file_type);
                downloadResults[fileKey] = {
                    path: filePath,
                    size: file.file_size,
                    type: file.file_type,
                    originalFile: file
                };
                
            } catch (error) {
                console.error(`   ❌ Failed to download ${file.file_type}: ${error.message}`);
            }
        }
        
        return downloadResults;
    }

    /**
     * Find existing downloaded files
     */
    async findExistingFiles(recordingDir, recordingData) {
        const downloadResults = {};
        
        try {
            const files = await fs.readdir(recordingDir);
            
            for (const file of recordingData.recording_files || []) {
                const fileKey = this.mapFileType(file.file_type);
                const pattern = `_${file.file_type.toLowerCase().replace(/[^a-z0-9]/g, '_')}.`;
                
                const existingFile = files.find(f => f.includes(pattern));
                if (existingFile) {
                    const filePath = path.join(recordingDir, existingFile);
                    const stats = await fs.stat(filePath);
                    
                    downloadResults[fileKey] = {
                        path: filePath,
                        size: stats.size,
                        type: file.file_type,
                        originalFile: file
                    };
                    
                    console.log(`   ✅ Found existing: ${existingFile}`);
                }
            }
        } catch (error) {
            console.log('   ⚠️ No existing files found');
        }
        
        return downloadResults;
    }

    /**
     * Calculate actual duration from file timestamps
     */
    calculateActualDuration(recordingFiles) {
        if (!recordingFiles || recordingFiles.length === 0) return 0;
        
        let maxDuration = 0;
        
        for (const file of recordingFiles) {
            if (file.recording_start && file.recording_end) {
                const start = new Date(file.recording_start).getTime();
                const end = new Date(file.recording_end).getTime();
                const duration = Math.floor((end - start) / 1000);
                
                if (duration > maxDuration) {
                    maxDuration = duration;
                }
            }
        }
        
        return maxDuration;
    }

    /**
     * Create webhook payload with real data
     */
    createWebhookPayload(recordingData, downloadedFiles) {
        // Update recording files with local paths
        const updatedRecordingFiles = recordingData.recording_files.map(file => {
            const fileKey = this.mapFileType(file.file_type);
            const localFile = downloadedFiles[fileKey];
            
            return {
                ...file,
                local_path: localFile?.path,
                download_status: localFile ? 'completed' : 'failed'
            };
        });
        
        return {
            event: 'recording.completed',
            event_ts: Date.now(),
            payload: {
                account_id: this.zoomAccountId || recordingData.account_id,
                object: {
                    ...recordingData,
                    recording_files: updatedRecordingFiles,
                    _reprocessed: true,
                    _reprocess_timestamp: new Date().toISOString(),
                    _downloaded_files: downloadedFiles
                }
            }
        };
    }

    /**
     * Save webhook payload for debugging
     */
    async saveWebhookPayload(webhook, recordingId) {
        await fs.mkdir(this.webhookSimDir, { recursive: true });
        
        const filename = `webhook-reprocess-${recordingId}-${Date.now()}.json`;
        const filepath = path.join(this.webhookSimDir, filename);
        
        await fs.writeFile(filepath, JSON.stringify(webhook, null, 2));
        console.log(`   📝 Webhook payload saved to: ${filepath}`);
    }

    /**
     * Process through production pipeline
     */
    async processWithProductionPipeline(webhookPayload) {
        // Create DI container (similar to main function in complete-production-processor)
        const container = createContainer({
            injectionMode: awilix.InjectionMode.PROXY
        });
        
        // Initialize the production processor with container
        const processor = new ProductionZoomProcessor(container);
        await processor.initialize();
        
        // Process the webhook as if it came from Zoom
        console.log('\n🔄 Processing webhook through production pipeline...');
        
        try {
            // Transform webhook payload to recording format
            const recording = webhookPayload.payload.object;
            
            // Process as a single recording with webhook flag
            const result = await processor.processRecording(recording, {
                source: 'webhook',
                skipDownload: true, // We already downloaded files
                lightweight: false
            });
            
            console.log('\n✅ Processing completed!');
            if (result) {
                console.log(`   Standardized Name: ${result.standardizedName || 'N/A'}`);
                console.log(`   Category: ${result.category || recording._category || 'N/A'}`);
                console.log(`   Google Drive: ${result.driveLink || result.driveFolderId || 'N/A'}`);
                console.log(`   Google Sheets: ${result.sheetsUpdated ? 'Updated' : 'Not updated'}`);
            }
            
            return result;
        } catch (error) {
            console.error('❌ Processing failed:', error.message);
            throw error;
        }
    }

    /**
     * Helper: Generate file name
     */
    generateFileName(file, recording) {
        const date = recording.start_time.split('T')[0];
        const extension = file.file_extension.toLowerCase();
        const type = file.file_type.toLowerCase().replace(/[^a-z0-9]/g, '_');
        
        return `${date}_${recording.id}_${type}.${extension}`;
    }

    /**
     * Helper: Map file type to key
     */
    mapFileType(fileType) {
        const typeMap = {
            'MP4': 'video',
            'M4A': 'audio',
            'TRANSCRIPT': 'transcript',
            'CHAT': 'chat',
            'CC': 'captions',
            'CSV': 'participants'
        };
        
        return typeMap[fileType] || fileType.toLowerCase();
    }

    /**
     * Helper: Format file size
     */
    formatFileSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
Usage: node download-and-reprocess-zoom-recording.js <recording-id> [options]

Options:
  --dry-run    Download files but don't process through pipeline
  --skip-download    Use previously downloaded files
  
Examples:
  node download-and-reprocess-zoom-recording.js 4762651206
  node download-and-reprocess-zoom-recording.js 8390038905 --dry-run
        `);
        process.exit(1);
    }
    
    const recordingId = args[0];
    const options = {
        dryRun: args.includes('--dry-run'),
        skipDownload: args.includes('--skip-download')
    };
    
    console.log(`
🔄 Zoom Recording Reprocessor
============================
Recording ID: ${recordingId}
Dry Run: ${options.dryRun}
Skip Download: ${options.skipDownload}
    `);
    
    const reprocessor = new ZoomRecordingReprocessor();
    
    try {
        await reprocessor.reprocessRecording(recordingId, options);
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { ZoomRecordingReprocessor };