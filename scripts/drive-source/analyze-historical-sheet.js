#!/usr/bin/env node

const { google } = require('googleapis');
const standaloneConfig = require('../../src/drive-source/config/standalone-config');

async function analyzeHistoricalSheet() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║        Analyze Historical Recordings Google Sheet              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const auth = new google.auth.JWT(
    standaloneConfig.google.clientEmail,
    null,
    standaloneConfig.google.privateKey,
    ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
  );

  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  // Historical sheet ID from the URL
  const historicalSheetId = '1rIi9PFBZD9GASM2z_xko0h9lg9etZAYv3wm8w0reeiw';

  try {
    // Step 1: Read the historical sheet
    console.log('📊 Reading historical recordings sheet...\n');
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: historicalSheetId,
      range: 'A:Z' // Get all columns
    });

    const rows = response.data.values || [];
    console.log(`Found ${rows.length} rows (including header)\n`);

    if (rows.length < 2) {
      console.log('No data rows found');
      return;
    }

    // Step 2: Analyze the data structure
    const headers = rows[0];
    console.log('Column headers:');
    headers.forEach((header, index) => {
      console.log(`  ${index}: ${header}`);
    });

    // Step 3: Process data rows
    const recordings = [];
    const stats = {
      total: 0,
      withLink: 0,
      withoutLink: 0,
      byCoach: {},
      byStudent: {},
      byDate: {},
      linkPatterns: new Set(),
      missingInfo: []
    };

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      stats.total++;

      // Map row data based on common patterns
      const recording = {
        rowNumber: i + 1,
        date: row[0] || '',
        coach: row[1] || '',
        student: row[2] || '',
        week: row[3] || '',
        driveLink: row[4] || row[5] || '', // Check multiple columns for links
        notes: row[6] || '',
        rawData: row
      };

      // Find Drive link in any column
      for (let j = 0; j < row.length; j++) {
        if (row[j] && row[j].includes('drive.google.com')) {
          recording.driveLink = row[j];
          break;
        }
      }

      recordings.push(recording);

      // Update statistics
      if (recording.driveLink) {
        stats.withLink++;
        // Extract folder ID from link
        const folderIdMatch = recording.driveLink.match(/folders\/([a-zA-Z0-9-_]+)/);
        if (folderIdMatch) {
          recording.folderId = folderIdMatch[1];
        }
      } else {
        stats.withoutLink++;
      }

      // Track by coach
      if (recording.coach) {
        stats.byCoach[recording.coach] = (stats.byCoach[recording.coach] || 0) + 1;
      }

      // Track by student
      if (recording.student) {
        stats.byStudent[recording.student] = (stats.byStudent[recording.student] || 0) + 1;
      }

      // Track missing info
      if (!recording.date || !recording.coach || !recording.student) {
        stats.missingInfo.push({
          row: recording.rowNumber,
          missing: [
            !recording.date && 'date',
            !recording.coach && 'coach',
            !recording.student && 'student'
          ].filter(Boolean)
        });
      }
    }

    // Step 4: Display analysis
    console.log('\n📈 Summary Statistics:');
    console.log(`- Total recordings: ${stats.total}`);
    console.log(`- With Drive links: ${stats.withLink}`);
    console.log(`- Without Drive links: ${stats.withoutLink}`);

    console.log('\n👨‍🏫 Recordings by Coach:');
    Object.entries(stats.byCoach)
      .sort(([,a], [,b]) => b - a)
      .forEach(([coach, count]) => {
        console.log(`  ${coach}: ${count}`);
      });

    console.log('\n👩‍🎓 Recordings by Student:');
    Object.entries(stats.byStudent)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10) // Show top 10
      .forEach(([student, count]) => {
        console.log(`  ${student}: ${count}`);
      });

    console.log('\n⚠️  Missing Information:');
    if (stats.missingInfo.length === 0) {
      console.log('  None - all recordings have complete information');
    } else {
      console.log(`  ${stats.missingInfo.length} recordings with missing data`);
      stats.missingInfo.slice(0, 5).forEach(item => {
        console.log(`  Row ${item.row}: missing ${item.missing.join(', ')}`);
      });
      if (stats.missingInfo.length > 5) {
        console.log(`  ... and ${stats.missingInfo.length - 5} more`);
      }
    }

    // Step 5: Sample some recordings with links
    console.log('\n🔗 Sample Recordings with Drive Links:');
    const withLinks = recordings.filter(r => r.driveLink).slice(0, 5);
    
    for (const recording of withLinks) {
      console.log(`\nRow ${recording.rowNumber}:`);
      console.log(`  Date: ${recording.date}`);
      console.log(`  Coach: ${recording.coach}`);
      console.log(`  Student: ${recording.student}`);
      console.log(`  Week: ${recording.week}`);
      console.log(`  Link: ${recording.driveLink}`);
      
      if (recording.folderId) {
        console.log(`  Folder ID: ${recording.folderId}`);
        
        // Try to get folder info
        try {
          const folderInfo = await drive.files.get({
            fileId: recording.folderId,
            fields: 'id, name, parents'
          });
          console.log(`  ✓ Folder exists: ${folderInfo.data.name}`);
        } catch (error) {
          console.log(`  ✗ Folder not accessible: ${error.message}`);
        }
      }
    }

    // Step 6: Cross-reference with our scan
    console.log('\n🔍 Cross-Reference Analysis:');
    console.log('This sheet can help us:');
    console.log('1. Identify recordings we might have missed in folder scans');
    console.log('2. Verify coach-student relationships');
    console.log('3. Validate date information');
    console.log('4. Find recordings without standard folder structure');

    // Export for further processing
    console.log('\n💾 Exporting data for processing...');
    const exportData = recordings.filter(r => r.folderId).map(r => ({
      folderId: r.folderId,
      coach: r.coach,
      student: r.student,
      date: r.date,
      week: r.week,
      rowNumber: r.rowNumber
    }));

    await require('fs').promises.writeFile(
      'historical-recordings-export.json',
      JSON.stringify(exportData, null, 2)
    );
    console.log(`Exported ${exportData.length} recordings with folder IDs to historical-recordings-export.json`);

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

analyzeHistoricalSheet().catch(console.error);