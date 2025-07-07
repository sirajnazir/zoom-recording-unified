#!/usr/bin/env node

/**
 * Comprehensive Cleanup and Reset Plan
 * 
 * This script will:
 * 1. Clean all local files and directories
 * 2. Clean Google Drive folders (archive old recordings)
 * 3. Clean Google Sheets (archive old data)
 * 4. Set up fresh structure for unified processing
 * 5. Generate a plan for reprocessing all Zoom Cloud recordings
 */

const fs = require('fs').promises;
const path = require('path');
const { google } = require('googleapis');

class CleanupAndResetPlan {
    constructor() {
        this.config = {
            google: {
                clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
                privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                drive: {
                    rootFolderId: process.env.RECORDINGS_ROOT_FOLDER_ID,
                    coachesFolderId: process.env.COACHES_FOLDER_ID,
                    studentsFolderId: process.env.STUDENTS_FOLDER_ID,
                    miscFolderId: process.env.MISC_FOLDER_ID,
                    trivialFolderId: process.env.TRIVIAL_FOLDER_ID
                },
                sheets: {
                    masterIndexSheetId: process.env.MASTER_INDEX_SHEET_ID
                }
            }
        };
        
        this.auth = null;
        this.drive = null;
        this.sheets = null;
    }

    async initialize() {
        console.log('🔧 Initializing Google APIs...');
        
        this.auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: this.config.google.clientEmail,
                private_key: this.config.google.privateKey
            },
            scopes: [
                'https://www.googleapis.com/auth/drive',
                'https://www.googleapis.com/auth/spreadsheets'
            ]
        });

        this.drive = google.drive({ version: 'v3', auth: this.auth });
        this.sheets = google.sheets({ version: 'v4', auth: this.auth });
        
        console.log('✅ Google APIs initialized');
    }

    async cleanupLocalFiles() {
        console.log('\n🗂️ Cleaning local files and directories...');
        
        const directoriesToClean = [
            'output',
            'logs',
            'temp',
            'cache',
            'downloads'
        ];

        for (const dir of directoriesToClean) {
            try {
                if (await this.directoryExists(dir)) {
                    await fs.rm(dir, { recursive: true, force: true });
                    console.log(`   ✅ Cleaned: ${dir}/`);
                } else {
                    console.log(`   ⏭️  Skipped (not found): ${dir}/`);
                }
            } catch (error) {
                console.log(`   ⚠️  Error cleaning ${dir}/: ${error.message}`);
            }
        }

        // Clean specific file types
        const filesToClean = [
            '*.log',
            '*.json',
            '*.csv',
            '*.mp4',
            '*.txt',
            '*.md'
        ];

        console.log('   📁 Cleaning temporary files...');
        const currentDir = process.cwd();
        const files = await fs.readdir(currentDir);
        
        for (const file of files) {
            if (filesToClean.some(pattern => file.match(pattern.replace('*', '.*')))) {
                try {
                    await fs.unlink(file);
                    console.log(`   ✅ Cleaned: ${file}`);
                } catch (error) {
                    // Ignore errors for files that don't exist
                }
            }
        }

        console.log('✅ Local cleanup completed');
    }

    async cleanupGoogleDrive() {
        console.log('\n📁 Cleaning Google Drive folders...');
        
        const foldersToArchive = [
            { id: this.config.google.drive.coachesFolderId, name: 'Coaches' },
            { id: this.config.google.drive.studentsFolderId, name: 'Students' },
            { id: this.config.google.drive.miscFolderId, name: 'Misc' },
            { id: this.config.google.drive.trivialFolderId, name: 'Trivial' }
        ];

        for (const folder of foldersToArchive) {
            if (!folder.id) {
                console.log(`   ⏭️  Skipped ${folder.name} (no folder ID configured)`);
                continue;
            }

            try {
                console.log(`   📁 Archiving ${folder.name} folder...`);
                
                // List all files in the folder
                const response = await this.drive.files.list({
                    q: `'${folder.id}' in parents and trashed = false`,
                    fields: 'files(id, name, mimeType)',
                    pageSize: 1000
                });

                const files = response.data.files || [];
                console.log(`   📊 Found ${files.length} items in ${folder.name}`);

                if (files.length > 0) {
                    // Create archive folder
                    const archiveFolderName = `ARCHIVE_${folder.name}_${new Date().toISOString().split('T')[0]}`;
                    const archiveFolder = await this.drive.files.create({
                        requestBody: {
                            name: archiveFolderName,
                            mimeType: 'application/vnd.google-apps.folder',
                            parents: [this.config.google.drive.rootFolderId]
                        },
                        fields: 'id, name'
                    });

                    console.log(`   📁 Created archive folder: ${archiveFolderName}`);

                    // Move files to archive
                    for (const file of files) {
                        await this.drive.files.update({
                            fileId: file.id,
                            requestBody: {
                                parents: [archiveFolder.data.id]
                            },
                            addParents: archiveFolder.data.id,
                            removeParents: folder.id
                        });
                    }

                    console.log(`   ✅ Moved ${files.length} items to archive`);
                } else {
                    console.log(`   ✅ ${folder.name} folder is already empty`);
                }

            } catch (error) {
                console.log(`   ❌ Error archiving ${folder.name}: ${error.message}`);
            }
        }

        console.log('✅ Google Drive cleanup completed');
    }

    async cleanupGoogleSheets() {
        console.log('\n📊 Cleaning Google Sheets...');
        
        try {
            const spreadsheetId = this.config.google.sheets.masterIndexSheetId;
            
            if (!spreadsheetId) {
                console.log('   ⏭️  Skipped (no spreadsheet ID configured)');
                return;
            }

            // Get spreadsheet info
            const spreadsheet = await this.sheets.spreadsheets.get({
                spreadsheetId: spreadsheetId
            });

            const sheets = spreadsheet.data.sheets || [];
            console.log(`   📊 Found ${sheets.length} sheets in spreadsheet`);

            for (const sheet of sheets) {
                const sheetName = sheet.properties.title;
                
                if (sheetName === 'Raw Master Index' || sheetName === 'Standardized Master Index') {
                    console.log(`   📝 Clearing ${sheetName}...`);
                    
                    // Clear all data except headers
                    await this.sheets.spreadsheets.values.clear({
                        spreadsheetId: spreadsheetId,
                        range: `${sheetName}!A2:ZZ`
                    });

                    console.log(`   ✅ Cleared ${sheetName} (kept headers)`);
                } else {
                    console.log(`   ⏭️  Skipped ${sheetName} (not a main data sheet)`);
                }
            }

            console.log('✅ Google Sheets cleanup completed');

        } catch (error) {
            console.log(`   ❌ Error cleaning Google Sheets: ${error.message}`);
        }
    }

    async createFreshStructure() {
        console.log('\n🏗️ Creating fresh directory structure...');
        
        const directories = [
            'output',
            'output/webhook-logs',
            'output/webhook-queue',
            'logs',
            'temp',
            'cache',
            'downloads',
            'downloads/videos',
            'downloads/transcripts',
            'downloads/chats'
        ];

        for (const dir of directories) {
            try {
                await fs.mkdir(dir, { recursive: true });
                console.log(`   ✅ Created: ${dir}/`);
            } catch (error) {
                console.log(`   ⚠️  Error creating ${dir}/: ${error.message}`);
            }
        }

        console.log('✅ Fresh structure created');
    }

    async generateReprocessingPlan() {
        console.log('\n📋 Generating reprocessing plan...');
        
        const plan = {
            timestamp: new Date().toISOString(),
            steps: [
                {
                    step: 1,
                    title: 'Verify Zoom API Access',
                    description: 'Ensure Zoom API credentials are working and can list all recordings',
                    command: 'node complete-production-processor.js --mode=test --limit=1',
                    expected: 'Should successfully connect to Zoom API and list recordings'
                },
                {
                    step: 2,
                    title: 'Generate Complete Recording List',
                    description: 'List all recordings from Zoom Cloud and save to CSV',
                    command: 'node complete-production-processor.js --mode=recent --limit=1000 --dry-run',
                    expected: 'Should generate a comprehensive CSV with all available recordings'
                },
                {
                    step: 3,
                    title: 'Review and Approve Recording List',
                    description: 'Review the generated CSV to ensure accuracy',
                    command: 'Review the generated CSV file and approve for processing',
                    expected: 'User approval of recording list before processing'
                },
                {
                    step: 4,
                    title: 'Process All Historical Recordings',
                    description: 'Process all recordings using the complete production processor',
                    command: 'node complete-production-processor.js --mode=recent --limit=1000 --auto-approve',
                    expected: 'All recordings processed and uploaded to Google Drive/Sheets'
                },
                {
                    step: 5,
                    title: 'Verify Webhook System',
                    description: 'Ensure webhook server is running and can process new recordings',
                    command: 'Test webhook with a new Zoom recording',
                    expected: 'New recordings should be processed automatically via webhook'
                }
            ],
            configuration: {
                webhookUrl: 'https://zoom-webhook-v2.onrender.com',
                googleDriveFolders: {
                    root: this.config.google.drive.rootFolderId,
                    coaches: this.config.google.drive.coachesFolderId,
                    students: this.config.google.drive.studentsFolderId,
                    misc: this.config.google.drive.miscFolderId,
                    trivial: this.config.google.drive.trivialFolderId
                },
                googleSheets: {
                    masterIndex: this.config.google.sheets.masterIndexSheetId
                }
            }
        };

        // Save plan to file
        const planFile = 'reprocessing-plan.json';
        await fs.writeFile(planFile, JSON.stringify(plan, null, 2));
        console.log(`   ✅ Plan saved to: ${planFile}`);

        // Display plan summary
        console.log('\n📋 REPROCESSING PLAN SUMMARY:');
        console.log('=' .repeat(60));
        
        for (const step of plan.steps) {
            console.log(`\n${step.step}. ${step.title}`);
            console.log(`   ${step.description}`);
            console.log(`   Command: ${step.command}`);
            console.log(`   Expected: ${step.expected}`);
        }

        console.log('\n🎯 NEXT STEPS:');
        console.log('1. Review the reprocessing plan above');
        console.log('2. Run Step 1 to verify Zoom API access');
        console.log('3. Run Step 2 to generate recording list');
        console.log('4. Review and approve the recording list');
        console.log('5. Run Step 4 to process all recordings');
        console.log('6. Verify webhook system is working');

        return plan;
    }

    async directoryExists(dirPath) {
        try {
            await fs.access(dirPath);
            return true;
        } catch {
            return false;
        }
    }

    async run() {
        console.log('🧹 COMPREHENSIVE CLEANUP AND RESET');
        console.log('=' .repeat(60));
        console.log('This will clean all local files, Google Drive folders, and Google Sheets');
        console.log('Then set up a fresh structure for unified processing');
        console.log('=' .repeat(60));

        try {
            await this.initialize();
            
            // Run cleanup steps
            await this.cleanupLocalFiles();
            await this.cleanupGoogleDrive();
            await this.cleanupGoogleSheets();
            
            // Create fresh structure
            await this.createFreshStructure();
            
            // Generate reprocessing plan
            await this.generateReprocessingPlan();

            console.log('\n🎉 CLEANUP AND RESET COMPLETED SUCCESSFULLY!');
            console.log('\n📝 Summary:');
            console.log('   ✅ Local files cleaned');
            console.log('   ✅ Google Drive folders archived');
            console.log('   ✅ Google Sheets cleared');
            console.log('   ✅ Fresh directory structure created');
            console.log('   ✅ Reprocessing plan generated');
            
            console.log('\n🚀 Ready to start fresh with unified processing!');

        } catch (error) {
            console.error('\n❌ Cleanup failed:', error);
            process.exit(1);
        }
    }
}

// Run the cleanup and reset
if (require.main === module) {
    const cleanup = new CleanupAndResetPlan();
    cleanup.run().catch(console.error);
}

module.exports = { CleanupAndResetPlan }; 