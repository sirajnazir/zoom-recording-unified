#!/usr/bin/env node

/**
 * Fix Andrew & Advay GamePlan recording
 * - Change from Coaching to GamePlan
 * - Set correct student name (Advay)
 * - Move to proper location
 * - Create coach shortcut
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

const RECORDING = {
    uuid: '5b31180545b65a78',
    currentFolderId: '1bDNb4rHhBWJgIqdQ1loFdRZlQ56cQ-x9',
    currentName: 'Coaching_B_unknown_Unknown_Wk01_2025-07-07_M:5b31180545b65a78U:5b31180545b65a78',
    correctName: 'GamePlan_B_Andrew_Advay_Wk00_2024-10-26_M_5b31180545b65a78U_5b31180545b65a78',
    sessionType: 'GamePlan',
    coach: 'Andrew',
    student: 'Advay',
    week: 'Wk00',
    date: '2024-10-26'
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

async function fixAndrewAdvayGamePlan(drive, sheets) {
    console.log('🔧 Fixing Andrew & Advay GamePlan Recording');
    console.log('=' .repeat(70));
    console.log(`\nUUID: ${RECORDING.uuid}`);
    console.log(`Current name: ${RECORDING.currentName}`);
    console.log(`Target name: ${RECORDING.correctName}`);
    console.log(`Type: ${RECORDING.sessionType}`);
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
        console.log('\n📝 Renaming folder to GamePlan format...');
        await drive.files.update({
            fileId: RECORDING.currentFolderId,
            resource: {
                name: RECORDING.correctName
            }
        });
        console.log(`✅ Renamed to: ${RECORDING.correctName}`);
        
        // Step 3: Find or create Advay's student folder
        console.log('\n📁 Setting up student folder structure...');
        const studentsRootId = config.google.drive.organizedRecordingsFolder || '12LgtSd9CpOllNBBycCfxPVFB6Sk9bTIp';
        const advayFolderId = await findOrCreateFolder(drive, studentsRootId, RECORDING.student);
        console.log(`✅ Student folder ready: /Students/${RECORDING.student}/`);
        
        // Step 4: Move folder to Advay if not already there
        console.log('\n🚀 Checking folder location...');
        const parentInfo = await drive.files.get({
            fileId: folder.data.parents[0],
            fields: 'name'
        });
        
        if (parentInfo.data.name !== RECORDING.student) {
            console.log(`Moving from ${parentInfo.data.name} to ${RECORDING.student}...`);
            await drive.files.update({
                fileId: RECORDING.currentFolderId,
                addParents: advayFolderId,
                removeParents: folder.data.parents.join(','),
                fields: 'id,parents'
            });
            console.log(`✅ Moved to: /Students/${RECORDING.student}/`);
        } else {
            console.log(`✅ Already in correct location: /Students/${RECORDING.student}/`);
        }
        
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
            // Find in Knowledge Base
            const kbSearch = await drive.files.list({
                q: `name = 'Ivylevel Knowledge Base' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'files(id)',
                pageSize: 1
            });
            
            if (kbSearch.data.files?.[0]?.id) {
                coachesRootId = await findOrCreateFolder(drive, kbSearch.data.files[0].id, 'Coaches');
            }
        }
        
        // Create/find Coach Andrew folder
        const coachAndrewId = await findOrCreateFolder(drive, coachesRootId, `Coach ${RECORDING.coach}`);
        console.log(`  ✅ Coach folder ready: /Coaches/Coach ${RECORDING.coach}/`);
        
        // Create/find Advay folder within Coach Andrew
        const coachAdvayId = await findOrCreateFolder(drive, coachAndrewId, RECORDING.student);
        console.log(`  ✅ Student folder in coach: /Coaches/Coach ${RECORDING.coach}/${RECORDING.student}/`);
        
        // Step 6: Create shortcut
        console.log('\n🔗 Creating shortcut in coach folder...');
        
        // Check if shortcut exists
        const shortcutSearch = await drive.files.list({
            q: `'${coachAdvayId}' in parents and name = '${RECORDING.correctName}' and mimeType = 'application/vnd.google-apps.shortcut'`,
            fields: 'files(id)'
        });
        
        if (shortcutSearch.data.files?.length > 0) {
            console.log('  ✅ Shortcut already exists');
        } else {
            await drive.files.create({
                resource: {
                    name: RECORDING.correctName,
                    mimeType: 'application/vnd.google-apps.shortcut',
                    parents: [coachAdvayId],
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
            participants: headers.indexOf('participants'),
            weekNumber: headers.indexOf('weekNumber')
        };
        
        // Find and update the row
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row && row[cols.uuid] === RECORDING.uuid) {
                console.log(`  Found at row ${i + 1}`);
                
                const updates = [];
                
                // Update standardized name
                if (cols.standardizedName >= 0) {
                    const newStandardizedName = row[cols.standardizedName]
                        .replace('Coaching_B', 'GamePlan_B')
                        .replace('Unknown', RECORDING.student)
                        .replace('Wk01', RECORDING.week)
                        .replace('2025-07-07', RECORDING.date)
                        .replace(/M:/g, 'M_')
                        .replace(/U:/g, 'U_');
                    
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
                        values: [[`GamePlan - ${RECORDING.coach} & ${RECORDING.student}`]]
                    });
                }
                
                // Update meeting topic
                if (cols.meetingTopic >= 0) {
                    updates.push({
                        range: `'${tabName}'!${getColumnLetter(cols.meetingTopic)}${i + 1}`,
                        values: [[`GamePlan Session - ${RECORDING.coach} & ${RECORDING.student}`]]
                    });
                }
                
                // Update week number
                if (cols.weekNumber >= 0) {
                    updates.push({
                        range: `'${tabName}'!${getColumnLetter(cols.weekNumber)}${i + 1}`,
                        values: [[0]]  // Wk00 = 0
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
        console.log('\n✅ GamePlan recording successfully fixed!');
        console.log('\n📊 Summary:');
        console.log(`- Type: GamePlan (Week 00)`);
        console.log(`- Renamed to: ${RECORDING.correctName}`);
        console.log(`- Primary location: /Students/${RECORDING.student}/`);
        console.log(`- Coach shortcut: /Coaches/Coach ${RECORDING.coach}/${RECORDING.student}/`);
        console.log(`- Google Sheets: Updated`);
        
        // Get and display links
        console.log('\n🔗 Access Links:');
        console.log(`Primary folder: https://drive.google.com/drive/folders/${RECORDING.currentFolderId}`);
        console.log(`Coach folder: https://drive.google.com/drive/folders/${coachAdvayId}`);
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Details:', error);
    }
}

async function main() {
    try {
        const { drive, sheets } = await initializeServices();
        await fixAndrewAdvayGamePlan(drive, sheets);
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
    }
}

console.log('🚀 Starting Andrew & Advay GamePlan fix...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });