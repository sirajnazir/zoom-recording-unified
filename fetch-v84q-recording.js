#!/usr/bin/env node
require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;

const TARGET_UUID = 'v84qb4woSTCxe_GyW1Aq5g==';

async function fetchRecording() {
    console.log('🎯 FETCHING ZOOM RECORDING');
    console.log('================================================================================');
    console.log(`UUID: ${TARGET_UUID}`);
    console.log('================================================================================\n');

    const outputRoot = path.join(__dirname, 'output');
    const axios = require('axios');
    const { google } = require('googleapis');

    console.log('🔍 Checking for existing local files...\n');
    
    try {
        const dirs = await fs.readdir(outputRoot);
        const existingDir = dirs.find(dir => dir.includes(TARGET_UUID));
        
        if (existingDir) {
            const fullPath = path.join(outputRoot, existingDir);
            const files = await fs.readdir(fullPath);
            
            console.log('✅ FOUND EXISTING LOCAL FILES:\n');
            console.log(`   Directory: ${existingDir}`);
            console.log(`   Full path: ${fullPath}`);
            console.log('\n   Files:');
            
            for (const file of files) {
                const stats = await fs.stat(path.join(fullPath, file));
                const size = (stats.size / (1024 * 1024)).toFixed(2);
                console.log(`   - ${file} (${size} MB)`);
            }
            
            console.log('\n📥 Checking if more files are available in Zoom Cloud...\n');
        }
    } catch (error) {
        // Directory might not exist yet
    }

    const zoomApiUrl = 'https://api.zoom.us/v2';
    const zoomToken = process.env.ZOOM_API_TOKEN;

    if (!zoomToken) {
        console.error('❌ ZOOM_API_TOKEN not found in environment variables');
        return;
    }

    try {
        console.log('📡 Fetching recording details from Zoom API...');
        const response = await axios.get(`${zoomApiUrl}/meetings/${TARGET_UUID}/recordings`, {
            headers: {
                'Authorization': `Bearer ${zoomToken}`
            }
        });

        const recording = response.data;
        console.log('\n✅ FOUND RECORDING IN ZOOM CLOUD:\n');
        console.log(`   Topic: ${recording.topic}`);
        console.log(`   Start Time: ${recording.start_time}`);
        console.log(`   Duration: ${recording.duration} minutes`);
        console.log(`   Total Size: ${(recording.total_size / (1024 * 1024)).toFixed(2)} MB`);
        console.log(`   Meeting ID: ${recording.id}`);
        
        const meetingId = recording.id;
        const uuid = TARGET_UUID;
        const dirName = `M:${meetingId}U:${uuid}`;
        const recordingDir = path.join(outputRoot, dirName);
        
        await fs.mkdir(recordingDir, { recursive: true });
        console.log(`\n📁 Output directory: ${recordingDir}`);

        const allFiles = [];
        if (recording.recording_files && recording.recording_files.length > 0) {
            console.log(`\n📋 Available recording files: ${recording.recording_files.length}`);
            recording.recording_files.forEach((file, index) => {
                console.log(`   ${index + 1}. ${file.file_type} - ${(file.file_size / (1024 * 1024)).toFixed(2)} MB`);
                allFiles.push(file);
            });
        }

        if (recording.participant_audio_files && recording.participant_audio_files.length > 0) {
            console.log(`\n🎤 Available audio files: ${recording.participant_audio_files.length}`);
            recording.participant_audio_files.forEach((file, index) => {
                console.log(`   ${index + 1}. ${file.file_type} - ${(file.file_size / (1024 * 1024)).toFixed(2)} MB`);
                allFiles.push(file);
            });
        }

        // Download files
        console.log('\n📥 DOWNLOADING FILES...\n');
        
        for (const file of allFiles) {
            const extension = file.file_extension || file.file_type.toLowerCase();
            const fileName = `${file.recording_type || file.file_type}.${extension}`;
            const filePath = path.join(recordingDir, fileName);
            
            // Check if file already exists
            try {
                const stats = await fs.stat(filePath);
                const localSize = stats.size;
                const remoteSize = file.file_size;
                
                if (localSize === remoteSize) {
                    console.log(`   ✓ ${fileName} already downloaded (${(localSize / (1024 * 1024)).toFixed(2)} MB)`);
                    continue;
                } else {
                    console.log(`   ⚠️  ${fileName} exists but size mismatch. Re-downloading...`);
                }
            } catch (error) {
                // File doesn't exist, proceed with download
            }
            
            try {
                console.log(`   Downloading ${fileName} (${(file.file_size / (1024 * 1024)).toFixed(2)} MB)...`);
                
                const fileUrl = file.download_url;
                const fileResponse = await axios.get(fileUrl, {
                    headers: {
                        'Authorization': `Bearer ${zoomToken}`
                    },
                    responseType: 'stream',
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                });
                
                const writer = require('fs').createWriteStream(filePath);
                fileResponse.data.pipe(writer);
                
                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });
                
                console.log(`   ✅ Downloaded ${fileName}`);
                
            } catch (error) {
                console.error(`   ❌ Error downloading ${fileName}:`, error.message);
            }
        }

        // Save metadata
        console.log('\n📋 Saving recording metadata...');
        const metadataPath = path.join(recordingDir, 'metadata.json');
        await fs.writeFile(metadataPath, JSON.stringify(recording, null, 2));
        console.log('   ✅ Metadata saved');

        console.log('\n✨ RECORDING FETCH COMPLETE!\n');
        console.log(`📂 All files saved to: ${recordingDir}`);

    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.log('\n❌ RECORDING NOT FOUND IN ZOOM CLOUD');
            console.log('   This recording does not exist or has been deleted.\n');
        } else {
            console.error('\n❌ ERROR:', error.response ? error.response.data : error.message);
        }
    }
}

fetchRecording().catch(console.error);