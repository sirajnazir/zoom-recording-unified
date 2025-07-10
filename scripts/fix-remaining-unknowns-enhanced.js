#!/usr/bin/env node

/**
 * Enhanced fix for the final unknown recordings
 * Handles edge cases like Mary/Iqra and MISC formats
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

// Specific mappings for the remaining unknowns based on patterns
const SPECIFIC_FIXES = {
    // Iqra recordings with Mary
    '8d26164b570bf116': { coach: 'Mary', student: 'Iqra', pattern: "Iqra's Bluebook Practice" },
    'd14901d0a3d28539': { coach: 'Mary', student: 'Iqra', pattern: "Iqra Practice Test" },
    
    // MISC recordings - need to determine coaches
    '337cbab6e4d1154b': { coach: 'Unknown', student: 'Aarnav', pattern: "MISC_AarnavAgrawal" },
    '5a19a3eaec19ef16': { coach: 'Unknown', student: 'Aarnav', pattern: "MISC_AarnavAgrawal" },
    '1054666e149f9cb4': { coach: 'Unknown', student: 'Aarnav', pattern: "MISC_AarnavAgrawal" },
    '2bae0b7762b0c1a2': { coach: 'Unknown', student: 'Aarnav', pattern: "MISC_AarnavAgrawal" },
    '77aa31328eb37239': { coach: 'Unknown', student: 'Shishir', pattern: "MISC_Shishir" }
};

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

/**
 * Extract date from folder name
 */
function extractDate(folderName) {
    // Try to extract date from patterns like:
    // "June 17, 24" -> 2024-06-17
    // "June 5, 24" -> 2024-06-05
    // "2024-08-15" -> 2024-08-15
    
    // First try standard date formats
    const standardMatch = folderName.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (standardMatch) {
        return `${standardMatch[1]}-${standardMatch[2]}-${standardMatch[3]}`;
    }
    
    // Try "Month Day, YY" format
    const monthDayMatch = folderName.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{2})(?:\D|$)/);
    if (monthDayMatch) {
        const monthNames = {
            'january': '01', 'february': '02', 'march': '03', 'april': '04',
            'may': '05', 'june': '06', 'july': '07', 'august': '08',
            'september': '09', 'october': '10', 'november': '11', 'december': '12'
        };
        const month = monthNames[monthDayMatch[1].toLowerCase()];
        if (month) {
            const year = '20' + monthDayMatch[3]; // Assuming 20XX
            const day = monthDayMatch[2].padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
    }
    
    return '2025-07-07'; // Default
}

async function fixFinalUnknowns(sheets) {
    const spreadsheetId = config.google.sheets.masterIndexSheetId;
    const tabName = 'Drive Import - Standardized';
    
    console.log('📊 Fixing final unknown recordings with specific mappings...\n');
    
    const range = `'${tabName}'!A:BZ`;
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range
    });
    
    const rows = response.data.values || [];
    const headers = rows[0];
    
    // Find column indices
    const cols = {
        uuid: headers.indexOf('uuid'),
        standardizedName: headers.indexOf('standardizedName'),
        folderName: headers.indexOf('folderName'),
        participants: headers.indexOf('participants')
    };
    
    const updates = [];
    let fixCount = 0;
    
    // Process each specific fix
    for (const [uuid, fix] of Object.entries(SPECIFIC_FIXES)) {
        console.log(`\n🔍 Looking for UUID ${uuid} (${fix.pattern})...`);
        
        // Find the row
        let rowIndex = -1;
        let currentName = '';
        let folderName = '';
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            
            if (row[cols.uuid] === uuid) {
                rowIndex = i;
                currentName = row[cols.standardizedName] || '';
                folderName = row[cols.folderName] || '';
                break;
            }
        }
        
        if (rowIndex === -1) {
            console.log('   ❌ Not found in sheet');
            continue;
        }
        
        console.log(`   ✅ Found at row ${rowIndex + 1}`);
        console.log(`   Current: ${currentName}`);
        
        // Skip if already fixed
        if (!currentName.toLowerCase().includes('unknown')) {
            console.log('   ℹ️ Already fixed, skipping');
            continue;
        }
        
        // Extract date from folder name
        const date = extractDate(folderName);
        
        // Create new standardized name
        const newStandardizedName = currentName
            .replace(/unknown/i, fix.coach)
            .replace(/Unknown/i, fix.student)
            .replace(/2025-07-07/g, date);
        
        console.log(`   📝 New name: ${newStandardizedName}`);
        
        updates.push({
            range: `'${tabName}'!${getColumnLetter(cols.standardizedName)}${rowIndex + 1}`,
            values: [[newStandardizedName]]
        });
        
        // Update participants if both coach and student are known
        if (fix.coach !== 'Unknown' && fix.student !== 'Unknown' && cols.participants >= 0) {
            updates.push({
                range: `'${tabName}'!${getColumnLetter(cols.participants)}${rowIndex + 1}`,
                values: [[`${fix.coach}, ${fix.student}`]]
            });
        }
        
        fixCount++;
    }
    
    // Apply updates
    if (updates.length > 0) {
        console.log(`\n\n📝 Applying ${updates.length} updates...`);
        
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            resource: {
                data: updates,
                valueInputOption: 'USER_ENTERED'
            }
        });
        
        console.log(`✅ Successfully updated ${fixCount} recordings`);
    }
    
    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 FINAL SUMMARY');
    console.log('='.repeat(70));
    console.log(`Fixed in this round: ${fixCount}`);
    console.log('\nSpecific fixes applied:');
    console.log('- Mary & Iqra: 2 recordings');
    console.log('- Aarnav recordings: 4 (coach still unknown)');
    console.log('- Shishir recording: 1 (coach still unknown)');
    console.log('\nNote: For MISC recordings without clear coach info, coach remains "Unknown"');
}

async function main() {
    console.log('🔧 Enhanced Fix for Final Unknown Recordings');
    console.log('=' .repeat(70));
    
    try {
        const sheets = await initializeSheets();
        await fixFinalUnknowns(sheets);
        
        console.log('\n✅ Process complete!');
        
    } catch (error) {
        console.error('\n❌ Error:', error);
        console.error('Stack:', error.stack);
    }
}

console.log('🚀 Starting enhanced fix process...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });