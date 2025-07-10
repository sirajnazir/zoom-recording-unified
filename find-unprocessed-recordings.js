#!/usr/bin/env node

require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs').promises;

async function findUnprocessedRecordings() {
    console.log('🔍 Finding unprocessed recordings...\n');
    
    // Initialize Google Sheets
    const auth = new google.auth.GoogleAuth({
        keyFile: './google-credentials.json',
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.MASTER_INDEX_SHEET_ID || '1xa4E5PcrxRVaMbJfWH_d5LLSqY3RlCf6Ur3rwKtq2jQ';
    
    try {
        // Get all processed UUIDs from Zoom API tabs
        console.log('📊 Reading processed recordings from Google Sheets...');
        
        // Get Zoom API Raw data
        const rawResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Zoom API - Raw!A:A' // Just get UUIDs
        });
        
        const processedUuids = new Set();
        if (rawResponse.data.values) {
            // Skip header row
            for (let i = 1; i < rawResponse.data.values.length; i++) {
                const uuid = rawResponse.data.values[i][0];
                if (uuid) {
                    processedUuids.add(uuid);
                }
            }
        }
        
        console.log(`✅ Found ${processedUuids.size} processed recordings in sheets\n`);
        
        // Get all Zoom recordings from the API
        const { ZoomService } = require('./src/infrastructure/services/ZoomService');
        const zoomService = new ZoomService();
        
        console.log('🔄 Fetching recordings from Zoom API...');
        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 1095); // 3 years
        
        const recordings = await zoomService.getRecordings(
            fromDate.toISOString().split('T')[0],
            toDate.toISOString().split('T')[0]
        );
        
        console.log(`📹 Found ${recordings.length} total recordings in Zoom\n`);
        
        // Find unprocessed recordings
        const unprocessedRecordings = [];
        for (const recording of recordings) {
            if (!processedUuids.has(recording.uuid)) {
                unprocessedRecordings.push({
                    uuid: recording.uuid,
                    id: recording.id,
                    topic: recording.topic,
                    start_time: recording.start_time,
                    duration: recording.duration
                });
            }
        }
        
        console.log(`\n🎯 Found ${unprocessedRecordings.length} unprocessed recordings:\n`);
        
        // Display unprocessed recordings
        unprocessedRecordings.forEach((rec, index) => {
            console.log(`${index + 1}. UUID: ${rec.uuid}`);
            console.log(`   Topic: ${rec.topic}`);
            console.log(`   Date: ${rec.start_time}`);
            console.log(`   Duration: ${rec.duration} minutes\n`);
        });
        
        // Save to file
        await fs.writeFile(
            'unprocessed-recordings.json',
            JSON.stringify(unprocessedRecordings, null, 2)
        );
        
        console.log(`\n💾 Saved unprocessed recordings to unprocessed-recordings.json`);
        console.log(`\n📊 Summary:`);
        console.log(`   - Total Zoom recordings: ${recordings.length}`);
        console.log(`   - Already processed: ${processedUuids.size}`);
        console.log(`   - Remaining to process: ${unprocessedRecordings.length}`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response?.data?.error?.message) {
            console.error('   Details:', error.response.data.error.message);
        }
    }
}

// Run if called directly
if (require.main === module) {
    findUnprocessedRecordings().catch(console.error);
}

module.exports = { findUnprocessedRecordings };