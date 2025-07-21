#!/usr/bin/env node
require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class FileIntegrityReport {
    constructor() {
        this.drive = null;
        this.rootFolderId = '1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg';
        this.results = {
            totalRecordings: 0,
            withVideoFiles: 0,
            withAudioFiles: 0,
            withTranscripts: 0,
            withChatFiles: 0,
            onlySummaries: 0,
            trivialFiles: 0,
            completeRecordings: 0,
            partialRecordings: 0,
            missingRecordings: 0,
            examples: {
                complete: [],
                partial: [],
                summaryOnly: [],
                trivial: []
            }
        };
    }

    async initialize() {
        console.log('📊 File Integrity Report Generator\n');
        console.log('This report analyzes the actual file contents in Google Drive\n');
        
        const auth = new google.auth.GoogleAuth({
            keyFile: 'google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/drive']
        });

        const authClient = await auth.getClient();
        this.drive = google.drive({ version: 'v3', auth: authClient });
    }

    async loadValidationData() {
        // Load the fuzzy validation results
        const validationPath = 'validation-reports/smart-fuzzy-validation-2025-07-10T23-21-14-527Z.json';
        const validationData = JSON.parse(await fs.readFile(validationPath, 'utf-8'));
        
        // Combine exact and fuzzy matches
        const allMatches = [
            ...(validationData.exactMatches || []),
            ...(validationData.fuzzyMatches || [])
        ];
        
        return allMatches;
    }

    async analyzeRecordings() {
        console.log('🔍 Analyzing file integrity for all matched recordings...\n');
        
        const matchedRecordings = await this.loadValidationData();
        this.results.totalRecordings = matchedRecordings.length;
        
        let processed = 0;
        
        for (const recording of matchedRecordings) {
            if (recording.driveFolder) {
                await this.analyzeRecording(recording);
                
                processed++;
                if (processed % 50 === 0) {
                    console.log(`Progress: ${processed}/${matchedRecordings.length} recordings analyzed`);
                }
            }
        }
        
        await this.generateReport();
    }

    async analyzeRecording(recording) {
        try {
            // Search for the folder
            const response = await this.drive.files.list({
                q: `name = '${recording.driveFolder}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'files(id, name)',
                pageSize: 1
            });

            if (!response.data.files || response.data.files.length === 0) {
                this.results.missingRecordings++;
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
            
            // Analyze file types
            const analysis = {
                hasVideo: false,
                hasAudio: false,
                hasTranscript: false,
                hasChat: false,
                hasSummary: false,
                isTrivial: false,
                totalFiles: files.length,
                totalSize: 0
            };

            for (const file of files) {
                const fileName = file.name.toLowerCase();
                const fileSize = parseInt(file.size || 0);
                
                analysis.totalSize += fileSize;
                
                if (fileName.includes('.mp4')) analysis.hasVideo = true;
                if (fileName.includes('.m4a')) analysis.hasAudio = true;
                if (fileName.includes('.vtt')) analysis.hasTranscript = true;
                if (fileName.includes('chat') && fileName.includes('.txt')) analysis.hasChat = true;
                if (fileName.includes('summary')) analysis.hasSummary = true;
                if (fileName.includes('trivial') || fileSize === 0) analysis.isTrivial = true;
            }

            // Update statistics
            if (analysis.hasVideo) this.results.withVideoFiles++;
            if (analysis.hasAudio) this.results.withAudioFiles++;
            if (analysis.hasTranscript) this.results.withTranscripts++;
            if (analysis.hasChat) this.results.withChatFiles++;
            if (analysis.isTrivial) this.results.trivialFiles++;

            // Categorize recording
            if (analysis.hasVideo && analysis.hasAudio) {
                this.results.completeRecordings++;
                if (this.results.examples.complete.length < 5) {
                    this.results.examples.complete.push({
                        folder: recording.driveFolder,
                        uuid: recording.uuid,
                        topic: recording.topic,
                        files: files.map(f => f.name)
                    });
                }
            } else if (analysis.hasVideo || analysis.hasAudio) {
                this.results.partialRecordings++;
                if (this.results.examples.partial.length < 5) {
                    this.results.examples.partial.push({
                        folder: recording.driveFolder,
                        uuid: recording.uuid,
                        topic: recording.topic,
                        hasVideo: analysis.hasVideo,
                        hasAudio: analysis.hasAudio,
                        files: files.map(f => f.name)
                    });
                }
            } else if (analysis.hasSummary && !analysis.hasVideo && !analysis.hasAudio) {
                this.results.onlySummaries++;
                if (this.results.examples.summaryOnly.length < 5) {
                    this.results.examples.summaryOnly.push({
                        folder: recording.driveFolder,
                        uuid: recording.uuid,
                        topic: recording.topic,
                        files: files.map(f => f.name)
                    });
                }
            } else if (analysis.isTrivial) {
                if (this.results.examples.trivial.length < 5) {
                    this.results.examples.trivial.push({
                        folder: recording.driveFolder,
                        uuid: recording.uuid,
                        topic: recording.topic,
                        files: files.map(f => f.name),
                        totalSize: analysis.totalSize
                    });
                }
            }

        } catch (error) {
            console.error(`Error analyzing ${recording.driveFolder}: ${error.message}`);
        }
    }

    async generateReport() {
        console.log('\n\n================================================================================');
        console.log('📊 FILE INTEGRITY REPORT - GOOGLE DRIVE KNOWLEDGE BASE');
        console.log('================================================================================\n');

        console.log('SUMMARY STATISTICS:');
        console.log(`Total recordings in Drive: ${this.results.totalRecordings}`);
        console.log(`\n✅ Complete recordings (video + audio): ${this.results.completeRecordings} (${(this.results.completeRecordings/this.results.totalRecordings*100).toFixed(1)}%)`);
        console.log(`⚠️  Partial recordings (video OR audio): ${this.results.partialRecordings} (${(this.results.partialRecordings/this.results.totalRecordings*100).toFixed(1)}%)`);
        console.log(`📄 Summary-only recordings: ${this.results.onlySummaries} (${(this.results.onlySummaries/this.results.totalRecordings*100).toFixed(1)}%)`);
        console.log(`🚫 Trivial/empty files: ${this.results.trivialFiles} recordings`);

        console.log('\nFILE TYPE DISTRIBUTION:');
        console.log(`📹 With video files: ${this.results.withVideoFiles} (${(this.results.withVideoFiles/this.results.totalRecordings*100).toFixed(1)}%)`);
        console.log(`🎵 With audio files: ${this.results.withAudioFiles} (${(this.results.withAudioFiles/this.results.totalRecordings*100).toFixed(1)}%)`);
        console.log(`📝 With transcripts: ${this.results.withTranscripts} (${(this.results.withTranscripts/this.results.totalRecordings*100).toFixed(1)}%)`);
        console.log(`💬 With chat files: ${this.results.withChatFiles} (${(this.results.withChatFiles/this.results.totalRecordings*100).toFixed(1)}%)`);

        // Examples
        if (this.results.examples.complete.length > 0) {
            console.log('\n\n✅ EXAMPLES OF COMPLETE RECORDINGS:');
            for (const example of this.results.examples.complete) {
                console.log(`\n- ${example.topic}`);
                console.log(`  UUID: ${example.uuid}`);
                console.log(`  Files: ${example.files.join(', ')}`);
            }
        }

        if (this.results.examples.partial.length > 0) {
            console.log('\n\n⚠️  EXAMPLES OF PARTIAL RECORDINGS:');
            for (const example of this.results.examples.partial) {
                console.log(`\n- ${example.topic}`);
                console.log(`  UUID: ${example.uuid}`);
                console.log(`  Has Video: ${example.hasVideo ? 'Yes' : 'No'}, Has Audio: ${example.hasAudio ? 'Yes' : 'No'}`);
                console.log(`  Files: ${example.files.join(', ')}`);
            }
        }

        if (this.results.examples.summaryOnly.length > 0) {
            console.log('\n\n📄 EXAMPLES OF SUMMARY-ONLY RECORDINGS:');
            for (const example of this.results.examples.summaryOnly) {
                console.log(`\n- ${example.topic}`);
                console.log(`  UUID: ${example.uuid}`);
                console.log(`  Files: ${example.files.join(', ')}`);
            }
        }

        if (this.results.examples.trivial.length > 0) {
            console.log('\n\n🚫 EXAMPLES OF TRIVIAL/EMPTY RECORDINGS:');
            for (const example of this.results.examples.trivial) {
                console.log(`\n- ${example.topic}`);
                console.log(`  UUID: ${example.uuid}`);
                console.log(`  Total size: ${example.totalSize} bytes`);
                console.log(`  Files: ${example.files.join(', ')}`);
            }
        }

        // Save report
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = `validation-reports/file-integrity-report-${timestamp}.json`;
        
        await fs.writeFile(reportPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            summary: {
                totalRecordings: this.results.totalRecordings,
                completeRecordings: this.results.completeRecordings,
                partialRecordings: this.results.partialRecordings,
                onlySummaries: this.results.onlySummaries,
                trivialFiles: this.results.trivialFiles,
                withVideoFiles: this.results.withVideoFiles,
                withAudioFiles: this.results.withAudioFiles,
                withTranscripts: this.results.withTranscripts,
                withChatFiles: this.results.withChatFiles
            },
            examples: this.results.examples
        }, null, 2));

        console.log(`\n\n📄 Detailed report saved to: ${reportPath}`);

        // Key findings
        console.log('\n\n🔑 KEY FINDINGS:');
        const completenessRate = (this.results.completeRecordings / this.results.totalRecordings * 100).toFixed(1);
        console.log(`- ${completenessRate}% of recordings have both video and audio files`);
        console.log(`- ${this.results.onlySummaries} recordings only have summary files (no media)`);
        console.log(`- ${this.results.trivialFiles} recordings contain trivial or empty files`);
        
        const missingAudio = this.results.withVideoFiles - this.results.withAudioFiles;
        if (missingAudio > 0) {
            console.log(`- ${missingAudio} recordings have video but missing audio`);
        }

        console.log('\n✅ File integrity validation complete!');
    }
}

// Main execution
async function main() {
    const report = new FileIntegrityReport();
    
    try {
        await report.initialize();
        await report.analyzeRecordings();
    } catch (error) {
        console.error('❌ Report generation failed:', error);
    }
}

main().catch(console.error);