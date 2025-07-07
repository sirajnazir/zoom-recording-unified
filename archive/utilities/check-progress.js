#!/usr/bin/env node

/**
 * Check current processing progress
 */

const fs = require('fs').promises;

async function checkProgress() {
    try {
        const progressData = await fs.readFile('processing-progress.json', 'utf8');
        const progress = JSON.parse(progressData);
        
        console.log('📊 Current Processing Progress:');
        console.log(`   📦 Current Batch: ${progress.currentBatch}`);
        console.log(`   ✅ Processed: ${progress.processedCount}`);
        console.log(`   ❌ Failed: ${progress.failedCount}`);
        console.log(`   📋 Total: ${progress.totalRecordings}`);
        console.log(`   📈 Progress: ${((progress.processedCount / progress.totalRecordings) * 100).toFixed(1)}%`);
        console.log(`   🕐 Last Updated: ${new Date(progress.timestamp).toLocaleString()}`);
        
        const remaining = progress.totalRecordings - progress.processedCount - progress.failedCount;
        console.log(`   ⏳ Remaining: ${remaining} recordings`);
        
    } catch (error) {
        console.log('📊 No progress file found - processing has not started or completed successfully');
    }
}

checkProgress().catch(console.error); 