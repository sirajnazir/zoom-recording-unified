#!/usr/bin/env node

/**
 * Fix and Move Unknown Recordings
 * 1. Finds unknown folders in Knowledge Base/Students
 * 2. Reprocesses to extract proper coach/student names
 * 3. Updates sheets with correct information
 * 4. Moves folders to proper student paths
 */

require('dotenv').config();
const { google } = require('googleapis');
const { createContainer } = require('../src/container');
const IntegratedDriveProcessorV4 = require('../src/drive-source/services/IntegratedDriveProcessorV4');
const MultiTabGoogleSheetsService = require('../src/infrastructure/services/MultiTabGoogleSheetsService');
const awilix = require('awilix');
const config = require('../config');

// Knowledge Base Students folder ID
const STUDENTS_FOLDER_ID = config.google.drive.organizedRecordingsFolder || '12LgtSd9CpOllNBBycCfxPVFB6Sk9bTIp';

async function initializeGoogleDrive() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: config.google.clientEmail,
            private_key: config.google.privateKey
        },
        scopes: ['https://www.googleapis.com/auth/drive']  // Need full access to move folders
    });
    
    return google.drive({ version: 'v3', auth });
}

/**
 * Find all unknown folders in Knowledge Base/Students
 */
async function findUnknownFolders(drive) {
    console.log('🔍 Finding unknown folders in Knowledge Base/Students...\n');
    
    const unknownFolders = [];
    
    try {
        // Search for folders with "unknown" in the name
        const response = await drive.files.list({
            q: `'${STUDENTS_FOLDER_ID}' in parents and name contains 'unknown' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name, parents)',
            pageSize: 100
        });
        
        const folders = response.data.files || [];
        
        for (const folder of folders) {
            // Get the original source folder ID from the name
            const match = folder.name.match(/([a-f0-9]{16})U_[a-f0-9]{16}$/);
            if (match) {
                unknownFolders.push({
                    id: folder.id,
                    name: folder.name,
                    sessionId: match[1]
                });
            }
        }
    } catch (error) {
        console.error('Error finding unknown folders:', error.message);
    }
    
    return unknownFolders;
}

/**
 * Find the original source recording for an unknown folder
 */
async function findSourceRecording(drive, sessionId) {
    // The sessionId in the folder name should help us find the original
    // Let's search in S3-Ivylevel for any folder containing recording files
    
    try {
        // Search for recording files by date pattern from the session
        const searchPatterns = [
            `GMT*_Recording*.mp4`,
            `GMT*_Recording*.vtt`,
            `GMT*_Recording*.txt`
        ];
        
        // This is a simplified search - in practice you might need to traverse the S3-Ivylevel structure
        const response = await drive.files.list({
            q: `name contains 'Recording' and trashed = false`,
            fields: 'files(id, name, parents)',
            pageSize: 1000
        });
        
        const files = response.data.files || [];
        
        // Group files by parent folder
        const folderGroups = {};
        for (const file of files) {
            if (file.parents && file.parents[0]) {
                if (!folderGroups[file.parents[0]]) {
                    folderGroups[file.parents[0]] = [];
                }
                folderGroups[file.parents[0]].push(file);
            }
        }
        
        // Find the folder that matches our session
        for (const [folderId, folderFiles] of Object.entries(folderGroups)) {
            // Check if any file in this folder matches our session pattern
            // This is a heuristic - you might need to adjust based on your actual data
            if (folderFiles.length >= 3) { // Likely a recording folder
                return folderId;
            }
        }
    } catch (error) {
        console.error('Error finding source recording:', error.message);
    }
    
    return null;
}

/**
 * Get folder path to extract coach/student context
 */
async function getFolderPath(drive, folderId) {
    const path = [];
    let currentId = folderId;
    
    try {
        for (let depth = 0; depth < 10 && currentId; depth++) {
            const response = await drive.files.get({
                fileId: currentId,
                fields: 'id,name,parents'
            });
            
            path.unshift(response.data.name);
            
            if (response.data.parents && response.data.parents.length > 0) {
                currentId = response.data.parents[0];
            } else {
                break;
            }
        }
    } catch (error) {
        console.error('Error getting folder path:', error.message);
    }
    
    return path;
}

/**
 * Extract coach and student from folder path with enhanced logic
 */
function extractFromPath(folderPath) {
    const result = { coach: null, student: null, date: null };
    
    // First, find coach from "Coach Name" folder pattern
    for (const folder of folderPath) {
        if (folder.toLowerCase().startsWith('coach ')) {
            const coachMatch = folder.match(/Coach\s+([A-Za-z]+)/i);
            if (coachMatch) {
                result.coach = coachMatch[1];
                break;
            }
        }
    }
    
    // Look for "Coach X & Student" pattern in any folder
    for (const folder of folderPath) {
        if (folder.includes('&')) {
            const match = folder.match(/Coach\s+([A-Za-z]+)\s*&\s*([A-Za-z]+)/i);
            if (match) {
                result.coach = result.coach || match[1];
                result.student = match[2];
                break;
            }
        }
    }
    
    // If no student found yet, check the last folder (recording name)
    const lastFolder = folderPath[folderPath.length - 1];
    
    // Pattern 1: "Re: Student/ Parent: ..."
    if (!result.student) {
        const reMatch = lastFolder.match(/Re:\s*([A-Za-z]+)\s*\//i);
        if (reMatch) {
            result.student = reMatch[1];
        }
    }
    
    // Pattern 2: Extract coach from "with CoachName" pattern
    if (!result.coach) {
        const withMatch = lastFolder.match(/with\s+([A-Za-z]+)/i);
        if (withMatch) {
            result.coach = withMatch[1];
        }
    }
    
    // Pattern 3: Look for student names in title patterns like "Student's Practice Test"
    if (!result.student) {
        const nameMatch = lastFolder.match(/^\s*([A-Z][a-z]+)(?:'s|s)?\s+(?:Practice|Test|Session|Homework)/i);
        if (nameMatch) {
            result.student = nameMatch[1];
        }
    }
    
    // Extract date from folder name
    const dateMatch = lastFolder.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i);
    if (dateMatch) {
        const monthNames = {
            'january': '01', 'february': '02', 'march': '03', 'april': '04',
            'may': '05', 'june': '06', 'july': '07', 'august': '08',
            'september': '09', 'october': '10', 'november': '11', 'december': '12'
        };
        const month = monthNames[dateMatch[1].toLowerCase()];
        const day = dateMatch[2].padStart(2, '0');
        const year = dateMatch[3];
        result.date = `${year}-${month}-${day}`;
    }
    
    // Validation: if coach and student are the same, it's likely wrong
    if (result.coach && result.student && result.coach === result.student) {
        // In "Coach Rishi & Aaryan" pattern, Aaryan is the student
        result.student = null;
        // Re-check for actual student name
        for (const folder of folderPath) {
            if (folder.includes(result.coach) && folder.includes('&')) {
                const parts = folder.split('&');
                if (parts.length === 2) {
                    const potentialStudent = parts[1].trim().split(/\s+/)[0];
                    if (/^[A-Z][a-z]+/.test(potentialStudent) && potentialStudent !== result.coach) {
                        result.student = potentialStudent;
                        break;
                    }
                }
            }
        }
    }
    
    return result;
}

/**
 * Update Google Sheets row for a recording
 */
async function updateSheetRow(sheetsService, recordingId, coach, student, newStandardizedName) {
    try {
        // Find the row with this recording ID
        const driveStandardizedTab = 'Drive Import - Standardized';
        const range = `'${driveStandardizedTab}'!A:BZ`;
        
        const response = await sheetsService.sheets.spreadsheets.values.get({
            spreadsheetId: sheetsService.spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const headers = rows[0];
        
        // Find column indices
        const recordingIdCol = headers.indexOf('Recording ID');
        const coachCol = headers.indexOf('Coach');
        const studentCol = headers.indexOf('Student');
        const standardizedNameCol = headers.indexOf('Standardized Name');
        const participantsCol = headers.indexOf('Participants');
        
        // Find the row with our recording
        let rowIndex = -1;
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][recordingIdCol] === recordingId) {
                rowIndex = i;
                break;
            }
        }
        
        if (rowIndex === -1) {
            console.log(`   ⚠️ Row not found for recording ${recordingId}`);
            return false;
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
        
        // Update the row
        const updates = [];
        if (coachCol >= 0) {
            updates.push({
                range: `'${driveStandardizedTab}'!${getColumnLetter(coachCol)}${rowIndex + 1}`,
                values: [[coach]]
            });
        }
        
        if (studentCol >= 0) {
            updates.push({
                range: `'${driveStandardizedTab}'!${getColumnLetter(studentCol)}${rowIndex + 1}`,
                values: [[student]]
            });
        }
        
        if (standardizedNameCol >= 0) {
            updates.push({
                range: `'${driveStandardizedTab}'!${getColumnLetter(standardizedNameCol)}${rowIndex + 1}`,
                values: [[newStandardizedName]]
            });
        }
        
        if (participantsCol >= 0) {
            updates.push({
                range: `'${driveStandardizedTab}'!${getColumnLetter(participantsCol)}${rowIndex + 1}`,
                values: [[`${coach}, ${student}`]]
            });
        }
        
        // Batch update
        if (updates.length > 0) {
            await sheetsService.sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: sheetsService.spreadsheetId,
                resource: {
                    data: updates,
                    valueInputOption: 'USER_ENTERED'
                }
            });
            
            console.log(`   ✅ Updated sheet row ${rowIndex + 1}`);
            return true;
        }
        
    } catch (error) {
        console.error(`   ❌ Error updating sheet:`, error.message);
    }
    
    return false;
}

/**
 * Move folder to proper student path
 */
async function moveFolderToStudentPath(drive, folder, student, newName) {
    try {
        // First, find or create the student folder
        const studentsResponse = await drive.files.list({
            q: `'${STUDENTS_FOLDER_ID}' in parents and name = '${student}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id)',
            pageSize: 1
        });
        
        let studentFolderId;
        if (studentsResponse.data.files && studentsResponse.data.files.length > 0) {
            studentFolderId = studentsResponse.data.files[0].id;
            console.log(`   📁 Found existing student folder: ${student}`);
        } else {
            // Create student folder
            const createResponse = await drive.files.create({
                resource: {
                    name: student,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [STUDENTS_FOLDER_ID]
                },
                fields: 'id'
            });
            studentFolderId = createResponse.data.id;
            console.log(`   📁 Created student folder: ${student}`);
        }
        
        // Update the folder: rename and move
        await drive.files.update({
            fileId: folder.id,
            addParents: studentFolderId,
            removeParents: STUDENTS_FOLDER_ID,
            resource: {
                name: newName
            },
            fields: 'id, name, parents'
        });
        
        console.log(`   ✅ Moved and renamed folder to: ${student}/${newName}`);
        return true;
        
    } catch (error) {
        console.error(`   ❌ Error moving folder:`, error.message);
        return false;
    }
}

async function main() {
    console.log('🔧 Fixing and Moving Unknown Recordings');
    console.log('=' .repeat(70));
    
    try {
        // Initialize services
        console.log('\n🔧 Initializing services...');
        
        const container = createContainer();
        const scope = container.createScope();
        
        // Get sheets service
        const sheetsAuth = new google.auth.GoogleAuth({
            credentials: {
                client_email: config.google.clientEmail,
                private_key: config.google.privateKey
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        
        const sheets = google.sheets({ version: 'v4', auth: sheetsAuth });
        const sheetsService = {
            sheets,
            spreadsheetId: config.google.sheets.masterIndexSheetId
        };
        
        const drive = await initializeGoogleDrive();
        
        console.log('✅ Services initialized\n');
        
        // Find unknown folders
        const unknownFolders = await findUnknownFolders(drive);
        
        if (unknownFolders.length === 0) {
            console.log('❌ No unknown folders found in Knowledge Base/Students');
            return;
        }
        
        console.log(`📊 Found ${unknownFolders.length} unknown folders to fix\n`);
        
        // Process each unknown folder
        let stats = {
            total: unknownFolders.length,
            fixed: 0,
            moved: 0,
            errors: 0
        };
        
        for (let i = 0; i < unknownFolders.length; i++) {
            const folder = unknownFolders[i];
            
            console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`[${i + 1}/${stats.total}] Processing: ${folder.name}`);
            console.log(`   Session ID: ${folder.sessionId}`);
            
            try {
                // Get files in this folder to find the source
                const filesResponse = await drive.files.list({
                    q: `'${folder.id}' in parents and trashed = false`,
                    fields: 'files(id, name, shortcutDetails)',
                    pageSize: 10
                });
                
                const files = filesResponse.data.files || [];
                
                // Find a shortcut to trace back to source
                let sourceFolderId = null;
                for (const file of files) {
                    if (file.shortcutDetails && file.shortcutDetails.targetId) {
                        // Get the target file's parent
                        const targetResponse = await drive.files.get({
                            fileId: file.shortcutDetails.targetId,
                            fields: 'parents'
                        });
                        
                        if (targetResponse.data.parents && targetResponse.data.parents[0]) {
                            sourceFolderId = targetResponse.data.parents[0];
                            break;
                        }
                    }
                }
                
                if (!sourceFolderId) {
                    console.log(`   ⚠️ Could not find source folder`);
                    stats.errors++;
                    continue;
                }
                
                // Get the source folder path
                const folderPath = await getFolderPath(drive, sourceFolderId);
                console.log(`   📍 Source path: ${folderPath.join(' / ')}`);
                
                // Extract coach and student
                const extracted = extractFromPath(folderPath);
                console.log(`   👥 Extracted - Coach: ${extracted.coach || 'Unknown'}, Student: ${extracted.student || 'Unknown'}`);
                if (extracted.date) {
                    console.log(`   📅 Date: ${extracted.date}`);
                }
                
                if (!extracted.coach || !extracted.student) {
                    console.log(`   ⚠️ Could not extract coach/student from path`);
                    stats.errors++;
                    continue;
                }
                
                // Generate new standardized name
                const date = extracted.date || folder.name.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '2025-07-07';
                const newStandardizedName = `Coaching_B_${extracted.coach}_${extracted.student}_Wk01_${date}_M_${folder.sessionId}U_${folder.sessionId}`;
                console.log(`   📝 New name: ${newStandardizedName}`);
                
                // Update the Google Sheets
                const sheetUpdated = await updateSheetRow(
                    sheetsService,
                    folder.sessionId,
                    extracted.coach,
                    extracted.student,
                    newStandardizedName
                );
                
                if (sheetUpdated) {
                    stats.fixed++;
                }
                
                // Move folder to proper location
                const moved = await moveFolderToStudentPath(
                    drive,
                    folder,
                    extracted.student,
                    newStandardizedName
                );
                
                if (moved) {
                    stats.moved++;
                }
                
            } catch (error) {
                console.error(`   ❌ Error processing folder:`, error.message);
                stats.errors++;
            }
            
            // Small delay
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Final summary
        console.log('\n' + '═'.repeat(70));
        console.log('📊 FIX AND MOVE SUMMARY');
        console.log('═'.repeat(70));
        console.log(`✅ Total folders: ${stats.total}`);
        console.log(`✅ Sheets fixed: ${stats.fixed}`);
        console.log(`✅ Folders moved: ${stats.moved}`);
        console.log(`❌ Errors: ${stats.errors}`);
        console.log('═'.repeat(70));
        
        console.log('\n✅ Processing complete!');
        console.log('📊 Check Google Sheets - the unknown recordings should now show proper coach/student names');
        console.log('📁 Check Knowledge Base/Students - folders should be in proper student folders');
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

console.log('🚀 Starting fix and move process...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });