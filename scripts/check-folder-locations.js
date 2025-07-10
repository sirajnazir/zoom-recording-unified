#!/usr/bin/env node

/**
 * Check the actual location of our folders in Google Drive
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

// The folder IDs from the sheet data
const folderIds = {
    '37b4f7c7f24f1a85': '1JwzvCGMba1cG8COzY8fiGVd_aghuBENK',
    '0f53dda2ddac18b2': '1bC0LayV6JctR_IXGywzZP5tq3cT21NS5',
    '324b9bb1a74a3f89': '1BVN2jziL3_9OREb3_ZGLiYSzvRGu12cp',
    '7190c776c4c0d307': '1jgCrg-KU48f9D23CmVVJQAf7lWonsbg7',
    '7247ecbd0e5fae62': '1MDtP78vq6lTxIrfrBX0D3WP82nAKKJqn',
    '67b7b4ddb94d9714': '1OZNcQJxvAgePFbv6Ze9QNmcr4L6wrKva',
    '330f04559d336f8b': '1Gu4SteiSxx5tyG_3jn7DEXbzpcfGoZDX'
};

// The correct information
const correctInfo = {
    '37b4f7c7f24f1a85': { coach: 'Alan', student: 'Rayaan' },
    '0f53dda2ddac18b2': { coach: 'Jenny', student: 'Huda' },
    '324b9bb1a74a3f89': { coach: 'Jenny', student: 'Huda' },
    '7190c776c4c0d307': { coach: 'Jenny', student: 'Huda' },
    '7247ecbd0e5fae62': { coach: 'Jenny', student: 'Huda' },
    '67b7b4ddb94d9714': { coach: 'Jenny', student: 'Huda' },
    '330f04559d336f8b': { coach: 'Jenny', student: 'Huda' }
};

async function initializeGoogleDrive() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: config.google.clientEmail,
            private_key: config.google.privateKey
        },
        scopes: ['https://www.googleapis.com/auth/drive']
    });
    
    return google.drive({ version: 'v3', auth });
}

async function getFolderPath(drive, folderId) {
    const path = [];
    let currentId = folderId;
    
    try {
        for (let depth = 0; depth < 10 && currentId; depth++) {
            const response = await drive.files.get({
                fileId: currentId,
                fields: 'id,name,parents'
            });
            
            path.unshift(response.data.name);
            
            if (response.data.parents && response.data.parents.length > 0) {
                currentId = response.data.parents[0];
            } else {
                break;
            }
        }
    } catch (error) {
        console.error('Error getting folder path:', error.message);
    }
    
    return path;
}

async function checkFolderLocations(drive) {
    console.log('🔍 Checking folder locations in Google Drive...\n');
    
    for (const [sessionId, folderId] of Object.entries(folderIds)) {
        const info = correctInfo[sessionId];
        console.log(`\nSession ${sessionId} (${info.coach} & ${info.student}):`);
        console.log(`Folder ID: ${folderId}`);
        
        try {
            // Get folder info
            const folder = await drive.files.get({
                fileId: folderId,
                fields: 'id,name,parents'
            });
            
            console.log(`Folder name: ${folder.data.name}`);
            
            // Get full path
            const path = await getFolderPath(drive, folderId);
            console.log(`Path: /${path.join('/')}`);
            
            // Check if it's in the correct student folder
            const isInStudentFolder = path.some(p => p === info.student);
            const status = isInStudentFolder ? '✅ In correct student folder' : '❌ NOT in student folder';
            console.log(`Status: ${status}`);
            
            // List files in the folder
            const filesResponse = await drive.files.list({
                q: `'${folderId}' in parents and trashed = false`,
                fields: 'files(name,mimeType)',
                pageSize: 10
            });
            
            const files = filesResponse.data.files || [];
            console.log(`Files: ${files.length} files`);
            if (files.length > 0) {
                files.slice(0, 3).forEach(f => {
                    console.log(`  - ${f.name}`);
                });
                if (files.length > 3) {
                    console.log(`  ... and ${files.length - 3} more`);
                }
            }
            
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
    }
    
    // Also check for duplicate folders
    console.log('\n\n🔍 Checking for duplicate folders in student directories...\n');
    
    const studentsFolder = config.google.drive.organizedRecordingsFolder || '12LgtSd9CpOllNBBycCfxPVFB6Sk9bTIp';
    
    // Check Huda's folder
    console.log('Checking Huda folder...');
    const hudaResponse = await drive.files.list({
        q: `'${studentsFolder}' in parents and name = 'Huda' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id)'
    });
    
    if (hudaResponse.data.files && hudaResponse.data.files.length > 0) {
        const hudaFolderId = hudaResponse.data.files[0].id;
        
        const hudaContents = await drive.files.list({
            q: `'${hudaFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id,name)',
            orderBy: 'name'
        });
        
        const folders = hudaContents.data.files || [];
        console.log(`Found ${folders.length} folders in Huda's directory`);
        
        // Look for our specific sessions
        const ourSessions = ['0f53dda2ddac18b2', '324b9bb1a74a3f89', '7190c776c4c0d307', '7247ecbd0e5fae62', '67b7b4ddb94d9714', '330f04559d336f8b'];
        
        ourSessions.forEach(sessionId => {
            const matching = folders.filter(f => f.name.includes(sessionId));
            if (matching.length > 0) {
                console.log(`  Session ${sessionId}: Found ${matching.length} folder(s)`);
                matching.forEach(m => {
                    console.log(`    - ${m.name} (${m.id})`);
                });
            }
        });
    }
}

async function main() {
    console.log('🔧 Checking Folder Locations');
    console.log('=' .repeat(70));
    
    try {
        const drive = await initializeGoogleDrive();
        await checkFolderLocations(drive);
        
        console.log('\n✅ Check complete!');
        
    } catch (error) {
        console.error('\n❌ Error:', error);
    }
}

console.log('🚀 Starting folder location check...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });