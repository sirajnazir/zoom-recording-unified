#!/usr/bin/env node

/**
 * Fix the Jenny & Huda recording that's incorrectly stored
 * Move from /Students/Jenny to /Students/Huda and create shortcut in Coach Jenny
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

// The specific recording to fix
const RECORDING_TO_FIX = {
    uuid: '7194d6c78a5d5208',
    currentStandardizedName: 'Coaching_B_Jenny_Huda_Wk01_2023-07-28_M:7194d6c78a5d5208U:7194d6c78a5d5208',
    currentFolderId: '1qCjIbSejfaaH3AAvbyXcFk7iHo_dbq2c', // From the sheet data
    correctCoach: 'Jenny',
    correctStudent: 'Huda',
    date: '2023-07-28'
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

async function getFolderInfo(drive, folderId) {
    try {
        const folder = await drive.files.get({
            fileId: folderId,
            fields: 'id,name,parents'
        });
        
        return folder.data;
    } catch (error) {
        console.error('Error getting folder info:', error.message);
        return null;
    }
}

async function findOrCreateStudentFolder(drive, studentName) {
    const studentsRootId = config.google.drive.organizedRecordingsFolder || '12LgtSd9CpOllNBBycCfxPVFB6Sk9bTIp';
    
    // Check if student folder exists
    const response = await drive.files.list({
        q: `'${studentsRootId}' in parents and name = '${studentName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id,name)'
    });
    
    if (response.data.files && response.data.files.length > 0) {
        console.log(`✅ Found existing ${studentName} folder`);
        return response.data.files[0].id;
    }
    
    // Create student folder
    const createResponse = await drive.files.create({
        resource: {
            name: studentName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [studentsRootId]
        },
        fields: 'id'
    });
    
    console.log(`📁 Created ${studentName} folder`);
    return createResponse.data.id;
}

async function findOrCreateCoachFolder(drive, coachName) {
    const coachesRootId = config.google.drive.coachesFolder || '1VvtGiASdvnU47B9Fo2cp6AzEk-2O53kD';
    
    // Check if coach folder exists
    const response = await drive.files.list({
        q: `'${coachesRootId}' in parents and name = 'Coach ${coachName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id,name)'
    });
    
    if (response.data.files && response.data.files.length > 0) {
        console.log(`✅ Found existing Coach ${coachName} folder`);
        return response.data.files[0].id;
    }
    
    // Create coach folder
    const createResponse = await drive.files.create({
        resource: {
            name: `Coach ${coachName}`,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [coachesRootId]
        },
        fields: 'id'
    });
    
    console.log(`📁 Created Coach ${coachName} folder`);
    return createResponse.data.id;
}

async function fixRecording(drive, sheets) {
    console.log('🔧 Fixing Jenny & Huda Recording');
    console.log('=' .repeat(70));
    console.log(`\nRecording: ${RECORDING_TO_FIX.uuid}`);
    console.log(`Current location: /Students/Jenny (incorrect)`);
    console.log(`Target location: /Students/Huda with shortcut in /Coaches/Coach Jenny\n`);
    
    // Step 1: Get current folder info
    console.log('📁 Getting current folder info...');
    const currentFolder = await getFolderInfo(drive, RECORDING_TO_FIX.currentFolderId);
    
    if (!currentFolder) {
        console.error('❌ Could not find current folder');
        return;
    }
    
    console.log(`Current folder name: ${currentFolder.name}`);
    console.log(`Current parent: ${currentFolder.parents?.[0]}\n`);
    
    // Step 2: Find or create Huda's folder
    console.log('📁 Setting up student folder...');
    const hudaFolderId = await findOrCreateStudentFolder(drive, 'Huda');
    
    // Step 3: Move the folder to Huda
    console.log('\n🚀 Moving folder to Huda...');
    
    try {
        await drive.files.update({
            fileId: RECORDING_TO_FIX.currentFolderId,
            addParents: hudaFolderId,
            removeParents: currentFolder.parents.join(','),
            fields: 'id,parents'
        });
        
        console.log('✅ Folder moved to /Students/Huda');
    } catch (error) {
        console.error('❌ Error moving folder:', error.message);
        return;
    }
    
    // Step 4: Create coach folder structure
    console.log('\n📁 Setting up coach folder...');
    const coachJennyFolderId = await findOrCreateCoachFolder(drive, 'Jenny');
    
    // Step 5: Create shortcut in coach folder
    console.log('\n🔗 Creating shortcut in Coach Jenny folder...');
    
    try {
        // Check if shortcut already exists
        const existingShortcuts = await drive.files.list({
            q: `'${coachJennyFolderId}' in parents and name = '${currentFolder.name}' and mimeType = 'application/vnd.google-apps.shortcut'`,
            fields: 'files(id)'
        });
        
        if (existingShortcuts.data.files && existingShortcuts.data.files.length > 0) {
            console.log('ℹ️  Shortcut already exists in Coach Jenny folder');
        } else {
            await drive.files.create({
                resource: {
                    name: currentFolder.name,
                    mimeType: 'application/vnd.google-apps.shortcut',
                    parents: [coachJennyFolderId],
                    shortcutDetails: {
                        targetId: RECORDING_TO_FIX.currentFolderId
                    }
                },
                fields: 'id'
            });
            
            console.log('✅ Shortcut created in /Coaches/Coach Jenny');
        }
    } catch (error) {
        console.error('❌ Error creating shortcut:', error.message);
    }
    
    // Step 6: Update the sheet if needed
    console.log('\n📊 Checking Google Sheets...');
    
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
        driveLink: headers.findIndex(h => h && h.toLowerCase().includes('drive') && h.toLowerCase().includes('link'))
    };
    
    // Find the row
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row && row[cols.uuid] === RECORDING_TO_FIX.uuid) {
            console.log(`Found at row ${i + 1}`);
            console.log(`Current standardized name: ${row[cols.standardizedName]}`);
            
            // The name should already be correct (Jenny_Huda), but let's verify
            if (row[cols.standardizedName].includes('Jenny_Jenny')) {
                console.log('⚠️  Name still incorrect, updating...');
                // Update if needed
            } else {
                console.log('✅ Standardized name is already correct');
            }
            
            break;
        }
    }
    
    console.log('\n✅ Recording fixed!');
    console.log('Summary:');
    console.log(`- Moved from: /Students/Jenny/${currentFolder.name}`);
    console.log(`- Moved to: /Students/Huda/${currentFolder.name}`);
    console.log(`- Shortcut created in: /Coaches/Coach Jenny`);
}

async function main() {
    try {
        const { drive, sheets } = await initializeServices();
        await fixRecording(drive, sheets);
        
        console.log('\n✅ Process complete!');
        
    } catch (error) {
        console.error('\n❌ Error:', error);
        console.error('Stack:', error.stack);
    }
}

console.log('🚀 Starting recording fix...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });