#!/usr/bin/env node
require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class HighFidelityValidator {
    constructor() {
        this.rootFolderId = '1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg';
        this.sheetId = process.env.MASTER_INDEX_SHEET_ID || '1xa4E5PcrxRVaMbJfWH_d5LLSqY3RlCf6Ur3rwKtq2jQ';
        this.drive = null;
        this.sheets = null;
        this.recordingData = {
            sheetsBase64: new Map(),    // Base64 UUID -> recording info from multi-tabs
            sheetsHex: new Map(),       // Hex UUID -> recording info from Raw/Standardized
            driveRecordings: new Map(), // UUID -> drive folder + file metadata
            localRecordings: new Map()  // UUID -> local files + content
        };
        this.validationResults = {
            matched: [],
            unmatched: [],
            contentValidation: [],
            uuidMappings: new Map() // hex -> base64 mappings discovered
        };
    }

    async initialize() {
        console.log('🚀 Initializing High Fidelity Validator...\n');
        console.log('📌 Strategy: UUID-first matching with file content validation\n');
        
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

    async loadSheetsData() {
        console.log('📊 Loading UUID data from Google Sheets...\n');
        
        // Load multi-tab sheets FIRST (these have proper Base64 UUIDs)
        const multiTabs = [
            'A Recordings (Jenny)',
            'A Recordings (Rishi)', 
            'A Recordings (Marissa)',
            'A Recordings (Andrew)',
            'A Recordings (Juli)',
            'A Recordings (Aditi)',
            'B Recordings',
            'C Recordings'
        ];

        for (const tabName of multiTabs) {
            try {
                const response = await this.sheets.spreadsheets.values.get({
                    spreadsheetId: this.sheetId,
                    range: `'${tabName}'!A:Z`
                });

                const rows = response.data.values || [];
                if (rows.length > 1) {
                    const headers = rows[0];
                    const indices = this.findColumnIndices(headers);
                    
                    console.log(`   Loading ${tabName}: ${rows.length - 1} records`);
                    
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row || row.length === 0) continue;
                        
                        const uuid = indices.uuid >= 0 ? row[indices.uuid] : null;
                        if (uuid && this.isBase64Format(uuid)) {
                            const recording = {
                                uuid: uuid,
                                meetingId: indices.meetingId >= 0 ? row[indices.meetingId] : null,
                                topic: indices.topic >= 0 ? row[indices.topic] : '',
                                date: indices.date >= 0 ? row[indices.date] : '',
                                duration: indices.duration >= 0 ? row[indices.duration] : '',
                                host: indices.host >= 0 ? row[indices.host] : '',
                                participants: indices.participants >= 0 ? row[indices.participants] : '',
                                source: tabName,
                                rowNumber: i + 1
                            };
                            
                            this.recordingData.sheetsBase64.set(uuid, recording);
                        }
                    }
                }
            } catch (error) {
                console.log(`   ⚠️  Could not load ${tabName}: ${error.message}`);
            }
        }

        // Then load Raw/Standardized (these have hex UUIDs)
        const hexTabs = ['Raw Master Index', 'Standardized Master Index'];
        for (const tabName of hexTabs) {
            try {
                const response = await this.sheets.spreadsheets.values.get({
                    spreadsheetId: this.sheetId,
                    range: `'${tabName}'!A:Z`
                });

                const rows = response.data.values || [];
                if (rows.length > 1) {
                    const headers = rows[0];
                    const indices = this.findColumnIndices(headers);
                    
                    console.log(`   Loading ${tabName}: ${rows.length - 1} records (hex format)`);
                    
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row || row.length === 0) continue;
                        
                        const uuid = indices.uuid >= 0 ? row[indices.uuid] : null;
                        if (uuid && !this.isBase64Format(uuid)) {
                            const recording = {
                                hexUuid: uuid,
                                meetingId: indices.meetingId >= 0 ? row[indices.meetingId] : null,
                                topic: indices.topic >= 0 ? row[indices.topic] : '',
                                date: indices.date >= 0 ? row[indices.date] : '',
                                source: tabName
                            };
                            
                            this.recordingData.sheetsHex.set(uuid, recording);
                        }
                    }
                }
            } catch (error) {
                console.log(`   ⚠️  Could not load ${tabName}: ${error.message}`);
            }
        }

        console.log(`\n✅ Loaded ${this.recordingData.sheetsBase64.size} Base64 UUIDs`);
        console.log(`✅ Loaded ${this.recordingData.sheetsHex.size} Hex UUIDs`);
    }

    findColumnIndices(headers) {
        return {
            uuid: headers.findIndex(h => h && h.toLowerCase().includes('uuid')),
            meetingId: headers.findIndex(h => h && h.toLowerCase().includes('meeting') && h.toLowerCase().includes('id')),
            topic: headers.findIndex(h => h && h.toLowerCase().includes('topic')),
            date: headers.findIndex(h => h && h.toLowerCase().includes('date') || h.toLowerCase().includes('start')),
            duration: headers.findIndex(h => h && h.toLowerCase().includes('duration')),
            host: headers.findIndex(h => h && h.toLowerCase().includes('host') || h.toLowerCase().includes('coach')),
            participants: headers.findIndex(h => h && h.toLowerCase().includes('participant') || h.toLowerCase().includes('student'))
        };
    }

    isBase64Format(str) {
        // Base64 UUIDs contain alphanumeric + /= and are typically 22-24 chars
        return /^[A-Za-z0-9+/=]{20,}$/.test(str);
    }

    async loadDriveData() {
        console.log('\n☁️  Loading recordings from Google Drive with file metadata...\n');
        
        await this.scanDriveFolder(this.rootFolderId, '');
        
        console.log(`✅ Found ${this.recordingData.driveRecordings.size} recordings in Drive`);
    }

    async scanDriveFolder(folderId, path) {
        try {
            let pageToken = null;
            do {
                const response = await this.drive.files.list({
                    q: `'${folderId}' in parents and trashed = false`,
                    fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime)',
                    pageToken: pageToken,
                    pageSize: 1000
                });

                for (const item of response.data.files) {
                    if (item.mimeType === 'application/vnd.google-apps.folder') {
                        const folderPath = path ? `${path}/${item.name}` : item.name;
                        
                        // Check if this is a recording folder
                        const uuidMatch = item.name.match(/U[_:]([A-Za-z0-9+/=]+)/);
                        const meetingIdMatch = item.name.match(/M[_:](\d+)/);
                        
                        if (uuidMatch) {
                            const uuid = uuidMatch[1];
                            const recordingInfo = {
                                uuid: uuid,
                                meetingId: meetingIdMatch ? meetingIdMatch[1] : null,
                                folderId: item.id,
                                folderName: item.name,
                                path: folderPath,
                                files: [],
                                metadata: {}
                            };
                            
                            // Get files in this recording folder
                            const filesInFolder = await this.getRecordingFiles(item.id);
                            recordingInfo.files = filesInFolder.files;
                            recordingInfo.metadata = filesInFolder.metadata;
                            
                            this.recordingData.driveRecordings.set(uuid, recordingInfo);
                        } else {
                            // Recursively scan subfolders
                            await this.scanDriveFolder(item.id, folderPath);
                        }
                    }
                }
                
                pageToken = response.data.nextPageToken;
            } while (pageToken);
            
        } catch (error) {
            console.error(`Error scanning folder: ${error.message}`);
        }
    }

    async getRecordingFiles(folderId) {
        const files = [];
        const metadata = {};
        
        try {
            const response = await this.drive.files.list({
                q: `'${folderId}' in parents and trashed = false`,
                fields: 'files(id, name, size, mimeType, createdTime, modifiedTime)',
                pageSize: 100
            });
            
            for (const file of response.data.files) {
                files.push({
                    id: file.id,
                    name: file.name,
                    size: file.size,
                    mimeType: file.mimeType,
                    created: file.createdTime,
                    modified: file.modifiedTime
                });
                
                // Extract metadata from specific files
                if (file.name.includes('timeline') || file.name.includes('metadata')) {
                    metadata.hasTimeline = true;
                }
                if (file.name.includes('transcript')) {
                    metadata.hasTranscript = true;
                }
                if (file.name.includes('summary')) {
                    metadata.hasSummary = true;
                }
            }
        } catch (error) {
            console.error(`Error getting files for folder ${folderId}: ${error.message}`);
        }
        
        return { files, metadata };
    }

    async loadLocalData() {
        console.log('\n📁 Loading local recordings for content validation...\n');
        
        const outputDir = path.join(__dirname, 'output');
        
        try {
            const localDirs = await fs.readdir(outputDir);
            let count = 0;
            
            for (const dir of localDirs) {
                if (dir.includes('U:') || dir.includes('U_')) {
                    const uuidMatch = dir.match(/U[_:]([A-Za-z0-9+/=]+)/);
                    if (uuidMatch) {
                        const uuid = uuidMatch[1];
                        const fullPath = path.join(outputDir, dir);
                        
                        const localInfo = {
                            uuid: uuid,
                            directory: dir,
                            path: fullPath,
                            files: []
                        };
                        
                        // Get file list
                        const files = await fs.readdir(fullPath);
                        for (const file of files) {
                            const filePath = path.join(fullPath, file);
                            const stats = await fs.stat(filePath);
                            
                            localInfo.files.push({
                                name: file,
                                size: stats.size,
                                path: filePath
                            });
                        }
                        
                        this.recordingData.localRecordings.set(uuid, localInfo);
                        count++;
                    }
                }
            }
            
            console.log(`✅ Found ${count} local recordings`);
            
        } catch (error) {
            console.log(`⚠️  Could not read local directory: ${error.message}`);
        }
    }

    async performHighFidelityValidation() {
        console.log('\n\n🔍 PERFORMING HIGH FIDELITY VALIDATION...');
        console.log('================================================================================\n');
        
        let validated = 0;
        let found = 0;
        let notFound = 0;
        
        // Validate Base64 UUIDs from multi-tabs
        for (const [uuid, sheetRecording] of this.recordingData.sheetsBase64) {
            validated++;
            
            const driveRecording = this.recordingData.driveRecordings.get(uuid);
            const localRecording = this.recordingData.localRecordings.get(uuid);
            
            if (driveRecording) {
                found++;
                
                const validation = {
                    uuid: uuid,
                    topic: sheetRecording.topic,
                    date: sheetRecording.date,
                    meetingId: sheetRecording.meetingId,
                    status: 'FOUND',
                    driveFolder: driveRecording.folderName,
                    fileCount: driveRecording.files.length,
                    hasTranscript: driveRecording.metadata.hasTranscript,
                    hasTimeline: driveRecording.metadata.hasTimeline,
                    hasSummary: driveRecording.metadata.hasSummary,
                    localValidation: localRecording ? 'LOCAL_EXISTS' : 'NO_LOCAL'
                };
                
                // Validate file integrity
                if (localRecording && driveRecording) {
                    validation.fileSyncStatus = this.compareFiles(localRecording.files, driveRecording.files);
                }
                
                this.validationResults.matched.push(validation);
                
            } else {
                notFound++;
                
                // Try to find by meeting ID or content
                const alternateMatch = await this.findAlternateMatch(sheetRecording);
                
                this.validationResults.unmatched.push({
                    uuid: uuid,
                    topic: sheetRecording.topic,
                    date: sheetRecording.date,
                    meetingId: sheetRecording.meetingId,
                    source: sheetRecording.source,
                    status: 'NOT_FOUND',
                    alternateMatch: alternateMatch
                });
            }
            
            if (validated % 50 === 0) {
                console.log(`Progress: ${validated} recordings validated (${found} found, ${notFound} missing)`);
            }
        }
        
        // Try to map hex UUIDs to Base64
        console.log('\n📐 Attempting to map hex UUIDs to Base64...');
        await this.mapHexToBase64();
        
        console.log('\n✅ Validation complete!');
        console.log(`Total validated: ${validated}`);
        console.log(`Found in Drive: ${found}`);
        console.log(`Not found: ${notFound}`);
    }

    compareFiles(localFiles, driveFiles) {
        const localNames = new Set(localFiles.map(f => f.name.toLowerCase()));
        const driveNames = new Set(driveFiles.map(f => f.name.toLowerCase()));
        
        const missingInDrive = [];
        const missingLocally = [];
        
        for (const name of localNames) {
            if (!driveNames.has(name)) {
                missingInDrive.push(name);
            }
        }
        
        for (const name of driveNames) {
            if (!localNames.has(name)) {
                missingLocally.push(name);
            }
        }
        
        if (missingInDrive.length === 0 && missingLocally.length === 0) {
            return 'SYNCED';
        } else {
            return {
                status: 'OUT_OF_SYNC',
                missingInDrive: missingInDrive,
                missingLocally: missingLocally
            };
        }
    }

    async findAlternateMatch(recording) {
        // Try to find by meeting ID
        for (const [uuid, driveRec] of this.recordingData.driveRecordings) {
            if (driveRec.meetingId === recording.meetingId) {
                return {
                    method: 'MEETING_ID_MATCH',
                    uuid: uuid,
                    folder: driveRec.folderName
                };
            }
        }
        
        // Try to find by topic and date
        const recordingDate = new Date(recording.date).toDateString();
        for (const [uuid, driveRec] of this.recordingData.driveRecordings) {
            if (driveRec.folderName.includes(recording.topic.replace(/\s+/g, '_'))) {
                const folderDate = this.extractDateFromFolder(driveRec.folderName);
                if (folderDate && new Date(folderDate).toDateString() === recordingDate) {
                    return {
                        method: 'TOPIC_DATE_MATCH',
                        uuid: uuid,
                        folder: driveRec.folderName
                    };
                }
            }
        }
        
        return null;
    }

    extractDateFromFolder(folderName) {
        const dateMatch = folderName.match(/(\d{4}-\d{2}-\d{2})/);
        return dateMatch ? dateMatch[1] : null;
    }

    async mapHexToBase64() {
        let mapped = 0;
        
        for (const [hexUuid, hexRecording] of this.recordingData.sheetsHex) {
            // Try to find a Base64 recording with matching topic/date
            for (const [base64Uuid, base64Recording] of this.recordingData.sheetsBase64) {
                if (hexRecording.topic === base64Recording.topic && 
                    hexRecording.date === base64Recording.date) {
                    this.validationResults.uuidMappings.set(hexUuid, base64Uuid);
                    mapped++;
                    break;
                }
            }
        }
        
        console.log(`   Mapped ${mapped} hex UUIDs to Base64 format`);
    }

    async generateReport() {
        console.log('\n\n📊 GENERATING HIGH FIDELITY VALIDATION REPORT...');
        console.log('================================================================================\n');
        
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalInSheets: this.recordingData.sheetsBase64.size,
                totalInDrive: this.recordingData.driveRecordings.size,
                matched: this.validationResults.matched.length,
                unmatched: this.validationResults.unmatched.length,
                hexMappings: this.validationResults.uuidMappings.size
            },
            criticalIssues: {
                notFoundInDrive: this.validationResults.unmatched.filter(r => !r.alternateMatch),
                foundWithAlternateMethod: this.validationResults.unmatched.filter(r => r.alternateMatch)
            },
            fileIntegrity: {
                synced: this.validationResults.matched.filter(r => r.fileSyncStatus === 'SYNCED').length,
                outOfSync: this.validationResults.matched.filter(r => r.fileSyncStatus && r.fileSyncStatus !== 'SYNCED').length
            }
        };
        
        // Display critical findings
        if (report.criticalIssues.notFoundInDrive.length > 0) {
            console.log('❌ RECORDINGS NOT FOUND IN DRIVE:');
            console.log('================================================================================');
            report.criticalIssues.notFoundInDrive.forEach((rec, idx) => {
                console.log(`\n${idx + 1}. ${rec.topic}`);
                console.log(`   UUID: ${rec.uuid}`);
                console.log(`   Meeting ID: ${rec.meetingId || 'N/A'}`);
                console.log(`   Date: ${rec.date}`);
                console.log(`   Source: ${rec.source}`);
            });
        }
        
        if (report.criticalIssues.foundWithAlternateMethod.length > 0) {
            console.log('\n\n⚠️  RECORDINGS FOUND WITH ALTERNATE MATCHING:');
            console.log('================================================================================');
            report.criticalIssues.foundWithAlternateMethod.forEach((rec, idx) => {
                console.log(`\n${idx + 1}. ${rec.topic}`);
                console.log(`   Original UUID: ${rec.uuid}`);
                console.log(`   Found by: ${rec.alternateMatch.method}`);
                console.log(`   Actual folder: ${rec.alternateMatch.folder}`);
            });
        }
        
        // Save detailed report
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = `validation-reports/high-fidelity-validation-${timestamp}.json`;
        await fs.writeFile(reportPath, JSON.stringify({
            report,
            matched: this.validationResults.matched,
            unmatched: this.validationResults.unmatched,
            uuidMappings: Array.from(this.validationResults.uuidMappings.entries())
        }, null, 2));
        
        console.log('\n\n📈 VALIDATION SUMMARY:');
        console.log('================================================================================');
        console.log(`Total recordings in sheets: ${report.summary.totalInSheets}`);
        console.log(`Total recordings in Drive: ${report.summary.totalInDrive}`);
        console.log(`Successfully matched: ${report.summary.matched}`);
        console.log(`Not found: ${report.criticalIssues.notFoundInDrive.length}`);
        console.log(`Found with alternate method: ${report.criticalIssues.foundWithAlternateMethod.length}`);
        console.log(`Files synced: ${report.fileIntegrity.synced}`);
        console.log(`Files out of sync: ${report.fileIntegrity.outOfSync}`);
        
        console.log(`\n📄 Detailed report saved to: ${reportPath}`);
        
        return report;
    }
}

// Main execution
async function main() {
    const validator = new HighFidelityValidator();
    
    try {
        await validator.initialize();
        await validator.loadSheetsData();
        await validator.loadDriveData();
        await validator.loadLocalData();
        await validator.performHighFidelityValidation();
        
        const report = await validator.generateReport();
        
        if (report.criticalIssues.notFoundInDrive.length === 0) {
            console.log('\n\n🎉 EXCELLENT! All recordings with Base64 UUIDs are properly stored in Google Drive!');
        } else {
            console.log('\n\n⚠️  Some recordings need attention. Please review the detailed report.');
        }
        
    } catch (error) {
        console.error('❌ Validation failed:', error);
        console.error(error.stack);
    }
}

main().catch(console.error);