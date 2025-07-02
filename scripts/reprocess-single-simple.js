const path = require('path');
const fs = require('fs').promises;

// Import the processor directly
const RecordingProcessor = require('../src/application/services/RecordingProcessor');

// Create a minimal container with just the services we need
const createMinimalContainer = () => {
    const container = {
        services: {},
        get: (serviceName) => {
            return container.services[serviceName];
        },
        register: (serviceName, service) => {
            container.services[serviceName] = service;
        }
    };
    
    // Load config
    const config = require('../config');
    container.register('config', config);
    
    // Load logger
    const { Logger } = require('../src/shared/Logger');
    const logger = new Logger();
    container.register('logger', logger);
    
    // Load Zoom service
    const { ZoomService } = require('../src/infrastructure/services/ZoomService');
    const zoomService = new ZoomService({ config, logger });
    container.register('zoomService', zoomService);
    
    // Load Google Drive service
    const { GoogleDriveService } = require('../src/infrastructure/services/GoogleDriveService');
    const driveService = new GoogleDriveService({ config, logger, cache, eventBus });
    container.register('driveService', driveService);
    
    const DriveOrganizer = require('../src/infrastructure/services/DriveOrganizer');
    const driveOrganizer = new DriveOrganizer({ 
        logger, 
        config, 
        googleDriveService: driveService,
        knowledgeBaseService: null 
    });
    container.register('driveOrganizer', driveOrganizer);
    
    const NameStandardizer = require('../src/application/services/CompleteSmartNameStandardizer');
    const nameStandardizer = new NameStandardizer({ logger, config });
    container.register('nameStandardizer', nameStandardizer);
    
    const RecordingCategorizer = require('../src/application/services/RecordingCategorizer');
    const recordingCategorizer = new RecordingCategorizer({ logger, config });
    container.register('recordingCategorizer', recordingCategorizer);
    
    return container;
};

async function reprocessSingleRecording(recordingId) {
    try {
        console.log(`🔄 Starting reprocessing of recording: ${recordingId}`);
        
        // Create minimal container
        const container = createMinimalContainer();
        
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
    console.log('Usage: node scripts/reprocess-single-simple.js <recording-id>');
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