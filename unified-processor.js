/**
 * Unified Processor
 * 
 * Processes recordings from both batch (Zoom Cloud) and webhook (real-time) sources
 * Ensures consistency across all recordings regardless of source
 */

require('dotenv').config();
const { ProductionZoomProcessor } = require('./complete-production-processor');
const { WebhookBridge } = require('./src/infrastructure/services/WebhookBridge');
const { createContainer, asClass } = require('awilix');
const { table } = require('table');
const colors = require('colors');

class UnifiedProcessor {
    constructor() {
        this.batchProcessor = null;
        this.webhookBridge = null;
        this.isInitialized = false;
    }

    async initialize() {
        console.log('\n🚀 Initializing Unified Processor...\n');
        
        // Initialize batch processor
        this.batchProcessor = new ProductionZoomProcessor();
        await this.batchProcessor.initialize();
        
        // Register webhook bridge in container
        this.batchProcessor.container.register({
            webhookBridge: asClass(WebhookBridge).singleton()
        });
        
        // Get webhook bridge instance
        this.webhookBridge = this.batchProcessor.container.resolve('webhookBridge');
        
        this.isInitialized = true;
        console.log('✅ Unified Processor initialized successfully\n');
    }

    /**
     * Process recordings from all sources
     */
    async processAllSources(options = {}) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const { mode = 'sync', limit = 10 } = options;
        
        console.log(`\n${'='.repeat(80)}`);
        console.log(`📊 UNIFIED RECORDING PROCESSING`);
        console.log(`Mode: ${mode}`);
        console.log(`${'='.repeat(80)}\n`);

        try {
            // Step 1: Check webhook system health
            console.log('🏥 Checking webhook system health...');
            const health = await this.webhookBridge.checkWebhookHealth();
            console.log(`Webhook System: ${health.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
            if (!health.healthy) {
                console.log(`Error: ${health.error}`);
            }
            console.log();

            // Step 2: Get configuration
            const config = this.webhookBridge.getWebhookConfig();
            console.log('⚙️  Configuration:');
            console.log(`Webhook URL: ${config.baseUrl}`);
            console.log(`Shared Google Drive Folders: ${Object.keys(config.sharedFolders).filter(k => config.sharedFolders[k]).length}`);
            console.log(`Shared Google Sheet: ${config.sharedSheet ? 'Yes' : 'No'}`);
            console.log();

            // Step 3: Sync recordings based on mode
            let processedCount = 0;
            
            if (mode === 'sync' || mode === 'sheets') {
                // Sync from Google Sheets (both systems write to same sheet)
                console.log('📋 Syncing from Google Sheets...');
                const googleSheetsService = this.batchProcessor.container.resolve('googleSheetsService');
                const syncResult = await this.webhookBridge.syncWebhookSheets(googleSheetsService);
                
                if (syncResult.success) {
                    console.log(`Found ${syncResult.recordsCount} recordings in sheet`);
                    
                    // Check which recordings need processing
                    if (syncResult.records && syncResult.records.length > 0) {
                        const needsProcessing = this.identifyRecordingsNeedingProcessing(syncResult.records);
                        console.log(`${needsProcessing.length} recordings need processing or re-processing`);
                        
                        if (needsProcessing.length > 0) {
                            await this.displayRecordingsTable(needsProcessing.slice(0, limit));
                        }
                    }
                }
            }

            if (mode === 'drive' || mode === 'sync') {
                // Import from Google Drive folders
                console.log('\n📁 Importing from Google Drive...');
                const googleDriveService = this.batchProcessor.container.resolve('googleDriveService');
                const driveRecordings = await this.webhookBridge.importFromWebhookDrive(googleDriveService);
                
                console.log(`Found ${driveRecordings.length} recording folders in Drive`);
                
                if (driveRecordings.length > 0) {
                    // Process recordings that aren't in our batch system yet
                    const newRecordings = await this.identifyNewRecordings(driveRecordings);
                    console.log(`${newRecordings.length} new recordings to import`);
                    
                    for (const recording of newRecordings.slice(0, limit)) {
                        await this.importWebhookRecording(recording);
                        processedCount++;
                    }
                }
            }

            if (mode === 'batch') {
                // Run normal batch processing
                console.log('\n🔄 Running batch processing...');
                const batchOptions = {
                    mode: 'recent',
                    limit: limit,
                    dateRange: 7 // Last 7 days
                };
                
                await this.batchProcessor.processAllRecordings(batchOptions);
            }

            // Summary
            console.log(`\n${'='.repeat(80)}`);
            console.log(`✅ UNIFIED PROCESSING COMPLETE`);
            console.log(`Processed: ${processedCount} recordings`);
            console.log(`${'='.repeat(80)}\n`);

        } catch (error) {
            console.error('\n❌ Unified processing error:', error);
        }
    }

    /**
     * Identify recordings that need processing
     */
    identifyRecordingsNeedingProcessing(records) {
        return records.filter(record => {
            // Check if recording needs processing based on status fields
            const processingStatus = record['Processing Status'] || record['processing_status'];
            const hasInsights = record['Has AI Insights'] === 'Yes' || record['ai_insights_generated'] === 'true';
            const hasOutcomes = record['Has Tangible Outcomes'] === 'Yes' || record['tangible_outcomes_extracted'] === 'true';
            
            // Need processing if:
            // 1. No processing status or status is 'pending'
            // 2. Missing insights or outcomes
            // 3. Error status
            return !processingStatus || 
                   processingStatus === 'pending' ||
                   processingStatus === 'error' ||
                   !hasInsights ||
                   !hasOutcomes;
        });
    }

    /**
     * Identify new recordings from Drive
     */
    async identifyNewRecordings(driveRecordings) {
        // Check against our batch processor's database/sheet
        const googleSheetsService = this.batchProcessor.container.resolve('googleSheetsService');
        const existingRecords = await googleSheetsService.getAllRecords();
        
        const existingIds = new Set(existingRecords.map(r => r['Recording UUID'] || r['uuid']));
        
        return driveRecordings.filter(recording => {
            // Extract UUID from folder name if possible
            const match = recording.name.match(/_U:([^_]+)$/);
            const uuid = match ? match[1] : null;
            return uuid && !existingIds.has(uuid);
        });
    }

    /**
     * Import a webhook recording into batch processor
     */
    async importWebhookRecording(driveFolder) {
        console.log(`\n📥 Importing: ${driveFolder.name}`);
        
        try {
            // Extract metadata from folder name
            const metadata = this.parseRecordingFolderName(driveFolder.name);
            
            // Create recording object compatible with batch processor
            const recording = {
                uuid: metadata.uuid,
                id: metadata.meetingId,
                topic: metadata.topic || driveFolder.name,
                start_time: metadata.date,
                source: 'webhook_import',
                drive_folder_id: driveFolder.id,
                drive_folder_name: driveFolder.name,
                created_time: driveFolder.createdTime
            };

            // Process through batch processor
            const result = await this.batchProcessor.processRecording(recording);
            
            if (result.success) {
                console.log(`✅ Successfully imported: ${driveFolder.name}`);
            } else {
                console.log(`❌ Failed to import: ${result.error}`);
            }
            
            return result;
        } catch (error) {
            console.error(`Error importing recording:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Parse recording folder name to extract metadata
     */
    parseRecordingFolderName(folderName) {
        // Example: Coaching_JennyDuan_Arshiya_Wk3_2025-06-04_M:87654321_U:abc123==
        const parts = folderName.split('_');
        const metadata = {
            sessionType: parts[0] || 'Unknown',
            coach: parts[1] || 'Unknown',
            student: parts[2] || 'Unknown',
            week: parts[3] || 'WkUnknown',
            date: parts[4] || new Date().toISOString().split('T')[0]
        };

        // Extract meeting ID and UUID
        const meetingMatch = folderName.match(/_M:(\d+)/);
        const uuidMatch = folderName.match(/_U:([^_]+)$/);
        
        if (meetingMatch) metadata.meetingId = meetingMatch[1];
        if (uuidMatch) metadata.uuid = uuidMatch[1];

        return metadata;
    }

    /**
     * Display recordings in a table
     */
    async displayRecordingsTable(recordings) {
        const tableData = [
            ['Type', 'Date', 'Coach', 'Student', 'Status', 'Source'].map(h => colors.bold(h))
        ];

        for (const recording of recordings.slice(0, 10)) {
            tableData.push([
                recording['Session Type'] || recording['session_type'] || 'Unknown',
                recording['Session Date'] || recording['start_time'] || 'Unknown',
                recording['Coach Name'] || recording['coach'] || 'Unknown', 
                recording['Student Name'] || recording['student'] || 'Unknown',
                recording['Processing Status'] || recording['processing_status'] || 'Pending',
                recording['Data Source'] || recording['source'] || 'Unknown'
            ]);
        }

        console.log('\n' + table(tableData));
    }

    /**
     * Shutdown
     */
    async shutdown() {
        if (this.batchProcessor) {
            await this.batchProcessor.shutdown();
        }
    }
}

// CLI interface
async function main() {
    const processor = new UnifiedProcessor();
    
    try {
        // Parse command line arguments
        const args = process.argv.slice(2);
        const mode = args[0] || 'sync';
        const limit = parseInt(args[1]) || 10;

        console.log('\n🎯 Unified Recording Processor');
        console.log('Version: 1.0.0');
        console.log(`Mode: ${mode}`);
        console.log(`Limit: ${limit}`);

        // Show help if requested
        if (mode === 'help' || mode === '--help') {
            console.log('\nUsage: node unified-processor.js [mode] [limit]');
            console.log('\nModes:');
            console.log('  sync    - Sync from both Google Sheets and Drive (default)');
            console.log('  sheets  - Sync only from Google Sheets');
            console.log('  drive   - Import only from Google Drive');
            console.log('  batch   - Run normal batch processing');
            console.log('  help    - Show this help message');
            console.log('\nExamples:');
            console.log('  node unified-processor.js sync 20');
            console.log('  node unified-processor.js sheets');
            console.log('  node unified-processor.js drive 5');
            return;
        }

        // Process recordings
        await processor.processAllSources({ mode, limit });

    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    } finally {
        await processor.shutdown();
    }
}

// Handle process signals
process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nShutting down...');
    process.exit(0);
});

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { UnifiedProcessor };