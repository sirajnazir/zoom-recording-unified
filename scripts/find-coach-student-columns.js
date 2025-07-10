#!/usr/bin/env node

/**
 * Find where coach/student data is stored in the sheets
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

async function findCoachStudentData(sheets) {
    const spreadsheetId = config.google.sheets.masterIndexSheetId;
    
    // Check all tabs
    const tabs = [
        'Raw Master Index',
        'Standardized Master Index', 
        'Drive Import - Raw',
        'Drive Import - Standardized'
    ];
    
    for (const tabName of tabs) {
        console.log(`\n📊 Checking ${tabName}`);
        console.log('=' .repeat(70));
        
        try {
            const range = `'${tabName}'!A1:BZ10`; // First 10 rows with more columns
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range
            });
            
            const rows = response.data.values || [];
            
            if (rows.length === 0) {
                console.log('Tab is empty!');
                continue;
            }
            
            const headers = rows[0];
            console.log(`\nFound ${headers.length} columns:`);
            
            // Look for relevant columns
            const relevantColumns = [];
            headers.forEach((header, idx) => {
                if (header.toLowerCase().includes('coach') ||
                    header.toLowerCase().includes('student') ||
                    header.toLowerCase().includes('participant') ||
                    header.toLowerCase().includes('name') ||
                    header.toLowerCase().includes('unknown') ||
                    header === 'uuid' ||
                    header === 'standardizedName' ||
                    header === 'rawName' ||
                    header === 'meetingTopic') {
                    relevantColumns.push({ index: idx, name: header });
                }
            });
            
            console.log('\nRelevant columns:');
            relevantColumns.forEach(col => {
                console.log(`  Column ${col.index}: ${col.name}`);
            });
            
            // Show sample data
            console.log('\nSample data (first 5 rows):');
            for (let i = 1; i <= Math.min(5, rows.length - 1); i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue;
                
                console.log(`\nRow ${i}:`);
                relevantColumns.forEach(col => {
                    if (col.index < row.length && row[col.index]) {
                        const value = row[col.index];
                        // Check if contains unknown
                        if (value.toString().toLowerCase().includes('unknown')) {
                            console.log(`  ${col.name}: "${value}" ❌ [CONTAINS UNKNOWN]`);
                        } else {
                            console.log(`  ${col.name}: "${value}"`);
                        }
                    }
                });
            }
            
            // Search for unknown in standardizedName column
            if (tabName.includes('Standardized')) {
                const standardizedNameCol = headers.indexOf('standardizedName');
                if (standardizedNameCol >= 0) {
                    console.log('\n🔍 Searching for "unknown" in standardizedName column...');
                    
                    const fullRange = `'${tabName}'!A:BZ`;
                    const fullResponse = await sheets.spreadsheets.values.get({
                        spreadsheetId,
                        range: fullRange
                    });
                    
                    const allRows = fullResponse.data.values || [];
                    let unknownCount = 0;
                    const unknownRows = [];
                    
                    for (let i = 1; i < allRows.length; i++) {
                        const row = allRows[i];
                        if (row && row[standardizedNameCol]) {
                            const name = row[standardizedNameCol].toString();
                            if (name.toLowerCase().includes('unknown')) {
                                unknownCount++;
                                if (unknownRows.length < 5) {
                                    unknownRows.push({
                                        rowNumber: i + 1,
                                        standardizedName: name,
                                        uuid: row[0] || ''
                                    });
                                }
                            }
                        }
                    }
                    
                    if (unknownCount > 0) {
                        console.log(`\n❌ Found ${unknownCount} rows with "unknown" in standardizedName:`);
                        unknownRows.forEach(row => {
                            console.log(`   Row ${row.rowNumber}: ${row.standardizedName}`);
                            if (row.uuid) console.log(`      UUID: ${row.uuid}`);
                        });
                    } else {
                        console.log('✅ No "unknown" found in standardizedName');
                    }
                }
            }
            
        } catch (error) {
            console.log(`Error reading tab: ${error.message}`);
        }
    }
}

async function main() {
    console.log('🔧 Finding Coach/Student Data Location');
    console.log('=' .repeat(70));
    
    try {
        const sheets = await initializeSheets();
        await findCoachStudentData(sheets);
        
        console.log('\n✅ Search complete!');
        
    } catch (error) {
        console.error('\n❌ Error:', error);
    }
}

console.log('🚀 Starting search...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });