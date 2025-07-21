#!/usr/bin/env node
require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class SmartFuzzyValidator {
    constructor() {
        this.sheetId = '1xa4E5PcrxRVaMbJfWH_d5LLSqY3RlCf6Ur3rwKtq2jQ';
        this.rootFolderId = '1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg';
        this.drive = null;
        this.sheets = null;
        this.data = {
            sheetRecordings: new Map(),  // UUID -> recording info from sheets
            driveRecordings: new Map(),  // UUID -> folder info from drive
            driveByMeetingId: new Map(), // Meeting ID -> array of recordings
            driveByDate: new Map(),      // Date -> array of recordings
            sourceStats: { A: 0, B: 0, C: 0 }
        };
        this.results = {
            exactMatches: [],
            fuzzyMatches: [],
            possibleMatches: [],
            notFound: [],
            summary: {}
        };
    }

    async initialize() {
        console.log('🚀 Initializing Smart Fuzzy Validator...\n');
        console.log('📌 Strategy: Multi-criteria matching with fuzzy logic\n');
        console.log('   - Primary: UUID exact match\n');
        console.log('   - Secondary: Meeting ID + Date match\n');
        console.log('   - Tertiary: Topic similarity + Date match\n');
        
        const auth = new google.auth.GoogleAuth({
            keyFile: 'google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
        });

        const authClient = await auth.getClient();
        this.drive = google.drive({ version: 'v3', auth: authClient });
        this.sheets = google.sheets({ version: 'v4', auth: authClient });
    }

    async loadSheetData() {
        console.log('\n📊 Loading data from sheet tabs (excluding Master Index)...\n');
        
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
                                date: this.normalizeDate(row[indices.date] || ''),
                                duration: row[indices.duration] || '',
                                source: tabName,
                                rowNumber: i + 1,
                                // Extract key participants from topic
                                participants: this.extractParticipants(row[indices.topic] || '')
                            };
                            
                            // Only store if we don't have it yet (deduplication)
                            if (!this.data.sheetRecordings.has(uuid)) {
                                this.data.sheetRecordings.set(uuid, recording);
                                loadedCount++;
                            }
                        }
                    }
                    
                    console.log(`   ✅ ${tabName}: ${loadedCount} unique recordings loaded`);
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
        // Valid Base64 UUID pattern (not hex)
        return /^[A-Za-z0-9+/=]{20,}$/.test(uuid) && !uuid.match(/^[0-9a-f]{16,32}$/i);
    }

    normalizeDate(dateStr) {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            return date.toISOString().split('T')[0]; // YYYY-MM-DD format
        } catch (e) {
            return dateStr;
        }
    }

    extractParticipants(topic) {
        // Extract names from various topic formats
        const participants = [];
        
        // Patterns to extract names
        const patterns = [
            /(\w+)\s*&\s*(\w+)/,         // Name & Name
            /(\w+)\s*<>\s*(\w+)/,         // Name <> Name
            /Coach\s+(\w+)\s*<>\s*(\w+)/, // Coach Name <> Name
            /(\w+)\s+and\s+(\w+)/i,       // Name and Name
        ];
        
        for (const pattern of patterns) {
            const match = topic.match(pattern);
            if (match) {
                participants.push(match[1]);
                if (match[2]) participants.push(match[2]);
                break;
            }
        }
        
        return participants;
    }

    async loadDriveData() {
        console.log('\n☁️  Loading and indexing recordings from Google Drive...\n');
        
        await this.scanDriveFolder(this.rootFolderId, 0);
        
        console.log(`\n   Total recordings in Drive: ${this.data.driveRecordings.size}`);
        console.log(`   Indexed by Meeting ID: ${this.data.driveByMeetingId.size} unique IDs`);
        console.log(`   Indexed by Date: ${this.data.driveByDate.size} unique dates`);
        console.log(`   Source A: ${this.data.sourceStats.A}, Source B: ${this.data.sourceStats.B}, Source C: ${this.data.sourceStats.C}`);
    }

    async scanDriveFolder(folderId, depth) {
        if (depth > 4) return;
        
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
                    const uuidMatch = folder.name.match(/U[_:]([A-Za-z0-9+/=]+)/);
                    
                    if (uuidMatch) {
                        const uuid = uuidMatch[1];
                        const meetingIdMatch = folder.name.match(/M[_:](\d+)/);
                        const dateMatch = folder.name.match(/(\d{4}-\d{2}-\d{2})/);
                        
                        // Determine source
                        let source = 'Unknown';
                        if (folder.name.match(/_A_|^Coaching_A_|^MISC_A_|^TRIVIAL_A_/)) {
                            source = 'A';
                            this.data.sourceStats.A++;
                        } else if (folder.name.match(/_B_|^Coaching_B_/)) {
                            source = 'B';
                            this.data.sourceStats.B++;
                        } else if (folder.name.match(/_C_|^Coaching_C_/)) {
                            source = 'C';
                            this.data.sourceStats.C++;
                        }
                        
                        const driveRecord = {
                            folderName: folder.name,
                            folderId: folder.id,
                            uuid: uuid,
                            meetingId: meetingIdMatch ? meetingIdMatch[1] : null,
                            date: dateMatch ? dateMatch[1] : null,
                            source: source,
                            participants: this.extractParticipants(folder.name)
                        };
                        
                        // Store in main map
                        this.data.driveRecordings.set(uuid, driveRecord);
                        
                        // Index by meeting ID
                        if (driveRecord.meetingId) {
                            if (!this.data.driveByMeetingId.has(driveRecord.meetingId)) {
                                this.data.driveByMeetingId.set(driveRecord.meetingId, []);
                            }
                            this.data.driveByMeetingId.get(driveRecord.meetingId).push(driveRecord);
                        }
                        
                        // Index by date
                        if (driveRecord.date) {
                            if (!this.data.driveByDate.has(driveRecord.date)) {
                                this.data.driveByDate.set(driveRecord.date, []);
                            }
                            this.data.driveByDate.get(driveRecord.date).push(driveRecord);
                        }
                    } else {
                        // Recursively scan subfolders
                        await this.scanDriveFolder(folder.id, depth + 1);
                    }
                }
                
                pageToken = response.data.nextPageToken;
            } while (pageToken);
            
        } catch (error) {
            console.error(`Error scanning folder: ${error.message}`);
        }
    }

    async validateRecordings() {
        console.log('\n\n🔍 PERFORMING SMART VALIDATION WITH FUZZY MATCHING...');
        console.log('================================================================================\n');
        
        let processed = 0;
        
        for (const [uuid, sheetRec] of this.data.sheetRecordings) {
            processed++;
            
            // Try exact UUID match first
            const exactMatch = this.data.driveRecordings.get(uuid);
            
            if (exactMatch) {
                this.results.exactMatches.push({
                    uuid: uuid,
                    topic: sheetRec.topic,
                    date: sheetRec.date,
                    matchType: 'EXACT_UUID',
                    driveFolder: exactMatch.folderName
                });
            } else {
                // Try fuzzy matching
                const fuzzyMatch = await this.findFuzzyMatch(sheetRec);
                
                if (fuzzyMatch.found) {
                    if (fuzzyMatch.confidence >= 0.8) {
                        this.results.fuzzyMatches.push({
                            ...sheetRec,
                            matchType: fuzzyMatch.method,
                            confidence: fuzzyMatch.confidence,
                            driveFolder: fuzzyMatch.folder,
                            driveUuid: fuzzyMatch.uuid
                        });
                    } else {
                        this.results.possibleMatches.push({
                            ...sheetRec,
                            matchType: fuzzyMatch.method,
                            confidence: fuzzyMatch.confidence,
                            candidates: fuzzyMatch.candidates
                        });
                    }
                } else {
                    this.results.notFound.push(sheetRec);
                }
            }
            
            if (processed % 50 === 0) {
                console.log(`Progress: ${processed}/${this.data.sheetRecordings.size} recordings validated`);
            }
        }
        
        // Summary
        this.results.summary = {
            totalInSheets: this.data.sheetRecordings.size,
            totalInDrive: this.data.driveRecordings.size,
            exactMatches: this.results.exactMatches.length,
            fuzzyMatches: this.results.fuzzyMatches.length,
            possibleMatches: this.results.possibleMatches.length,
            notFound: this.results.notFound.length,
            overallMatchRate: (((this.results.exactMatches.length + this.results.fuzzyMatches.length) / processed) * 100).toFixed(1) + '%'
        };
        
        console.log('\n✅ Validation complete!');
    }

    async findFuzzyMatch(sheetRec) {
        const candidates = [];
        
        // Method 1: Meeting ID + Date match
        if (sheetRec.meetingId) {
            const byMeetingId = this.data.driveByMeetingId.get(sheetRec.meetingId) || [];
            for (const driveRec of byMeetingId) {
                if (this.datesMatch(sheetRec.date, driveRec.date)) {
                    return {
                        found: true,
                        method: 'MEETING_ID_DATE',
                        confidence: 0.9,
                        folder: driveRec.folderName,
                        uuid: driveRec.uuid
                    };
                }
            }
            
            // If meeting ID matches but date doesn't, still consider it
            if (byMeetingId.length > 0) {
                candidates.push(...byMeetingId.map(d => ({
                    ...d,
                    matchScore: 0.7,
                    matchReason: 'Meeting ID matches, different date'
                })));
            }
        }
        
        // Method 2: Date + Participants match
        if (sheetRec.date) {
            const byDate = this.data.driveByDate.get(sheetRec.date) || [];
            for (const driveRec of byDate) {
                const participantMatch = this.participantsMatch(sheetRec.participants, driveRec.participants);
                if (participantMatch > 0.5) {
                    return {
                        found: true,
                        method: 'DATE_PARTICIPANTS',
                        confidence: 0.8 * participantMatch,
                        folder: driveRec.folderName,
                        uuid: driveRec.uuid
                    };
                }
            }
        }
        
        // Method 3: Topic similarity search
        for (const [uuid, driveRec] of this.data.driveRecordings) {
            const similarity = this.calculateSimilarity(sheetRec, driveRec);
            if (similarity > 0.6) {
                candidates.push({
                    ...driveRec,
                    matchScore: similarity,
                    matchReason: 'Topic/participant similarity'
                });
            }
        }
        
        // Return best candidate if any
        if (candidates.length > 0) {
            candidates.sort((a, b) => b.matchScore - a.matchScore);
            const best = candidates[0];
            
            return {
                found: true,
                method: 'SIMILARITY',
                confidence: best.matchScore,
                folder: best.folderName,
                uuid: best.uuid,
                candidates: candidates.slice(0, 3) // Top 3 candidates
            };
        }
        
        return { found: false };
    }

    datesMatch(date1, date2) {
        if (!date1 || !date2) return false;
        
        // Normalize dates
        const d1 = this.normalizeDate(date1);
        const d2 = this.normalizeDate(date2);
        
        // Exact match
        if (d1 === d2) return true;
        
        // Check if within 1 day (in case of timezone issues)
        const diff = Math.abs(new Date(d1) - new Date(d2));
        return diff < 86400000; // 24 hours in milliseconds
    }

    participantsMatch(participants1, participants2) {
        if (!participants1.length || !participants2.length) return 0;
        
        let matches = 0;
        for (const p1 of participants1) {
            for (const p2 of participants2) {
                if (p1.toLowerCase() === p2.toLowerCase()) {
                    matches++;
                }
            }
        }
        
        return matches / Math.max(participants1.length, participants2.length);
    }

    calculateSimilarity(sheetRec, driveRec) {
        let score = 0;
        
        // Date similarity (0.4 weight)
        if (this.datesMatch(sheetRec.date, driveRec.date)) {
            score += 0.4;
        }
        
        // Participant similarity (0.4 weight)
        const participantScore = this.participantsMatch(sheetRec.participants, driveRec.participants);
        score += 0.4 * participantScore;
        
        // Meeting ID partial match (0.2 weight)
        if (sheetRec.meetingId && driveRec.meetingId) {
            if (sheetRec.meetingId === driveRec.meetingId) {
                score += 0.2;
            }
        }
        
        return score;
    }

    async generateReport() {
        console.log('\n\n📊 SMART VALIDATION REPORT');
        console.log('================================================================================');
        
        console.log('\n📈 SUMMARY:');
        console.log(`Total recordings in sheets: ${this.results.summary.totalInSheets}`);
        console.log(`Total recordings in Drive: ${this.results.summary.totalInDrive}`);
        console.log(`\n✅ Exact UUID matches: ${this.results.summary.exactMatches}`);
        console.log(`🔄 Fuzzy matches (high confidence): ${this.results.summary.fuzzyMatches}`);
        console.log(`❓ Possible matches (low confidence): ${this.results.summary.possibleMatches}`);
        console.log(`❌ Not found: ${this.results.summary.notFound}`);
        console.log(`\n📊 Overall match rate: ${this.results.summary.overallMatchRate}`);
        
        // Show fuzzy matches
        if (this.results.fuzzyMatches.length > 0) {
            console.log('\n\n🔄 FUZZY MATCHES (First 10):');
            console.log('================================================================================');
            
            this.results.fuzzyMatches.slice(0, 10).forEach((rec, idx) => {
                console.log(`\n${idx + 1}. ${rec.topic}`);
                console.log(`   Sheet UUID: ${rec.uuid}`);
                console.log(`   Drive UUID: ${rec.driveUuid}`);
                console.log(`   Match type: ${rec.matchType}`);
                console.log(`   Confidence: ${(rec.confidence * 100).toFixed(0)}%`);
                console.log(`   Drive folder: ${rec.driveFolder}`);
            });
        }
        
        // Show not found
        if (this.results.notFound.length > 0) {
            console.log('\n\n❌ NOT FOUND (First 10):');
            console.log('================================================================================');
            
            this.results.notFound.slice(0, 10).forEach((rec, idx) => {
                console.log(`\n${idx + 1}. ${rec.topic}`);
                console.log(`   UUID: ${rec.uuid}`);
                console.log(`   Meeting ID: ${rec.meetingId}`);
                console.log(`   Date: ${rec.date}`);
                console.log(`   Source: ${rec.source}`);
            });
            
            if (this.results.notFound.length > 10) {
                console.log(`\n... and ${this.results.notFound.length - 10} more not found`);
            }
        }
        
        // Save detailed report
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = `validation-reports/smart-fuzzy-validation-${timestamp}.json`;
        
        await fs.writeFile(reportPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            summary: this.results.summary,
            exactMatches: this.results.exactMatches.slice(0, 100),
            fuzzyMatches: this.results.fuzzyMatches,
            possibleMatches: this.results.possibleMatches,
            notFound: this.results.notFound
        }, null, 2));
        
        console.log(`\n\n📄 Detailed report saved to: ${reportPath}`);
        
        return this.results;
    }
}

// Main execution
async function main() {
    const validator = new SmartFuzzyValidator();
    
    try {
        await validator.initialize();
        await validator.loadSheetData();
        await validator.loadDriveData();
        await validator.validateRecordings();
        
        const results = await validator.generateReport();
        
        const totalMatched = results.summary.exactMatches + results.summary.fuzzyMatches;
        const matchPercentage = (totalMatched / results.summary.totalInSheets * 100).toFixed(1);
        
        if (matchPercentage >= 95) {
            console.log(`\n\n🎉 EXCELLENT! ${matchPercentage}% of recordings are accounted for in Google Drive!`);
        } else if (matchPercentage >= 85) {
            console.log(`\n\n✅ GOOD! ${matchPercentage}% of recordings are accounted for. Review fuzzy matches for accuracy.`);
        } else {
            console.log(`\n\n⚠️  ${matchPercentage}% match rate. Please review the unmatched recordings.`);
        }
        
    } catch (error) {
        console.error('❌ Validation failed:', error);
        console.error(error.stack);
    }
}

main().catch(console.error);