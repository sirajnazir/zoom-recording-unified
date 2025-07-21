#!/usr/bin/env node

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;

const TARGET_UUID = 'NQKl7jSPT3eMaKE4vZfNsA==';

async function downloadRecording() {
    console.log('🎯 DOWNLOADING RECORDING');
    console.log('================================================================================');
    console.log(`UUID: ${TARGET_UUID}`);
    console.log('================================================================================\n');

    try {
        // Create output directory
        const outputDir = path.join(__dirname, 'output', `M:86785286809U:${TARGET_UUID}`);
        await fs.mkdir(outputDir, { recursive: true });
        console.log(`📁 Created output directory: ${outputDir}\n`);

        // Initialize services
        const { ZoomService } = require('./src/infrastructure/services/ZoomService');
        const config = {
            zoom: {
                accountId: process.env.ZOOM_ACCOUNT_ID,
                clientId: process.env.ZOOM_CLIENT_ID,
                clientSecret: process.env.ZOOM_CLIENT_SECRET
            },
            paths: {
                recordingOutput: outputDir
            }
        };
        
        const logger = {
            info: (...args) => console.log('[INFO]', ...args),
            error: (...args) => console.error('[ERROR]', ...args)
        };
        
        const zoomService = new ZoomService({ config, logger });
        
        // Get recording
        const doubleEncodedUuid = encodeURIComponent(encodeURIComponent(TARGET_UUID));
        const recording = await zoomService.getRecording(doubleEncodedUuid);
        
        console.log('✅ Recording found:');
        console.log(`   Topic: ${recording.topic}`);
        console.log(`   Date: ${recording.start_time}`);
        console.log(`   Meeting ID: ${recording.id || recording.meeting_id}`);
        console.log(`   Files: ${recording.recording_files?.length || 0}\n`);
        
        // Download each file manually
        const axios = require('axios');
        const accessToken = await zoomService.getZoomToken();
        
        for (const file of recording.recording_files) {
            console.log(`📥 Downloading ${file.recording_type}...`);
            
            try {
                const ext = file.file_extension?.toLowerCase() || file.recording_type.split('_').pop();
                const filename = `${file.recording_type}.${ext}`;
                const filepath = path.join(outputDir, filename);
                
                const response = await axios({
                    method: 'GET',
                    url: file.download_url,
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'stream'
                });
                
                const writer = require('fs').createWriteStream(filepath);
                response.data.pipe(writer);
                
                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });
                
                const stats = await fs.stat(filepath);
                console.log(`   ✅ Saved: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
                
            } catch (dlError) {
                console.error(`   ❌ Failed to download ${file.recording_type}:`, dlError.message);
            }
        }
        
        console.log(`\n✅ Download complete!`);
        console.log(`📁 Files saved to: ${outputDir}`);
        
        // List files
        const files = await fs.readdir(outputDir);
        console.log('\n📋 Downloaded files:');
        for (const file of files) {
            const stats = await fs.stat(path.join(outputDir, file));
            console.log(`   - ${file} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
    }
}

downloadRecording().catch(console.error);