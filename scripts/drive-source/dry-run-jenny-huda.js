#!/usr/bin/env node

const S3IvylevelScanner = require('../../src/drive-source/services/S3IvylevelScanner');
const RecordingMatcher = require('../../src/drive-source/services/RecordingMatcher');
const standaloneConfig = require('../../src/drive-source/config/standalone-config');

async function dryRunJennyHuda() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║      DRY RUN: Process Coach Jenny & Huda Sessions              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('🔍 This is a DRY RUN - no files will be moved\n');

  const hudaFolderId = '1wmx_pX6l6EeG7Ue-fp7f3hJN_SlTZdqQ';

  try {
    // Step 1: Scan the Huda folder
    const scanner = new S3IvylevelScanner(standaloneConfig);
    console.log('📁 Scanning Huda folder for recordings...\n');
    
    const files = await scanner.scanFolder(hudaFolderId, {
      maxDepth: 3,
      minFileSize: 100 * 1024
    });

    console.log(`✅ Found ${files.length} files\n`);

    if (files.length === 0) {
      console.log('No files found.');
      return;
    }

    // Step 2: Group files into sessions
    console.log('📊 Grouping files into sessions...');
    const matcher = new RecordingMatcher();
    const sessions = await matcher.matchRecordings(files);
    const { validSessions } = matcher.validateSessions(sessions);

    console.log(`✅ Found ${validSessions.length} valid sessions\n`);

    // Step 3: Enhance sessions with metadata
    const enhancedSessions = validSessions.map(session => {
      const folderName = session.files[0]?.parentFolderName || '';
      const folderMatch = folderName.match(/Coaching_([^_]+)_([^_]+)_Wk(\d+)_(\d{4}-\d{2}-\d{2})/);
      
      if (folderMatch) {
        session.metadata = {
          ...session.metadata,
          coach: folderMatch[1].replace('Jenny Duan', 'Jenny'),
          student: folderMatch[2],
          week: { number: parseInt(folderMatch[3]), raw: `Wk${folderMatch[3]}` },
          date: { raw: folderMatch[4], pattern: 'folder' },
          participants: ['Jenny', folderMatch[2]]
        };
      }
      
      // Extract date from GMT filenames as fallback
      if (!session.metadata.date) {
        const gmtFile = session.files.find(f => f.name.includes('GMT'));
        if (gmtFile) {
          const gmtMatch = gmtFile.name.match(/GMT(\d{8})/);
          if (gmtMatch) {
            const dateStr = gmtMatch[1];
            session.metadata.date = {
              raw: `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}`,
              pattern: 'gmt_filename'
            };
          }
        }
      }
      
      return session;
    });

    // Step 4: Simulate processing
    console.log('🎯 Simulation Results:\n');
    console.log('The following changes would be made:\n');

    enhancedSessions.slice(0, 5).forEach((session, index) => {
      console.log(`Session ${index + 1}:`);
      console.log(`- Current location: ${session.files[0].parentFolderName}`);
      
      // Generate standardized name
      const date = session.metadata.date?.raw || 'UNKNOWN-DATE';
      const participants = session.metadata.participants || [];
      const week = session.metadata.week?.number || '';
      const fingerprint = require('crypto').createHash('sha256')
        .update(`${date}|${participants.join('|')}|${session.files[0].size || '0'}`)
        .digest('hex').substring(0, 8);
      
      const standardizedName = [
        date,
        participants.sort().join('-'),
        week ? `Week${week}` : '',
        `UUID-${fingerprint}`
      ].filter(Boolean).join('_');
      
      console.log(`- New standardized name: ${standardizedName}`);
      console.log(`- Target folder: Test-Coaches/${standardizedName}/`);
      console.log(`- Files to move:`);
      
      session.files.forEach(file => {
        const ext = require('path').extname(file.name);
        const newName = `${standardizedName}_${file.fileType}${ext}`;
        console.log(`  • ${file.name} → ${newName}`);
      });
      
      console.log('');
    });

    // Summary statistics
    console.log('📈 Summary Statistics:');
    console.log(`- Total sessions to process: ${enhancedSessions.length}`);
    console.log(`- Total files to move: ${files.length}`);
    
    const weekStats = {};
    enhancedSessions.forEach(session => {
      const week = session.metadata.week?.number || 'Unknown';
      weekStats[week] = (weekStats[week] || 0) + 1;
    });
    
    console.log('\nSessions by week:');
    Object.entries(weekStats)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .forEach(([week, count]) => {
        console.log(`  Week ${week}: ${count} sessions`);
      });

    // Check for potential issues
    console.log('\n⚠️  Potential Issues:');
    let issueCount = 0;
    
    enhancedSessions.forEach((session, i) => {
      if (!session.metadata.date) {
        console.log(`- Session ${i + 1}: Missing date information`);
        issueCount++;
      }
      if (!session.metadata.participants || session.metadata.participants.length === 0) {
        console.log(`- Session ${i + 1}: Missing participant information`);
        issueCount++;
      }
      if (session.files.length === 1) {
        console.log(`- Session ${i + 1}: Only has ${session.files.length} file (might be incomplete)`);
        issueCount++;
      }
    });
    
    if (issueCount === 0) {
      console.log('- None found! All sessions look good.');
    }

    console.log('\n✅ Dry run complete!');
    console.log('\nTo process these files for real:');
    console.log('1. Run setup-test-environment.js to create test folders');
    console.log('2. Update your .env with the test folder IDs');
    console.log('3. Run process-jenny-huda-standalone.js');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

dryRunJennyHuda().catch(console.error);