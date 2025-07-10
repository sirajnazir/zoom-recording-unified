#!/usr/bin/env node

/**
 * Get Google Drive links for the recording folder and shortcut
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

const RECORDING = {
    uuid: '7194d6c78a5d5208',
    folderId: '1qCjIbSejfaaH3AAvbyXcFk7iHo_dbq2c',
    folderName: 'Coaching_B_Jenny_Huda_Wk01_2023-07-28_M_7194d6c78a5d5208U_7194d6c78a5d5208',
    coach: 'Jenny',
    student: 'Huda'
};

async function initializeDrive() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: config.google.clientEmail,
            private_key: config.google.privateKey
        },
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });
    
    return google.drive({ version: 'v3', auth });
}

async function getRecordingLinks(drive) {
    console.log('🔍 Getting Google Drive Links for Jenny & Huda Recording');
    console.log('=' .repeat(70));
    
    try {
        // 1. Primary folder link
        console.log('\n📁 PRIMARY FOLDER:');
        console.log(`Location: /Students/Huda/`);
        console.log(`Folder Name: ${RECORDING.folderName}`);
        console.log(`📎 Drive Link: https://drive.google.com/drive/folders/${RECORDING.folderId}`);
        console.log(`\n   👆 Click to open the main recording folder`);
        
        // 2. Find the shortcut in Coach Jenny/Huda folder
        console.log('\n\n🔗 COACH SHORTCUT:');
        console.log(`Location: /Coaches/Coach Jenny/Huda/`);
        
        // First find Coach Jenny folder
        const coachSearchResponse = await drive.files.list({
            q: `name = 'Coach Jenny' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id,name)',
            pageSize: 5
        });
        
        if (coachSearchResponse.data.files && coachSearchResponse.data.files.length > 0) {
            const coachJennyId = coachSearchResponse.data.files[0].id;
            
            // Find Huda folder within Coach Jenny
            const hudaSearchResponse = await drive.files.list({
                q: `'${coachJennyId}' in parents and name = 'Huda' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'files(id,name)'
            });
            
            if (hudaSearchResponse.data.files && hudaSearchResponse.data.files.length > 0) {
                const hudaFolderId = hudaSearchResponse.data.files[0].id;
                
                // Find the shortcut
                const shortcutSearchResponse = await drive.files.list({
                    q: `'${hudaFolderId}' in parents and name = '${RECORDING.folderName}' and mimeType = 'application/vnd.google-apps.shortcut'`,
                    fields: 'files(id,name,shortcutDetails)'
                });
                
                if (shortcutSearchResponse.data.files && shortcutSearchResponse.data.files.length > 0) {
                    const shortcut = shortcutSearchResponse.data.files[0];
                    console.log(`Shortcut Name: ${shortcut.name}`);
                    console.log(`📎 Shortcut Link: https://drive.google.com/drive/folders/${hudaFolderId}`);
                    console.log(`\n   👆 Click to open the Coach Jenny/Huda folder containing the shortcut`);
                    
                    // Also provide direct link to the shortcut itself
                    console.log(`\n   Or open shortcut directly:`);
                    console.log(`   📎 https://drive.google.com/file/d/${shortcut.id}`);
                } else {
                    console.log('❌ Shortcut not found');
                }
            } else {
                console.log('❌ Huda folder not found in Coach Jenny folder');
            }
        } else {
            console.log('❌ Coach Jenny folder not found');
        }
        
        // 3. Summary
        console.log('\n\n📊 SUMMARY:');
        console.log('=' .repeat(70));
        console.log('The recording can be accessed from two locations:');
        console.log(`\n1. Student Access (Primary):`);
        console.log(`   📁 /Students/Huda/${RECORDING.folderName}`);
        console.log(`   🔗 https://drive.google.com/drive/folders/${RECORDING.folderId}`);
        console.log(`\n2. Coach Access (Shortcut):`);
        console.log(`   📁 /Coaches/Coach Jenny/Huda/[shortcut]`);
        console.log(`   🔗 See links above`);
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
    }
}

async function main() {
    try {
        const drive = await initializeDrive();
        await getRecordingLinks(drive);
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
    }
}

console.log('🚀 Getting recording links...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });