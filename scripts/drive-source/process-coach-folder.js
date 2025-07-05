#!/usr/bin/env node

const S3IvylevelScanner = require('../../src/drive-source/services/S3IvylevelScanner');
const RecordingMatcher = require('../../src/drive-source/services/RecordingMatcher');
const DriveRecordingProcessor = require('../../src/drive-source/services/DriveRecordingProcessor');
const config = require('../../config');

async function processCoachFolder() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║          Process Single Coach Folder                           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Target a specific coach folder for faster processing
  const coachFolders = {
    'Coach Alan': '1ZPlXd04BoKwVNjfXP5oTZTzhIVNO7hnV',
    'Coach Juli': '1Qd-fcahIti7Xs-wtVgfnHKsE9qp4v_uD',
    'Coach Andrew': '18RQk0cgJGQJHoovcsStfXoUJmFrJajzH',
    'Coach Jenny': '1CmzDc1wJ_fh79aBavpCEOdT--rg3L1Ck'
  };

  const selectedCoach = process.argv[2] || 'Coach Alan';
  const folderId = coachFolders[selectedCoach];

  if (!folderId) {
    console.error(`Unknown coach: ${selectedCoach}`);
    console.log('Available coaches:', Object.keys(coachFolders).join(', '));
    return;
  }

  console.log(`📁 Processing: ${selectedCoach}`);
  console.log(`📍 Folder ID: ${folderId}\n`);

  try {
    // Step 1: Scan the coach folder
    const scanner = new S3IvylevelScanner(config);
    const files = await scanner.scanFolder(folderId, {
      maxDepth: 5,  // Increased to reach the actual files
      minFileSize: 100 * 1024 // 100KB to catch transcript files too
    });

    console.log(`\n✅ Found ${files.length} files`);

    if (files.length === 0) {
      console.log('No files found in this folder.');
      return;
    }

    // Step 2: Group files into sessions
    const groups = await scanner.discoverRecordingGroups(files);
    console.log(`\n📊 Grouped into ${groups.length} recording sessions`);

    // Show first 5 groups
    console.log('\nSample groups:');
    groups.slice(0, 5).forEach((group, i) => {
      console.log(`\n${i + 1}. Session (${group.files.length} files, confidence: ${group.metadata.confidence}%)`);
      console.log(`   Date: ${group.metadata.date?.raw || 'Unknown'}`);
      console.log(`   Participants: ${group.metadata.participants?.join(', ') || 'Unknown'}`);
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
      readline.question(`\nProcess ${validSessions.length} sessions? (yes/no): `, resolve);
    });
    readline.close();

    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('Cancelled.');
      return;
    }

    // Step 4: Process sessions
    console.log('\n🚀 Processing sessions...');
    const processor = new DriveRecordingProcessor(config);
    
    // Process only first 5 sessions as a test
    const testSessions = validSessions.slice(0, 5);
    const results = await processor.processRecordingSessions(testSessions);

    console.log('\n✅ Processing complete!');
    console.log(`Successful: ${results.successful.length}`);
    console.log(`Failed: ${results.failed.length}`);
    console.log(`Skipped: ${results.skipped.length}`);

    // Show processed sessions
    if (results.successful.length > 0) {
      console.log('\nProcessed sessions:');
      results.successful.forEach(session => {
        console.log(`- ${session.metadata.standardizedName}`);
        console.log(`  Folder: ${session.reorganizedFiles.folderName}`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

processCoachFolder().catch(console.error);