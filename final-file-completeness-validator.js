#!/usr/bin/env node
require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class FileCompletenessValidator {
    constructor() {
        this.drive = null;
        this.rootFolderId = '1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg';
        this.results = {
            totalChecked: 0,
            complete: 0,
            missingChat: 0,
            missingOtherFiles: 0,
            examples: []
        };
    }

    async initialize() {
        console.log('📊 Final File Completeness Validator\n');
        console.log('Checking if Google Drive has all files that exist in Zoom Cloud\n');
        console.log('Based on the 178 matched recordings from validation report\n');
        
        const auth = new google.auth.GoogleAuth({
            keyFile: 'google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/drive']
        });

        const authClient = await auth.getClient();
        this.drive = google.drive({ version: 'v3', auth: authClient });
    }

    async validateMatchedRecordings() {
        // Load the matched recordings from validation
        const validationPath = 'validation-reports/smart-fuzzy-validation-2025-07-10T23-21-14-527Z.json';
        const validationData = JSON.parse(await fs.readFile(validationPath, 'utf-8'));
        
        const allMatches = [
            ...(validationData.exactMatches || []),
            ...(validationData.fuzzyMatches || [])
        ];

        console.log(`🔍 Validating ${allMatches.length} matched recordings...\n`);

        for (const match of allMatches) {
            await this.checkRecording(match);
            
            this.results.totalChecked++;
            if (this.results.totalChecked % 50 === 0) {
                console.log(`Progress: ${this.results.totalChecked}/${allMatches.length} recordings checked`);
            }
        }

        await this.generateReport();
    }

    async checkRecording(match) {
        // Check local files first
        const localPath = await this.findLocalFiles(match.uuid, match.meetingId);
        if (!localPath) {
            // No local files = can't compare, assume complete
            this.results.complete++;
            return;
        }

        // Get Drive files
        const driveFiles = await this.getDriveFiles(match.driveFolder);
        if (!driveFiles) {
            this.results.missingOtherFiles++;
            return;
        }

        // Compare files
        const comparison = this.compareFiles(localPath.files, driveFiles);
        
        if (comparison.isComplete) {
            this.results.complete++;
        } else if (comparison.onlyMissingChat) {
            this.results.missingChat++;
        } else {
            this.results.missingOtherFiles++;
            
            // Store example
            if (this.results.examples.length < 10) {
                this.results.examples.push({
                    uuid: match.uuid,
                    topic: match.topic,
                    folder: match.driveFolder,
                    localFiles: localPath.files,
                    driveFiles: driveFiles.map(f => f.name),
                    missing: comparison.missing
                });
            }
        }
    }

    async findLocalFiles(uuid, meetingId) {
        const outputDir = path.join(__dirname, 'output');
        
        // Try different UUID formats
        const possibleDirs = [
            `M:${meetingId}U:${uuid}`,
            `M:${meetingId}U:${uuid.replace(/\//g, '_')}`,
            `M:${meetingId}U:${uuid.replace(/_/g, '/')}`
        ];

        for (const dir of possibleDirs) {
            const fullPath = path.join(outputDir, dir);
            try {
                const files = await fs.readdir(fullPath);
                return { directory: dir, files: files.filter(f => !f.includes('summary')) };
            } catch (error) {
                // Try next format
            }
        }

        // Try searching by meeting ID only
        try {
            const allDirs = await fs.readdir(outputDir);
            const matchingDir = allDirs.find(d => d.includes(`M:${meetingId}U:`));
            
            if (matchingDir) {
                const fullPath = path.join(outputDir, matchingDir);
                const files = await fs.readdir(fullPath);
                return { directory: matchingDir, files: files.filter(f => !f.includes('summary')) };
            }
        } catch (error) {
            // No local files found
        }

        return null;
    }

    async getDriveFiles(folderName) {
        try {
            const response = await this.drive.files.list({
                q: `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'files(id, name)',
                pageSize: 1
            });

            if (!response.data.files || response.data.files.length === 0) {
                return null;
            }

            const folder = response.data.files[0];
            
            const filesResponse = await this.drive.files.list({
                q: `'${folder.id}' in parents and trashed = false`,
                fields: 'files(name, size)',
                pageSize: 100
            });

            return filesResponse.data.files || [];
        } catch (error) {
            return null;
        }
    }

    compareFiles(localFiles, driveFiles) {
        const result = {
            isComplete: true,
            onlyMissingChat: false,
            missing: []
        };

        // Check each local file type
        const hasLocalVideo = localFiles.some(f => f.toLowerCase().includes('.mp4'));
        const hasLocalAudio = localFiles.some(f => f.toLowerCase().includes('.m4a'));
        const hasLocalTranscript = localFiles.some(f => f.toLowerCase().includes('.vtt'));
        const hasLocalChat = localFiles.some(f => f.toLowerCase().includes('chat') && f.toLowerCase().includes('.txt'));

        const hasDriveVideo = driveFiles.some(f => f.name.toLowerCase().includes('.mp4'));
        const hasDriveAudio = driveFiles.some(f => f.name.toLowerCase().includes('.m4a'));
        const hasDriveTranscript = driveFiles.some(f => f.name.toLowerCase().includes('.vtt'));
        const hasDriveChat = driveFiles.some(f => f.name.toLowerCase().includes('chat') && f.name.toLowerCase().includes('.txt'));

        if (hasLocalVideo && !hasDriveVideo) {
            result.isComplete = false;
            result.missing.push('VIDEO');
        }
        if (hasLocalAudio && !hasDriveAudio) {
            result.isComplete = false;
            result.missing.push('AUDIO');
        }
        if (hasLocalTranscript && !hasDriveTranscript) {
            result.isComplete = false;
            result.missing.push('TRANSCRIPT');
        }
        if (hasLocalChat && !hasDriveChat) {
            result.isComplete = false;
            result.missing.push('CHAT');
            
            // Check if ONLY chat is missing
            if (result.missing.length === 1) {
                result.onlyMissingChat = true;
            }
        }

        return result;
    }

    async generateReport() {
        console.log('\n\n================================================================================');
        console.log('📊 FINAL FILE COMPLETENESS REPORT');
        console.log('================================================================================\n');

        const completeRate = ((this.results.complete / this.results.totalChecked) * 100).toFixed(1);
        const chatOnlyRate = ((this.results.missingChat / this.results.totalChecked) * 100).toFixed(1);
        const otherMissingRate = ((this.results.missingOtherFiles / this.results.totalChecked) * 100).toFixed(1);

        console.log('SUMMARY:');
        console.log(`Total matched recordings checked: ${this.results.totalChecked}`);
        console.log(`\n✅ Complete (all Zoom files in Drive): ${this.results.complete} (${completeRate}%)`);
        console.log(`💬 Only missing chat files: ${this.results.missingChat} (${chatOnlyRate}%)`);
        console.log(`⚠️  Missing video/audio/transcript: ${this.results.missingOtherFiles} (${otherMissingRate}%)`);

        if (this.results.examples.length > 0) {
            console.log('\n\n⚠️  EXAMPLES OF RECORDINGS WITH MISSING FILES:');
            console.log('================================================================================');
            
            for (const example of this.results.examples) {
                console.log(`\n${example.topic}`);
                console.log(`UUID: ${example.uuid}`);
                console.log(`Missing: ${example.missing.join(', ')}`);
                console.log(`Local files: ${example.localFiles.length} files`);
                console.log(`Drive files: ${example.driveFiles.length} files`);
            }
        }

        // Save report
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = `validation-reports/final-file-completeness-${timestamp}.json`;
        
        await fs.writeFile(reportPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            summary: {
                totalChecked: this.results.totalChecked,
                complete: this.results.complete,
                completeRate: completeRate,
                missingChat: this.results.missingChat,
                missingOtherFiles: this.results.missingOtherFiles
            },
            examples: this.results.examples
        }, null, 2));

        console.log(`\n\n📄 Report saved to: ${reportPath}`);

        console.log('\n\n🎯 CONCLUSION:');
        if (this.results.missingOtherFiles === 0) {
            console.log('✅ EXCELLENT! All video, audio, and transcript files from Zoom Cloud are in Google Drive!');
            if (this.results.missingChat > 0) {
                console.log(`📝 Note: ${this.results.missingChat} recordings are only missing chat files (non-critical)`);
            }
        } else {
            console.log(`⚠️  ${this.results.missingOtherFiles} recordings are missing critical files (video/audio/transcript)`);
            console.log('These need to be investigated and potentially re-downloaded from Zoom Cloud');
        }

        const effectiveCompleteRate = (((this.results.complete + this.results.missingChat) / this.results.totalChecked) * 100).toFixed(1);
        console.log(`\n📊 Effective completeness (excluding chat-only issues): ${effectiveCompleteRate}%`);
    }
}

// Main execution
async function main() {
    const validator = new FileCompletenessValidator();
    
    try {
        await validator.initialize();
        await validator.validateMatchedRecordings();
    } catch (error) {
        console.error('❌ Validation failed:', error);
    }
}

main().catch(console.error);