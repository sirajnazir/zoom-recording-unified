#!/usr/bin/env node

// Debug file matching issue
const RecordingMatcher = require('../src/drive-source/services/RecordingMatcher');

async function debugMatching() {
  console.log('🔍 Debugging File Matching\n');
  
  const matcher = new RecordingMatcher();
  
  // Simulate the files from the folder with proper metadata
  const parentFolderName = 'GamePlan_JennyDuan_Ananyaa_Wk00_2024-09-06_1OSyk9C57nvhAj5780I4GXOc0frdEpRDO';
  const parentFolderId = '1OSyk9C57nvhAj5780I4GXOc0frdEpRDO';
  
  const files = [
    {
      id: 'file1',
      name: 'GMT20240907-220056_Recording_gallery_1280x720.mp4',
      fileType: 'video',
      parentFolderId: parentFolderId,
      parentFolderName: parentFolderName,
      possibleDate: { raw: '2024-09-06' },
      possibleParticipants: ['JennyDuan', 'Ananyaa'],
      possibleWeek: { raw: 'Wk00', number: 0 }
    },
    {
      id: 'file2',
      name: 'GMT20240907-220056_Recording_640x360.mp4',
      fileType: 'video',
      parentFolderId: parentFolderId,
      parentFolderName: parentFolderName,
      possibleDate: { raw: '2024-09-06' },
      possibleParticipants: ['JennyDuan', 'Ananyaa'],
      possibleWeek: { raw: 'Wk00', number: 0 }
    },
    {
      id: 'file3',
      name: 'GMT20240907-220056_Recording.m4a',
      fileType: 'audio',
      parentFolderId: parentFolderId,
      parentFolderName: parentFolderName,
      possibleDate: { raw: '2024-09-06' },
      possibleParticipants: ['JennyDuan', 'Ananyaa'],
      possibleWeek: { raw: 'Wk00', number: 0 }
    },
    {
      id: 'file4',
      name: 'GMT20240907-220056_Recording.transcript.vtt',
      fileType: 'transcript',
      parentFolderId: parentFolderId,
      parentFolderName: parentFolderName,
      possibleDate: { raw: '2024-09-06' },
      possibleParticipants: ['JennyDuan', 'Ananyaa'],
      possibleWeek: { raw: 'Wk00', number: 0 }
    }
  ];
  
  console.log('📁 Input files:');
  files.forEach(f => {
    const baseName = matcher.getBaseName(f.name);
    console.log(`  - ${f.name} (${f.fileType}) -> Base: "${baseName}"`);
  });
  
  // Test file similarity
  console.log('\n🔍 Testing file similarities:');
  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const result = matcher.calculateFileSimilarity(files[i], files[j]);
      const score = result.score || 0;
      console.log(`  ${files[i].name} <-> ${files[j].name}: ${score.toFixed(2)} (Rules: ${result.appliedRules?.join(', ') || 'none'})`);
    }
  }
  
  // Test matching
  console.log('\n📊 Running matcher...');
  const sessions = await matcher.matchRecordings(files);
  
  console.log(`\n✅ Created ${sessions.length} sessions:`);
  sessions.forEach((session, idx) => {
    console.log(`\nSession ${idx + 1} (ID: ${session.id}):`);
    console.log(`  Files: ${session.files.length}`);
    session.files.forEach(f => {
      console.log(`    - ${f.name} (${f.fileType})`);
    });
  });
  
  // Validate sessions
  const { validSessions, invalidSessions } = matcher.validateSessions(sessions);
  console.log(`\n📋 Validation Results:`);
  console.log(`  Valid: ${validSessions.length}`);
  console.log(`  Invalid: ${invalidSessions.length}`);
  
  if (invalidSessions.length > 0) {
    console.log('\nInvalid sessions:');
    invalidSessions.forEach(s => {
      console.log(`  - ${s.id}: ${s.reason}`);
    });
  }
}

debugMatching().catch(console.error);