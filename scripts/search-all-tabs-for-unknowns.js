#!/usr/bin/env node

/**
 * Search all tabs for unknown recordings
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

async function initializeSheets() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: config.google.clientEmail,
            private_key: config.google.privateKey
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    
    return google.sheets({ version: 'v4', auth });
}

async function searchAllTabs(sheets) {
    const spreadsheetId = config.google.sheets.masterIndexSheetId;
    
    // Get all tabs
    const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId
    });
    
    const allSheets = spreadsheet.data.sheets;
    console.log(`Found ${allSheets.length} tabs in the spreadsheet\n`);
    
    // Search each tab for unknowns
    for (const sheet of allSheets) {
        const sheetName = sheet.properties.title;
        console.log(`\n🔍 Searching tab: ${sheetName}`);
        console.log('─'.repeat(50));
        
        try {
            const range = `'${sheetName}'!A:BZ`;
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range
            });
            
            const rows = response.data.values || [];
            if (rows.length === 0) {
                console.log('   Tab is empty');
                continue;
            }
            
            const headers = rows[0];
            
            // Find relevant columns
            const coachCol = headers.indexOf('Coach');
            const studentCol = headers.indexOf('Student');
            const standardizedNameCol = headers.indexOf('Standardized Name');
            const recordingIdCol = headers.indexOf('Recording ID');
            const sessionNameCol = headers.indexOf('Session Name');
            
            console.log(`   Total rows: ${rows.length - 1}`);
            
            // Search for unknowns
            const unknownRows = [];
            
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue;
                
                // Check if any cell contains "unknown" (case insensitive)
                let hasUnknown = false;
                let details = {};
                
                if (coachCol >= 0 && row[coachCol]) {
                    const coach = row[coachCol].toString();
                    if (coach.toLowerCase() === 'unknown') {
                        hasUnknown = true;
                        details.coach = coach;
                    }
                }
                
                if (studentCol >= 0 && row[studentCol]) {
                    const student = row[studentCol].toString();
                    if (student.toLowerCase() === 'unknown') {
                        hasUnknown = true;
                        details.student = student;
                    }
                }
                
                if (standardizedNameCol >= 0 && row[standardizedNameCol]) {
                    const name = row[standardizedNameCol].toString();
                    if (name.toLowerCase().includes('unknown')) {
                        hasUnknown = true;
                        details.standardizedName = name;
                    }
                }
                
                if (hasUnknown) {
                    details.rowNumber = i + 1;
                    details.recordingId = recordingIdCol >= 0 ? row[recordingIdCol] || '' : '';
                    details.sessionName = sessionNameCol >= 0 ? row[sessionNameCol] || '' : '';
                    unknownRows.push(details);
                }
            }
            
            if (unknownRows.length > 0) {
                console.log(`   ❌ Found ${unknownRows.length} unknown rows:`);
                unknownRows.slice(0, 5).forEach((row, idx) => {
                    console.log(`      ${idx + 1}. Row ${row.rowNumber}:`);
                    if (row.recordingId) console.log(`         Recording ID: ${row.recordingId}`);
                    if (row.coach) console.log(`         Coach: ${row.coach}`);
                    if (row.student) console.log(`         Student: ${row.student}`);
                    if (row.standardizedName) console.log(`         Name: ${row.standardizedName}`);
                });
                if (unknownRows.length > 5) {
                    console.log(`      ... and ${unknownRows.length - 5} more`);
                }
            } else {
                console.log(`   ✅ No unknown rows found`);
            }
            
        } catch (error) {
            console.log(`   ⚠️ Error reading tab: ${error.message}`);
        }
    }
}

async function main() {
    console.log('🔧 Searching All Tabs for Unknown Recordings');
    console.log('=' .repeat(70));
    
    try {
        const sheets = await initializeSheets();
        await searchAllTabs(sheets);
        
        console.log('\n✅ Search complete!');
        
    } catch (error) {
        console.error('\n❌ Error:', error);
    }
}

console.log('🚀 Starting comprehensive search...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });