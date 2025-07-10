#!/usr/bin/env node

/**
 * Check all Rishi & Aarav recordings in the S3-Ivylevel folder
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

const RISHI_AARAV_FOLDER_ID = '1lGkcHEwpsoZ96fqUeuFfudbsD0yPrA-H';

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

async function checkRishiAaravRecordings(drive) {
    console.log('🔍 Checking Rishi & Aarav Recordings in S3-Ivylevel');
    console.log('=' .repeat(70));
    console.log(`\nFolder ID: ${RISHI_AARAV_FOLDER_ID}`);
    console.log('URL: https://drive.google.com/drive/folders/1lGkcHEwpsoZ96fqUeuFfudbsD0yPrA-H\n');
    
    try {
        // Get folder info
        const folderInfo = await drive.files.get({
            fileId: RISHI_AARAV_FOLDER_ID,
            fields: 'name,parents'
        });
        
        console.log(`Folder Name: ${folderInfo.data.name}`);
        
        // List all items in the folder
        let pageToken = null;
        let allFiles = [];
        
        do {
            const response = await drive.files.list({
                q: `'${RISHI_AARAV_FOLDER_ID}' in parents and trashed = false`,
                fields: 'nextPageToken, files(id,name,mimeType,createdTime)',
                pageSize: 100,
                pageToken: pageToken,
                orderBy: 'name'
            });
            
            if (response.data.files) {
                allFiles = allFiles.concat(response.data.files);
            }
            
            pageToken = response.data.nextPageToken;
        } while (pageToken);
        
        console.log(`\nTotal items found: ${allFiles.length}`);
        
        // Separate folders and shortcuts
        const folders = allFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
        const shortcuts = allFiles.filter(f => f.mimeType === 'application/vnd.google-apps.shortcut');
        const others = allFiles.filter(f => 
            f.mimeType !== 'application/vnd.google-apps.folder' && 
            f.mimeType !== 'application/vnd.google-apps.shortcut'
        );
        
        console.log(`\n📁 Folders: ${folders.length}`);
        console.log(`🔗 Shortcuts: ${shortcuts.length}`);
        console.log(`📄 Other files: ${others.length}`);
        
        // List folders
        if (folders.length > 0) {
            console.log('\n📁 Recording Folders:');
            console.log('-'.repeat(70));
            folders.forEach((folder, index) => {
                console.log(`${index + 1}. ${folder.name}`);
                console.log(`   ID: ${folder.id}`);
                console.log(`   Created: ${folder.createdTime}`);
            });
        }
        
        // List shortcuts
        if (shortcuts.length > 0) {
            console.log('\n🔗 Shortcuts:');
            console.log('-'.repeat(70));
            shortcuts.forEach((shortcut, index) => {
                console.log(`${index + 1}. ${shortcut.name}`);
            });
        }
        
        // Check if any folders match recording pattern
        console.log('\n📊 Analysis:');
        console.log('-'.repeat(70));
        
        const recordingPattern = /Coaching.*Rishi.*Aarav|Rishi.*Aarav.*recording/i;
        const matchingFolders = folders.filter(f => recordingPattern.test(f.name));
        
        console.log(`Recording folders found: ${matchingFolders.length}`);
        
        if (matchingFolders.length > 0) {
            console.log('\nMatching recording folders:');
            matchingFolders.forEach(f => {
                console.log(`- ${f.name}`);
            });
        }
        
        // Also check the "Rishi - Rishi" folder mentioned
        console.log('\n\n🔍 Checking the problematic "Rishi - Rishi" folder:');
        console.log('Folder ID: 162ArNE03QTI9d4kFfuxZ93IgNzmh_fH5');
        
        try {
            const rishiRishiFolder = await drive.files.get({
                fileId: '162ArNE03QTI9d4kFfuxZ93IgNzmh_fH5',
                fields: 'name,parents'
            });
            
            console.log(`\nFolder Name: ${rishiRishiFolder.data.name}`);
            
            // List contents
            const rishiContents = await drive.files.list({
                q: `'162ArNE03QTI9d4kFfuxZ93IgNzmh_fH5' in parents and trashed = false`,
                fields: 'files(id,name,mimeType)',
                pageSize: 30
            });
            
            if (rishiContents.data.files) {
                console.log(`\nContents (${rishiContents.data.files.length} items):`);
                rishiContents.data.files.forEach(f => {
                    console.log(`- ${f.name} (${f.mimeType === 'application/vnd.google-apps.shortcut' ? 'Shortcut' : 'Folder'})`);
                });
            }
        } catch (error) {
            console.error('Could not access Rishi-Rishi folder:', error.message);
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
    }
}

async function main() {
    try {
        const drive = await initializeDrive();
        await checkRishiAaravRecordings(drive);
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
    }
}

console.log('🚀 Starting Rishi & Aarav recordings check...\n');

main()
    .then(() => {
        console.log('\n✅ Check completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });