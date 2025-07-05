#!/usr/bin/env node

const DriveScanner = require('../../src/drive-source/services/DriveScanner');
const RecordingMatcher = require('../../src/drive-source/services/RecordingMatcher');
const config = require('../../config');

async function testScanner() {
  console.log('=== Drive Scanner Test ===\n');
  
  const testFolderId = process.argv[2];
  if (!testFolderId) {
    console.error('Usage: node test-drive-scanner.js <FOLDER_ID>');
    process.exit(1);
  }

  try {
    const scanner = new DriveScanner(config);
    
    // Test basic scanning
    console.log('1. Testing basic folder scan...');
    const files = await scanner.scanFolder(testFolderId, {
      maxDepth: 2,
      minFileSize: 0 // Include all files for testing
    });
    
    console.log(`Found ${files.length} files\n`);
    
    if (files.length > 0) {
      console.log('Sample files:');
      files.slice(0, 5).forEach(file => {
        console.log(`- ${file.name}`);
        console.log(`  Type: ${file.fileType}`);
        console.log(`  Confidence: ${file.confidence}%`);
        console.log(`  Date: ${file.possibleDate ? file.possibleDate.raw : 'Unknown'}`);
        console.log(`  Participants: ${file.possibleParticipants ? file.possibleParticipants.join(', ') : 'Unknown'}`);
        console.log('');
      });
    }

    // Test pattern matching
    console.log('\n2. Testing pattern matching...');
    const testFileNames = [
      'Zoom Recording 2024-01-15 John Smith and Jane Doe.mp4',
      '2024-01-15_coaching_session_week3.m4a',
      'Meeting-JohnDoe-JaneSmith-Jan15.mp4',
      'transcript_01152024.vtt',
      'chat.txt',
      'Week 5 - Coaching Call with Sarah.mp4',
      'random-file.pdf'
    ];

    console.log('File name analysis:');
    testFileNames.forEach(name => {
      const mockFile = { name, size: '1000000' };
      const isPotential = scanner.isPotentialRecording(mockFile);
      const date = scanner.extractDateFromName(name);
      const participants = scanner.extractParticipantsFromName(name);
      const week = scanner.extractWeekFromName(name);
      const confidence = scanner.calculateConfidence(name);

      console.log(`\n"${name}"`);
      console.log(`  Is recording: ${isPotential ? 'Yes' : 'No'}`);
      console.log(`  Date: ${date ? date.raw : 'Not found'}`);
      console.log(`  Participants: ${participants ? participants.join(', ') : 'Not found'}`);
      console.log(`  Week: ${week ? week.raw : 'Not found'}`);
      console.log(`  Confidence: ${confidence}%`);
    });

    // Test grouping
    if (files.length > 0) {
      console.log('\n3. Testing file grouping...');
      const groups = await scanner.discoverRecordingGroups(files);
      console.log(`Created ${groups.length} groups from ${files.length} files`);
      
      if (groups.length > 0) {
        console.log('\nFirst 3 groups:');
        groups.slice(0, 3).forEach((group, index) => {
          console.log(`\nGroup ${index + 1}:`);
          console.log(`  Files: ${group.files.length}`);
          console.log(`  Confidence: ${group.metadata.confidence}%`);
          group.files.forEach(f => console.log(`    - ${f.name}`));
        });
      }
    }

    // Test matching
    if (files.length > 0) {
      console.log('\n4. Testing advanced matching...');
      const matcher = new RecordingMatcher();
      const sessions = await matcher.matchRecordings(files);
      console.log(`Matched into ${sessions.length} sessions`);
      
      const { validSessions, invalidSessions } = matcher.validateSessions(sessions);
      console.log(`Valid sessions: ${validSessions.length}`);
      console.log(`Invalid sessions: ${invalidSessions.length}`);
    }

  } catch (error) {
    console.error('\nTest failed:', error);
    process.exit(1);
  }
}

testScanner().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});