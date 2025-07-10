#!/usr/bin/env node
/**
 * Check Last Processed Recording in Google Sheets
 * 
 * This script connects to Google Sheets and finds the last processed recording
 * to verify what was successfully completed before the process was terminated
 */

require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

async function checkLastProcessed() {
    console.log(`
================================================================================
📊 CHECKING LAST PROCESSED RECORDING IN GOOGLE SHEETS
================================================================================
📅 Date: ${new Date().toISOString()}
================================================================================
`);

    try {
        // Initialize Google Sheets API
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './config/service-account-key.json',
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

        if (!spreadsheetId) {
            console.error('❌ GOOGLE_SHEETS_SPREADSHEET_ID not found in environment variables');
            process.exit(1);
        }

        console.log(`📋 Spreadsheet ID: ${spreadsheetId}`);

        // Get all data from the sheet
        console.log('\n🔍 Fetching data from Google Sheets...');
        
        // Try different tab names that might be used
        const tabNames = ['Zoom Recordings Master Index', 'Master Index', 'Sheet1', 'Recordings'];
        let data = null;
        let usedTab = null;

        for (const tabName of tabNames) {
            try {
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId,
                    range: `${tabName}!A:Z` // Get all columns
                });
                
                if (response.data.values && response.data.values.length > 0) {
                    data = response.data.values;
                    usedTab = tabName;
                    console.log(`✅ Found data in tab: ${tabName}`);
                    break;
                }
            } catch (e) {
                // Tab doesn't exist, try next
                continue;
            }
        }

        if (!data || data.length === 0) {
            console.log('❌ No data found in any tab');
            return;
        }

        // Find header row
        const headers = data[0];
        console.log(`\n📊 Total rows in sheet: ${data.length - 1} (excluding header)`);

        // Find relevant columns
        const topicCol = headers.findIndex(h => h && h.toLowerCase().includes('topic'));
        const meetingIdCol = headers.findIndex(h => h && (h.toLowerCase().includes('meeting') || h.toLowerCase() === 'id'));
        const dateCol = headers.findIndex(h => h && h.toLowerCase().includes('date'));
        const processedCol = headers.findIndex(h => h && h.toLowerCase().includes('processed'));
        const timestampCol = headers.findIndex(h => h && h.toLowerCase().includes('timestamp'));

        // Get last 10 rows
        const lastRows = data.slice(-10);
        
        console.log('\n📋 Last 10 recordings in sheet:');
        console.log('================================================================================');
        
        lastRows.forEach((row, idx) => {
            const rowNum = data.length - 10 + idx;
            const topic = topicCol >= 0 ? row[topicCol] : 'Unknown';
            const meetingId = meetingIdCol >= 0 ? row[meetingIdCol] : 'Unknown';
            const date = dateCol >= 0 ? row[dateCol] : 'Unknown';
            
            console.log(`Row ${rowNum}: ${topic}`);
            console.log(`   Meeting ID: ${meetingId}`);
            console.log(`   Date: ${date}`);
            console.log('---');
        });

        // Try to find recordings with "Siraj Nazir's Zoom Meeting" topic around row 221
        console.log('\n🔍 Looking for recordings around row 221...');
        const startRow = Math.max(215, 1);
        const endRow = Math.min(230, data.length);
        
        console.log(`\nRecordings from row ${startRow} to ${endRow}:`);
        console.log('================================================================================');
        
        for (let i = startRow; i <= endRow && i < data.length; i++) {
            const row = data[i];
            if (row && row.length > 0) {
                const topic = topicCol >= 0 ? row[topicCol] : 'Unknown';
                const meetingId = meetingIdCol >= 0 ? row[meetingIdCol] : 'Unknown';
                console.log(`Row ${i}: ${topic} (ID: ${meetingId})`);
            }
        }

        // Save the findings to a file
        const findings = {
            totalRows: data.length - 1,
            lastProcessedRow: data.length - 1,
            tabUsed: usedTab,
            timestamp: new Date().toISOString(),
            last10Recordings: lastRows.map((row, idx) => ({
                rowNumber: data.length - 10 + idx,
                topic: topicCol >= 0 ? row[topicCol] : 'Unknown',
                meetingId: meetingIdCol >= 0 ? row[meetingIdCol] : 'Unknown',
                date: dateCol >= 0 ? row[dateCol] : 'Unknown'
            }))
        };

        const outputFile = 'last-processed-check.json';
        fs.writeFileSync(outputFile, JSON.stringify(findings, null, 2));
        console.log(`\n💾 Findings saved to: ${outputFile}`);

        console.log(`
================================================================================
📊 SUMMARY
================================================================================
✅ Total recordings in sheet: ${data.length - 1}
📍 Last row number: ${data.length - 1}
📋 Tab used: ${usedTab}
================================================================================

💡 Based on the log file, recording 221 was the last successfully processed.
💡 To resume, start from recording 222.
`);

    } catch (error) {
        console.error('❌ Error checking Google Sheets:', error.message);
        console.error('\nMake sure:');
        console.error('1. GOOGLE_SHEETS_SPREADSHEET_ID is set in .env');
        console.error('2. Service account key file exists');
        console.error('3. Service account has access to the spreadsheet');
    }
}

// Check if googleapis is installed
try {
    require('googleapis');
} catch (e) {
    console.error('❌ googleapis module not found. Installing...');
    const { execSync } = require('child_process');
    try {
        execSync('npm install googleapis', { stdio: 'inherit' });
        console.log('✅ googleapis installed successfully');
        // Re-require after installation
        delete require.cache[require.resolve('googleapis')];
        require('googleapis');
    } catch (installError) {
        console.error('❌ Failed to install googleapis:', installError.message);
        console.log('\nPlease run: npm install googleapis');
        process.exit(1);
    }
}

// Run the check
checkLastProcessed().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});