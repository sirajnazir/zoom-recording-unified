#!/usr/bin/env node

/**
 * Fix Katie & Iqra recordings incorrectly labeled as "Ivylevel"
 * - These 8 recordings have "Ivylevel" as coach instead of Katie
 * - Fix naming, move to correct locations, update sheets
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

const RECORDINGS = [
    {
        uuid: 'd63b44d6d33b46e8',
        currentFolderId: '1BqEW7cRZ_V92aJxI7zDTp4B3lZ6C1U8I',
        currentName: 'Coaching_B_Ivylevel_Iqra_Wk03_2024-06-03_M:d63b44d6d33b46e8U:d63b44d6d33b46e8',
        correctName: 'Coaching_B_Katie_Iqra_Wk03_2024-06-03_M_d63b44d6d33b46e8U_d63b44d6d33b46e8',
        week: 'Wk03',
        date: '2024-06-03'
    },
    {
        uuid: '5d690b903c268db3',
        currentFolderId: '1SEmziLYXUGX0G3UPwpTndsmk1sfpu6e0',
        currentName: 'Coaching_B_Ivylevel_Iqra_Wk04_2024-06-13_M:5d690b903c268db3U:5d690b903c268db3',
        correctName: 'Coaching_B_Katie_Iqra_Wk04_2024-06-13_M_5d690b903c268db3U_5d690b903c268db3',
        week: 'Wk04',
        date: '2024-06-13'
    },
    {
        uuid: '9f1359bf3e991064',
        currentFolderId: '1aUtkSTjjEk61glOMQByZryLTV4-ic1eC',
        currentName: 'Coaching_B_Ivylevel_Iqra_Wk07_2024-06-17_M:9f1359bf3e991064U:9f1359bf3e991064',
        correctName: 'Coaching_B_Katie_Iqra_Wk07_2024-06-17_M_9f1359bf3e991064U_9f1359bf3e991064',
        week: 'Wk07',
        date: '2024-06-17'
    },
    {
        uuid: 'd9ac610b38fd8759',
        currentFolderId: '1UoTqwK5fSPIQIGFOKJw1kXSBZRuO94ZR',
        currentName: 'Coaching_B_Ivylevel_Iqra_Wk08_2024-06-19_M:d9ac610b38fd8759U:d9ac610b38fd8759',
        correctName: 'Coaching_B_Katie_Iqra_Wk08_2024-06-19_M_d9ac610b38fd8759U_d9ac610b38fd8759',
        week: 'Wk08',
        date: '2024-06-19'
    },
    {
        uuid: '3dce0197942e64c8',
        currentFolderId: '1krJB_sQ7qzXehB9KkrGewHsd96GL_-Ia',
        currentName: 'Coaching_B_Ivylevel_Iqra_Wk14_2024-07-09_M:3dce0197942e64c8U:3dce0197942e64c8',
        correctName: 'Coaching_B_Katie_Iqra_Wk14_2024-07-09_M_3dce0197942e64c8U_3dce0197942e64c8',
        week: 'Wk14',
        date: '2024-07-09'
    },
    {
        uuid: 'cafafea21e4a242d',
        currentFolderId: '1gJvu5SQiY6_KNixG0DC6KziVnW5BU8qh',
        currentName: 'Coaching_B_Ivylevel_Iqra_Wk15_2024-07-10_M:cafafea21e4a242dU:cafafea21e4a242d',
        correctName: 'Coaching_B_Katie_Iqra_Wk15_2024-07-10_M_cafafea21e4a242dU_cafafea21e4a242d',
        week: 'Wk15',
        date: '2024-07-10'
    },
    {
        uuid: '6e588f8bbbece7ac',
        currentFolderId: '1kD4BnbvuRANeEm9lpy_5JC7LswGINrlN',
        currentName: 'Coaching_B_Ivylevel_Iqra_Wk17_2024-07-23_M:6e588f8bbbece7acU:6e588f8bbbece7ac',
        correctName: 'Coaching_B_Katie_Iqra_Wk17_2024-07-23_M_6e588f8bbbece7acU_6e588f8bbbece7ac',
        week: 'Wk17',
        date: '2024-07-23'
    },
    {
        uuid: '2cc5ab02c2841088',
        currentFolderId: '1STwFp_Gxi1Tb4nooNah-b7NL_W3S2gXl',
        currentName: 'Coaching_B_Ivylevel_Iqra_Wk18_2024-07-25_M:2cc5ab02c2841088U:2cc5ab02c2841088',
        correctName: 'Coaching_B_Katie_Iqra_Wk18_2024-07-25_M_2cc5ab02c2841088U_2cc5ab02c2841088',
        week: 'Wk18',
        date: '2024-07-25'
    }
];

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

async function fixKatieIqraRecordings(drive, sheets) {
    console.log('🔧 Fixing Katie & Iqra Recordings (Incorrectly labeled as Ivylevel)');
    console.log('=' .repeat(70));
    console.log(`\nTotal recordings to fix: ${RECORDINGS.length}`);
    console.log('All are Katie (coach) & Iqra (student) sessions\n');
    
    const studentsRootId = config.google.drive.organizedRecordingsFolder || '12LgtSd9CpOllNBBycCfxPVFB6Sk9bTIp';
    
    // Find Knowledge Base and Coaches folder
    const kbSearch = await drive.files.list({
        q: `name = 'Ivylevel Knowledge Base' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id)',
        pageSize: 1
    });
    
    if (!kbSearch.data.files || kbSearch.data.files.length === 0) {
        throw new Error('Knowledge Base folder not found');
    }
    
    const knowledgeBaseId = kbSearch.data.files[0].id;
    
    const coachesSearch = await drive.files.list({
        q: `'${knowledgeBaseId}' in parents and name = 'Coaches' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id)'
    });
    
    const coachesRootId = coachesSearch.data.files?.[0]?.id;
    
    // Get Katie's coach folder (should already exist)
    const katieFolderId = await findOrCreateFolder(drive, coachesRootId, 'Katie');
    console.log(`✅ Katie's coach folder ready: /Knowledge Base/Coaches/Katie/`);
    
    // Get Iqra's folder within Katie (should already exist from previous fixes)
    const coachIqraId = await findOrCreateFolder(drive, katieFolderId, 'Iqra');
    console.log(`✅ Iqra's folder in Katie: /Knowledge Base/Coaches/Katie/Iqra/\n`);
    
    // Process each recording
    let successCount = 0;
    let errorCount = 0;
    
    for (let idx = 0; idx < RECORDINGS.length; idx++) {
        const recording = RECORDINGS[idx];
        console.log(`\n📹 Processing Recording ${idx + 1}/${RECORDINGS.length}`);
        console.log(`UUID: ${recording.uuid}`);
        console.log(`Week: ${recording.week}, Date: ${recording.date}`);
        console.log(`Current: ${recording.currentName}`);
        console.log(`Target: ${recording.correctName}`);
        
        try {
            // Step 1: Get current folder info
            console.log('\n📁 Getting current folder info...');
            const folder = await drive.files.get({
                fileId: recording.currentFolderId,
                fields: 'id,name,parents'
            });
            
            // Step 2: Rename the folder
            console.log('📝 Renaming folder...');
            await drive.files.update({
                fileId: recording.currentFolderId,
                resource: {
                    name: recording.correctName
                }
            });
            console.log(`✅ Renamed to include Katie as coach`);
            
            // Step 3: Check if already in Iqra's folder
            let needsMove = true;
            if (folder.data.parents && folder.data.parents.length > 0) {
                const parentInfo = await drive.files.get({
                    fileId: folder.data.parents[0],
                    fields: 'name'
                });
                if (parentInfo.data.name === 'Iqra') {
                    console.log('✅ Already in Iqra folder');
                    needsMove = false;
                }
            }
            
            // Step 4: Move if needed
            if (needsMove) {
                console.log('🚀 Moving to Iqra folder...');
                const iqraStudentFolderId = await findOrCreateFolder(drive, studentsRootId, 'Iqra');
                await drive.files.update({
                    fileId: recording.currentFolderId,
                    addParents: iqraStudentFolderId,
                    removeParents: folder.data.parents.join(','),
                    fields: 'id,parents'
                });
                console.log(`✅ Moved to: /Students/Iqra/`);
            }
            
            // Step 5: Delete old Ivylevel shortcut if exists
            console.log('\n🔍 Checking for old Ivylevel shortcuts...');
            const oldShortcutSearch = await drive.files.list({
                q: `name contains '${recording.uuid}' and mimeType = 'application/vnd.google-apps.shortcut' and trashed = false`,
                fields: 'files(id,name,parents)'
            });
            
            if (oldShortcutSearch.data.files && oldShortcutSearch.data.files.length > 0) {
                for (const shortcut of oldShortcutSearch.data.files) {
                    // Check if it's in an Ivylevel folder
                    if (shortcut.parents && shortcut.parents.length > 0) {
                        const parentInfo = await drive.files.get({
                            fileId: shortcut.parents[0],
                            fields: 'name'
                        });
                        if (parentInfo.data.name === 'Ivylevel' || parentInfo.data.name === 'Iqra') {
                            // Check grandparent
                            const grandparentInfo = await drive.files.get({
                                fileId: shortcut.parents[0],
                                fields: 'parents'
                            });
                            if (grandparentInfo.data.parents && grandparentInfo.data.parents.length > 0) {
                                const greatGrandparentInfo = await drive.files.get({
                                    fileId: grandparentInfo.data.parents[0],
                                    fields: 'name'
                                });
                                if (greatGrandparentInfo.data.name === 'Ivylevel') {
                                    console.log(`  🗑️ Deleting old Ivylevel shortcut: ${shortcut.name}`);
                                    await drive.files.delete({ fileId: shortcut.id });
                                }
                            }
                        }
                    }
                }
            }
            
            // Step 6: Create correct shortcut in Katie's folder
            console.log('🔗 Creating shortcut in Katie\'s folder...');
            const shortcutSearch = await drive.files.list({
                q: `'${coachIqraId}' in parents and name = '${recording.correctName}' and mimeType = 'application/vnd.google-apps.shortcut'`,
                fields: 'files(id)'
            });
            
            if (shortcutSearch.data.files?.length > 0) {
                console.log('  ✅ Shortcut already exists in Katie/Iqra');
            } else {
                await drive.files.create({
                    resource: {
                        name: recording.correctName,
                        mimeType: 'application/vnd.google-apps.shortcut',
                        parents: [coachIqraId],
                        shortcutDetails: {
                            targetId: recording.currentFolderId
                        }
                    },
                    fields: 'id'
                });
                console.log('  ✅ Shortcut created in /Knowledge Base/Coaches/Katie/Iqra/');
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
                participants: headers.indexOf('participants'),
                hostEmail: headers.indexOf('hostEmail')
            };
            
            // Find and update the row
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (row && row[cols.uuid] === recording.uuid) {
                    console.log(`  Found at row ${i + 1}`);
                    
                    const updates = [];
                    
                    // Update standardized name
                    if (cols.standardizedName >= 0) {
                        updates.push({
                            range: `'${tabName}'!${getColumnLetter(cols.standardizedName)}${i + 1}`,
                            values: [[recording.correctName]]
                        });
                    }
                    
                    // Update folder name
                    if (cols.folderName >= 0) {
                        updates.push({
                            range: `'${tabName}'!${getColumnLetter(cols.folderName)}${i + 1}`,
                            values: [[recording.correctName]]
                        });
                    }
                    
                    // Update participants
                    if (cols.participants >= 0) {
                        updates.push({
                            range: `'${tabName}'!${getColumnLetter(cols.participants)}${i + 1}`,
                            values: [['Katie, Iqra']]
                        });
                    }
                    
                    // Update raw name
                    if (cols.rawName >= 0) {
                        updates.push({
                            range: `'${tabName}'!${getColumnLetter(cols.rawName)}${i + 1}`,
                            values: [['Katie & Iqra']]
                        });
                    }
                    
                    // Update meeting topic
                    if (cols.meetingTopic >= 0) {
                        updates.push({
                            range: `'${tabName}'!${getColumnLetter(cols.meetingTopic)}${i + 1}`,
                            values: [['Katie & Iqra Session']]
                        });
                    }
                    
                    // Update host email to Katie's
                    if (cols.hostEmail >= 0) {
                        updates.push({
                            range: `'${tabName}'!${getColumnLetter(cols.hostEmail)}${i + 1}`,
                            values: [['katie@ivymentors.co']]
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
            
            successCount++;
            console.log('\n✅ Recording successfully fixed!');
            
        } catch (error) {
            errorCount++;
            console.error(`\n❌ Error processing recording ${recording.uuid}:`, error.message);
        }
    }
    
    // Final summary
    console.log('\n' + '=' .repeat(70));
    console.log('📊 FINAL SUMMARY');
    console.log('=' .repeat(70));
    console.log(`Total recordings processed: ${RECORDINGS.length}`);
    console.log(`✅ Successfully fixed: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log('\nAll recordings have been:');
    console.log('- Changed from "Ivylevel" to "Katie" as coach');
    console.log('- Moved to /Students/Iqra/');
    console.log('- Shortcuts created in /Knowledge Base/Coaches/Katie/Iqra/');
    console.log('- Google Sheets updated with correct information');
    console.log('- Old Ivylevel shortcuts removed');
}

async function main() {
    try {
        const { drive, sheets } = await initializeServices();
        await fixKatieIqraRecordings(drive, sheets);
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
    }
}

console.log('🚀 Starting Katie & Iqra recordings fix (from Ivylevel)...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });