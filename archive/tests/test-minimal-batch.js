const S3IvylevelScanner = require('./src/drive-source/services/S3IvylevelScanner');
const RecordingMatcher = require('./src/drive-source/services/RecordingMatcher');
const IntegratedDriveProcessor = require('./src/drive-source/services/IntegratedDriveProcessor');
const config = require('./config');

async function testMinimalBatch() {
  console.log('=== Testing Minimal Batch Processing ===\n');
  
  try {
    // Create services
    const scanner = new S3IvylevelScanner(config);
    const matcher = new RecordingMatcher();
    const processor = new IntegratedDriveProcessor(config);
    
    // Initialize processor
    await processor.initialize();
    console.log('✅ Processor initialized');
    console.log('🔍 dualTabGoogleSheetsService exists:', !!processor.dualTabGoogleSheetsService);
    
    // Get coach folders
    const coachFolders = await scanner.getCoachFolders();
    console.log(`Found ${coachFolders.length} coach folders`);
    
    if (coachFolders.length === 0) {
      console.log('No coach folders found');
      return;
    }
    
    // Scan first coach folder with limited depth
    const firstFolder = coachFolders[0];
    console.log(`\nScanning ${firstFolder.name} (limited depth)...`);
    
    const files = await scanner.scanFolder(firstFolder.id, {
      recursive: true,
      maxDepth: 2, // Very limited depth for quick testing
      minFileSize: 100 * 1024
    });
    
    console.log(`Found ${files.length} files`);
    
    if (files.length === 0) {
      console.log('No files found');
      return;
    }
    
    // Group into sessions
    console.log('\nGrouping files into sessions...');
    const sessions = await matcher.matchRecordings(files);
    const { validSessions, invalidSessions } = matcher.validateSessions(sessions);
    
    console.log(`Valid sessions: ${validSessions.length}`);
    console.log(`Invalid sessions: ${invalidSessions.length}`);
    
    if (validSessions.length === 0) {
      console.log('No valid sessions found');
      return;
    }
    
    // Process only the first 3 sessions
    const sessionsToProcess = validSessions.slice(0, 3);
    console.log(`\n🚀 Processing ${sessionsToProcess.length} sessions...\n`);
    
    const results = {
      successful: [],
      failed: [],
      skipped: []
    };
    
    for (const [index, session] of sessionsToProcess.entries()) {
      console.log(`Processing session ${index + 1}/${sessionsToProcess.length}: ${session.folderName || session.id}`);
      
      try {
        // Check if already processed
        const fingerprint = processor.generateFingerprint(session);
        const isDuplicate = await processor.dualTabGoogleSheetsService?.checkDuplicate?.(fingerprint);
        
        if (isDuplicate) {
          console.log(`  ⊘ Skipped (duplicate)`);
          results.skipped.push({ session, reason: 'Already processed' });
          continue;
        }
        
        // Process the session
        const processedSession = await processor.processSession(session);
        console.log(`  ✅ Success: ${processedSession.rawName}`);
        results.successful.push(processedSession);
        
      } catch (error) {
        console.error(`  ❌ Failed: ${error.message}`);
        results.failed.push({ session, error: error.message });
      }
    }
    
    // Summary
    console.log('\n=== Summary ===');
    console.log(`✓ Successful: ${results.successful.length}`);
    console.log(`✗ Failed: ${results.failed.length}`);
    console.log(`⊘ Skipped: ${results.skipped.length}`);
    
    if (results.successful.length > 0) {
      console.log('\n✅ Check your Google Sheet for new rows!');
      console.log('   Look for rows with "Google Drive Import" in the dataSource column.');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testMinimalBatch(); 