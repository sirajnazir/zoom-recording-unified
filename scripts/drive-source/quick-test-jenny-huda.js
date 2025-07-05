#!/usr/bin/env node

const { google } = require('googleapis');
const StandaloneDriveProcessor = require('../../src/drive-source/services/StandaloneDriveProcessor');
const standaloneConfig = require('../../src/drive-source/config/standalone-config');

async function quickTest() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         QUICK TEST: Process 1 Jenny & Huda Session             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const auth = new google.auth.JWT(
    standaloneConfig.google.clientEmail,
    null,
    standaloneConfig.google.privateKey,
    ['https://www.googleapis.com/auth/drive']
  );

  const drive = google.drive({ version: 'v3', auth });

  try {
    // Directly access one known session folder
    const sessionFolderId = '13JVC4tdnf5PXIlp8cA-xHgqh9u2qZ3ri'; // Wk01_2024-12-31
    
    console.log('📁 Fetching files from session folder...\n');
    
    const response = await drive.files.list({
      q: `'${sessionFolderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, size, parents)',
      pageSize: 100
    });

    const files = response.data.files.map(file => ({
      ...file,
      fileType: detectFileType(file.name),
      parentFolderId: sessionFolderId,
      parentFolderName: 'Coaching_Jenny Duan_Huda_Wk01_2024-12-31_13JVC4tdnf5PXIlp8cA-xHgqh9u2qZ3ri'
    }));

    console.log(`Found ${files.length} files:`);
    files.forEach(f => console.log(`- ${f.name} (${f.fileType})`));

    // Create session object
    const session = {
      id: 'jenny-huda-wk01-test',
      files: files,
      metadata: {
        coach: 'Jenny',
        student: 'Huda',
        participants: ['Jenny', 'Huda'],
        week: { number: 1, raw: 'Wk1' },
        date: { raw: '2024-12-31', pattern: 'folder' },
        confidence: 95
      }
    };

    console.log('\n🚀 Processing session...\n');
    
    const processor = new StandaloneDriveProcessor(standaloneConfig);
    const results = await processor.processRecordingSessions([session]);

    if (results.successful.length > 0) {
      console.log('\n✅ Success!');
      const processed = results.successful[0];
      console.log(`- Standardized name: ${processed.metadata.standardizedName}`);
      console.log(`- Files moved to: ${processed.reorganizedFiles.folderName}`);
      console.log(`- Google Sheet updated`);
      
      console.log('\n📋 Check results:');
      console.log(`1. Google Drive folder: https://drive.google.com/drive/folders/${processed.reorganizedFiles.folderId}`);
      console.log(`2. Google Sheet: https://docs.google.com/spreadsheets/d/${standaloneConfig.google.sheets.masterIndexSheetId}`);
    } else if (results.failed.length > 0) {
      console.log('\n❌ Failed:', results.failed[0].error);
    }

  } catch (error) {
    console.error('Error:', error.message);
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

quickTest().catch(console.error);