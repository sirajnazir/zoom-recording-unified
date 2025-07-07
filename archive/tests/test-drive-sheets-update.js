const IntegratedDriveProcessor = require('./src/drive-source/services/IntegratedDriveProcessor');
const config = require('./config');

async function testDriveSheetsUpdate() {
  console.log('=== Testing Drive Import Google Sheets Update ===\n');
  
  try {
    // Create the processor
    const processor = new IntegratedDriveProcessor(config);
    await processor.initialize();
    
    console.log('✅ Processor initialized successfully');
    
    // Create a mock session to test with
    const mockSession = {
      id: 'test-drive-session-001',
      folderName: 'Test Drive Session',
      files: [
        {
          id: 'test-file-001',
          name: 'test-recording.mp4',
          size: '1048576',
          fileType: 'video',
          createdTime: new Date().toISOString()
        }
      ],
      metadata: {
        date: { raw: new Date().toISOString() },
        duration: 3600,
        participants: ['Test Coach', 'Test Student']
      }
    };
    
    console.log('📝 Processing mock session...');
    
    // Process the session
    const result = await processor.processSession(mockSession);
    
    console.log('✅ Session processed successfully');
    console.log('📊 Result:', {
      uuid: result.uuid,
      topic: result.rawName,
      dataSource: result.dataSource
    });
    
    console.log('\n🎉 Test completed successfully! Check your Google Sheet for the test entry.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

testDriveSheetsUpdate(); 