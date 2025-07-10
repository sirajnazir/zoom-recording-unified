#!/usr/bin/env node

/**
 * Find recordings by date from the original console output
 * This helps identify the source folders for the unknown recordings
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

// S3-Ivylevel root folder ID
const S3_IVYLEVEL_ROOT_ID = '1Dpq3rSZelQJJePkSi7K6xAY4q62xMiFA';

// From the unknown recordings, we know one was from May 9, 2024
// Let's search for recordings from specific date ranges
const dateRanges = [
    { start: '2024-05-01', end: '2024-05-31', description: 'May 2024' },
    { start: '2024-06-01', end: '2024-06-30', description: 'June 2024' },
    { start: '2024-07-01', end: '2024-07-31', description: 'July 2024' }
];

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
 * Search for recordings in a date range
 */
async function findRecordingsByDateRange(drive, startDate, endDate) {
    const recordings = [];
    
    // Search for files created in date range
    const query = `mimeType = 'application/vnd.google-apps.folder' and ` +
                 `createdTime >= '${startDate}T00:00:00' and ` +
                 `createdTime <= '${endDate}T23:59:59' and ` +
                 `trashed = false`;
    
    try {
        let pageToken = null;
        do {
            const response = await drive.files.list({
                q: query,
                fields: 'nextPageToken, files(id, name, parents, createdTime)',
                pageSize: 100,
                pageToken: pageToken
            });
            
            if (response.data.files) {
                recordings.push(...response.data.files);
            }
            
            pageToken = response.data.nextPageToken;
        } while (pageToken);
        
    } catch (error) {
        console.error(`Error searching date range ${startDate} to ${endDate}:`, error.message);
    }
    
    return recordings;
}

/**
 * Get folder path
 */
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
        // Ignore errors
    }
    
    return path;
}

/**
 * Check if folder contains recording files
 */
async function isRecordingFolder(drive, folderId) {
    try {
        const response = await drive.files.list({
            q: `'${folderId}' in parents and (name contains '.mp4' or name contains '.m4a' or name contains '.vtt')`,
            fields: 'files(id)',
            pageSize: 1
        });
        
        return response.data.files && response.data.files.length > 0;
    } catch (error) {
        return false;
    }
}

async function main() {
    console.log('🔍 Finding Recordings by Date');
    console.log('   (To identify source of unknown recordings)');
    console.log('=' .repeat(70));
    
    try {
        const drive = await initializeGoogleDrive();
        
        for (const range of dateRanges) {
            console.log(`\n📅 Searching ${range.description} (${range.start} to ${range.end})...`);
            
            const folders = await findRecordingsByDateRange(drive, range.start, range.end);
            console.log(`   Found ${folders.length} folders created in this period`);
            
            // Filter to recording folders in S3-Ivylevel
            const recordingFolders = [];
            
            for (const folder of folders) {
                const path = await getFolderPath(drive, folder.id);
                
                // Check if in S3-Ivylevel hierarchy and is a recording folder
                if (path.some(p => p.includes('S3-Ivylevel') || p.includes('S3_Ivylevel'))) {
                    if (await isRecordingFolder(drive, folder.id)) {
                        recordingFolders.push({
                            id: folder.id,
                            name: folder.name,
                            createdTime: folder.createdTime,
                            path: path.join(' / ')
                        });
                    }
                }
            }
            
            if (recordingFolders.length > 0) {
                console.log(`\n   📁 Recording folders in S3-Ivylevel:`);
                recordingFolders.forEach((folder, index) => {
                    console.log(`\n   ${index + 1}. ${folder.name}`);
                    console.log(`      Created: ${new Date(folder.createdTime).toLocaleDateString()}`);
                    console.log(`      Path: ${folder.path}`);
                    console.log(`      ID: ${folder.id}`);
                    
                    // Flag potential problematic names
                    if (folder.name.includes('Re:') || 
                        folder.name.includes('Fwd:') || 
                        folder.name.includes('Meeting') ||
                        folder.name.includes('with') ||
                        folder.name.includes('-') ||
                        !folder.name.match(/^(Coaching|GamePlan|SAT)_/)) {
                        console.log(`      ⚠️  NON-STANDARD NAME - Likely to become "unknown"`);
                    }
                });
            }
        }
        
        console.log('\n' + '=' .repeat(70));
        console.log('✅ Search complete!');
        console.log('\nLook for folders marked with ⚠️ - these are likely the source of unknown recordings');
        
    } catch (error) {
        console.error('\n❌ Error:', error);
    }
}

console.log('🚀 Starting recording search by date...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });