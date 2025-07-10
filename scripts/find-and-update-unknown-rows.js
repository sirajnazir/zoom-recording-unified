#!/usr/bin/env node

/**
 * Find and update the actual unknown rows in Google Sheets
 * This will search for rows with "unknown" or "Unknown" and update them
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

// The recordings with their correct information based on what we found
const recordingsInfo = [
    { pattern: '330f04559d336f8b', coach: 'Jenny', student: 'Huda', date: '2023-09-02' },
    { pattern: '67b7b4ddb94d9714', coach: 'Jenny', student: 'Huda', date: '2023-08-30' },
    { pattern: '7247ecbd0e5fae62', coach: 'Jenny', student: 'Huda', date: '2023-08-25' },
    { pattern: '7190c776c4c0d307', coach: 'Jenny', student: 'Huda', date: '2023-08-21' },
    { pattern: '324b9bb1a74a3f89', coach: 'Jenny', student: 'Huda', date: '2023-08-15' },
    { pattern: '0f53dda2ddac18b2', coach: 'Jenny', student: 'Huda', date: '2023-08-08' },
    { pattern: '37b4f7c7f24f1a85', coach: 'Alan', student: 'Rayaan', date: '2025-01-30' }
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

async function findAndUpdateUnknownRows(sheets) {
    const spreadsheetId = config.google.sheets.masterIndexSheetId;
    const driveStandardizedTab = 'Drive Import - Standardized';
    
    console.log('🔍 Searching for unknown rows in Drive Import - Standardized tab...\n');
    
    // Get all rows
    const range = `'${driveStandardizedTab}'!A:BZ`;
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range
    });
    
    const rows = response.data.values || [];
    const headers = rows[0];
    
    // Find column indices
    const cols = {
        recordingId: headers.indexOf('Recording ID'),
        coach: headers.indexOf('Coach'),
        student: headers.indexOf('Student'),
        standardizedName: headers.indexOf('Standardized Name'),
        participants: headers.indexOf('Participants'),
        folderLink: headers.indexOf('Drive Link'),
        sessionName: headers.indexOf('Session Name')
    };
    
    console.log(`Total rows in sheet: ${rows.length - 1}\n`);
    
    // Find all unknown rows
    const unknownRows = [];
    for (let i = 1; i < rows.length; i++) {
        const coach = rows[i][cols.coach] || '';
        const student = rows[i][cols.student] || '';
        const standardizedName = rows[i][cols.standardizedName] || '';
        
        if (coach.toLowerCase() === 'unknown' || 
            student.toLowerCase() === 'unknown' ||
            standardizedName.toLowerCase().includes('unknown')) {
            
            unknownRows.push({
                rowIndex: i,
                recordingId: rows[i][cols.recordingId] || '',
                coach: coach,
                student: student,
                standardizedName: standardizedName,
                folderLink: rows[i][cols.folderLink] || '',
                sessionName: rows[i][cols.sessionName] || ''
            });
        }
    }
    
    console.log(`Found ${unknownRows.length} unknown rows\n`);
    
    if (unknownRows.length === 0) {
        console.log('✅ No unknown rows found!');
        return;
    }
    
    // Display unknown rows
    console.log('Unknown rows found:');
    unknownRows.forEach((row, idx) => {
        console.log(`${idx + 1}. Row ${row.rowIndex + 1}:`);
        console.log(`   Recording ID: ${row.recordingId}`);
        console.log(`   Current: Coach="${row.coach}", Student="${row.student}"`);
        console.log(`   Standardized Name: ${row.standardizedName}`);
        console.log('');
    });
    
    // Match and prepare updates
    const updates = [];
    let matchedCount = 0;
    
    for (const unknownRow of unknownRows) {
        // Try to match with our recordings info
        let matched = null;
        
        // Check various fields for the session ID pattern
        for (const recording of recordingsInfo) {
            if (unknownRow.recordingId.includes(recording.pattern) ||
                unknownRow.standardizedName.includes(recording.pattern) ||
                unknownRow.sessionName.includes(recording.pattern) ||
                unknownRow.folderLink.includes(recording.pattern)) {
                matched = recording;
                break;
            }
        }
        
        if (matched) {
            console.log(`✅ Matched row ${unknownRow.rowIndex + 1} with pattern ${matched.pattern}`);
            console.log(`   Will update: Coach="${matched.coach}", Student="${matched.student}"`);
            
            matchedCount++;
            
            // Prepare updates
            updates.push({
                range: `'${driveStandardizedTab}'!${getColumnLetter(cols.coach)}${unknownRow.rowIndex + 1}`,
                values: [[matched.coach]]
            });
            
            updates.push({
                range: `'${driveStandardizedTab}'!${getColumnLetter(cols.student)}${unknownRow.rowIndex + 1}`,
                values: [[matched.student]]
            });
            
            updates.push({
                range: `'${driveStandardizedTab}'!${getColumnLetter(cols.participants)}${unknownRow.rowIndex + 1}`,
                values: [[`${matched.coach}, ${matched.student}`]]
            });
            
            // Update standardized name
            const newStandardizedName = unknownRow.standardizedName
                .replace(/unknown/gi, matched.coach)
                .replace(/Unknown/g, matched.student)
                .replace(/2025-07-07/g, matched.date);
            
            updates.push({
                range: `'${driveStandardizedTab}'!${getColumnLetter(cols.standardizedName)}${unknownRow.rowIndex + 1}`,
                values: [[newStandardizedName]]
            });
        } else {
            console.log(`❌ No match found for row ${unknownRow.rowIndex + 1}`);
        }
    }
    
    console.log(`\n📊 Matched ${matchedCount} out of ${unknownRows.length} unknown rows`);
    
    // Execute updates
    if (updates.length > 0) {
        console.log(`\n🔄 Updating ${matchedCount} rows...`);
        
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            resource: {
                data: updates,
                valueInputOption: 'USER_ENTERED'
            }
        });
        
        console.log('✅ Updates completed successfully!');
    }
    
    // Also update the Raw tab
    console.log('\n🔄 Updating Drive Import - Raw tab...');
    
    const rawRange = `'Drive Import - Raw'!A:Z`;
    const rawResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: rawRange
    });
    
    const rawRows = rawResponse.data.values || [];
    const rawHeaders = rawRows[0];
    
    const rawCols = {
        sessionName: rawHeaders.indexOf('Session Name'),
        folderName: rawHeaders.indexOf('Folder Name')
    };
    
    const rawUpdates = [];
    
    for (let i = 1; i < rawRows.length; i++) {
        const sessionName = rawRows[i][rawCols.sessionName] || '';
        
        for (const recording of recordingsInfo) {
            if (sessionName.includes(recording.pattern)) {
                // Update folder name if it contains unknown
                if (rawCols.folderName >= 0) {
                    const currentFolderName = rawRows[i][rawCols.folderName] || '';
                    if (currentFolderName.toLowerCase().includes('unknown')) {
                        const newFolderName = currentFolderName
                            .replace(/unknown/gi, recording.coach)
                            .replace(/Unknown/g, recording.student)
                            .replace(/2025-07-07/g, recording.date);
                        
                        rawUpdates.push({
                            range: `'Drive Import - Raw'!${getColumnLetter(rawCols.folderName)}${i + 1}`,
                            values: [[newFolderName]]
                        });
                    }
                }
                break;
            }
        }
    }
    
    if (rawUpdates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            resource: {
                data: rawUpdates,
                valueInputOption: 'USER_ENTERED'
            }
        });
        
        console.log(`✅ Updated ${rawUpdates.length} rows in Raw tab`);
    }
}

async function main() {
    console.log('🔧 Finding and Updating Unknown Rows in Google Sheets');
    console.log('=' .repeat(70));
    
    try {
        const sheets = await initializeSheets();
        await findAndUpdateUnknownRows(sheets);
        
        console.log('\n✅ Process complete!');
        console.log('📊 Check the Drive Import tabs - unknown recordings should now show proper names');
        
    } catch (error) {
        console.error('\n❌ Error:', error);
        console.error('Stack:', error.stack);
    }
}

console.log('🚀 Starting search for unknown rows...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });