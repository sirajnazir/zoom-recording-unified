#!/usr/bin/env node

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;

const TARGET_UUID = '4kXv5NIMSDqpJxDjX_u44Q==';

async function fetchCriticalRecording() {
    console.log('🎯 FETCHING CRITICAL RECORDING');
    console.log('================================================================================');
    console.log(`UUID: ${TARGET_UUID}`);
    console.log('================================================================================\n');

    try {
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
        const outputDir = path.join(__dirname, 'output', `M:${meetingId}U:${TARGET_UUID}`);
        await fs.mkdir(outputDir, { recursive: true });
        console.log(`\n\n📂 Output directory: ${outputDir}\n`);
        
        // Download files
        console.log('📥 DOWNLOADING FILES...\n');
        const axios = require('axios');
        const accessToken = await zoomService.getZoomToken();
        let downloadedCount = 0;
        
        for (const file of recording.recording_files) {
            console.log(`📥 Downloading: ${file.recording_type}`);
            
            try {
                const ext = file.file_extension?.toLowerCase() || 
                           file.recording_type.replace(/_/g, '.').split('.').pop() || 
                           'dat';
                const filename = `${file.recording_type}.${ext}`;
                const filepath = path.join(outputDir, filename);
                
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
        const files = await fs.readdir(outputDir);
        console.log('📋 FILES IN LOCAL DIRECTORY:');
        console.log(`📁 ${outputDir}\n`);
        
        for (const file of files) {
            const stats = await fs.stat(path.join(outputDir, file));
            const size = (stats.size / 1024 / 1024).toFixed(2);
            console.log(`   ✓ ${file} (${size} MB)`);
        }
        
        // Check for existing files from previous attempts
        console.log('\n🔍 Checking for any previous downloads...');
        const outputBaseDir = path.join(__dirname, 'output');
        const allDirs = await fs.readdir(outputBaseDir);
        const matchingDirs = allDirs.filter(dir => dir.includes(TARGET_UUID));
        
        if (matchingDirs.length > 1) {
            console.log('\n📁 Found multiple directories with this UUID:');
            for (const dir of matchingDirs) {
                console.log(`   - ${path.join(outputBaseDir, dir)}`);
            }
        }
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        
        if (error.response?.status === 404) {
            console.log('\n💡 RECORDING NOT FOUND IN ZOOM CLOUD');
            console.log('   Possible reasons:');
            console.log('   - Recording has been deleted');
            console.log('   - Recording has expired (Zoom retention policy)');
            console.log('   - UUID is incorrect\n');
            
            // Check for existing local files
            console.log('🔍 Checking for existing local files...\n');
            const fs = require('fs');
            const path = require('path');
            const outputDir = path.join(__dirname, 'output');
            
            try {
                const dirs = fs.readdirSync(outputDir).filter(dir => dir.includes(TARGET_UUID));
                if (dirs.length > 0) {
                    console.log('✅ FOUND EXISTING LOCAL FILES:');
                    for (const dir of dirs) {
                        const fullPath = path.join(outputDir, dir);
                        console.log(`\n📁 ${fullPath}`);
                        const files = fs.readdirSync(fullPath);
                        files.forEach(file => {
                            const stats = fs.statSync(path.join(fullPath, file));
                            const size = (stats.size / 1024 / 1024).toFixed(2);
                            console.log(`   - ${file} (${size} MB)`);
                        });
                    }
                } else {
                    console.log('❌ No local files found for this UUID');
                }
            } catch (dirError) {
                console.log('❌ Could not check local files:', dirError.message);
            }
        } else if (error.response) {
            console.log(`\n📊 Error Details:`);
            console.log(`   Status: ${error.response.status}`);
            console.log(`   Message: ${error.response.data?.message || error.response.statusText}`);
        }
        
        // Check Google Sheets for this recording
        console.log('\n🔍 Checking Google Sheets for this recording...');
        console.log(`   Search for UUID: ${TARGET_UUID}`);
        console.log('   Check tabs: "Zoom API - Raw", "Webhook - Raw", "Drive Import - Raw"');
    }
}

// Run the script
fetchCriticalRecording().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});