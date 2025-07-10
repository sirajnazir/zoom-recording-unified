#!/usr/bin/env node

/**
 * Fix Alan & Aarnav recording
 * - Alan is the coach, Aarnav is the student
 * - Fix the incorrect Rishi_Rishi naming
 * - Move to /Students/Aarnav/
 * - Create shortcut in /Knowledge Base/Coaches/Alan/Aarnav/
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

const RECORDING = {
    uuid: '337cbab6e4d1154b',
    currentFolderId: '1SSD0ie4Oqa9_gJu46SGZZePx6u6VK7aL',
    currentName: 'Coaching_B_unknown_Aarnav_Wk01_2024-08-15_M:337cbab6e4d1154bU:337cbab6e4d1154b',
    correctName: 'Coaching_B_Alan_Aarnav_Wk01_2024-08-15_M_337cbab6e4d1154bU_337cbab6e4d1154b',
    coach: 'Alan',
    student: 'Aarnav',
    date: '2024-08-15'
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

async function fixAlanAarnavRecording(drive, sheets) {
    console.log('🔧 Fixing Alan & Aarnav Recording');
    console.log('=' .repeat(70));
    console.log(`\nUUID: ${RECORDING.uuid}`);
    console.log(`Current name: ${RECORDING.currentName}`);
    console.log(`Target name: ${RECORDING.correctName}`);
    console.log(`Coach: ${RECORDING.coach}, Student: ${RECORDING.student}`);
    console.log('\nNote: Fixing incorrect Rishi_Rishi assignment');
    
    try {
        // Step 1: Get current folder info
        console.log('\n📁 Getting current folder info...');
        const folder = await drive.files.get({
            fileId: RECORDING.currentFolderId,
            fields: 'id,name,parents'
        });
        
        console.log(`Current name: ${folder.data.name}`);
        console.log(`Current location parent: ${folder.data.parents?.[0]}`);
        
        // Check if it's in a Rishi folder
        if (folder.data.parents && folder.data.parents.length > 0) {
            const parentInfo = await drive.files.get({
                fileId: folder.data.parents[0],
                fields: 'name'
            });
            console.log(`Current parent folder: ${parentInfo.data.name}`);
        }
        
        // Step 2: Rename the folder with correct coach name
        console.log('\n📝 Renaming folder with correct coach (Alan)...');
        await drive.files.update({
            fileId: RECORDING.currentFolderId,
            resource: {
                name: RECORDING.correctName
            }
        });
        console.log(`✅ Renamed to: ${RECORDING.correctName}`);
        
        // Step 3: Find or create Aarnav's student folder
        console.log('\n📁 Setting up student folder structure...');
        const studentsRootId = config.google.drive.organizedRecordingsFolder || '12LgtSd9CpOllNBBycCfxPVFB6Sk9bTIp';
        const aarnavFolderId = await findOrCreateFolder(drive, studentsRootId, RECORDING.student);
        console.log(`✅ Student folder ready: /Students/${RECORDING.student}/`);
        
        // Step 4: Move folder to Aarnav
        console.log('\n🚀 Moving folder to correct location...');
        await drive.files.update({
            fileId: RECORDING.currentFolderId,
            addParents: aarnavFolderId,
            removeParents: folder.data.parents.join(','),
            fields: 'id,parents'
        });
        console.log(`✅ Moved to: /Students/${RECORDING.student}/`);
        
        // Step 5: Create coach folder structure in Knowledge Base
        console.log('\n📁 Setting up coach folder structure...');
        
        // Find Knowledge Base
        const kbSearch = await drive.files.list({
            q: `name = 'Ivylevel Knowledge Base' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id)',
            pageSize: 1
        });
        
        if (!kbSearch.data.files || kbSearch.data.files.length === 0) {
            throw new Error('Knowledge Base folder not found');
        }
        
        const knowledgeBaseId = kbSearch.data.files[0].id;
        
        // Find Coaches folder
        const coachesSearch = await drive.files.list({
            q: `'${knowledgeBaseId}' in parents and name = 'Coaches' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id)'
        });
        
        const coachesRootId = coachesSearch.data.files?.[0]?.id;
        
        // Create/find Alan folder
        const alanFolderId = await findOrCreateFolder(drive, coachesRootId, RECORDING.coach);
        console.log(`  ✅ Coach folder ready: /Knowledge Base/Coaches/${RECORDING.coach}/`);
        
        // Create/find Aarnav folder within Alan
        const coachAarnavId = await findOrCreateFolder(drive, alanFolderId, RECORDING.student);
        console.log(`  ✅ Student folder in coach: /Knowledge Base/Coaches/${RECORDING.coach}/${RECORDING.student}/`);
        
        // Step 6: Create shortcut
        console.log('\n🔗 Creating shortcut in coach folder...');
        
        // Check if shortcut exists
        const shortcutSearch = await drive.files.list({
            q: `'${coachAarnavId}' in parents and name = '${RECORDING.correctName}' and mimeType = 'application/vnd.google-apps.shortcut'`,
            fields: 'files(id)'
        });
        
        if (shortcutSearch.data.files?.length > 0) {
            console.log('  ✅ Shortcut already exists');
        } else {
            await drive.files.create({
                resource: {
                    name: RECORDING.correctName,
                    mimeType: 'application/vnd.google-apps.shortcut',
                    parents: [coachAarnavId],
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
            standardizedName: headers.indexOf('standardizedName'),
            folderName: headers.indexOf('folderName'),
            rawName: headers.indexOf('rawName'),
            meetingTopic: headers.indexOf('meetingTopic'),
            participants: headers.indexOf('participants')
        };
        
        // Find and update the row
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row && row[cols.uuid] === RECORDING.uuid) {
                console.log(`  Found at row ${i + 1}`);
                
                const updates = [];
                
                // Update standardized name
                if (cols.standardizedName >= 0) {
                    const newStandardizedName = RECORDING.correctName;
                    
                    updates.push({
                        range: `'${tabName}'!${getColumnLetter(cols.standardizedName)}${i + 1}`,
                        values: [[newStandardizedName]]
                    });
                }
                
                // Update folder name
                if (cols.folderName >= 0) {
                    updates.push({
                        range: `'${tabName}'!${getColumnLetter(cols.folderName)}${i + 1}`,
                        values: [[RECORDING.correctName]]
                    });
                }
                
                // Update participants
                if (cols.participants >= 0) {
                    updates.push({
                        range: `'${tabName}'!${getColumnLetter(cols.participants)}${i + 1}`,
                        values: [[`${RECORDING.coach}, ${RECORDING.student}`]]
                    });
                }
                
                // Update raw name
                if (cols.rawName >= 0) {
                    updates.push({
                        range: `'${tabName}'!${getColumnLetter(cols.rawName)}${i + 1}`,
                        values: [[`${RECORDING.coach} & ${RECORDING.student}`]]
                    });
                }
                
                // Update meeting topic
                if (cols.meetingTopic >= 0) {
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
        console.log(`- Coach set to: ${RECORDING.coach}`);
        console.log(`- Moved from incorrect Rishi folder to correct location`);
        console.log(`- Primary location: /Students/${RECORDING.student}/`);
        console.log(`- Coach shortcut: /Knowledge Base/Coaches/${RECORDING.coach}/${RECORDING.student}/`);
        console.log(`- Google Sheets: Updated`);
        
        // Get and display links
        console.log('\n🔗 Access Links:');
        console.log(`Primary folder: https://drive.google.com/drive/folders/${RECORDING.currentFolderId}`);
        console.log(`Coach folder: https://drive.google.com/drive/folders/${coachAarnavId}`);
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Details:', error);
    }
}

async function main() {
    try {
        const { drive, sheets } = await initializeServices();
        await fixAlanAarnavRecording(drive, sheets);
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
    }
}

console.log('🚀 Starting Alan & Aarnav recording fix...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });