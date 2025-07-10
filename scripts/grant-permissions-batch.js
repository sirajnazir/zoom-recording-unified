#!/usr/bin/env node

/**
 * Grant permissions to service account for specific folders
 * Run this with an account that has ownership/edit access to these folders
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

// Folders that need permission granted
const FOLDERS_NEEDING_PERMISSION = [
    { uuid: 'd63b44d6d33b46e8', folderId: '1BqEW7cRZ_V92aJxI7zDTp4B3lZ6C1U8I', week: 'Wk03' },
    { uuid: '5d690b903c268db3', folderId: '1SEmziLYXUGX0G3UPwpTndsmk1sfpu6e0', week: 'Wk04' },
    { uuid: '9f1359bf3e991064', folderId: '1aUtkSTjjEk61glOMQByZryLTV4-ic1eC', week: 'Wk07' },
    { uuid: '3dce0197942e64c8', folderId: '1krJB_sQ7qzXehB9KkrGewHsd96GL_-Ia', week: 'Wk14' },
    { uuid: 'cafafea21e4a242d', folderId: '1gJvu5SQiY6_KNixG0DC6KziVnW5BU8qh', week: 'Wk15' },
    { uuid: '6e588f8bbbece7ac', folderId: '1kD4BnbvuRANeEm9lpy_5JC7LswGINrlN', week: 'Wk17' },
    { uuid: '2cc5ab02c2841088', folderId: '1STwFp_Gxi1Tb4nooNah-b7NL_W3S2gXl', week: 'Wk18' }
];

// Service account that needs access
const SERVICE_ACCOUNT_EMAIL = 'zoom-recording-processor@ivylevel-coaching-sessions.iam.gserviceaccount.com';

async function initializeDrive() {
    // NOTE: You might need to use OAuth2 client instead of service account
    // if the service account doesn't have permission to share files
    
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: config.google.clientEmail,
            private_key: config.google.privateKey
        },
        scopes: ['https://www.googleapis.com/auth/drive']
    });
    
    return google.drive({ version: 'v3', auth });
}

async function grantPermissions(drive) {
    console.log('🔑 Granting Permissions to Service Account');
    console.log('=' .repeat(70));
    console.log(`Service Account: ${SERVICE_ACCOUNT_EMAIL}\n`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const folder of FOLDERS_NEEDING_PERMISSION) {
        console.log(`\n📁 Processing ${folder.week} (${folder.uuid})`);
        console.log(`Folder ID: ${folder.folderId}`);
        
        try {
            // Check current permissions
            console.log('  🔍 Checking current permissions...');
            const permissionsResponse = await drive.permissions.list({
                fileId: folder.folderId,
                fields: 'permissions(id,emailAddress,role,type)'
            });
            
            const permissions = permissionsResponse.data.permissions || [];
            const hasServiceAccount = permissions.some(p => 
                p.emailAddress === SERVICE_ACCOUNT_EMAIL
            );
            
            if (hasServiceAccount) {
                console.log('  ✅ Service account already has access');
                successCount++;
                continue;
            }
            
            // Grant permission
            console.log('  🔑 Granting editor permission...');
            await drive.permissions.create({
                fileId: folder.folderId,
                requestBody: {
                    role: 'writer',  // 'writer' = Editor, 'reader' = Viewer
                    type: 'user',
                    emailAddress: SERVICE_ACCOUNT_EMAIL
                },
                sendNotificationEmail: false
            });
            
            console.log('  ✅ Permission granted successfully');
            successCount++;
            
        } catch (error) {
            console.error(`  ❌ Error: ${error.message}`);
            errorCount++;
            
            if (error.message.includes('does not have sufficient permissions')) {
                console.log('  💡 You need to run this script with an account that owns these files');
                console.log('     or manually share via Google Drive web interface');
            }
        }
    }
    
    // Summary
    console.log('\n' + '=' .repeat(70));
    console.log('📊 SUMMARY');
    console.log('=' .repeat(70));
    console.log(`✅ Successfully granted: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    
    if (errorCount > 0) {
        console.log('\n💡 For folders with errors, you can:');
        console.log('1. Run this script with an account that owns the files');
        console.log('2. Manually share via Google Drive web interface');
        console.log('3. Ask the file owner to share with the service account');
        
        console.log('\n📋 Quick links for manual sharing:');
        FOLDERS_NEEDING_PERMISSION.forEach(folder => {
            console.log(`${folder.week}: https://drive.google.com/drive/folders/${folder.folderId}`);
        });
    }
}

async function checkOwnership(drive) {
    console.log('\n🔍 Checking folder ownership...\n');
    
    for (const folder of FOLDERS_NEEDING_PERMISSION) {
        try {
            const fileInfo = await drive.files.get({
                fileId: folder.folderId,
                fields: 'name,owners(emailAddress,displayName)'
            });
            
            console.log(`${folder.week}: ${fileInfo.data.name}`);
            console.log(`  Owner: ${fileInfo.data.owners[0].emailAddress}`);
            
        } catch (error) {
            console.log(`${folder.week}: Unable to check - ${error.message}`);
        }
    }
}

async function main() {
    try {
        const drive = await initializeDrive();
        
        // First check ownership
        await checkOwnership(drive);
        
        console.log('\n');
        
        // Then try to grant permissions
        await grantPermissions(drive);
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
    }
}

console.log('🚀 Starting permission granting script...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });