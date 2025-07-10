#!/usr/bin/env node

/**
 * Comprehensive Recording Verification Script
 * - Scans entire S3-Ivylevel drive recursively to find ALL recordings
 * - Scans Knowledge Base for all _B_ indicator recordings
 * - Compares to ensure nothing is missed
 * - Reports any discrepancies
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');
const fs = require('fs').promises;
const path = require('path');

// S3-Ivylevel root folder ID
const S3_IVYLEVEL_ROOT_ID = '1Dpq3rSZelQJJePkSi7K6xAY4q62xMiFA';
// Knowledge Base Students folder
const KB_STUDENTS_ROOT_ID = '12LgtSd9CpOllNBBycCfxPVFB6Sk9bTIp';

async function initializeDrive() {
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
 * Recursively scan a folder and all its subfolders
 */
async function scanFolderRecursively(drive, folderId, folderPath = '', depth = 0, allItems = { folders: [], files: [] }) {
    try {
        // Get all items in current folder
        let pageToken = null;
        
        do {
            const response = await drive.files.list({
                q: `'${folderId}' in parents and trashed = false`,
                fields: 'nextPageToken, files(id,name,mimeType,size,createdTime,parents)',
                pageSize: 1000,
                pageToken: pageToken
            });
            
            const items = response.data.files || [];
            
            for (const item of items) {
                const itemPath = folderPath ? `${folderPath}/${item.name}` : item.name;
                
                if (item.mimeType === 'application/vnd.google-apps.folder') {
                    // It's a folder
                    allItems.folders.push({
                        id: item.id,
                        name: item.name,
                        path: itemPath,
                        depth: depth,
                        parentId: folderId
                    });
                    
                    // Recursively scan this folder
                    await scanFolderRecursively(drive, item.id, itemPath, depth + 1, allItems);
                } else if (item.mimeType !== 'application/vnd.google-apps.shortcut') {
                    // It's a file (not a shortcut)
                    allItems.files.push({
                        id: item.id,
                        name: item.name,
                        path: itemPath,
                        mimeType: item.mimeType,
                        size: item.size || 0,
                        parentId: folderId,
                        depth: depth
                    });
                }
            }
            
            pageToken = response.data.nextPageToken;
        } while (pageToken);
        
    } catch (error) {
        console.error(`Error scanning folder ${folderId}: ${error.message}`);
    }
    
    return allItems;
}

/**
 * Check if a folder contains recording files
 */
function isRecordingFolder(files, folderId) {
    const folderFiles = files.filter(f => f.parentId === folderId);
    return folderFiles.some(file => {
        const name = file.name.toLowerCase();
        return name.endsWith('.mp4') || name.endsWith('.m4a') || 
               name.endsWith('.vtt') || name.endsWith('.txt') ||
               name.endsWith('.srt');
    });
}

/**
 * Analyze folder name to extract recording info
 */
function analyzeRecordingFolder(folderName) {
    const patterns = [
        // With _B_ indicator (new format)
        /^(Coaching|GamePlan|Onboarding|OfficeHours)_B_(\w+)_(\w+)_Wk(\d+[A-Z]?)_(\d{4}-\d{2}-\d{2})_M_([a-f0-9]+)U_([a-f0-9]+)$/,
        // Without _B_ indicator (old format)
        /^(Coaching|GamePlan|Onboarding|OfficeHours)_(\w+)_(\w+)_Wk(\d+[A-Z]?)_(\d{4}-\d{2}-\d{2})_([a-zA-Z0-9_-]+)$/,
        // Other variations
        /^(Coaching|GamePlan).*?_(\w+).*?_(\w+).*?_Wk(\d+)/
    ];
    
    for (const pattern of patterns) {
        const match = folderName.match(pattern);
        if (match) {
            return {
                type: match[1],
                coach: match[2],
                student: match[3],
                week: match[4],
                hasIndicator: folderName.includes('_B_'),
                originalName: folderName
            };
        }
    }
    
    return null;
}

/**
 * Generate verification report
 */
async function generateReport(s3Recordings, kbRecordings, mismatches) {
    const reportPath = path.join(process.cwd(), 'recording-verification-report.txt');
    
    let report = '='.repeat(80) + '\n';
    report += 'RECORDING VERIFICATION REPORT\n';
    report += `Generated: ${new Date().toISOString()}\n`;
    report += '='.repeat(80) + '\n\n';
    
    // Summary
    report += 'SUMMARY\n';
    report += '-'.repeat(40) + '\n';
    report += `S3-Ivylevel Recordings Found: ${s3Recordings.length}\n`;
    report += `Knowledge Base _B_ Recordings: ${kbRecordings.length}\n`;
    report += `Mismatches/Issues: ${mismatches.length}\n\n`;
    
    // S3 Recordings by Coach
    report += 'S3-IVYLEVEL RECORDINGS BY COACH\n';
    report += '-'.repeat(40) + '\n';
    const s3ByCoach = {};
    s3Recordings.forEach(rec => {
        const info = rec.info;
        if (info) {
            const coach = info.coach || 'Unknown';
            if (!s3ByCoach[coach]) s3ByCoach[coach] = [];
            s3ByCoach[coach].push(rec);
        }
    });
    
    Object.keys(s3ByCoach).sort().forEach(coach => {
        report += `\n${coach}: ${s3ByCoach[coach].length} recordings\n`;
        s3ByCoach[coach].forEach(rec => {
            report += `  - ${rec.folder.name}\n`;
            report += `    Path: ${rec.folder.path}\n`;
            report += `    Has _B_: ${rec.info.hasIndicator ? 'Yes' : 'NO'}\n`;
            report += `    Files: ${rec.files.length}\n`;
        });
    });
    
    // Knowledge Base Recordings
    report += '\n\nKNOWLEDGE BASE _B_ RECORDINGS\n';
    report += '-'.repeat(40) + '\n';
    const kbByStudent = {};
    kbRecordings.forEach(rec => {
        const student = rec.studentFolder || 'Unknown';
        if (!kbByStudent[student]) kbByStudent[student] = [];
        kbByStudent[student].push(rec);
    });
    
    Object.keys(kbByStudent).sort().forEach(student => {
        report += `\n${student}: ${kbByStudent[student].length} recordings\n`;
        kbByStudent[student].forEach(rec => {
            report += `  - ${rec.name}\n`;
        });
    });
    
    // Mismatches
    if (mismatches.length > 0) {
        report += '\n\nISSUES AND MISMATCHES\n';
        report += '-'.repeat(40) + '\n';
        mismatches.forEach((issue, idx) => {
            report += `\n${idx + 1}. ${issue.type}\n`;
            report += `   Recording: ${issue.recording}\n`;
            report += `   Path: ${issue.path}\n`;
            report += `   Issue: ${issue.issue}\n`;
        });
    }
    
    // Detailed file mapping
    report += '\n\nDETAILED FILE MAPPING\n';
    report += '-'.repeat(40) + '\n';
    s3Recordings.forEach(rec => {
        report += `\nRecording: ${rec.folder.name}\n`;
        report += `Files (${rec.files.length}):\n`;
        rec.files.forEach(file => {
            report += `  - ${file.name} (${file.mimeType}, ${file.size} bytes)\n`;
        });
    });
    
    await fs.writeFile(reportPath, report);
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    
    return report;
}

async function main() {
    console.log('🔍 Comprehensive Recording Verification Script');
    console.log('=' .repeat(60));
    
    try {
        const drive = await initializeDrive();
        
        // Step 1: Scan S3-Ivylevel recursively
        console.log('\n📁 Scanning S3-Ivylevel drive recursively...');
        console.log('This may take a few minutes...\n');
        
        const s3Items = await scanFolderRecursively(drive, S3_IVYLEVEL_ROOT_ID);
        console.log(`✅ Found ${s3Items.folders.length} folders and ${s3Items.files.length} files`);
        
        // Identify recording folders
        const s3Recordings = [];
        for (const folder of s3Items.folders) {
            if (isRecordingFolder(s3Items.files, folder.id)) {
                const folderFiles = s3Items.files.filter(f => f.parentId === folder.id);
                const info = analyzeRecordingFolder(folder.name);
                s3Recordings.push({
                    folder,
                    files: folderFiles,
                    info
                });
            }
        }
        
        console.log(`\n📹 Identified ${s3Recordings.length} recording folders in S3-Ivylevel`);
        
        // Step 2: Scan Knowledge Base for _B_ recordings
        console.log('\n📁 Scanning Knowledge Base for _B_ recordings...');
        const kbItems = await scanFolderRecursively(drive, KB_STUDENTS_ROOT_ID);
        
        // Find all _B_ recordings
        const kbRecordings = kbItems.folders.filter(folder => 
            folder.name.includes('_B_') && 
            (folder.name.includes('Coaching') || folder.name.includes('GamePlan') || 
             folder.name.includes('Onboarding') || folder.name.includes('OfficeHours'))
        );
        
        console.log(`✅ Found ${kbRecordings.length} _B_ recordings in Knowledge Base`);
        
        // Step 3: Compare and find mismatches
        console.log('\n🔄 Comparing recordings...');
        const mismatches = [];
        
        // Check S3 recordings without _B_ indicator
        const s3WithoutIndicator = s3Recordings.filter(rec => rec.info && !rec.info.hasIndicator);
        if (s3WithoutIndicator.length > 0) {
            console.log(`\n⚠️  Found ${s3WithoutIndicator.length} recordings without _B_ indicator in S3-Ivylevel:`);
            s3WithoutIndicator.forEach(rec => {
                console.log(`  - ${rec.folder.name}`);
                mismatches.push({
                    type: 'Missing _B_ Indicator',
                    recording: rec.folder.name,
                    path: rec.folder.path,
                    issue: 'Recording exists in S3 but lacks _B_ indicator'
                });
            });
        }
        
        // Check for recordings in S3 but not in Knowledge Base
        const s3RecordingNames = s3Recordings.map(r => {
            if (r.info) {
                return `${r.info.coach}_${r.info.student}`;
            }
            return r.folder.name;
        });
        
        // Group by coach/student pairs
        const coachStudentPairs = {};
        s3Recordings.forEach(rec => {
            if (rec.info && rec.info.coach && rec.info.student) {
                const key = `${rec.info.coach}_${rec.info.student}`;
                if (!coachStudentPairs[key]) {
                    coachStudentPairs[key] = {
                        s3Count: 0,
                        kbCount: 0,
                        s3Recordings: [],
                        kbRecordings: []
                    };
                }
                coachStudentPairs[key].s3Count++;
                coachStudentPairs[key].s3Recordings.push(rec);
            }
        });
        
        // Count KB recordings by coach/student
        kbRecordings.forEach(rec => {
            const info = analyzeRecordingFolder(rec.name);
            if (info && info.coach && info.student) {
                const key = `${info.coach}_${info.student}`;
                if (!coachStudentPairs[key]) {
                    coachStudentPairs[key] = {
                        s3Count: 0,
                        kbCount: 0,
                        s3Recordings: [],
                        kbRecordings: []
                    };
                }
                coachStudentPairs[key].kbCount++;
                coachStudentPairs[key].kbRecordings.push(rec);
            }
        });
        
        // Report discrepancies
        console.log('\n📊 Coach/Student Pair Analysis:');
        Object.keys(coachStudentPairs).sort().forEach(pair => {
            const data = coachStudentPairs[pair];
            console.log(`\n${pair}:`);
            console.log(`  S3 Recordings: ${data.s3Count}`);
            console.log(`  KB Recordings: ${data.kbCount}`);
            
            if (data.s3Count !== data.kbCount) {
                console.log(`  ⚠️  MISMATCH: ${Math.abs(data.s3Count - data.kbCount)} difference`);
                mismatches.push({
                    type: 'Count Mismatch',
                    recording: pair,
                    path: 'Multiple',
                    issue: `S3 has ${data.s3Count} recordings, KB has ${data.kbCount}`
                });
            }
        });
        
        // Generate detailed report
        const report = await generateReport(s3Recordings, kbRecordings, mismatches);
        
        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('VERIFICATION SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total S3-Ivylevel Recordings: ${s3Recordings.length}`);
        console.log(`Total Knowledge Base _B_ Recordings: ${kbRecordings.length}`);
        console.log(`Issues Found: ${mismatches.length}`);
        
        if (mismatches.length === 0) {
            console.log('\n✅ All recordings appear to be properly processed!');
        } else {
            console.log('\n⚠️  Issues found - see report for details');
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error);
    }
}

console.log('🚀 Starting verification...\n');

main()
    .then(() => {
        console.log('\n✅ Verification completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Verification failed:', error);
        process.exit(1);
    });