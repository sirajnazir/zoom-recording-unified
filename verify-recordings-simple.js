#!/usr/bin/env node

/**
 * Simple Recording Verification Script
 * Compares Zoom API recordings with Google Sheets entries
 */

require('dotenv').config();
const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs').promises;

async function verifyRecordings() {
    console.log('🔍 Recording Verification Tool\n');
    console.log('='.repeat(80));
    
    const spreadsheetId = process.env.MASTER_INDEX_SHEET_ID || '1xa4E5PcrxRVaMbJfWH_d5LLSqY3RlCf6Ur3rwKtq2jQ';
    
    try {
        // 1. Initialize Google Sheets
        console.log('📊 Connecting to Google Sheets...');
        const auth = new google.auth.GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
        });
        const sheets = google.sheets({ version: 'v4', auth });
        
        // 2. Fetch data from both tabs
        console.log('📥 Fetching data from Google Sheets tabs...\n');
        
        const [rawResponse, standardizedResponse] = await Promise.all([
            sheets.spreadsheets.values.get({
                spreadsheetId,
                range: 'Zoom API - Raw!A:N' // UUID to processing version columns
            }),
            sheets.spreadsheets.values.get({
                spreadsheetId,
                range: 'Zoom API - Standardized!A:BX' // All columns
            })
        ]);
        
        const rawData = rawResponse.data.values || [];
        const standardizedData = standardizedResponse.data.values || [];
        
        // Skip headers
        const rawHeaders = rawData[0] || [];
        const standardizedHeaders = standardizedData[0] || [];
        const rawRecords = rawData.slice(1);
        const standardizedRecords = standardizedData.slice(1);
        
        console.log(`✅ Found ${rawRecords.length} recordings in Zoom API - Raw tab`);
        console.log(`✅ Found ${standardizedRecords.length} recordings in Zoom API - Standardized tab\n`);
        
        // 3. Build maps for analysis
        const rawMap = new Map();
        const standardizedMap = new Map();
        const duplicates = [];
        const mismatches = [];
        
        // Process raw records
        rawRecords.forEach((row, index) => {
            const uuid = row[0];
            const meetingId = row[1];
            const topic = row[2];
            const startTime = row[3];
            
            if (uuid) {
                if (rawMap.has(uuid)) {
                    duplicates.push({
                        uuid,
                        tab: 'Raw',
                        rows: [rawMap.get(uuid).row, index + 2],
                        meetingId
                    });
                }
                rawMap.set(uuid, {
                    row: index + 2,
                    meetingId,
                    topic,
                    startTime,
                    fullRow: row
                });
            }
        });
        
        // Process standardized records
        standardizedRecords.forEach((row, index) => {
            const uuid = row[0];
            const fingerprint = row[1];
            const recordingDate = row[2];
            const rawName = row[3];
            const standardizedName = row[4];
            const weekNumber = row[9];
            const meetingId = row[15];
            
            if (uuid) {
                if (standardizedMap.has(uuid)) {
                    duplicates.push({
                        uuid,
                        tab: 'Standardized',
                        rows: [standardizedMap.get(uuid).row, index + 2],
                        meetingId
                    });
                }
                standardizedMap.set(uuid, {
                    row: index + 2,
                    fingerprint,
                    recordingDate,
                    rawName,
                    standardizedName,
                    weekNumber,
                    meetingId,
                    fullRow: row
                });
            }
        });
        
        // 4. Cross-check between tabs
        console.log('🔄 Cross-checking between Raw and Standardized tabs...\n');
        
        let matched = 0;
        let onlyInRaw = 0;
        let onlyInStandardized = 0;
        
        // Check raw records
        rawMap.forEach((rawData, uuid) => {
            if (standardizedMap.has(uuid)) {
                matched++;
                
                // Verify data consistency
                const stdData = standardizedMap.get(uuid);
                if (rawData.meetingId !== stdData.meetingId) {
                    mismatches.push({
                        uuid,
                        issue: 'Meeting ID mismatch',
                        raw: rawData.meetingId,
                        standardized: stdData.meetingId
                    });
                }
            } else {
                onlyInRaw++;
                console.log(`⚠️  UUID only in Raw tab: ${uuid} (Meeting ID: ${rawData.meetingId})`);
            }
        });
        
        // Check standardized records
        standardizedMap.forEach((stdData, uuid) => {
            if (!rawMap.has(uuid)) {
                onlyInStandardized++;
                console.log(`⚠️  UUID only in Standardized tab: ${uuid} (${stdData.standardizedName})`);
            }
        });
        
        // 5. Generate summary report
        console.log('\n' + '='.repeat(80));
        console.log('📊 VERIFICATION SUMMARY\n');
        
        console.log(`Total Records:`);
        console.log(`  • Raw Tab: ${rawRecords.length}`);
        console.log(`  • Standardized Tab: ${standardizedRecords.length}`);
        console.log(`  • Matched: ${matched}`);
        console.log(`  • Only in Raw: ${onlyInRaw}`);
        console.log(`  • Only in Standardized: ${onlyInStandardized}`);
        console.log(`  • Duplicates: ${duplicates.length}`);
        console.log(`  • Data Mismatches: ${mismatches.length}`);
        
        const matchRate = (matched / Math.max(rawRecords.length, standardizedRecords.length) * 100).toFixed(2);
        console.log(`\n✅ Match Rate: ${matchRate}%`);
        
        // 6. Show duplicates if any
        if (duplicates.length > 0) {
            console.log(`\n⚠️  DUPLICATE ENTRIES FOUND:`);
            duplicates.slice(0, 5).forEach((dup, i) => {
                console.log(`  ${i + 1}. UUID: ${dup.uuid}`);
                console.log(`     Tab: ${dup.tab}, Rows: ${dup.rows.join(', ')}`);
            });
            if (duplicates.length > 5) {
                console.log(`  ... and ${duplicates.length - 5} more duplicates`);
            }
        }
        
        // 7. Show mismatches if any
        if (mismatches.length > 0) {
            console.log(`\n⚠️  DATA MISMATCHES FOUND:`);
            mismatches.slice(0, 5).forEach((mismatch, i) => {
                console.log(`  ${i + 1}. UUID: ${mismatch.uuid}`);
                console.log(`     Issue: ${mismatch.issue}`);
                console.log(`     Raw: ${mismatch.raw}, Standardized: ${mismatch.standardized}`);
            });
            if (mismatches.length > 5) {
                console.log(`  ... and ${mismatches.length - 5} more mismatches`);
            }
        }
        
        // 8. Check for expected count
        console.log('\n' + '='.repeat(80));
        if (rawRecords.length === 332 && standardizedRecords.length === 332) {
            console.log('✅ VERIFICATION COMPLETE: All 332 recordings are present in both tabs!');
        } else {
            console.log(`⚠️  Expected 332 recordings but found ${rawRecords.length} in Raw and ${standardizedRecords.length} in Standardized`);
        }
        
        // 9. Save detailed report
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                rawCount: rawRecords.length,
                standardizedCount: standardizedRecords.length,
                matched,
                onlyInRaw,
                onlyInStandardized,
                duplicates: duplicates.length,
                mismatches: mismatches.length,
                matchRate
            },
            duplicates,
            mismatches
        };
        
        const reportPath = `verification-report-${Date.now()}.json`;
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        console.log(`\n💾 Detailed report saved to: ${reportPath}`);
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.response?.data) {
            console.error('API Error:', error.response.data);
        }
    }
}

// Run the verification
verifyRecordings().catch(console.error);