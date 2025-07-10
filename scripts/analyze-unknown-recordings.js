#!/usr/bin/env node

/**
 * Analyze Unknown Recordings from Drive Import
 * 
 * This script analyzes recordings marked as "unknown" to understand why
 * the metadata extraction failed to identify coach/student information.
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
 * Analyze unknown recordings from the sheet
 */
async function analyzeUnknownRecordings() {
    console.log('🔍 Analyzing unknown recordings from Google Sheets...\n');
    
    try {
        // Read the unknown recordings sheet
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.google.sheets.masterIndexSheetId,
            range: 'Unknown!A2:Z'
        });
        
        const rows = response.data.values || [];
        console.log(`Found ${rows.length} unknown recordings to analyze\n`);
        
        // Get headers
        const headerResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: config.google.sheets.masterIndexSheetId,
            range: 'Unknown!A1:Z1'
        });
        const headers = headerResponse.data.values[0];
        
        // Find relevant column indices
        const cols = {
            folderName: headers.indexOf('Folder Name'),
            rawName: headers.indexOf('Raw Name'),
            folderId: headers.indexOf('Folder ID'),
            participantCount: headers.indexOf('Participant Count'),
            duration: headers.indexOf('Duration (min)')
        };
        
        // Analyze each recording
        const analysisResults = [];
        const folderPathCache = new Map();
        
        for (let i = 0; i < Math.min(rows.length, 10); i++) { // Analyze first 10 for demo
            const row = rows[i];
            const folderName = row[cols.folderName] || '';
            const rawName = row[cols.rawName] || '';
            const folderId = row[cols.folderId] || '';
            
            console.log(`\n📁 Recording ${i + 1}:`);
            console.log(`   Folder: ${folderName}`);
            console.log(`   Topic: ${rawName}`);
            
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
                    console.log(`   ✅ Extracted from hierarchy:`);
                    console.log(`      Coach: ${hierarchyExtraction.coach || 'Not found'}`);
                    console.log(`      Student: ${hierarchyExtraction.student || 'Not found'}`);
                    console.log(`      Method: ${hierarchyExtraction.method}`);
                    console.log(`      Confidence: ${(hierarchyExtraction.confidence * 100).toFixed(0)}%`);
                }
            }
            
            // Analyze why it failed
            console.log(`\n   ❌ Why extraction failed:`);
            
            // Check folder name pattern
            const standardPatterns = [
                /^(Coaching|GamePlan|SAT)_([^_]+)_([^_]+)_Wk(\d+)/,
                /^(\d{4}-\d{2}-\d{2})_([^-]+)-([^_]+)_Week(\d+)/
            ];
            
            let matchesStandardPattern = false;
            for (const pattern of standardPatterns) {
                if (pattern.test(folderName)) {
                    matchesStandardPattern = true;
                    break;
                }
            }
            
            if (!matchesStandardPattern) {
                console.log(`      - Folder name doesn't match standard patterns`);
                console.log(`      - Expected: "Coaching_Coach_Student_WkXX_Date" or similar`);
                console.log(`      - Actual: "${folderName}"`);
            }
            
            // Check if it's an email subject line
            if (folderName.includes('Re:') || folderName.includes('Fwd:')) {
                console.log(`      - Folder name appears to be an email subject line`);
            }
            
            // Store analysis
            analysisResults.push({
                folderName,
                rawName,
                fullPath,
                hierarchyExtraction,
                matchesStandardPattern,
                isEmailSubject: folderName.includes('Re:') || folderName.includes('Fwd:')
            });
        }
        
        // Summary
        console.log('\n\n📊 ANALYSIS SUMMARY:');
        console.log('=====================================\n');
        
        const extractableCount = analysisResults.filter(r => 
            r.hierarchyExtraction.coach || r.hierarchyExtraction.student
        ).length;
        
        console.log(`Total analyzed: ${analysisResults.length}`);
        console.log(`Could extract from hierarchy: ${extractableCount} (${(extractableCount/analysisResults.length*100).toFixed(0)}%)`);
        console.log(`Non-standard folder names: ${analysisResults.filter(r => !r.matchesStandardPattern).length}`);
        console.log(`Email subject folders: ${analysisResults.filter(r => r.isEmailSubject).length}`);
        
        console.log('\n🔧 RECOMMENDATIONS:');
        console.log('1. Enhance EnhancedMetadataExtractor to build and use full folder paths');
        console.log('2. Add folder hierarchy extraction as a fallback method');
        console.log('3. Handle email subject line folder names gracefully');
        console.log('4. Consider adding a manual review process for ambiguous recordings');
        
        // Save detailed results
        const detailedResults = {
            timestamp: new Date().toISOString(),
            summary: {
                totalAnalyzed: analysisResults.length,
                extractableFromHierarchy: extractableCount,
                nonStandardFolders: analysisResults.filter(r => !r.matchesStandardPattern).length,
                emailSubjectFolders: analysisResults.filter(r => r.isEmailSubject).length
            },
            recordings: analysisResults
        };
        
        await fs.writeFile(
            path.join(__dirname, '../data/unknown-recordings-analysis.json'),
            JSON.stringify(detailedResults, null, 2)
        );
        
        console.log('\n✅ Analysis complete! Results saved to data/unknown-recordings-analysis.json');
        
    } catch (error) {
        console.error('❌ Error analyzing recordings:', error);
    }
}

// Run the analysis
analyzeUnknownRecordings().catch(console.error);