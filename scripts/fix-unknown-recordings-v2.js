#!/usr/bin/env node

/**
 * Fix Unknown Recordings V2
 * Better extraction of coach/student from folder paths
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

// Knowledge Base Students folder ID
const STUDENTS_FOLDER_ID = config.google.drive.organizedRecordingsFolder || '12LgtSd9CpOllNBBycCfxPVFB6Sk9bTIp';

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
        console.error('Error getting folder path:', error.message);
    }
    
    return path;
}

/**
 * Enhanced extraction of coach and student from folder path
 */
function extractFromPath(folderPath) {
    const result = { coach: null, student: null, date: null };
    
    // Find coach from "Coach Name" folder
    for (const folder of folderPath) {
        if (folder.toLowerCase().startsWith('coach ')) {
            const coachMatch = folder.match(/Coach\s+([A-Za-z]+)/i);
            if (coachMatch) {
                result.coach = coachMatch[1];
                break;
            }
        }
    }
    
    // Now extract student from various patterns
    const lastFolder = folderPath[folderPath.length - 1];
    
    // Pattern 1: "Re: Student/..."
    const reMatch = lastFolder.match(/Re:\s*([A-Za-z]+)\s*\//i);
    if (reMatch) {
        result.student = reMatch[1];
    }
    
    // Pattern 2: "Coach Name & Student" in path
    for (const folder of folderPath) {
        if (folder.includes('&')) {
            const andMatch = folder.match(/(?:Coach\s+)?[A-Za-z]+\s*&\s*([A-Za-z]+)/i);
            if (andMatch) {
                result.student = andMatch[1];
                break;
            }
        }
    }
    
    // Pattern 3: Look for student name in "Coach X & Student" pattern
    if (!result.student && result.coach) {
        for (const folder of folderPath) {
            if (folder.includes(result.coach) && folder.includes('&')) {
                const parts = folder.split('&');
                if (parts.length === 2) {
                    const potentialStudent = parts[1].trim().split(/\s+/)[0];
                    if (/^[A-Z][a-z]+/.test(potentialStudent)) {
                        result.student = potentialStudent;
                        break;
                    }
                }
            }
        }
    }
    
    // Pattern 4: Student's name in title like "Student Practice Test..."
    if (!result.student) {
        const nameMatch = lastFolder.match(/^\s*([A-Z][a-z]+)(?:'s|s)?\s+(?:Practice|Test|Session)/i);
        if (nameMatch) {
            result.student = nameMatch[1];
        }
    }
    
    // Extract date
    const dateMatch = lastFolder.match(/([A-Za-z]+\s+\d{1,2},?\s+(?:20)?\d{2})/);
    if (dateMatch) {
        result.date = dateMatch[1];
    }
    
    return result;
}

/**
 * List all unknown folders and show extracted info
 */
async function analyzeUnknownFolders(drive) {
    console.log('🔍 Analyzing unknown folders in Knowledge Base/Students...\n');
    
    // Find all unknown folders
    const response = await drive.files.list({
        q: `'${STUDENTS_FOLDER_ID}' in parents and name contains 'unknown' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 100
    });
    
    const folders = response.data.files || [];
    console.log(`Found ${folders.length} unknown folders\n`);
    
    const results = [];
    
    for (const folder of folders) {
        // Get session ID from folder name
        const sessionMatch = folder.name.match(/([a-f0-9]{16})U_[a-f0-9]{16}$/);
        if (!sessionMatch) continue;
        
        const sessionId = sessionMatch[1];
        
        // Get source folder by tracing shortcuts
        const filesResponse = await drive.files.list({
            q: `'${folder.id}' in parents and mimeType = 'application/vnd.google-apps.shortcut'`,
            fields: 'files(id, shortcutDetails)',
            pageSize: 1
        });
        
        if (!filesResponse.data.files || filesResponse.data.files.length === 0) continue;
        
        const shortcut = filesResponse.data.files[0];
        if (!shortcut.shortcutDetails) continue;
        
        // Get target file's parent
        const targetResponse = await drive.files.get({
            fileId: shortcut.shortcutDetails.targetId,
            fields: 'parents'
        });
        
        if (!targetResponse.data.parents) continue;
        
        // Get source folder path
        const sourcePath = await getFolderPath(drive, targetResponse.data.parents[0]);
        const extracted = extractFromPath(sourcePath);
        
        results.push({
            folderId: folder.id,
            folderName: folder.name,
            sessionId: sessionId,
            sourcePath: sourcePath.join(' / '),
            coach: extracted.coach,
            student: extracted.student,
            date: extracted.date
        });
    }
    
    // Display results
    console.log('📊 ANALYSIS RESULTS');
    console.log('=' .repeat(70));
    
    results.forEach((result, index) => {
        console.log(`\n[${index + 1}] ${result.folderName}`);
        console.log(`    Path: ${result.sourcePath}`);
        console.log(`    Coach: ${result.coach || 'UNKNOWN'}`);
        console.log(`    Student: ${result.student || 'UNKNOWN'}`);
        console.log(`    Date: ${result.date || 'N/A'}`);
        console.log(`    Session ID: ${result.sessionId}`);
    });
    
    // Summary
    const withBoth = results.filter(r => r.coach && r.student).length;
    const coachOnly = results.filter(r => r.coach && !r.student).length;
    const studentOnly = results.filter(r => !r.coach && r.student).length;
    const neither = results.filter(r => !r.coach && !r.student).length;
    
    console.log('\n' + '=' .repeat(70));
    console.log('📊 EXTRACTION SUMMARY');
    console.log(`✅ Both coach & student: ${withBoth}`);
    console.log(`⚠️  Coach only: ${coachOnly}`);
    console.log(`⚠️  Student only: ${studentOnly}`);
    console.log(`❌ Neither: ${neither}`);
    
    // Save results
    const fs = require('fs').promises;
    await fs.writeFile(
        'unknown-folders-analysis.json',
        JSON.stringify(results, null, 2)
    );
    console.log('\n💾 Analysis saved to: unknown-folders-analysis.json');
    
    return results;
}

async function main() {
    console.log('🔧 Analyzing Unknown Recordings (V2)');
    console.log('=' .repeat(70));
    
    try {
        const drive = await initializeGoogleDrive();
        const results = await analyzeUnknownFolders(drive);
        
        console.log('\n✅ Analysis complete!');
        console.log('\nNext steps:');
        console.log('1. Review the analysis to ensure coach/student extraction is correct');
        console.log('2. Run the fix script to update sheets and move folders');
        
    } catch (error) {
        console.error('\n❌ Error:', error);
    }
}

console.log('🚀 Starting analysis...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });