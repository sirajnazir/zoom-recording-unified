#!/usr/bin/env node

// Limited version for testing - processes only a few sessions

const config = require('../../config');
const S3IvylevelScanner = require('./services/S3IvylevelScanner');
const RecordingMatcher = require('./services/RecordingMatcher');
const IntegratedDriveProcessor = require('./services/IntegratedDriveProcessor');

class LimitedBatchProcessor {
  constructor(config, options = {}) {
    this.config = config;
    this.batchSize = options.batchSize || 3;
    this.delayBetweenBatches = options.delayBetweenBatches || 3000; // 3 seconds
    this.maxSessions = options.maxSessions || 50; // Process max 50 sessions
    this.startFromIndex = options.startFromIndex || 0;
  }

  async process() {
    console.log('=== Limited Drive Import Processor ===\n');
    
    try {
      // Create services
      const scanner = new S3IvylevelScanner(this.config);
      const matcher = new RecordingMatcher();
      const processor = new IntegratedDriveProcessor(this.config);
      
      // Initialize processor
      await processor.initialize();
      console.log('✅ Processor initialized');
      
      // Get coach folders
      const coachFolders = await scanner.getCoachFolders();
      console.log(`Found ${coachFolders.length} coach folders`);
      
      if (coachFolders.length === 0) {
        console.log('No coach folders found');
        return;
      }
      
      // Scan all folders
      console.log('\n🔍 Scanning all coach folders...');
      const allFiles = [];
      
      for (const folder of coachFolders) {
        console.log(`Scanning ${folder.name}...`);
        const files = await scanner.scanFolder(folder.id, {
          recursive: true,
          maxDepth: 5,
          minFileSize: 100 * 1024
        });
        allFiles.push(...files);
        console.log(`  Found ${files.length} files`);
      }
      
      console.log(`\nTotal files found: ${allFiles.length}`);
      
      if (allFiles.length === 0) {
        console.log('No files found');
        return;
      }
      
      // Group into sessions
      console.log('\nGrouping files into sessions...');
      const sessions = await matcher.matchRecordings(allFiles);
      const { validSessions, invalidSessions } = matcher.validateSessions(sessions);
      
      console.log(`Valid sessions: ${validSessions.length}`);
      console.log(`Invalid sessions: ${invalidSessions.length}`);
      
      if (validSessions.length === 0) {
        console.log('No valid sessions found');
        return;
      }
      
      // Limit sessions to process
      const sessionsToProcess = validSessions.slice(this.startFromIndex, this.startFromIndex + this.maxSessions);
      console.log(`\n🚀 Processing ${sessionsToProcess.length} sessions (${this.startFromIndex + 1}-${this.startFromIndex + sessionsToProcess.length} of ${validSessions.length})`);
      
      const results = {
        successful: [],
        failed: [],
        skipped: []
      };
      
      // Process in small batches
      for (let i = 0; i < sessionsToProcess.length; i += this.batchSize) {
        const batch = sessionsToProcess.slice(i, i + this.batchSize);
        const batchNumber = Math.floor(i / this.batchSize) + 1;
        const totalBatches = Math.ceil(sessionsToProcess.length / this.batchSize);
        
        console.log(`\n📦 Processing batch ${batchNumber}/${totalBatches} (sessions ${i + 1}-${Math.min(i + this.batchSize, sessionsToProcess.length)})`);
        
        const batchPromises = batch.map(async (session, batchIndex) => {
          const sessionIndex = i + batchIndex + 1;
          const sessionName = session.folderName || session.id;
          
          console.log(`  [${sessionIndex}] Processing: ${sessionName}`);
          
          try {
            // Check if already processed
            const fingerprint = processor.generateFingerprint(session);
            const isDuplicate = await processor.dualTabGoogleSheetsService?.checkDuplicate?.(fingerprint);
            
            if (isDuplicate) {
              console.log(`    ⊘ Skipped (duplicate)`);
              results.skipped.push({ session, reason: 'Already processed' });
              return;
            }
            
            // Process the session
            const processedSession = await processor.processSession(session);
            console.log(`    ✅ Success: ${processedSession.rawName}`);
            results.successful.push(processedSession);
            
          } catch (error) {
            console.error(`    ❌ Failed: ${error.message}`);
            results.failed.push({ session, error: error.message });
          }
        });
        
        // Wait for batch to complete
        await Promise.all(batchPromises);
        
        // Delay between batches
        if (i + this.batchSize < sessionsToProcess.length) {
          console.log(`\n⏳ Waiting ${this.delayBetweenBatches/1000} seconds before next batch...`);
          await new Promise(resolve => setTimeout(resolve, this.delayBetweenBatches));
        }
      }
      
      // Summary
      console.log('\n=== Summary ===');
      console.log(`✓ Successful: ${results.successful.length}`);
      console.log(`✗ Failed: ${results.failed.length}`);
      console.log(`⊘ Skipped: ${results.skipped.length}`);
      
      if (results.successful.length > 0) {
        console.log('\n✅ Check your Google Sheet for new rows!');
        console.log('   Look for rows with "Google Drive Import" in the dataSource column.');
      }
      
      // Show next batch info
      const nextStartIndex = this.startFromIndex + this.maxSessions;
      if (nextStartIndex < validSessions.length) {
        console.log(`\n📋 To continue processing, run:`);
        console.log(`   node src/drive-source/process-drive-limited.js --startFrom ${nextStartIndex}`);
        console.log(`   (${validSessions.length - nextStartIndex} sessions remaining)`);
      }
      
    } catch (error) {
      console.error('❌ Processing failed:', error.message);
      console.error('Stack:', error.stack);
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i += 2) {
  const key = args[i];
  const value = args[i + 1];
  
  if (key === '--startFrom') {
    options.startFromIndex = parseInt(value);
  } else if (key === '--batchSize') {
    options.batchSize = parseInt(value);
  } else if (key === '--maxSessions') {
    options.maxSessions = parseInt(value);
  } else if (key === '--delay') {
    options.delayBetweenBatches = parseInt(value);
  }
}

// Run the processor
const processor = new LimitedBatchProcessor(config, options);
processor.process();