#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');

async function testZoomProcessing() {
    console.log('Testing Zoom Processing directly...\n');
    
    // Import the processor
    const { ProductionZoomProcessor } = require('./complete-production-processor');
    const processor = new ProductionZoomProcessor();
    
    try {
        // Initialize processor
        console.log('1. Initializing processor...');
        await processor.initialize();
        console.log('✅ Processor initialized\n');
        
        // Get the Zoom service
        console.log('2. Getting Zoom service...');
        const zoomService = processor.container.resolve('zoomService');
        console.log('✅ Zoom service resolved\n');
        
        // Get recent recordings
        console.log('3. Fetching recent recordings...');
        const currentDate = new Date();
        const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        
        const recordings = await zoomService.getRecordings({
            from: startDate.toISOString(),
            to: currentDate.toISOString(),
            limit: 2
        });
        
        console.log(`✅ Found ${recordings.length} recordings\n`);
        
        // Display recording details
        recordings.forEach((rec, idx) => {
            console.log(`Recording ${idx + 1}:`);
            console.log(`  Topic: ${rec.topic}`);
            console.log(`  UUID: ${rec.uuid}`);
            console.log(`  Start: ${rec.start_time}`);
            console.log(`  Duration: ${rec.duration} seconds`);
            console.log(`  Files: ${rec.recording_files?.length || 0}`);
            console.log('');
        });
        
        // Process the first recording
        if (recordings.length > 0) {
            console.log('4. Processing first recording...');
            const recording = recordings[0];
            
            // Set source for _A_ indicator
            recording.source = 'zoom-api';
            recording.dataSource = 'zoom-api';
            
            const result = await processor.processRecording(recording, {
                lightweight: false,
                cloudLightweight: false
            });
            
            console.log('\n✅ Processing result:');
            console.log(`  Success: ${result.success}`);
            console.log(`  Name Analysis: ${result.nameAnalysis?.standardizedName || 'N/A'}`);
            console.log(`  Category: ${result.category}`);
            console.log(`  Processing Time: ${result.processingTime}ms`);
            
            if (!result.success) {
                console.log(`  Error: ${result.error}`);
            }
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        // Cleanup
        console.log('\n5. Shutting down...');
        await processor.shutdown();
        console.log('✅ Shutdown complete');
    }
}

// Run the test
testZoomProcessing().catch(console.error);