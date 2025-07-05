#!/usr/bin/env node

// Process specific student's sessions
const { google } = require('googleapis');
const config = require('../config');
const IntegratedDriveProcessorV3 = require('../src/drive-source/services/IntegratedDriveProcessorV3');
const RecordingMatcher = require('../src/drive-source/services/RecordingMatcher');

async function processStudentSessions() {
  console.log('🎯 Process Specific Student Sessions\n');

  // Parse arguments
  const args = process.argv.slice(2);
  const studentName = args[0];
  const limit = parseInt(args[1]) || 10;

  if (!studentName || args.includes('--help')) {
    console.log('Usage: node process-student-sessions.js <student> [limit]');
    console.log('');
    console.log('Examples:');
    console.log('  node process-student-sessions.js Arshiya       # Process 10 Arshiya sessions');
    console.log('  node process-student-sessions.js Anoushka 20   # Process 20 Anoushka sessions');
    console.log('  node process-student-sessions.js Huda 5         # Process 5 Huda sessions');
    process.exit(0);
  }

  // Setup Google Drive API
  const auth = new google.auth.JWT(
    config.google.clientEmail,
    null,
    config.google.privateKey,
    ['https://www.googleapis.com/auth/drive']
  );
  const drive = google.drive({ version: 'v3', auth });

  // Setup services
  let services = {};
  try {
    const { getContainer } = require('../src/container');
    const container = getContainer();
    services = {
      googleSheetsService: container.resolve('googleSheetsService'),
      completeSmartNameStandardizer: container.resolve('completeSmartNameStandardizer'),
      smartWeekInferencer: container.resolve('smartWeekInferencer'),
      logger: container.resolve('logger')
    };
    console.log('✅ Services loaded from container');
    console.log('  - GoogleSheetsService:', !!services.googleSheetsService);
    console.log('  - NameStandardizer:', !!services.completeSmartNameStandardizer);
    console.log('  - WeekInferencer:', !!services.smartWeekInferencer);
    console.log('');
  } catch (error) {
    console.log('⚠️  Container loading failed:', error.message);
    
    // Create services manually as fallback
    try {
      const { DualTabGoogleSheetsService } = require('../src/infrastructure/services/DualTabGoogleSheetsService');
      const { CompleteSmartNameStandardizer } = require('../src/infrastructure/services/CompleteSmartNameStandardizer');
      const { SmartWeekInferencer } = require('../src/infrastructure/services/SmartWeekInferencer');
      
      // Create sheets service with proper config
      services.googleSheetsService = new DualTabGoogleSheetsService({ 
        config: config,
        logger: console 
      });
      
      services.completeSmartNameStandardizer = new CompleteSmartNameStandardizer();
      services.smartWeekInferencer = new SmartWeekInferencer({ config: config });
      services.logger = console;
      
      console.log('✅ Services created manually');
      console.log('  - GoogleSheetsService:', !!services.googleSheetsService);
      console.log('  - NameStandardizer:', !!services.completeSmartNameStandardizer);
      console.log('  - WeekInferencer:', !!services.smartWeekInferencer);
      console.log('');
    } catch (fallbackError) {
      console.log('⚠️  Could not create services:', fallbackError.message);
    }
  }

  const processor = new IntegratedDriveProcessorV3(config, services);
  const matcher = new RecordingMatcher();

  console.log('Configuration:');
  console.log(`- Student: ${studentName}`);
  console.log(`- Max sessions: ${limit}`);
  console.log(`- Master Sheet: ${config.google.sheets.masterIndexSheetId}`);
  console.log('');

  try {
    // Step 1: Search for folders containing student name
    console.log(`🔍 Searching for ${studentName}'s sessions...\n`);
    
    const searchQuery = `name contains '${studentName}' and mimeType = 'application/vnd.google-apps.folder'`;
    const response = await drive.files.list({
      q: searchQuery,
      fields: 'files(id, name, parents)',
      pageSize: 100
    });

    const folders = response.data.files || [];
    console.log(`Found ${folders.length} folders containing "${studentName}"\n`);

    if (folders.length === 0) {
      console.log('❌ No folders found for this student');
      return;
    }

    // Filter for session folders (with week numbers)
    const sessionFolders = folders.filter(f => 
      f.name.match(/Wk\d+/) || f.name.match(/Week\s*\d+/)
    ).sort((a, b) => {
      // Sort by week number
      const aWeek = parseInt((a.name.match(/Wk(\d+)/) || a.name.match(/Week\s*(\d+)/) || [0, 0])[1]);
      const bWeek = parseInt((b.name.match(/Wk(\d+)/) || b.name.match(/Week\s*(\d+)/) || [0, 0])[1]);
      return aWeek - bWeek;
    });

    console.log(`📁 Found ${sessionFolders.length} session folders:\n`);
    sessionFolders.slice(0, 10).forEach(f => {
      console.log(`  - ${f.name}`);
    });
    if (sessionFolders.length > 10) {
      console.log(`  ... and ${sessionFolders.length - 10} more`);
    }
    console.log('');

    // Step 2: Process folders
    const foldersToProcess = sessionFolders.slice(0, limit);
    console.log(`\n🚀 Processing ${foldersToProcess.length} sessions...\n`);

    const allFiles = [];
    for (const folder of foldersToProcess) {
      try {
        // Get files in folder - include all files
        const filesResponse = await drive.files.list({
          q: `'${folder.id}' in parents and mimeType != 'application/vnd.google-apps.folder'`,
          fields: 'files(id, name, mimeType, size, createdTime, webViewLink)',
          pageSize: 20
        });

        const files = filesResponse.data.files || [];
        
        // Add folder metadata to files
        files.forEach(file => {
          file.parentFolderId = folder.id;
          file.folderName = folder.name;
          file.fileType = detectFileType(file.name, file.mimeType);
        });

        allFiles.push(...files);
        console.log(`  ✓ ${folder.name}: ${files.length} files`);
        
        // Debug: Show file types found
        const fileTypes = files.map(f => f.fileType);
        const uniqueTypes = [...new Set(fileTypes)];
        console.log(`    File types: ${uniqueTypes.join(', ')}`);
      } catch (error) {
        console.error(`  ✗ ${folder.name}: ${error.message}`);
      }
    }

    // Step 3: Group files by folder into sessions
    console.log(`\n📊 Grouping ${allFiles.length} files into sessions...`);
    
    // Group files by folder ID
    const filesByFolder = {};
    allFiles.forEach(file => {
      const folderId = file.parentFolderId;
      if (!filesByFolder[folderId]) {
        filesByFolder[folderId] = {
          id: folderId,
          files: [],
          metadata: {
            folderName: file.folderName,
            folderId: folderId
          }
        };
      }
      filesByFolder[folderId].files.push(file);
    });
    
    // Convert to sessions array
    const sessions = Object.values(filesByFolder);
    console.log(`Created ${sessions.length} sessions from ${allFiles.length} files`);
    
    // Validate sessions
    const validSessions = sessions.filter(session => {
      const hasVideo = session.files.some(f => f.fileType === 'video');
      const hasAudio = session.files.some(f => f.fileType === 'audio');
      return hasVideo || hasAudio;
    });
    
    console.log(`✅ Identified ${validSessions.length} valid sessions`);

    // Step 4: Process sessions
    if (validSessions.length > 0) {
      const results = await processor.processRecordingSessions(validSessions);
      
      console.log('\n✅ Processing complete!');
      console.log(`   Successful: ${results.successful.length}`);
      console.log(`   Failed: ${results.failed.length}`);
      console.log(`   Skipped: ${results.skipped.length}`);
      
      if (results.successful.length > 0) {
        console.log('\nProcessed sessions:');
        results.successful.forEach(session => {
          const sessionName = session.standardizedName || session.rawName || session.topic || 'Unknown';
          console.log(`  ✓ ${sessionName}`);
          console.log(`    - Week: ${session.weekNumber}`);
          console.log(`    - Date: ${session.recordingDate}`);
        });
      }
      
      console.log(`\nView results: https://docs.google.com/spreadsheets/d/${config.google.sheets.masterIndexSheetId}`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
}

function detectFileType(fileName, mimeType) {
  // Check MIME type first
  if (mimeType) {
    if (mimeType.includes('video')) return 'video';
    if (mimeType.includes('audio') || mimeType === 'audio/mp4') return 'audio';
    if (mimeType === 'text/vtt') return 'transcript';
    if (mimeType === 'text/plain' && fileName.toLowerCase().includes('.txt')) return 'chat';
  }
  
  // Fallback to extension
  const ext = fileName.split('.').pop().toLowerCase();
  if (['mp4', 'mov', 'avi'].includes(ext)) return 'video';
  if (['m4a', 'mp3', 'wav'].includes(ext)) return 'audio';
  if (['vtt', 'srt'].includes(ext)) return 'transcript';
  if (['txt'].includes(ext)) return 'chat';
  if (['json'].includes(ext)) return 'metadata';
  if (['md'].includes(ext)) return 'notes';
  
  return 'unknown';
}

// Run
processStudentSessions().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});