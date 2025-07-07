const IntegratedDriveProcessor = require('./src/drive-source/services/IntegratedDriveProcessor');
const config = require('./config');

async function testSingleSession() {
  console.log('=== Testing Single Session Processing ===\n');
  
  try {
    // Create the processor
    const processor = new IntegratedDriveProcessor(config);
    await processor.initialize();
    
    console.log('✅ Processor initialized');
    console.log('🔍 dualTabGoogleSheetsService exists:', !!processor.dualTabGoogleSheetsService);
    
    // Create a mock session
    const mockSession = {
      id: 'test-single-session-' + Date.now(),
      folderName: 'Test Single Session',
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
    console.log('   Session ID:', mockSession.id);
    console.log('   Folder Name:', mockSession.folderName);
    
    // Process the session
    const result = await processor.processSession(mockSession);
    
    console.log('✅ Session processed successfully');
    console.log('📊 Result:', {
      uuid: result.uuid,
      topic: result.rawName,
      dataSource: result.dataSource
    });
    
    console.log('\n🎉 Test completed! Check your Google Sheet for the new row.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testSingleSession(); 