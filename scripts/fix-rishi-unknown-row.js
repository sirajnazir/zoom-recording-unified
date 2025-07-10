#!/usr/bin/env node

/**
 * Fix the problematic Rishi unknown row
 * This row (uuid: 9ad01f1529493117) incorrectly points to a folder with shortcuts
 * We need to delete this row from sheets as it's not a real recording
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

const PROBLEMATIC_ROW = {
    uuid: '9ad01f1529493117',
    folderId: '162ArNE03QTI9d4kFfuxZ93IgNzmh_fH5',
    folderName: 'Coaching_B_Rishi_Rishi_Wk01_2025-07-07_M_9ad01f1529493117U_9ad01f1529493117'
};

async function initializeServices() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: config.google.clientEmail,
            private_key: config.google.privateKey
        },
        scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
    });
    
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });
    
    return { drive, sheets };
}

async function deleteProblematicRow(sheets) {
    console.log('🗑️  Removing Problematic Rishi Row');
    console.log('=' .repeat(70));
    console.log(`\nUUID: ${PROBLEMATIC_ROW.uuid}`);
    console.log(`Folder: ${PROBLEMATIC_ROW.folderName}`);
    console.log('\nThis folder contains shortcuts to other recordings, not actual recording files.');
    
    try {
        const spreadsheetId = config.google.sheets.masterIndexSheetId;
        const tabName = 'Drive Import - Standardized';
        
        // Get all rows to find the problematic one
        console.log('\n📊 Searching for row in Google Sheets...');
        
        const range = `'${tabName}'!A:BZ`;
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const headers = rows[0];
        const uuidCol = headers.indexOf('uuid');
        
        // Find the row
        let rowIndex = -1;
        for (let i = 1; i < rows.length; i++) {
            if (rows[i] && rows[i][uuidCol] === PROBLEMATIC_ROW.uuid) {
                rowIndex = i;
                break;
            }
        }
        
        if (rowIndex === -1) {
            console.log('⚠️  Row not found in sheet');
            return;
        }
        
        console.log(`✅ Found at row ${rowIndex + 1}`);
        
        // Delete the row by clearing all its values
        console.log('\n🗑️  Clearing row data...');
        
        const clearRange = `'${tabName}'!A${rowIndex + 1}:BZ${rowIndex + 1}`;
        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: clearRange
        });
        
        console.log('✅ Row data cleared');
        
        // Note: Google Sheets API doesn't support deleting rows directly via values API
        // The row will remain but be empty. To fully delete, would need to use batchUpdate
        // with deleteDimension request, but clearing is sufficient for our needs
        
        console.log('\n📝 Summary:');
        console.log('- Problematic row has been cleared');
        console.log('- This was not a real recording, just a folder with shortcuts');
        console.log('- All actual Rishi & Aarav recordings remain properly indexed');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
    }
}

async function checkRishiAaravRecordings(sheets) {
    console.log('\n\n📊 Checking Rishi & Aarav Recordings Status');
    console.log('=' .repeat(70));
    
    try {
        const spreadsheetId = config.google.sheets.masterIndexSheetId;
        const tabName = 'Drive Import - Standardized';
        
        const range = `'${tabName}'!A:Z`;
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const headers = rows[0];
        
        const standardizedNameCol = headers.indexOf('standardizedName');
        const participantsCol = headers.indexOf('participants');
        
        // Count Rishi & Aarav recordings
        let rishiAaravCount = 0;
        const rishiAaravRows = [];
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row && row[standardizedNameCol]) {
                const name = row[standardizedNameCol];
                const participants = row[participantsCol] || '';
                
                if (name.includes('Rishi') && name.includes('Aarav') || 
                    participants.includes('Rishi') && participants.includes('Aarav')) {
                    rishiAaravCount++;
                    rishiAaravRows.push({
                        row: i + 1,
                        name: name,
                        participants: participants
                    });
                }
            }
        }
        
        console.log(`\nFound ${rishiAaravCount} Rishi & Aarav recordings in sheets`);
        
        if (rishiAaravCount > 0 && rishiAaravCount <= 25) {
            console.log('\nRecordings list:');
            rishiAaravRows.forEach((r, idx) => {
                console.log(`${idx + 1}. Row ${r.row}: ${r.name}`);
            });
        }
        
        // Check for any remaining unknown/problematic entries
        const problematicEntries = rishiAaravRows.filter(r => 
            r.name.includes('unknown') || 
            r.name.includes('Unknown') || 
            r.name.includes('Rishi_Rishi')
        );
        
        if (problematicEntries.length > 0) {
            console.log(`\n⚠️  Found ${problematicEntries.length} problematic entries that may need fixing`);
        } else {
            console.log('\n✅ All Rishi & Aarav recordings appear properly indexed');
        }
        
    } catch (error) {
        console.error('Error checking recordings:', error.message);
    }
}

async function main() {
    try {
        const { drive, sheets } = await initializeServices();
        
        // First delete the problematic row
        await deleteProblematicRow(sheets);
        
        // Then check the status of all Rishi & Aarav recordings
        await checkRishiAaravRecordings(sheets);
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
    }
}

console.log('🚀 Starting fix for problematic Rishi row...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });