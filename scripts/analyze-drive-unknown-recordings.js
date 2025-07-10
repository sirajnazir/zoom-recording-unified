#!/usr/bin/env node

/**
 * Analyze Drive Import Recordings with Unknown Coach/Student
 * 
 * This script analyzes recordings from Drive Import that have unknown
 * coach or student information to understand why metadata extraction failed.
 */

const fs = require('fs').promises;
const path = require('path');
const { google } = require('googleapis');

// Get configuration
const config = require('../config');

// Initialize Google Drive API
const auth = new google.auth.JWT(
    config.google.clientEmail,
    null,
    config.google.privateKey,
    ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
);

const drive = google.drive({ version: 'v3', auth });
const sheets = google.sheets({ version: 'v4', auth });

/**
 * Build full folder path by traversing parent folders
 */
async function buildFullFolderPath(folderId, cache = new Map()) {
    if (!folderId) return '';
    
    // Check cache
    if (cache.has(folderId)) {
        return cache.get(folderId);
    }
    
    try {
        const response = await drive.files.get({
            fileId: folderId,
            fields: 'id,name,parents'
        });
        
        const folder = response.data;
        let path = folder.name;
        
        // Recursively get parent path
        if (folder.parents && folder.parents.length > 0) {
            const parentPath = await buildFullFolderPath(folder.parents[0], cache);
            if (parentPath) {
                path = `${parentPath}/${path}`;
            }
        }
        
        cache.set(folderId, path);
        return path;
    } catch (error) {
        console.error(`Error getting folder info for ${folderId}:`, error.message);
        return '';
    }
}

/**
 * Extract coach and student from folder hierarchy
 */
function extractFromFolderHierarchy(folderPath) {
    const result = {
        coach: null,
        student: null,
        confidence: 0,
        method: 'none'
    };
    
    if (!folderPath) return result;
    
    const parts = folderPath.split('/').filter(p => p);
    
    // Pattern 1: .../Coaches/[Coach Name]/[Student Name]/...
    const coachesIndex = parts.findIndex(p => p.toLowerCase() === 'coaches');
    if (coachesIndex !== -1 && coachesIndex + 2 < parts.length) {
        result.coach = parts[coachesIndex + 1];
        result.student = parts[coachesIndex + 2];
        result.confidence = 0.9;
        result.method = 'coaches_hierarchy';
        return result;
    }
    
    // Pattern 2: .../Students/[Student Name]/...
    const studentsIndex = parts.findIndex(p => p.toLowerCase() === 'students');
    if (studentsIndex !== -1 && studentsIndex + 1 < parts.length) {
        result.student = parts[studentsIndex + 1];
        result.confidence = 0.7;
        result.method = 'students_hierarchy';
        // Try to extract coach from folder name patterns
        const folderName = parts[parts.length - 1];
        const coachMatch = folderName.match(/(?:with|by|coach|:)\s*([A-Za-z]+)/i);
        if (coachMatch) {
            result.coach = coachMatch[1];
            result.confidence = 0.8;
        }
        return result;
    }
    
    // Pattern 3: Look for known coach names in the path
    const knownCoaches = ['rishi', 'jenny', 'jamie', 'aditi', 'noor', 'kelvin', 'juli', 'erin', 'steven', 'marissa', 'andrew', 'janice'];
    for (const part of parts) {
        const partLower = part.toLowerCase();
        for (const coach of knownCoaches) {
            if (partLower.includes(coach)) {
                result.coach = coach.charAt(0).toUpperCase() + coach.slice(1);
                result.confidence = 0.6;
                result.method = 'known_coach_in_path';
                // Next part might be student
                const coachIndex = parts.indexOf(part);
                if (coachIndex + 1 < parts.length) {
                    result.student = parts[coachIndex + 1];
                    result.confidence = 0.7;
                }
                break;
            }
        }
        if (result.coach) break;
    }
    
    return result;
}

/**
 * Analyze recordings with unknown coach/student from Drive Import tabs
 */
async function analyzeDriveUnknownRecordings() {
    console.log('🔍 Analyzing Drive Import recordings with unknown coach/student...\n');
    
    try {
        // Read from Drive Import - Standardized tab
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.google.sheets.masterIndexSheetId,
            range: 'Drive Import - Standardized!A2:AZ'
        });
        
        const rows = response.data.values || [];
        console.log(`Found ${rows.length} total Drive Import recordings\n`);
        
        // Get headers
        const headerResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: config.google.sheets.masterIndexSheetId,
            range: 'Drive Import - Standardized!A1:AZ1'
        });
        const headers = headerResponse.data.values[0];
        
        // Debug: Show actual headers
        console.log('Available headers:', headers.slice(0, 20));
        
        // Find relevant column indices
        const cols = {
            standardizedName: headers.indexOf('standardizedName'),
            participants: headers.indexOf('participants'),
            category: headers.indexOf('category'),
            rawName: headers.indexOf('rawName'),
            folderLink: headers.indexOf('folderLink'),
            folderUrl: headers.indexOf('folderUrl'),
            participantCount: headers.indexOf('participantCount'),
            duration: headers.indexOf('duration'),
            timestamp: headers.indexOf('recordingDate'),
            nameConfidence: headers.indexOf('nameConfidence'),
            nameResolutionMethod: headers.indexOf('nameResolutionMethod')
        };
        
        // Debug: Show column indices
        console.log('Column indices:', cols);
        
        // Filter recordings with unknown coach or student
        const unknownRecordings = rows.filter(row => {
            const participants = row[cols.participants] || '';
            const standardizedName = row[cols.standardizedName] || '';
            const rawName = row[cols.rawName] || '';
            const nameConfidence = parseFloat(row[cols.nameConfidence]) || 0;
            
            // Skip empty rows
            if (!standardizedName && !rawName) return false;
            
            // Check if participants includes "Unknown" or is empty
            // Or if name confidence is very low
            return participants.toLowerCase().includes('unknown') || 
                   participants === '' ||
                   nameConfidence < 0.5 ||
                   standardizedName.toLowerCase().includes('unknown');
        });
        
        console.log(`Found ${unknownRecordings.length} recordings with unknown coach/student\n`);
        
        // Analyze each recording
        const analysisResults = [];
        const folderPathCache = new Map();
        
        // Find recordings with different patterns
        const emailSubjectRecordings = unknownRecordings.filter(row => 
            (row[cols.rawName] || '').includes('Re:') || 
            (row[cols.rawName] || '').includes('Fwd:')
        );
        
        console.log(`\nFound ${emailSubjectRecordings.length} recordings with email subject lines`);
        
        // Show a mix of different types
        const samplesToAnalyze = [
            ...unknownRecordings.slice(0, 3),
            ...emailSubjectRecordings.slice(0, 3),
            ...unknownRecordings.slice(-3)
        ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 10); // Remove duplicates and limit to 10
        
        for (let i = 0; i < samplesToAnalyze.length; i++) {
            const row = samplesToAnalyze[i];
            const standardizedName = row[cols.standardizedName] || '';
            const rawName = row[cols.rawName] || '';
            const participants = row[cols.participants] || '';
            const category = row[cols.category] || '';
            const folderLink = row[cols.folderLink] || row[cols.folderUrl] || '';
            const nameConfidence = row[cols.nameConfidence] || '';
            const nameMethod = row[cols.nameResolutionMethod] || '';
            
            // Parse participants (format: "coach, student")
            let coach = 'Unknown';
            let student = 'Unknown';
            if (participants) {
                const parts = participants.split(',').map(p => p.trim());
                coach = parts[0] || 'Unknown';
                student = parts[1] || 'Unknown';
            }
            
            console.log(`\n📁 Recording ${i + 1}:`);
            console.log(`   Standardized: ${standardizedName}`);
            console.log(`   Raw Name: ${rawName}`);
            console.log(`   Participants: ${participants}`);
            console.log(`   Parsed Coach: ${coach}`);
            console.log(`   Parsed Student: ${student}`);
            console.log(`   Category: ${category}`);
            console.log(`   Name Confidence: ${nameConfidence}`);
            console.log(`   Name Method: ${nameMethod}`);
            
            // Extract folder ID from link
            let folderId = '';
            const folderMatch = folderLink.match(/folders\/([a-zA-Z0-9_-]+)/);
            if (folderMatch) {
                folderId = folderMatch[1];
            }
            
            // Build full folder path
            let fullPath = '';
            let hierarchyExtraction = { coach: null, student: null, confidence: 0 };
            
            if (folderId) {
                console.log(`   Building folder path...`);
                fullPath = await buildFullFolderPath(folderId, folderPathCache);
                console.log(`   Full path: ${fullPath}`);
                
                // Extract from hierarchy
                hierarchyExtraction = extractFromFolderHierarchy(fullPath);
                if (hierarchyExtraction.coach || hierarchyExtraction.student) {
                    console.log(`   ✅ Could extract from hierarchy:`);
                    console.log(`      Coach: ${hierarchyExtraction.coach || 'Not found'}`);
                    console.log(`      Student: ${hierarchyExtraction.student || 'Not found'}`);
                    console.log(`      Method: ${hierarchyExtraction.method}`);
                    console.log(`      Confidence: ${(hierarchyExtraction.confidence * 100).toFixed(0)}%`);
                }
            }
            
            // Analyze why it failed
            console.log(`\n   ❌ Why extraction failed:`);
            
            // Check if it's an email subject line
            if (rawName.includes('Re:') || rawName.includes('Fwd:')) {
                console.log(`      - Folder name appears to be an email subject line`);
            }
            
            // Check if it matches standard patterns
            const standardPatterns = [
                /^(Coaching|GamePlan|SAT)_([^_]+)_([^_]+)_Wk(\d+)/,
                /([A-Za-z]+)\s*<>\s*([A-Za-z]+)/,
                /([A-Za-z]+)\s+and\s+([A-Za-z]+)/i
            ];
            
            let matchesPattern = false;
            for (const pattern of standardPatterns) {
                if (pattern.test(rawName)) {
                    matchesPattern = true;
                    break;
                }
            }
            
            if (!matchesPattern) {
                console.log(`      - Raw name doesn't match standard patterns`);
            }
            
            // Store analysis
            analysisResults.push({
                standardizedName,
                rawName,
                currentCoach: coach,
                currentStudent: student,
                category,
                fullPath,
                hierarchyExtraction,
                isEmailSubject: rawName.includes('Re:') || rawName.includes('Fwd:'),
                matchesPattern
            });
        }
        
        // Summary
        console.log('\n\n📊 ANALYSIS SUMMARY:');
        console.log('=====================================\n');
        
        const extractableCount = analysisResults.filter(r => 
            r.hierarchyExtraction.coach || r.hierarchyExtraction.student
        ).length;
        
        console.log(`Total unknown recordings: ${unknownRecordings.length}`);
        console.log(`Analyzed sample: ${analysisResults.length}`);
        console.log(`Could extract from hierarchy: ${extractableCount} (${(extractableCount/analysisResults.length*100).toFixed(0)}%)`);
        console.log(`Email subject folders: ${analysisResults.filter(r => r.isEmailSubject).length}`);
        console.log(`Non-standard names: ${analysisResults.filter(r => !r.matchesPattern).length}`);
        
        // Category breakdown
        const categoryCount = {};
        unknownRecordings.forEach(row => {
            const cat = row[cols.category] || 'None';
            categoryCount[cat] = (categoryCount[cat] || 0) + 1;
        });
        
        console.log('\nCategory breakdown of unknown recordings:');
        Object.entries(categoryCount).forEach(([cat, count]) => {
            console.log(`  ${cat}: ${count}`);
        });
        
        console.log('\n🔧 RECOMMENDATIONS:');
        console.log('1. Enhance metadata extraction to build full folder paths during Drive import');
        console.log('2. Add folder hierarchy analysis as a fallback extraction method');
        console.log('3. Store folder hierarchy path in the recording metadata');
        console.log('4. Handle email subject line folder names more gracefully');
        console.log('5. Consider a manual review process for high-value recordings');
        
        // Save detailed results
        const detailedResults = {
            timestamp: new Date().toISOString(),
            summary: {
                totalUnknown: unknownRecordings.length,
                analyzedSample: analysisResults.length,
                extractableFromHierarchy: extractableCount,
                emailSubjectFolders: analysisResults.filter(r => r.isEmailSubject).length,
                categoryBreakdown: categoryCount
            },
            recordings: analysisResults
        };
        
        await fs.writeFile(
            path.join(__dirname, '../data/drive-unknown-recordings-analysis.json'),
            JSON.stringify(detailedResults, null, 2)
        );
        
        console.log('\n✅ Analysis complete! Results saved to data/drive-unknown-recordings-analysis.json');
        
    } catch (error) {
        console.error('❌ Error analyzing recordings:', error);
    }
}

// Run the analysis
analyzeDriveUnknownRecordings().catch(console.error);