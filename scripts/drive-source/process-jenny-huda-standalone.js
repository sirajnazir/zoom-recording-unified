#!/usr/bin/env node

const S3IvylevelScanner = require('../../src/drive-source/services/S3IvylevelScanner');
const RecordingMatcher = require('../../src/drive-source/services/RecordingMatcher');
const StandaloneDriveProcessor = require('../../src/drive-source/services/StandaloneDriveProcessor');
const standaloneConfig = require('../../src/drive-source/config/standalone-config');

async function processJennyHudaStandalone() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║    STANDALONE: Process Coach Jenny & Huda Sessions             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Check if test environment is ready
  if (!standaloneConfig.isTestEnvironmentReady()) {
    console.log('\n❌ Please run setup-test-environment.js first!');
    return;
  }

  const hudaFolderId = '1wmx_pX6l6EeG7Ue-fp7f3hJN_SlTZdqQ';

  try {
    // Step 1: Scan the Huda folder
    const scanner = new S3IvylevelScanner(standaloneConfig);
    console.log('🔍 Scanning Huda folder for recordings...\n');
    
    const files = await scanner.scanFolder(hudaFolderId, {
      maxDepth: 3,
      minFileSize: 100 * 1024
    });

    console.log(`✅ Found ${files.length} files\n`);

    if (files.length === 0) {
      console.log('No files found.');
      return;
    }

    // Show sample files
    console.log('Sample files:');
    files.slice(0, 5).forEach(file => {
      console.log(`- ${file.name} (${file.fileType})`);
    });

    // Step 2: Group files into sessions
    console.log('\n📊 Grouping files into sessions...');
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
          participants: ['Jenny', folderMatch[2]],
          confidence: 90 // High confidence since we have structured folder names
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

    // Ask for confirmation
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log(`Ready to process ${Math.min(enhancedSessions.length, 5)} sessions (out of ${enhancedSessions.length} total).`);
    console.log('This will:');
    console.log('- Create new folders in the test environment');
    console.log('- Move and rename files');
    console.log('- Update the test Google Sheet');
    
    const answer = await new Promise(resolve => {
      readline.question('\nProceed? (yes/no): ', resolve);
    });
    readline.close();

    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('Cancelled.');
      return;
    }

    // Step 4: Process sessions with standalone processor
    console.log('\n🚀 Processing sessions...\n');
    
    const processor = new StandaloneDriveProcessor(standaloneConfig);
    
    // Process only first 5 sessions as a test
    const testSessions = enhancedSessions.slice(0, 5);
    const results = await processor.processRecordingSessions(testSessions);

    // Show results
    console.log('\n✅ Processing complete!');
    console.log(`Successful: ${results.successful.length}`);
    console.log(`Failed: ${results.failed.length}`);
    console.log(`Skipped: ${results.skipped.length}`);

    if (results.successful.length > 0) {
      console.log('\nSuccessfully processed:');
      results.successful.forEach(session => {
        console.log(`- ${session.metadata.standardizedName}`);
        console.log(`  Location: ${session.reorganizedFiles.folderName}`);
        console.log(`  Files: ${session.reorganizedFiles.files.length}`);
      });
    }

    if (results.failed.length > 0) {
      console.log('\nFailed sessions:');
      results.failed.forEach(({ session, error }) => {
        console.log(`- Session ${session.id}: ${error}`);
      });
    }

    console.log('\n📋 Next steps:');
    console.log('1. Check the test folders in Google Drive');
    console.log('2. Review the test Google Sheet');
    console.log('3. If everything looks good, process more sessions');
    console.log('4. Once validated, the code can be integrated into the main project');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

processJennyHudaStandalone().catch(console.error);