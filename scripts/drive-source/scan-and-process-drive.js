#!/usr/bin/env node

const path = require('path');
const DriveScanner = require('../../src/drive-source/services/DriveScanner');
const RecordingMatcher = require('../../src/drive-source/services/RecordingMatcher');
const DriveRecordingProcessor = require('../../src/drive-source/services/DriveRecordingProcessor');

// Load configuration
const config = require('../../config');

async function main() {
  console.log('=== Google Drive Recording Scanner & Processor ===\n');
  console.log('This tool will scan Google Drive for fragmented recordings,');
  console.log('intelligently group them, and reorganize them using the same');
  console.log('standardization as the Zoom batch and webhook processors.\n');

  // Get folder ID from command line or use default
  const targetFolderId = process.argv[2] || config.google.drive.recordingsRootFolderId;
  
  if (!targetFolderId) {
    console.error('Error: No folder ID provided. Usage: node scan-and-process-drive.js [FOLDER_ID]');
    process.exit(1);
  }

  console.log(`Target folder ID: ${targetFolderId}`);
  console.log('Starting scan...\n');

  try {
    // Step 1: Scan Google Drive
    const scanner = new DriveScanner(config);
    const scanOptions = {
      maxDepth: 5,
      excludeFolders: ['Processed', 'Archive', 'Trash'],
      includePatterns: [
        /zoom/i,
        /recording/i,
        /coaching/i,
        /session/i,
        /call/i,
        /meeting/i
      ],
      minFileSize: 1024 * 1024 // 1MB minimum
    };

    const files = await scanner.scanFolder(targetFolderId, scanOptions);
    console.log(`\nFound ${files.length} potential recording files`);

    if (files.length === 0) {
      console.log('No recording files found. Exiting.');
      return;
    }

    // Step 2: Group files into recording sessions
    console.log('\n--- File Grouping Phase ---');
    
    // First try the scanner's built-in grouping
    const scannerGroups = await scanner.discoverRecordingGroups(files);
    scanner.generateReport(scannerGroups);

    // Then use the advanced matcher for more sophisticated matching
    console.log('\n--- Advanced Matching Phase ---');
    const matcher = new RecordingMatcher();
    const sessions = await matcher.matchRecordings(files);
    
    // Validate sessions
    const { validSessions, invalidSessions } = matcher.validateSessions(sessions);
    matcher.generateMatchingReport(validSessions);

    // Step 3: Process the valid sessions
    if (validSessions.length === 0) {
      console.log('\nNo valid sessions to process. Exiting.');
      return;
    }

    console.log(`\n--- Processing Phase ---`);
    console.log(`Ready to process ${validSessions.length} valid sessions.`);
    
    // Ask for confirmation
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise(resolve => {
      readline.question('\nDo you want to proceed with processing? (yes/no): ', resolve);
    });
    readline.close();

    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('Processing cancelled.');
      return;
    }

    // Process the sessions
    const processor = new DriveRecordingProcessor(config);
    const results = await processor.processRecordingSessions(validSessions);

    console.log('\n=== Final Summary ===');
    console.log(`Successfully processed: ${results.successful.length} sessions`);
    console.log(`Failed: ${results.failed.length} sessions`);
    console.log(`Skipped (duplicates): ${results.skipped.length} sessions`);

    // Save results to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsFile = path.join(__dirname, `drive-scan-results-${timestamp}.json`);
    
    await require('fs').promises.writeFile(
      resultsFile,
      JSON.stringify({
        scanDate: new Date().toISOString(),
        targetFolder: targetFolderId,
        filesScanned: files.length,
        sessionsFound: sessions.length,
        validSessions: validSessions.length,
        results: results
      }, null, 2)
    );

    console.log(`\nResults saved to: ${resultsFile}`);

  } catch (error) {
    console.error('\nError during processing:', error);
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});