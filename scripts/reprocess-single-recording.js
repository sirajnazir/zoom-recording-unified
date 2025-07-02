const path = require('path');
const fs = require('fs').promises;

// Import the processor
const RecordingProcessor = require('../src/application/services/RecordingProcessor');
const container = require('../src/container');

async function reprocessSingleRecording(recordingId) {
    try {
        console.log(`🔄 Starting reprocessing of recording: ${recordingId}`);
        
        // Initialize the processor
        const processor = new RecordingProcessor(container);
        
        // Get the recording from Zoom API
        const zoomService = container.get('zoomService');
        const recordings = await zoomService.getRecordings({
            from: '2025-06-01',
            to: '2025-06-30',
            page_size: 100
        });
        
        // Find the specific recording
        const targetRecording = recordings.meetings.find(r => 
            r.recording_files.some(f => f.id === recordingId)
        );
        
        if (!targetRecording) {
            console.error(`❌ Recording ${recordingId} not found in the date range`);
            return;
        }
        
        console.log(`📋 Found recording: ${targetRecording.topic}`);
        console.log(`📅 Date: ${targetRecording.start_time}`);
        console.log(`⏱️ Duration: ${targetRecording.duration} minutes`);
        
        // Process the recording with updated categorization
        console.log(`🚀 Processing recording with updated categorization logic...`);
        
        const result = await processor.processRecording(targetRecording);
        
        if (result.success) {
            console.log(`✅ Recording reprocessed successfully!`);
            console.log(`📁 Category: ${result.category || 'Not determined'}`);
            console.log(`📁 Drive folder: ${result.driveResult?.folderUrl || 'Not uploaded'}`);
            console.log(`📊 AI Insights: ${result.insights ? 'Generated' : 'Not generated'}`);
            
            // Log the categorization details
            if (result.nameAnalysis) {
                console.log(`📝 Name Analysis:`);
                console.log(`   - Standardized Name: ${result.nameAnalysis.standardizedName}`);
                console.log(`   - Components:`, result.nameAnalysis.components);
            }
            
            if (result.category) {
                console.log(`🏷️ Final Category: ${result.category}`);
            }
            
        } else {
            console.error(`❌ Failed to reprocess recording:`, result.error);
        }
        
    } catch (error) {
        console.error('❌ Error during reprocessing:', error);
    }
}

// Get recording ID from command line arguments
const recordingId = process.argv[2];

if (!recordingId) {
    console.error('❌ Please provide a recording ID as an argument');
    console.log('Usage: node scripts/reprocess-single-recording.js <recording-id>');
    process.exit(1);
}

// Run the reprocessing
reprocessSingleRecording(recordingId)
    .then(() => {
        console.log('✅ Reprocessing completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Reprocessing failed:', error);
        process.exit(1);
    }); 