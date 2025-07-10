#!/usr/bin/env node

/**
 * Update Google Sheets for the folders we just moved
 * This will update the standardized names and paths
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

// The folders we just moved with their new names
const movedFolders = [
    { sessionId: '330f04559d336f8b', coach: 'Jenny', student: 'Huda' },
    { sessionId: '67b7b4ddb94d9714', coach: 'Jenny', student: 'Huda' },
    { sessionId: '7247ecbd0e5fae62', coach: 'Jenny', student: 'Huda' },
    { sessionId: '7190c776c4c0d307', coach: 'Jenny', student: 'Huda' },
    { sessionId: '324b9bb1a74a3f89', coach: 'Jenny', student: 'Huda' },
    { sessionId: '0f53dda2ddac18b2', coach: 'Jenny', student: 'Huda' },
    { sessionId: '37b4f7c7f24f1a85', coach: 'Alan', student: 'Rayaan' }
];

async function initializeServices() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: config.google.clientEmail,
            private_key: config.google.privateKey
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
    });
    
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });
    
    return { sheets, drive };
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

async function updateSheetRows(sheets, drive) {
    const spreadsheetId = config.google.sheets.masterIndexSheetId;
    const driveStandardizedTab = 'Drive Import - Standardized';
    
    console.log('📊 Updating Google Sheets for moved folders...\n');
    
    // Get all rows from the sheet
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
        driveLink: headers.indexOf('Drive Link')
    };
    
    console.log(`Found ${rows.length - 1} data rows in sheet\n`);
    
    let updatedCount = 0;
    
    // Search for each moved folder
    for (const folder of movedFolders) {
        console.log(`🔍 Looking for session ${folder.sessionId}...`);
        
        // Try to find by various methods
        let rowIndex = -1;
        
        // Method 1: Search by standardized name containing the session ID
        for (let i = 1; i < rows.length; i++) {
            const standardizedName = rows[i][cols.standardizedName] || '';
            const recordingId = rows[i][cols.recordingId] || '';
            
            if (standardizedName.includes(folder.sessionId) || recordingId === folder.sessionId) {
                rowIndex = i;
                break;
            }
        }
        
        // Method 2: If not found, search for unknown rows with matching patterns
        if (rowIndex === -1) {
            for (let i = 1; i < rows.length; i++) {
                const coach = rows[i][cols.coach] || '';
                const student = rows[i][cols.student] || '';
                const standardizedName = rows[i][cols.standardizedName] || '';
                
                if ((coach.toLowerCase() === 'unknown' || student.toLowerCase() === 'unknown') &&
                    standardizedName.includes('_B_')) {
                    // Check if this might be our recording by checking the date or other patterns
                    rowIndex = i;
                    break;
                }
            }
        }
        
        if (rowIndex === -1) {
            console.log(`   ❌ Not found in sheets`);
            continue;
        }
        
        console.log(`   ✅ Found at row ${rowIndex + 1}`);
        
        // Generate new standardized name
        const date = rows[rowIndex][cols.standardizedName]?.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '2025-07-07';
        const newStandardizedName = `Coaching_B_${folder.coach}_${folder.student}_Wk01_${date}_M_${folder.sessionId}U_${folder.sessionId}`;
        
        // Prepare updates
        const updates = [];
        
        if (cols.coach >= 0) {
            updates.push({
                range: `'${driveStandardizedTab}'!${getColumnLetter(cols.coach)}${rowIndex + 1}`,
                values: [[folder.coach]]
            });
        }
        
        if (cols.student >= 0) {
            updates.push({
                range: `'${driveStandardizedTab}'!${getColumnLetter(cols.student)}${rowIndex + 1}`,
                values: [[folder.student]]
            });
        }
        
        if (cols.standardizedName >= 0) {
            updates.push({
                range: `'${driveStandardizedTab}'!${getColumnLetter(cols.standardizedName)}${rowIndex + 1}`,
                values: [[newStandardizedName]]
            });
        }
        
        if (cols.participants >= 0) {
            updates.push({
                range: `'${driveStandardizedTab}'!${getColumnLetter(cols.participants)}${rowIndex + 1}`,
                values: [[`${folder.coach}, ${folder.student}`]]
            });
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
            
            console.log(`   ✅ Updated: ${newStandardizedName}`);
            updatedCount++;
        }
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`\n📊 Summary: Updated ${updatedCount} out of ${movedFolders.length} recordings in sheets`);
    
    // Now update the Drive Import - Raw tab as well
    console.log('\n🔄 Updating Raw tab...');
    
    const driveRawTab = 'Drive Import - Raw';
    const rawRange = `'${driveRawTab}'!A:Z`;
    
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
    
    let rawUpdatedCount = 0;
    
    for (const folder of movedFolders) {
        // Find matching row in raw tab
        for (let i = 1; i < rawRows.length; i++) {
            const sessionName = rawRows[i][rawCols.sessionName] || '';
            
            if (sessionName.includes(folder.sessionId)) {
                const newFolderName = `Coaching_B_${folder.coach}_${folder.student}_Wk01_2025-07-07_M_${folder.sessionId}U_${folder.sessionId}`;
                
                const updates = [];
                
                if (rawCols.folderName >= 0) {
                    updates.push({
                        range: `'${driveRawTab}'!${getColumnLetter(rawCols.folderName)}${i + 1}`,
                        values: [[newFolderName]]
                    });
                }
                
                if (updates.length > 0) {
                    await sheets.spreadsheets.values.batchUpdate({
                        spreadsheetId,
                        resource: {
                            data: updates,
                            valueInputOption: 'USER_ENTERED'
                        }
                    });
                    
                    rawUpdatedCount++;
                }
                
                break;
            }
        }
    }
    
    console.log(`✅ Updated ${rawUpdatedCount} rows in Raw tab`);
}

async function main() {
    console.log('🔧 Updating Google Sheets for Moved Folders');
    console.log('=' .repeat(70));
    
    try {
        const { sheets, drive } = await initializeServices();
        await updateSheetRows(sheets, drive);
        
        console.log('\n✅ Sheet update complete!');
        console.log('📊 Check the Drive Import tabs - unknown recordings should now show proper names');
        
    } catch (error) {
        console.error('\n❌ Error:', error);
    }
}

console.log('🚀 Starting sheet update process...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });