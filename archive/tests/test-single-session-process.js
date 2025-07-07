#!/usr/bin/env node

// Test processing a single specific session
const config = require('./config');
const IntegratedDriveProcessorV3 = require('./src/drive-source/services/IntegratedDriveProcessorV3');
const { DualTabGoogleSheetsService } = require('./src/infrastructure/services/DualTabGoogleSheetsService');
const { CompleteSmartNameStandardizer } = require('./src/infrastructure/services/CompleteSmartNameStandardizer');
const { SmartWeekInferencer } = require('./src/infrastructure/services/SmartWeekInferencer');

async function testSingleSession() {
  console.log('🧪 Testing Single Session Processing\n');
  
  // Create services
  const services = {
    googleSheetsService: new DualTabGoogleSheetsService({ 
      config: config,
      logger: console 
    }),
    completeSmartNameStandardizer: new CompleteSmartNameStandardizer(),
    smartWeekInferencer: new SmartWeekInferencer({ config: config }),
    logger: console
  };
  
  const processor = new IntegratedDriveProcessorV3(config, services);
  
  // Create a test session from the output you showed
  const testSession = {
    id: '1KUnO8u8qYuL_CQLZfmGdoUnfOjYXqfGu',
    files: [
      {
        id: '1RXlsHoL7L7rUqv5R8NrxEP9VRQzjeOSy',
        name: '00-Video-Arshiya-Jenny-GMT20240922-162432_Recording_1814x936.mp4',
        mimeType: 'video/mp4',
        size: '209715200',
        createdTime: '2024-09-22T16:24:32.000Z',
        webViewLink: 'https://drive.google.com/file/d/1RXlsHoL7L7rUqv5R8NrxEP9VRQzjeOSy/view',
        parentFolderId: '1KUnO8u8qYuL_CQLZfmGdoUnfOjYXqfGu',
        folderName: 'Coaching_Jenny Duan_Arshiya_Wk00_2024-09-21_1KUnO8u8qYuL_CQLZfmGdoUnfOjYXqfGu',
        fileType: 'video'
      },
      {
        id: '1m-vfKgROo7wjZ7Z9uGxXRqojLhDEX7W5',
        name: 'GMT20240922-162432_Recording.m4a',
        mimeType: 'audio/x-m4a',
        size: '10485760',
        createdTime: '2024-09-22T16:24:32.000Z',
        webViewLink: 'https://drive.google.com/file/d/1m-vfKgROo7wjZ7Z9uGxXRqojLhDEX7W5/view',
        parentFolderId: '1KUnO8u8qYuL_CQLZfmGdoUnfOjYXqfGu',
        folderName: 'Coaching_Jenny Duan_Arshiya_Wk00_2024-09-21_1KUnO8u8qYuL_CQLZfmGdoUnfOjYXqfGu',
        fileType: 'audio'
      }
    ],
    metadata: {
      folderName: 'Coaching_Jenny Duan_Arshiya_Wk00_2024-09-21_1KUnO8u8qYuL_CQLZfmGdoUnfOjYXqfGu',
      date: null,
      participants: ['Jenny', 'Arshiya'],
      week: null,
      hasVideo: true,
      hasAudio: true,
      hasTranscript: false,
      hasChat: false,
      duration: null,
      folderId: '1KUnO8u8qYuL_CQLZfmGdoUnfOjYXqfGu'
    },
    confidence: 65
  };
  
  try {
    console.log('📝 Processing test session:', testSession.metadata.folderName);
    console.log('');
    
    // Process the session
    const results = await processor.processRecordingSessions([testSession]);
    
    console.log('\n✅ Processing complete!');
    console.log('Results:', JSON.stringify(results, null, 2));
    
    if (results.successful.length > 0) {
      console.log(`\n🔗 View results: https://docs.google.com/spreadsheets/d/${config.google.sheets.masterIndexSheetId}`);
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run test
testSingleSession().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});