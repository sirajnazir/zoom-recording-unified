#!/usr/bin/env node

// Process Google Drive Historical Recordings
// Uses the main production folders and sheets

const RecordingSourceManager = require('../src/services/RecordingSourceManager');
const config = require('../config');
const readline = require('readline');

async function processDriveRecordings() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         Process Google Drive Historical Recordings             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Ensure we're using production folders
  config.features.enableDriveSource = true;
  config.driveSource.enabled = true;
  config.driveSource.useTestFolders = false;

  console.log('Configuration:');
  console.log(`- Using production folders: ${!config.driveSource.useTestFolders}`);
  console.log(`- Master Sheet ID: ${config.google.sheets.masterIndexSheetId}`);
  console.log(`- Root Folder ID: ${config.google.drive.recordingsRootFolderId}`);
  console.log(`- Source identifier: "Google Drive Import"`);
  console.log('');

  const sourceManager = new RecordingSourceManager(config);

  // Show coach options
  const coaches = Object.keys(config.driveSource.coachFolders);
  console.log('Available coaches to process:');
  coaches.forEach((coach, index) => {
    console.log(`${index + 1}. ${coach} - Folder: ${config.driveSource.coachFolders[coach]}`);
  });
  console.log(`${coaches.length + 1}. Process ALL coaches`);
  console.log(`${coaches.length + 2}. Exit`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('\nSelect option: ', async (choice) => {
    const choiceNum = parseInt(choice);
    
    if (choiceNum === coaches.length + 2) {
      console.log('Exiting...');
      rl.close();
      return;
    }

    let selectedCoach = null;
    if (choiceNum >= 1 && choiceNum <= coaches.length) {
      selectedCoach = coaches[choiceNum - 1];
      console.log(`\nSelected: ${selectedCoach}`);
    } else if (choiceNum === coaches.length + 1) {
      console.log('\nSelected: ALL coaches');
    } else {
      console.log('Invalid selection');
      rl.close();
      return;
    }

    rl.question('\nHow many sessions to process per coach (default 20, max 100): ', async (count) => {
      const maxSessions = Math.min(parseInt(count) || 20, 100);
      
      rl.question('\nThis will process recordings and update the PRODUCTION Google Sheet. Continue? (yes/no): ', async (confirm) => {
        rl.close();
        
        if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
          console.log('Cancelled.');
          return;
        }

        console.log('\n🚀 Starting processing...\n');

        try {
          if (selectedCoach) {
            // Process single coach
            await processCoach(sourceManager, selectedCoach, maxSessions);
          } else {
            // Process all coaches
            for (const coach of coaches) {
              console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
              console.log(`Processing ${coach}...`);
              console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
              
              await processCoach(sourceManager, coach, maxSessions);
              
              // Brief pause between coaches
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }

          console.log('\n✅ All processing complete!');
          console.log('\nCheck the Master Index Google Sheet for results:');
          console.log(`https://docs.google.com/spreadsheets/d/${config.google.sheets.masterIndexSheetId}`);
          
        } catch (error) {
          console.error('\n❌ Error during processing:', error.message);
          console.error(error.stack);
        }
      });
    });
  });
}

async function processCoach(sourceManager, coachName, maxSessions) {
  try {
    // First scan to see what's available
    console.log(`🔍 Scanning ${coachName}'s folder...`);
    const scanResult = await sourceManager.scanCoachFolder(coachName);
    
    console.log(`Found ${scanResult.filesFound} files in ${scanResult.sessionsFound} sessions`);
    
    if (scanResult.sessionsFound === 0) {
      console.log('No sessions found to process.');
      return;
    }

    // Process the sessions
    console.log(`\n📊 Processing up to ${maxSessions} sessions...`);
    
    const result = await sourceManager.processDriveSource({
      coachName,
      maxSessions
    });

    if (result.success) {
      console.log(`\n✅ ${coachName} processing complete:`);
      console.log(`- Files scanned: ${result.results.scanned}`);
      console.log(`- Sessions processed: ${result.results.processed}`);
      console.log(`- Failed: ${result.results.failed}`);
      console.log(`- Skipped (duplicates): ${result.results.skipped}`);
      
      if (result.details && result.details.successful.length > 0) {
        console.log('\nProcessed sessions:');
        result.details.successful.slice(0, 5).forEach(session => {
          console.log(`  ✓ ${session.metadata.standardizedName}`);
        });
        if (result.details.successful.length > 5) {
          console.log(`  ... and ${result.details.successful.length - 5} more`);
        }
      }
    } else {
      console.error(`\n❌ Failed to process ${coachName}:`, result.error);
    }
  } catch (error) {
    console.error(`Error processing ${coachName}:`, error.message);
  }
}

// Run the processor
processDriveRecordings().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});