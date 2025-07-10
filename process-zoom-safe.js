#!/usr/bin/env node
require('dotenv').config();

const { ProductionZoomProcessor } = require('./complete-production-processor');

async function processZoomRecordingsWithFullLogic() {
    const processor = new ProductionZoomProcessor();
    
    // Override the problematic console capture
    processor._setupConsoleCapture = function() {
        // Keep original console methods but don't capture to file
        // This avoids the EPIPE error
        console.log('📝 Console output capture disabled to prevent EPIPE errors');
    };
    
    try {
        console.log('🚀 Processing ALL Zoom Cloud/API Recordings with Full Production Logic\n');
        console.log('This will:');
        console.log('- Add _A_ indicator to all Zoom recordings');
        console.log('- Use ALL sophisticated processing logic:');
        console.log('  ✓ Smart week inference');
        console.log('  ✓ AI-powered insights generation'); 
        console.log('  ✓ Outcome extraction');
        console.log('  ✓ Relationship analysis');
        console.log('  ✓ Enhanced metadata extraction');
        console.log('  ✓ Drive organization with shortcuts');
        console.log('  ✓ Multi-tab Google Sheets updates');
        console.log('- Process up to 320 recordings\n');
        
        await processor.initialize();
        
        const options = {
            mode: 'recent',
            limit: 320,
            dryRun: false,
            lightweight: false,
            cloudLightweight: false,
            autoApprove: true
        };
        
        console.log('📊 Processing options:', options);
        console.log('');
        
        const results = await processor.processAllRecordings(options);
        
        console.log('\n🎉 Processing completed!');
        console.log(`📊 Results: ${results.successful}/${results.total} successful`);
        
        if (results.failed > 0) {
            console.log(`⚠️ Failed: ${results.failed} recordings`);
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        // Cleanup without causing EPIPE
        if (processor.container) {
            try {
                await processor.container.dispose();
            } catch (e) {
                // Ignore disposal errors
            }
        }
    }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log('\n🔄 Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🔄 Shutting down gracefully...');
    process.exit(0);
});

// Run the processor
processZoomRecordingsWithFullLogic().catch(console.error);