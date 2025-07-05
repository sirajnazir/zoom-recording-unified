#!/usr/bin/env node

const RecordingMatcher = require('../../src/drive-source/services/RecordingMatcher');
const StandaloneDriveProcessor = require('../../src/drive-source/services/StandaloneDriveProcessor');
const config = require('../../config');

async function testSingleSession() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║              Test Single Session Processing                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Create a test session with the data structure we expect
  const testSession = {
    id: 'test-session-001',
    files: [
      {
        id: 'test-file-001',
        name: 'GMT20250101-190055_Recording_640x360.mp4',
        fileType: 'video',
        mimeType: 'video/mp4',
        size: '10485760',  // 10MB
        parents: ['13JVC4tdnf5PXIlp8cA-xHgqh9u2qZ3ri'],
        parentFolderId: '13JVC4tdnf5PXIlp8cA-xHgqh9u2qZ3ri',
        parentFolderName: 'Coaching_Jenny Duan_Huda_Wk01_2024-12-31_13JVC4tdnf5PXIlp8cA-xHgqh9u2qZ3ri'
      },
      {
        id: 'test-file-002',
        name: 'GMT20250101-190055_Recording.m4a',
        fileType: 'audio',
        mimeType: 'audio/m4a',
        size: '2097152',  // 2MB
        parents: ['13JVC4tdnf5PXIlp8cA-xHgqh9u2qZ3ri'],
        parentFolderId: '13JVC4tdnf5PXIlp8cA-xHgqh9u2qZ3ri',
        parentFolderName: 'Coaching_Jenny Duan_Huda_Wk01_2024-12-31_13JVC4tdnf5PXIlp8cA-xHgqh9u2qZ3ri'
      }
    ],
    metadata: {
      confidence: 85,
      coach: 'Jenny',
      student: 'Huda',
      participants: ['Jenny', 'Huda'],
      week: { number: 1, raw: 'Wk1' },
      date: { raw: '2024-12-31', pattern: 'folder' }
    }
  };

  console.log('Test session details:');
  console.log(`- ID: ${testSession.id}`);
  console.log(`- Files: ${testSession.files.length}`);
  console.log(`- Participants: ${testSession.metadata.participants.join(', ')}`);
  console.log(`- Date: ${testSession.metadata.date.raw}`);
  console.log(`- Week: ${testSession.metadata.week.number}`);
  console.log(`- Confidence: ${testSession.metadata.confidence}%`);

  try {
    console.log('\n🚀 Processing test session...\n');
    const processor = new StandaloneDriveProcessor(config);
    
    // Process just this one session
    const results = await processor.processRecordingSessions([testSession]);

    console.log('\n✅ Processing complete!');
    console.log(`Successful: ${results.successful.length}`);
    console.log(`Failed: ${results.failed.length}`);
    console.log(`Skipped: ${results.skipped.length}`);

    if (results.successful.length > 0) {
      console.log('\nProcessed session details:');
      const processed = results.successful[0];
      console.log(`- Fingerprint: ${processed.metadata.fingerprint}`);
      console.log(`- Standardized name: ${processed.metadata.standardizedName}`);
      console.log(`- Target folder: ${processed.targetFolder}`);
    }

    if (results.failed.length > 0) {
      console.log('\nFailed with error:');
      console.log(`- ${results.failed[0].error}`);
    }

  } catch (error) {
    console.error('\nError:', error.message);
    console.error('Stack:', error.stack);
  }
}

testSingleSession().catch(console.error);