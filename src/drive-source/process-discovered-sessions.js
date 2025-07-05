const IntegratedDriveProcessor = require('./services/IntegratedDriveProcessor');
const config = require('../../config');
const fs = require('fs').promises;

class DiscoveredSessionsProcessor {
  constructor(config, options = {}) {
    this.config = config;
    this.batchSize = options.batchSize || 3;
    this.delayBetweenBatches = options.delayBetweenBatches || 2000;
    this.startFromIndex = options.startFromIndex || 0;
    this.maxSessions = options.maxSessions || 50;
    this.sessionsFile = options.sessionsFile || 'discovered-sessions.json';
  }

  async process() {
    console.log('=== Process Discovered Sessions (Zoom-Consistent) ===\n');
    
    try {
      // Load discovered sessions
      console.log(`📂 Loading sessions from ${this.sessionsFile}...`);
      const sessionsData = JSON.parse(await fs.readFile(this.sessionsFile, 'utf8'));
      const allSessions = sessionsData.sessions;
      
      console.log(`Found ${allSessions.length} total sessions`);
      console.log(`Discovered at: ${sessionsData.discoveredAt}`);
      
      // Create processor (uses same services as Zoom batch processing)
      const processor = new IntegratedDriveProcessor(config);
      await processor.initialize();
      console.log('✅ Processor initialized (using Zoom-consistent services)');
      
      // Get sessions to process
      const sessionsToProcess = allSessions.slice(this.startFromIndex, this.startFromIndex + this.maxSessions);
      console.log(`🚀 Processing ${sessionsToProcess.length} sessions (${this.startFromIndex + 1}-${this.startFromIndex + sessionsToProcess.length} of ${allSessions.length})`);
      
      const results = {
        successful: [],
        failed: [],
        skipped: []
      };
      
      // Process in batches (same batching logic as Zoom processing)
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
            // Check if already processed (same duplicate check as Zoom processing)
            const fingerprint = processor.generateFingerprint(session);
            const isDuplicate = await processor.dualTabGoogleSheetsService?.checkDuplicate?.(fingerprint);
            
            if (isDuplicate) {
              console.log(`    ⊘ Skipped (duplicate)`);
              results.skipped.push({ session, reason: 'Already processed' });
              return;
            }
            
            // Process the session (uses same IntegratedDriveProcessor as Zoom)
            const processedSession = await processor.processSession(session);
            console.log(`    ✅ Success: ${processedSession.rawName}`);
            console.log(`       Standardized: ${processedSession.nameAnalysis?.standardizedName || 'N/A'}`);
            console.log(`       Category: ${processedSession.category || 'N/A'}`);
            results.successful.push(processedSession);
            
          } catch (error) {
            console.error(`    ❌ Failed: ${error.message}`);
            results.failed.push({ session, error: error.message });
          }
        });
        
        // Wait for batch to complete
        await Promise.all(batchPromises);
        
        // Delay between batches (same rate limiting as Zoom processing)
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
        console.log('   These will be processed with the same standardization and logic as Zoom recordings.');
      }
      
      // Show next batch info
      const nextStartIndex = this.startFromIndex + this.maxSessions;
      if (nextStartIndex < allSessions.length) {
        console.log(`\n📋 To continue processing, run:`);
        console.log(`   node src/drive-source/process-discovered-sessions.js --startFrom ${nextStartIndex} --maxSessions ${this.maxSessions}`);
        console.log(`   (${allSessions.length - nextStartIndex} sessions remaining)`);
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
  } else if (key === '--file') {
    options.sessionsFile = value;
  }
}

// Run the processor
const processor = new DiscoveredSessionsProcessor(config, options);
processor.process(); 