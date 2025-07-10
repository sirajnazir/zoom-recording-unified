#!/usr/bin/env node

/**
 * Smart fix for remaining unknown recordings
 * Uses intelligent name extraction from various folder name formats
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

// Known coach names for better matching
const KNOWN_COACHES = ['Jenny', 'Rishi', 'Alan', 'Andrew', 'Juli', 'Mouli'];

// Known student names (can be extended)
const KNOWN_STUDENTS = ['Huda', 'Anoushka', 'Aaryan', 'Rayaan', 'Ananyaa', 'Aarav', 'Aarnav'];

async function initializeServices() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: config.google.clientEmail,
            private_key: config.google.privateKey
        },
        scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
    });
    
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });
    
    return { drive, sheets };
}

/**
 * Smart extraction of coach and student names from folder name
 * Handles various formats like:
 * - "Ivy Mentor Jenny Duan <> Huda l 90-Min Assessment"
 * - "Jenny 360 Assess - Anoushka Chakravarty and Ivy Mentors"
 * - "Coach Rishi & Aaryan"
 * - etc.
 */
function smartExtractNames(folderName) {
    console.log(`\n🔍 Extracting from: "${folderName}"`);
    
    const result = { coach: null, student: null, confidence: 0 };
    
    // Clean the folder name
    const cleaned = folderName
        .replace(/\s+/g, ' ')
        .replace(/[_-]+/g, ' ')
        .trim();
    
    // Method 1: Look for known coach names
    for (const coach of KNOWN_COACHES) {
        const coachRegex = new RegExp(`\\b${coach}\\b`, 'i');
        if (coachRegex.test(cleaned)) {
            result.coach = coach;
            console.log(`   ✓ Found known coach: ${coach}`);
            break;
        }
    }
    
    // Method 2: Look for "Coach Name" pattern
    if (!result.coach) {
        const coachMatch = cleaned.match(/\bCoach\s+([A-Z][a-z]+)\b/i);
        if (coachMatch) {
            result.coach = coachMatch[1];
            console.log(`   ✓ Found coach from pattern: ${result.coach}`);
        }
    }
    
    // Method 3: Look for known student names
    for (const student of KNOWN_STUDENTS) {
        const studentRegex = new RegExp(`\\b${student}\\b`, 'i');
        if (studentRegex.test(cleaned)) {
            result.student = student;
            console.log(`   ✓ Found known student: ${student}`);
            break;
        }
    }
    
    // Method 4: Extract names from specific patterns
    if (!result.student || !result.coach) {
        // Pattern: "Name1 <> Name2"
        const angleMatch = cleaned.match(/([A-Z][a-z]+)(?:\s+[A-Z][a-z]+)?\s*<>\s*([A-Z][a-z]+)/i);
        if (angleMatch) {
            if (!result.coach && angleMatch[1]) {
                const name1 = angleMatch[1];
                if (KNOWN_COACHES.includes(name1)) {
                    result.coach = name1;
                }
            }
            if (!result.student && angleMatch[2]) {
                result.student = angleMatch[2];
                console.log(`   ✓ Found student from <> pattern: ${result.student}`);
            }
        }
        
        // Pattern: "Name1 & Name2"
        const andMatch = cleaned.match(/([A-Z][a-z]+)\s*&\s*([A-Z][a-z]+)/i);
        if (andMatch) {
            if (!result.coach && KNOWN_COACHES.includes(andMatch[1])) {
                result.coach = andMatch[1];
            }
            if (!result.student) {
                result.student = andMatch[2];
                console.log(`   ✓ Found student from & pattern: ${result.student}`);
            }
        }
    }
    
    // Method 5: Look for full names and extract first name
    if (!result.student) {
        // Pattern for full names like "Anoushka Chakravarty"
        const fullNameMatch = cleaned.match(/\b([A-Z][a-z]+)\s+[A-Z][a-z]+(?:\s+and\s+|\s+&\s+|\s+-\s+)/);
        if (fullNameMatch && !KNOWN_COACHES.includes(fullNameMatch[1])) {
            result.student = fullNameMatch[1];
            console.log(`   ✓ Found student from full name: ${result.student}`);
        }
    }
    
    // Method 6: If we have a coach but no student, look for any other capitalized name
    if (result.coach && !result.student) {
        const names = cleaned.match(/\b[A-Z][a-z]+\b/g) || [];
        for (const name of names) {
            if (name !== result.coach && 
                !['Coach', 'Ivy', 'Mentor', 'Mentors', 'Ivylevel', 'Assessment', 'Assess', 'Week', 'Session', 'Meeting', 'Min'].includes(name)) {
                result.student = name;
                console.log(`   ✓ Found student by elimination: ${result.student}`);
                break;
            }
        }
    }
    
    // Calculate confidence
    if (result.coach && result.student) {
        result.confidence = 90;
    } else if (result.coach || result.student) {
        result.confidence = 50;
    }
    
    console.log(`   📊 Result: Coach="${result.coach || 'Unknown'}", Student="${result.student || 'Unknown'}", Confidence=${result.confidence}%`);
    
    return result;
}

/**
 * Get the original folder path from Google Drive
 */
async function getOriginalFolderInfo(drive, folderId) {
    try {
        // Get the folder
        const folder = await drive.files.get({
            fileId: folderId,
            fields: 'id,name,parents'
        });
        
        // Get all shortcuts in this folder
        const shortcuts = await drive.files.list({
            q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.shortcut'`,
            fields: 'files(id,name,shortcutDetails)',
            pageSize: 10
        });
        
        if (shortcuts.data.files && shortcuts.data.files.length > 0) {
            // Get the target of the first shortcut
            const shortcut = shortcuts.data.files[0];
            if (shortcut.shortcutDetails && shortcut.shortcutDetails.targetId) {
                // Get the target file's parent
                const target = await drive.files.get({
                    fileId: shortcut.shortcutDetails.targetId,
                    fields: 'parents'
                });
                
                if (target.data.parents && target.data.parents[0]) {
                    // Get the original folder
                    const originalFolder = await drive.files.get({
                        fileId: target.data.parents[0],
                        fields: 'id,name'
                    });
                    
                    return {
                        id: originalFolder.data.id,
                        name: originalFolder.data.name
                    };
                }
            }
        }
    } catch (error) {
        console.error(`Error getting original folder: ${error.message}`);
    }
    
    return null;
}

// Helper function to convert column index to A1 notation
function getColumnLetter(colIndex) {
    let letter = '';
    let num = colIndex;
    while (num >= 0) {
        letter = String.fromCharCode((num % 26) + 65) + letter;
        num = Math.floor(num / 26) - 1;
    }
    return letter;
}

/**
 * Extract date from folder name
 */
function extractDate(folderName) {
    // Try various date patterns
    const patterns = [
        /([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/,  // "August 19, 2023"
        /(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/,   // "08/19/2023" or "08-19-2023"
        /(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/    // "2023-08-19"
    ];
    
    for (const pattern of patterns) {
        const match = folderName.match(pattern);
        if (match) {
            if (isNaN(match[1])) {
                // Month name format
                const monthNames = {
                    'january': '01', 'february': '02', 'march': '03', 'april': '04',
                    'may': '05', 'june': '06', 'july': '07', 'august': '08',
                    'september': '09', 'october': '10', 'november': '11', 'december': '12'
                };
                const month = monthNames[match[1].toLowerCase()];
                if (month) {
                    return `${match[3]}-${month}-${match[2].padStart(2, '0')}`;
                }
            } else {
                // Numeric format
                return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
            }
        }
    }
    
    return null;
}

async function fixRemainingUnknowns(drive, sheets) {
    const spreadsheetId = config.google.sheets.masterIndexSheetId;
    const tabName = 'Drive Import - Standardized';
    
    console.log('📊 Finding remaining unknown recordings...\n');
    
    const range = `'${tabName}'!A:BZ`;
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range
    });
    
    const rows = response.data.values || [];
    const headers = rows[0];
    
    // Find column indices
    const cols = {
        uuid: headers.indexOf('uuid'),
        standardizedName: headers.indexOf('standardizedName'),
        driveLink: headers.findIndex(h => h && h.toLowerCase().includes('drive') && h.toLowerCase().includes('link')),
        participants: headers.indexOf('participants')
    };
    
    // Find all unknown recordings
    const unknownRecordings = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        
        const standardizedName = row[cols.standardizedName] || '';
        if (standardizedName.toLowerCase().includes('unknown')) {
            const driveLink = row[cols.driveLink] || '';
            const folderId = driveLink.match(/folders\/([a-zA-Z0-9_-]+)/)?.[1];
            
            if (folderId) {
                unknownRecordings.push({
                    rowIndex: i,
                    uuid: row[cols.uuid] || '',
                    standardizedName: standardizedName,
                    folderId: folderId,
                    driveLink: driveLink
                });
            }
        }
    }
    
    console.log(`Found ${unknownRecordings.length} unknown recordings to fix\n`);
    
    const updates = [];
    let successCount = 0;
    
    // Process each unknown recording
    for (let idx = 0; idx < unknownRecordings.length; idx++) {
        const recording = unknownRecordings[idx];
        
        console.log(`\n${'='.repeat(70)}`);
        console.log(`[${idx + 1}/${unknownRecordings.length}] Processing row ${recording.rowIndex + 1}`);
        console.log(`UUID: ${recording.uuid}`);
        console.log(`Current name: ${recording.standardizedName}`);
        
        // Get original folder info
        const originalFolder = await getOriginalFolderInfo(drive, recording.folderId);
        
        if (originalFolder) {
            console.log(`\n📁 Original folder: "${originalFolder.name}"`);
            
            // Extract names
            const extracted = smartExtractNames(originalFolder.name);
            
            if (extracted.coach || extracted.student) {
                // Extract date
                const date = extractDate(originalFolder.name) || '2025-07-07';
                
                // Update standardized name
                const newStandardizedName = recording.standardizedName
                    .replace(/unknown/i, extracted.coach || 'unknown')
                    .replace(/Unknown/i, extracted.student || 'Unknown')
                    .replace(/2025-07-07/g, date);
                
                console.log(`\n✅ New standardized name: ${newStandardizedName}`);
                
                updates.push({
                    range: `'${tabName}'!${getColumnLetter(cols.standardizedName)}${recording.rowIndex + 1}`,
                    values: [[newStandardizedName]]
                });
                
                // Update participants
                if (extracted.coach && extracted.student && cols.participants >= 0) {
                    updates.push({
                        range: `'${tabName}'!${getColumnLetter(cols.participants)}${recording.rowIndex + 1}`,
                        values: [[`${extracted.coach}, ${extracted.student}`]]
                    });
                }
                
                successCount++;
            } else {
                console.log('\n❌ Could not extract names from folder');
            }
        } else {
            console.log('\n❌ Could not find original folder');
        }
        
        // Small delay to avoid rate limits
        if (idx < unknownRecordings.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
    
    // Apply all updates
    if (updates.length > 0) {
        console.log(`\n\n📝 Applying ${updates.length} updates to sheets...`);
        
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            resource: {
                data: updates,
                valueInputOption: 'USER_ENTERED'
            }
        });
        
        console.log(`✅ Successfully updated ${successCount} recordings`);
    }
    
    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total unknown recordings: ${unknownRecordings.length}`);
    console.log(`Successfully fixed: ${successCount}`);
    console.log(`Failed to fix: ${unknownRecordings.length - successCount}`);
}

async function main() {
    console.log('🔧 Smart Fix for Remaining Unknown Recordings');
    console.log('=' .repeat(70));
    console.log('This will intelligently extract coach/student names from various folder formats\n');
    
    try {
        const { drive, sheets } = await initializeServices();
        await fixRemainingUnknowns(drive, sheets);
        
        console.log('\n✅ Process complete!');
        
    } catch (error) {
        console.error('\n❌ Error:', error);
        console.error('Stack:', error.stack);
    }
}

console.log('🚀 Starting smart extraction process...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });