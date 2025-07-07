const IntegratedDriveProcessor = require('./src/drive-source/services/IntegratedDriveProcessor');
const config = require('./config');

async function testQuickBatch() {
  console.log('=== Quick Batch Test ===\n');
  
  try {
    // Create processor
    const processor = new IntegratedDriveProcessor(config);
    await processor.initialize();
    console.log('✅ Processor initialized');
    
    // Create mock sessions based on the folder structure we know exists
    const mockSessions = [
      {
        id: 'test-session-1',
        folderName: 'Coaching_Andrew_Rayaan_Wk08_2024-06-19',
        recordings: [
          {
            id: 'GMT20240620-015624_Recording_gallery_1280x720.mp4',
            name: 'GMT20240620-015624_Recording_gallery_1280x720.mp4',
            mimeType: 'video/mp4',
            size: 50000000,
            webViewLink: 'https://drive.google.com/file/d/11X8L_FWZHDFJL-zvvR9S0lRfiMC2zjQr/view'
          }
        ],
        folderId: '1C4F34xykOiRWwFkDIFg5vR9zn4XHV4It'
      },
      {
        id: 'test-session-2', 
        folderName: 'Coaching_Andrew_Rayaan_Wk09_2024-07-27',
        recordings: [
          {
            id: 'GMT20240728-135524_Recording_1920x1032.mp4',
            name: 'GMT20240728-135524_Recording_1920x1032.mp4',
            mimeType: 'video/mp4',
            size: 60000000,
            webViewLink: 'https://drive.google.com/file/d/1n7hx4ViqQSarZuj8mHsxvzI3CxlzrOfC/view'
          }
        ],
        folderId: '1VQdg3EGnudE9oMiyPZ93m24nh522-vfr'
      },
      {
        id: 'test-session-3',
        folderName: 'Coaching_Andrew_Rayaan_Wk10_2024-10-02', 
        recordings: [
          {
            id: 'GMT20241003-022657_Recording_gallery_1280x720.mp4',
            name: 'GMT20241003-022657_Recording_gallery_1280x720.mp4',
            mimeType: 'video/mp4',
            size: 45000000,
            webViewLink: 'https://drive.google.com/file/d/1aaP6FAMrjeYLR0sQXHH0QXAQ3A4WtpXb/view'
          }
        ],
        folderId: '1bC52BvSoFiEiwQdo18sMJO94NETBybAt'
      }
    ];
    
    console.log(`🚀 Processing ${mockSessions.length} test sessions...\n`);
    
    const results = {
      successful: [],
      failed: [],
      skipped: []
    };
    
    for (const [index, session] of mockSessions.entries()) {
      console.log(`Processing session ${index + 1}/${mockSessions.length}: ${session.folderName}`);
      
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

testQuickBatch(); 