#!/usr/bin/env node

/**
 * Verify All Recordings Processed
 * This script compares all Zoom recordings from the last 3 years with what's in Google Sheets
 * to ensure everything has been properly processed and matched.
 */

require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class RecordingVerifier {
    constructor() {
        this.spreadsheetId = process.env.MASTER_INDEX_SHEET_ID || '1xa4E5PcrxRVaMbJfWH_d5LLSqY3RlCf6Ur3rwKtq2jQ';
        this.mismatches = [];
        this.summary = {
            zoomApiRecordings: 0,
            sheetsRawRecordings: 0,
            sheetsStandardizedRecordings: 0,
            matched: 0,
            unmatched: [],
            duplicates: [],
            processingErrors: []
        };
    }

    async initialize() {
        // Initialize Google Sheets
        const serviceAccountJson = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT || '{}');
        
        if (!serviceAccountJson.client_email) {
            // Try to use default auth
            this.auth = new google.auth.GoogleAuth({
                scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
            });
        } else {
            this.auth = new google.auth.GoogleAuth({
                credentials: serviceAccountJson,
                scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
            });
        }
        
        this.sheets = google.sheets({ version: 'v4', auth: this.auth });
        
        // Initialize Zoom Service with config
        const { ZoomService } = require('./src/infrastructure/services/ZoomService');
        const config = {
            zoom: {
                accountId: process.env.ZOOM_ACCOUNT_ID,
                clientId: process.env.ZOOM_CLIENT_ID,
                clientSecret: process.env.ZOOM_CLIENT_SECRET
            }
        };
        this.zoomService = new ZoomService({ config });
    }

    async fetchAllZoomRecordings() {
        console.log('🔄 Fetching all recordings from Zoom API for the last 3 years...\n');
        
        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 1095); // 3 years
        
        try {
            const recordings = await this.zoomService.getRecordings(
                fromDate.toISOString().split('T')[0],
                toDate.toISOString().split('T')[0]
            );
            
            this.summary.zoomApiRecordings = recordings.length;
            console.log(`✅ Found ${recordings.length} recordings in Zoom API\n`);
            
            return recordings;
        } catch (error) {
            console.error('❌ Error fetching Zoom recordings:', error.message);
            return [];
        }
    }

    async fetchSheetsData() {
        console.log('📊 Fetching data from Google Sheets tabs...\n');
        
        try {
            // Fetch Zoom API - Raw tab
            const rawResponse = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Zoom API - Raw!A:Z'
            });
            
            // Fetch Zoom API - Standardized tab
            const standardizedResponse = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Zoom API - Standardized!A:Z'
            });
            
            const rawData = rawResponse.data.values || [];
            const standardizedData = standardizedResponse.data.values || [];
            
            // Skip headers
            const rawRecords = rawData.slice(1);
            const standardizedRecords = standardizedData.slice(1);
            
            this.summary.sheetsRawRecordings = rawRecords.length;
            this.summary.sheetsStandardizedRecordings = standardizedRecords.length;
            
            console.log(`✅ Found ${rawRecords.length} recordings in Zoom API - Raw tab`);
            console.log(`✅ Found ${standardizedRecords.length} recordings in Zoom API - Standardized tab\n`);
            
            return {
                raw: rawRecords,
                standardized: standardizedRecords,
                rawHeaders: rawData[0] || [],
                standardizedHeaders: standardizedData[0] || []
            };
        } catch (error) {
            console.error('❌ Error fetching sheets data:', error.message);
            return { raw: [], standardized: [], rawHeaders: [], standardizedHeaders: [] };
        }
    }

    compareRecordings(zoomRecordings, sheetsData) {
        console.log('🔍 Comparing Zoom recordings with Google Sheets data...\n');
        
        // Create maps for quick lookup
        const zoomMap = new Map();
        const sheetsRawMap = new Map();
        const sheetsStandardizedMap = new Map();
        
        // Build Zoom map (UUID -> recording)
        zoomRecordings.forEach(recording => {
            zoomMap.set(recording.uuid, recording);
        });
        
        // Build sheets maps (UUID -> row data)
        sheetsData.raw.forEach((row, index) => {
            const uuid = row[0]; // Assuming UUID is in first column
            if (uuid) {
                if (sheetsRawMap.has(uuid)) {
                    this.summary.duplicates.push({
                        uuid,
                        tab: 'Zoom API - Raw',
                        rows: [sheetsRawMap.get(uuid).rowNum, index + 2]
                    });
                }
                sheetsRawMap.set(uuid, { data: row, rowNum: index + 2 });
            }
        });
        
        sheetsData.standardized.forEach((row, index) => {
            const uuid = row[0]; // Assuming UUID is in first column
            if (uuid) {
                if (sheetsStandardizedMap.has(uuid)) {
                    this.summary.duplicates.push({
                        uuid,
                        tab: 'Zoom API - Standardized',
                        rows: [sheetsStandardizedMap.get(uuid).rowNum, index + 2]
                    });
                }
                sheetsStandardizedMap.set(uuid, { data: row, rowNum: index + 2 });
            }
        });
        
        // Check each Zoom recording
        zoomMap.forEach((recording, uuid) => {
            const inRaw = sheetsRawMap.has(uuid);
            const inStandardized = sheetsStandardizedMap.has(uuid);
            
            if (inRaw && inStandardized) {
                this.summary.matched++;
                
                // Verify data consistency
                const rawData = sheetsRawMap.get(uuid).data;
                const standardizedData = sheetsStandardizedMap.get(uuid).data;
                
                // Check if meeting ID matches (column 1 in raw)
                if (rawData[1] !== recording.id.toString()) {
                    this.summary.processingErrors.push({
                        uuid,
                        issue: 'Meeting ID mismatch',
                        zoom: recording.id,
                        sheets: rawData[1]
                    });
                }
                
                // Check if topic matches (column 2 in raw)
                if (rawData[2] !== recording.topic) {
                    this.summary.processingErrors.push({
                        uuid,
                        issue: 'Topic mismatch',
                        zoom: recording.topic,
                        sheets: rawData[2]
                    });
                }
            } else {
                this.summary.unmatched.push({
                    uuid,
                    meetingId: recording.id,
                    topic: recording.topic,
                    date: recording.start_time,
                    inRaw,
                    inStandardized
                });
            }
        });
        
        // Check for orphaned sheets entries (in sheets but not in Zoom)
        sheetsRawMap.forEach((sheetData, uuid) => {
            if (!zoomMap.has(uuid)) {
                this.summary.processingErrors.push({
                    uuid,
                    issue: 'In sheets but not in Zoom API',
                    tab: 'Zoom API - Raw',
                    row: sheetData.rowNum
                });
            }
        });
    }

    async generateReport() {
        console.log('\n📊 VERIFICATION REPORT\n');
        console.log('='.repeat(80));
        
        console.log(`\n📈 SUMMARY:`);
        console.log(`   Total Zoom API Recordings: ${this.summary.zoomApiRecordings}`);
        console.log(`   Total in Raw Tab: ${this.summary.sheetsRawRecordings}`);
        console.log(`   Total in Standardized Tab: ${this.summary.sheetsStandardizedRecordings}`);
        console.log(`   Fully Matched: ${this.summary.matched}`);
        console.log(`   Unmatched: ${this.summary.unmatched.length}`);
        console.log(`   Duplicates Found: ${this.summary.duplicates.length}`);
        console.log(`   Processing Errors: ${this.summary.processingErrors.length}`);
        
        const matchRate = (this.summary.matched / this.summary.zoomApiRecordings * 100).toFixed(2);
        console.log(`\n   ✅ Match Rate: ${matchRate}%`);
        
        if (this.summary.unmatched.length > 0) {
            console.log(`\n❌ UNMATCHED RECORDINGS (${this.summary.unmatched.length}):`);
            this.summary.unmatched.forEach((recording, index) => {
                console.log(`\n   ${index + 1}. UUID: ${recording.uuid}`);
                console.log(`      Meeting ID: ${recording.meetingId}`);
                console.log(`      Topic: ${recording.topic}`);
                console.log(`      Date: ${recording.date}`);
                console.log(`      In Raw Tab: ${recording.inRaw ? 'Yes' : 'No'}`);
                console.log(`      In Standardized Tab: ${recording.inStandardized ? 'Yes' : 'No'}`);
            });
        }
        
        if (this.summary.duplicates.length > 0) {
            console.log(`\n⚠️  DUPLICATES FOUND (${this.summary.duplicates.length}):`);
            this.summary.duplicates.forEach((dup, index) => {
                console.log(`\n   ${index + 1}. UUID: ${dup.uuid}`);
                console.log(`      Tab: ${dup.tab}`);
                console.log(`      Rows: ${dup.rows.join(', ')}`);
            });
        }
        
        if (this.summary.processingErrors.length > 0) {
            console.log(`\n⚠️  PROCESSING ERRORS (${this.summary.processingErrors.length}):`);
            this.summary.processingErrors.slice(0, 10).forEach((error, index) => {
                console.log(`\n   ${index + 1}. UUID: ${error.uuid}`);
                console.log(`      Issue: ${error.issue}`);
                if (error.zoom) console.log(`      Zoom Value: ${error.zoom}`);
                if (error.sheets) console.log(`      Sheets Value: ${error.sheets}`);
                if (error.row) console.log(`      Row: ${error.row}`);
            });
            
            if (this.summary.processingErrors.length > 10) {
                console.log(`\n   ... and ${this.summary.processingErrors.length - 10} more errors`);
            }
        }
        
        // Save detailed report
        const reportData = {
            generatedAt: new Date().toISOString(),
            summary: this.summary,
            details: {
                unmatched: this.summary.unmatched,
                duplicates: this.summary.duplicates,
                processingErrors: this.summary.processingErrors
            }
        };
        
        const reportPath = `verification-report-${Date.now()}.json`;
        await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));
        
        console.log(`\n\n💾 Detailed report saved to: ${reportPath}`);
        console.log('='.repeat(80));
        
        if (matchRate === '100.00' && this.summary.processingErrors.length === 0) {
            console.log('\n🎉 PERFECT! All recordings have been processed and matched correctly!');
        } else {
            console.log('\n⚠️  Some issues found. Please review the report above.');
        }
    }

    async run() {
        try {
            await this.initialize();
            
            // Fetch data
            const zoomRecordings = await this.fetchAllZoomRecordings();
            const sheetsData = await this.fetchSheetsData();
            
            // Compare
            this.compareRecordings(zoomRecordings, sheetsData);
            
            // Generate report
            await this.generateReport();
            
        } catch (error) {
            console.error('\n❌ Verification failed:', error.message);
            console.error(error.stack);
        }
    }
}

// Run verification
if (require.main === module) {
    const verifier = new RecordingVerifier();
    verifier.run().catch(console.error);
}

module.exports = { RecordingVerifier };