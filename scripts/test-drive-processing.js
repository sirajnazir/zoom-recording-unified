#!/usr/bin/env node

// Test Drive Processing - Process specific folders
const RecordingSourceManager = require('../src/services/RecordingSourceManager');
const config = require('../config');

async function testDriveProcessing() {
  console.log('🧪 Test Drive Processing - Single Folder\n');

  // Use production settings
  config.features.enableDriveSource = true;
  config.driveSource.enabled = true;
  config.driveSource.useTestFolders = false;

  // Load services from container
  let services = {};
  try {
    const { getContainer } = require('../src/container');
    const container = getContainer();
    
    // Get essential services
    services = {
      googleSheetsService: container.resolve('googleSheetsService'),
      completeSmartNameStandardizer: container.resolve('completeSmartNameStandardizer'),
      smartWeekInferencer: container.resolve('smartWeekInferencer'),
      logger: container.resolve('logger')
    };
    
    console.log('✅ Services loaded from container\n');
  } catch (error) {
    console.log('⚠️  Using minimal services:', error.message);
  }

  const sourceManager = new RecordingSourceManager(config, services);

  try {
    // Test with a specific folder ID - Jenny's folder has the most organized structure
    const jennyFolderId = config.driveSource.coachFolders['Jenny Duan'] || config.driveSource.coachFolders['Jenny'];
    
    console.log('Configuration:');
    console.log(`- Target folder: Jenny Duan`);
    console.log(`- Folder ID: ${jennyFolderId}`);
    console.log(`- Max sessions: 3`);
    console.log(`- Master Sheet: ${config.google.sheets.masterIndexSheetId}`);
    console.log('');
    
    const result = await sourceManager.processDriveSource({
      folderId: jennyFolderId,
      maxSessions: 3
    });

    if (result.success) {
      console.log('\n✅ Processing complete:');
      console.log(`   Files: ${result.results.scanned}`);
      console.log(`   Processed: ${result.results.processed}`);
      console.log(`   Failed: ${result.results.failed}`);
      console.log(`   Skipped: ${result.results.skipped}`);
      
      if (result.details && result.details.successful.length > 0) {
        console.log('\nSuccessfully processed:');
        result.details.successful.forEach(session => {
          console.log(`  ✓ ${session.standardizedName || session.rawName || 'Unknown'}`);
          console.log(`    - Week: ${session.weekNumber}`);
          console.log(`    - Confidence: ${session.weekConfidence}`);
          console.log(`    - Drive: ${session.driveLink}`);
        });
      }
    } else {
      console.error(`\n❌ Processing failed: ${result.error}`);
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
  }
}

// Run test
testDriveProcessing().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});