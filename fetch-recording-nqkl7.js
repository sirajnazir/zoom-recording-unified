#!/usr/bin/env node

/**
 * Fetch and process recording with UUID: NQKl7jSPT3eMaKE4vZfNsA==
 */

require('dotenv').config();

async function fetchRecording() {
    const targetUUID = 'NQKl7jSPT3eMaKE4vZfNsA==';
    
    console.log('🎯 FETCHING ZOOM RECORDING');
    console.log('================================================================================');
    console.log(`UUID: ${targetUUID}`);
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
        const doubleEncodedUuid = encodeURIComponent(encodeURIComponent(targetUUID));
        
        console.log('🔍 Fetching recording from Zoom Cloud...');
        console.log(`   Double encoded UUID: ${doubleEncodedUuid}`);
        
        // Get recording details
        const recording = await zoomService.getRecording(doubleEncodedUuid);
        
        if (!recording) {
            throw new Error('Recording not found');
        }
        
        console.log('\n✅ Recording found!');
        console.log(`   Topic: ${recording.topic}`);
        console.log(`   Start Time: ${recording.start_time}`);
        console.log(`   Duration: ${recording.duration} minutes`);
        console.log(`   Total Size: ${(recording.total_size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Meeting ID: ${recording.id || recording.meeting_id}`);
        console.log(`   Recording Files: ${recording.recording_files?.length || 0}`);
        
        if (recording.recording_files && recording.recording_files.length > 0) {
            console.log('\n📁 Available Files:');
            recording.recording_files.forEach((file, index) => {
                console.log(`\n   ${index + 1}. ${file.recording_type}`);
                console.log(`      - File Type: ${file.file_extension || file.file_type || 'Unknown'}`);
                console.log(`      - Size: ${(file.file_size / 1024 / 1024).toFixed(2)} MB`);
                console.log(`      - Status: ${file.status}`);
                console.log(`      - Download URL: ${file.download_url ? 'Available' : 'Not Available'}`);
            });
        }
        
        // Now download the files
        console.log('\n\n📥 DOWNLOADING FILES...\n');
        
        const { EnhancedRecordingDownloader } = require('./src/infrastructure/services/EnhancedRecordingDownloader');
        const downloader = new EnhancedRecordingDownloader({ config, logger });
        
        const downloadResult = await downloader.downloadRecordingFiles({
            ...recording,
            uuid: targetUUID,
            id: recording.id || recording.meeting_id,
            meeting_id: recording.meeting_id || recording.id,
            dataSource: 'zoom-api'
        });
        
        if (downloadResult.success) {
            console.log('\n✅ Files downloaded successfully!');
            console.log('\n📁 Local files stored at:');
            Object.entries(downloadResult.files).forEach(([type, path]) => {
                if (path) {
                    console.log(`   ${type}: ${path}`);
                }
            });
            
            // Get the output directory
            const outputDir = Object.values(downloadResult.files)[0]?.split('/').slice(0, -1).join('/');
            if (outputDir) {
                console.log(`\n📂 Full directory path: ${process.cwd()}/${outputDir}`);
                
                // List all files in the directory
                const fs = require('fs');
                const files = fs.readdirSync(outputDir);
                console.log('\n📋 All files in directory:');
                files.forEach(file => {
                    const stats = fs.statSync(`${outputDir}/${file}`);
                    const size = (stats.size / 1024 / 1024).toFixed(2);
                    console.log(`   - ${file} (${size} MB)`);
                });
            }
        } else {
            console.error('\n❌ Download failed:', downloadResult.error);
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        
        if (error.response?.status === 404) {
            console.log('\n💡 Recording not found. Possible reasons:');
            console.log('   - Recording deleted from Zoom Cloud');
            console.log('   - Recording expired');
            console.log('   - Invalid UUID');
            
            // Check if files already exist locally
            console.log('\n🔍 Checking for existing local files...');
            const fs = require('fs');
            const path = require('path');
            const outputDir = path.join(__dirname, 'output');
            
            try {
                const dirs = fs.readdirSync(outputDir).filter(dir => dir.includes(targetUUID));
                if (dirs.length > 0) {
                    console.log('\n✅ Found existing local files:');
                    dirs.forEach(dir => {
                        const fullPath = path.join(outputDir, dir);
                        console.log(`\n📁 ${fullPath}`);
                        const files = fs.readdirSync(fullPath);
                        files.forEach(file => {
                            const stats = fs.statSync(path.join(fullPath, file));
                            const size = (stats.size / 1024 / 1024).toFixed(2);
                            console.log(`   - ${file} (${size} MB)`);
                        });
                    });
                } else {
                    console.log('   ❌ No local files found for this UUID');
                }
            } catch (dirError) {
                console.log('   ❌ Could not check local files:', dirError.message);
            }
        } else if (error.response) {
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