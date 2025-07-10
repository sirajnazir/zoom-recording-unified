#!/usr/bin/env node

/**
 * List ALL recordings in S3-Ivylevel to identify the 20 unknown ones
 * Shows only those with non-standard naming patterns
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

// S3-Ivylevel root folder ID
const S3_IVYLEVEL_ROOT_ID = '1Dpq3rSZelQJJePkSi7K6xAY4q62xMiFA';

async function initializeGoogleDrive() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: config.google.clientEmail,
            private_key: config.google.privateKey
        },
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });
    
    return google.drive({ version: 'v3', auth });
}

/**
 * Check if folder name follows standard pattern
 */
function isStandardName(name) {
    // Standard patterns
    const standardPatterns = [
        /^(Coaching|GamePlan|SAT|MISC|TRIVIAL)_[^_]+_[^_]+_Wk\d+[A-Z]?_\d{4}-\d{2}-\d{2}/,
        /^\d{4}-\d{2}-\d{2}_[^-]+-[^_]+_Week\d+/
    ];
    
    return standardPatterns.some(pattern => pattern.test(name));
}

/**
 * Recursively scan for recording folders
 */
async function scanForRecordings(drive, folderId, path = [], depth = 0) {
    if (depth > 5) return [];
    
    const recordings = [];
    
    try {
        // Get all items in this folder
        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType)',
            pageSize: 1000
        });
        
        const items = response.data.files || [];
        
        // Check if this folder contains recording files
        const hasRecordingFiles = items.some(item => 
            item.name.toLowerCase().endsWith('.mp4') ||
            item.name.toLowerCase().endsWith('.m4a') ||
            item.name.toLowerCase().endsWith('.vtt') ||
            item.name.toLowerCase().endsWith('.txt')
        );
        
        if (hasRecordingFiles) {
            // This is a recording folder
            const folderName = path[path.length - 1] || 'Root';
            if (!isStandardName(folderName)) {
                recordings.push({
                    id: folderId,
                    name: folderName,
                    path: path.join(' / '),
                    fileCount: items.filter(i => i.mimeType !== 'application/vnd.google-apps.folder').length
                });
            }
        } else {
            // Check subfolders
            const subfolders = items.filter(item => item.mimeType === 'application/vnd.google-apps.folder');
            
            for (const subfolder of subfolders) {
                const subRecordings = await scanForRecordings(
                    drive, 
                    subfolder.id, 
                    [...path, subfolder.name], 
                    depth + 1
                );
                recordings.push(...subRecordings);
            }
        }
    } catch (error) {
        console.error(`Error scanning ${folderId}:`, error.message);
    }
    
    return recordings;
}

async function main() {
    console.log('🔍 Scanning S3-Ivylevel for Non-Standard Recording Names');
    console.log('=' .repeat(70));
    
    try {
        const drive = await initializeGoogleDrive();
        
        // First, get the S3-Ivylevel folder structure
        const rootResponse = await drive.files.get({
            fileId: S3_IVYLEVEL_ROOT_ID,
            fields: 'name'
        });
        
        console.log(`\n📁 Root folder: ${rootResponse.data.name}`);
        console.log('🔄 Scanning for recordings with non-standard names...\n');
        
        // Get coach folders
        const coachFoldersResponse = await drive.files.list({
            q: `'${S3_IVYLEVEL_ROOT_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)',
            orderBy: 'name'
        });
        
        const coachFolders = coachFoldersResponse.data.files || [];
        console.log(`Found ${coachFolders.length} coach folders\n`);
        
        const allNonStandardRecordings = [];
        
        // Scan each coach folder
        for (const coachFolder of coachFolders) {
            console.log(`📂 Scanning ${coachFolder.name}...`);
            
            const recordings = await scanForRecordings(
                drive, 
                coachFolder.id, 
                [rootResponse.data.name, coachFolder.name], 
                0
            );
            
            if (recordings.length > 0) {
                console.log(`   ⚠️ Found ${recordings.length} non-standard recordings`);
                allNonStandardRecordings.push(...recordings);
            } else {
                console.log(`   ✅ All recordings follow standard naming`);
            }
        }
        
        // Display all non-standard recordings
        console.log('\n' + '=' .repeat(70));
        console.log(`📊 FOUND ${allNonStandardRecordings.length} NON-STANDARD RECORDINGS`);
        console.log('=' .repeat(70));
        
        if (allNonStandardRecordings.length > 0) {
            console.log('\nThese are likely the source of your unknown recordings:\n');
            
            allNonStandardRecordings.forEach((recording, index) => {
                console.log(`${index + 1}. ${recording.name}`);
                console.log(`   Path: ${recording.path}`);
                console.log(`   Files: ${recording.fileCount}`);
                console.log(`   ID: ${recording.id}`);
                console.log('');
            });
            
            // Save to file for processing
            const fs = require('fs').promises;
            await fs.writeFile(
                'non-standard-recordings.json',
                JSON.stringify(allNonStandardRecordings, null, 2)
            );
            console.log('💾 List saved to: non-standard-recordings.json');
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error);
    }
}

console.log('🚀 Starting S3-Ivylevel scan...\n');

main()
    .then(() => {
        console.log('\n✅ Scan completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });