#!/usr/bin/env node

const S3IvylevelScanner = require('../../src/drive-source/services/S3IvylevelScanner');
const RecordingMatcher = require('../../src/drive-source/services/RecordingMatcher');
const StandaloneDriveProcessor = require('../../src/drive-source/services/StandaloneDriveProcessor');
const config = require('../../config');

async function processJennyHuda() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║        Process Coach Jenny & Huda Sessions                     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Direct folder IDs
  const jennyFolderId = '1hlwz3XSGz53Q1OPmVHAzLf4-46CAmh40';
  const hudaFolderId = '1wmx_pX6l6EeG7Ue-fp7f3hJN_SlTZdqQ';

  console.log('📁 Coach Jenny folder:', jennyFolderId);
  console.log('📁 Huda subfolder:', hudaFolderId);
  console.log('');

  try {
    // Step 1: Scan the Huda folder
    const scanner = new S3IvylevelScanner(config);
    console.log('🔍 Scanning Huda folder for recordings...\n');
    
    const files = await scanner.scanFolder(hudaFolderId, {
      maxDepth: 3,  // Session folders are at depth 3
      minFileSize: 100 * 1024 // 100KB to catch transcripts
    });

    console.log(`\n✅ Found ${files.length} files`);

    if (files.length === 0) {
      console.log('No files found in this folder.');
      return;
    }

    // Show sample files
    console.log('\nSample files found:');
    files.slice(0, 10).forEach(file => {
      console.log(`- ${file.name} (${file.fileType}, folder: ${file.parentFolderName})`);
    });

    // Step 2: Group files into sessions
    console.log('\n📊 Grouping files into sessions...');
    const groups = await scanner.discoverRecordingGroups(files);
    console.log(`Grouped into ${groups.length} recording sessions`);

    // Show first 3 groups
    console.log('\nSample sessions:');
    groups.slice(0, 3).forEach((group, i) => {
      console.log(`\n${i + 1}. Session (${group.files.length} files, confidence: ${group.metadata.confidence}%)`);
      console.log(`   Folder: ${group.files[0].parentFolderName}`);
      console.log(`   Date: ${group.metadata.date?.raw || 'Unknown'}`);
      console.log(`   Files:`);
      group.files.forEach(f => {
        console.log(`   - ${f.name} (${f.fileType})`);
      });
    });

    // Step 3: Use RecordingMatcher for advanced matching
    const matcher = new RecordingMatcher();
    const sessions = await matcher.matchRecordings(files);
    const { validSessions } = matcher.validateSessions(sessions);

    console.log(`\n✅ Valid sessions: ${validSessions.length}`);

    // Ask for confirmation
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise(resolve => {
      readline.question(`\nProcess ${Math.min(validSessions.length, 3)} sessions as a test? (yes/no): `, resolve);
    });
    readline.close();

    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('Cancelled.');
      return;
    }

    // Step 4: Process first 3 sessions as a test
    console.log('\n🚀 Processing sessions...');
    
    // Create an enhanced processor that handles the metadata better
    const processor = new StandaloneDriveProcessor(config);
    
    // Process only first 3 sessions
    const testSessions = validSessions.slice(0, 3);
    
    // Enhance sessions with proper metadata extraction
    const enhancedSessions = testSessions.map(session => {
      // Extract metadata from parent folder name
      const folderName = session.files[0]?.parentFolderName || '';
      const folderMatch = folderName.match(/Coaching_([^_]+)_([^_]+)_Wk(\d+)_(\d{4}-\d{2}-\d{2})/);
      
      if (folderMatch) {
        session.metadata = {
          ...session.metadata,
          coach: folderMatch[1].replace('Jenny Duan', 'Jenny'),
          student: folderMatch[2],
          week: { number: parseInt(folderMatch[3]), raw: `Wk${folderMatch[3]}` },
          date: { raw: folderMatch[4], pattern: 'folder' }
        };
      }
      
      // Also extract date from GMT filenames
      const gmtFile = session.files.find(f => f.name.includes('GMT'));
      if (gmtFile && !session.metadata.date) {
        const gmtMatch = gmtFile.name.match(/GMT(\d{8})/);
        if (gmtMatch) {
          const dateStr = gmtMatch[1];
          session.metadata.date = {
            raw: `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}`,
            pattern: 'gmt_filename'
          };
        }
      }
      
      console.log(`\nEnhanced session metadata:`, {
        coach: session.metadata.coach,
        student: session.metadata.student,
        week: session.metadata.week?.number,
        date: session.metadata.date?.raw
      });
      
      return session;
    });
    
    const results = await processor.processRecordingSessions(enhancedSessions);

    console.log('\n✅ Processing complete!');
    console.log(`Successful: ${results.successful.length}`);
    console.log(`Failed: ${results.failed.length}`);
    console.log(`Skipped: ${results.skipped.length}`);

    // Show processed sessions
    if (results.successful.length > 0) {
      console.log('\nProcessed sessions:');
      results.successful.forEach(session => {
        console.log(`- ${session.metadata.standardizedName}`);
        console.log(`  Target folder: ${session.targetFolder}`);
        console.log(`  Reorganized to: ${session.reorganizedFiles.folderName}`);
      });
    }

    if (results.failed.length > 0) {
      console.log('\nFailed sessions:');
      results.failed.forEach(({ session, error }) => {
        console.log(`- Session ${session.id}: ${error}`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
    console.error(error.stack);
  }
}

processJennyHuda().catch(console.error);