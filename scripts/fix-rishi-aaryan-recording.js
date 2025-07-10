#!/usr/bin/env node

/**
 * Fix Rishi & Aaryan recording
 * - Rishi is the coach, Aaryan is the student
 * - Fix the incorrect folder structure where Rishi was made a student
 * - Move to /Students/Aaryan/
 * - Create shortcut in /Knowledge Base/Coaches/Rishi/Aaryan/
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

const RECORDING = {
    uuid: 'a76329e64284b419',
    currentFolderId: '1udz0TwG-itMOgqbqzjOdCPMvqQGMW1FA',
    currentName: 'Coaching_B_Rishi_Aaryan_Wk01_2024-05-09_M:a76329e64284b419U:a76329e64284b419',
    correctName: 'Coaching_B_Rishi_Aaryan_Wk01_2024-05-09_M_a76329e64284b419U_a76329e64284b419',
    coach: 'Rishi',
    student: 'Aaryan',
    date: '2024-05-09'
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

async function fixRishiAaryanRecording(drive, sheets) {
    console.log('🔧 Fixing Rishi & Aaryan Recording');
    console.log('=' .repeat(70));
    console.log(`\nUUID: ${RECORDING.uuid}`);
    console.log(`Current name: ${RECORDING.currentName}`);
    console.log(`Target name: ${RECORDING.correctName}`);
    console.log(`Coach: ${RECORDING.coach}, Student: ${RECORDING.student}`);
    console.log('\nNote: Fixing incorrect structure where Rishi was made a student');
    
    try {
        // Step 1: Get current folder info
        console.log('\n📁 Getting current folder info...');
        const folder = await drive.files.get({
            fileId: RECORDING.currentFolderId,
            fields: 'id,name,parents'
        });
        
        console.log(`Current name: ${folder.data.name}`);
        console.log(`Current location parent: ${folder.data.parents?.[0]}`);
        
        // Check current parent
        if (folder.data.parents && folder.data.parents.length > 0) {
            const parentInfo = await drive.files.get({
                fileId: folder.data.parents[0],
                fields: 'name'
            });
            console.log(`Current parent folder: ${parentInfo.data.name}`);
            
            if (parentInfo.data.name === 'Rishi') {
                console.log('⚠️  Recording is incorrectly in Rishi student folder');
            }
        }
        
        // Step 2: Rename the folder with correct format
        console.log('\n📝 Renaming folder with correct format...');
        await drive.files.update({
            fileId: RECORDING.currentFolderId,
            resource: {
                name: RECORDING.correctName
            }
        });
        console.log(`✅ Renamed to: ${RECORDING.correctName}`);
        
        // Step 3: Find or create Aaryan's student folder
        console.log('\n📁 Setting up student folder structure...');
        const studentsRootId = config.google.drive.organizedRecordingsFolder || '12LgtSd9CpOllNBBycCfxPVFB6Sk9bTIp';
        const aaryanFolderId = await findOrCreateFolder(drive, studentsRootId, RECORDING.student);
        console.log(`✅ Student folder ready: /Students/${RECORDING.student}/`);
        
        // Step 4: Move folder to Aaryan
        console.log('\n🚀 Moving folder to correct location...');
        await drive.files.update({
            fileId: RECORDING.currentFolderId,
            addParents: aaryanFolderId,
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
        
        // Create/find Rishi folder
        const rishiFolderId = await findOrCreateFolder(drive, coachesRootId, RECORDING.coach);
        console.log(`  ✅ Coach folder ready: /Knowledge Base/Coaches/${RECORDING.coach}/`);
        
        // Create/find Aaryan folder within Rishi
        const coachAaryanId = await findOrCreateFolder(drive, rishiFolderId, RECORDING.student);
        console.log(`  ✅ Student folder in coach: /Knowledge Base/Coaches/${RECORDING.coach}/${RECORDING.student}/`);
        
        // Step 6: Create shortcut
        console.log('\n🔗 Creating shortcut in coach folder...');
        
        // Check if shortcut exists
        const shortcutSearch = await drive.files.list({
            q: `'${coachAaryanId}' in parents and name = '${RECORDING.correctName}' and mimeType = 'application/vnd.google-apps.shortcut'`,
            fields: 'files(id)'
        });
        
        if (shortcutSearch.data.files?.length > 0) {
            console.log('  ✅ Shortcut already exists');
        } else {
            await drive.files.create({
                resource: {
                    name: RECORDING.correctName,
                    mimeType: 'application/vnd.google-apps.shortcut',
                    parents: [coachAaryanId],
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
                    const newStandardizedName = row[cols.standardizedName]
                        .replace('unknown', RECORDING.coach)
                        .replace('Unknown', RECORDING.student)
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
                
                // Update participants (ensure correct order)
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
        console.log(`- Coach: ${RECORDING.coach} (not student)`);
        console.log(`- Student: ${RECORDING.student}`);
        console.log(`- Moved from incorrect location to: /Students/${RECORDING.student}/`);
        console.log(`- Coach shortcut: /Knowledge Base/Coaches/${RECORDING.coach}/${RECORDING.student}/`);
        console.log(`- Google Sheets: Updated`);
        
        // Get and display links
        console.log('\n🔗 Access Links:');
        console.log(`Primary folder: https://drive.google.com/drive/folders/${RECORDING.currentFolderId}`);
        console.log(`Coach folder: https://drive.google.com/drive/folders/${coachAaryanId}`);
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Details:', error);
    }
}

async function main() {
    try {
        const { drive, sheets } = await initializeServices();
        await fixRishiAaryanRecording(drive, sheets);
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
    }
}

console.log('🚀 Starting Rishi & Aaryan recording fix...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });