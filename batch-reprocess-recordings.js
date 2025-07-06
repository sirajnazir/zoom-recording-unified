#!/usr/bin/env node
/**
 * Batch Reprocess Multiple Zoom Recordings
 * 
 * This script allows reprocessing multiple recordings at once
 */

require('dotenv').config();
const { ZoomRecordingReprocessor } = require('./download-and-reprocess-zoom-recording');

async function batchReprocess() {
    // Define recordings to reprocess
    const recordings = [
        {
            id: '4762651206',
            name: 'Aditi Bhaskar\'s Personal Meeting Room',
            issue: 'Duration mismatch - shows 11min but actual is 72min'
        },
        {
            id: '8390038905',
            name: 'Jamie JudahBram\'s Personal Meeting Room',
            issue: 'Missing student name extraction from transcript'
        },
        {
            id: '3242527137',
            name: 'Hiba | IvyLevel Week 4',
            issue: 'Verification - should process correctly'
        }
    ];
    
    console.log(`
🔄 Batch Zoom Recording Reprocessor
===================================
Recordings to process: ${recordings.length}
    `);
    
    const results = [];
    const reprocessor = new ZoomRecordingReprocessor();
    
    for (const recording of recordings) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`📹 Recording: ${recording.name}`);
        console.log(`   ID: ${recording.id}`);
        console.log(`   Known Issue: ${recording.issue}`);
        console.log(`${'='.repeat(80)}`);
        
        try {
            const result = await reprocessor.reprocessRecording(recording.id, {
                skipDownload: false,
                dryRun: false
            });
            
            results.push({
                ...recording,
                status: 'SUCCESS',
                result
            });
            
        } catch (error) {
            console.error(`\n❌ Failed to reprocess ${recording.id}: ${error.message}`);
            results.push({
                ...recording,
                status: 'FAILED',
                error: error.message
            });
        }
        
        // Add delay between recordings to avoid rate limits
        console.log('\n⏱️ Waiting 5 seconds before next recording...');
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Summary report
    console.log(`\n\n${'='.repeat(80)}`);
    console.log('📊 BATCH REPROCESSING SUMMARY');
    console.log(`${'='.repeat(80)}`);
    
    const successful = results.filter(r => r.status === 'SUCCESS').length;
    const failed = results.filter(r => r.status === 'FAILED').length;
    
    console.log(`\nTotal Recordings: ${results.length}`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    
    console.log('\nDetailed Results:');
    console.log('-'.repeat(80));
    
    for (const result of results) {
        console.log(`\n${result.status === 'SUCCESS' ? '✅' : '❌'} ${result.name}`);
        console.log(`   ID: ${result.id}`);
        console.log(`   Status: ${result.status}`);
        if (result.status === 'FAILED') {
            console.log(`   Error: ${result.error}`);
        } else if (result.result) {
            console.log(`   Standardized: ${result.result.standardizedName || 'N/A'}`);
            console.log(`   Category: ${result.result.category || 'N/A'}`);
        }
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Usage: node batch-reprocess-recordings.js [options]

Options:
  --recordings <id1,id2,id3>   Comma-separated list of recording IDs
  --dry-run                    Download files but don't process
  --help                       Show this help message

Example:
  node batch-reprocess-recordings.js
  node batch-reprocess-recordings.js --recordings 4762651206,8390038905
        `);
        process.exit(0);
    }
    
    // Check if custom recording IDs provided
    if (args.includes('--recordings')) {
        const index = args.indexOf('--recordings');
        const recordingIds = args[index + 1]?.split(',') || [];
        
        if (recordingIds.length > 0) {
            console.log('Custom recording list provided:', recordingIds);
            // TODO: Implement custom list processing
        }
    }
    
    await batchReprocess();
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { batchReprocess };