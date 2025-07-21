#!/usr/bin/env node
require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parse/sync');

class ZoomCloudToDriveValidator {
    constructor() {
        this.drive = null;
        this.rootFolderId = '1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg';
        this.data = {
            zoomRecordings: new Map(),
            driveRecordings: new Map(),
            localFiles: new Map()
        };
        this.results = {
            perfectMatch: [],
            missingFiles: [],
            extraFiles: [],
            notInDrive: [],
            summary: {}
        };
    }

    async initialize() {
        console.log('🚀 Zoom Cloud to Drive File Validator\n');
        console.log('This validator ensures Google Drive has all files that exist in Zoom Cloud\n');
        
        const auth = new google.auth.GoogleAuth({
            keyFile: 'google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/drive']
        });

        const authClient = await auth.getClient();
        this.drive = google.drive({ version: 'v3', auth: authClient });
    }

    async loadLocalOutputFiles() {
        console.log('📁 Loading local output files (our source of truth for Zoom Cloud contents)...\n');
        
        const outputDir = path.join(__dirname, 'output');
        
        try {
            const dirs = await fs.readdir(outputDir);
            let count = 0;
            
            for (const dir of dirs) {
                const uuidMatch = dir.match(/U[_:]([A-Za-z0-9+/=]+)/);
                if (uuidMatch) {
                    const uuid = uuidMatch[1].replace(/_/g, '/');
                    const fullPath = path.join(outputDir, dir);
                    
                    try {
                        const files = await fs.readdir(fullPath);
                        const fileTypes = {
                            hasVideo: false,
                            hasAudio: false,
                            hasTranscript: false,
                            hasChat: false,
                            hasSummary: false,
                            allFiles: []
                        };
                        
                        for (const file of files) {
                            const lower = file.toLowerCase();
                            if (lower.includes('.mp4')) fileTypes.hasVideo = true;
                            if (lower.includes('.m4a')) fileTypes.hasAudio = true;
                            if (lower.includes('.vtt')) fileTypes.hasTranscript = true;
                            if (lower.includes('chat') && lower.includes('.txt')) fileTypes.hasChat = true;
                            if (lower.includes('summary')) fileTypes.hasSummary = true;
                            
                            // Don't count summary files as Zoom Cloud files
                            if (!lower.includes('summary')) {
                                fileTypes.allFiles.push(file);
                            }
                        }
                        
                        this.data.localFiles.set(uuid, {
                            directory: dir,
                            ...fileTypes
                        });
                        count++;
                    } catch (error) {
                        // Directory might be empty or inaccessible
                    }
                }
            }
            
            console.log(`   ✅ Found ${count} local recording directories`);
            console.log(`   These represent what was downloaded from Zoom Cloud\n`);
            
        } catch (error) {
            console.log(`   ⚠️  Could not read local output directory: ${error.message}`);
        }
    }

    async loadDriveRecordings() {
        console.log('☁️  Loading Google Drive recordings...\n');
        
        // Load from the fuzzy validation results
        const validationPath = 'validation-reports/smart-fuzzy-validation-2025-07-10T23-21-14-527Z.json';
        const validationData = JSON.parse(await fs.readFile(validationPath, 'utf-8'));
        
        const allMatches = [
            ...(validationData.exactMatches || []),
            ...(validationData.fuzzyMatches || [])
        ];
        
        console.log(`   Loading ${allMatches.length} matched recordings from validation report...`);
        
        let processed = 0;
        for (const match of allMatches) {
            if (match.driveFolder) {
                await this.loadDriveFiles(match);
                processed++;
                if (processed % 50 === 0) {
                    console.log(`   Progress: ${processed}/${allMatches.length} recordings loaded`);
                }
            }
        }
        
        console.log(`\n   ✅ Loaded ${this.data.driveRecordings.size} recordings from Drive\n`);
    }

    async loadDriveFiles(match) {
        try {
            // Search for the folder
            const response = await this.drive.files.list({
                q: `name = '${match.driveFolder}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'files(id, name)',
                pageSize: 1
            });

            if (!response.data.files || response.data.files.length === 0) {
                return;
            }

            const folder = response.data.files[0];
            
            // Get files in folder
            const filesResponse = await this.drive.files.list({
                q: `'${folder.id}' in parents and trashed = false`,
                fields: 'files(name, size, mimeType)',
                pageSize: 100
            });

            const files = filesResponse.data.files || [];
            
            const fileTypes = {
                hasVideo: false,
                hasAudio: false,
                hasTranscript: false,
                hasChat: false,
                allFiles: []
            };
            
            for (const file of files) {
                const lower = file.name.toLowerCase();
                if (lower.includes('.mp4')) fileTypes.hasVideo = true;
                if (lower.includes('.m4a')) fileTypes.hasAudio = true;
                if (lower.includes('.vtt')) fileTypes.hasTranscript = true;
                if (lower.includes('chat') && lower.includes('.txt')) fileTypes.hasChat = true;
                
                // Store file types for comparison
                if (lower.includes('.mp4')) fileTypes.allFiles.push('VIDEO');
                else if (lower.includes('.m4a')) fileTypes.allFiles.push('AUDIO');
                else if (lower.includes('.vtt')) fileTypes.allFiles.push('TRANSCRIPT');
                else if (lower.includes('chat') && lower.includes('.txt')) fileTypes.allFiles.push('CHAT');
            }
            
            // Store with normalized UUID
            const normalizedUuid = match.uuid.replace(/\//g, '_');
            this.data.driveRecordings.set(normalizedUuid, {
                ...match,
                ...fileTypes,
                folderName: match.driveFolder
            });
            
            // Also store with original UUID
            this.data.driveRecordings.set(match.uuid, {
                ...match,
                ...fileTypes,
                folderName: match.driveFolder
            });

        } catch (error) {
            console.error(`Error loading ${match.driveFolder}: ${error.message}`);
        }
    }

    async validateRecordings() {
        console.log('🔍 VALIDATING: Comparing Zoom Cloud files (local) vs Google Drive...\n');
        
        let perfectCount = 0;
        let missingCount = 0;
        let notInDriveCount = 0;
        
        for (const [uuid, localData] of this.data.localFiles) {
            // Skip if only summary files
            if (localData.allFiles.length === 0) {
                continue;
            }
            
            // Find in Drive
            const driveData = this.data.driveRecordings.get(uuid) || 
                           this.data.driveRecordings.get(uuid.replace(/\//g, '_'));
            
            if (!driveData) {
                this.results.notInDrive.push({
                    uuid: uuid,
                    directory: localData.directory,
                    zoomFiles: localData.allFiles
                });
                notInDriveCount++;
                continue;
            }
            
            // Compare files
            const zoomHasVideo = localData.hasVideo;
            const zoomHasAudio = localData.hasAudio;
            const zoomHasTranscript = localData.hasTranscript;
            const zoomHasChat = localData.hasChat;
            
            const driveHasVideo = driveData.hasVideo;
            const driveHasAudio = driveData.hasAudio;
            const driveHasTranscript = driveData.hasTranscript;
            const driveHasChat = driveData.hasChat;
            
            // Check if Drive has all files that exist in Zoom
            const missingVideo = zoomHasVideo && !driveHasVideo;
            const missingAudio = zoomHasAudio && !driveHasAudio;
            const missingTranscript = zoomHasTranscript && !driveHasTranscript;
            const missingChat = zoomHasChat && !driveHasChat;
            
            if (!missingVideo && !missingAudio && !missingTranscript && !missingChat) {
                perfectCount++;
                this.results.perfectMatch.push({
                    uuid: uuid,
                    topic: driveData.topic,
                    folder: driveData.folderName,
                    zoomFiles: localData.allFiles.join(', ')
                });
            } else {
                missingCount++;
                const missing = [];
                if (missingVideo) missing.push('VIDEO');
                if (missingAudio) missing.push('AUDIO');
                if (missingTranscript) missing.push('TRANSCRIPT');
                if (missingChat) missing.push('CHAT');
                
                this.results.missingFiles.push({
                    uuid: uuid,
                    topic: driveData.topic,
                    folder: driveData.folderName,
                    missingInDrive: missing,
                    zoomHas: `Video: ${zoomHasVideo}, Audio: ${zoomHasAudio}, Transcript: ${zoomHasTranscript}`,
                    driveHas: `Video: ${driveHasVideo}, Audio: ${driveHasAudio}, Transcript: ${driveHasTranscript}`
                });
            }
        }
        
        this.results.summary = {
            totalZoomRecordings: this.data.localFiles.size,
            perfectMatch: perfectCount,
            missingFiles: missingCount,
            notInDrive: notInDriveCount,
            matchRate: ((perfectCount / this.data.localFiles.size) * 100).toFixed(1)
        };
    }

    async generateReport() {
        console.log('\n================================================================================');
        console.log('📊 ZOOM CLOUD TO DRIVE VALIDATION REPORT');
        console.log('================================================================================\n');

        console.log('SUMMARY:');
        console.log(`Total Zoom recordings (local): ${this.results.summary.totalZoomRecordings}`);
        console.log(`\n✅ Perfect match (all Zoom files in Drive): ${this.results.summary.perfectMatch} (${this.results.summary.matchRate}%)`);
        console.log(`⚠️  Missing some files in Drive: ${this.results.summary.missingFiles}`);
        console.log(`❌ Not found in Drive at all: ${this.results.summary.notInDrive}`);

        if (this.results.missingFiles.length > 0) {
            console.log('\n\n⚠️  RECORDINGS WITH MISSING FILES (First 10):');
            console.log('================================================================================');
            
            this.results.missingFiles.slice(0, 10).forEach((rec, idx) => {
                console.log(`\n${idx + 1}. ${rec.topic}`);
                console.log(`   UUID: ${rec.uuid}`);
                console.log(`   Missing in Drive: ${rec.missingInDrive.join(', ')}`);
                console.log(`   Zoom has: ${rec.zoomHas}`);
                console.log(`   Drive has: ${rec.driveHas}`);
            });
            
            if (this.results.missingFiles.length > 10) {
                console.log(`\n... and ${this.results.missingFiles.length - 10} more recordings with missing files`);
            }
        }

        if (this.results.notInDrive.length > 0) {
            console.log('\n\n❌ RECORDINGS NOT IN DRIVE (First 10):');
            console.log('================================================================================');
            
            this.results.notInDrive.slice(0, 10).forEach((rec, idx) => {
                console.log(`\n${idx + 1}. ${rec.directory}`);
                console.log(`   UUID: ${rec.uuid}`);
                console.log(`   Zoom files: ${rec.zoomFiles.join(', ')}`);
            });
        }

        // Save detailed report
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = `validation-reports/zoom-cloud-to-drive-validation-${timestamp}.json`;
        
        await fs.writeFile(reportPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            summary: this.results.summary,
            perfectMatch: this.results.perfectMatch.slice(0, 100),
            missingFiles: this.results.missingFiles,
            notInDrive: this.results.notInDrive
        }, null, 2));

        console.log(`\n\n📄 Detailed report saved to: ${reportPath}`);
        
        console.log('\n\n🎯 KEY FINDINGS:');
        console.log(`- ${this.results.summary.matchRate}% of Zoom recordings have all their files in Google Drive`);
        console.log(`- ${this.results.summary.missingFiles} recordings are missing some files that exist in Zoom`);
        console.log(`- ${this.results.summary.notInDrive} recordings from Zoom are not in Drive at all`);
        
        if (parseFloat(this.results.summary.matchRate) === 100) {
            console.log('\n✅ PERFECT! All Zoom Cloud files are properly stored in Google Drive!');
        } else {
            console.log(`\n⚠️  Action needed: ${this.results.summary.missingFiles + this.results.summary.notInDrive} recordings need attention`);
        }
    }
}

// Main execution
async function main() {
    const validator = new ZoomCloudToDriveValidator();
    
    try {
        await validator.initialize();
        await validator.loadLocalOutputFiles();
        await validator.loadDriveRecordings();
        await validator.validateRecordings();
        await validator.generateReport();
        
    } catch (error) {
        console.error('❌ Validation failed:', error);
        console.error(error.stack);
    }
}

main().catch(console.error);