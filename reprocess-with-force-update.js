#!/usr/bin/env node
/**
 * Reprocess Recording with Force Update
 * 
 * This script:
 * 1. Downloads actual files from Zoom (or uses existing)
 * 2. Processes through pipeline
 * 3. FORCES update of Google Sheets even if record exists
 */

require('dotenv').config();
const { ZoomRecordingReprocessor } = require('./download-and-reprocess-zoom-recording');

// Extend the reprocessor to add force update option
class ForceUpdateReprocessor extends ZoomRecordingReprocessor {
    async processWithProductionPipeline(webhookPayload) {
        // Add force update flag to the recording
        webhookPayload.payload.object._forceUpdate = true;
        webhookPayload.payload.object._reprocessing = true;
        
        // Call parent method
        return super.processWithProductionPipeline(webhookPayload);
    }
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
Usage: node reprocess-with-force-update.js <uuid> [options]

Options:
  --skip-download    Use previously downloaded files
  
Example:
  node reprocess-with-force-update.js +fUQYcozSiC/ZVx44MH8YA==
  node reprocess-with-force-update.js +fUQYcozSiC/ZVx44MH8YA== --skip-download
        `);
        process.exit(1);
    }
    
    const recordingId = args[0];
    const options = {
        skipDownload: args.includes('--skip-download')
    };
    
    console.log(`
🔄 Force Update Reprocessor
==========================
Recording: ${recordingId}
Skip Download: ${options.skipDownload}

This will:
✅ Download/use actual Zoom files
✅ Extract participants from timeline/transcript
✅ Categorize correctly
✅ FORCE UPDATE Google Sheets (even if exists)
    `);
    
    const reprocessor = new ForceUpdateReprocessor();
    
    try {
        await reprocessor.reprocessRecording(recordingId, options);
        
        console.log(`
✅ Reprocessing completed!
Check Google Sheets to verify the Standardized tab was updated.
        `);
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { ForceUpdateReprocessor };