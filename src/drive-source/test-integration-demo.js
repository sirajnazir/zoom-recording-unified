// Demonstration of how the integrated processor works with existing services

const { CompleteSmartNameStandardizer } = require('../infrastructure/services/CompleteSmartNameStandardizer');

// Helper function to preprocess Drive folder names
function preprocessDriveFolderName(folderName) {
  // Handle already standardized folder names from Drive
  // Format: Coaching_Jenny_Huda_Wk2_2025-01-02
  const standardizedPattern = /^(Coaching|GamePlan|SAT|MISC|TRIVIAL)_([^_]+)_([^_]+)_Wk(\d+)_\d{4}-\d{2}-\d{2}/;
  const match = folderName.match(standardizedPattern);
  
  if (match) {
    // Convert to a format the standardizer can understand better
    const [, sessionType, coach, student, week] = match;
    // Return in a format that matches one of the patterns: "Coach & Student"
    return `${coach} & ${student}`;
  }
  
  // Handle S12-Ivylevel-Alan-Session-2024-12-15 format
  const ivylevelPattern = /S(\d+)-Ivylevel-([^-]+)-Session/i;
  const ivylevelMatch = folderName.match(ivylevelPattern);
  if (ivylevelMatch) {
    const [, studentId, coachName] = ivylevelMatch;
    // Try to find student name from metadata or use studentId
    return `${coachName} & Student${studentId}`;
  }
  
  // Return original if no pattern matches
  return folderName;
}

async function demonstrateIntegration() {
  console.log('=== Demonstrating Integrated Drive Processor Architecture ===\n');

  try {
    // Create the CompleteSmartNameStandardizer
    const nameStandardizer = new CompleteSmartNameStandardizer();
    
    // Example 1: Process a Jenny & Huda session
    console.log('Example 1: Jenny & Huda Session');
    console.log('--------------------------------');
    
    const session1 = {
      folderName: "Coaching_Jenny_Huda_Wk2_2025-01-02",
      files: [
        { name: "Coaching_Jenny_Huda_Wk2_2025-01-02.mp4", fileType: "video" },
        { name: "Coaching_Jenny_Huda_Wk2_2025-01-02.vtt", fileType: "transcript" }
      ],
      metadata: {
        participants: ["Jenny", "Huda"],
        date: { raw: "2025-01-02" },
        week: { number: 2 }
      }
    };

    // Preprocess the folder name to extract components
    const processedTopic1 = preprocessDriveFolderName(session1.folderName);
    console.log('Preprocessed topic:', processedTopic1);
    
    const nameAnalysis1 = await nameStandardizer.standardizeName(processedTopic1, {
      hostEmail: "jenny@example.com",
      participantEmails: ["jenny@example.com", "huda@example.com"],
      startTime: "2025-01-02T10:00:00Z",
      uuid: "test-uuid-12345678=="
    });

    console.log('Input folder name:', session1.folderName);
    console.log('Standardized name:', nameAnalysis1.standardized);
    console.log('Components:', JSON.stringify(nameAnalysis1.components, null, 2));
    console.log('Confidence:', nameAnalysis1.confidence);
    console.log('Method:', nameAnalysis1.method);

    // Example 2: Process an Alan & Rayaan session (complex case)
    console.log('\n\nExample 2: Alan & Rayaan Session (Complex Case)');
    console.log('---------------------------------------------');
    
    const session2 = {
      folderName: "S12-Ivylevel-Alan-Session-2024-12-15",
      files: [
        { name: "recording_2024_12_15.mp4", fileType: "video" },
        { name: "transcript.vtt", fileType: "transcript" }
      ],
      metadata: {
        participants: ["Alan", "Rayaan"],
        date: { raw: "2024-12-15" }
      }
    };

    // Preprocess the folder name to extract components
    const processedTopic2 = preprocessDriveFolderName(session2.folderName);
    console.log('Preprocessed topic:', processedTopic2);
    
    const nameAnalysis2 = await nameStandardizer.standardizeName(processedTopic2, {
      hostEmail: "alan@example.com",
      participantEmails: ["alan@example.com", "rayaan@example.com"],
      startTime: "2024-12-15T14:00:00Z",
      uuid: "test-uuid-87654321=="
    });

    console.log('Input folder name:', session2.folderName);
    console.log('Standardized name:', nameAnalysis2.standardized);
    console.log('Components:', JSON.stringify(nameAnalysis2.components, null, 2));
    console.log('Confidence:', nameAnalysis2.confidence);
    console.log('Method:', nameAnalysis2.method);

    // Show how the data would flow
    console.log('\n\n=== Data Flow in Integrated Processor ===');
    console.log('1. DriveScanner finds files in Google Drive');
    console.log('2. RecordingMatcher groups files into sessions');
    console.log('3. IntegratedDriveProcessor processes each session:');
    console.log('   a. Converts session to recording format');
    console.log('   b. Uses CompleteSmartNameStandardizer for name analysis');
    console.log('   c. Updates BOTH Raw and Standardized tabs via DualTabGoogleSheetsService');
    console.log('   d. Optionally organizes files in Drive with DriveOrganizer');
    console.log('\n✅ This ensures consistency across all data sources!');

    // Show expected Google Sheets update
    console.log('\n\n=== Expected Google Sheets Update ===');
    console.log('\nRaw Master Index (Tab 1) - Original data:');
    console.log('- UUID:', session1.metadata.fingerprint || 'generated-fingerprint');
    console.log('- Topic:', session1.folderName);
    console.log('- Start Time:', session1.metadata.date.raw);
    console.log('- Host Email:', 'jenny@example.com');
    console.log('- Data Source:', 'Google Drive Import');

    console.log('\nStandardized Master Index (Tab 2) - Processed data:');
    console.log('- UUID:', session1.metadata.fingerprint || 'generated-fingerprint');
    console.log('- Standardized Name:', nameAnalysis1.standardized);
    console.log('- Category:', nameAnalysis1.components.sessionType);
    console.log('- Coach:', nameAnalysis1.components.coach);
    console.log('- Student:', nameAnalysis1.components.student);
    console.log('- Week:', nameAnalysis1.components.week);
    console.log('- Confidence:', nameAnalysis1.confidence);

  } catch (error) {
    console.error('Demo failed:', error);
    console.error(error.stack);
  }
}

// Run the demonstration
demonstrateIntegration();