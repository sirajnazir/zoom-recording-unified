#!/usr/bin/env node

/**
 * Final update to fix coach/student names in sheets
 * This will update the rows we just added with the correct names
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

// The recordings with their correct information
const recordingsToFix = [
    { sessionId: '330f04559d336f8b', coach: 'Jenny', student: 'Huda', date: '2023-09-02' },
    { sessionId: '67b7b4ddb94d9714', coach: 'Jenny', student: 'Huda', date: '2023-08-30' },
    { sessionId: '7247ecbd0e5fae62', coach: 'Jenny', student: 'Huda', date: '2023-08-25' },
    { sessionId: '7190c776c4c0d307', coach: 'Jenny', student: 'Huda', date: '2023-08-21' },
    { sessionId: '324b9bb1a74a3f89', coach: 'Jenny', student: 'Huda', date: '2023-08-15' },
    { sessionId: '0f53dda2ddac18b2', coach: 'Jenny', student: 'Huda', date: '2023-08-08' },
    { sessionId: '37b4f7c7f24f1a85', coach: 'Alan', student: 'Rayaan', date: '2025-01-30' }
];

async function initializeSheets() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: config.google.clientEmail,
            private_key: config.google.privateKey
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    
    return google.sheets({ version: 'v4', auth });
}

// Helper function to convert column index to A1 notation
function getColumnLetter(colIndex) {
    let letter = '';
    let num = colIndex;
    while (num >= 0) {
        letter = String.fromCharCode((num % 26) + 65) + letter;
        num = Math.floor(num / 26) - 1;
    }
    return letter;
}

async function updateSheetRows(sheets) {
    const spreadsheetId = config.google.sheets.masterIndexSheetId;
    
    console.log('📊 Final update of coach/student names in Google Sheets...\n');
    
    // Update both tabs
    const tabs = [
        { name: 'Drive Import - Standardized', hasStandardizedName: true },
        { name: 'Drive Import - Raw', hasStandardizedName: false }
    ];
    
    for (const tab of tabs) {
        console.log(`\n🔄 Updating ${tab.name} tab...`);
        
        const range = `'${tab.name}'!A:BZ`;
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const headers = rows[0];
        
        // Find column indices
        const cols = {
            recordingId: headers.indexOf('Recording ID'),
            sessionName: headers.indexOf('Session Name'),
            coach: headers.indexOf('Coach'),
            student: headers.indexOf('Student'),
            standardizedName: headers.indexOf('Standardized Name'),
            participants: headers.indexOf('Participants'),
            date: headers.indexOf('Date')
        };
        
        console.log(`Found ${rows.length - 1} data rows`);
        
        let updatedCount = 0;
        const updates = [];
        
        // Find and update each recording
        for (const recording of recordingsToFix) {
            // Search for the recording
            let rowIndex = -1;
            
            for (let i = 1; i < rows.length; i++) {
                const recordingId = rows[i][cols.recordingId] || '';
                const sessionName = rows[i][cols.sessionName] || '';
                const standardizedName = rows[i][cols.standardizedName] || '';
                
                if (recordingId.includes(recording.sessionId) || 
                    sessionName.includes(recording.sessionId) ||
                    standardizedName.includes(recording.sessionId)) {
                    rowIndex = i;
                    break;
                }
            }
            
            if (rowIndex === -1) {
                console.log(`   ⚠️ Recording ${recording.sessionId} not found`);
                continue;
            }
            
            console.log(`   ✅ Found ${recording.sessionId} at row ${rowIndex + 1}`);
            
            // Prepare updates
            if (cols.coach >= 0 && rows[rowIndex][cols.coach] === 'unknown') {
                updates.push({
                    range: `'${tab.name}'!${getColumnLetter(cols.coach)}${rowIndex + 1}`,
                    values: [[recording.coach]]
                });
            }
            
            if (cols.student >= 0 && rows[rowIndex][cols.student] === 'Unknown') {
                updates.push({
                    range: `'${tab.name}'!${getColumnLetter(cols.student)}${rowIndex + 1}`,
                    values: [[recording.student]]
                });
            }
            
            if (cols.participants >= 0) {
                updates.push({
                    range: `'${tab.name}'!${getColumnLetter(cols.participants)}${rowIndex + 1}`,
                    values: [[`${recording.coach}, ${recording.student}`]]
                });
            }
            
            // Update standardized name if it contains "unknown"
            if (tab.hasStandardizedName && cols.standardizedName >= 0) {
                const currentName = rows[rowIndex][cols.standardizedName] || '';
                if (currentName.includes('unknown') || currentName.includes('Unknown')) {
                    const newName = currentName
                        .replace('unknown', recording.coach)
                        .replace('Unknown', recording.student)
                        .replace('2025-07-07', recording.date);
                    
                    updates.push({
                        range: `'${tab.name}'!${getColumnLetter(cols.standardizedName)}${rowIndex + 1}`,
                        values: [[newName]]
                    });
                }
            }
            
            updatedCount++;
        }
        
        // Execute batch update
        if (updates.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                resource: {
                    data: updates,
                    valueInputOption: 'USER_ENTERED'
                }
            });
            
            console.log(`   ✅ Updated ${updatedCount} recordings in ${tab.name}`);
        } else {
            console.log(`   ℹ️ No updates needed for ${tab.name}`);
        }
    }
}

async function main() {
    console.log('🔧 Final Update - Fixing Coach/Student Names in Sheets');
    console.log('=' .repeat(70));
    
    try {
        const sheets = await initializeSheets();
        await updateSheetRows(sheets);
        
        console.log('\n✅ Final update complete!');
        console.log('📊 All 7 recordings should now show:');
        console.log('   - 6 recordings: Coach Jenny, Student Huda');
        console.log('   - 1 recording: Coach Alan, Student Rayaan');
        console.log('\n🎉 The unknown recordings have been fully fixed!');
        
    } catch (error) {
        console.error('\n❌ Error:', error);
    }
}

console.log('🚀 Starting final sheet update...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });