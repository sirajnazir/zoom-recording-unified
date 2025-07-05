#!/usr/bin/env node

// CLI for Drive Source Processing
// This is NEW and doesn't interfere with existing batch processing

const RecordingSourceManager = require('../src/services/RecordingSourceManager');
const config = require('../config');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║            Drive Source Recording Processor                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Enable drive source for this session
  config.features.enableDriveSource = true;
  config.driveSource.enabled = true;

  const sourceManager = new RecordingSourceManager(config);

  // Show available sources
  const sources = sourceManager.getAvailableSources();
  console.log('Available recording sources:');
  sources.forEach(source => {
    console.log(`- ${source.name} (${source.id}): ${source.description}`);
  });

  console.log('\nDrive Source Menu:');
  console.log('1. Process recordings from a specific coach');
  console.log('2. Process all unprocessed recordings');
  console.log('3. Scan a coach folder (dry run)');
  console.log('4. Use test environment');
  console.log('5. Exit');

  rl.question('\nSelect an option (1-5): ', async (choice) => {
    switch (choice) {
      case '1':
        await processCoachRecordings(sourceManager);
        break;
      case '2':
        await processAllRecordings(sourceManager);
        break;
      case '3':
        await scanCoachFolder(sourceManager);
        break;
      case '4':
        config.driveSource.useTestFolders = true;
        console.log('\n✅ Switched to test environment');
        console.log('Using test folders and sheet for processing\n');
        await main(); // Restart menu
        return;
      case '5':
        console.log('Goodbye!');
        rl.close();
        return;
      default:
        console.log('Invalid option');
    }
    
    rl.close();
  });
}

async function processCoachRecordings(sourceManager) {
  const coaches = Object.keys(config.driveSource.coachFolders);
  console.log('\nAvailable coaches:');
  coaches.forEach((coach, index) => {
    console.log(`${index + 1}. ${coach}`);
  });

  rl.question('\nSelect coach number: ', async (num) => {
    const coachName = coaches[parseInt(num) - 1];
    if (!coachName) {
      console.log('Invalid selection');
      rl.close();
      return;
    }

    rl.question(`\nHow many sessions to process (default 5): `, async (count) => {
      const maxSessions = parseInt(count) || 5;
      
      console.log(`\n🚀 Processing ${maxSessions} sessions from ${coachName}...\n`);
      
      try {
        const result = await sourceManager.processDriveSource({
          coachName,
          maxSessions
        });

        if (result.success) {
          console.log('\n✅ Processing complete!');
          console.log(`- Files scanned: ${result.results.scanned}`);
          console.log(`- Sessions processed: ${result.results.processed}`);
          console.log(`- Failed: ${result.results.failed}`);
          console.log(`- Skipped: ${result.results.skipped}`);
        } else {
          console.error('\n❌ Processing failed:', result.error);
        }
      } catch (error) {
        console.error('Error:', error.message);
      }
      
      rl.close();
    });
  });
}

async function processAllRecordings(sourceManager) {
  rl.question('\nHow many sessions to process (default 10): ', async (count) => {
    const maxSessions = parseInt(count) || 10;
    
    console.log(`\n🚀 Processing ${maxSessions} sessions from all coaches...\n`);
    
    try {
      const result = await sourceManager.processDriveSource({
        maxSessions
      });

      if (result.success) {
        console.log('\n✅ Processing complete!');
        console.log(`- Files scanned: ${result.results.scanned}`);
        console.log(`- Sessions processed: ${result.results.processed}`);
        console.log(`- Failed: ${result.results.failed}`);
        console.log(`- Skipped: ${result.results.skipped}`);
      } else {
        console.error('\n❌ Processing failed:', result.error);
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
    
    rl.close();
  });
}

async function scanCoachFolder(sourceManager) {
  const coaches = Object.keys(config.driveSource.coachFolders);
  console.log('\nAvailable coaches:');
  coaches.forEach((coach, index) => {
    console.log(`${index + 1}. ${coach}`);
  });

  rl.question('\nSelect coach number: ', async (num) => {
    const coachName = coaches[parseInt(num) - 1];
    if (!coachName) {
      console.log('Invalid selection');
      rl.close();
      return;
    }

    console.log(`\n🔍 Scanning ${coachName}'s folder...\n`);
    
    try {
      const result = await sourceManager.scanCoachFolder(coachName);
      
      console.log(`Coach: ${result.coach}`);
      console.log(`Folder ID: ${result.folderId}`);
      console.log(`Files found: ${result.filesFound}`);
      console.log(`Sessions identified: ${result.sessionsFound}`);
      
      if (result.sessions.length > 0) {
        console.log('\nSample sessions:');
        result.sessions.slice(0, 5).forEach(session => {
          console.log(`- ${session.metadata.participants?.join(' & ') || 'Unknown'} - Week ${session.metadata.week?.number || '?'}`);
        });
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
    
    rl.close();
  });
}

// Run the CLI
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});