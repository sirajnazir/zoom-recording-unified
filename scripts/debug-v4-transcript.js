#!/usr/bin/env node

// Debug transcript processing in V4
const config = require('../config');
const S3IvylevelScanner = require('../src/drive-source/services/S3IvylevelScanner');
const RecordingMatcher = require('../src/drive-source/services/RecordingMatcher');

async function debugTranscript() {
  console.log('🔍 Debugging Transcript Processing...\n');
  
  // Use Juli's folder
  const scanner = new S3IvylevelScanner(config);
  const matcher = new RecordingMatcher();
  
  console.log('📁 Scanning Juli\'s folder for recordings with transcripts...');
  
  const files = await scanner.scanFolder('1Qd-fcahIti7Xs-wtVgfnHKsE9qp4v_uD', {
    maxDepth: 3,
    minFileSize: 1024 // 1KB minimum
  });
  
  console.log(`\n✅ Found ${files.length} files total`);
  
  // Find transcript files
  const transcriptFiles = files.filter(f => 
    f.name.toLowerCase().includes('.vtt') || 
    f.name.toLowerCase().includes('transcript')
  );
  
  console.log(`\n📄 Found ${transcriptFiles.length} transcript files:`);
  transcriptFiles.forEach(f => {
    console.log(`  - ${f.name} (${f.mimeType}) in folder: ${f.parentFolderName}`);
  });
  
  // Group into sessions
  const sessions = await matcher.matchRecordings(files);
  const { validSessions } = matcher.validateSessions(sessions);
  
  console.log(`\n📊 Found ${validSessions.length} valid sessions`);
  
  // Check which sessions have transcripts
  const sessionsWithTranscripts = validSessions.filter(session => 
    session.files?.some(f => f.fileType === 'transcript')
  );
  
  console.log(`\n✅ ${sessionsWithTranscripts.length} sessions have transcripts:`);
  sessionsWithTranscripts.forEach(session => {
    console.log(`\n📁 ${session.metadata?.folderName || session.id}`);
    const transcriptFile = session.files.find(f => f.fileType === 'transcript');
    if (transcriptFile) {
      console.log(`  📄 Transcript: ${transcriptFile.name}`);
      console.log(`     - ID: ${transcriptFile.id}`);
      console.log(`     - Type: ${transcriptFile.fileType}`);
      console.log(`     - MIME: ${transcriptFile.mimeType}`);
    }
  });
  
  // Test downloading a transcript
  if (sessionsWithTranscripts.length > 0) {
    console.log('\n🔄 Testing transcript download...');
    const testSession = sessionsWithTranscripts[0];
    const transcriptFile = testSession.files.find(f => f.fileType === 'transcript');
    
    if (transcriptFile) {
      try {
        const { google } = require('googleapis');
        const drive = google.drive({ 
          version: 'v3', 
          auth: new google.auth.JWT(
            config.google.clientEmail,
            null,
            config.google.privateKey,
            ['https://www.googleapis.com/auth/drive']
          )
        });
        
        const response = await drive.files.get({
          fileId: transcriptFile.id,
          alt: 'media'
        });
        
        console.log('✅ Transcript download successful!');
        console.log(`   Content length: ${response.data.length} characters`);
        console.log(`   First 200 chars: ${response.data.substring(0, 200)}...`);
      } catch (error) {
        console.error('❌ Failed to download transcript:', error.message);
      }
    }
  }
}

debugTranscript().catch(console.error);