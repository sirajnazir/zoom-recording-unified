#!/usr/bin/env node

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;

// Decode the meeting_id from the URL
const urlEncodedId = 'PIxpOj%2FQS4i0ONDBcxoW9g%3D%3D';
const decodedId = decodeURIComponent(urlEncodedId); // This gives us: PIxpOj/QS4i0ONDBcxoW9g==
const TARGET_UUID = decodedId;

console.log('🔍 DECODING UUID FROM URL');
console.log('================================================================================');
console.log(`URL encoded: ${urlEncodedId}`);
console.log(`Decoded UUID: ${TARGET_UUID}`);
console.log('================================================================================\n');

async function fetchRecording() {
    console.log('🎯 FETCHING ZOOM RECORDING');
    console.log('================================================================================');
    console.log(`UUID: ${TARGET_UUID}`);
    console.log('================================================================================\n');

    try {
        // First check for existing local files
        console.log('🔍 Checking for existing local files...\n');
        const outputDir = path.join(__dirname, 'output');
        
        try {
            const dirs = await fs.readdir(outputDir);
            const matchingDirs = dirs.filter(dir => dir.includes('PIxpOj') || dir.includes('QS4i0ONDBcxoW9g'));
            
            if (matchingDirs.length > 0) {
                console.log('✅ FOUND EXISTING LOCAL FILES:');
                for (const dir of matchingDirs) {
                    const fullPath = path.join(outputDir, dir);
                    console.log(`\n📁 ${fullPath}`);
                    try {
                        const files = await fs.readdir(fullPath);
                        for (const file of files) {
                            const stats = await fs.stat(path.join(fullPath, file));
                            const size = (stats.size / 1024 / 1024).toFixed(2);
                            console.log(`   - ${file} (${size} MB)`);
                        }
                    } catch (e) {
                        console.log(`   - Error reading directory: ${e.message}`);
                    }
                }
                console.log('\n');
            }
        } catch (e) {
            console.log('Could not check local files:', e.message);
        }

        // Initialize Zoom service
        const { ZoomService } = require('./src/infrastructure/services/ZoomService');
        const config = {
            zoom: {
                accountId: process.env.ZOOM_ACCOUNT_ID,
                clientId: process.env.ZOOM_CLIENT_ID,
                clientSecret: process.env.ZOOM_CLIENT_SECRET
            }
        };
        
        const logger = {
            info: (...args) => console.log('[INFO]', ...args),
            error: (...args) => console.error('[ERROR]', ...args),
            warn: (...args) => console.warn('[WARN]', ...args)
        };
        
        console.log('📡 Initializing Zoom service...');
        const zoomService = new ZoomService({ config, logger });
        
        // Double encode UUID for Zoom API
        const doubleEncodedUuid = encodeURIComponent(encodeURIComponent(TARGET_UUID));
        
        console.log('🔍 Fetching recording from Zoom Cloud...');
        console.log(`   Double encoded UUID: ${doubleEncodedUuid}\n`);
        
        // Get recording details
        const recording = await zoomService.getRecording(doubleEncodedUuid);
        
        if (!recording) {
            throw new Error('Recording not found');
        }
        
        console.log('✅ RECORDING FOUND!');
        console.log('================================================================================');
        console.log(`📋 Topic: ${recording.topic}`);
        console.log(`📅 Date: ${recording.start_time}`);
        console.log(`⏱️  Duration: ${recording.duration} minutes`);
        console.log(`🆔 Meeting ID: ${recording.id || recording.meeting_id}`);
        console.log(`📦 Total Size: ${(recording.total_size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`📁 Files: ${recording.recording_files?.length || 0}`);
        console.log('================================================================================\n');
        
        if (recording.recording_files && recording.recording_files.length > 0) {
            console.log('📁 AVAILABLE FILES:');
            recording.recording_files.forEach((file, index) => {
                console.log(`\n   ${index + 1}. ${file.recording_type}`);
                console.log(`      - Extension: ${file.file_extension || file.file_type || 'Unknown'}`);
                console.log(`      - Size: ${(file.file_size / 1024 / 1024).toFixed(2)} MB`);
                console.log(`      - Status: ${file.status}`);
                console.log(`      - Download URL: ${file.download_url ? '✅ Available' : '❌ Not Available'}`);
            });
        }
        
        // Create output directory
        const meetingId = recording.id || recording.meeting_id || 'unknown';
        const newOutputDir = path.join(__dirname, 'output', `M:${meetingId}U:${TARGET_UUID}`);
        await fs.mkdir(newOutputDir, { recursive: true });
        console.log(`\n\n📂 Output directory: ${newOutputDir}\n`);
        
        // Download files
        console.log('📥 DOWNLOADING FILES...\n');
        const axios = require('axios');
        const accessToken = await zoomService.getZoomToken();
        let downloadedCount = 0;
        
        for (const file of recording.recording_files) {
            console.log(`📥 Downloading: ${file.recording_type}`);
            
            try {
                const ext = file.file_extension?.toLowerCase() || 
                           (file.recording_type.includes('transcript') ? 'vtt' :
                            file.recording_type.includes('summary') ? 'json' :
                            file.recording_type.includes('audio') ? 'm4a' :
                            file.recording_type.includes('video') ? 'mp4' : 'dat');
                const filename = `${file.recording_type}.${ext}`;
                const filepath = path.join(newOutputDir, filename);
                
                console.log(`   Target: ${filename}`);
                
                const response = await axios({
                    method: 'GET',
                    url: file.download_url,
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'stream',
                    timeout: 300000 // 5 minutes
                });
                
                const writer = require('fs').createWriteStream(filepath);
                response.data.pipe(writer);
                
                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });
                
                const stats = await fs.stat(filepath);
                console.log(`   ✅ Downloaded: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)\n`);
                downloadedCount++;
                
            } catch (dlError) {
                console.error(`   ❌ Failed: ${dlError.message}\n`);
                if (dlError.response?.status === 401) {
                    console.log('   💡 Tip: File may require special authentication or may have expired\n');
                }
            }
        }
        
        console.log('================================================================================');
        console.log(`✅ DOWNLOAD COMPLETE! Downloaded ${downloadedCount}/${recording.recording_files.length} files`);
        console.log('================================================================================\n');
        
        // List all files in directory
        const files = await fs.readdir(newOutputDir);
        console.log('📋 FILES IN LOCAL DIRECTORY:');
        console.log(`📁 ${newOutputDir}\n`);
        
        for (const file of files) {
            const stats = await fs.stat(path.join(newOutputDir, file));
            const size = (stats.size / 1024 / 1024).toFixed(2);
            console.log(`   ✓ ${file} (${size} MB)`);
        }
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        
        if (error.response?.status === 404) {
            console.log('\n💡 RECORDING NOT FOUND IN ZOOM CLOUD');
            console.log('   The correct UUID might be different from what we decoded.');
            console.log('   Please check the recording details in Zoom web interface.');
        } else if (error.response) {
            console.log(`\n📊 Error Details:`);
            console.log(`   Status: ${error.response.status}`);
            console.log(`   Message: ${error.response.data?.message || error.response.statusText}`);
        }
    }
}

// Run the script
fetchRecording().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});