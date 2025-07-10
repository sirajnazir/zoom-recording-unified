#!/usr/bin/env node

/**
 * Complete the fixes for Katie & Iqra recordings
 * - Create missing shortcuts in Katie's folder
 * - Update Google Sheets entries
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

const RECORDINGS = [
    { uuid: 'd63b44d6d33b46e8', folderId: '1BqEW7cRZ_V92aJxI7zDTp4B3lZ6C1U8I', week: 'Wk03', date: '2024-06-03' },
    { uuid: '5d690b903c268db3', folderId: '1SEmziLYXUGX0G3UPwpTndsmk1sfpu6e0', week: 'Wk04', date: '2024-06-13' },
    { uuid: '9f1359bf3e991064', folderId: '1aUtkSTjjEk61glOMQByZryLTV4-ic1eC', week: 'Wk07', date: '2024-06-17' },
    { uuid: '3dce0197942e64c8', folderId: '1krJB_sQ7qzXehB9KkrGewHsd96GL_-Ia', week: 'Wk14', date: '2024-07-09' },
    { uuid: 'cafafea21e4a242d', folderId: '1gJvu5SQiY6_KNixG0DC6KziVnW5BU8qh', week: 'Wk15', date: '2024-07-10' },
    { uuid: '6e588f8bbbece7ac', folderId: '1kD4BnbvuRANeEm9lpy_5JC7LswGINrlN', week: 'Wk17', date: '2024-07-23' },
    { uuid: '2cc5ab02c2841088', folderId: '1STwFp_Gxi1Tb4nooNah-b7NL_W3S2gXl', week: 'Wk18', date: '2024-07-25' }
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

async function completeKatieIqraFixes(drive, sheets) {
    console.log('🔧 Completing Katie & Iqra Recording Fixes');
    console.log('=' .repeat(70));
    console.log(`\nTotal recordings to complete: ${RECORDINGS.length}\n`);
    
    // Find Katie's coach folder
    const kbSearch = await drive.files.list({
        q: `name = 'Ivylevel Knowledge Base' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id)',
        pageSize: 1
    });
    
    const knowledgeBaseId = kbSearch.data.files[0].id;
    
    const coachesSearch = await drive.files.list({
        q: `'${knowledgeBaseId}' in parents and name = 'Coaches' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id)'
    });
    
    const coachesRootId = coachesSearch.data.files?.[0]?.id;
    
    // Find Katie/Iqra folder
    const katieSearch = await drive.files.list({
        q: `'${coachesRootId}' in parents and name = 'Katie' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id)'
    });
    
    const katieFolderId = katieSearch.data.files[0].id;
    
    const iqraSearch = await drive.files.list({
        q: `'${katieFolderId}' in parents and name = 'Iqra' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id)'
    });
    
    const coachIqraId = iqraSearch.data.files[0].id;
    console.log(`✅ Found Katie/Iqra folder: ${coachIqraId}\n`);
    
    let shortcutCount = 0;
    let sheetUpdateCount = 0;
    
    for (const recording of RECORDINGS) {
        console.log(`\n📹 Processing ${recording.week} (${recording.uuid})`);
        
        try {
            // Get folder info
            const folderInfo = await drive.files.get({
                fileId: recording.folderId,
                fields: 'id,name'
            });
            
            const folderName = folderInfo.data.name;
            console.log(`  Folder: ${folderName}`);
            
            // Check/create shortcut
            console.log('  🔗 Checking shortcut...');
            const shortcutSearch = await drive.files.list({
                q: `'${coachIqraId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.shortcut'`,
                fields: 'files(id)'
            });
            
            if (shortcutSearch.data.files?.length > 0) {
                console.log('    ✅ Shortcut already exists');
            } else {
                await drive.files.create({
                    resource: {
                        name: folderName,
                        mimeType: 'application/vnd.google-apps.shortcut',
                        parents: [coachIqraId],
                        shortcutDetails: {
                            targetId: recording.folderId
                        }
                    },
                    fields: 'id'
                });
                console.log('    ✅ Shortcut created');
                shortcutCount++;
            }
            
            // Update Google Sheets
            console.log('  📊 Updating Google Sheets...');
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
                    console.log(`    Found at row ${i + 1}`);
                    
                    const updates = [];
                    
                    // Check if updates are needed
                    let needsUpdate = false;
                    
                    if (cols.participants >= 0 && row[cols.participants] !== 'Katie, Iqra') {
                        needsUpdate = true;
                        updates.push({
                            range: `'${tabName}'!${getColumnLetter(cols.participants)}${i + 1}`,
                            values: [['Katie, Iqra']]
                        });
                    }
                    
                    if (cols.rawName >= 0 && !row[cols.rawName]?.includes('Katie')) {
                        needsUpdate = true;
                        updates.push({
                            range: `'${tabName}'!${getColumnLetter(cols.rawName)}${i + 1}`,
                            values: [['Katie & Iqra']]
                        });
                    }
                    
                    if (cols.meetingTopic >= 0 && !row[cols.meetingTopic]?.includes('Katie')) {
                        needsUpdate = true;
                        updates.push({
                            range: `'${tabName}'!${getColumnLetter(cols.meetingTopic)}${i + 1}`,
                            values: [['Katie & Iqra Session']]
                        });
                    }
                    
                    if (cols.hostEmail >= 0 && row[cols.hostEmail] !== 'katie@ivymentors.co') {
                        needsUpdate = true;
                        updates.push({
                            range: `'${tabName}'!${getColumnLetter(cols.hostEmail)}${i + 1}`,
                            values: [['katie@ivymentors.co']]
                        });
                    }
                    
                    if (needsUpdate && updates.length > 0) {
                        await sheets.spreadsheets.values.batchUpdate({
                            spreadsheetId,
                            resource: {
                                data: updates,
                                valueInputOption: 'USER_ENTERED'
                            }
                        });
                        console.log(`    ✅ Updated ${updates.length} fields`);
                        sheetUpdateCount++;
                    } else {
                        console.log('    ✅ Sheet already up to date');
                    }
                    
                    break;
                }
            }
            
        } catch (error) {
            console.error(`  ❌ Error: ${error.message}`);
        }
    }
    
    // Summary
    console.log('\n' + '=' .repeat(70));
    console.log('📊 COMPLETION SUMMARY');
    console.log('=' .repeat(70));
    console.log(`Total recordings processed: ${RECORDINGS.length}`);
    console.log(`✅ New shortcuts created: ${shortcutCount}`);
    console.log(`✅ Sheet rows updated: ${sheetUpdateCount}`);
    console.log('\nAll Katie & Iqra recordings are now properly organized!');
}

async function main() {
    try {
        const { drive, sheets } = await initializeServices();
        await completeKatieIqraFixes(drive, sheets);
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
    }
}

console.log('🚀 Starting completion of Katie & Iqra fixes...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });