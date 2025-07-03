#!/usr/bin/env node

/**
 * Generate CSV and Process All Recordings
 * 
 * This script will:
 * 1. Use complete-production-processor to generate comprehensive CSV
 * 2. Process all recordings using the complete production processor
 * 3. Ensure parallel console output and file logging
 * 4. Provide detailed progress tracking and reporting
 */

const { ProductionZoomProcessor } = require('./complete-production-processor');
const fs = require('fs').promises;

class CSVGeneratorAndProcessor {
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
        this.logFile = null;
        this.logStream = null;
    }

    async initialize() {
        console.log('🚀 Initializing CSV Generator and Processor...');
        
        // Create logs directory if it doesn't exist
        await fs.mkdir('logs', { recursive: true });
        
        // Setup logging
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.logFile = `logs/processing-${timestamp}.log`;
        this.logStream = require('fs').createWriteStream(this.logFile, { flags: 'a' });
        
        this.log('🚀 Initializing CSV Generator and Processor...');
        
        try {
            this.processor = new ProductionZoomProcessor();
            await this.processor.initialize();
            
            this.log('✅ Production processor initialized successfully');
            this.log('✅ All services loaded and ready');
            console.log('✅ Production processor initialized successfully');
            console.log('✅ All services loaded and ready');
            
        } catch (error) {
            this.log('❌ Failed to initialize processor:', error);
            console.error('❌ Failed to initialize processor:', error);
            throw error;
        }
    }

    log(message, ...args) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message} ${args.join(' ')}`;
        
        // Write to log file
        if (this.logStream) {
            this.logStream.write(logMessage + '\n');
        }
        
        // Also output to console
        console.log(message, ...args);
    }

    async generateComprehensiveCSV() {
        this.log('\n📋 Generating comprehensive CSV from Zoom Cloud...');
        
        try {
            // Step 1: Test Zoom API access
            this.log('🔍 Step 1: Testing Zoom API access...');
            const testResult = await this.processor.processAllRecordings({
                mode: 'test',
                limit: 1,
                dryRun: true
            });
            
            if (!testResult.success) {
                throw new Error('Zoom API access test failed');
            }
            
            this.log('✅ Zoom API access verified');
            
            // Step 2: Generate comprehensive list using the processor
            this.log('\n📊 Step 2: Generating comprehensive recording list...');
            
            // Use the processor's method to get all recordings
            const allRecordings = await this.processor.getAllRecordings();
            
            this.log(`📊 Total recordings found: ${allRecordings.length}`);
            
            // Step 3: Generate CSV file FIRST (before any processing)
            this.log('\n📄 Step 3: Generating comprehensive CSV file...');
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            this.csvFile = `comprehensive-recordings-${timestamp}.csv`;
            
            const csvContent = this.generateCSV(allRecordings);
            await fs.writeFile(this.csvFile, csvContent);
            
            this.log(`✅ Comprehensive CSV generated: ${this.csvFile}`);
            this.log(`📊 Total recordings in CSV: ${allRecordings.length}`);
            
            // Step 4: Display summary
            this.displayRecordingSummary(allRecordings);
            
            return allRecordings;
            
        } catch (error) {
            this.log('❌ Failed to generate recording list:', error);
            throw error;
        }
    }

    async processAllRecordings(recordings, options = {}) {
        this.log('\n🔄 Starting comprehensive processing of all recordings...');
        
        this.startTime = Date.now();
        this.results.total = recordings.length;
        
        const { autoApprove = false, batchSize = 10 } = options;
        
        this.log(`📊 Processing ${recordings.length} recordings`);
        this.log(`⚙️  Batch size: ${batchSize}`);
        this.log(`✅ Auto-approve: ${autoApprove ? 'Yes' : 'No'}`);
        
        // Use the processor's batch processing method
        const result = await this.processor.processAllRecordings({
            recordings: recordings,
            batchSize: batchSize,
            skipGates: false, // Ensure all gates are executed
            verbose: true,
            logCallback: (message, ...args) => {
                this.log(message, ...args);
            }
        });
        
        // Update results from processor
        this.results = {
            total: recordings.length,
            processed: result.processed || 0,
            failed: result.failed || 0,
            skipped: result.skipped || 0,
            errors: result.errors || []
        };
        
        this.generateFinalReport();
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
        this.log('\n📊 RECORDING SUMMARY:');
        this.log('=' .repeat(60));
        this.log(`Total Recordings: ${recordings.length}`);
        
        // Group by date
        const byDate = {};
        recordings.forEach(recording => {
            const date = recording.start_time ? recording.start_time.split('T')[0] : 'Unknown';
            byDate[date] = (byDate[date] || 0) + 1;
        });
        
        this.log('\n📅 Recordings by Date:');
        Object.entries(byDate)
            .sort(([a], [b]) => b.localeCompare(a))
            .slice(0, 10)
            .forEach(([date, count]) => {
                this.log(`   ${date}: ${count} recordings`);
            });
        
        // Group by host
        const byHost = {};
        recordings.forEach(recording => {
            const host = recording.host_email || 'Unknown';
            byHost[host] = (byHost[host] || 0) + 1;
        });
        
        this.log('\n👤 Recordings by Host:');
        Object.entries(byHost)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .forEach(([host, count]) => {
                this.log(`   ${host}: ${count} recordings`);
            });
        
        this.log('=' .repeat(60));
    }

    generateFinalReport() {
        const endTime = Date.now();
        const duration = endTime - this.startTime;
        const durationMinutes = Math.round(duration / 60000 * 100) / 100;
        
        this.log('\n📊 COMPREHENSIVE PROCESSING COMPLETE');
        this.log('=' .repeat(60));
        this.log(`Total Recordings: ${this.results.total}`);
        this.log(`Successfully Processed: ${this.results.processed}`);
        this.log(`Failed: ${this.results.failed}`);
        this.log(`Skipped: ${this.results.skipped}`);
        this.log(`Success Rate: ${Math.round((this.results.processed / this.results.total) * 100)}%`);
        this.log(`Duration: ${durationMinutes} minutes`);
        
        if (this.results.errors.length > 0) {
            this.log('\n❌ ERRORS ENCOUNTERED:');
            this.results.errors.slice(0, 10).forEach(error => {
                this.log(`   ${error.recording || error.recordingId}: ${error.error || error.message}`);
            });
            
            if (this.results.errors.length > 10) {
                this.log(`   ... and ${this.results.errors.length - 10} more errors`);
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
            csvFile: this.csvFile,
            logFile: this.logFile
        };
        
        const reportFile = `processing-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        fs.writeFile(reportFile, JSON.stringify(report, null, 2))
            .then(() => this.log(`\n📄 Detailed report saved: ${reportFile}`))
            .catch(err => this.log(`\n⚠️  Could not save report: ${err.message}`));
        
        this.log('\n🎉 Processing completed!');
        this.log('📁 Check Google Drive for processed recordings');
        this.log('📊 Check Google Sheets for updated data');
        this.log(`📝 Full log available at: ${this.logFile}`);
    }

    async run(options = {}) {
        try {
            this.log('🚀 GENERATE CSV AND PROCESS ALL RECORDINGS');
            this.log('=' .repeat(80));
            this.log('This will generate comprehensive CSV and process ALL recordings');
            this.log('from Zoom Cloud using the complete production processor');
            this.log('=' .repeat(80));
            
            await this.initialize();
            
            // Generate comprehensive recording list and CSV
            const recordings = await this.generateComprehensiveCSV();
            
            if (recordings.length === 0) {
                this.log('\n⚠️  No recordings found. Exiting.');
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
                    this.log('\n❌ Processing cancelled by user.');
                    return;
                }
            }
            
            // Process all recordings using the complete production processor
            await this.processAllRecordings(recordings, options);
            
        } catch (error) {
            this.log('\n❌ Processing failed:', error);
            process.exit(1);
        } finally {
            // Close log stream
            if (this.logStream) {
                this.logStream.end();
            }
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

// Display help if requested
if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🚀 Generate CSV and Process All Recordings

Usage: node generate-csv-and-process.js [options]

Options:
  --auto-approve          Skip confirmation prompts
  --batch-size=N          Set batch size for processing (default: 10)
  --dry-run               Test mode - don't actually process
  --help, -h              Show this help message

Examples:
  node generate-csv-and-process.js --auto-approve
  node generate-csv-and-process.js --batch-size=5
  node generate-csv-and-process.js --dry-run
`);
    process.exit(0);
}

// Run the processing
if (require.main === module) {
    const processor = new CSVGeneratorAndProcessor();
    processor.run(options).catch(console.error);
}

module.exports = { CSVGeneratorAndProcessor }; 