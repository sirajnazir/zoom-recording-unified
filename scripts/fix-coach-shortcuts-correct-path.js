#!/usr/bin/env node

/**
 * Fix coach shortcuts to use correct existing structure
 * Knowledge Base/Coaches/<Coach Name>/<Student Name>/
 * NOT "Coach Jenny" or "Coach Andrew"
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

const RECORDINGS_TO_FIX = [
    {
        name: 'Jenny & Anoushka',
        uuid: '60c28a4a43039b09',
        folderId: '1JTxIdMOAzo76CRdp-oDhBPJxr2mYUK5M',
        folderName: 'Coaching_B_Jenny_Anoushka_Wk01_2023-08-19_M_60c28a4a43039b09U_60c28a4a43039b09',
        coach: 'Jenny',
        student: 'Anoushka'
    },
    {
        name: 'Andrew & Advay',
        uuid: '5b31180545b65a78',
        folderId: '1bDNb4rHhBWJgIqdQ1loFdRZlQ56cQ-x9',
        folderName: 'GamePlan_B_Andrew_Advay_Wk00_2024-10-26_M_5b31180545b65a78U_5b31180545b65a78',
        coach: 'Andrew',
        student: 'Advay'
    }
];

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

async function deleteIncorrectShortcuts(drive, recording) {
    console.log(`\n🗑️  Cleaning up incorrect shortcuts for ${recording.name}...`);
    
    // Search for shortcuts with "Coach " prefix
    const incorrectFolders = [`Coach ${recording.coach}`, `Coach ${recording.coach.toLowerCase()}`];
    
    for (const folderName of incorrectFolders) {
        const searchResponse = await drive.files.list({
            q: `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id,name,parents)'
        });
        
        if (searchResponse.data.files && searchResponse.data.files.length > 0) {
            for (const folder of searchResponse.data.files) {
                // Check if it's in Coaches folder
                if (folder.parents && folder.parents.length > 0) {
                    const parent = await drive.files.get({
                        fileId: folder.parents[0],
                        fields: 'name'
                    });
                    
                    if (parent.data.name === 'Coaches') {
                        console.log(`  Found incorrect folder: ${folder.name}`);
                        
                        // Check for shortcuts inside
                        const shortcutSearch = await drive.files.list({
                            q: `'${folder.id}' in parents`,
                            fields: 'files(id,name,mimeType)'
                        });
                        
                        if (shortcutSearch.data.files) {
                            for (const file of shortcutSearch.data.files) {
                                if (file.mimeType === 'application/vnd.google-apps.shortcut' && 
                                    file.name.includes(recording.uuid)) {
                                    console.log(`  Deleting shortcut: ${file.name}`);
                                    await drive.files.delete({ fileId: file.id });
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

async function fixCoachShortcuts(drive) {
    console.log('🔧 Fixing Coach Shortcuts to Correct Path Structure');
    console.log('=' .repeat(70));
    console.log('\nCorrect structure: Knowledge Base/Coaches/<Coach Name>/<Student>/\n');
    
    try {
        // Find Knowledge Base folder
        console.log('📁 Finding Knowledge Base folder...');
        const kbSearch = await drive.files.list({
            q: `name = 'Ivylevel Knowledge Base' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id)',
            pageSize: 1
        });
        
        if (!kbSearch.data.files || kbSearch.data.files.length === 0) {
            throw new Error('Knowledge Base folder not found');
        }
        
        const knowledgeBaseId = kbSearch.data.files[0].id;
        console.log('✅ Found Knowledge Base folder');
        
        // Find Coaches folder within Knowledge Base
        console.log('\n📁 Finding Coaches folder in Knowledge Base...');
        const coachesSearch = await drive.files.list({
            q: `'${knowledgeBaseId}' in parents and name = 'Coaches' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id)'
        });
        
        if (!coachesSearch.data.files || coachesSearch.data.files.length === 0) {
            throw new Error('Coaches folder not found in Knowledge Base');
        }
        
        const coachesRootId = coachesSearch.data.files[0].id;
        console.log('✅ Found Coaches folder');
        
        // Process each recording
        for (const recording of RECORDINGS_TO_FIX) {
            console.log(`\n${'='.repeat(50)}`);
            console.log(`📹 Processing ${recording.name} recording`);
            console.log(`UUID: ${recording.uuid}`);
            
            // Clean up incorrect shortcuts first
            await deleteIncorrectShortcuts(drive, recording);
            
            // Create correct structure
            console.log(`\n📁 Setting up correct coach folder structure...`);
            console.log(`  Target: /Knowledge Base/Coaches/${recording.coach}/${recording.student}/`);
            
            // Find or create coach folder (without "Coach " prefix)
            const coachFolderId = await findOrCreateFolder(drive, coachesRootId, recording.coach);
            console.log(`  ✅ Coach folder ready: /Coaches/${recording.coach}/`);
            
            // Find or create student folder within coach folder
            const studentFolderId = await findOrCreateFolder(drive, coachFolderId, recording.student);
            console.log(`  ✅ Student folder ready: /Coaches/${recording.coach}/${recording.student}/`);
            
            // Create shortcut
            console.log(`\n🔗 Creating shortcut...`);
            
            // Check if shortcut already exists
            const existingShortcuts = await drive.files.list({
                q: `'${studentFolderId}' in parents and name = '${recording.folderName}' and mimeType = 'application/vnd.google-apps.shortcut'`,
                fields: 'files(id)'
            });
            
            if (existingShortcuts.data.files && existingShortcuts.data.files.length > 0) {
                console.log('  ✅ Shortcut already exists in correct location');
            } else {
                await drive.files.create({
                    resource: {
                        name: recording.folderName,
                        mimeType: 'application/vnd.google-apps.shortcut',
                        parents: [studentFolderId],
                        shortcutDetails: {
                            targetId: recording.folderId
                        }
                    },
                    fields: 'id'
                });
                console.log('  ✅ Shortcut created successfully');
            }
            
            // Display links
            console.log(`\n🔗 Access Links:`);
            console.log(`  Primary: https://drive.google.com/drive/folders/${recording.folderId}`);
            console.log(`  Coach folder: https://drive.google.com/drive/folders/${studentFolderId}`);
        }
        
        // Final summary
        console.log(`\n${'='.repeat(70)}`);
        console.log('✅ All shortcuts fixed!');
        console.log('\nSummary:');
        for (const recording of RECORDINGS_TO_FIX) {
            console.log(`- ${recording.name}: /Knowledge Base/Coaches/${recording.coach}/${recording.student}/`);
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Details:', error);
    }
}

async function main() {
    try {
        const drive = await initializeDrive();
        await fixCoachShortcuts(drive);
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
    }
}

console.log('🚀 Starting coach shortcuts fix...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });