#!/usr/bin/env node

/**
 * Comprehensive Recording Reprocessing Script
 * 
 * This script will:
 * 1. List all recordings from Zoom Cloud
 * 2. Generate a comprehensive CSV with all recordings
 * 3. Process all recordings using the complete production processor
 * 4. Ensure all gates are properly executed
 * 5. Provide detailed progress tracking and reporting
 */

const { ProductionZoomProcessor } = require('./complete-production-processor');
const fs = require('fs').promises;
const path = require('path');

class ComprehensiveReprocessing {
    constructor() {
        this.processor = null;
        this.results = {
            total: 0,
            processed: 0,
            failed: 0,
            skipped: 0,
            errors: []
        };
        this.startTime = null;
        this.csvFile = null;
    }

    async initialize() {
        console.log('🚀 Initializing Comprehensive Reprocessing...');
        
        try {
            this.processor = new ProductionZoomProcessor();
            await this.processor.initialize();
            
            console.log('✅ Production processor initialized successfully');
            console.log('✅ All services loaded and ready');
            
        } catch (error) {
            console.error('❌ Failed to initialize processor:', error);
            throw error;
        }
    }

    async generateCompleteRecordingList() {
        console.log('\n📋 Generating complete recording list from Zoom Cloud...');
        
        try {
            // Step 1: Test Zoom API access
            console.log('🔍 Step 1: Testing Zoom API access...');
            const testResult = await this.processor.processAllRecordings({
                mode: 'test',
                limit: 1,
                dryRun: true
            });
            
            if (!testResult.success) {
                throw new Error('Zoom API access test failed');
            }
            
            console.log('✅ Zoom API access verified');
            
            // Step 2: Generate comprehensive list
            console.log('\n📊 Step 2: Generating comprehensive recording list...');
            
            // Get recordings from different time periods to ensure we capture everything
            const timeRanges = [
                { name: 'Last 7 days', days: 7 },
                { name: 'Last 30 days', days: 30 },
                { name: 'Last 90 days', days: 90 },
                { name: 'Last 180 days', days: 180 },
                { name: 'Last 365 days', days: 365 }
            ];
            
            let allRecordings = [];
            let uniqueRecordings = new Map();
            
            for (const range of timeRanges) {
                console.log(`   📅 Fetching recordings from ${range.name}...`);
                
                try {
                    const recordings = await this.processor._getRecordingsByDateRange(
                        this.getDateDaysAgo(range.days),
                        new Date().toISOString().split('T')[0],
                        1000 // High limit to get all recordings
                    );
                    
                    console.log(`   📊 Found ${recordings.length} recordings in ${range.name}`);
                    
                    // Add unique recordings
                    for (const recording of recordings) {
                        const key = recording.id || recording.uuid;
                        if (key && !uniqueRecordings.has(key)) {
                            uniqueRecordings.set(key, recording);
                        }
                    }
                    
                } catch (error) {
                    console.log(`   ⚠️  Error fetching ${range.name}: ${error.message}`);
                }
            }
            
            allRecordings = Array.from(uniqueRecordings.values());
            console.log(`\n📊 Total unique recordings found: ${allRecordings.length}`);
            
            // Step 3: Generate CSV file
            console.log('\n📄 Step 3: Generating comprehensive CSV file...');
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            this.csvFile = `comprehensive-recordings-${timestamp}.csv`;
            
            const csvContent = this.generateCSV(allRecordings);
            await fs.writeFile(this.csvFile, csvContent);
            
            console.log(`✅ Comprehensive CSV generated: ${this.csvFile}`);
            console.log(`📊 Total recordings in CSV: ${allRecordings.length}`);
            
            // Step 4: Display summary
            this.displayRecordingSummary(allRecordings);
            
            return allRecordings;
            
        } catch (error) {
            console.error('❌ Failed to generate recording list:', error);
            throw error;
        }
    }

    async processAllRecordings(recordings, options = {}) {
        console.log('\n🔄 Starting comprehensive processing of all recordings...');
        
        this.startTime = Date.now();
        this.results.total = recordings.length;
        
        const { autoApprove = false, batchSize = 10 } = options;
        
        console.log(`📊 Processing ${recordings.length} recordings`);
        console.log(`⚙️  Batch size: ${batchSize}`);
        console.log(`✅ Auto-approve: ${autoApprove ? 'Yes' : 'No'}`);
        
        // Process in batches to avoid overwhelming the system
        for (let i = 0; i < recordings.length; i += batchSize) {
            const batch = recordings.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(recordings.length / batchSize);
            
            console.log(`\n📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} recordings)`);
            
            for (const recording of batch) {
                try {
                    const result = await this.processSingleRecording(recording, i + batch.indexOf(recording) + 1);
                    
                    if (result.success) {
                        this.results.processed++;
                        console.log(`   ✅ [${i + batch.indexOf(recording) + 1}/${recordings.length}] Processed: ${recording.topic || recording.id}`);
                    } else {
                        this.results.failed++;
                        this.results.errors.push({
                            recording: recording.id || recording.uuid,
                            error: result.error
                        });
                        console.log(`   ❌ [${i + batch.indexOf(recording) + 1}/${recordings.length}] Failed: ${recording.topic || recording.id} - ${result.error}`);
                    }
                    
                } catch (error) {
                    this.results.failed++;
                    this.results.errors.push({
                        recording: recording.id || recording.uuid,
                        error: error.message
                    });
                    console.log(`   💥 [${i + batch.indexOf(recording) + 1}/${recordings.length}] Error: ${recording.topic || recording.id} - ${error.message}`);
                }
                
                // Add small delay between recordings to avoid rate limiting
                await this.sleep(1000);
            }
            
            // Add delay between batches
            if (i + batchSize < recordings.length) {
                console.log(`   ⏳ Waiting 5 seconds before next batch...`);
                await this.sleep(5000);
            }
        }
        
        this.generateFinalReport();
    }

    async processSingleRecording(recording, index) {
        try {
            // Use the complete production processor with all gates
            const result = await this.processor.processRecording(recording, {
                skipGates: false, // Ensure all gates are executed
                verbose: true
            });
            
            return result;
            
        } catch (error) {
            return {
                success: false,
                error: error.message,
                recordingId: recording.id || recording.uuid
            };
        }
    }

    generateCSV(recordings) {
        const headers = [
            'Index',
            'ID',
            'UUID',
            'Topic',
            'Start Time',
            'Duration (seconds)',
            'Host Email',
            'Participant Count',
            'Recording Type',
            'File Size (bytes)',
            'Status',
            'Created Time'
        ];
        
        const rows = recordings.map((recording, index) => [
            index + 1,
            recording.id || '',
            recording.uuid || '',
            recording.topic || '',
            recording.start_time || '',
            recording.duration || '',
            recording.host_email || '',
            recording.participant_count || '',
            recording.recording_type || '',
            recording.file_size || '',
            recording.status || '',
            recording.created_time || ''
        ]);
        
        return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    }

    displayRecordingSummary(recordings) {
        console.log('\n📊 RECORDING SUMMARY:');
        console.log('=' .repeat(60));
        console.log(`Total Recordings: ${recordings.length}`);
        
        // Group by date
        const byDate = {};
        recordings.forEach(recording => {
            const date = recording.start_time ? recording.start_time.split('T')[0] : 'Unknown';
            byDate[date] = (byDate[date] || 0) + 1;
        });
        
        console.log('\n📅 Recordings by Date:');
        Object.entries(byDate)
            .sort(([a], [b]) => b.localeCompare(a))
            .slice(0, 10)
            .forEach(([date, count]) => {
                console.log(`   ${date}: ${count} recordings`);
            });
        
        // Group by host
        const byHost = {};
        recordings.forEach(recording => {
            const host = recording.host_email || 'Unknown';
            byHost[host] = (byHost[host] || 0) + 1;
        });
        
        console.log('\n👤 Recordings by Host:');
        Object.entries(byHost)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .forEach(([host, count]) => {
                console.log(`   ${host}: ${count} recordings`);
            });
        
        console.log('=' .repeat(60));
    }

    generateFinalReport() {
        const endTime = Date.now();
        const duration = endTime - this.startTime;
        const durationMinutes = Math.round(duration / 60000 * 100) / 100;
        
        console.log('\n📊 COMPREHENSIVE REPROCESSING COMPLETE');
        console.log('=' .repeat(60));
        console.log(`Total Recordings: ${this.results.total}`);
        console.log(`Successfully Processed: ${this.results.processed}`);
        console.log(`Failed: ${this.results.failed}`);
        console.log(`Skipped: ${this.results.skipped}`);
        console.log(`Success Rate: ${Math.round((this.results.processed / this.results.total) * 100)}%`);
        console.log(`Duration: ${durationMinutes} minutes`);
        
        if (this.results.errors.length > 0) {
            console.log('\n❌ ERRORS ENCOUNTERED:');
            this.results.errors.slice(0, 10).forEach(error => {
                console.log(`   ${error.recording}: ${error.error}`);
            });
            
            if (this.results.errors.length > 10) {
                console.log(`   ... and ${this.results.errors.length - 10} more errors`);
            }
        }
        
        // Save detailed report
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                total: this.results.total,
                processed: this.results.processed,
                failed: this.results.failed,
                skipped: this.results.skipped,
                successRate: Math.round((this.results.processed / this.results.total) * 100),
                duration: durationMinutes
            },
            errors: this.results.errors,
            csvFile: this.csvFile
        };
        
        const reportFile = `reprocessing-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        fs.writeFile(reportFile, JSON.stringify(report, null, 2))
            .then(() => console.log(`\n📄 Detailed report saved: ${reportFile}`))
            .catch(err => console.log(`\n⚠️  Could not save report: ${err.message}`));
        
        console.log('\n🎉 Reprocessing completed!');
        console.log('📁 Check Google Drive for processed recordings');
        console.log('📊 Check Google Sheets for updated data');
    }

    getDateDaysAgo(days) {
        const date = new Date();
        date.setDate(date.getDate() - days);
        return date.toISOString().split('T')[0];
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async run(options = {}) {
        try {
            console.log('🚀 COMPREHENSIVE RECORDING REPROCESSING');
            console.log('=' .repeat(60));
            console.log('This will reprocess ALL recordings from Zoom Cloud');
            console.log('using the complete production processor with all gates');
            console.log('=' .repeat(60));
            
            await this.initialize();
            
            // Generate complete recording list
            const recordings = await this.generateCompleteRecordingList();
            
            if (recordings.length === 0) {
                console.log('\n⚠️  No recordings found. Exiting.');
                return;
            }
            
            // Ask for confirmation unless auto-approve is enabled
            if (!options.autoApprove) {
                const readline = require('readline');
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                
                const answer = await new Promise(resolve => {
                    rl.question(`\n🔍 Review the recording list above. Type YES to proceed with processing ${recordings.length} recordings: `, resolve);
                });
                
                rl.close();
                
                if (answer.toUpperCase() !== 'YES') {
                    console.log('\n❌ Processing cancelled by user.');
                    return;
                }
            }
            
            // Process all recordings
            await this.processAllRecordings(recordings, options);
            
        } catch (error) {
            console.error('\n❌ Reprocessing failed:', error);
            process.exit(1);
        }
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
    autoApprove: args.includes('--auto-approve'),
    batchSize: parseInt(args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1]) || 10,
    dryRun: args.includes('--dry-run')
};

// Run the reprocessing
if (require.main === module) {
    const reprocessing = new ComprehensiveReprocessing();
    reprocessing.run(options).catch(console.error);
}

module.exports = { ComprehensiveReprocessing }; 