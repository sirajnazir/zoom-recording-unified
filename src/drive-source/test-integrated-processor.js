const IntegratedDriveProcessor = require('./services/IntegratedDriveProcessor');
const S3IvylevelScanner = require('./services/S3IvylevelScanner');
const config = require('../config');

async function testIntegratedProcessing() {
  console.log('=== Testing Integrated Drive Source Processing ===\n');

  // Initialize scanner with test configuration
  const scanner = new S3IvylevelScanner(config);
  
  // Initialize processor with integrated services
  const processor = new IntegratedDriveProcessor(config);

  try {
    // Step 1: Scan Jenny's folder (test data)
    console.log('Step 1: Scanning Jenny\'s test folder...');
    const jennyFolderId = config.driveSource.testFolders?.coachFolders?.Jenny || '1OXTb-U4n6LJtcj-Gj4XtHZoGHD5IXdj_';
    
    const sessions = await scanner.scanFolder(jennyFolderId, {
      recursive: true,
      maxDepth: 3,
      includePatterns: ['coaching', 'session', 'huda']
    });

    console.log(`Found ${sessions.length} sessions\n`);

    if (sessions.length === 0) {
      console.log('No sessions found. Check folder permissions and structure.');
      return;
    }

    // Step 2: Process the sessions
    console.log('Step 2: Processing sessions with integrated processor...');
    const results = await processor.processRecordingSessions(sessions);

    // Step 3: Summary
    console.log('\n=== Processing Complete ===');
    console.log(`✓ Processed: ${results.successful.length}`);
    console.log(`✗ Failed: ${results.failed.length}`);
    console.log(`⊘ Skipped: ${results.skipped.length}`);

    // Show standardized names
    if (results.successful.length > 0) {
      console.log('\nStandardized Names:');
      results.successful.forEach(session => {
        console.log(`- ${session.nameAnalysis?.standardizedName || 'No standardized name'}`);
      });
    }

  } catch (error) {
    console.error('Test failed:', error);
    console.error(error.stack);
  }
}

// Run the test
testIntegratedProcessing();