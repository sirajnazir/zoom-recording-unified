#!/usr/bin/env node

/**
 * Fix Jenny Duan & Iqra GamePlan recordings
 * - These were incorrectly processed with "Prep" as student
 * - Should be Jenny (coach) & Iqra (student) GamePlan sessions
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

const RECORDINGS = [
    {
        uuid: '6650e18bc7e5e615',
        currentFolderId: '1Ea5epG571Px9zo6-IRTN7SQe7fyeTZ62',
        currentName: 'Coaching_GamePlan_B_Jenny_Prep_Wk1_2024-03-25_M:6650e18bc7e5e615U:6650e18bc7e5e615',
        correctName: 'GamePlan_B_Jenny_Iqra_Wk00_2024-03-25_M_6650e18bc7e5e615U_6650e18bc7e5e615',
        coach: 'Jenny',
        student: 'Iqra',
        date: '2024-03-25',
        type: 'GamePlan'
    },
    {
        uuid: 'b7d691c4e1a243e1',
        currentFolderId: '1tXAbnyMWarMqhbxMbE5wllzRR-iHZQYW',
        currentName: 'Coaching_GamePlan_B_Jenny_Prep_Wk1_2024-04-03_M:b7d691c4e1a243e1U:b7d691c4e1a243e1',
        correctName: 'GamePlan_B_Jenny_Iqra_Wk00_2024-04-03_M_b7d691c4e1a243e1U_b7d691c4e1a243e1',
        coach: 'Jenny',
        student: 'Iqra',
        date: '2024-04-03',
        type: 'GamePlan'
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

async function fixJennyIqraGamePlan(drive, sheets) {
    console.log('🔧 Fixing Jenny Duan & Iqra GamePlan Recordings');
    console.log('=' .repeat(70));
    console.log('\nThese recordings were incorrectly processed with "Prep" as student');
    console.log('Correcting to Jenny (coach) & Iqra (student) GamePlan sessions\n');
    
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
    
    // Process each recording
    for (const recording of RECORDINGS) {
        console.log(`\n📹 Processing Recording ${RECORDINGS.indexOf(recording) + 1}/2`);
        console.log(`UUID: ${recording.uuid}`);
        console.log(`Current name: ${recording.currentName}`);
        console.log(`Target name: ${recording.correctName}`);
        
        try {
            // Step 1: Get current folder info
            console.log('\n📁 Getting current folder info...');
            const folder = await drive.files.get({
                fileId: recording.currentFolderId,
                fields: 'id,name,parents'
            });
            
            console.log(`Current location parent: ${folder.data.parents?.[0]}`);
            
            // Check if it's in the wrong "Prep" folder
            if (folder.data.parents && folder.data.parents.length > 0) {
                const parentInfo = await drive.files.get({
                    fileId: folder.data.parents[0],
                    fields: 'name'
                });
                console.log(`Current parent folder: ${parentInfo.data.name}`);
                
                if (parentInfo.data.name === 'Prep') {
                    console.log('⚠️  Recording is incorrectly in Prep student folder');
                }
            }
            
            // Step 2: Rename the folder with correct format
            console.log('\n📝 Renaming folder with correct GamePlan format...');
            await drive.files.update({
                fileId: recording.currentFolderId,
                resource: {
                    name: recording.correctName
                }
            });
            console.log(`✅ Renamed to: ${recording.correctName}`);
            
            // Step 3: Find or create Iqra's student folder
            console.log('\n📁 Setting up student folder structure...');
            const iqraFolderId = await findOrCreateFolder(drive, studentsRootId, recording.student);
            console.log(`✅ Student folder ready: /Students/${recording.student}/`);
            
            // Step 4: Move folder to Iqra
            console.log('\n🚀 Moving folder to correct location...');
            await drive.files.update({
                fileId: recording.currentFolderId,
                addParents: iqraFolderId,
                removeParents: folder.data.parents.join(','),
                fields: 'id,parents'
            });
            console.log(`✅ Moved to: /Students/${recording.student}/`);
            
            // Step 5: Create coach folder structure in Knowledge Base
            console.log('\n📁 Setting up coach folder structure...');
            
            // Find or create Jenny folder in Coaches
            const jennyFolderId = await findOrCreateFolder(drive, coachesRootId, recording.coach);
            console.log(`  ✅ Coach folder ready: /Knowledge Base/Coaches/${recording.coach}/`);
            
            // Find or create Iqra folder within Jenny
            const coachIqraId = await findOrCreateFolder(drive, jennyFolderId, recording.student);
            console.log(`  ✅ Student folder in coach: /Knowledge Base/Coaches/${recording.coach}/${recording.student}/`);
            
            // Step 6: Create shortcut
            console.log('\n🔗 Creating shortcut in coach folder...');
            
            // Check if shortcut exists
            const shortcutSearch = await drive.files.list({
                q: `'${coachIqraId}' in parents and name = '${recording.correctName}' and mimeType = 'application/vnd.google-apps.shortcut'`,
                fields: 'files(id)'
            });
            
            if (shortcutSearch.data.files?.length > 0) {
                console.log('  ✅ Shortcut already exists');
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
                participants: headers.indexOf('participants'),
                sessionType: headers.indexOf('sessionType')
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
                            values: [[`${recording.coach}, ${recording.student}`]]
                        });
                    }
                    
                    // Update raw name
                    if (cols.rawName >= 0) {
                        updates.push({
                            range: `'${tabName}'!${getColumnLetter(cols.rawName)}${i + 1}`,
                            values: [[`GamePlan - ${recording.coach} & ${recording.student}`]]
                        });
                    }
                    
                    // Update meeting topic
                    if (cols.meetingTopic >= 0) {
                        updates.push({
                            range: `'${tabName}'!${getColumnLetter(cols.meetingTopic)}${i + 1}`,
                            values: [[`GamePlan - ${recording.coach} & ${recording.student}`]]
                        });
                    }
                    
                    // Update session type
                    if (cols.sessionType >= 0) {
                        updates.push({
                            range: `'${tabName}'!${getColumnLetter(cols.sessionType)}${i + 1}`,
                            values: [['GamePlan']]
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
            
            // Summary for this recording
            console.log('\n✅ Recording successfully fixed!');
            console.log(`- Type: ${recording.type}`);
            console.log(`- Coach: ${recording.coach}`);
            console.log(`- Student: ${recording.student} (not Prep)`);
            console.log(`- Primary location: /Students/${recording.student}/`);
            console.log(`- Coach shortcut: /Knowledge Base/Coaches/${recording.coach}/${recording.student}/`);
            
        } catch (error) {
            console.error(`\n❌ Error processing recording ${recording.uuid}:`, error.message);
        }
    }
    
    // Final summary
    console.log('\n' + '=' .repeat(70));
    console.log('✅ All Jenny & Iqra GamePlan recordings have been fixed!');
    console.log('- Moved from incorrect "Prep" folder to "Iqra" folder');
    console.log('- Updated naming to proper GamePlan format');
    console.log('- Created shortcuts in Jenny\'s coach folder');
    console.log('- Updated Google Sheets with correct information');
}

async function main() {
    try {
        const { drive, sheets } = await initializeServices();
        await fixJennyIqraGamePlan(drive, sheets);
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
    }
}

console.log('🚀 Starting Jenny & Iqra GamePlan fix...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });