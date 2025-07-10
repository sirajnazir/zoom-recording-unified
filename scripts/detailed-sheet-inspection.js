#!/usr/bin/env node

/**
 * Detailed inspection of Drive Import tabs
 * Show actual content to understand what's happening
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

async function inspectDriveImportTabs(sheets) {
    const spreadsheetId = config.google.sheets.masterIndexSheetId;
    
    // Check Drive Import - Standardized
    console.log('📊 Inspecting Drive Import - Standardized Tab');
    console.log('=' .repeat(70));
    
    const range = `'Drive Import - Standardized'!A1:Z20`; // First 20 rows
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range
    });
    
    const rows = response.data.values || [];
    
    if (rows.length === 0) {
        console.log('Tab is empty!');
        return;
    }
    
    const headers = rows[0];
    console.log('\nHeaders found:');
    headers.forEach((header, idx) => {
        console.log(`  ${idx}: ${header}`);
    });
    
    // Find key columns
    const coachCol = headers.indexOf('Coach');
    const studentCol = headers.indexOf('Student');
    const standardizedNameCol = headers.indexOf('Standardized Name');
    const recordingIdCol = headers.indexOf('Recording ID');
    
    console.log('\n\nFirst 10 data rows:');
    console.log('─'.repeat(70));
    
    for (let i = 1; i <= Math.min(10, rows.length - 1); i++) {
        const row = rows[i];
        if (!row || row.length === 0) {
            console.log(`Row ${i}: [EMPTY ROW]`);
            continue;
        }
        
        console.log(`\nRow ${i}:`);
        if (recordingIdCol >= 0 && row[recordingIdCol]) {
            console.log(`  Recording ID: "${row[recordingIdCol]}"`);
        }
        if (coachCol >= 0) {
            console.log(`  Coach: "${row[coachCol] || '[BLANK]'}"`);
        }
        if (studentCol >= 0) {
            console.log(`  Student: "${row[studentCol] || '[BLANK]'}"`);
        }
        if (standardizedNameCol >= 0 && row[standardizedNameCol]) {
            console.log(`  Standardized Name: "${row[standardizedNameCol]}"`);
        }
    }
    
    // Check last 20 rows
    console.log('\n\nLast 20 rows summary:');
    console.log('─'.repeat(70));
    
    const fullRange = `'Drive Import - Standardized'!A:Z`;
    const fullResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: fullRange
    });
    
    const allRows = fullResponse.data.values || [];
    const startRow = Math.max(1, allRows.length - 20);
    
    for (let i = startRow; i < allRows.length; i++) {
        const row = allRows[i];
        if (!row || row.length === 0 || !row.some(cell => cell)) {
            console.log(`Row ${i + 1}: [EMPTY]`);
        } else {
            const coach = coachCol >= 0 ? row[coachCol] || '' : '';
            const student = studentCol >= 0 ? row[studentCol] || '' : '';
            const recordingId = recordingIdCol >= 0 ? row[recordingIdCol] || '' : '';
            
            // Check for various spellings of unknown
            const hasUnknown = coach.match(/unknown/i) || student.match(/unknown/i);
            const marker = hasUnknown ? '❌' : '✅';
            
            console.log(`Row ${i + 1}: ${marker} Coach="${coach}", Student="${student}", ID="${recordingId}"`);
        }
    }
    
    // Count totals
    console.log('\n\n📊 Statistics:');
    console.log('─'.repeat(70));
    
    let emptyRows = 0;
    let unknownCount = 0;
    let populatedRows = 0;
    
    for (let i = 1; i < allRows.length; i++) {
        const row = allRows[i];
        if (!row || row.length === 0 || !row.some(cell => cell)) {
            emptyRows++;
        } else {
            populatedRows++;
            const coach = coachCol >= 0 ? row[coachCol] || '' : '';
            const student = studentCol >= 0 ? row[studentCol] || '' : '';
            
            if (coach.match(/unknown/i) || student.match(/unknown/i)) {
                unknownCount++;
            }
        }
    }
    
    console.log(`Total data rows: ${allRows.length - 1}`);
    console.log(`Populated rows: ${populatedRows}`);
    console.log(`Empty rows: ${emptyRows}`);
    console.log(`Rows with 'unknown' (any case): ${unknownCount}`);
}

async function main() {
    console.log('🔧 Detailed Sheet Inspection');
    console.log('=' .repeat(70));
    
    try {
        const sheets = await initializeSheets();
        await inspectDriveImportTabs(sheets);
        
    } catch (error) {
        console.error('\n❌ Error:', error);
    }
}

console.log('🚀 Starting detailed inspection...\n');

main()
    .then(() => {
        console.log('\n✅ Inspection completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });