#!/usr/bin/env node
require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class SourceAwareValidator {
    constructor() {
        this.sheetId = '1xa4E5PcrxRVaMbJfWH_d5LLSqY3RlCf6Ur3rwKtq2jQ';
        this.rootFolderId = '1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg';
        this.drive = null;
        this.sheets = null;
        this.data = {
            sheetRecordings: new Map(),  // UUID -> recording info from sheets
            driveRecordings: new Map(),  // UUID -> folder info from drive
            sourceStats: { A: 0, B: 0, C: 0 }
        };
        this.results = {
            matched: [],
            missing: [],
            summary: {}
        };
    }

    async initialize() {
        console.log('🚀 Initializing Source-Aware Validator...\n');
        console.log('📌 Using newer tabs: Zoom API, Webhook, Drive Import\n');
        
        const auth = new google.auth.GoogleAuth({
            keyFile: 'google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
        });

        const authClient = await auth.getClient();
        this.drive = google.drive({ version: 'v3', auth: authClient });
        this.sheets = google.sheets({ version: 'v4', auth: authClient });
    }

    async loadSheetData() {
        console.log('📊 Loading data from newer sheet tabs...\n');
        
        // Only load from the newer tabs, NOT Raw/Standardized Master Index
        const tabsToLoad = [
            'Zoom API - Raw',
            'Zoom API - Standardized',
            'Webhook - Raw',
            'Webhook - Standardized',
            'Drive Import - Raw',
            'Drive Import - Standardized'
        ];

        for (const tabName of tabsToLoad) {
            try {
                const response = await this.sheets.spreadsheets.values.get({
                    spreadsheetId: this.sheetId,
                    range: `'${tabName}'!A:Z`
                });

                const rows = response.data.values || [];
                if (rows.length > 1) {
                    const headers = rows[0];
                    const indices = this.getColumnIndices(headers);
                    
                    let loadedCount = 0;
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row || row.length === 0) continue;
                        
                        const uuid = row[indices.uuid];
                        if (uuid && this.isValidUuid(uuid)) {
                            const recording = {
                                uuid: uuid,
                                meetingId: row[indices.meetingId] || '',
                                topic: row[indices.topic] || '',
                                date: row[indices.date] || '',
                                duration: row[indices.duration] || '',
                                source: tabName,
                                rowNumber: i + 1
                            };
                            
                            this.data.sheetRecordings.set(uuid, recording);
                            loadedCount++;
                        }
                    }
                    
                    console.log(`   ✅ ${tabName}: ${loadedCount} recordings loaded`);
                }
            } catch (error) {
                console.log(`   ⚠️  ${tabName}: ${error.message}`);
            }
        }
        
        console.log(`\n   Total unique recordings from sheets: ${this.data.sheetRecordings.size}`);
    }

    getColumnIndices(headers) {
        return {
            uuid: headers.findIndex(h => h && h.toLowerCase().includes('uuid')),
            meetingId: headers.findIndex(h => h && h.toLowerCase().includes('meeting') && h.toLowerCase().includes('id')),
            topic: headers.findIndex(h => h && h.toLowerCase().includes('topic')),
            date: headers.findIndex(h => h && (h.toLowerCase().includes('date') || h.toLowerCase().includes('start'))),
            duration: headers.findIndex(h => h && h.toLowerCase().includes('duration'))
        };
    }

    isValidUuid(uuid) {
        // Valid Base64 UUID pattern
        return /^[A-Za-z0-9+/=]{20,}$/.test(uuid) && !uuid.match(/^[0-9a-f]{16,32}$/i);
    }

    async loadDriveData() {
        console.log('\n☁️  Loading recordings from Google Drive...\n');
        
        await this.scanDriveFolder(this.rootFolderId, 0);
        
        console.log(`   Total recordings in Drive: ${this.data.driveRecordings.size}`);
        console.log(`   Source A recordings: ${this.data.sourceStats.A}`);
        console.log(`   Source B recordings: ${this.data.sourceStats.B}`);
        console.log(`   Source C recordings: ${this.data.sourceStats.C}`);
    }

    async scanDriveFolder(folderId, depth) {
        if (depth > 4) return; // Limit recursion depth
        
        try {
            let pageToken = null;
            do {
                const response = await this.drive.files.list({
                    q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                    fields: 'nextPageToken, files(id, name)',
                    pageToken: pageToken,
                    pageSize: 1000
                });

                for (const folder of response.data.files) {
                    // Check if this is a recording folder
                    const uuidMatch = folder.name.match(/U[_:]([A-Za-z0-9+/=]+)/);
                    
                    if (uuidMatch) {
                        const uuid = uuidMatch[1];
                        
                        // Extract source (A, B, or C)
                        let source = 'Unknown';
                        if (folder.name.includes('_A_') || folder.name.startsWith('Coaching_A_') || folder.name.startsWith('MISC_A_') || folder.name.startsWith('TRIVIAL_A_')) {
                            source = 'A';
                            this.data.sourceStats.A++;
                        } else if (folder.name.includes('_B_') || folder.name.startsWith('Coaching_B_')) {
                            source = 'B';
                            this.data.sourceStats.B++;
                        } else if (folder.name.includes('_C_') || folder.name.startsWith('Coaching_C_')) {
                            source = 'C';
                            this.data.sourceStats.C++;
                        }
                        
                        const meetingIdMatch = folder.name.match(/M[_:](\d+)/);
                        
                        this.data.driveRecordings.set(uuid, {
                            folderName: folder.name,
                            folderId: folder.id,
                            uuid: uuid,
                            meetingId: meetingIdMatch ? meetingIdMatch[1] : null,
                            source: source
                        });
                    } else {
                        // Recursively scan subfolders
                        await this.scanDriveFolder(folder.id, depth + 1);
                    }
                }
                
                pageToken = response.data.nextPageToken;
            } while (pageToken);
            
        } catch (error) {
            console.error(`Error scanning folder at depth ${depth}: ${error.message}`);
        }
    }

    async validateRecordings() {
        console.log('\n\n🔍 VALIDATING RECORDINGS...');
        console.log('================================================================================\n');
        
        let processed = 0;
        let found = 0;
        let missing = 0;
        
        for (const [uuid, sheetRec] of this.data.sheetRecordings) {
            processed++;
            
            const driveRec = this.data.driveRecordings.get(uuid);
            
            if (driveRec) {
                found++;
                this.results.matched.push({
                    uuid: uuid,
                    topic: sheetRec.topic,
                    date: sheetRec.date,
                    sheetSource: sheetRec.source,
                    driveSource: driveRec.source,
                    driveFolder: driveRec.folderName,
                    status: 'MATCHED'
                });
            } else {
                missing++;
                this.results.missing.push({
                    uuid: uuid,
                    topic: sheetRec.topic,
                    date: sheetRec.date,
                    meetingId: sheetRec.meetingId,
                    source: sheetRec.source,
                    status: 'NOT_FOUND'
                });
            }
            
            if (processed % 50 === 0) {
                console.log(`Progress: ${processed} recordings checked (${found} found, ${missing} missing)`);
            }
        }
        
        // Summary
        this.results.summary = {
            totalInSheets: this.data.sheetRecordings.size,
            totalInDrive: this.data.driveRecordings.size,
            matched: found,
            missing: missing,
            matchRate: ((found / processed) * 100).toFixed(1) + '%'
        };
        
        console.log(`\n✅ Validation complete!`);
        console.log(`   Matched: ${found}`);
        console.log(`   Missing: ${missing}`);
        console.log(`   Match rate: ${this.results.summary.matchRate}`);
    }

    async generateReport() {
        console.log('\n\n📊 VALIDATION REPORT');
        console.log('================================================================================');
        
        console.log('\n📈 SUMMARY:');
        console.log(`Total recordings in sheets (newer tabs): ${this.results.summary.totalInSheets}`);
        console.log(`Total recordings in Drive: ${this.results.summary.totalInDrive}`);
        console.log(`Successfully matched: ${this.results.summary.matched}`);
        console.log(`Missing from Drive: ${this.results.summary.missing}`);
        console.log(`Match rate: ${this.results.summary.matchRate}`);
        
        if (this.results.missing.length > 0) {
            console.log('\n\n❌ MISSING RECORDINGS (First 20):');
            console.log('================================================================================');
            
            this.results.missing.slice(0, 20).forEach((rec, idx) => {
                console.log(`\n${idx + 1}. ${rec.topic}`);
                console.log(`   UUID: ${rec.uuid}`);
                console.log(`   Meeting ID: ${rec.meetingId}`);
                console.log(`   Date: ${rec.date}`);
                console.log(`   Sheet source: ${rec.source}`);
            });
            
            if (this.results.missing.length > 20) {
                console.log(`\n... and ${this.results.missing.length - 20} more missing recordings`);
            }
        }
        
        // Show some matched examples
        console.log('\n\n✅ MATCHED RECORDINGS (Sample):');
        console.log('================================================================================');
        
        this.results.matched.slice(0, 5).forEach((rec, idx) => {
            console.log(`\n${idx + 1}. ${rec.topic}`);
            console.log(`   UUID: ${rec.uuid}`);
            console.log(`   Sheet source: ${rec.sheetSource}`);
            console.log(`   Drive source: ${rec.driveSource}`);
            console.log(`   Folder: ${rec.driveFolder}`);
        });
        
        // Save detailed report
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = `validation-reports/source-aware-validation-${timestamp}.json`;
        
        await fs.writeFile(reportPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            summary: this.results.summary,
            sourceStats: this.data.sourceStats,
            matched: this.results.matched,
            missing: this.results.missing
        }, null, 2));
        
        console.log(`\n\n📄 Detailed report saved to: ${reportPath}`);
        
        return this.results;
    }
}

// Main execution
async function main() {
    const validator = new SourceAwareValidator();
    
    try {
        await validator.initialize();
        await validator.loadSheetData();
        await validator.loadDriveData();
        await validator.validateRecordings();
        
        const results = await validator.generateReport();
        
        if (results.summary.missing === 0) {
            console.log('\n\n🎉 EXCELLENT! All recordings from newer tabs are properly stored in Google Drive!');
        } else {
            console.log('\n\n⚠️  Some recordings need attention. Please review the detailed report.');
        }
        
    } catch (error) {
        console.error('❌ Validation failed:', error);
        console.error(error.stack);
    }
}

main().catch(console.error);