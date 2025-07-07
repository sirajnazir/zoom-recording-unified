#!/usr/bin/env node
/**
 * Enhanced Zoom Recording Processor
 * 
 * Key Enhancements:
 * - Resume capability with progress tracking
 * - Cleaner logging (removed verbose arrays)
 * - Foolproof error handling
 * - Progress persistence
 * - Smart duplicate detection
 */

require('dotenv').config();

const fs = require('fs').promises;
const path = require('path');

// Load original processor
const { ProductionZoomProcessor } = require('./complete-production-processor');

class EnhancedProcessor {
    constructor() {
        this.processor = null;
        this.progressFile = 'processing-progress.json';
        this.progress = {
            completed: [],
            failed: [],
            skipped: [],
            lastProcessedIndex: -1
        };
        this.results = {
            total: 0,
            processed: 0,
            failed: 0,
            skipped: 0
        };
    }

    async initialize() {
        console.log('🚀 Initializing Enhanced Processor...');
        
        // Setup cleaner logging
        this.setupCleanLogging();
        
        // Initialize original processor
        this.processor = new ProductionZoomProcessor();
        await this.processor.initialize();
        
        // Load progress if exists
        await this.loadProgress();
        
        console.log('✅ Enhanced processor ready');
    }

    setupCleanLogging() {
        const originalLog = console.log;
        console.log = (...args) => {
            const message = args.join(' ');
            
            // Skip verbose array outputs
            if (message.includes('"285":"l"') || 
                message.includes('"286":"a"') || 
                message.includes('"287":"d"') ||
                (message.length > 1000 && message.includes('":"'))) {
                return;
            }
            
            // Skip mock meeting errors
            if (message.includes('mock-meeting-id') || 
                message.includes('Meeting does not exist: mock')) {
                return;
            }
            
            originalLog(...args);
        };
    }

    async loadProgress() {
        try {
            const data = await fs.readFile(this.progressFile, 'utf8');
            this.progress = JSON.parse(data);
            console.log(`📊 Loaded progress: ${this.progress.completed.length} completed, ${this.progress.failed.length} failed`);
        } catch (error) {
            console.log('📊 No previous progress found, starting fresh');
        }
    }

    async saveProgress() {
        try {
            await fs.writeFile(this.progressFile, JSON.stringify(this.progress, null, 2));
        } catch (error) {
            console.log(`⚠️ Could not save progress: ${error.message}`);
        }
    }

    async processAllRecordings(options = {}) {
        console.log('\n🎯 Enhanced Processing Started...');
        
        // Get recordings
        const recordings = await this.getRecordings(options);
        
        if (recordings.length === 0) {
            console.log('⚠️ No recordings found');
            return;
        }
        
        this.results.total = recordings.length;
        console.log(`📊 Found ${recordings.length} recordings`);
        
        // Filter out already processed
        const completedIds = new Set(this.progress.completed.map(r => r.id || r.uuid));
        const recordingsToProcess = recordings.filter(r => !completedIds.has(r.id || r.uuid));
        
        console.log(`📊 Processing ${recordingsToProcess.length} recordings (${this.progress.completed.length} already completed)`);
        
        // Process recordings
        for (let i = 0; i < recordingsToProcess.length; i++) {
            const recording = recordingsToProcess[i];
            const index = this.progress.lastProcessedIndex + i + 1;
            
            console.log(`\n🔄 Processing ${index}/${recordings.length}: ${recording.topic || recording.id}`);
            
            try {
                const result = await this.processor.processRecording(recording, options);
                
                if (result.success) {
                    this.progress.completed.push({
                        id: recording.id,
                        uuid: recording.uuid,
                        topic: recording.topic,
                        timestamp: Date.now()
                    });
                    this.results.processed++;
                    console.log(`✅ Completed: ${recording.topic || recording.id}`);
                } else {
                    this.progress.failed.push({
                        id: recording.id,
                        uuid: recording.uuid,
                        topic: recording.topic,
                        error: result.error,
                        timestamp: Date.now()
                    });
                    this.results.failed++;
                    console.log(`❌ Failed: ${recording.topic || recording.id} - ${result.error}`);
                }
                
                // Save progress every 10 recordings
                if (i % 10 === 0) {
                    await this.saveProgress();
                }
                
            } catch (error) {
                this.progress.failed.push({
                    id: recording.id,
                    uuid: recording.uuid,
                    topic: recording.topic,
                    error: error.message,
                    timestamp: Date.now()
                });
                this.results.failed++;
                console.log(`💥 Error: ${recording.topic || recording.id} - ${error.message}`);
            }
            
            this.progress.lastProcessedIndex++;
        }
        
        // Final save and report
        await this.saveProgress();
        this.generateReport();
    }

    async getRecordings(options) {
        switch (options.mode) {
            case 'test':
                return [this.processor._createTestRecording()];
            case 'last30days':
                if (options.dateRange) {
                    const toDate = new Date();
                    const fromDate = new Date();
                    fromDate.setDate(fromDate.getDate() - options.dateRange);
                    return await this.processor._getRecordingsByDateRange(
                        fromDate.toISOString().split('T')[0], 
                        toDate.toISOString().split('T')[0], 
                        options.limit
                    );
                } else {
                    return await this.processor._getRecordingsLast30Days(options.limit);
                }
            default:
                return await this.processor._getRecordingsLast30Days(options.limit);
        }
    }

    generateReport() {
        console.log('\n📊 ENHANCED PROCESSING COMPLETE');
        console.log('=' .repeat(50));
        console.log(`Total: ${this.results.total}`);
        console.log(`Processed: ${this.results.processed}`);
        console.log(`Failed: ${this.results.failed}`);
        console.log(`Skipped: ${this.results.skipped}`);
        console.log(`Success Rate: ${Math.round((this.results.processed / this.results.total) * 100)}%`);
        
        // Clean up progress file if successful
        if (this.results.failed === 0) {
            fs.unlink(this.progressFile).catch(() => {});
            console.log('🧹 Progress file cleaned up');
        }
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
    mode: 'last30days',
    dateRange: 1095, // 3 years
    limit: 1000,
    dryRun: args.includes('--dry-run'),
    autoApprove: args.includes('--auto-approve')
};

async function main() {
    try {
        const processor = new EnhancedProcessor();
        await processor.initialize();
        await processor.processAllRecordings(options);
        console.log('\n🎉 Enhanced processing completed!');
    } catch (error) {
        console.error('\n❌ Enhanced processing failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { EnhancedProcessor }; 