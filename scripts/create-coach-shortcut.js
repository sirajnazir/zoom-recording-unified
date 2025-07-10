#!/usr/bin/env node

/**
 * Create proper coach folder structure and shortcut
 * Structure: /Coaches/Coach Jenny/Huda/[shortcut to recording]
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
        scopes: ['https://www.googleapis.com/auth/drive']
    });
    
    return google.drive({ version: 'v3', auth });
}

async function findOrCreateFolder(drive, parentId, folderName) {
    // Check if folder exists
    const response = await drive.files.list({
        q: `'${parentId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id,name)'
    });
    
    if (response.data.files && response.data.files.length > 0) {
        console.log(`  ✓ Found existing folder: ${folderName}`);
        return response.data.files[0].id;
    }
    
    // Create folder
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

async function createCoachShortcut(drive) {
    console.log('🔧 Creating Coach Folder Structure and Shortcut');
    console.log('=' .repeat(70));
    console.log(`\nTarget structure: /Coaches/Coach ${RECORDING.coach}/${RECORDING.student}/`);
    console.log(`Recording: ${RECORDING.folderName}\n`);
    
    try {
        // Step 1: Find the Coaches root folder
        console.log('📁 Finding Coaches root folder...');
        
        // Search for "Coaches" folder
        const coachesSearchResponse = await drive.files.list({
            q: `name = 'Coaches' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id,name,parents)',
            pageSize: 10
        });
        
        let coachesRootId = null;
        
        if (coachesSearchResponse.data.files && coachesSearchResponse.data.files.length > 0) {
            // Use the first one found (or you could filter by parent)
            coachesRootId = coachesSearchResponse.data.files[0].id;
            console.log(`  ✓ Found Coaches folder (ID: ${coachesRootId})`);
        } else {
            // If not found, check config or create in root
            console.log('  ⚠️ Coaches folder not found, creating in root...');
            
            const createResponse = await drive.files.create({
                resource: {
                    name: 'Coaches',
                    mimeType: 'application/vnd.google-apps.folder'
                },
                fields: 'id'
            });
            
            coachesRootId = createResponse.data.id;
            console.log(`  📁 Created Coaches folder (ID: ${coachesRootId})`);
        }
        
        // Step 2: Find or create Coach Jenny folder
        console.log(`\n📁 Setting up Coach ${RECORDING.coach} folder...`);
        const coachFolderName = `Coach ${RECORDING.coach}`;
        const coachFolderId = await findOrCreateFolder(drive, coachesRootId, coachFolderName);
        
        // Step 3: Find or create student folder within coach folder
        console.log(`\n📁 Setting up ${RECORDING.student} folder within Coach ${RECORDING.coach}...`);
        const studentFolderId = await findOrCreateFolder(drive, coachFolderId, RECORDING.student);
        
        // Step 4: Create shortcut in the student folder
        console.log(`\n🔗 Creating shortcut in /Coaches/Coach ${RECORDING.coach}/${RECORDING.student}/...`);
        
        // Check if shortcut already exists
        const existingShortcuts = await drive.files.list({
            q: `'${studentFolderId}' in parents and name = '${RECORDING.folderName}' and mimeType = 'application/vnd.google-apps.shortcut'`,
            fields: 'files(id,name)'
        });
        
        if (existingShortcuts.data.files && existingShortcuts.data.files.length > 0) {
            console.log('  ✓ Shortcut already exists');
        } else {
            await drive.files.create({
                resource: {
                    name: RECORDING.folderName,
                    mimeType: 'application/vnd.google-apps.shortcut',
                    parents: [studentFolderId],
                    shortcutDetails: {
                        targetId: RECORDING.folderId
                    }
                },
                fields: 'id,name'
            });
            
            console.log('  ✅ Shortcut created successfully');
        }
        
        // Step 5: Verify the structure
        console.log('\n📊 Verifying folder structure...');
        
        // Get path of the shortcut location
        let currentId = studentFolderId;
        const path = [];
        
        for (let i = 0; i < 5 && currentId; i++) {
            const folderInfo = await drive.files.get({
                fileId: currentId,
                fields: 'name,parents'
            });
            
            path.unshift(folderInfo.data.name);
            currentId = folderInfo.data.parents?.[0];
        }
        
        console.log(`\n✅ Shortcut created at: /${path.join('/')}/`);
        console.log('\nStructure:');
        console.log(`  📁 Coaches`);
        console.log(`    📁 Coach ${RECORDING.coach}`);
        console.log(`      📁 ${RECORDING.student}`);
        console.log(`        🔗 ${RECORDING.folderName} (shortcut)`);
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Details:', error);
    }
}

async function main() {
    try {
        const drive = await initializeDrive();
        await createCoachShortcut(drive);
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
    }
}

console.log('🚀 Starting coach folder structure creation...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });