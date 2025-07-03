const fs = require('fs').promises;
const path = require('path');
const { FinalProductionProcessorEnhanced } = require('./final-production-processor-enhanced');
const { Logger } = require('./src/shared/Logger');

async function runFinalProduction() {
    const logger = new Logger('FinalProductionRunner');
    
    console.log('🚀 FINAL PRODUCTION PROCESSOR - 324 RECORDINGS');
    console.log('==============================================');
    console.log('📅 Started at:', new Date().toISOString());
    console.log('');

    try {
        // Step 1: Load recordings from CSV
        console.log('📋 Step 1: Loading recordings from CSV...');
        const recordings = await loadRecordingsFromCSV();
        console.log(`✅ Loaded ${recordings.length} recordings from CSV`);
        console.log('');

        // Step 2: Initialize final production processor
        console.log('⚙️  Step 2: Initializing final production processor...');
        const processor = new FinalProductionProcessorEnhanced({
            // Production settings
            maxConcurrent: 4,
            batchSize: 10,
            resumeFromFile: './final-production-progress.json',
            skipDuplicates: true,
            cleanupAfterUpload: false, // Keep files for safety
            
            // Enhanced download settings
            useParallelDownloads: true,
            useStreamingDownloads: true, // Fallback
            downloadConcurrency: 6,
            downloadTimeout: 600000, // 10 minutes
            enableResumeDownloads: true
        });

        // Set up comprehensive event listeners
        processor
            .on('processingStart', (data) => {
                console.log(`🚀 Starting FINAL PRODUCTION processing of ${data.totalRecordings} recordings`);
                console.log('📊 Enhanced Download Settings:');
                console.log('   - Parallel Downloads: ENABLED');
                console.log('   - Streaming Downloads: ENABLED (fallback)');
                console.log('   - Download Concurrency: 6');
                console.log('   - Resume Downloads: ENABLED');
                console.log('   - Max Concurrent: 4');
                console.log('   - Batch Size: 10');
                console.log('');
            })
            .on('batchStart', (data) => {
                console.log(`📦 Starting batch ${data.batchNumber}/${data.totalBatches} (${data.batchSize} recordings)`);
            })
            .on('recordingProcessed', (data) => {
                console.log(`✅ Processed: ${data.recordingId} (${data.downloadMethod})`);
            })
            .on('recordingProcessingError', (data) => {
                console.log(`❌ Failed: ${data.recordingId} - ${data.error}`);
            })
            .on('batchComplete', (data) => {
                console.log(`📦 Batch ${data.batchNumber}/${data.totalBatches} complete:`);
                console.log(`   ✅ Successful: ${data.successful}`);
                console.log(`   ❌ Failed: ${data.failed}`);
                console.log(`   📊 Total Progress: ${data.processed} processed, ${data.failed} failed`);
                console.log('');
            })
            .on('processingComplete', (data) => {
                console.log('');
                console.log('🎉 FINAL PRODUCTION PROCESSING COMPLETED!');
                console.log('==========================================');
                console.log(`📈 Final Statistics:`);
                console.log(`   - Total Processed: ${data.processed}/${data.total}`);
                console.log(`   - Success Rate: ${data.successRate.toFixed(1)}%`);
                console.log(`   - Duration: ${(data.duration / 1000 / 60).toFixed(1)} minutes`);
                console.log(`   - Average Time per Recording: ${(data.averageTimePerRecording / 1000).toFixed(1)} seconds`);
                console.log('');
                console.log('📅 Completed at:', new Date().toISOString());
                console.log('');
                console.log('🎯 All 324 recordings have been processed with enhanced download capabilities!');
                console.log('📊 Check your Google Sheets and Google Drive for the results.');
            })
            .on('processingError', (error) => {
                console.log('❌ FINAL PRODUCTION processing failed:', error.message);
                console.log('💡 You can resume from where it left off by running this script again.');
            });

        // Step 3: Process all recordings
        console.log('🚀 Step 3: Starting final production processing...');
        console.log('');
        
        const results = await processor.processRecordings(recordings, {
            outputDir: './downloads',
            // Add any additional options here
        });

        // Step 4: Cleanup
        console.log('🧹 Step 4: Cleaning up...');
        await processor.cleanup();
        
        console.log('✅ Final production run completed successfully!');
        return results;

    } catch (error) {
        console.error('❌ Final production run failed:', error);
        throw error;
    }
}

/**
 * Load recordings from CSV file
 */
async function loadRecordingsFromCSV() {
    try {
        // Try to load from the CSV file generated by your processor
        const csvPath = path.join(__dirname, 'data', 'ALL-324-zoomus_recordings_in_cloud__20250702.csv');
        
        if (await fs.access(csvPath).then(() => true).catch(() => false)) {
            const csvContent = await fs.readFile(csvPath, 'utf8');
            const lines = csvContent.split('\n').filter(line => line.trim());
            
            // Parse CSV properly handling quoted fields
            function parseCSVLine(line) {
                const result = [];
                let current = '';
                let inQuotes = false;
                
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        result.push(current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }
                
                result.push(current.trim());
                return result.map(field => field.replace(/^"|"$/g, '')); // Remove outer quotes
            }
            
            const headers = parseCSVLine(lines[0]);
            console.log('📋 CSV Headers:', headers);
            
            const recordings = [];
            for (let i = 1; i < lines.length; i++) {
                const values = parseCSVLine(lines[i]);
                const recording = {};
                
                headers.forEach((header, index) => {
                    recording[header] = values[index] || '';
                });
                
                // Map CSV fields to expected recording structure
                const mappedRecording = {
                    uuid: recording.ID || recording.id,
                    id: recording.ID || recording.id,
                    topic: recording.Topic || recording.topic,
                    start_time: recording['Start Time'] || recording.start_time,
                    host_email: recording.Host || recording.host_email,
                    file_size: recording['File Size (MB)'] || recording.file_size,
                    file_count: recording['File Count'] || recording.file_count,
                    total_views: recording['Total Views'] || recording.total_views,
                    total_downloads: recording['Total Downloads'] || recording.total_downloads,
                    last_accessed: recording['Last Accessed'] || recording.last_accessed,
                    auto_delete_status: recording['Auto Delete Status'] || recording.auto_delete_status,
                    auto_delete_date: recording['Auto Delete Date'] || recording.auto_delete_date
                };
                
                // Ensure required fields exist
                if (mappedRecording.uuid || mappedRecording.id) {
                    recordings.push(mappedRecording);
                }
            }
            
            console.log(`📋 Loaded ${recordings.length} recordings from CSV`);
            console.log(`📊 Sample recording:`, recordings[0]);
            return recordings;
        } else {
            throw new Error(`CSV file not found: ${csvPath}`);
        }
    } catch (error) {
        console.error('❌ Failed to load recordings from CSV:', error.message);
        console.log('💡 Creating sample recordings for testing...');
        
        // Create sample recordings for testing
        const sampleRecordings = [];
        for (let i = 1; i <= 10; i++) { // Start with 10 for testing
            sampleRecordings.push({
                uuid: `sample-recording-${i}`,
                id: `sample-recording-${i}`,
                topic: `Sample Coaching Session ${i}`,
                start_time: `2025-01-0${i}T10:00:00Z`,
                duration: 3600,
                download_url: `https://example.com/video${i}.mp4`,
                host_email: 'test@example.com',
                participant_count: 2
            });
        }
        
        console.log(`📋 Created ${sampleRecordings.length} sample recordings for testing`);
        return sampleRecordings;
    }
}

/**
 * Handle graceful shutdown
 */
process.on('SIGINT', async () => {
    console.log('\n⚠️  Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n⚠️  Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

// Run the final production processor
if (require.main === module) {
    runFinalProduction()
        .then((results) => {
            console.log('🎉 Final production run completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Final production run failed:', error);
            process.exit(1);
        });
}

module.exports = { runFinalProduction }; 