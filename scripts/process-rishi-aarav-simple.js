#!/usr/bin/env node

/**
 * Process all Rishi & Aarav recordings from S3-Ivylevel folder
 * Using the same approach as process-drive-unified.js
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');
const crypto = require('crypto');
const axios = require('axios');

const RISHI_AARAV_FOLDER_ID = '1lGkcHEwpsoZ96fqUeuFfudbsD0yPrA-H';

// Service account info
const SERVICE_ACCOUNT = {
    email: 'drive-import@example.com',
    displayName: 'Google Drive Import Service'
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
    
    return { drive, sheets, auth };
}

async function processRecordingFolder(drive, folder) {
    console.log(`\n📁 Processing: ${folder.name}`);
    
    try {
        // Get all files in the folder
        const filesResponse = await drive.files.list({
            q: `'${folder.id}' in parents and trashed = false`,
            fields: 'files(id,name,mimeType,size)',
            pageSize: 100
        });
        
        const files = filesResponse.data.files || [];
        console.log(`   Files found: ${files.length}`);
        
        if (files.length === 0) {
            console.log('   ⚠️  No files found, skipping...');
            return null;
        }
        
        // Create session object with ALL files
        const session = {
            id: crypto.randomBytes(8).toString('hex'),
            folderId: folder.id,
            folderName: folder.name,
            files: files.map(file => ({
                id: file.id,
                name: file.name,
                mimeType: file.mimeType,
                size: file.size || 0,
                folderId: folder.id,
                folderName: folder.name
            })),
            metadata: {
                folderName: folder.name,
                folderId: folder.id,
                fileCount: files.length,
                dataSource: 'google-drive'
            },
            dataSource: 'google-drive',
            source: 'google-drive'
        };
        
        // Process via the API endpoint
        try {
            const response = await axios.post('http://localhost:3000/api/process-recording', {
                session,
                serviceAccount: SERVICE_ACCOUNT
            }, {
                timeout: 600000, // 10 minutes
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });
            
            if (response.data.success) {
                console.log('   ✅ Successfully processed');
                if (response.data.data?.standardizedName) {
                    console.log(`   📝 Standardized: ${response.data.data.standardizedName}`);
                }
                return response.data;
            } else {
                console.log('   ⚠️  Processing failed:', response.data.error || 'Unknown error');
                return null;
            }
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                throw new Error('API server is not running. Please run: npm start');
            }
            throw error;
        }
        
    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        return null;
    }
}

async function processRishiAaravRecordings() {
    console.log('🔧 Processing All Rishi & Aarav Recordings');
    console.log('=' .repeat(70));
    
    try {
        const { drive } = await initializeServices();
        
        // Get all recording folders
        console.log('\n📁 Scanning Rishi & Aarav folder...');
        
        const foldersResponse = await drive.files.list({
            q: `'${RISHI_AARAV_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id,name)',
            pageSize: 100,
            orderBy: 'name'
        });
        
        const folders = foldersResponse.data.files || [];
        
        // Filter to only recording folders
        const recordingFolders = folders.filter(folder => 
            folder.name.includes('Coaching_Rishi_Aarav') || 
            (folder.name.includes('GamePlan') && folder.name.includes('Aarav'))
        );
        
        console.log(`\nFound ${recordingFolders.length} recording folders`);
        
        let successCount = 0;
        let errorCount = 0;
        
        // Process each folder
        for (let i = 0; i < recordingFolders.length; i++) {
            const folder = recordingFolders[i];
            console.log(`\n[${i + 1}/${recordingFolders.length}]`);
            
            const result = await processRecordingFolder(drive, folder);
            
            if (result && result.success) {
                successCount++;
            } else {
                errorCount++;
            }
            
            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log('\n' + '=' .repeat(70));
        console.log('📊 Processing Complete!');
        console.log(`✅ Successful: ${successCount}`);
        console.log(`❌ Errors: ${errorCount}`);
        console.log(`📝 Total: ${recordingFolders.length}`);
        
        // Now fix the problematic row
        if (successCount > 0) {
            console.log('\n🔧 Now fixing the problematic Rishi_Rishi row...');
            console.log('This row should be removed as all individual recordings have been processed.');
        }
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        if (error.message.includes('API server is not running')) {
            console.error('\n⚠️  Please make sure the API server is running:');
            console.error('   Run: npm start');
            console.error('   Then try this script again');
        }
    }
}

async function main() {
    console.log('🚀 Starting Rishi & Aarav recordings processing...\n');
    
    try {
        await processRishiAaravRecordings();
    } catch (error) {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    }
}

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });