#!/usr/bin/env node

/**
 * Meticulous Recording Verification Script
 * - Performs exhaustive scan of S3-Ivylevel drive
 * - Compares every file with Knowledge Base
 * - Generates comprehensive mismatch report
 * - Ensures NOTHING is missed
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

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
 * Deep recursive scan with file-level tracking
 */
async function deepScanFolder(drive, folderId, folderPath = '', depth = 0, results = {
    folders: new Map(),
    files: new Map(),
    recordings: new Map()
}) {
    try {
        // Get ALL items in current folder
        let pageToken = null;
        
        do {
            const response = await drive.files.list({
                q: `'${folderId}' in parents and trashed = false`,
                fields: 'nextPageToken, files(id,name,mimeType,size,createdTime,modifiedTime,parents)',
                pageSize: 1000,
                pageToken: pageToken
            });
            
            const items = response.data.files || [];
            
            for (const item of items) {
                const itemPath = folderPath ? `${folderPath}/${item.name}` : item.name;
                
                if (item.mimeType === 'application/vnd.google-apps.folder') {
                    // It's a folder
                    const folderInfo = {
                        id: item.id,
                        name: item.name,
                        path: itemPath,
                        depth: depth,
                        parentId: folderId,
                        createdTime: item.createdTime,
                        modifiedTime: item.modifiedTime,
                        files: []
                    };
                    
                    results.folders.set(item.id, folderInfo);
                    
                    // Check if this is a recording folder
                    if (isRecordingFolderName(item.name)) {
                        results.recordings.set(item.id, folderInfo);
                    }
                    
                    // Recursively scan subfolder
                    await deepScanFolder(drive, item.id, itemPath, depth + 1, results);
                    
                } else if (item.mimeType !== 'application/vnd.google-apps.shortcut') {
                    // It's a file (not a shortcut)
                    const fileInfo = {
                        id: item.id,
                        name: item.name,
                        path: itemPath,
                        mimeType: item.mimeType,
                        size: item.size || 0,
                        parentId: folderId,
                        depth: depth,
                        createdTime: item.createdTime,
                        modifiedTime: item.modifiedTime
                    };
                    
                    results.files.set(item.id, fileInfo);
                    
                    // Associate file with parent folder
                    const parentFolder = results.folders.get(folderId);
                    if (parentFolder) {
                        parentFolder.files.push(fileInfo);
                    }
                }
            }
            
            pageToken = response.data.nextPageToken;
        } while (pageToken);
        
    } catch (error) {
        console.error(`Error scanning folder ${folderId} at ${folderPath}: ${error.message}`);
    }
    
    return results;
}

/**
 * Check if folder name indicates a recording
 */
function isRecordingFolderName(name) {
    // Check for recording patterns
    const patterns = [
        /^(Coaching|GamePlan|Onboarding|OfficeHours)/i,
        /\d{4}-\d{2}-\d{2}/,  // Date pattern
        /_Wk\d+/i,            // Week pattern
        /[a-f0-9]{16}/        // UUID pattern
    ];
    
    // Must match at least 2 patterns to be considered a recording
    let matches = 0;
    for (const pattern of patterns) {
        if (pattern.test(name)) matches++;
    }
    
    return matches >= 2;
}

/**
 * Check if folder contains recording files
 */
function hasRecordingFiles(folder) {
    if (!folder.files || folder.files.length === 0) return false;
    
    return folder.files.some(file => {
        const name = file.name.toLowerCase();
        return name.endsWith('.mp4') || name.endsWith('.m4a') || 
               name.endsWith('.vtt') || name.endsWith('.txt') ||
               name.endsWith('.srt') || name.includes('transcript');
    });
}

/**
 * Extract recording metadata from folder name
 */
function extractRecordingMetadata(folderName) {
    const patterns = [
        // With _B_ indicator (new format)
        /^(Coaching|GamePlan|Onboarding|OfficeHours)_B_(\w+)_(\w+)_Wk(\d+[A-Z]?)_(\d{4}-\d{2}-\d{2})_M_([a-f0-9]+)U_([a-f0-9]+)$/,
        // Without _B_ indicator (old format) 
        /^(Coaching|GamePlan|Onboarding|OfficeHours)_(\w+)_(\w+)_Wk(\d+[A-Z]?)_(\d{4}-\d{2}-\d{2})_([a-zA-Z0-9_-]+)$/,
        // Flexible patterns
        /^(Coaching|GamePlan).*?[_\s]+(\w+).*?[_\s]+(\w+).*?Wk(\d+)/i,
        // Very flexible
        /(\w+)\s*&\s*(\w+)/
    ];
    
    for (const pattern of patterns) {
        const match = folderName.match(pattern);
        if (match) {
            return {
                type: match[1] || 'Unknown',
                coach: match[2] || 'Unknown',
                student: match[3] || match[2] || 'Unknown',
                week: match[4] || 'Unknown',
                hasIndicator: folderName.includes('_B_'),
                originalName: folderName,
                pattern: pattern.source
            };
        }
    }
    
    // Try to extract names from folder
    const nameMatch = folderName.match(/(\w+)\s*[&-]\s*(\w+)/);
    if (nameMatch) {
        return {
            type: 'Unknown',
            coach: nameMatch[1],
            student: nameMatch[2],
            week: 'Unknown',
            hasIndicator: folderName.includes('_B_'),
            originalName: folderName,
            pattern: 'name-extraction'
        };
    }
    
    return null;
}

/**
 * Generate file hash for comparison
 */
function generateFileHash(files) {
    const fileData = files
        .map(f => `${f.name}:${f.size}:${f.mimeType}`)
        .sort()
        .join('|');
    return crypto.createHash('md5').update(fileData).digest('hex');
}

/**
 * Compare S3 and KB recordings
 */
function compareRecordings(s3Data, kbData) {
    const comparison = {
        matched: [],
        s3Only: [],
        kbOnly: [],
        mismatches: [],
        duplicates: [],
        issues: []
    };
    
    // Create maps for easier lookup
    const s3ByHash = new Map();
    const kbByHash = new Map();
    const s3ByMetadata = new Map();
    const kbByMetadata = new Map();
    
    // Process S3 recordings
    for (const [folderId, folder] of s3Data.recordings) {
        if (hasRecordingFiles(folder)) {
            const metadata = extractRecordingMetadata(folder.name);
            const fileHash = generateFileHash(folder.files);
            
            // Store by hash
            if (!s3ByHash.has(fileHash)) {
                s3ByHash.set(fileHash, []);
            }
            s3ByHash.get(fileHash).push({ folder, metadata });
            
            // Store by metadata key
            if (metadata) {
                const key = `${metadata.coach}_${metadata.student}_${metadata.week}`;
                if (!s3ByMetadata.has(key)) {
                    s3ByMetadata.set(key, []);
                }
                s3ByMetadata.get(key).push({ folder, metadata, fileHash });
            }
        }
    }
    
    // Process KB recordings
    for (const [folderId, folder] of kbData.recordings) {
        const metadata = extractRecordingMetadata(folder.name);
        if (metadata && metadata.hasIndicator) {
            const fileHash = generateFileHash(folder.files);
            
            // Store by hash
            if (!kbByHash.has(fileHash)) {
                kbByHash.set(fileHash, []);
            }
            kbByHash.get(fileHash).push({ folder, metadata });
            
            // Store by metadata key
            const key = `${metadata.coach}_${metadata.student}_${metadata.week}`;
            if (!kbByMetadata.has(key)) {
                kbByMetadata.set(key, []);
            }
            kbByMetadata.get(key).push({ folder, metadata, fileHash });
        }
    }
    
    // Find S3 recordings without B indicator
    for (const [folderId, folder] of s3Data.recordings) {
        if (hasRecordingFiles(folder)) {
            const metadata = extractRecordingMetadata(folder.name);
            if (metadata && !metadata.hasIndicator) {
                comparison.issues.push({
                    type: 'Missing B Indicator',
                    folder: folder,
                    metadata: metadata,
                    issue: 'S3 recording lacks _B_ indicator'
                });
            }
        }
    }
    
    // Check for duplicates
    for (const [hash, recordings] of s3ByHash) {
        if (recordings.length > 1) {
            comparison.duplicates.push({
                type: 'Duplicate in S3',
                hash: hash,
                recordings: recordings,
                count: recordings.length
            });
        }
    }
    
    // Check for missing recordings
    for (const [key, s3Recordings] of s3ByMetadata) {
        const kbRecordings = kbByMetadata.get(key) || [];
        
        if (kbRecordings.length === 0) {
            comparison.s3Only.push({
                key: key,
                recordings: s3Recordings,
                issue: 'Exists in S3 but not in Knowledge Base'
            });
        } else if (s3Recordings.length !== kbRecordings.length) {
            comparison.mismatches.push({
                key: key,
                s3Count: s3Recordings.length,
                kbCount: kbRecordings.length,
                s3Recordings: s3Recordings,
                kbRecordings: kbRecordings,
                issue: `Count mismatch: S3 has ${s3Recordings.length}, KB has ${kbRecordings.length}`
            });
        }
    }
    
    return comparison;
}

/**
 * Generate detailed HTML report
 */
async function generateDetailedReport(s3Data, kbData, comparison) {
    const timestamp = new Date().toISOString();
    const reportPath = path.join(process.cwd(), `recording-verification-detailed-${Date.now()}.html`);
    
    let html = `<!DOCTYPE html>
<html>
<head>
    <title>Recording Verification Report - ${timestamp}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1, h2, h3 { color: #333; }
        .summary { background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .issue { background: #ffe6e6; padding: 10px; margin: 10px 0; border-left: 4px solid #ff0000; }
        .success { background: #e6ffe6; padding: 10px; margin: 10px 0; border-left: 4px solid #00ff00; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f0f0f0; }
        .path { font-family: monospace; font-size: 12px; color: #666; }
        .highlight { background: yellow; }
        .section { margin: 30px 0; }
        details { margin: 10px 0; }
        summary { cursor: pointer; font-weight: bold; }
    </style>
</head>
<body>
    <h1>📊 Recording Verification Report</h1>
    <p>Generated: ${timestamp}</p>
    
    <div class="summary">
        <h2>Summary</h2>
        <ul>
            <li>S3-Ivylevel Total Folders: ${s3Data.folders.size}</li>
            <li>S3-Ivylevel Recording Folders: ${s3Data.recordings.size}</li>
            <li>S3-Ivylevel Files: ${s3Data.files.size}</li>
            <li>Knowledge Base Recording Folders: ${kbData.recordings.size}</li>
            <li>Issues Found: ${comparison.issues.length}</li>
            <li>Duplicates: ${comparison.duplicates.length}</li>
            <li>S3-Only Records: ${comparison.s3Only.length}</li>
        </ul>
    </div>`;
    
    // Issues Section
    if (comparison.issues.length > 0) {
        html += `
    <div class="section">
        <h2>⚠️ Issues Found (${comparison.issues.length})</h2>`;
        
        // Group by coach
        const issuesByCoach = {};
        comparison.issues.forEach(issue => {
            const coach = issue.metadata?.coach || 'Unknown';
            if (!issuesByCoach[coach]) issuesByCoach[coach] = [];
            issuesByCoach[coach].push(issue);
        });
        
        Object.keys(issuesByCoach).sort().forEach(coach => {
            html += `
        <details>
            <summary>${coach} (${issuesByCoach[coach].length} issues)</summary>
            <table>
                <tr>
                    <th>Folder Name</th>
                    <th>Student</th>
                    <th>Week</th>
                    <th>Issue</th>
                    <th>Path</th>
                </tr>`;
            
            issuesByCoach[coach].forEach(issue => {
                html += `
                <tr>
                    <td>${issue.folder.name}</td>
                    <td>${issue.metadata?.student || 'Unknown'}</td>
                    <td>${issue.metadata?.week || 'Unknown'}</td>
                    <td class="highlight">${issue.issue}</td>
                    <td class="path">${issue.folder.path}</td>
                </tr>`;
            });
            
            html += `
            </table>
        </details>`;
        });
        
        html += `
    </div>`;
    }
    
    // Duplicates Section
    if (comparison.duplicates.length > 0) {
        html += `
    <div class="section">
        <h2>🔄 Duplicate Recordings (${comparison.duplicates.length})</h2>`;
        
        comparison.duplicates.forEach((dup, idx) => {
            html += `
        <details>
            <summary>Duplicate Set ${idx + 1} (${dup.count} copies)</summary>
            <table>
                <tr>
                    <th>Folder Name</th>
                    <th>Coach</th>
                    <th>Student</th>
                    <th>Path</th>
                </tr>`;
            
            dup.recordings.forEach(rec => {
                html += `
                <tr>
                    <td>${rec.folder.name}</td>
                    <td>${rec.metadata?.coach || 'Unknown'}</td>
                    <td>${rec.metadata?.student || 'Unknown'}</td>
                    <td class="path">${rec.folder.path}</td>
                </tr>`;
            });
            
            html += `
            </table>
        </details>`;
        });
        
        html += `
    </div>`;
    }
    
    // File-level verification
    html += `
    <div class="section">
        <h2>📁 File-Level Verification</h2>
        <details>
            <summary>All S3 Recording Folders with Files</summary>
            <table>
                <tr>
                    <th>Folder</th>
                    <th>Files</th>
                    <th>Total Size</th>
                    <th>Has B Indicator</th>
                </tr>`;
    
    for (const [folderId, folder] of s3Data.recordings) {
        if (hasRecordingFiles(folder)) {
            const totalSize = folder.files.reduce((sum, f) => sum + (f.size || 0), 0);
            const metadata = extractRecordingMetadata(folder.name);
            
            html += `
                <tr>
                    <td>${folder.name}</td>
                    <td>${folder.files.length}</td>
                    <td>${(totalSize / 1024 / 1024).toFixed(2)} MB</td>
                    <td class="${metadata?.hasIndicator ? 'success' : 'issue'}">${metadata?.hasIndicator ? 'Yes' : 'No'}</td>
                </tr>`;
        }
    }
    
    html += `
            </table>
        </details>
    </div>`;
    
    html += `
</body>
</html>`;
    
    await fs.writeFile(reportPath, html);
    return reportPath;
}

/**
 * Generate action items
 */
function generateActionItems(comparison) {
    const actions = [];
    
    // Count recordings without B indicator
    const missingIndicatorCount = comparison.issues.filter(i => i.type === 'Missing B Indicator').length;
    if (missingIndicatorCount > 0) {
        actions.push({
            priority: 'HIGH',
            action: `Process ${missingIndicatorCount} recordings that lack _B_ indicator`,
            command: 'node scripts/process-missing-indicators.js'
        });
    }
    
    // Count duplicates
    if (comparison.duplicates.length > 0) {
        actions.push({
            priority: 'MEDIUM',
            action: `Review and deduplicate ${comparison.duplicates.length} duplicate recording sets`,
            command: 'node scripts/deduplicate-recordings.js'
        });
    }
    
    // Count S3-only records
    if (comparison.s3Only.length > 0) {
        actions.push({
            priority: 'HIGH',
            action: `Process ${comparison.s3Only.length} recordings that exist only in S3`,
            command: 'node scripts/process-s3-only-recordings.js'
        });
    }
    
    return actions;
}

async function main() {
    console.log('🔍 Meticulous Recording Verification Script');
    console.log('=' .repeat(60));
    console.log('This will perform an exhaustive verification of all recordings\n');
    
    try {
        const drive = await initializeDrive();
        
        // Step 1: Deep scan S3-Ivylevel
        console.log('📁 Phase 1: Deep scanning S3-Ivylevel drive...');
        console.log('This may take several minutes...\n');
        
        const s3StartTime = Date.now();
        const s3Data = await deepScanFolder(drive, S3_IVYLEVEL_ROOT_ID);
        const s3Duration = ((Date.now() - s3StartTime) / 1000).toFixed(1);
        
        console.log(`✅ S3 Scan Complete (${s3Duration}s)`);
        console.log(`   - Total folders: ${s3Data.folders.size}`);
        console.log(`   - Recording folders: ${s3Data.recordings.size}`);
        console.log(`   - Total files: ${s3Data.files.size}\n`);
        
        // Step 2: Deep scan Knowledge Base
        console.log('📁 Phase 2: Deep scanning Knowledge Base...');
        
        const kbStartTime = Date.now();
        const kbData = await deepScanFolder(drive, KB_STUDENTS_ROOT_ID);
        const kbDuration = ((Date.now() - kbStartTime) / 1000).toFixed(1);
        
        console.log(`✅ KB Scan Complete (${kbDuration}s)`);
        console.log(`   - Total folders: ${kbData.folders.size}`);
        console.log(`   - Recording folders: ${kbData.recordings.size}`);
        console.log(`   - Total files: ${kbData.files.size}\n`);
        
        // Step 3: Compare recordings
        console.log('🔄 Phase 3: Comparing recordings...');
        const comparison = compareRecordings(s3Data, kbData);
        
        // Display results
        console.log('\n' + '=' .repeat(60));
        console.log('📊 VERIFICATION RESULTS');
        console.log('=' .repeat(60));
        
        // Issues
        if (comparison.issues.length > 0) {
            console.log(`\n⚠️  ISSUES FOUND: ${comparison.issues.length}`);
            
            // Group by type
            const issueTypes = {};
            comparison.issues.forEach(issue => {
                if (!issueTypes[issue.type]) issueTypes[issue.type] = 0;
                issueTypes[issue.type]++;
            });
            
            Object.entries(issueTypes).forEach(([type, count]) => {
                console.log(`   - ${type}: ${count}`);
            });
            
            // Show sample issues
            console.log('\n📋 Sample Issues:');
            comparison.issues.slice(0, 5).forEach(issue => {
                console.log(`   - ${issue.folder.name}`);
                console.log(`     Issue: ${issue.issue}`);
                console.log(`     Path: ${issue.folder.path}`);
            });
            
            if (comparison.issues.length > 5) {
                console.log(`   ... and ${comparison.issues.length - 5} more`);
            }
        } else {
            console.log('\n✅ No issues found!');
        }
        
        // Duplicates
        if (comparison.duplicates.length > 0) {
            console.log(`\n🔄 DUPLICATES FOUND: ${comparison.duplicates.length} sets`);
            comparison.duplicates.slice(0, 3).forEach((dup, idx) => {
                console.log(`   Set ${idx + 1}: ${dup.count} copies of same recording`);
                console.log(`     Example: ${dup.recordings[0].folder.name}`);
            });
        }
        
        // Generate reports
        console.log('\n📄 Generating detailed reports...');
        
        const htmlReport = await generateDetailedReport(s3Data, kbData, comparison);
        console.log(`   ✅ HTML Report: ${htmlReport}`);
        
        // Generate action items
        const actions = generateActionItems(comparison);
        if (actions.length > 0) {
            console.log('\n📌 RECOMMENDED ACTIONS:');
            actions.forEach((action, idx) => {
                console.log(`\n${idx + 1}. [${action.priority}] ${action.action}`);
                if (action.command) {
                    console.log(`   Command: ${action.command}`);
                }
            });
        }
        
        // Final summary
        console.log('\n' + '=' .repeat(60));
        console.log('✅ VERIFICATION COMPLETE');
        console.log('=' .repeat(60));
        console.log(`Total scan time: ${((Date.now() - s3StartTime) / 1000).toFixed(1)}s`);
        console.log(`Issues requiring attention: ${comparison.issues.length}`);
        console.log('\nReview the HTML report for complete details.');
        
    } catch (error) {
        console.error('\n❌ Error:', error);
        console.error('Stack:', error.stack);
    }
}

console.log('🚀 Starting meticulous verification...\n');

main()
    .then(() => {
        console.log('\n✅ Verification completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Verification failed:', error);
        process.exit(1);
    });