#!/usr/bin/env node

/**
 * Force process a specific UUID - Jenny<>Minseo recording
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;

const TARGET_UUID = '43sNl0IVTvy3Xnp5+ydCog==';

async function forceProcessRecording() {
    console.log('🎯 FORCE PROCESSING SPECIFIC RECORDING');
    console.log('================================================================================');
    console.log(`UUID: ${TARGET_UUID}`);
    console.log('================================================================================\n');
    
    try {
        // Create a temporary recordings file
        const tempFile = path.join(__dirname, 'temp-force-recording.json');
        
        // Create recording data structure
        const recordingData = {
            recordings: [{
                uuid: TARGET_UUID,
                id: '0',  // Will be fetched
                topic: "Jenny<>Minseo 1-HR Ivylevel Essay Session",
                start_time: "2023-12-28T23:59:48Z",
                duration: 62,
                total_size: 232510259,
                recording_count: 3,
                share_url: "",
                recording_files: [
                    {
                        recording_type: "audio_only",
                        status: "completed",
                        file_extension: "M4A",
                        file_size: 59619942
                    },
                    {
                        recording_type: "timeline",
                        status: "completed", 
                        file_extension: "JSON",
                        file_size: 1643825
                    },
                    {
                        recording_type: "summary_next_steps",
                        status: "completed",
                        file_extension: "JSON",
                        file_size: 0
                    }
                ],
                dataSource: 'zoom-api',
                forceProcess: true
            }]
        };
        
        // Write to temp file
        await fs.writeFile(tempFile, JSON.stringify(recordingData, null, 2));
        console.log(`📝 Created temp file: ${tempFile}\n`);
        
        // Now run the processor
        console.log('🚀 Running production processor...\n');
        
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        try {
            // Use the production processor directly
            const { stdout, stderr } = await execAsync(
                `node complete-production-processor.js --file="${tempFile}" --mode=file --force --skip-existing-check`,
                { 
                    maxBuffer: 1024 * 1024 * 10, // 10MB buffer
                    env: process.env 
                }
            );
            
            if (stdout) {
                console.log('📋 Processing output:');
                console.log(stdout);
            }
            
            if (stderr) {
                console.error('⚠️ Processing warnings:');
                console.error(stderr);
            }
            
        } catch (execError) {
            console.error('❌ Execution error:', execError.message);
            
            // Try alternative approach
            console.log('\n🔄 Trying direct module approach...\n');
            
            const { ProductionZoomProcessor } = require('./complete-production-processor');
            const { setupContainer } = require('./src/container');
            
            // Manual setup
            console.log('Setting up services...');
            
            // Just process the recording data we have
            const recording = recordingData.recordings[0];
            
            console.log('✅ Will process:');
            console.log(`   Topic: ${recording.topic}`);
            console.log(`   UUID: ${recording.uuid}`);
            console.log(`   Date: ${recording.start_time}`);
            console.log(`   Files: ${recording.recording_files.length}`);
            
            console.log('\n📥 To manually download and process:');
            console.log('1. The recording has:');
            console.log('   - Audio file (M4A, 56.8 MB)');
            console.log('   - Timeline (JSON, 1.6 MB)');
            console.log('   - Summary (JSON)');
            console.log('\n2. Run: node process-zoom-batch.js --date="2023-12-28"');
            console.log('3. Or check if it was already processed in Google Sheets');
        }
        
        // Cleanup
        await fs.unlink(tempFile).catch(() => {});
        
        console.log('\n✅ Script completed');
        console.log('\n📋 Next steps:');
        console.log('1. Check Google Sheets "Zoom API" tabs for this recording');
        console.log('2. Search for "Jenny" or "Minseo" in the sheets');
        console.log('3. If not found, the recording may need manual processing');
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
    }
}

forceProcessRecording().catch(console.error);