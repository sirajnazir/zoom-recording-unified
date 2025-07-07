const S3IvylevelScanner = require('./src/drive-source/services/S3IvylevelScanner');
const RecordingMatcher = require('./src/drive-source/services/RecordingMatcher');
const config = require('./config');

async function testSessionStructure() {
  console.log('=== Testing Session Structure ===\n');
  
  try {
    // Create scanner and matcher
    const scanner = new S3IvylevelScanner(config);
    const matcher = new RecordingMatcher();
    
    // Get coach folders
    const coachFolders = await scanner.getCoachFolders();
    console.log(`Found ${coachFolders.length} coach folders`);
    
    if (coachFolders.length === 0) {
      console.log('No coach folders found');
      return;
    }
    
    // Scan first coach folder
    const firstFolder = coachFolders[0];
    console.log(`\nScanning ${firstFolder.name}...`);
    
    const files = await scanner.scanFolder(firstFolder.id, {
      recursive: true,
      maxDepth: 3, // Reduced depth for faster testing
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
    
    // Show the structure of the first session
    const firstSession = validSessions[0];
    console.log('\n=== First Session Structure ===');
    console.log('Session ID:', firstSession.id);
    console.log('Folder Name:', firstSession.folderName);
    console.log('Files count:', firstSession.files?.length || 0);
    console.log('Metadata:', JSON.stringify(firstSession.metadata, null, 2));
    
    // Test if this session can be processed
    console.log('\n=== Testing Session Processing ===');
    const IntegratedDriveProcessor = require('./src/drive-source/services/IntegratedDriveProcessor');
    const processor = new IntegratedDriveProcessor(config);
    await processor.initialize();
    
    try {
      const result = await processor.processSession(firstSession);
      console.log('✅ Session processed successfully');
      console.log('Result UUID:', result.uuid);
      console.log('Result Topic:', result.rawName);
    } catch (error) {
      console.error('❌ Failed to process session:', error.message);
      console.error('Stack:', error.stack);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testSessionStructure(); 