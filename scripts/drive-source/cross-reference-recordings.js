#!/usr/bin/env node

const { google } = require('googleapis');
const standaloneConfig = require('../../src/drive-source/config/standalone-config');
const fs = require('fs').promises;

async function crossReferenceRecordings() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║      Cross-Reference Historical vs Current Recordings          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const auth = new google.auth.JWT(
    standaloneConfig.google.clientEmail,
    null,
    standaloneConfig.google.privateKey,
    ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
  );

  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  try {
    // Step 1: Read historical sheet
    console.log('📊 Reading historical sheet...');
    const historicalSheetId = '1rIi9PFBZD9GASM2z_xko0h9lg9etZAYv3wm8w0reeiw';
    
    const historicalResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: historicalSheetId,
      range: 'A:Z'
    });

    const historicalRows = historicalResponse.data.values || [];
    
    // Step 2: Read our test sheet
    console.log('📊 Reading test processing sheet...');
    const testSheetId = standaloneConfig.google.sheets.masterIndexSheetId;
    
    let testRows = [];
    if (testSheetId && testSheetId !== 'CREATE_TEST_SHEET') {
      try {
        const testResponse = await sheets.spreadsheets.values.get({
          spreadsheetId: testSheetId,
          range: 'A:Z'
        });
        testRows = testResponse.data.values || [];
      } catch (err) {
        console.log('Test sheet not accessible yet');
      }
    }

    // Step 3: Parse historical data
    console.log('\n📋 Parsing recording data...\n');
    
    const historicalRecordings = new Map();
    const folderIds = new Set();
    const coachStudentPairs = new Map();
    
    // Parse historical rows (skip header)
    for (let i = 1; i < historicalRows.length; i++) {
      const row = historicalRows[i];
      const driveLink = row[17] || '';
      const folderIdMatch = driveLink.match(/folders\/([a-zA-Z0-9-_]+)/);
      
      if (folderIdMatch) {
        const folderId = folderIdMatch[1];
        const sessionInfo = row[2] || ''; // The "Name" column contains session info
        
        // Parse session info
        const coachMatch = sessionInfo.match(/Coach\s+([^<>|]+)\s*<>/);
        const studentMatch = sessionInfo.match(/<>\s*([^|]+)\s*\|/);
        const weekMatch = sessionInfo.match(/Week\s+(\d+)/);
        const dateMatch = sessionInfo.match(/([A-Z][a-z]+\.?\s+\d+,?\s+\d{4})/);
        
        const recording = {
          folderId,
          fingerprint: row[1],
          sessionName: sessionInfo,
          coach: coachMatch ? coachMatch[1].trim() : 'Unknown',
          student: studentMatch ? studentMatch[1].trim() : 'Unknown',
          week: weekMatch ? parseInt(weekMatch[1]) : null,
          date: dateMatch ? dateMatch[1] : row[4],
          driveLink,
          source: row[3] || 'historical'
        };
        
        historicalRecordings.set(folderId, recording);
        folderIds.add(folderId);
        
        // Track coach-student pairs
        const pairKey = `${recording.coach}|${recording.student}`;
        if (!coachStudentPairs.has(pairKey)) {
          coachStudentPairs.set(pairKey, []);
        }
        coachStudentPairs.get(pairKey).push(recording);
      }
    }
    
    console.log(`Found ${historicalRecordings.size} historical recordings`);
    console.log(`Unique folder IDs: ${folderIds.size}`);
    console.log(`Unique coach-student pairs: ${coachStudentPairs.size}`);

    // Step 4: Show coach-student relationships
    console.log('\n👥 Coach-Student Relationships:');
    const sortedPairs = Array.from(coachStudentPairs.entries())
      .sort(([a], [b]) => a.localeCompare(b));
    
    for (const [pair, recordings] of sortedPairs.slice(0, 20)) {
      const [coach, student] = pair.split('|');
      console.log(`\n${coach} <> ${student}: ${recordings.length} sessions`);
      
      // Show week range
      const weeks = recordings
        .map(r => r.week)
        .filter(w => w !== null)
        .sort((a, b) => a - b);
      
      if (weeks.length > 0) {
        console.log(`  Weeks: ${weeks[0]} - ${weeks[weeks.length - 1]}`);
      }
    }

    // Step 5: Check for unprocessed recordings in known locations
    console.log('\n🔍 Checking for unprocessed recordings...\n');
    
    // Sample check - Jenny's folder
    const jennyFolderId = standaloneConfig.driveSource.coachFolders['Jenny'];
    console.log(`Checking Jenny's folder (${jennyFolderId})...`);
    
    const subfolders = await listSubfolders(drive, jennyFolderId);
    let unprocessedCount = 0;
    
    for (const folder of subfolders.slice(0, 10)) {
      // Check if this folder is in historical data
      if (!historicalRecordings.has(folder.id)) {
        console.log(`  ❗ Unprocessed: ${folder.name}`);
        unprocessedCount++;
      }
    }
    
    if (unprocessedCount === 0) {
      console.log('  ✓ All checked folders appear to be processed');
    }

    // Step 6: Export actionable data
    console.log('\n💾 Exporting analysis...');
    
    const exportData = {
      summary: {
        totalHistorical: historicalRecordings.size,
        totalTestProcessed: Math.max(0, testRows.length - 1),
        uniqueCoaches: new Set(Array.from(historicalRecordings.values()).map(r => r.coach)).size,
        uniqueStudents: new Set(Array.from(historicalRecordings.values()).map(r => r.student)).size
      },
      coachStudentPairs: Object.fromEntries(
        Array.from(coachStudentPairs.entries())
          .map(([pair, recordings]) => [
            pair,
            {
              count: recordings.length,
              weeks: recordings.map(r => r.week).filter(w => w !== null).sort((a, b) => a - b)
            }
          ])
      ),
      sampleRecordings: Array.from(historicalRecordings.values()).slice(0, 10)
    };
    
    await fs.writeFile(
      'cross-reference-analysis.json',
      JSON.stringify(exportData, null, 2)
    );
    
    console.log('Exported analysis to cross-reference-analysis.json');
    
    console.log('\n📊 Summary:');
    console.log('- Historical sheet contains already processed recordings');
    console.log('- Each recording has a fingerprint and organized folder');
    console.log('- Can use this to avoid reprocessing already handled recordings');
    console.log('- Can extract coach-student relationships for validation');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function listSubfolders(drive, folderId) {
  try {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      pageSize: 100
    });
    return response.data.files || [];
  } catch (error) {
    console.error('Error listing folders:', error.message);
    return [];
  }
}

crossReferenceRecordings().catch(console.error);