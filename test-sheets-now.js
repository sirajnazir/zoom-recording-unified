const { DualTabGoogleSheetsService } = require('./src/infrastructure/services/DualTabGoogleSheetsService');
const { EventBus } = require('./src/shared/EventBus');
const { Logger } = require('./src/shared/Logger');
const { Cache } = require('./src/shared/Cache');
const { MetricsCollector } = require('./src/shared/MetricsCollector');
const { CompleteSmartNameStandardizer } = require('./src/infrastructure/services/CompleteSmartNameStandardizer');
const config = require('./config');

async function testSheetsNow() {
  console.log('=== Testing Google Sheets Service NOW ===\n');
  
  try {
    // Create the CompleteSmartNameStandardizer
    const nameStandardizer = new CompleteSmartNameStandardizer();
    
    // Create the real DualTabGoogleSheetsService
    const sheetsService = new DualTabGoogleSheetsService({
      config: config,
      eventBus: new EventBus(),
      logger: new Logger('DualTabGoogleSheetsService'),
      cache: new Cache(),
      metricsCollector: new MetricsCollector(),
      nameStandardizer: nameStandardizer,
      weekInferencer: null,
      metadataExtractor: null,
      transcriptionAnalyzer: null
    });
    
    console.log('✅ Sheets service created');
    
    // Create test data
    const testData = {
      original: {
        uuid: 'test-drive-now-' + Date.now(),
        id: 'test-drive-now-' + Date.now(),
        topic: 'Test Drive Import NOW',
        start_time: new Date().toISOString(),
        duration: 3600,
        host_email: 'test@example.com',
        host_name: 'Test Coach',
        participant_count: 2,
        recording_type: 'cloud_recording',
        file_size: 1048576,
        download_url: 'https://drive.google.com/test',
        created_at: new Date().toISOString(),
        meeting_id: 'test-meeting-' + Date.now(),
        recording_files: []
      },
      processed: {
        uuid: 'test-drive-now-' + Date.now(),
        fingerprint: 'test-fingerprint',
        recordingDate: new Date().toISOString().split('T')[0],
        rawName: 'Test Drive Import NOW',
        standardizedName: 'Test Drive Import NOW',
        nameConfidence: 100,
        nameResolutionMethod: 'test',
        familyAccount: 'No',
        weekNumber: '',
        weekConfidence: '',
        weekInferenceMethod: '',
        category: 'MISC',
        categoryReason: '',
        hostEmail: 'test@example.com',
        hostName: 'Test Coach',
        meetingTopic: 'Test Drive Import NOW',
        participants: 'Test Coach, Test Student',
        participantCount: 2,
        meetingId: 'test-meeting-' + Date.now(),
        duration: 60,
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 3600000).toISOString(),
        recordingType: 'cloud_recording',
        fileSize: 1048576,
        hasTranscript: false,
        transcriptQuality: '',
        speakerCount: '',
        primarySpeaker: '',
        speakingTimeDistribution: '{}',
        emotionalJourney: '[]',
        engagementScore: 0,
        keyMoments: '[]',
        coachingTopics: '',
        coachingStyle: '',
        studentResponsePattern: '',
        interactionQuality: '',
        keyThemes: '',
        actionItems: '[]',
        challengesIdentified: '',
        breakthroughs: '',
        goalsSet: '',
        progressTracked: '',
        nextSteps: '',
        followUpRequired: '',
        driveFolder: '',
        driveFolderId: '',
        driveLink: '',
        videoFileId: '',
        transcriptFileId: '',
        processedDate: new Date().toISOString(),
        processingVersion: '2.0-smart',
        dataSource: 'Google Drive Import TEST',
        lastUpdated: new Date().toISOString()
      }
    };
    
    console.log('📝 Updating Google Sheet with test data...');
    console.log('   UUID:', testData.original.uuid);
    console.log('   Topic:', testData.original.topic);
    console.log('   Data Source:', testData.processed.dataSource);
    
    // Update the sheet
    const result = await sheetsService.updateMasterSpreadsheet(testData, 'Drive Import Test');
    
    console.log('✅ Sheet update result:', result);
    console.log('\n🎉 Test completed! Check your Google Sheet for the new test row.');
    console.log('   Look for a row with "Test Drive Import NOW" in the topic column.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testSheetsNow(); 