#!/usr/bin/env node
/**
 * Test folder-based processing on a single coach
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

async function testFolderProcessing() {
    console.log('\n🧪 Testing Folder-Based Processing\n');
    
    try {
        // Initialize Google Drive
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: config.google.clientEmail,
                private_key: config.google.privateKey
            },
            scopes: ['https://www.googleapis.com/auth/drive.readonly']
        });
        
        const drive = google.drive({ version: 'v3', auth });
        
        // Get Coach Aditi folder
        const rootId = '1Dpq3rSZelQJJePkSi7K6xAY4q62xMiFA';
        const response = await drive.files.list({
            q: `'${rootId}' in parents and name = 'Coach Aditi' and mimeType = 'application/vnd.google-apps.folder'`,
            fields: 'files(id, name)'
        });
        
        const aditiFolder = response.data.files?.[0];
        if (!aditiFolder) {
            throw new Error('Coach Aditi folder not found');
        }
        
        console.log(`📁 Found ${aditiFolder.name} (${aditiFolder.id})\n`);
        
        // Get student folders
        const studentResponse = await drive.files.list({
            q: `'${aditiFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder'`,
            fields: 'files(id, name)'
        });
        
        const studentFolders = studentResponse.data.files || [];
        console.log(`Found ${studentFolders.length} student folders\n`);
        
        // Process first student
        if (studentFolders.length > 0) {
            const studentFolder = studentFolders[0];
            console.log(`📁 Checking ${studentFolder.name}...\n`);
            
            // Get session folders
            const sessionResponse = await drive.files.list({
                q: `'${studentFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder'`,
                fields: 'files(id, name)',
                orderBy: 'name'
            });
            
            const sessionFolders = sessionResponse.data.files || [];
            console.log(`Found ${sessionFolders.length} session folders:\n`);
            
            // Check a few sessions for their files
            for (let i = 0; i < Math.min(3, sessionFolders.length); i++) {
                const session = sessionFolders[i];
                console.log(`📁 ${session.name}`);
                
                // Get files in this session
                const filesResponse = await drive.files.list({
                    q: `'${session.id}' in parents and trashed = false`,
                    fields: 'files(name, mimeType)'
                });
                
                const files = filesResponse.data.files || [];
                console.log(`   Files: ${files.length}`);
                files.forEach(f => {
                    const type = f.name.includes('.mp4') ? 'video' :
                                f.name.includes('.m4a') ? 'audio' :
                                f.name.includes('.vtt') ? 'transcript' :
                                f.name.includes('.txt') ? 'chat' : 'other';
                    console.log(`     - ${f.name} (${type})`);
                });
                console.log('');
            }
        }
        
        console.log('✅ Test complete!');
        console.log('\n💡 As you can see, all files for a session are in the same folder.');
        console.log('   The new processor will keep them together as one recording.\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testFolderProcessing();