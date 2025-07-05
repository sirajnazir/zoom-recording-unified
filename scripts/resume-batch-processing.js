#!/usr/bin/env node

// Resume batch processing from where it was stopped
// This uses the EXISTING batch processing code - no modifications

const { processAllRecordings } = require('./process-all-recordings');

async function resumeBatchProcessing() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║             Resume Batch Processing (Sources 1 & 2)            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('This will resume processing the remaining ~162 recordings from Zoom Cloud\n');
  console.log('⚠️  Note: Drive source processing is now available separately via:');
  console.log('   node scripts/cli-drive-source.js\n');

  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  readline.question('Resume batch processing? (yes/no): ', async (answer) => {
    readline.close();
    
    if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
      console.log('\n🚀 Resuming batch processing...\n');
      await processAllRecordings();
    } else {
      console.log('Batch processing not resumed.');
    }
  });
}

resumeBatchProcessing().catch(console.error);