#!/usr/bin/env node

// Quick Drive Processing - Process a few sessions quickly
const { google } = require('googleapis');
const RecordingMatcher = require('../src/drive-source/services/RecordingMatcher');
const StandaloneDriveProcessor = require('../src/drive-source/services/StandaloneDriveProcessor');
const config = require('../config');

async function quickProcess() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║          Quick Process Google Drive Recordings                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Use production settings
  config.driveSource.useTestFolders = false;
  
  const auth = new google.auth.JWT(
    config.google.clientEmail,
    null,
    config.google.privateKey,
    ['https://www.googleapis.com/auth/drive']
  );

  const drive = google.drive({ version: 'v3', auth });

  try {
    // Target specific recent sessions from Jenny & Huda
    console.log('🎯 Targeting recent Jenny & Huda sessions...\n');
    
    // Known session folders (from our earlier scan)
    const sessionFolders = [
      { id: '13JVC4tdnf5PXIlp8cA-xHgqh9u2qZ3ri', name: 'Coaching_Jenny Duan_Huda_Wk01_2024-12-31' },
      { id: '1U5_G4BYQc_mKf5vkwN01duZCQU7Z-JBy', name: 'Coaching_Jenny Duan_Huda_Wk02_2025-01-02' },
      { id: '1vYhH2cxfgiENppcc1pHzCwQXvOKQMaCz', name: 'Coaching_Jenny Duan_Huda_Wk01_2024-07-25' }
    ];

    const processor = new StandaloneDriveProcessor(config);
    const matcher = new RecordingMatcher();
    
    let totalProcessed = 0;
    
    for (const folder of sessionFolders) {
      console.log(`\n📁 Processing: ${folder.name}`);
      
      // Get files from this folder
      const response = await drive.files.list({
        q: `'${folder.id}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType, size, parents, createdTime, modifiedTime)',
        pageSize: 100
      });

      const files = response.data.files.map(file => ({
        ...file,
        fileType: detectFileType(file.name),
        parentFolderId: folder.id,
        parentFolderName: folder.name,
        confidence: 85
      }));

      console.log(`  Found ${files.length} files`);

      if (files.length === 0) continue;

      // Group into session
      const sessions = await matcher.matchRecordings(files);
      const { validSessions } = matcher.validateSessions(sessions);

      if (validSessions.length === 0) {
        console.log('  No valid sessions found');
        continue;
      }

      // Enhance metadata
      const session = validSessions[0];
      const folderMatch = folder.name.match(/Coaching_([^_]+)_([^_]+)_Wk(\d+)_(\d{4}-\d{2}-\d{2})/);
      
      if (folderMatch) {
        session.metadata = {
          ...session.metadata,
          coach: 'Jenny',
          student: 'Huda',
          participants: ['Jenny', 'Huda'],
          week: { number: parseInt(folderMatch[3]), raw: `Wk${folderMatch[3]}` },
          date: { raw: folderMatch[4], pattern: 'folder' },
          confidence: 90
        };
      }

      // Process the session
      console.log('  🚀 Processing session...');
      const results = await processor.processRecordingSessions([session]);

      if (results.successful.length > 0) {
        console.log(`  ✅ Successfully processed: ${results.successful[0].metadata.standardizedName}`);
        totalProcessed++;
      } else if (results.failed.length > 0) {
        console.log(`  ❌ Failed: ${results.failed[0].error}`);
      } else if (results.skipped.length > 0) {
        console.log(`  ⏭️  Skipped: ${results.skipped[0].reason}`);
      }
    }

    console.log(`\n✅ Total sessions processed: ${totalProcessed}`);
    console.log('\nCheck the Master Index Google Sheet:');
    console.log(`https://docs.google.com/spreadsheets/d/${config.google.sheets.masterIndexSheetId}`);

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

function detectFileType(fileName) {
  const name = fileName.toLowerCase();
  if (name.endsWith('.mp4') || name.endsWith('.mov')) return 'video';
  if (name.endsWith('.m4a') || name.endsWith('.mp3')) return 'audio';
  if (name.endsWith('.txt') || name.endsWith('.vtt')) return 'transcript';
  if (name.includes('chat')) return 'chat';
  return 'unknown';
}

quickProcess().catch(console.error);