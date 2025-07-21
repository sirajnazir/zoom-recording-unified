#!/usr/bin/env node
require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { parse } = require('csv-parse/sync');

class KnowledgeBaseValidator {
    constructor() {
        this.rootFolderId = '1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg';
        this.drive = null;
        this.sheets = null;
        this.validationResults = {
            totalFolders: 0,
            totalFiles: 0,
            issues: [],
            warnings: [],
            suggestions: [],
            standardizedFolders: 0,
            nonStandardFolders: [],
            missingRecordings: [],
            duplicates: [],
            index: [],
            statistics: {
                byYear: {},
                byMonth: {},
                byCoach: {},
                byStudent: {},
                byFileType: {},
                totalSize: 0
            }
        };
        this.namingPattern = /^(\d{4}-\d{2}-\d{2})_(.+?)_(.+?)(?:_(.+?))?$/;
        this.requiredFiles = ['video.mp4', 'audio.m4a', 'transcript.vtt', 'chat.txt'];
        this.optionalFiles = ['summary.json', 'summary_next_steps.json', 'metadata.json'];
    }

    async initialize() {
        console.log('🚀 Initializing Knowledge Base Validator...\n');
        
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
            scopes: [
                'https://www.googleapis.com/auth/drive',
                'https://www.googleapis.com/auth/spreadsheets'
            ],
        });

        const authClient = await auth.getClient();
        this.drive = google.drive({ version: 'v3', auth: authClient });
        this.sheets = google.sheets({ version: 'v4', auth: authClient });
    }

    async validateKnowledgeBase() {
        console.log('📊 Starting Knowledge Base Validation...\n');
        console.log(`Root Folder ID: ${this.rootFolderId}`);
        console.log('================================================================================\n');

        try {
            await this.scanFolder(this.rootFolderId, '', 0);
            await this.performGapAnalysis();
            await this.generateReport();
            await this.saveResults();
        } catch (error) {
            console.error('❌ Validation failed:', error);
        }
    }

    async scanFolder(folderId, folderPath, depth) {
        try {
            const folder = await this.drive.files.get({
                fileId: folderId,
                fields: 'id,name,mimeType,size,createdTime,modifiedTime'
            });

            const currentPath = folderPath ? `${folderPath}/${folder.data.name}` : folder.data.name;
            console.log(`${'  '.repeat(depth)}📁 ${folder.data.name}`);
            
            this.validationResults.totalFolders++;

            // Validate folder naming convention
            if (depth > 0) {
                this.validateFolderNaming(folder.data.name, currentPath);
            }

            // List all items in the folder
            let pageToken = null;
            const allItems = [];

            do {
                const response = await this.drive.files.list({
                    q: `'${folderId}' in parents and trashed = false`,
                    fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink)',
                    pageToken: pageToken,
                    pageSize: 1000
                });

                allItems.push(...response.data.files);
                pageToken = response.data.nextPageToken;
            } while (pageToken);

            // Separate folders and files
            const subFolders = allItems.filter(item => item.mimeType === 'application/vnd.google-apps.folder');
            const files = allItems.filter(item => item.mimeType !== 'application/vnd.google-apps.folder');

            // Process files in this folder
            if (files.length > 0) {
                await this.validateFiles(files, currentPath, folder.data.name);
            }

            // Add to index
            this.validationResults.index.push({
                id: folder.data.id,
                name: folder.data.name,
                path: currentPath,
                type: 'folder',
                fileCount: files.length,
                subFolderCount: subFolders.length,
                createdTime: folder.data.createdTime,
                modifiedTime: folder.data.modifiedTime
            });

            // Recursively scan subfolders
            for (const subFolder of subFolders) {
                await this.scanFolder(subFolder.id, currentPath, depth + 1);
            }

        } catch (error) {
            console.error(`❌ Error scanning folder ${folderId}:`, error.message);
            this.validationResults.issues.push({
                type: 'scan_error',
                path: folderPath,
                error: error.message
            });
        }
    }

    validateFolderNaming(folderName, folderPath) {
        const match = folderName.match(this.namingPattern);
        
        if (match) {
            this.validationResults.standardizedFolders++;
            
            // Extract components
            const [_, date, coach, student, additional] = match;
            
            // Update statistics
            const year = date.substring(0, 4);
            const month = date.substring(0, 7);
            
            this.validationResults.statistics.byYear[year] = (this.validationResults.statistics.byYear[year] || 0) + 1;
            this.validationResults.statistics.byMonth[month] = (this.validationResults.statistics.byMonth[month] || 0) + 1;
            this.validationResults.statistics.byCoach[coach] = (this.validationResults.statistics.byCoach[coach] || 0) + 1;
            this.validationResults.statistics.byStudent[student] = (this.validationResults.statistics.byStudent[student] || 0) + 1;
            
            // Validate date format
            if (!this.isValidDate(date)) {
                this.validationResults.warnings.push({
                    type: 'invalid_date',
                    folder: folderName,
                    path: folderPath,
                    message: `Invalid date format: ${date}`
                });
            }
        } else {
            this.validationResults.nonStandardFolders.push({
                name: folderName,
                path: folderPath,
                suggestion: this.suggestStandardName(folderName)
            });
        }
    }

    async validateFiles(files, folderPath, folderName) {
        const fileMap = {};
        let totalSize = 0;

        // Create a map of files by name
        files.forEach(file => {
            const fileName = file.name.toLowerCase();
            fileMap[fileName] = file;
            totalSize += parseInt(file.size || 0);
            
            // Update file type statistics
            const ext = path.extname(fileName).substring(1);
            if (ext) {
                this.validationResults.statistics.byFileType[ext] = (this.validationResults.statistics.byFileType[ext] || 0) + 1;
            }
        });

        this.validationResults.statistics.totalSize += totalSize;
        this.validationResults.totalFiles += files.length;

        // Check for required files
        const missingRequired = [];
        for (const requiredFile of this.requiredFiles) {
            if (!fileMap[requiredFile] && !fileMap[requiredFile.replace('.mp4', '.MP4')]) {
                missingRequired.push(requiredFile);
            }
        }

        if (missingRequired.length > 0) {
            this.validationResults.issues.push({
                type: 'missing_required_files',
                folder: folderName,
                path: folderPath,
                missingFiles: missingRequired
            });
        }

        // Check for video files with different naming
        const videoFiles = files.filter(f => f.name.match(/\.(mp4|MP4|mov|MOV)$/));
        if (videoFiles.length > 1) {
            this.validationResults.warnings.push({
                type: 'multiple_video_files',
                folder: folderName,
                path: folderPath,
                files: videoFiles.map(f => f.name)
            });
        }

        // Check for duplicates
        const fileGroups = {};
        files.forEach(file => {
            const size = file.size;
            if (size) {
                if (!fileGroups[size]) fileGroups[size] = [];
                fileGroups[size].push(file);
            }
        });

        Object.values(fileGroups).forEach(group => {
            if (group.length > 1) {
                this.validationResults.duplicates.push({
                    folder: folderName,
                    path: folderPath,
                    files: group.map(f => ({ name: f.name, size: f.size }))
                });
            }
        });

        // Validate file naming and structure
        this.validateFileNaming(files, folderPath, folderName);
    }

    validateFileNaming(files, folderPath, folderName) {
        const standardFiles = ['video.mp4', 'audio.m4a', 'transcript.vtt', 'chat.txt', 'summary.json', 'summary_next_steps.json'];
        
        files.forEach(file => {
            const fileName = file.name.toLowerCase();
            
            // Check if file follows standard naming
            if (!standardFiles.includes(fileName) && !fileName.startsWith('metadata')) {
                // Check for common variations
                if (fileName.match(/shared_screen|speaker_view|gallery_view/)) {
                    this.validationResults.suggestions.push({
                        type: 'rename_video_file',
                        folder: folderName,
                        path: folderPath,
                        currentName: file.name,
                        suggestedName: 'video.mp4',
                        reason: 'Standardize video file naming'
                    });
                } else if (fileName.endsWith('.m4a') && fileName !== 'audio.m4a') {
                    this.validationResults.suggestions.push({
                        type: 'rename_audio_file',
                        folder: folderName,
                        path: folderPath,
                        currentName: file.name,
                        suggestedName: 'audio.m4a',
                        reason: 'Standardize audio file naming'
                    });
                }
            }
        });
    }

    async performGapAnalysis() {
        console.log('\n🔍 Performing Gap Analysis...\n');
        
        // Load Zoom recordings from local output directory
        try {
            const outputDir = path.join(__dirname, 'output');
            const localRecordings = await fs.readdir(outputDir);
            
            // Create a map of processed recordings
            const processedMap = new Map();
            this.validationResults.index.forEach(item => {
                if (item.type === 'folder' && item.name.match(this.namingPattern)) {
                    processedMap.set(item.name, item);
                }
            });

            // Check for recordings in local that might not be in Drive
            for (const recording of localRecordings) {
                if (recording.startsWith('M:') && recording.includes('U:')) {
                    const parts = recording.split('U:');
                    const meetingId = parts[0].substring(2);
                    const uuid = parts[1];
                    
                    // Check if this recording exists in Drive
                    const found = Array.from(processedMap.values()).some(item => 
                        item.path.includes(meetingId) || item.path.includes(uuid)
                    );
                    
                    if (!found) {
                        this.validationResults.missingRecordings.push({
                            localFolder: recording,
                            meetingId: meetingId,
                            uuid: uuid,
                            suggestion: 'This recording exists locally but may not be in Google Drive'
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Warning: Could not read local output directory:', error.message);
        }
    }

    async generateReport() {
        console.log('\n📋 Generating Validation Report...\n');
        
        const report = {
            summary: {
                totalFolders: this.validationResults.totalFolders,
                totalFiles: this.validationResults.totalFiles,
                standardizedFolders: this.validationResults.standardizedFolders,
                nonStandardFolders: this.validationResults.nonStandardFolders.length,
                criticalIssues: this.validationResults.issues.length,
                warnings: this.validationResults.warnings.length,
                suggestions: this.validationResults.suggestions.length,
                duplicates: this.validationResults.duplicates.length,
                missingRecordings: this.validationResults.missingRecordings.length,
                totalSizeGB: (this.validationResults.statistics.totalSize / (1024 * 1024 * 1024)).toFixed(2)
            },
            statistics: this.validationResults.statistics,
            timestamp: new Date().toISOString()
        };

        console.log('📊 VALIDATION SUMMARY');
        console.log('================================================================================');
        console.log(`Total Folders: ${report.summary.totalFolders}`);
        console.log(`Total Files: ${report.summary.totalFiles}`);
        console.log(`Total Size: ${report.summary.totalSizeGB} GB`);
        console.log(`Standardized Folders: ${report.summary.standardizedFolders} (${((report.summary.standardizedFolders / report.summary.totalFolders) * 100).toFixed(1)}%)`);
        console.log(`Non-Standard Folders: ${report.summary.nonStandardFolders}`);
        console.log(`Critical Issues: ${report.summary.criticalIssues}`);
        console.log(`Warnings: ${report.summary.warnings}`);
        console.log(`Suggestions: ${report.summary.suggestions}`);
        console.log(`Duplicate Files: ${report.summary.duplicates}`);
        console.log(`Missing Recordings: ${report.summary.missingRecordings}`);
        console.log('================================================================================\n');

        // Show critical issues
        if (this.validationResults.issues.length > 0) {
            console.log('❌ CRITICAL ISSUES:');
            this.validationResults.issues.slice(0, 5).forEach(issue => {
                console.log(`   - ${issue.type}: ${issue.folder} (${issue.path})`);
                if (issue.missingFiles) {
                    console.log(`     Missing: ${issue.missingFiles.join(', ')}`);
                }
            });
            if (this.validationResults.issues.length > 5) {
                console.log(`   ... and ${this.validationResults.issues.length - 5} more issues`);
            }
            console.log('');
        }

        // Show non-standard folders
        if (this.validationResults.nonStandardFolders.length > 0) {
            console.log('⚠️  NON-STANDARD FOLDER NAMES:');
            this.validationResults.nonStandardFolders.slice(0, 5).forEach(folder => {
                console.log(`   - ${folder.name}`);
                if (folder.suggestion) {
                    console.log(`     Suggested: ${folder.suggestion}`);
                }
            });
            if (this.validationResults.nonStandardFolders.length > 5) {
                console.log(`   ... and ${this.validationResults.nonStandardFolders.length - 5} more folders`);
            }
            console.log('');
        }

        return report;
    }

    async saveResults() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportDir = path.join(__dirname, 'validation-reports');
        await fs.mkdir(reportDir, { recursive: true });

        // Save detailed results
        const detailedPath = path.join(reportDir, `validation-detailed-${timestamp}.json`);
        await fs.writeFile(detailedPath, JSON.stringify(this.validationResults, null, 2));
        console.log(`✅ Detailed report saved: ${detailedPath}`);

        // Save index
        const indexPath = path.join(reportDir, `knowledge-base-index-${timestamp}.json`);
        await fs.writeFile(indexPath, JSON.stringify(this.validationResults.index, null, 2));
        console.log(`✅ Knowledge base index saved: ${indexPath}`);

        // Save CSV index for easy viewing
        const csvPath = path.join(reportDir, `knowledge-base-index-${timestamp}.csv`);
        const csvContent = this.generateCSV();
        await fs.writeFile(csvPath, csvContent);
        console.log(`✅ CSV index saved: ${csvPath}`);
    }

    generateCSV() {
        const headers = ['Type', 'Name', 'Path', 'File Count', 'Created', 'Modified'];
        const rows = [headers.join(',')];

        this.validationResults.index.forEach(item => {
            const row = [
                item.type,
                `"${item.name}"`,
                `"${item.path}"`,
                item.fileCount || 0,
                item.createdTime,
                item.modifiedTime
            ];
            rows.push(row.join(','));
        });

        return rows.join('\n');
    }

    isValidDate(dateStr) {
        const date = new Date(dateStr);
        return date instanceof Date && !isNaN(date);
    }

    suggestStandardName(folderName) {
        // Try to extract date, coach, and student from non-standard names
        const dateMatch = folderName.match(/(\d{4}[-_]?\d{2}[-_]?\d{2})/);
        const date = dateMatch ? dateMatch[1].replace(/[_]/g, '-') : 'YYYY-MM-DD';
        
        // Common patterns to extract names
        const names = folderName.match(/([A-Z][a-z]+)/g) || [];
        const coach = names[0] || 'Coach';
        const student = names[1] || 'Student';
        
        return `${date}_${coach}_${student}`;
    }
}

// Main execution
async function main() {
    const validator = new KnowledgeBaseValidator();
    await validator.initialize();
    await validator.validateKnowledgeBase();
}

main().catch(console.error);