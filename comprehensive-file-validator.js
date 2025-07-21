#!/usr/bin/env node
require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

class ComprehensiveFileValidator {
    constructor() {
        this.rootFolderId = '1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg';
        this.sheetId = process.env.MASTER_INDEX_SHEET_ID || '1xa4E5PcrxRVaMbJfWH_d5LLSqY3RlCf6Ur3rwKtq2jQ';
        this.drive = null;
        this.sheets = null;
        this.sourceRecordings = {
            fromSheets: new Map(), // UUID -> recording info
            fromLocalA: new Map(), // Meeting ID -> files
            fromLocalB: new Map(), // Meeting ID -> files
            fromLocalC: new Map(), // Meeting ID -> files
            fromDrive: new Map()   // UUID -> drive files
        };
        this.validationResults = {
            missingFiles: [],
            checksumMismatches: [],
            sizeMismatches: [],
            namingIssues: [],
            shortcutIssues: [],
            successfulValidations: 0,
            totalRecordings: 0
        };
    }

    async initialize() {
        console.log('🚀 Initializing Comprehensive File Validator...\n');
        
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'google-credentials.json',
            scopes: [
                'https://www.googleapis.com/auth/drive',
                'https://www.googleapis.com/auth/spreadsheets'
            ],
        });

        const authClient = await auth.getClient();
        this.drive = google.drive({ version: 'v3', auth: authClient });
        this.sheets = google.sheets({ version: 'v4', auth: authClient });
    }

    async loadAllSourceData() {
        console.log('📊 Loading source data from all locations...\n');
        
        // Load from Google Sheets
        await this.loadFromSheets();
        
        // Load from local directories
        await this.loadFromLocalDirectories();
        
        // Load current Drive structure
        await this.loadFromDrive();
        
        console.log('\n📈 Source Data Summary:');
        console.log(`- Recordings from Sheets: ${this.sourceRecordings.fromSheets.size}`);
        console.log(`- Local A recordings: ${this.sourceRecordings.fromLocalA.size}`);
        console.log(`- Local B recordings: ${this.sourceRecordings.fromLocalB.size}`);
        console.log(`- Local C recordings: ${this.sourceRecordings.fromLocalC.size}`);
        console.log(`- Drive folders: ${this.sourceRecordings.fromDrive.size}`);
    }

    async loadFromSheets() {
        console.log('📋 Loading from Google Sheets...');
        
        const tabsToLoad = [
            'Raw Master Index',
            'Standardized Master Index', 
            'A Recordings',
            'B Recordings',
            'C Recordings',
            'Zoom Recordings'
        ];

        for (const tabName of tabsToLoad) {
            try {
                const response = await this.sheets.spreadsheets.values.get({
                    spreadsheetId: this.sheetId,
                    range: `'${tabName}'!A:Z`
                });

                const rows = response.data.values || [];
                if (rows.length > 1) {
                    const headers = rows[0];
                    const uuidIndex = headers.findIndex(h => h && h.toLowerCase().includes('uuid'));
                    const meetingIdIndex = headers.findIndex(h => h && h.toLowerCase().includes('meeting') && h.toLowerCase().includes('id'));
                    const topicIndex = headers.findIndex(h => h && h.toLowerCase().includes('topic'));
                    const dateIndex = headers.findIndex(h => h && h.toLowerCase().includes('date') || h.toLowerCase().includes('start'));
                    const durationIndex = headers.findIndex(h => h && h.toLowerCase().includes('duration'));
                    const sizeIndex = headers.findIndex(h => h && h.toLowerCase().includes('size'));
                    const filesIndex = headers.findIndex(h => h && h.toLowerCase().includes('files') || h.toLowerCase().includes('recording'));

                    console.log(`   Loading ${tabName}: ${rows.length - 1} records`);

                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row || row.length === 0) continue;

                        const uuid = uuidIndex >= 0 ? row[uuidIndex] : null;
                        const meetingId = meetingIdIndex >= 0 ? row[meetingIdIndex] : null;
                        
                        if (uuid || meetingId) {
                            const recording = {
                                uuid: uuid,
                                meetingId: meetingId,
                                topic: topicIndex >= 0 ? row[topicIndex] : '',
                                date: dateIndex >= 0 ? row[dateIndex] : '',
                                duration: durationIndex >= 0 ? row[durationIndex] : '',
                                size: sizeIndex >= 0 ? row[sizeIndex] : '',
                                files: filesIndex >= 0 ? row[filesIndex] : '',
                                source: tabName,
                                row: i + 1
                            };

                            if (uuid) {
                                this.sourceRecordings.fromSheets.set(uuid, recording);
                            }
                        }
                    }
                }
            } catch (error) {
                console.log(`   ⚠️  Could not load ${tabName}: ${error.message}`);
            }
        }
    }

    async loadFromLocalDirectories() {
        console.log('\n📁 Loading from local directories...');
        
        const outputDir = path.join(__dirname, 'output');
        
        try {
            const localDirs = await fs.readdir(outputDir);
            
            for (const dir of localDirs) {
                if (dir.startsWith('M:') && dir.includes('U:')) {
                    const parts = dir.split('U:');
                    const meetingId = parts[0].substring(2);
                    const uuid = parts[1];
                    
                    const fullPath = path.join(outputDir, dir);
                    const stats = await fs.stat(fullPath);
                    
                    if (stats.isDirectory()) {
                        const files = await fs.readdir(fullPath);
                        const fileDetails = [];
                        
                        for (const file of files) {
                            const filePath = path.join(fullPath, file);
                            const fileStats = await fs.stat(filePath);
                            fileDetails.push({
                                name: file,
                                size: fileStats.size,
                                path: filePath
                            });
                        }
                        
                        // Determine source (A, B, or C)
                        let source = 'A'; // Default
                        if (fileDetails.some(f => f.name.includes('summary'))) {
                            source = 'A';
                        } else if (files.length === 0 || fileDetails.every(f => f.size < 1000000)) {
                            source = 'B';
                        }
                        
                        const recordingInfo = {
                            meetingId,
                            uuid,
                            files: fileDetails,
                            totalSize: fileDetails.reduce((sum, f) => sum + f.size, 0),
                            directory: dir
                        };
                        
                        if (source === 'A') {
                            this.sourceRecordings.fromLocalA.set(meetingId, recordingInfo);
                        } else if (source === 'B') {
                            this.sourceRecordings.fromLocalB.set(meetingId, recordingInfo);
                        } else {
                            this.sourceRecordings.fromLocalC.set(meetingId, recordingInfo);
                        }
                    }
                }
            }
            
            console.log(`   Found ${localDirs.filter(d => d.startsWith('M:')).length} local recording directories`);
            
        } catch (error) {
            console.log(`   ⚠️  Could not read local output directory: ${error.message}`);
        }
    }

    async loadFromDrive() {
        console.log('\n☁️  Loading current Drive structure...');
        
        await this.scanDriveRecursive(this.rootFolderId, '');
        
        console.log(`   Found ${this.sourceRecordings.fromDrive.size} recording folders in Drive`);
    }

    async scanDriveRecursive(folderId, path) {
        try {
            let pageToken = null;
            do {
                const response = await this.drive.files.list({
                    q: `'${folderId}' in parents and trashed = false`,
                    fields: 'nextPageToken, files(id, name, mimeType, size)',
                    pageToken: pageToken,
                    pageSize: 1000
                });

                for (const item of response.data.files) {
                    if (item.mimeType === 'application/vnd.google-apps.folder') {
                        const folderPath = path ? `${path}/${item.name}` : item.name;
                        
                        // Check if this is a recording folder
                        if (item.name.includes('_M_') || item.name.includes('U_')) {
                            // Extract meeting ID and UUID
                            const meetingIdMatch = item.name.match(/M[_:](\d+)/);
                            const uuidMatch = item.name.match(/U[_:]([^_]+)/);
                            
                            if (meetingIdMatch || uuidMatch) {
                                const recordingInfo = {
                                    folderId: item.id,
                                    folderName: item.name,
                                    path: folderPath,
                                    meetingId: meetingIdMatch ? meetingIdMatch[1] : null,
                                    uuid: uuidMatch ? uuidMatch[1] : null,
                                    files: []
                                };
                                
                                // Get files in this folder
                                const filesResponse = await this.drive.files.list({
                                    q: `'${item.id}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
                                    fields: 'files(id, name, size, md5Checksum)',
                                    pageSize: 100
                                });
                                
                                recordingInfo.files = filesResponse.data.files;
                                
                                const key = recordingInfo.uuid || recordingInfo.meetingId || item.id;
                                this.sourceRecordings.fromDrive.set(key, recordingInfo);
                            }
                        }
                        
                        // Recursively scan subfolders
                        await this.scanDriveRecursive(item.id, folderPath);
                    }
                }
                
                pageToken = response.data.nextPageToken;
            } while (pageToken);
            
        } catch (error) {
            console.error(`Error scanning folder ${folderId}: ${error.message}`);
        }
    }

    async validateAllRecordings() {
        console.log('\n\n🔍 VALIDATING ALL RECORDINGS...');
        console.log('================================================================================\n');
        
        // Create a master list of all unique recordings
        const allRecordings = new Map();
        
        // Add from sheets
        for (const [uuid, recording] of this.sourceRecordings.fromSheets) {
            allRecordings.set(uuid, { ...recording, sources: ['sheets'] });
        }
        
        // Add from local directories
        for (const [meetingId, recording] of this.sourceRecordings.fromLocalA) {
            const key = recording.uuid || meetingId;
            if (allRecordings.has(key)) {
                allRecordings.get(key).sources.push('localA');
                allRecordings.get(key).localFiles = recording.files;
            } else {
                allRecordings.set(key, { ...recording, sources: ['localA'] });
            }
        }
        
        // Similar for B and C
        for (const [meetingId, recording] of this.sourceRecordings.fromLocalB) {
            const key = recording.uuid || meetingId;
            if (allRecordings.has(key)) {
                allRecordings.get(key).sources.push('localB');
            } else {
                allRecordings.set(key, { ...recording, sources: ['localB'] });
            }
        }
        
        this.validationResults.totalRecordings = allRecordings.size;
        
        // Check each recording
        let checked = 0;
        for (const [key, recording] of allRecordings) {
            checked++;
            if (checked % 50 === 0) {
                console.log(`Progress: ${checked}/${allRecordings.size} recordings checked...`);
            }
            
            await this.validateRecording(key, recording);
        }
        
        console.log('\n✅ Validation complete!');
    }

    async validateRecording(key, recording) {
        // Check if recording exists in Drive
        const driveRecording = this.sourceRecordings.fromDrive.get(key) || 
                             Array.from(this.sourceRecordings.fromDrive.values()).find(r => 
                                 r.meetingId === recording.meetingId || r.uuid === recording.uuid
                             );
        
        if (!driveRecording) {
            this.validationResults.missingFiles.push({
                identifier: key,
                meetingId: recording.meetingId,
                uuid: recording.uuid,
                topic: recording.topic,
                date: recording.date,
                sources: recording.sources,
                issue: 'NOT FOUND IN DRIVE'
            });
            return;
        }
        
        // Validate files if we have local copies
        if (recording.localFiles) {
            const missingInDrive = [];
            
            for (const localFile of recording.localFiles) {
                const driveFile = driveRecording.files.find(f => 
                    this.compareFileNames(f.name, localFile.name)
                );
                
                if (!driveFile) {
                    missingInDrive.push(localFile.name);
                } else {
                    // Check size
                    if (localFile.size && driveFile.size) {
                        const sizeDiff = Math.abs(parseInt(driveFile.size) - localFile.size);
                        const percentDiff = (sizeDiff / localFile.size) * 100;
                        
                        if (percentDiff > 1) { // More than 1% difference
                            this.validationResults.sizeMismatches.push({
                                recording: key,
                                file: localFile.name,
                                localSize: localFile.size,
                                driveSize: driveFile.size,
                                difference: `${percentDiff.toFixed(2)}%`
                            });
                        }
                    }
                }
            }
            
            if (missingInDrive.length > 0) {
                this.validationResults.missingFiles.push({
                    identifier: key,
                    meetingId: recording.meetingId,
                    uuid: recording.uuid,
                    topic: recording.topic,
                    driveFolder: driveRecording.folderName,
                    missingFiles: missingInDrive,
                    issue: 'FILES MISSING IN DRIVE'
                });
            }
        }
        
        this.validationResults.successfulValidations++;
    }

    compareFileNames(name1, name2) {
        // Normalize names for comparison
        const normalize = (name) => {
            return name.toLowerCase()
                      .replace(/[_\-\s]+/g, '')
                      .replace(/\.(mp4|m4a|txt|vtt|json)$/, '');
        };
        
        return normalize(name1) === normalize(name2);
    }

    async standardizeFileNames() {
        console.log('\n\n📝 STANDARDIZING FILE NAMES...');
        console.log('================================================================================\n');
        
        const renamingPlan = [];
        
        for (const [key, driveRecording] of this.sourceRecordings.fromDrive) {
            if (!driveRecording.folderName) continue;
            
            // Extract prefix from folder name
            const folderParts = driveRecording.folderName.split('_');
            const prefix = folderParts.slice(0, -2).join('_'); // Everything before meeting ID
            
            for (const file of driveRecording.files) {
                const standardName = this.getStandardFileName(file.name, prefix);
                
                if (standardName && standardName !== file.name) {
                    renamingPlan.push({
                        fileId: file.id,
                        folderId: driveRecording.folderId,
                        folderName: driveRecording.folderName,
                        currentName: file.name,
                        newName: standardName
                    });
                }
            }
        }
        
        console.log(`Found ${renamingPlan.length} files to rename`);
        
        // Save renaming plan
        const planPath = 'validation-reports/file-renaming-plan.json';
        await fs.writeFile(planPath, JSON.stringify(renamingPlan, null, 2));
        console.log(`\n📋 Renaming plan saved to: ${planPath}`);
        
        return renamingPlan;
    }

    getStandardFileName(currentName, folderPrefix) {
        const lowerName = currentName.toLowerCase();
        
        // Define mapping rules
        const mappings = {
            // Video files
            'shared_screen_with_speaker_view.mp4': `${folderPrefix}_video.mp4`,
            'shared_screen_with_gallery_view.mp4': `${folderPrefix}_video.mp4`,
            'mp4.mp4': `${folderPrefix}_video.mp4`,
            'video_file.mp4': `${folderPrefix}_video.mp4`,
            
            // Audio files
            'audio_only.m4a': `${folderPrefix}_audio.m4a`,
            'audio.m4a': `${folderPrefix}_audio.m4a`,
            'm4a.m4a': `${folderPrefix}_audio.m4a`,
            
            // Transcript files
            'transcript.vtt': `${folderPrefix}_transcript.vtt`,
            'audio_transcript.vtt': `${folderPrefix}_transcript.vtt`,
            
            // Chat files
            'chat_file.txt': `${folderPrefix}_chat.txt`,
            'chat.txt': `${folderPrefix}_chat.txt`,
            
            // Summary files
            'summary.json': `${folderPrefix}_summary.json`,
            'summary': `${folderPrefix}_summary.json`,
            'summary_next_steps.json': `${folderPrefix}_summary_next_steps.json`,
            'summary_next_steps': `${folderPrefix}_summary_next_steps.json`
        };
        
        // Check for generic video names
        if (lowerName.includes('.mp4') && !lowerName.startsWith(folderPrefix)) {
            return `${folderPrefix}_video.mp4`;
        }
        
        // Check for generic audio names
        if (lowerName.includes('.m4a') && !lowerName.startsWith(folderPrefix)) {
            return `${folderPrefix}_audio.m4a`;
        }
        
        // Use mapping if available
        for (const [pattern, newName] of Object.entries(mappings)) {
            if (lowerName === pattern || lowerName.includes(pattern.split('.')[0])) {
                return newName;
            }
        }
        
        return null;
    }

    async validateCoachStudentShortcuts() {
        console.log('\n\n🔗 VALIDATING COACH-STUDENT SHORTCUTS...');
        console.log('================================================================================\n');
        
        // Get Students and Coaches folders
        const topLevel = await this.drive.files.list({
            q: `'${this.rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 100
        });
        
        const studentsFolderId = topLevel.data.files.find(f => f.name === 'Students')?.id;
        const coachesFolderId = topLevel.data.files.find(f => f.name === 'Coaches')?.id;
        
        if (!studentsFolderId || !coachesFolderId) {
            console.log('❌ Could not find Students or Coaches folders');
            return;
        }
        
        // Get all student folders
        const studentFolders = await this.drive.files.list({
            q: `'${studentsFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 1000
        });
        
        console.log(`Found ${studentFolders.data.files.length} student folders`);
        
        // Check each student folder for recordings
        const shortcutsNeeded = [];
        
        for (const studentFolder of studentFolders.data.files) {
            const recordings = await this.drive.files.list({
                q: `'${studentFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'files(id, name)',
                pageSize: 100
            });
            
            for (const recording of recordings.data.files) {
                // Extract coach name from recording folder
                const coachMatch = recording.name.match(/(?:Coaching|MISC|TRIVIAL)_[ABC]_([^_]+)_/);
                if (coachMatch) {
                    const coachName = coachMatch[1];
                    
                    shortcutsNeeded.push({
                        studentName: studentFolder.name,
                        coachName: coachName,
                        recordingId: recording.id,
                        recordingName: recording.name,
                        studentFolderId: studentFolder.id
                    });
                }
            }
        }
        
        console.log(`\nFound ${shortcutsNeeded.length} recordings needing coach shortcuts`);
        
        // Group by coach
        const byCoach = {};
        shortcutsNeeded.forEach(item => {
            if (!byCoach[item.coachName]) {
                byCoach[item.coachName] = [];
            }
            byCoach[item.coachName].push(item);
        });
        
        // Save shortcuts plan
        const shortcutsPath = 'validation-reports/coach-shortcuts-needed.json';
        await fs.writeFile(shortcutsPath, JSON.stringify(byCoach, null, 2));
        console.log(`\n📋 Shortcuts plan saved to: ${shortcutsPath}`);
        
        // Summary
        console.log('\nShortcuts needed by coach:');
        Object.entries(byCoach).forEach(([coach, items]) => {
            console.log(`- ${coach}: ${items.length} shortcuts needed`);
        });
    }

    async generateReport() {
        console.log('\n\n📊 GENERATING COMPREHENSIVE REPORT...');
        console.log('================================================================================\n');
        
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalRecordingsInSheets: this.sourceRecordings.fromSheets.size,
                totalLocalRecordings: this.sourceRecordings.fromLocalA.size + 
                                    this.sourceRecordings.fromLocalB.size + 
                                    this.sourceRecordings.fromLocalC.size,
                totalDriveFolders: this.sourceRecordings.fromDrive.size,
                missingInDrive: this.validationResults.missingFiles.length,
                sizeMismatches: this.validationResults.sizeMismatches.length,
                successfulValidations: this.validationResults.successfulValidations
            },
            criticalIssues: {
                missingRecordings: this.validationResults.missingFiles.filter(f => f.issue === 'NOT FOUND IN DRIVE'),
                missingFiles: this.validationResults.missingFiles.filter(f => f.issue === 'FILES MISSING IN DRIVE')
            },
            validationResults: this.validationResults
        };
        
        // Display critical issues
        if (report.criticalIssues.missingRecordings.length > 0) {
            console.log('❌ CRITICAL: RECORDINGS NOT FOUND IN DRIVE:');
            console.log('================================================================================');
            report.criticalIssues.missingRecordings.forEach((rec, idx) => {
                console.log(`\n${idx + 1}. ${rec.topic || 'Unknown Topic'}`);
                console.log(`   Meeting ID: ${rec.meetingId || 'N/A'}`);
                console.log(`   UUID: ${rec.uuid || 'N/A'}`);
                console.log(`   Date: ${rec.date || 'N/A'}`);
                console.log(`   Found in: ${rec.sources.join(', ')}`);
            });
        }
        
        if (report.criticalIssues.missingFiles.length > 0) {
            console.log('\n\n❌ CRITICAL: FILES MISSING IN DRIVE:');
            console.log('================================================================================');
            report.criticalIssues.missingFiles.forEach((rec, idx) => {
                console.log(`\n${idx + 1}. ${rec.topic || rec.driveFolder}`);
                console.log(`   Missing files: ${rec.missingFiles.join(', ')}`);
                console.log(`   Drive folder: ${rec.driveFolder}`);
            });
        }
        
        // Save detailed report
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = `validation-reports/comprehensive-validation-${timestamp}.json`;
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        
        console.log('\n\n📈 VALIDATION SUMMARY:');
        console.log('================================================================================');
        console.log(`Total recordings in sheets: ${report.summary.totalRecordingsInSheets}`);
        console.log(`Total local recordings: ${report.summary.totalLocalRecordings}`);
        console.log(`Total Drive folders: ${report.summary.totalDriveFolders}`);
        console.log(`\n⚠️  Missing recordings: ${report.criticalIssues.missingRecordings.length}`);
        console.log(`⚠️  Missing files: ${report.criticalIssues.missingFiles.length}`);
        console.log(`✅ Successful validations: ${report.summary.successfulValidations}`);
        
        console.log(`\n📄 Detailed report saved to: ${reportPath}`);
        
        return report;
    }
}

// Main execution
async function main() {
    const validator = new ComprehensiveFileValidator();
    
    try {
        await validator.initialize();
        await validator.loadAllSourceData();
        await validator.validateAllRecordings();
        
        const renamingPlan = await validator.standardizeFileNames();
        await validator.validateCoachStudentShortcuts();
        
        const report = await validator.generateReport();
        
        if (report.criticalIssues.missingRecordings.length === 0 && 
            report.criticalIssues.missingFiles.length === 0) {
            console.log('\n\n🎉 EXCELLENT! All recordings and files are properly stored in Google Drive!');
        } else {
            console.log('\n\n⚠️  ATTENTION REQUIRED: Some recordings or files are missing from Google Drive.');
            console.log('Please review the detailed report for specific items that need to be uploaded.');
        }
        
    } catch (error) {
        console.error('❌ Validation failed:', error);
        console.error(error.stack);
    }
}

main().catch(console.error);