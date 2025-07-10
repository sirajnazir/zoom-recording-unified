#!/usr/bin/env node

/**
 * Check Google Sheets for B indicator entries
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

async function checkSheets() {
    console.log('🔍 Checking Google Sheets for B indicator entries\n');
    
    const auth = new google.auth.JWT(
        config.google.clientEmail,
        null,
        config.google.privateKey,
        ['https://www.googleapis.com/auth/spreadsheets']
    );
    
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = config.google.sheets.masterIndexSheetId;
    
    try {
        // Check Raw Master Index
        console.log('📊 Checking Raw Master Index tab...');
        const rawResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Raw Master Index!A:Z'
        });
        
        const rawRows = rawResponse.data.values || [];
        console.log(`   Total rows: ${rawRows.length}`);
        
        // Look for entries with google-drive or B indicator
        const driveEntries = rawRows.filter((row, index) => {
            if (index === 0) return false; // Skip header
            const rowStr = row.join(' ');
            return rowStr.includes('google-drive') || 
                   rowStr.includes('Google Drive') ||
                   rowStr.includes('_B_') ||
                   rowStr.includes('dataSource');
        });
        
        console.log(`   Google Drive entries found: ${driveEntries.length}`);
        if (driveEntries.length > 0) {
            console.log('   Sample entries:');
            driveEntries.slice(0, 3).forEach((row, i) => {
                console.log(`     ${i + 1}. ${row[3] || 'No topic'} | ${row[24] || 'No standardized name'}`);
            });
        }
        
        // Check Standardized Master Index
        console.log('\n📊 Checking Standardized Master Index tab...');
        const stdResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Standardized Master Index!A:Z'
        });
        
        const stdRows = stdResponse.data.values || [];
        console.log(`   Total rows: ${stdRows.length}`);
        
        // Look for entries with B indicator in standardized name
        const bIndicatorEntries = stdRows.filter((row, index) => {
            if (index === 0) return false; // Skip header
            const standardizedName = row[1] || ''; // Column B is standardized name
            return standardizedName.includes('_B_');
        });
        
        console.log(`   Entries with _B_ indicator: ${bIndicatorEntries.length}`);
        if (bIndicatorEntries.length > 0) {
            console.log('   Sample entries with B indicator:');
            bIndicatorEntries.slice(0, 5).forEach((row, i) => {
                console.log(`     ${i + 1}. ${row[1]}`); // Standardized name
            });
        }
        
        // Check last few rows to see recent additions
        console.log('\n📊 Last 5 entries in Standardized tab:');
        const lastEntries = stdRows.slice(-5);
        lastEntries.forEach((row, i) => {
            const standardizedName = row[1] || 'No name';
            const date = row[0] || 'No date';
            console.log(`   ${stdRows.length - 5 + i}. ${date} | ${standardizedName}`);
        });
        
    } catch (error) {
        console.error('❌ Error checking sheets:', error.message);
    }
}

// Run the check
checkSheets().catch(console.error);