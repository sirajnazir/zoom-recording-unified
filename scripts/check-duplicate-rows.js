#!/usr/bin/env node

/**
 * Check for duplicate rows or new rows that were added
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

async function checkForDuplicatesAndNewRows(sheets) {
    const spreadsheetId = config.google.sheets.masterIndexSheetId;
    const driveStandardizedTab = 'Drive Import - Standardized';
    
    console.log('🔍 Checking Drive Import - Standardized tab for our session IDs...\n');
    
    // Our session IDs to look for
    const sessionIds = [
        '330f04559d336f8b',
        '67b7b4ddb94d9714', 
        '7247ecbd0e5fae62',
        '7190c776c4c0d307',
        '324b9bb1a74a3f89',
        '0f53dda2ddac18b2',
        '37b4f7c7f24f1a85'
    ];
    
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
        date: headers.indexOf('Date'),
        processingDate: headers.indexOf('Processing Date')
    };
    
    console.log(`Total rows: ${rows.length - 1}\n`);
    
    // Search for our session IDs
    console.log('Searching for our 7 session IDs:\n');
    
    const foundRows = [];
    
    for (const sessionId of sessionIds) {
        const matchingRows = [];
        
        for (let i = 1; i < rows.length; i++) {
            const recordingId = rows[i][cols.recordingId] || '';
            const standardizedName = rows[i][cols.standardizedName] || '';
            
            if (recordingId.includes(sessionId) || standardizedName.includes(sessionId)) {
                matchingRows.push({
                    rowNumber: i + 1,
                    recordingId: recordingId,
                    coach: rows[i][cols.coach] || '',
                    student: rows[i][cols.student] || '',
                    standardizedName: standardizedName,
                    date: rows[i][cols.date] || '',
                    processingDate: rows[i][cols.processingDate] || ''
                });
            }
        }
        
        if (matchingRows.length > 0) {
            console.log(`✅ Session ${sessionId}: Found ${matchingRows.length} row(s)`);
            matchingRows.forEach(row => {
                console.log(`   Row ${row.rowNumber}: Coach="${row.coach}", Student="${row.student}"`);
                console.log(`   Standardized: ${row.standardizedName}`);
                if (row.processingDate) {
                    console.log(`   Processed: ${row.processingDate}`);
                }
            });
            foundRows.push(...matchingRows);
        } else {
            console.log(`❌ Session ${sessionId}: NOT FOUND`);
        }
        console.log('');
    }
    
    console.log('─'.repeat(70));
    console.log(`\n📊 Summary:`);
    console.log(`- Total unique sessions found: ${foundRows.length}`);
    console.log(`- Sessions not found: ${7 - foundRows.length}`);
    
    // Check the last few rows to see if they were recently added
    console.log('\n📋 Last 10 rows in the sheet:');
    for (let i = Math.max(1, rows.length - 10); i < rows.length; i++) {
        const coach = rows[i][cols.coach] || '';
        const student = rows[i][cols.student] || '';
        const recordingId = rows[i][cols.recordingId] || '';
        const processingDate = rows[i][cols.processingDate] || '';
        
        console.log(`Row ${i + 1}: Coach="${coach}", Student="${student}", ID="${recordingId}"`);
        if (processingDate) {
            console.log(`         Processed: ${processingDate}`);
        }
    }
}

async function main() {
    console.log('🔧 Checking for Session IDs in Google Sheets');
    console.log('=' .repeat(70));
    
    try {
        const sheets = await initializeSheets();
        await checkForDuplicatesAndNewRows(sheets);
        
    } catch (error) {
        console.error('\n❌ Error:', error);
    }
}

console.log('🚀 Starting check...\n');

main()
    .then(() => {
        console.log('\n✅ Check completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });