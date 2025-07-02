#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ZoomService } = require('../src/infrastructure/services/ZoomService');

async function listRecordingsToCSV({ fromDate, toDate, output = 'zoom-recordings-list.csv' }) {
    const zoomService = new ZoomService({ 
        config: {
            zoom: {
                accountId: process.env.ZOOM_ACCOUNT_ID,
                clientId: process.env.ZOOM_CLIENT_ID,
                clientSecret: process.env.ZOOM_CLIENT_SECRET
            }
        },
        logger: console 
    });
    
    console.log(`🚀 Fetching Zoom cloud recordings from ${fromDate} to ${toDate}...`);
    console.log(`📊 Using comprehensive strategy: Daily search + Per-user search + Meeting ID search...`);

    try {
        // Use the existing comprehensive getAllRecordings method
        const allRecordings = await zoomService.getAllRecordings(fromDate, toDate);
        
        console.log(`\n✅ Found ${allRecordings.length} recordings using comprehensive search`);
        
        // Convert Map to array and format for CSV
        const recordingsArray = Array.from(allRecordings.values()).map(rec => ({
            meeting_id: rec.meeting_id || rec.id || '',
            uuid: rec.uuid || '',
            recording_uuid: rec.recording_uuid || rec.id || '',
            start_time: rec.start_time || '',
            topic: rec.topic || '',
            host_email: rec.host_email || '',
            host_name: rec.host_name || '',
            account_id: rec.account_id || '',
            user_id: rec.user_id || '',
            file_type: rec.file_type || '',
            file_size: rec.file_size || '',
            status: rec.status || '',
            download_url: rec.download_url || '',
            recording_start: rec.recording_start || '',
            recording_end: rec.recording_end || '',
            duration: rec.duration || '',
            method_found: rec.method_found || 'unknown'
        }));

        // Write to CSV
        const csvHeader = [
            'meeting_id',
            'uuid',
            'recording_uuid',
            'start_time',
            'topic',
            'host_email',
            'host_name',
            'account_id',
            'user_id',
            'file_type',
            'file_size',
            'status',
            'download_url',
            'recording_start',
            'recording_end',
            'duration',
            'method_found'
        ];
        
        const csvRows = [csvHeader.join(',')];
        for (const rec of recordingsArray) {
            csvRows.push(csvHeader.map(h => `"${(rec[h] || '').toString().replace(/"/g, '""')}"`).join(','));
        }
        
        const outputPath = path.join(process.cwd(), output);
        fs.writeFileSync(outputPath, csvRows.join('\n'));
        
        console.log(`\n✅ Done! Wrote ${recordingsArray.length} recordings to ${outputPath}`);
        console.log(`📊 Summary:`);
        console.log(`   - Total recordings: ${recordingsArray.length}`);
        console.log(`   - Date range: ${fromDate} to ${toDate}`);
        console.log(`   - Unique meetings: ${new Set(recordingsArray.map(r => r.meeting_id)).size}`);
        console.log(`   - Unique hosts: ${new Set(recordingsArray.map(r => r.host_email).filter(e => e)).size}`);
        
        // Show sample of recordings for verification
        if (recordingsArray.length > 0) {
            console.log(`\n📋 Sample recordings:`);
            recordingsArray.slice(0, 5).forEach((rec, i) => {
                console.log(`   ${i + 1}. ${rec.topic} (${rec.host_email}) - ${rec.recording_uuid}`);
            });
            
            // Show breakdown by method found
            const methodBreakdown = {};
            recordingsArray.forEach(rec => {
                const method = rec.method_found || 'unknown';
                methodBreakdown[method] = (methodBreakdown[method] || 0) + 1;
            });
            console.log(`\n🔍 Breakdown by search method:`);
            Object.entries(methodBreakdown).forEach(([method, count]) => {
                console.log(`   - ${method}: ${count} recordings`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error fetching recordings:', error.message);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
        throw error;
    } finally {
        // Clean up
        await zoomService.dispose();
    }
}

// Parse CLI args
const argv = require('yargs/yargs')(process.argv.slice(2)).argv;
const fromDate = argv.from || argv.fromDate || argv.start || '2024-04-01';
const toDate = argv.to || argv.toDate || argv.end || new Date().toISOString().split('T')[0];
const output = argv.output || argv.o || 'zoom-recordings-list.csv';

listRecordingsToCSV({ fromDate, toDate, output }).catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
}); 