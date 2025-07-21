#!/usr/bin/env node
require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class DriveFileStandardizer {
    constructor() {
        this.drive = null;
        this.rootFolderId = '1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg';
        this.stats = {
            totalFolders: 0,
            totalFiles: 0,
            filesRenamed: 0,
            filesSkipped: 0,
            errors: []
        };
        this.dryRun = true; // Set to false to actually rename files
    }

    async initialize() {
        console.log('🚀 Google Drive File Name Standardizer\n');
        console.log(`Mode: ${this.dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE MODE (files will be renamed)'}\n`);
        console.log('This script will rename all files to match their folder names\n');
        
        const auth = new google.auth.GoogleAuth({
            keyFile: 'google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/drive']
        });

        const authClient = await auth.getClient();
        this.drive = google.drive({ version: 'v3', auth: authClient });
    }

    async scanAndRename() {
        console.log('📂 Starting recursive scan from Ivylevel Knowledge Base...\n');
        
        const startTime = Date.now();
        await this.processFolder(this.rootFolderId, 'Ivylevel Knowledge Base', 0);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        
        console.log(`\n⏱️  Scan completed in ${duration} seconds`);
        
        await this.generateReport();
    }

    async processFolder(folderId, folderName, depth) {
        if (depth > 10) return; // Safety limit
        
        this.stats.totalFolders++;
        
        // Show progress every 10 folders
        if (this.stats.totalFolders % 10 === 0) {
            console.log(`   Progress: ${this.stats.totalFolders} folders scanned...`);
        }
        
        // Check if this is a recording folder (contains UUID pattern)
        const isRecordingFolder = /U[_:]([A-Za-z0-9+/=]+)/.test(folderName);
        
        if (isRecordingFolder) {
            await this.processRecordingFolder(folderId, folderName);
        }
        
        // Get subfolders
        try {
            let pageToken = null;
            do {
                const response = await this.drive.files.list({
                    q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                    fields: 'nextPageToken, files(id, name)',
                    pageToken: pageToken,
                    pageSize: 100
                });

                for (const folder of response.data.files) {
                    await this.processFolder(folder.id, folder.name, depth + 1);
                }
                
                pageToken = response.data.nextPageToken;
            } while (pageToken);
            
        } catch (error) {
            console.error(`Error processing folder ${folderName}: ${error.message}`);
            this.stats.errors.push({
                folder: folderName,
                error: error.message
            });
        }
    }

    async processRecordingFolder(folderId, folderName) {
        try {
            // Get all files in this folder
            const response = await this.drive.files.list({
                q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'files(id, name, mimeType)',
                pageSize: 100
            });

            const files = response.data.files || [];
            console.log(`   Found ${files.length} files`);
            
            let renamedCount = 0;
            
            for (const file of files) {
                this.stats.totalFiles++;
                
                // Check if file already has the folder name as prefix
                if (file.name.startsWith(folderName)) {
                    this.stats.filesSkipped++;
                    continue;
                }
                
                // Determine the new name
                const newName = this.createStandardizedName(folderName, file.name);
                
                if (!this.dryRun) {
                    try {
                        await this.drive.files.update({
                            fileId: file.id,
                            requestBody: {
                                name: newName
                            }
                        });
                        renamedCount++;
                        this.stats.filesRenamed++;
                    } catch (error) {
                        console.error(`   ❌ Failed to rename ${file.name}: ${error.message}`);
                        this.stats.errors.push({
                            file: file.name,
                            folder: folderName,
                            error: error.message
                        });
                    }
                } else {
                    renamedCount++;
                    this.stats.filesRenamed++;
                }
            }
            
            if (this.stats.totalFiles % 100 === 0) {
                console.log(`   Progress: ${this.stats.totalFiles} files processed, ${this.stats.filesRenamed} to be renamed...`);
            }
            
        } catch (error) {
            console.error(`Error processing recording folder ${folderName}: ${error.message}`);
            this.stats.errors.push({
                folder: folderName,
                error: error.message
            });
        }
    }

    createStandardizedName(folderName, fileName) {
        // If file already starts with a similar pattern, extract just the file type
        if (fileName.includes('_M_') && fileName.includes('U_')) {
            // Extract just the file extension and type
            const extension = path.extname(fileName);
            const fileType = this.getFileTypeFromName(fileName);
            return `${folderName}_${fileType}${extension}`;
        }
        
        // For Zoom standard files, keep original name
        const zoomPatterns = [
            'shared_screen_with_gallery_view',
            'shared_screen_with_speaker_view',
            'audio_only',
            'playback',
            'audio_transcript',
            'chat_file',
            'timeline'
        ];
        
        for (const pattern of zoomPatterns) {
            if (fileName.toLowerCase().includes(pattern)) {
                return `${folderName}_${fileName}`;
            }
        }
        
        // For other files, append folder name
        return `${folderName}_${fileName}`;
    }
    
    getFileTypeFromName(fileName) {
        const lower = fileName.toLowerCase();
        if (lower.includes('.mp4')) return 'video';
        if (lower.includes('.m4a')) return 'audio';
        if (lower.includes('.vtt')) return 'transcript';
        if (lower.includes('.txt') && lower.includes('chat')) return 'chat';
        if (lower.includes('.json') && lower.includes('timeline')) return 'timeline';
        if (lower.includes('.md')) return 'insights';
        return 'file';
    }

    async generateReport() {
        console.log('\n\n================================================================================');
        console.log('📊 FILE RENAMING REPORT');
        console.log('================================================================================\n');
        
        console.log('SUMMARY:');
        console.log(`Total folders scanned: ${this.stats.totalFolders}`);
        console.log(`Total files found: ${this.stats.totalFiles}`);
        console.log(`Files ${this.dryRun ? 'to be' : ''} renamed: ${this.stats.filesRenamed}`);
        console.log(`Files already standardized: ${this.stats.filesSkipped}`);
        
        if (this.stats.errors.length > 0) {
            console.log(`\n❌ Errors encountered: ${this.stats.errors.length}`);
            console.log('\nERROR DETAILS:');
            for (const error of this.stats.errors.slice(0, 10)) {
                console.log(`- ${error.folder || error.file}: ${error.error}`);
            }
            if (this.stats.errors.length > 10) {
                console.log(`... and ${this.stats.errors.length - 10} more errors`);
            }
        }
        
        // Save detailed report
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = `validation-reports/file-renaming-${this.dryRun ? 'dryrun' : 'executed'}-${timestamp}.json`;
        
        await fs.writeFile(reportPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            mode: this.dryRun ? 'DRY_RUN' : 'EXECUTED',
            summary: {
                totalFolders: this.stats.totalFolders,
                totalFiles: this.stats.totalFiles,
                filesRenamed: this.stats.filesRenamed,
                filesSkipped: this.stats.filesSkipped,
                errors: this.stats.errors.length
            },
            errors: this.stats.errors
        }, null, 2));
        
        console.log(`\n📄 Detailed report saved to: ${reportPath}`);
        
        if (this.dryRun) {
            console.log('\n⚠️  This was a DRY RUN. No files were actually renamed.');
            console.log('To execute the renaming, change dryRun to false in the script.');
        } else {
            console.log(`\n✅ Successfully renamed ${this.stats.filesRenamed} files!`);
        }
    }
}

// Main execution
async function main() {
    const standardizer = new DriveFileStandardizer();
    
    try {
        // Parse command line arguments
        const args = process.argv.slice(2);
        if (args.includes('--execute') || args.includes('-e')) {
            standardizer.dryRun = false;
        }
        
        await standardizer.initialize();
        await standardizer.scanAndRename();
        
    } catch (error) {
        console.error('❌ Script failed:', error);
        console.error(error.stack);
    }
}

// Show usage
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: node standardize-file-names-in-drive.js [options]');
    console.log('Options:');
    console.log('  --execute, -e    Execute the renaming (default is dry run)');
    console.log('  --help, -h       Show this help message');
    process.exit(0);
}

main().catch(console.error);