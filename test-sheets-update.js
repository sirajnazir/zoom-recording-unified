#!/usr/bin/env node

// Test Google Sheets update functionality
const config = require('./config');
const { DualTabGoogleSheetsService } = require('./src/infrastructure/services/DualTabGoogleSheetsService');

async function testSheetsUpdate() {
  console.log('🧪 Testing Google Sheets Update\n');
  
  console.log('Configuration:');
  console.log(`- Sheet ID: ${config.google.sheets.masterIndexSheetId}`);
  console.log(`- Client Email: ${config.google.clientEmail || 'Not set'}`);
  console.log(`- Private Key: ${config.google.privateKey ? 'Set' : 'Not set'}`);
  console.log('');
  
  try {
    // Create sheets service directly
    const sheetsService = new DualTabGoogleSheetsService({ 
      config: config,
      logger: console 
    });
    
    console.log('✅ DualTabGoogleSheetsService created');
    
    // Test data
    const testRecording = {
      uuid: 'test-' + Date.now(),
      fingerprint: 'test-fingerprint',
      recordingDate: new Date().toISOString().split('T')[0],
      rawName: 'Test Session',
      standardizedName: 'Jenny & Arshiya - Wk00',
      nameConfidence: 0.95,
      nameResolutionMethod: 'manual_test',
      weekNumber: '00',
      weekConfidence: 1.0,
      weekInferenceMethod: 'test',
      category: 'Coaching',
      hostEmail: 'jenny@ivymentors.co',
      hostName: 'Jenny',
      participants: 'Jenny, Arshiya',
      participantCount: 2,
      meetingId: 'test-meeting-123',
      duration: 60,
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 3600000).toISOString(),
      recordingType: 'cloud_recording',
      fileSize: 1024 * 1024 * 100, // 100MB
      hasTranscript: false,
      driveFolder: 'Test_Folder',
      driveFolderId: 'test-folder-id',
      driveLink: 'https://drive.google.com/drive/folders/test-folder-id',
      processedDate: new Date().toISOString(),
      processingVersion: '3.0-test',
      dataSource: 'Test Script',
      lastUpdated: new Date().toISOString()
    };
    
    console.log('\n📝 Attempting to update sheets with test data...\n');
    
    const result = await sheetsService.updateMasterSpreadsheet({
      processed: testRecording,
      original: testRecording
    }, 'Test Script');
    
    console.log('✅ Update successful!');
    console.log('Result:', result);
    
    if (result && result.rowNumber) {
      console.log(`\n📍 Data added at row ${result.rowNumber}`);
      console.log(`\n🔗 View sheet: https://docs.google.com/spreadsheets/d/${config.google.sheets.masterIndexSheetId}`);
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    
    if (error.message.includes('authentication')) {
      console.log('\n💡 Authentication issue detected. Check:');
      console.log('   - GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SERVICE_ACCOUNT_JSON is set');
      console.log('   - Service account has access to the spreadsheet');
    }
  }
}

// Run test
testSheetsUpdate().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});