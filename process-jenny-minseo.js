#!/usr/bin/env node

/**
 * Process the specific Jenny<>Minseo recording
 * UUID: 43sNl0IVTvy3Xnp5+ydCog==
 */

require('dotenv').config();
const { execSync } = require('child_process');

async function processJennyMinseoRecording() {
    const targetUUID = '43sNl0IVTvy3Xnp5+ydCog==';
    
    console.log('🎯 PROCESSING JENNY<>MINSEO RECORDING');
    console.log('================================================================================');
    console.log(`UUID: ${targetUUID}`);
    console.log(`Topic: Jenny<>Minseo 1-HR Ivylevel Essay Session`);
    console.log(`Date: 2023-12-28`);
    console.log('================================================================================\n');

    try {
        // Use the existing batch processor with a date range that includes this recording
        console.log('🔄 Running batch processor for the specific date...\n');
        
        const command = `node scripts/process-all-zoom-api-recordings.js --date 2023-12-28 --uuid "${targetUUID}"`;
        
        console.log(`Executing: ${command}\n`);
        
        execSync(command, {
            stdio: 'inherit',
            env: {
                ...process.env,
                FORCE_PROCESS_UUID: targetUUID,
                SKIP_EXISTING_CHECK: 'true'
            }
        });
        
        console.log('\n✅ Processing completed!');
        console.log('\n📋 What to check:');
        console.log('1. Google Drive - Look for folder: "Coaching_Jenny_Minseo_Wk*_2023-12-28_*"');
        console.log('2. Google Sheets - Check "Zoom API - Raw" and "Zoom API - Standardized" tabs');
        console.log('3. The folder should contain:');
        console.log('   - Audio file (M4A)');
        console.log('   - Timeline (JSON)');
        console.log('   - Summary/Next Steps (JSON)');
        console.log('   - AI Insights document');
        
    } catch (error) {
        console.error('\n❌ Processing failed:', error.message);
        
        // Try a more direct approach
        console.log('\n🔄 Trying direct download and processing...\n');
        
        try {
            // First download the files
            const downloadCommand = `node scripts/test-zoom-api-indicator.js --uuid "${targetUUID}" --download-only`;
            
            console.log('📥 Downloading files first...\n');
            execSync(downloadCommand, {
                stdio: 'inherit',
                env: process.env
            });
            
            console.log('\n✅ Files downloaded. Check the output directory for:');
            console.log(`   output/M:*U:${targetUUID}/`);
            
        } catch (downloadError) {
            console.error('❌ Download also failed:', downloadError.message);
        }
    }
}

// Run it
processJennyMinseoRecording().catch(console.error);