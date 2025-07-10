#!/usr/bin/env node

/**
 * Correct the MISC recordings that were fixed with wrong format
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

// Corrections needed
const CORRECTIONS = [
    { uuid: '337cbab6e4d1154b', correct: 'Coaching_B_unknown_Aarnav_Wk01_2024-08-15', wrong: 'Coaching_B_Aarnav_Unknown_Wk01_2025-07-07' },
    { uuid: '5a19a3eaec19ef16', correct: 'Coaching_B_unknown_Aarnav_Wk01_2024-08-27', wrong: 'Coaching_B_Aarnav_Unknown_Wk01_2025-07-07' },
    { uuid: '1054666e149f9cb4', correct: 'Coaching_B_unknown_Aarnav_Wk01_2024-09-05', wrong: 'Coaching_B_Aarnav_Unknown_Wk01_2025-07-07' },
    { uuid: '2bae0b7762b0c1a2', correct: 'Coaching_B_unknown_Aarnav_Wk01_2024-10-03', wrong: 'Coaching_B_Aarnav_Unknown_Wk01_2025-07-07' },
    { uuid: '77aa31328eb37239', correct: 'Coaching_B_unknown_Shishir_Wk01_2024-11-02', wrong: 'Coaching_B_Shishir_Unknown_Wk01_2025-07-07' }
];

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

async function correctMiscRecordings(sheets) {
    const spreadsheetId = config.google.sheets.masterIndexSheetId;
    const tabName = 'Drive Import - Standardized';
    
    console.log('📊 Correcting MISC recordings format...\n');
    
    const range = `'${tabName}'!A:BZ`;
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range
    });
    
    const rows = response.data.values || [];
    const headers = rows[0];
    
    const cols = {
        uuid: headers.indexOf('uuid'),
        standardizedName: headers.indexOf('standardizedName')
    };
    
    const updates = [];
    
    for (const correction of CORRECTIONS) {
        console.log(`🔍 Correcting ${correction.uuid}...`);
        
        // Find the row
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            
            if (row[cols.uuid] === correction.uuid) {
                const currentName = row[cols.standardizedName] || '';
                
                // Fix by replacing the pattern part
                const newName = currentName.replace(correction.wrong, correction.correct);
                
                console.log(`   Row ${i + 1}: ${correction.correct}_M:${correction.uuid}U:${correction.uuid}`);
                
                updates.push({
                    range: `'${tabName}'!${getColumnLetter(cols.standardizedName)}${i + 1}`,
                    values: [[newName]]
                });
                
                break;
            }
        }
    }
    
    if (updates.length > 0) {
        console.log(`\n📝 Applying ${updates.length} corrections...`);
        
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            resource: {
                data: updates,
                valueInputOption: 'USER_ENTERED'
            }
        });
        
        console.log('✅ Corrections applied');
    }
}

async function main() {
    console.log('🔧 Correcting MISC Recordings Format');
    console.log('=' .repeat(70));
    
    try {
        const sheets = await initializeSheets();
        await correctMiscRecordings(sheets);
        
        console.log('\n✅ All MISC recordings now show:');
        console.log('- Coach: unknown (lowercase)');
        console.log('- Student: Aarnav/Shishir');
        console.log('- Correct dates extracted from folder names');
        
    } catch (error) {
        console.error('\n❌ Error:', error);
    }
}

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });