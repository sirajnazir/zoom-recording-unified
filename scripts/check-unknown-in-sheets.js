#!/usr/bin/env node

/**
 * Check for unknown recordings in Google Sheets
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

async function checkUnknownRecordings() {
    try {
        const sheets = await initializeSheets();
        const spreadsheetId = config.google.sheets.masterIndexSheetId;
        
        // Check Drive Import - Standardized tab
        const driveStandardizedTab = 'Drive Import - Standardized';
        const range = `'${driveStandardizedTab}'!A:BZ`;
        
        console.log('🔍 Checking for unknown recordings in Google Sheets...\n');
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        if (rows.length === 0) {
            console.log('No data found in sheet');
            return;
        }
        
        const headers = rows[0];
        const coachCol = headers.indexOf('Coach');
        const studentCol = headers.indexOf('Student');
        const standardizedNameCol = headers.indexOf('Standardized Name');
        const recordingIdCol = headers.indexOf('Recording ID');
        const folderLinkCol = headers.indexOf('Drive Link');
        
        console.log(`Found ${rows.length - 1} data rows\n`);
        
        const unknownRecordings = [];
        
        // Find rows with unknown coach or student
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const coach = row[coachCol] || '';
            const student = row[studentCol] || '';
            const standardizedName = row[standardizedNameCol] || '';
            const recordingId = row[recordingIdCol] || '';
            const folderLink = row[folderLinkCol] || '';
            
            if (coach.toLowerCase() === 'unknown' || 
                student.toLowerCase() === 'unknown' ||
                standardizedName.includes('unknown') ||
                standardizedName.includes('Unknown')) {
                
                unknownRecordings.push({
                    rowNumber: i + 1,
                    recordingId,
                    coach,
                    student,
                    standardizedName,
                    folderLink
                });
            }
        }
        
        if (unknownRecordings.length === 0) {
            console.log('✅ No unknown recordings found in sheets!');
            console.log('All recordings have proper coach and student names.');
            return;
        }
        
        console.log(`❌ Found ${unknownRecordings.length} unknown recordings:\n`);
        
        unknownRecordings.forEach((rec, index) => {
            console.log(`${index + 1}. Row ${rec.rowNumber}:`);
            console.log(`   Recording ID: ${rec.recordingId}`);
            console.log(`   Coach: ${rec.coach}`);
            console.log(`   Student: ${rec.student}`);
            console.log(`   Standardized Name: ${rec.standardizedName}`);
            if (rec.folderLink) {
                console.log(`   Folder: ${rec.folderLink}`);
            }
            console.log('');
        });
        
        // Save to file for processing
        const fs = require('fs').promises;
        await fs.writeFile(
            'unknown-recordings-in-sheets.json',
            JSON.stringify(unknownRecordings, null, 2)
        );
        console.log('💾 List saved to: unknown-recordings-in-sheets.json');
        
    } catch (error) {
        console.error('Error:', error);
    }
}

console.log('🚀 Starting Google Sheets check...\n');

checkUnknownRecordings()
    .then(() => {
        console.log('\n✅ Check completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });