#!/usr/bin/env node
require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class QuickFileValidator {
    constructor() {
        this.drive = null;
        this.rootFolderId = '1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg';
        this.results = {
            checked: 0,
            perfectMatch: 0,
            partialMatch: 0,
            missingFiles: 0,
            examples: []
        };
    }

    async initialize() {
        console.log('🚀 Quick File Validator\n');
        
        const auth = new google.auth.GoogleAuth({
            keyFile: 'google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/drive']
        });

        const authClient = await auth.getClient();
        this.drive = google.drive({ version: 'v3', auth: authClient });
    }

    async checkSampleRecordings() {
        // Sample UUIDs from different sources
        const sampleUUIDs = [
            { uuid: 'q1vssnKNRc6CQUGD9T+wEQ==', topic: 'Aarav Coach meeting' },
            { uuid: '4kXv5NIMSDqpJxDjX_u44Q==', topic: 'Jenny & Arshiya Week 16' },
            { uuid: 'DurBLQiwS+G0jXatfHAbpg==', topic: 'Kavya & Aditi Week 29' },
            { uuid: '_W_kf2WESdSs7HU7gLBRqA==', topic: 'Jenny & Arshiya' },
            { uuid: 'RT+fE4kpQGu9io0+9yJmJQ==', topic: 'Kavya & Aditi' },
            { uuid: 'fdL2iHfPSaWbalVgrtmPfA==', topic: 'Coach Interview' },
            { uuid: 'GIFauUWFSRSb6Va8E6qomw==', topic: 'Beya Session' },
            { uuid: 'v84qb4woSTCxe_GyW1Aq5g==', topic: 'Jenny & Anoushka Week 3' }
        ];

        console.log('📋 Checking sample recordings for file completeness...\n');

        for (const sample of sampleUUIDs) {
            await this.checkRecording(sample.uuid, sample.topic);
        }

        // Print summary
        console.log('\n\n📊 QUICK VALIDATION SUMMARY');
        console.log('================================================================================');
        console.log(`Total recordings checked: ${this.results.checked}`);
        console.log(`✅ Perfect match (all expected files): ${this.results.perfectMatch}`);
        console.log(`⚠️  Partial match (some files): ${this.results.partialMatch}`);
        console.log(`❌ Missing critical files: ${this.results.missingFiles}`);

        if (this.results.examples.length > 0) {
            console.log('\n\nDETAILS:');
            for (const example of this.results.examples) {
                console.log(`\n${example.topic} (${example.uuid})`);
                console.log(`  Status: ${example.status}`);
                console.log(`  Files found: ${example.filesFound.join(', ')}`);
                if (example.missing.length > 0) {
                    console.log(`  Missing: ${example.missing.join(', ')}`);
                }
            }
        }
    }

    async checkRecording(uuid, topic) {
        this.results.checked++;
        
        try {
            // Try both original and escaped UUID
            const uuidsToTry = [
                uuid,
                uuid.replace(/\//g, '_'),
                uuid.replace(/_/g, '/')
            ];

            let folderFound = false;
            let files = [];
            
            for (const testUuid of uuidsToTry) {
                const searchQuery = `name contains 'U:${testUuid}' and mimeType = 'application/vnd.google-apps.folder' and '${this.rootFolderId}' in parents and trashed = false`;
                
                const response = await this.drive.files.list({
                    q: searchQuery,
                    fields: 'files(id, name)',
                    pageSize: 10
                });

                if (response.data.files && response.data.files.length > 0) {
                    const folder = response.data.files[0];
                    folderFound = true;
                    
                    // Get files in this folder
                    const filesResponse = await this.drive.files.list({
                        q: `'${folder.id}' in parents and trashed = false`,
                        fields: 'files(name, size, mimeType)',
                        pageSize: 100
                    });
                    
                    files = filesResponse.data.files || [];
                    break;
                }
            }

            if (!folderFound) {
                // Search recursively
                const found = await this.searchRecursively(uuid);
                if (found) {
                    folderFound = true;
                    files = found.files;
                }
            }

            // Analyze files
            const fileTypes = {
                video: files.some(f => f.name.toLowerCase().includes('.mp4')),
                audio: files.some(f => f.name.toLowerCase().includes('.m4a')),
                transcript: files.some(f => f.name.toLowerCase().includes('.vtt')),
                chat: files.some(f => f.name.toLowerCase().includes('chat') && f.name.toLowerCase().includes('.txt'))
            };

            const filesFound = [];
            const missing = [];
            
            if (fileTypes.video) filesFound.push('VIDEO');
            else missing.push('VIDEO');
            
            if (fileTypes.audio) filesFound.push('AUDIO');
            else missing.push('AUDIO');
            
            if (fileTypes.transcript) filesFound.push('TRANSCRIPT');
            else missing.push('TRANSCRIPT');
            
            if (fileTypes.chat) filesFound.push('CHAT');

            let status;
            if (filesFound.length === 0) {
                status = 'NO_FILES';
                this.results.missingFiles++;
            } else if (missing.length === 0 || (missing.length === 1 && missing[0] === 'TRANSCRIPT')) {
                status = 'COMPLETE';
                this.results.perfectMatch++;
            } else {
                status = 'PARTIAL';
                this.results.partialMatch++;
            }

            this.results.examples.push({
                uuid: uuid,
                topic: topic,
                status: status,
                filesFound: filesFound,
                missing: missing,
                totalFiles: files.length
            });

            console.log(`✓ ${topic}: ${status} (${filesFound.length} core files)`);

        } catch (error) {
            console.log(`✗ ${topic}: ERROR - ${error.message}`);
            this.results.missingFiles++;
        }
    }

    async searchRecursively(uuid) {
        const uuidsToSearch = [
            uuid,
            uuid.replace(/\//g, '_'),
            uuid.replace(/_/g, '/')
        ];

        for (const searchUuid of uuidsToSearch) {
            try {
                const response = await this.drive.files.list({
                    q: `name contains '${searchUuid}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                    fields: 'files(id, name, parents)',
                    pageSize: 10
                });

                if (response.data.files && response.data.files.length > 0) {
                    const folder = response.data.files[0];
                    
                    // Get files
                    const filesResponse = await this.drive.files.list({
                        q: `'${folder.id}' in parents and trashed = false`,
                        fields: 'files(name, size, mimeType)',
                        pageSize: 100
                    });
                    
                    return {
                        folder: folder,
                        files: filesResponse.data.files || []
                    };
                }
            } catch (error) {
                // Continue searching
            }
        }
        
        return null;
    }
}

// Main execution
async function main() {
    const validator = new QuickFileValidator();
    
    try {
        await validator.initialize();
        await validator.checkSampleRecordings();
    } catch (error) {
        console.error('❌ Validation failed:', error);
    }
}

main().catch(console.error);