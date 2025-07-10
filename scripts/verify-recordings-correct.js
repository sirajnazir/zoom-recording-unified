#!/usr/bin/env node

/**
 * Correct Recording Verification Script
 * - S3-Ivylevel = SOURCE (unprocessed) - should NOT have _B_ indicators
 * - Knowledge Base = PROCESSED - should have _B_ indicators
 * - Verifies that all S3 recordings have been processed to Knowledge Base
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');
const fs = require('fs').promises;
const path = require('path');

// S3-Ivylevel root folder ID (SOURCE)
const S3_IVYLEVEL_ROOT_ID = '1Dpq3rSZelQJJePkSi7K6xAY4q62xMiFA';
// Knowledge Base Students folder (PROCESSED)
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
 * Extract metadata from recording folder name
 */
function extractMetadata(folderName) {
    // Remove _B_ indicator if present (for comparison)
    const cleanName = folderName.replace(/_B_/, '_');
    
    // Try to extract coach and student names
    const patterns = [
        /^(Coaching|GamePlan|Onboarding|OfficeHours)_(\w+)_(\w+)_/,
        /(\w+)\s*[&-]\s*(\w+)/
    ];
    
    for (const pattern of patterns) {
        const match = cleanName.match(pattern);
        if (match) {
            return {
                type: match[1] || 'Coaching',
                coach: match[2] || match[1],
                student: match[3] || match[2],
                originalName: folderName,
                cleanName: cleanName
            };
        }
    }
    
    return {
        type: 'Unknown',
        coach: 'Unknown',
        student: 'Unknown',
        originalName: folderName,
        cleanName: cleanName
    };
}

/**
 * Compare S3 (source) with KB (processed) recordings
 */
function compareRecordings(s3Items, kbItems) {
    const results = {
        s3RecordingFolders: [],
        kbRecordingFolders: [],
        processedRecordings: [],
        unprocessedRecordings: [],
        stats: {
            totalS3Recordings: 0,
            totalKBRecordings: 0,
            processedCount: 0,
            unprocessedCount: 0
        }
    };
    
    // Identify S3 recording folders
    for (const folder of s3Items.folders) {
        if (isRecordingFolder(s3Items.files, folder.id)) {
            results.s3RecordingFolders.push(folder);
            results.stats.totalS3Recordings++;
        }
    }
    
    // Identify KB recording folders (with _B_ indicator)
    for (const folder of kbItems.folders) {
        if (folder.name.includes('_B_') && 
            (folder.name.includes('Coaching') || folder.name.includes('GamePlan') || 
             folder.name.includes('Onboarding') || folder.name.includes('OfficeHours'))) {
            results.kbRecordingFolders.push(folder);
            results.stats.totalKBRecordings++;
        }
    }
    
    // Build lookup maps
    const kbByMetadata = new Map();
    for (const kbFolder of results.kbRecordingFolders) {
        const metadata = extractMetadata(kbFolder.name);
        const key = `${metadata.coach}_${metadata.student}`;
        if (!kbByMetadata.has(key)) {
            kbByMetadata.set(key, []);
        }
        kbByMetadata.get(key).push({ folder: kbFolder, metadata });
    }
    
    // Check each S3 recording
    for (const s3Folder of results.s3RecordingFolders) {
        const metadata = extractMetadata(s3Folder.name);
        const key = `${metadata.coach}_${metadata.student}`;
        
        const kbMatches = kbByMetadata.get(key) || [];
        
        if (kbMatches.length > 0) {
            // This S3 recording has been processed
            results.processedRecordings.push({
                s3Folder: s3Folder,
                kbMatches: kbMatches,
                metadata: metadata
            });
            results.stats.processedCount++;
        } else {
            // This S3 recording has NOT been processed
            results.unprocessedRecordings.push({
                s3Folder: s3Folder,
                metadata: metadata
            });
            results.stats.unprocessedCount++;
        }
    }
    
    return results;
}

/**
 * Generate verification report
 */
async function generateReport(results) {
    const timestamp = new Date().toISOString();
    const reportPath = path.join(process.cwd(), 'recording-verification-report-correct.txt');
    
    let report = '='.repeat(80) + '\n';
    report += 'RECORDING VERIFICATION REPORT (CORRECTED)\n';
    report += `Generated: ${timestamp}\n`;
    report += '='.repeat(80) + '\n\n';
    
    report += 'UNDERSTANDING:\n';
    report += '- S3-Ivylevel = SOURCE repository (should NOT have _B_ indicators)\n';
    report += '- Knowledge Base = PROCESSED repository (should have _B_ indicators)\n';
    report += '- Goal: Verify all S3 recordings have been processed to Knowledge Base\n\n';
    
    report += 'SUMMARY\n';
    report += '-'.repeat(40) + '\n';
    report += `Total S3 Recording Folders: ${results.stats.totalS3Recordings}\n`;
    report += `Total KB Recording Folders: ${results.stats.totalKBRecordings}\n`;
    report += `Processed S3 Recordings: ${results.stats.processedCount}\n`;
    report += `Unprocessed S3 Recordings: ${results.stats.unprocessedCount}\n`;
    report += `Processing Rate: ${((results.stats.processedCount / results.stats.totalS3Recordings) * 100).toFixed(1)}%\n\n`;
    
    if (results.unprocessedRecordings.length > 0) {
        report += 'UNPROCESSED RECORDINGS (Need Processing)\n';
        report += '-'.repeat(40) + '\n';
        
        // Group by coach
        const byCoach = {};
        results.unprocessedRecordings.forEach(rec => {
            const coach = rec.metadata.coach;
            if (!byCoach[coach]) byCoach[coach] = [];
            byCoach[coach].push(rec);
        });
        
        Object.keys(byCoach).sort().forEach(coach => {
            report += `\n${coach} (${byCoach[coach].length} recordings):\n`;
            byCoach[coach].forEach(rec => {
                report += `  - ${rec.s3Folder.name}\n`;
                report += `    Path: ${rec.s3Folder.path}\n`;
            });
        });
    }
    
    await fs.writeFile(reportPath, report);
    console.log(`\n📄 Report saved to: ${reportPath}`);
    
    return report;
}

async function main() {
    console.log('🔍 Correct Recording Verification Script');
    console.log('=' .repeat(60));
    console.log('Verifying that S3 recordings have been processed to Knowledge Base\n');
    
    try {
        const drive = await initializeDrive();
        
        // Step 1: Scan S3-Ivylevel (SOURCE)
        console.log('📁 Scanning S3-Ivylevel (source repository)...');
        const s3Items = await scanFolderRecursively(drive, S3_IVYLEVEL_ROOT_ID);
        console.log(`✅ Found ${s3Items.folders.length} folders and ${s3Items.files.length} files`);
        
        // Step 2: Scan Knowledge Base (PROCESSED)
        console.log('\n📁 Scanning Knowledge Base (processed repository)...');
        const kbItems = await scanFolderRecursively(drive, KB_STUDENTS_ROOT_ID);
        console.log(`✅ Found ${kbItems.folders.length} folders and ${kbItems.files.length} files`);
        
        // Step 3: Compare
        console.log('\n🔄 Comparing recordings...');
        const results = compareRecordings(s3Items, kbItems);
        
        // Display results
        console.log('\n' + '='.repeat(60));
        console.log('📊 VERIFICATION RESULTS');
        console.log('='.repeat(60));
        console.log(`\nS3 Recording Folders (source): ${results.stats.totalS3Recordings}`);
        console.log(`KB Recording Folders (processed): ${results.stats.totalKBRecordings}`);
        console.log(`\n✅ Processed: ${results.stats.processedCount} (${((results.stats.processedCount / results.stats.totalS3Recordings) * 100).toFixed(1)}%)`);
        console.log(`❌ Unprocessed: ${results.stats.unprocessedCount} (${((results.stats.unprocessedCount / results.stats.totalS3Recordings) * 100).toFixed(1)}%)`);
        
        if (results.unprocessedRecordings.length > 0) {
            console.log('\n⚠️  Unprocessed recordings found!');
            console.log('These S3 recordings have not been processed to Knowledge Base:');
            
            // Show sample
            const sample = results.unprocessedRecordings.slice(0, 5);
            sample.forEach(rec => {
                console.log(`  - ${rec.s3Folder.name}`);
            });
            
            if (results.unprocessedRecordings.length > 5) {
                console.log(`  ... and ${results.unprocessedRecordings.length - 5} more`);
            }
            
            console.log('\n💡 To process these recordings, run:');
            console.log('   node scripts/process-all-recordings-force.js');
        } else {
            console.log('\n✅ All S3 recordings have been processed to Knowledge Base!');
        }
        
        // Generate report
        await generateReport(results);
        
    } catch (error) {
        console.error('\n❌ Error:', error);
    }
}

console.log('🚀 Starting correct verification...\n');

main()
    .then(() => {
        console.log('\n✅ Verification completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Verification failed:', error);
        process.exit(1);
    });