#!/usr/bin/env node

/**
 * Fix Jenny & Anoushka recording
 * - Rename folder with correct name and date
 * - Move to /Students/Anoushka/
 * - Create shortcut in /Coaches/Coach Jenny/Anoushka/
 * - Update sheets
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

const RECORDING = {
    uuid: '60c28a4a43039b09',
    currentFolderId: '1JTxIdMOAzo76CRdp-oDhBPJxr2mYUK5M',
    currentName: 'Coaching_B_unknown_Unknown_Wk01_2025-07-07_M:60c28a4a43039b09U:60c28a4a43039b09',
    correctName: 'Coaching_B_Jenny_Anoushka_Wk01_2023-08-19_M_60c28a4a43039b09U_60c28a4a43039b09',
    coach: 'Jenny',
    student: 'Anoushka',
    date: '2023-08-19'
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

async function findOrCreateFolder(drive, parentId, folderName) {
    const response = await drive.files.list({
        q: `'${parentId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id,name)'
    });
    
    if (response.data.files && response.data.files.length > 0) {
        return response.data.files[0].id;
    }
    
    const createResponse = await drive.files.create({
        resource: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId]
        },
        fields: 'id'
    });
    
    console.log(`  📁 Created folder: ${folderName}`);
    return createResponse.data.id;
}

async function fixJennyAnoushkaRecording(drive, sheets) {
    console.log('🔧 Fixing Jenny & Anoushka Recording');
    console.log('=' .repeat(70));
    console.log(`\nUUID: ${RECORDING.uuid}`);
    console.log(`Current name: ${RECORDING.currentName}`);
    console.log(`Target name: ${RECORDING.correctName}`);
    console.log(`Coach: ${RECORDING.coach}, Student: ${RECORDING.student}`);
    
    try {
        // Step 1: Get current folder info
        console.log('\n📁 Getting current folder info...');
        const folder = await drive.files.get({
            fileId: RECORDING.currentFolderId,
            fields: 'id,name,parents'
        });
        
        console.log(`Current location parent: ${folder.data.parents?.[0]}`);
        
        // Step 2: Rename the folder
        console.log('\n📝 Renaming folder...');
        await drive.files.update({
            fileId: RECORDING.currentFolderId,
            resource: {
                name: RECORDING.correctName
            }
        });
        console.log(`✅ Renamed to: ${RECORDING.correctName}`);
        
        // Step 3: Find or create Anoushka's student folder
        console.log('\n📁 Setting up student folder structure...');
        const studentsRootId = config.google.drive.organizedRecordingsFolder || '12LgtSd9CpOllNBBycCfxPVFB6Sk9bTIp';
        const anoushkaFolderId = await findOrCreateFolder(drive, studentsRootId, RECORDING.student);
        console.log(`✅ Student folder ready: /Students/${RECORDING.student}/`);
        
        // Step 4: Move folder to Anoushka
        console.log('\n🚀 Moving folder to student directory...');
        await drive.files.update({
            fileId: RECORDING.currentFolderId,
            addParents: anoushkaFolderId,
            removeParents: folder.data.parents.join(','),
            fields: 'id,parents'
        });
        console.log(`✅ Moved to: /Students/${RECORDING.student}/`);
        
        // Step 5: Create coach folder structure
        console.log('\n📁 Setting up coach folder structure...');
        
        // Find Coaches root
        const coachesSearch = await drive.files.list({
            q: `name = 'Coaches' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id)',
            pageSize: 1
        });
        
        let coachesRootId = coachesSearch.data.files?.[0]?.id;
        if (!coachesRootId) {
            const createResponse = await drive.files.create({
                resource: {
                    name: 'Coaches',
                    mimeType: 'application/vnd.google-apps.folder'
                },
                fields: 'id'
            });
            coachesRootId = createResponse.data.id;
            console.log('  📁 Created Coaches root folder');
        }
        
        // Create/find Coach Jenny folder
        const coachJennyId = await findOrCreateFolder(drive, coachesRootId, `Coach ${RECORDING.coach}`);
        console.log(`  ✅ Coach folder ready: /Coaches/Coach ${RECORDING.coach}/`);
        
        // Create/find Anoushka folder within Coach Jenny
        const coachAnoushkaId = await findOrCreateFolder(drive, coachJennyId, RECORDING.student);
        console.log(`  ✅ Student folder in coach: /Coaches/Coach ${RECORDING.coach}/${RECORDING.student}/`);
        
        // Step 6: Create shortcut
        console.log('\n🔗 Creating shortcut in coach folder...');
        
        // Check if shortcut exists
        const shortcutSearch = await drive.files.list({
            q: `'${coachAnoushkaId}' in parents and name = '${RECORDING.correctName}' and mimeType = 'application/vnd.google-apps.shortcut'`,
            fields: 'files(id)'
        });
        
        if (shortcutSearch.data.files?.length > 0) {
            console.log('  ✅ Shortcut already exists');
        } else {
            await drive.files.create({
                resource: {
                    name: RECORDING.correctName,
                    mimeType: 'application/vnd.google-apps.shortcut',
                    parents: [coachAnoushkaId],
                    shortcutDetails: {
                        targetId: RECORDING.currentFolderId
                    }
                },
                fields: 'id'
            });
            console.log('  ✅ Shortcut created successfully');
        }
        
        // Step 7: Update Google Sheets
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
            folderName: headers.indexOf('folderName'),
            rawName: headers.indexOf('rawName'),
            meetingTopic: headers.indexOf('meetingTopic')
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
            if (row && row[cols.uuid] === RECORDING.uuid) {
                console.log(`  Found at row ${i + 1}`);
                
                const updates = [];
                
                // Update folder name
                if (cols.folderName >= 0) {
                    updates.push({
                        range: `'${tabName}'!${getColumnLetter(cols.folderName)}${i + 1}`,
                        values: [[RECORDING.correctName]]
                    });
                }
                
                // Update raw name if it shows unknown
                if (cols.rawName >= 0 && row[cols.rawName]?.includes('Unknown')) {
                    updates.push({
                        range: `'${tabName}'!${getColumnLetter(cols.rawName)}${i + 1}`,
                        values: [[`${RECORDING.coach} & ${RECORDING.student}`]]
                    });
                }
                
                // Update meeting topic if it shows unknown
                if (cols.meetingTopic >= 0 && row[cols.meetingTopic]?.includes('Unknown')) {
                    updates.push({
                        range: `'${tabName}'!${getColumnLetter(cols.meetingTopic)}${i + 1}`,
                        values: [[`${RECORDING.coach} & ${RECORDING.student} Session`]]
                    });
                }
                
                if (updates.length > 0) {
                    await sheets.spreadsheets.values.batchUpdate({
                        spreadsheetId,
                        resource: {
                            data: updates,
                            valueInputOption: 'USER_ENTERED'
                        }
                    });
                    console.log(`  ✅ Updated ${updates.length} fields in sheet`);
                }
                
                break;
            }
        }
        
        // Final summary
        console.log('\n✅ Recording successfully fixed!');
        console.log('\n📊 Summary:');
        console.log(`- Renamed to: ${RECORDING.correctName}`);
        console.log(`- Primary location: /Students/${RECORDING.student}/`);
        console.log(`- Coach shortcut: /Coaches/Coach ${RECORDING.coach}/${RECORDING.student}/`);
        console.log(`- Google Sheets: Updated`);
        
        // Get and display links
        console.log('\n🔗 Access Links:');
        console.log(`Primary folder: https://drive.google.com/drive/folders/${RECORDING.currentFolderId}`);
        
        // Get coach folder link
        const coachFolderLink = `https://drive.google.com/drive/folders/${coachAnoushkaId}`;
        console.log(`Coach folder: ${coachFolderLink}`);
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Details:', error);
    }
}

async function main() {
    try {
        const { drive, sheets } = await initializeServices();
        await fixJennyAnoushkaRecording(drive, sheets);
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
    }
}

console.log('🚀 Starting Jenny & Anoushka recording fix...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });