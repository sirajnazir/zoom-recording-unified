#!/usr/bin/env node

// Simple test to process test recordings
const config = require('./config');
const S3IvylevelScanner = require('./src/drive-source/services/S3IvylevelScanner');
const RecordingMatcher = require('./src/drive-source/services/RecordingMatcher');
const IntegratedDriveProcessorV3 = require('./src/drive-source/services/IntegratedDriveProcessorV3');

async function testSimple() {
  console.log('🧪 Simple Drive Processing Test\n');

  // Enable drive source
  config.features.enableDriveSource = true;
  config.driveSource.enabled = true;

  // Create services
  const scanner = new S3IvylevelScanner(config);
  const matcher = new RecordingMatcher();
  const processor = new IntegratedDriveProcessorV3(config);

  try {
    // Use test folder
    const testFolderId = '1tCd_WJCpF7r4rapOoO7RKXPudYH_i-2-'; // Drive-Source-Test-Recordings
    
    console.log('Configuration:');
    console.log(`- Target folder: Drive-Source-Test-Recordings`);
    console.log(`- Folder ID: ${testFolderId}`);
    console.log(`- Max depth: 3`);
    console.log('');
    
    // Step 1: Scan
    console.log('🔍 Scanning folder...');
    const files = await scanner.scanFolder(testFolderId, {
      maxDepth: 3,
      minFileSize: 100 * 1024
    });
    
    console.log(`✅ Found ${files.length} files\n`);
    
    if (files.length === 0) {
      console.log('No files found!');
      return;
    }

    // Step 2: Match into sessions
    console.log('📊 Grouping files into sessions...');
    const sessions = await matcher.matchRecordings(files);
    const { validSessions } = matcher.validateSessions(sessions);
    
    console.log(`✅ Identified ${validSessions.length} valid sessions\n`);
    
    if (validSessions.length === 0) {
      console.log('No valid sessions found!');
      return;
    }

    // Step 3: Process sessions
    console.log('🚀 Processing sessions...');
    const results = await processor.processRecordingSessions(validSessions.slice(0, 3));
    
    console.log('\n✅ Processing complete!');
    console.log(`   Successful: ${results.successful.length}`);
    console.log(`   Failed: ${results.failed.length}`);
    console.log(`   Skipped: ${results.skipped.length}`);
    
    if (results.successful.length > 0) {
      console.log('\nProcessed sessions:');
      results.successful.forEach(session => {
        console.log(`  ✓ ${session.standardizedName}`);
        console.log(`    - Week: ${session.weekNumber}`);
        console.log(`    - Category: ${session.category}`);
      });
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
}

// Run test
testSimple().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});