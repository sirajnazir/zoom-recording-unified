#!/usr/bin/env node
require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class FileRenamingPreview {
    constructor() {
        this.drive = null;
        this.rootFolderId = '1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg';
    }

    async initialize() {
        console.log('🔍 File Renaming Preview\n');
        console.log('This will show examples of how files would be renamed\n');
        
        const auth = new google.auth.GoogleAuth({
            keyFile: 'google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/drive']
        });

        const authClient = await auth.getClient();
        this.drive = google.drive({ version: 'v3', auth: authClient });
    }

    async previewSampleFolders() {
        // Search for a few recording folders as examples
        console.log('📂 Searching for sample recording folders...\n');
        
        const response = await this.drive.files.list({
            q: `name contains 'U_' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 10
        });

        const folders = response.data.files || [];
        console.log(`Found ${folders.length} sample folders\n`);

        for (const folder of folders.slice(0, 5)) {
            await this.previewFolder(folder);
        }

        console.log('\n📊 RENAMING PATTERNS:');
        console.log('================================================================================');
        console.log('1. Files already named correctly (starting with folder name) → NO CHANGE');
        console.log('2. Zoom standard files → [FolderName]_[OriginalFileName]');
        console.log('3. Files with old naming → [FolderName]_[FileType].[extension]');
        console.log('\nExamples:');
        console.log('   shared_screen_with_gallery_view.mp4 → [FolderName]_shared_screen_with_gallery_view.mp4');
        console.log('   MISC_A_unknown_file.mp4 → [FolderName]_video.mp4');
        console.log('   audio_only.m4a → [FolderName]_audio_only.m4a');
    }

    async previewFolder(folder) {
        console.log(`\n📹 Folder: ${folder.name}`);
        console.log('─'.repeat(80));
        
        try {
            const filesResponse = await this.drive.files.list({
                q: `'${folder.id}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'files(name)',
                pageSize: 20
            });

            const files = filesResponse.data.files || [];
            
            if (files.length === 0) {
                console.log('   No files in this folder');
                return;
            }

            let wouldRename = 0;
            let alreadyCorrect = 0;

            for (const file of files) {
                const newName = this.getNewName(folder.name, file.name);
                
                if (file.name === newName) {
                    alreadyCorrect++;
                    console.log(`   ✓ ${file.name} (already correct)`);
                } else {
                    wouldRename++;
                    console.log(`   📝 ${file.name}`);
                    console.log(`      → ${newName}`);
                }
            }

            console.log(`\n   Summary: ${wouldRename} files to rename, ${alreadyCorrect} already correct`);

        } catch (error) {
            console.log(`   Error: ${error.message}`);
        }
    }

    getNewName(folderName, fileName) {
        // If already starts with folder name, it's correct
        if (fileName.startsWith(folderName)) {
            return fileName;
        }

        // If it's an old format file with UUID pattern
        if (fileName.includes('_M_') && fileName.includes('U_')) {
            const extension = path.extname(fileName);
            const fileType = this.getFileType(fileName);
            return `${folderName}_${fileType}${extension}`;
        }

        // Standard Zoom files
        const zoomFiles = [
            'shared_screen_with_gallery_view',
            'shared_screen_with_speaker_view',
            'audio_only',
            'audio_transcript',
            'chat_file',
            'timeline',
            'playback'
        ];

        for (const zoomFile of zoomFiles) {
            if (fileName.toLowerCase().includes(zoomFile)) {
                return `${folderName}_${fileName}`;
            }
        }

        // Default: prepend folder name
        return `${folderName}_${fileName}`;
    }

    getFileType(fileName) {
        const lower = fileName.toLowerCase();
        if (lower.endsWith('.mp4')) return 'video';
        if (lower.endsWith('.m4a')) return 'audio';
        if (lower.endsWith('.vtt')) return 'transcript';
        if (lower.endsWith('.txt')) return 'chat';
        if (lower.endsWith('.json')) return 'timeline';
        if (lower.endsWith('.md')) return 'insights';
        return 'file';
    }
}

// Main execution
async function main() {
    const preview = new FileRenamingPreview();
    
    try {
        await preview.initialize();
        await preview.previewSampleFolders();
        
        console.log('\n\n💡 To rename all files in Google Drive:');
        console.log('   node standardize-file-names-in-drive.js --execute');
        console.log('\n⚠️  Warning: This will rename thousands of files. Make sure to backup first!');
        
    } catch (error) {
        console.error('❌ Preview failed:', error);
    }
}

main().catch(console.error);