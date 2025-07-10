#!/usr/bin/env node

/**
 * Direct update of sheets with correct folder IDs
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

// Direct mapping based on the data you provided
const recordingUpdates = [
    {
        sessionId: '37b4f7c7f24f1a85',
        oldFolderId: '1JwzvCGMba1cG8COzY8fiGVd_aghuBENK',
        newFolderId: '1KJ8mFzMpT-mpd9FAMUhtC_TVa93L4l8t',
        correctName: 'Coaching_B_Alan_Rayaan_Wk01_2025-01-30_M:37b4f7c7f24f1a85U:37b4f7c7f24f1a85'
    },
    {
        sessionId: '0f53dda2ddac18b2',
        oldFolderId: '1bC0LayV6JctR_IXGywzZP5tq3cT21NS5',
        newFolderId: '1o0-Ve3_jUvq0Xv9N1k3e0zMl86kcZJhr',
        correctName: 'Coaching_B_Jenny_Huda_Wk01_2023-08-08_M:0f53dda2ddac18b2U:0f53dda2ddac18b2'
    },
    {
        sessionId: '324b9bb1a74a3f89',
        oldFolderId: '1BVN2jziL3_9OREb3_ZGLiYSzvRGu12cp',
        newFolderId: '1Bhmv97nHdZIuoZoT99dr0H3AhfCTe4oh',
        correctName: 'Coaching_B_Jenny_Huda_Wk01_2023-08-15_M:324b9bb1a74a3f89U:324b9bb1a74a3f89'
    },
    {
        sessionId: '7190c776c4c0d307',
        oldFolderId: '1jgCrg-KU48f9D23CmVVJQAf7lWonsbg7',
        newFolderId: '1IaDGQ-WJcqQiAZ0DC40rmHmPch-wQlvK',
        correctName: 'Coaching_B_Jenny_Huda_Wk01_2023-08-21_M:7190c776c4c0d307U:7190c776c4c0d307'
    },
    {
        sessionId: '7247ecbd0e5fae62',
        oldFolderId: '1MDtP78vq6lTxIrfrBX0D3WP82nAKKJqn',
        newFolderId: '1mczuxWupqkYn7sWCcSmWfZ4xTseB86w9',
        correctName: 'Coaching_B_Jenny_Huda_Wk01_2023-08-25_M:7247ecbd0e5fae62U:7247ecbd0e5fae62'
    },
    {
        sessionId: '67b7b4ddb94d9714',
        oldFolderId: '1OZNcQJxvAgePFbv6Ze9QNmcr4L6wrKva',
        newFolderId: '1d43qU2fNiLFxcG1_V9zbUerJJ7AoUan7',
        correctName: 'Coaching_B_Jenny_Huda_Wk01_2023-08-30_M:67b7b4ddb94d9714U:67b7b4ddb94d9714'
    },
    {
        sessionId: '330f04559d336f8b',
        oldFolderId: '1Gu4SteiSxx5tyG_3jn7DEXbzpcfGoZDX',
        newFolderId: '1Iv3KwElUoXcZKfN5mPI7qtLtIm02FRBp',
        correctName: 'Coaching_B_Jenny_Huda_Wk01_2023-09-02_M:330f04559d336f8b:330f04559d336f8b'
    }
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

async function updateSheetDirectly(sheets) {
    const spreadsheetId = config.google.sheets.masterIndexSheetId;
    const tabName = 'Drive Import - Standardized';
    
    console.log('📊 Updating Google Sheets with correct folder IDs...\n');
    
    const range = `'${tabName}'!A:BZ`;
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range
    });
    
    const rows = response.data.values || [];
    const headers = rows[0];
    
    // Find all relevant columns
    const cols = {
        uuid: headers.indexOf('uuid'),
        recordingId: headers.indexOf('recordingId'),
        folderName: headers.indexOf('folderName'),
        googleDriveFolderId: headers.indexOf('googleDriveFolderId'),
        driveLink: headers.findIndex(h => h && h.toLowerCase().includes('drive') && h.toLowerCase().includes('link'))
    };
    
    console.log('Column indices found:');
    console.log(`  uuid: ${cols.uuid}`);
    console.log(`  recordingId: ${cols.recordingId}`);
    console.log(`  folderName: ${cols.folderName}`);
    console.log(`  googleDriveFolderId: ${cols.googleDriveFolderId}`);
    console.log(`  driveLink: ${cols.driveLink}\n`);
    
    const updates = [];
    let foundCount = 0;
    
    // Find and update each recording
    for (const update of recordingUpdates) {
        console.log(`\n🔍 Looking for session ${update.sessionId}...`);
        
        let rowFound = false;
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            
            const uuid = row[cols.uuid] || '';
            const recordingId = row[cols.recordingId] || '';
            
            // Check if this is our row
            if (uuid === update.sessionId || recordingId === update.sessionId) {
                console.log(`✅ Found at row ${i + 1}`);
                rowFound = true;
                foundCount++;
                
                // Update folder name
                if (cols.folderName >= 0) {
                    updates.push({
                        range: `'${tabName}'!${getColumnLetter(cols.folderName)}${i + 1}`,
                        values: [[update.correctName]]
                    });
                }
                
                // Update folder ID
                if (cols.googleDriveFolderId >= 0) {
                    updates.push({
                        range: `'${tabName}'!${getColumnLetter(cols.googleDriveFolderId)}${i + 1}`,
                        values: [[update.newFolderId]]
                    });
                }
                
                // Update Drive Link
                if (cols.driveLink >= 0) {
                    const newDriveLink = `https://drive.google.com/drive/folders/${update.newFolderId}`;
                    updates.push({
                        range: `'${tabName}'!${getColumnLetter(cols.driveLink)}${i + 1}`,
                        values: [[newDriveLink]]
                    });
                }
                
                break;
            }
        }
        
        if (!rowFound) {
            console.log(`❌ Not found in sheet`);
        }
    }
    
    console.log(`\n📊 Found ${foundCount} out of ${recordingUpdates.length} recordings`);
    
    // Apply updates
    if (updates.length > 0) {
        console.log(`\n📝 Applying ${updates.length} updates...`);
        
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            resource: {
                data: updates,
                valueInputOption: 'USER_ENTERED'
            }
        });
        
        console.log(`✅ Updates applied successfully!`);
    } else {
        console.log('\n⚠️ No updates to apply');
    }
    
    // Also check Drive Import - Raw tab
    console.log('\n\n📊 Checking Drive Import - Raw tab...');
    
    const rawRange = `'Drive Import - Raw'!A:Z`;
    const rawResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: rawRange
    });
    
    const rawRows = rawResponse.data.values || [];
    const rawHeaders = rawRows[0];
    
    const rawCols = {
        uuid: rawHeaders.indexOf('uuid'),
        folderName: rawHeaders.indexOf('folderName')
    };
    
    const rawUpdates = [];
    
    for (const update of recordingUpdates) {
        for (let i = 1; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || row.length === 0) continue;
            
            const uuid = row[rawCols.uuid] || '';
            
            if (uuid === update.sessionId) {
                if (rawCols.folderName >= 0) {
                    rawUpdates.push({
                        range: `'Drive Import - Raw'!${getColumnLetter(rawCols.folderName)}${i + 1}`,
                        values: [[update.correctName]]
                    });
                }
                break;
            }
        }
    }
    
    if (rawUpdates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            resource: {
                data: rawUpdates,
                valueInputOption: 'USER_ENTERED'
            }
        });
        
        console.log(`✅ Updated ${rawUpdates.length} rows in Raw tab`);
    }
}

async function main() {
    console.log('🔧 Direct Sheet Update - Fixing Folder References');
    console.log('=' .repeat(70));
    
    try {
        const sheets = await initializeSheets();
        await updateSheetDirectly(sheets);
        
        console.log('\n✅ Process complete!');
        console.log('\n📊 Summary:');
        console.log('- Updated folder IDs to point to correct student folders');
        console.log('- Updated folder names to show correct names');
        console.log('- Updated Drive links to point to correct locations');
        
    } catch (error) {
        console.error('\n❌ Error:', error);
        console.error('Stack:', error.stack);
    }
}

console.log('🚀 Starting direct sheet update...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });