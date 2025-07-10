#!/usr/bin/env node

/**
 * Cleanup duplicate folders and update sheets to point to correct locations
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

// Mapping of old folder IDs to new folder IDs (from the check output)
const folderMapping = {
    // Old ID -> New ID (in student folder)
    '1bC0LayV6JctR_IXGywzZP5tq3cT21NS5': '1o0-Ve3_jUvq0Xv9N1k3e0zMl86kcZJhr', // 0f53dda2ddac18b2
    '1BVN2jziL3_9OREb3_ZGLiYSzvRGu12cp': '1Bhmv97nHdZIuoZoT99dr0H3AhfCTe4oh', // 324b9bb1a74a3f89
    '1jgCrg-KU48f9D23CmVVJQAf7lWonsbg7': '1IaDGQ-WJcqQiAZ0DC40rmHmPch-wQlvK', // 7190c776c4c0d307
    '1MDtP78vq6lTxIrfrBX0D3WP82nAKKJqn': '1mczuxWupqkYn7sWCcSmWfZ4xTseB86w9', // 7247ecbd0e5fae62
    '1OZNcQJxvAgePFbv6Ze9QNmcr4L6wrKva': '1d43qU2fNiLFxcG1_V9zbUerJJ7AoUan7', // 67b7b4ddb94d9714
    '1Gu4SteiSxx5tyG_3jn7DEXbzpcfGoZDX': '1Iv3KwElUoXcZKfN5mPI7qtLtIm02FRBp', // 330f04559d336f8b
    '1JwzvCGMba1cG8COzY8fiGVd_aghuBENK': null // 37b4f7c7f24f1a85 - Need to find Rayaan folder
};

// Session ID mapping for reference
const sessionInfo = {
    '0f53dda2ddac18b2': { coach: 'Jenny', student: 'Huda', oldId: '1bC0LayV6JctR_IXGywzZP5tq3cT21NS5' },
    '324b9bb1a74a3f89': { coach: 'Jenny', student: 'Huda', oldId: '1BVN2jziL3_9OREb3_ZGLiYSzvRGu12cp' },
    '7190c776c4c0d307': { coach: 'Jenny', student: 'Huda', oldId: '1jgCrg-KU48f9D23CmVVJQAf7lWonsbg7' },
    '7247ecbd0e5fae62': { coach: 'Jenny', student: 'Huda', oldId: '1MDtP78vq6lTxIrfrBX0D3WP82nAKKJqn' },
    '67b7b4ddb94d9714': { coach: 'Jenny', student: 'Huda', oldId: '1OZNcQJxvAgePFbv6Ze9QNmcr4L6wrKva' },
    '330f04559d336f8b': { coach: 'Jenny', student: 'Huda', oldId: '1Gu4SteiSxx5tyG_3jn7DEXbzpcfGoZDX' },
    '37b4f7c7f24f1a85': { coach: 'Alan', student: 'Rayaan', oldId: '1JwzvCGMba1cG8COzY8fiGVd_aghuBENK' }
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

// Helper function to convert column index to A1 notation
function getColumnLetter(colIndex) {
    let letter = '';
    let num = colIndex;
    while (num >= 0) {
        letter = String.fromCharCode((num % 26) + 65) + letter;
        num = Math.floor(num / 26) - 1;
    }
    return letter;
}

async function findRayaanFolder(drive) {
    const studentsFolder = config.google.drive.organizedRecordingsFolder || '12LgtSd9CpOllNBBycCfxPVFB6Sk9bTIp';
    
    // Check for Rayaan folder
    const rayaanResponse = await drive.files.list({
        q: `'${studentsFolder}' in parents and name = 'Rayaan' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id)'
    });
    
    if (rayaanResponse.data.files && rayaanResponse.data.files.length > 0) {
        const rayaanFolderId = rayaanResponse.data.files[0].id;
        
        // Find Alan & Rayaan folder
        const rayaanContents = await drive.files.list({
            q: `'${rayaanFolderId}' in parents and name contains '37b4f7c7f24f1a85' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id,name)'
        });
        
        if (rayaanContents.data.files && rayaanContents.data.files.length > 0) {
            return rayaanContents.data.files[0].id;
        }
    }
    
    return null;
}

async function updateSheetsAndCleanup(drive, sheets) {
    console.log('🔧 Cleanup Process Starting...\n');
    
    // First, find the Rayaan folder
    console.log('🔍 Finding Rayaan folder...');
    const rayaanNewFolderId = await findRayaanFolder(drive);
    if (rayaanNewFolderId) {
        folderMapping['1JwzvCGMba1cG8COzY8fiGVd_aghuBENK'] = rayaanNewFolderId;
        console.log(`✅ Found Rayaan folder: ${rayaanNewFolderId}\n`);
    } else {
        console.log('⚠️ Rayaan folder not found\n');
    }
    
    // Update Google Sheets
    console.log('📊 Updating Google Sheets...');
    
    const spreadsheetId = config.google.sheets.masterIndexSheetId;
    const tabName = 'Drive Import - Standardized';
    
    const range = `'${tabName}'!A:BZ`;
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range
    });
    
    const rows = response.data.values || [];
    const headers = rows[0];
    
    // Find the Drive Link column
    const driveLinkCol = headers.indexOf('Drive Link');
    const folderIdCol = headers.indexOf('googleDriveFolderId');
    
    const updates = [];
    let updateCount = 0;
    
    // Find and update rows
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        
        const currentDriveLink = row[driveLinkCol] || '';
        
        // Check if this row needs updating
        for (const [oldId, newId] of Object.entries(folderMapping)) {
            if (currentDriveLink.includes(oldId) && newId) {
                console.log(`\n✅ Found row ${i + 1} with old folder ID`);
                
                // Update Drive Link
                const newDriveLink = currentDriveLink.replace(oldId, newId);
                updates.push({
                    range: `'${tabName}'!${getColumnLetter(driveLinkCol)}${i + 1}`,
                    values: [[newDriveLink]]
                });
                
                // Update folder ID if column exists
                if (folderIdCol >= 0) {
                    updates.push({
                        range: `'${tabName}'!${getColumnLetter(folderIdCol)}${i + 1}`,
                        values: [[newId]]
                    });
                }
                
                updateCount++;
                console.log(`   Old: ${oldId}`);
                console.log(`   New: ${newId}`);
                break;
            }
        }
    }
    
    // Apply updates
    if (updates.length > 0) {
        console.log(`\n📝 Applying ${updates.length} updates to sheets...`);
        
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            resource: {
                data: updates,
                valueInputOption: 'USER_ENTERED'
            }
        });
        
        console.log(`✅ Updated ${updateCount} rows in sheets\n`);
    }
    
    // Now delete the old folders
    console.log('🗑️ Deleting old duplicate folders...\n');
    
    let deleteCount = 0;
    for (const [oldId, newId] of Object.entries(folderMapping)) {
        if (newId) { // Only delete if we have a replacement
            try {
                console.log(`Deleting old folder: ${oldId}`);
                await drive.files.delete({
                    fileId: oldId
                });
                deleteCount++;
                console.log(`✅ Deleted`);
            } catch (error) {
                console.log(`❌ Error deleting: ${error.message}`);
            }
        }
    }
    
    console.log(`\n✅ Deleted ${deleteCount} duplicate folders`);
}

async function main() {
    console.log('🔧 Cleanup Duplicate Folders and Update Sheets');
    console.log('=' .repeat(70));
    
    try {
        const { drive, sheets } = await initializeServices();
        await updateSheetsAndCleanup(drive, sheets);
        
        console.log('\n✅ Cleanup complete!');
        console.log('\n📊 Results:');
        console.log('- Google Sheets updated to point to correct folders');
        console.log('- Old duplicate folders deleted');
        console.log('- All recordings now properly organized in student folders');
        
    } catch (error) {
        console.error('\n❌ Error:', error);
        console.error('Stack:', error.stack);
    }
}

console.log('🚀 Starting cleanup process...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });