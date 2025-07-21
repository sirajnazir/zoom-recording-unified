#!/usr/bin/env node
require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parse/sync');
const axios = require('axios');

class ZoomToDriveFileValidator {
    constructor() {
        this.drive = null;
        this.zoomToken = process.env.ZOOM_API_TOKEN;
        this.rootFolderId = '1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg';
        this.data = {
            zoomRecordings: new Map(),    // UUID -> Zoom recording data
            driveFiles: new Map(),        // UUID -> Drive files
            localRecordings: new Map()    // UUID -> Local files
        };
        this.results = {
            perfectMatch: [],
            partialMatch: [],
            missingFiles: [],
            extraFiles: [],
            sizeDiscrepancies: [],
            summary: {}
        };
    }

    async initialize() {
        console.log('🚀 Initializing Zoom to Drive File Validator...\n');
        console.log('📌 This validator checks if all Zoom Cloud files exist in Google Drive\n');
        
        const auth = new google.auth.GoogleAuth({
            keyFile: 'google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/drive']
        });

        const authClient = await auth.getClient();
        this.drive = google.drive({ version: 'v3', auth: authClient });
    }

    async loadZoomDataFromCSV() {
        console.log('📊 Loading Zoom recording data from CSV files...\n');
        
        // Load from most recent CSV
        const csvFiles = [
            'recordings-recent-2025-07-10.csv',
            'recordings-last30days-2025-07-09.csv',
            'data/ALL-324-zoomus_recordings_in_cloud__20250702.csv'
        ];
        
        for (const csvFile of csvFiles) {
            try {
                const csvPath = path.join(__dirname, csvFile);
                const csvContent = await fs.readFile(csvPath, 'utf-8');
                const records = csv.parse(csvContent, { columns: true });
                
                console.log(`   Loading ${csvFile}: ${records.length} records`);
                
                for (const record of records) {
                    const uuid = record.uuid || record.ID;
                    if (uuid) {
                        this.data.zoomRecordings.set(uuid, {
                            uuid: uuid,
                            meetingId: record.meeting_id || record.ID,
                            topic: record.topic || record.Topic,
                            date: record.start_time || record['Start Time'],
                            source: csvFile
                        });
                    }
                }
            } catch (error) {
                console.log(`   ⚠️  Could not load ${csvFile}: ${error.message}`);
            }
        }
        
        console.log(`\n   Total unique Zoom recordings: ${this.data.zoomRecordings.size}`);
    }

    async loadZoomDataFromAPI() {
        console.log('\n🔄 Fetching current data from Zoom API...\n');
        
        if (!this.zoomToken) {
            console.log('   ⚠️  No Zoom API token available, skipping API check');
            return;
        }
        
        let apiCount = 0;
        
        // Sample 20 recordings to check current Zoom status
        const sampleUuids = Array.from(this.data.zoomRecordings.keys()).slice(0, 20);
        
        for (const uuid of sampleUuids) {
            try {
                const response = await axios.get(`https://api.zoom.us/v2/meetings/${uuid}/recordings`, {
                    headers: { 'Authorization': `Bearer ${this.zoomToken}` }
                });
                
                const recording = response.data;
                const files = [];
                
                // Collect all files
                if (recording.recording_files) {
                    files.push(...recording.recording_files.map(f => ({
                        type: f.file_type,
                        size: f.file_size,
                        name: `${f.recording_type || f.file_type}.${f.file_extension || f.file_type.toLowerCase()}`
                    })));
                }
                
                if (recording.participant_audio_files) {
                    files.push(...recording.participant_audio_files.map(f => ({
                        type: 'AUDIO',
                        size: f.file_size,
                        name: `audio.${f.file_extension || 'm4a'}`
                    })));
                }
                
                this.data.zoomRecordings.get(uuid).zoomFiles = files;
                this.data.zoomRecordings.get(uuid).apiChecked = true;
                apiCount++;
                
            } catch (error) {
                // Recording might be deleted or inaccessible
                this.data.zoomRecordings.get(uuid).apiError = error.response?.status || error.message;
            }
        }
        
        console.log(`   ✅ Checked ${apiCount} recordings via Zoom API`);
    }

    async loadLocalFiles() {
        console.log('\n📁 Loading local recording files...\n');
        
        const outputDir = path.join(__dirname, 'output');
        
        try {
            const dirs = await fs.readdir(outputDir);
            let count = 0;
            
            for (const dir of dirs) {
                if (dir.includes('U:') || dir.includes('U_')) {
                    const uuidMatch = dir.match(/U[_:]([A-Za-z0-9+/=]+)/);
                    if (uuidMatch) {
                        const uuid = uuidMatch[1];
                        const fullPath = path.join(outputDir, dir);
                        
                        try {
                            const files = await fs.readdir(fullPath);
                            const fileDetails = [];
                            
                            for (const file of files) {
                                const stats = await fs.stat(path.join(fullPath, file));
                                fileDetails.push({
                                    name: file,
                                    size: stats.size,
                                    type: this.getFileType(file)
                                });
                            }
                            
                            this.data.localRecordings.set(uuid, {
                                directory: dir,
                                files: fileDetails
                            });
                            count++;
                        } catch (error) {
                            // Directory might be empty or inaccessible
                        }
                    }
                }
            }
            
            console.log(`   ✅ Found ${count} local recording directories`);
            
        } catch (error) {
            console.log(`   ⚠️  Could not read local output directory: ${error.message}`);
        }
    }

    getFileType(filename) {
        const lower = filename.toLowerCase();
        if (lower.includes('.mp4')) return 'VIDEO';
        if (lower.includes('.m4a')) return 'AUDIO';
        if (lower.includes('.vtt')) return 'TRANSCRIPT';
        if (lower.includes('.txt')) return 'CHAT';
        if (lower.includes('.json')) return 'METADATA';
        return 'OTHER';
    }

    async loadDriveFiles() {
        console.log('\n☁️  Loading files from Google Drive...\n');
        console.log('   This may take a few minutes...\n');
        
        const startTime = Date.now();
        await this.scanDriveFolder(this.rootFolderId, 0);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        
        console.log(`\n   ✅ Found ${this.data.driveFiles.size} recording folders in Drive (${elapsed}s)`);
    }

    async scanDriveFolder(folderId, depth) {
        if (depth > 4) return;
        
        try {
            let pageToken = null;
            let folderCount = 0;
            do {
                const response = await this.drive.files.list({
                    q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                    fields: 'nextPageToken, files(id, name)',
                    pageToken: pageToken,
                    pageSize: 100  // Reduced page size
                });

                for (const folder of response.data.files) {
                    const uuidMatch = folder.name.match(/U[_:]([A-Za-z0-9+/=]+)/);
                    
                    if (uuidMatch) {
                        let uuid = uuidMatch[1];
                        
                        // Get files in this recording folder
                        const files = await this.getDriveFiles(folder.id);
                        
                        this.data.driveFiles.set(uuid, {
                            folderName: folder.name,
                            folderId: folder.id,
                            files: files
                        });
                        
                        // Also store with escaped UUID for matching
                        const escapedUuid = uuid.replace(/_/g, '/');
                        if (escapedUuid !== uuid) {
                            this.data.driveFiles.set(escapedUuid, {
                                folderName: folder.name,
                                folderId: folder.id,
                                files: files,
                                originalUuid: uuid
                            });
                        }
                        
                        folderCount++;
                        if (folderCount % 50 === 0) {
                            console.log(`   Progress: Scanned ${folderCount} recording folders...`);
                        }
                    } else {
                        // Recursively scan subfolders
                        await this.scanDriveFolder(folder.id, depth + 1);
                    }
                }
                
                pageToken = response.data.nextPageToken;
            } while (pageToken);
            
        } catch (error) {
            console.error(`Error scanning folder: ${error.message}`);
        }
    }

    async getDriveFiles(folderId) {
        const files = [];
        
        try {
            const response = await this.drive.files.list({
                q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'files(id, name, size, mimeType)',
                pageSize: 100
            });
            
            for (const file of response.data.files) {
                files.push({
                    id: file.id,
                    name: file.name,
                    size: parseInt(file.size || 0),
                    type: this.getFileType(file.name),
                    mimeType: file.mimeType
                });
            }
        } catch (error) {
            console.error(`Error getting files for folder ${folderId}: ${error.message}`);
        }
        
        return files;
    }

    async validateFiles() {
        console.log('\n\n🔍 VALIDATING FILES BETWEEN ZOOM AND DRIVE...');
        console.log('================================================================================\n');
        
        let processed = 0;
        
        for (const [uuid, zoomRec] of this.data.zoomRecordings) {
            processed++;
            
            // Find in Drive (check both original and escaped UUID)
            const driveData = this.data.driveFiles.get(uuid) || 
                           this.data.driveFiles.get(uuid.replace(/\//g, '_'));
            
            // Find in local files
            const localData = this.data.localRecordings.get(uuid) ||
                            this.data.localRecordings.get(uuid.replace(/\//g, '_'));
            
            if (driveData) {
                // Compare files
                const validation = this.compareFiles(zoomRec, driveData, localData);
                
                if (validation.status === 'PERFECT') {
                    this.results.perfectMatch.push({
                        uuid: uuid,
                        topic: zoomRec.topic,
                        folder: driveData.folderName,
                        fileCount: driveData.files.length
                    });
                } else if (validation.status === 'PARTIAL') {
                    this.results.partialMatch.push({
                        uuid: uuid,
                        topic: zoomRec.topic,
                        folder: driveData.folderName,
                        ...validation
                    });
                } else if (validation.status === 'MISSING_FILES') {
                    this.results.missingFiles.push({
                        uuid: uuid,
                        topic: zoomRec.topic,
                        folder: driveData.folderName,
                        ...validation
                    });
                }
            } else {
                // Recording folder not found in Drive at all
                this.results.missingFiles.push({
                    uuid: uuid,
                    topic: zoomRec.topic,
                    date: zoomRec.date,
                    status: 'FOLDER_NOT_FOUND',
                    localFiles: localData ? localData.files.length : 0
                });
            }
            
            if (processed % 50 === 0) {
                console.log(`Progress: ${processed}/${this.data.zoomRecordings.size} recordings checked`);
            }
        }
        
        console.log('\n✅ File validation complete!');
    }

    compareFiles(zoomRec, driveData, localData) {
        const result = {
            status: 'UNKNOWN',
            driveFiles: driveData.files.length,
            localFiles: localData ? localData.files.length : 0,
            expectedFiles: [],
            missingInDrive: [],
            extraInDrive: []
        };
        
        // Define expected files based on recording type
        const expectedTypes = ['VIDEO', 'AUDIO', 'TRANSCRIPT', 'CHAT'];
        
        // Check if we have API data
        if (zoomRec.zoomFiles) {
            // Use actual Zoom file data
            result.expectedFiles = zoomRec.zoomFiles.map(f => f.type);
            
            for (const zoomFile of zoomRec.zoomFiles) {
                const found = driveData.files.some(df => 
                    df.type === zoomFile.type || 
                    this.filesMatch(zoomFile.name, df.name)
                );
                
                if (!found) {
                    result.missingInDrive.push(zoomFile.name);
                }
            }
        } else if (localData) {
            // Use local files as reference
            for (const localFile of localData.files) {
                const found = driveData.files.some(df => 
                    this.filesMatch(localFile.name, df.name)
                );
                
                if (!found && localFile.type !== 'METADATA') {
                    result.missingInDrive.push(localFile.name);
                }
            }
        }
        
        // Check for essential files
        const hasVideo = driveData.files.some(f => f.type === 'VIDEO');
        const hasAudio = driveData.files.some(f => f.type === 'AUDIO');
        const hasTranscript = driveData.files.some(f => f.type === 'TRANSCRIPT');
        
        if (result.missingInDrive.length === 0) {
            result.status = 'PERFECT';
        } else if (hasVideo || hasAudio) {
            result.status = 'PARTIAL';
        } else {
            result.status = 'MISSING_FILES';
        }
        
        return result;
    }

    filesMatch(name1, name2) {
        // Normalize file names for comparison
        const normalize = (name) => {
            return name.toLowerCase()
                      .replace(/[_\-\s]+/g, '')
                      .replace(/\.(mp4|m4a|vtt|txt|json)$/, '');
        };
        
        return normalize(name1) === normalize(name2);
    }

    async generateReport() {
        console.log('\n\n📊 FILE VALIDATION REPORT');
        console.log('================================================================================');
        
        this.results.summary = {
            totalRecordings: this.data.zoomRecordings.size,
            perfectMatch: this.results.perfectMatch.length,
            partialMatch: this.results.partialMatch.length,
            missingFiles: this.results.missingFiles.length,
            folderNotFound: this.results.missingFiles.filter(r => r.status === 'FOLDER_NOT_FOUND').length
        };
        
        console.log('\n📈 SUMMARY:');
        console.log(`Total Zoom recordings checked: ${this.results.summary.totalRecordings}`);
        console.log(`\n✅ Perfect match (all files present): ${this.results.summary.perfectMatch}`);
        console.log(`⚠️  Partial match (some files missing): ${this.results.summary.partialMatch}`);
        console.log(`❌ Missing files or folders: ${this.results.summary.missingFiles}`);
        console.log(`   - Folders not found: ${this.results.summary.folderNotFound}`);
        
        // Show missing files details
        if (this.results.missingFiles.length > 0) {
            console.log('\n\n❌ RECORDINGS WITH MISSING FILES (First 20):');
            console.log('================================================================================');
            
            this.results.missingFiles.slice(0, 20).forEach((rec, idx) => {
                console.log(`\n${idx + 1}. ${rec.topic || 'Unknown Topic'}`);
                console.log(`   UUID: ${rec.uuid}`);
                
                if (rec.status === 'FOLDER_NOT_FOUND') {
                    console.log(`   Status: FOLDER NOT FOUND IN DRIVE`);
                    console.log(`   Local files: ${rec.localFiles}`);
                } else {
                    console.log(`   Folder: ${rec.folder}`);
                    console.log(`   Missing files: ${rec.missingInDrive.join(', ')}`);
                }
            });
            
            if (this.results.missingFiles.length > 20) {
                console.log(`\n... and ${this.results.missingFiles.length - 20} more recordings with issues`);
            }
        }
        
        // Show partial matches
        if (this.results.partialMatch.length > 0) {
            console.log('\n\n⚠️  PARTIAL MATCHES (First 10):');
            console.log('================================================================================');
            
            this.results.partialMatch.slice(0, 10).forEach((rec, idx) => {
                console.log(`\n${idx + 1}. ${rec.topic}`);
                console.log(`   Files in Drive: ${rec.driveFiles}`);
                console.log(`   Missing: ${rec.missingInDrive.join(', ') || 'None specified'}`);
            });
        }
        
        // Save detailed report
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = `validation-reports/zoom-to-drive-files-${timestamp}.json`;
        
        await fs.writeFile(reportPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            summary: this.results.summary,
            perfectMatch: this.results.perfectMatch.slice(0, 100),
            partialMatch: this.results.partialMatch,
            missingFiles: this.results.missingFiles
        }, null, 2));
        
        console.log(`\n\n📄 Detailed report saved to: ${reportPath}`);
        
        const successRate = ((this.results.summary.perfectMatch / this.results.summary.totalRecordings) * 100).toFixed(1);
        console.log(`\n\n🎯 Overall file integrity: ${successRate}% perfect match`);
        
        return this.results;
    }
}

// Main execution
async function main() {
    const validator = new ZoomToDriveFileValidator();
    
    try {
        await validator.initialize();
        await validator.loadZoomDataFromCSV();
        await validator.loadZoomDataFromAPI();
        await validator.loadLocalFiles();
        await validator.loadDriveFiles();
        await validator.validateFiles();
        
        const results = await validator.generateReport();
        
    } catch (error) {
        console.error('❌ Validation failed:', error);
        console.error(error.stack);
    }
}

main().catch(console.error);