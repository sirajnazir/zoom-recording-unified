// Simpler test that creates services directly without container issues

const config = require('../config');
const S3IvylevelScanner = require('./services/S3IvylevelScanner');

// Import the services we need directly
const { CompleteSmartNameStandardizer } = require('../infrastructure/services/CompleteSmartNameStandardizer');
const { DualTabGoogleSheetsService } = require('../infrastructure/services/DualTabGoogleSheetsService');

async function testSimpleIntegration() {
  console.log('=== Testing Drive Source with Direct Service Integration ===\n');

  try {
    // Create services directly
    const nameStandardizer = new CompleteSmartNameStandardizer();
    
    // Create a mock DualTabGoogleSheetsService for testing
    const mockGoogleSheetsService = {
      updateMasterSpreadsheet: async (data, source) => {
        console.log('\n📊 Would update Google Sheets with:');
        console.log('- Source:', source);
        console.log('- Recording topic:', data.original.topic);
        console.log('- Standardized name:', data.processed.nameAnalysis?.standardizedName);
        console.log('- Category:', data.processed.category);
        console.log('- Fingerprint:', data.processed.metadata?.fingerprint);
        return true;
      },
      checkDuplicate: async (fingerprint) => {
        console.log(`Checking duplicate for fingerprint: ${fingerprint}`);
        return false; // No duplicates for testing
      }
    };

    // Initialize scanner
    const scanner = new S3IvylevelScanner(config);
    
    // Step 1: Scan Jenny's folder
    console.log('Step 1: Scanning Jenny\'s test folder...');
    const jennyFolderId = config.driveSource?.coachFolders?.Jenny || '1OXTb-U4n6LJtcj-Gj4XtHZoGHD5IXdj_';
    
    const sessions = await scanner.scanFolder(jennyFolderId, {
      recursive: true,
      maxDepth: 3,
      includePatterns: ['coaching', 'session', 'huda']
    });

    console.log(`Found ${sessions.length} sessions\n`);

    if (sessions.length === 0) {
      console.log('No sessions found. Check folder permissions and structure.');
      return;
    }

    // Step 2: Process first session with name standardizer
    const session = sessions[0];
    console.log('\nStep 2: Processing first session with CompleteSmartNameStandardizer...');
    console.log('Session folder:', session.folderName || 'Unknown');
    console.log('Session files:', session.files.length);
    
    // Create a mock recording from the session
    const mockRecording = {
      topic: session.folderName || 'Unknown Session',
      host_email: 'jenny@example.com',
      start_time: new Date().toISOString()
    };

    // Analyze the name
    const nameAnalysis = await nameStandardizer.analyzeRecordingName(mockRecording.topic, {
      hostEmail: mockRecording.host_email,
      participantEmails: ['huda@example.com'],
      startTime: mockRecording.start_time
    });

    console.log('\nName Analysis Result:');
    console.log('- Standardized Name:', nameAnalysis.standardizedName);
    console.log('- Category:', nameAnalysis.category);
    console.log('- Components:', nameAnalysis.components);
    console.log('- Confidence:', nameAnalysis.confidence);

    // Step 3: Simulate sheet update
    const processedData = {
      recording: mockRecording,
      nameAnalysis,
      metadata: {
        fingerprint: 'test-fingerprint-123',
        dataSource: 'Google Drive Import'
      },
      category: nameAnalysis.category
    };

    await mockGoogleSheetsService.updateMasterSpreadsheet(
      {
        original: mockRecording,
        processed: processedData
      },
      'Google Drive Import'
    );

    console.log('\n✅ Test completed successfully!');
    console.log('The integrated processor would use these exact same services to ensure consistency.');

  } catch (error) {
    console.error('Test failed:', error);
    console.error(error.stack);
  }
}

// Run the test
testSimpleIntegration();