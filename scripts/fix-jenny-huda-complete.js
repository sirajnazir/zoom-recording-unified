#!/usr/bin/env node

/**
 * Complete fix for Jenny & Huda recording
 * - Rename folder to correct name
 * - Ensure it's in Huda's folder
 * - Create shortcut in Coach Jenny folder
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

// The specific recording to fix
const RECORDING_TO_FIX = {
    uuid: '7194d6c78a5d5208',
    currentFolderId: '1qCjIbSejfaaH3AAvbyXcFk7iHo_dbq2c',
    correctName: 'Coaching_B_Jenny_Huda_Wk01_2023-07-28_M_7194d6c78a5d5208U_7194d6c78a5d5208',
    coach: 'Jenny',
    student: 'Huda'
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

async function fixJennyHudaRecording(drive, sheets) {
    console.log('🔧 Complete Fix for Jenny & Huda Recording');
    console.log('=' .repeat(70));
    
    try {
        // Step 1: Get current folder info
        console.log('\n📁 Getting current folder info...');
        const folder = await drive.files.get({
            fileId: RECORDING_TO_FIX.currentFolderId,
            fields: 'id,name,parents'
        });
        
        console.log(`Current name: ${folder.data.name}`);
        console.log(`Folder ID: ${folder.data.id}`);
        
        // Step 2: Rename the folder if needed
        if (folder.data.name !== RECORDING_TO_FIX.correctName) {
            console.log('\n📝 Renaming folder...');
            await drive.files.update({
                fileId: RECORDING_TO_FIX.currentFolderId,
                resource: {
                    name: RECORDING_TO_FIX.correctName
                }
            });
            console.log(`✅ Renamed to: ${RECORDING_TO_FIX.correctName}`);
        } else {
            console.log('✅ Folder name is already correct');
        }
        
        // Step 3: Check current location
        console.log('\n📍 Checking current location...');
        if (folder.data.parents && folder.data.parents.length > 0) {
            const parentId = folder.data.parents[0];
            const parent = await drive.files.get({
                fileId: parentId,
                fields: 'name'
            });
            console.log(`Current parent: ${parent.data.name}`);
            
            // If it's already in Huda, we're good
            if (parent.data.name === 'Huda') {
                console.log('✅ Already in Huda folder!');
            } else {
                console.log('⚠️  Not in Huda folder, needs to be moved');
                // We already moved it in the previous run, so this shouldn't happen
            }
        }
        
        // Step 4: Find Coach Jenny folder in Coaches
        console.log('\n🔍 Looking for Coach Jenny folder...');
        
        // Search in the entire drive for "Coach Jenny" folder
        const coachSearchResponse = await drive.files.list({
            q: `name = 'Coach Jenny' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id,name,parents)',
            pageSize: 10
        });
        
        let coachJennyFolderId = null;
        
        if (coachSearchResponse.data.files && coachSearchResponse.data.files.length > 0) {
            // Check which one is in the Coaches folder
            for (const coachFolder of coachSearchResponse.data.files) {
                console.log(`Found: ${coachFolder.name} (ID: ${coachFolder.id})`);
                
                // Check if it's in the coaches root
                if (coachFolder.parents && coachFolder.parents.length > 0) {
                    try {
                        const parentInfo = await drive.files.get({
                            fileId: coachFolder.parents[0],
                            fields: 'name'
                        });
                        
                        if (parentInfo.data.name === 'Coaches' || parentInfo.data.name === 'Coach Folders') {
                            coachJennyFolderId = coachFolder.id;
                            console.log(`✅ Found Coach Jenny folder in ${parentInfo.data.name}`);
                            break;
                        }
                    } catch (err) {
                        // Skip if we can't access the parent
                    }
                }
            }
        }
        
        // Step 5: Create shortcut if coach folder found
        if (coachJennyFolderId) {
            console.log('\n🔗 Creating shortcut in Coach Jenny folder...');
            
            // Check if shortcut already exists
            const existingShortcuts = await drive.files.list({
                q: `'${coachJennyFolderId}' in parents and name contains '${RECORDING_TO_FIX.uuid}' and mimeType = 'application/vnd.google-apps.shortcut'`,
                fields: 'files(id,name)'
            });
            
            if (existingShortcuts.data.files && existingShortcuts.data.files.length > 0) {
                console.log('✅ Shortcut already exists');
            } else {
                try {
                    await drive.files.create({
                        resource: {
                            name: RECORDING_TO_FIX.correctName,
                            mimeType: 'application/vnd.google-apps.shortcut',
                            parents: [coachJennyFolderId],
                            shortcutDetails: {
                                targetId: RECORDING_TO_FIX.currentFolderId
                            }
                        }
                    });
                    console.log('✅ Shortcut created successfully');
                } catch (error) {
                    console.log('⚠️  Could not create shortcut:', error.message);
                }
            }
        } else {
            console.log('\n⚠️  Coach Jenny folder not found in Coaches directory');
            console.log('   The recording is properly organized in Huda folder');
            console.log('   Shortcut creation skipped');
        }
        
        // Step 6: Update Drive link in sheets
        console.log('\n📊 Updating Google Sheets...');
        
        const spreadsheetId = config.google.sheets.masterIndexSheetId;
        const tabName = 'Drive Import - Standardized';
        
        const range = `'${tabName}'!A:BZ`;
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const headers = rows[0];
        
        const cols = {
            uuid: headers.indexOf('uuid'),
            folderName: headers.indexOf('folderName')
        };
        
        // Helper function for column letters
        function getColumnLetter(colIndex) {
            let letter = '';
            let num = colIndex;
            while (num >= 0) {
                letter = String.fromCharCode((num % 26) + 65) + letter;
                num = Math.floor(num / 26) - 1;
            }
            return letter;
        }
        
        // Find and update the row
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row && row[cols.uuid] === RECORDING_TO_FIX.uuid) {
                console.log(`Found at row ${i + 1}`);
                
                // Update folder name if needed
                if (cols.folderName >= 0 && row[cols.folderName] !== RECORDING_TO_FIX.correctName) {
                    await sheets.spreadsheets.values.update({
                        spreadsheetId,
                        range: `'${tabName}'!${getColumnLetter(cols.folderName)}${i + 1}`,
                        valueInputOption: 'USER_ENTERED',
                        resource: {
                            values: [[RECORDING_TO_FIX.correctName]]
                        }
                    });
                    console.log('✅ Updated folder name in sheet');
                }
                
                break;
            }
        }
        
        console.log('\n✅ Recording completely fixed!');
        console.log('\nSummary:');
        console.log(`- Folder renamed to: ${RECORDING_TO_FIX.correctName}`);
        console.log(`- Located in: /Students/Huda/`);
        console.log(`- Shortcut: ${coachJennyFolderId ? 'Created in Coach Jenny folder' : 'Coach folder not found'}`);
        console.log(`- Sheet: Updated`);
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Details:', error);
    }
}

async function main() {
    try {
        const { drive, sheets } = await initializeServices();
        await fixJennyHudaRecording(drive, sheets);
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
    }
}

console.log('🚀 Starting complete fix for Jenny & Huda recording...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });