#!/usr/bin/env node

/**
 * Check the Drive Import tabs specifically
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

async function checkDriveImportTabs() {
    console.log('🔍 Checking Drive Import tabs in Google Sheets\n');
    
    const auth = new google.auth.JWT(
        config.google.clientEmail,
        null,
        config.google.privateKey,
        ['https://www.googleapis.com/auth/spreadsheets']
    );
    
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = config.google.sheets.masterIndexSheetId;
    
    try {
        // Check Drive Import - Raw
        console.log('📊 Checking Drive Import - Raw tab...');
        const rawResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Drive Import - Raw!A:O'
        });
        
        const rawRows = rawResponse.data.values || [];
        console.log(`   Total rows (including header): ${rawRows.length}`);
        console.log(`   Data rows: ${rawRows.length - 1}`);
        
        if (rawRows.length > 1) {
            console.log('\n   Last 3 entries:');
            const lastRows = rawRows.slice(-3);
            lastRows.forEach((row, i) => {
                console.log(`   ${rawRows.length - 3 + i}. UUID: ${row[0] || 'N/A'} | Topic: ${row[2] || 'N/A'} | Source: ${row[14] || 'N/A'}`);
            });
        }
        
        // Check Drive Import - Standardized
        console.log('\n📊 Checking Drive Import - Standardized tab...');
        const stdResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Drive Import - Standardized!A:E'
        });
        
        const stdRows = stdResponse.data.values || [];
        console.log(`   Total rows (including header): ${stdRows.length}`);
        console.log(`   Data rows: ${stdRows.length - 1}`);
        
        if (stdRows.length > 1) {
            console.log('\n   Last 5 entries:');
            const lastRows = stdRows.slice(-5);
            lastRows.forEach((row, i) => {
                const uuid = row[0] || 'N/A';
                const fingerprint = row[1] || 'N/A';
                const date = row[2] || 'N/A';
                const rawName = row[3] || 'N/A';
                const standardizedName = row[4] || 'N/A';  // Column E is index 4
                const hasB = standardizedName.includes('_B_');
                console.log(`   ${stdRows.length - 5 + i}. UUID: ${uuid} | StandardizedName: ${standardizedName} | RawName: ${rawName} ${hasB ? '✅ Has B' : '❌ No B'}`);
            });
            
            // Count entries with B indicator
            const entriesWithB = stdRows.slice(1).filter(row => {
                const name = row[4] || '';  // Column E is the standardized name
                return name.includes('_B_');
            });
            
            console.log(`\n   Total entries with _B_ indicator: ${entriesWithB.length}`);
        }
        
    } catch (error) {
        console.error('❌ Error checking tabs:', error.message);
    }
}

// Run the check
checkDriveImportTabs().catch(console.error);