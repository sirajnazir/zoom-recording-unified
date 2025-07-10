#!/usr/bin/env node

/**
 * Final fix to correct the coach/student names
 * This will fix the rows that have same name for both coach and student
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

// Correct mapping
const correctMapping = {
    '330f04559d336f8b': { coach: 'Jenny', student: 'Huda' },
    '67b7b4ddb94d9714': { coach: 'Jenny', student: 'Huda' },
    '7247ecbd0e5fae62': { coach: 'Jenny', student: 'Huda' },
    '7190c776c4c0d307': { coach: 'Jenny', student: 'Huda' },
    '324b9bb1a74a3f89': { coach: 'Jenny', student: 'Huda' },
    '0f53dda2ddac18b2': { coach: 'Jenny', student: 'Huda' },
    '37b4f7c7f24f1a85': { coach: 'Alan', student: 'Rayaan' }
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

async function fixCoachStudentNames(sheets) {
    const spreadsheetId = config.google.sheets.masterIndexSheetId;
    const tabName = 'Drive Import - Standardized';
    
    console.log(`🔄 Fixing coach/student names in ${tabName}...`);
    console.log('=' .repeat(70));
    
    const range = `'${tabName}'!A:BZ`;
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range
    });
    
    const rows = response.data.values || [];
    const headers = rows[0];
    
    const cols = {
        uuid: headers.indexOf('uuid'),
        standardizedName: headers.indexOf('standardizedName'),
        participants: headers.indexOf('participants')
    };
    
    const updates = [];
    let fixCount = 0;
    
    // Find our specific rows
    for (const [sessionId, mapping] of Object.entries(correctMapping)) {
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            
            const uuid = row[cols.uuid] || '';
            const standardizedName = row[cols.standardizedName] || '';
            
            if (uuid === sessionId || standardizedName.includes(sessionId)) {
                console.log(`\n✅ Found session ${sessionId} at row ${i + 1}`);
                console.log(`   Current: ${standardizedName}`);
                
                // Check if it has duplicate names (Jenny_Jenny or Alan_Alan)
                if (standardizedName.includes(`${mapping.coach}_${mapping.coach}`)) {
                    // Fix by replacing the second occurrence with the student name
                    const newStandardizedName = standardizedName.replace(
                        `${mapping.coach}_${mapping.coach}`,
                        `${mapping.coach}_${mapping.student}`
                    );
                    
                    console.log(`   Fixed: ${newStandardizedName}`);
                    
                    updates.push({
                        range: `'${tabName}'!${getColumnLetter(cols.standardizedName)}${i + 1}`,
                        values: [[newStandardizedName]]
                    });
                    
                    // Update participants column if exists
                    if (cols.participants >= 0) {
                        updates.push({
                            range: `'${tabName}'!${getColumnLetter(cols.participants)}${i + 1}`,
                            values: [[`${mapping.coach}, ${mapping.student}`]]
                        });
                    }
                    
                    fixCount++;
                } else {
                    console.log(`   Already correct!`);
                }
                
                break;
            }
        }
    }
    
    // Execute updates
    if (updates.length > 0) {
        console.log(`\n📝 Applying ${updates.length} updates...`);
        
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            resource: {
                data: updates,
                valueInputOption: 'USER_ENTERED'
            }
        });
        
        console.log(`✅ Fixed ${fixCount} recordings`);
    } else {
        console.log(`\n✅ All recordings already have correct coach/student names!`);
    }
    
    // Now fix the remaining 13 unknown recordings if we have information about them
    console.log('\n🔍 Checking for remaining unknown recordings...');
    
    const unknownRows = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        
        const standardizedName = row[cols.standardizedName] || '';
        if (standardizedName.toLowerCase().includes('unknown')) {
            unknownRows.push({
                row: i + 1,
                uuid: row[cols.uuid] || '',
                name: standardizedName
            });
        }
    }
    
    console.log(`\nFound ${unknownRows.length} remaining unknown recordings`);
    if (unknownRows.length > 0) {
        console.log('\nThese require manual investigation or additional data:');
        unknownRows.slice(0, 5).forEach(row => {
            console.log(`   Row ${row.row}: ${row.name}`);
        });
        if (unknownRows.length > 5) {
            console.log(`   ... and ${unknownRows.length - 5} more`);
        }
    }
}

async function main() {
    console.log('🔧 Final Fix for Coach/Student Names');
    console.log('=' .repeat(70));
    
    try {
        const sheets = await initializeSheets();
        await fixCoachStudentNames(sheets);
        
        console.log('\n✅ Process complete!');
        console.log('\n📊 The 7 recordings should now show:');
        console.log('   - Jenny & Huda (6 recordings)');
        console.log('   - Alan & Rayaan (1 recording)');
        
    } catch (error) {
        console.error('\n❌ Error:', error);
        console.error('Stack:', error.stack);
    }
}

console.log('🚀 Starting final fix...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });