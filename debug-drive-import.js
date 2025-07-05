const S3IvylevelScanner = require('./src/drive-source/services/S3IvylevelScanner');
const IntegratedDriveProcessor = require('./src/drive-source/services/IntegratedDriveProcessor');
const config = require('./config');

async function debugDriveImport() {
  console.log('=== Debugging Drive Import ===\n');
  
  // Debug config first
  console.log('🔍 Config Debug:');
  console.log('  driveSource exists:', !!config.driveSource);
  console.log('  s3IvylevelFolderId:', config.driveSource?.s3IvylevelFolderId);
  console.log('  coachFolders:', config.driveSource?.coachFolders);
  console.log('');
  
  try {
    // Step 1: Test scanner
    console.log('1. Testing S3IvylevelScanner...');
    const scanner = new S3IvylevelScanner(config);
    const coachFolders = await scanner.getCoachFolders();
    console.log(`   Found ${coachFolders.length} coach folders`);
    
    if (coachFolders.length === 0) {
      console.log('   ❌ No coach folders found - stopping here');
      return;
    }
    
    // Step 2: Test scanning one coach folder
    console.log('\n2. Testing scan of first coach folder...');
    const firstFolder = coachFolders[0];
    console.log(`   Scanning: ${firstFolder.name} (${firstFolder.id})`);
    
    const files = await scanner.scanFolder(firstFolder.id, {
      recursive: true,
      maxDepth: 5,
      minFileSize: 100 * 1024
    });
    
    console.log(`   Found ${files.length} files`);
    
    if (files.length === 0) {
      console.log('   ❌ No files found - stopping here');
      return;
    }
    
    // Step 3: Test processor initialization
    console.log('\n3. Testing IntegratedDriveProcessor initialization...');
    const processor = new IntegratedDriveProcessor(config);
    await processor.initialize();
    console.log('   ✅ Processor initialized');
    
    // Step 4: Test processing of first session
    console.log('\n4. Testing processing of first session...');
    const sessions = await scanner.discoverRecordingGroups(files);
    console.log(`   Grouped into ${sessions.length} sessions`);
    
    if (sessions.length === 0) {
      console.log('   ❌ No sessions created - stopping here');
      return;
    }
    
    const firstSession = sessions[0];
    console.log(`   Processing session: ${firstSession.id}`);
    console.log(`   Files: ${firstSession.files?.length || 0}`);
    
    try {
      const result = await processor.processSession(firstSession);
      console.log('   ✅ Session processed successfully');
      console.log(`   Result UUID: ${result.uuid}`);
      console.log(`   Data Source: ${result.dataSource}`);
    } catch (error) {
      console.error('   ❌ Failed to process session:', error.message);
      console.error('   Stack:', error.stack);
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

debugDriveImport(); 