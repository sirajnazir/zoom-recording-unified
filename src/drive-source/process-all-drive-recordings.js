#!/usr/bin/env node

const config = require('../../config');
const RecordingSourceManager = require('../services/RecordingSourceManager');
const S3IvylevelScanner = require('./services/S3IvylevelScanner');
const RecordingMatcher = require('./services/RecordingMatcher');
const IntegratedDriveProcessor = require('./services/IntegratedDriveProcessor');

// Progress tracking
class ProgressTracker {
  constructor(total) {
    this.total = total;
    this.current = 0;
    this.successful = 0;
    this.failed = 0;
    this.skipped = 0;
    this.startTime = Date.now();
  }

  increment(status) {
    this.current++;
    if (status === 'success') this.successful++;
    else if (status === 'failed') this.failed++;
    else if (status === 'skipped') this.skipped++;
    
    this.displayProgress();
  }

  displayProgress() {
    const percentage = Math.round((this.current / this.total) * 100);
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    const rate = this.current > 0 ? (this.current / elapsed).toFixed(2) : 0;
    const eta = this.current > 0 ? Math.round((this.total - this.current) / (this.current / elapsed)) : 0;
    
    console.clear();
    console.log('=== Google Drive Recording Processing ===\n');
    console.log(`Progress: ${this.current}/${this.total} (${percentage}%)`);
    console.log(`[${this.getProgressBar(percentage)}]`);
    console.log(`\n✓ Successful: ${this.successful}`);
    console.log(`✗ Failed: ${this.failed}`);
    console.log(`⊘ Skipped: ${this.skipped}`);
    console.log(`\nElapsed: ${this.formatTime(elapsed)} | Rate: ${rate}/sec | ETA: ${this.formatTime(eta)}`);
    
    if (this.lastProcessed) {
      console.log(`\nLast processed: ${this.lastProcessed}`);
    }
  }

  getProgressBar(percentage) {
    const width = 50;
    const filled = Math.round((percentage / 100) * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
  }

  formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  setLastProcessed(name) {
    this.lastProcessed = name;
  }

  finish() {
    const totalTime = Math.round((Date.now() - this.startTime) / 1000);
    console.log('\n=== Processing Complete ===');
    console.log(`Total time: ${this.formatTime(totalTime)}`);
    console.log(`Average rate: ${(this.total / totalTime).toFixed(2)} sessions/sec`);
  }
}

async function processAllDriveRecordings() {
  console.log('=== Starting Google Drive Recording Import ===\n');
  
  try {
    // Debug config
    console.log('🔍 Debug: Config check');
    console.log('  driveSource exists:', !!config.driveSource);
    console.log('  s3IvylevelFolderId:', config.driveSource?.s3IvylevelFolderId);
    console.log('  coachFolders:', config.driveSource?.coachFolders);
    
    // Initialize services
    const scanner = new S3IvylevelScanner(config);
    const matcher = new RecordingMatcher();
    const processor = new IntegratedDriveProcessor(config);
    
    // Step 1: Scan all folders
    console.log('📁 Scanning Google Drive folders...');
    
    // First, get all coach folders from the main S3-Ivylevel folder
    const mainFolderId = config.driveSource?.s3IvylevelFolderId;
    if (!mainFolderId) {
      console.error('❌ S3-Ivylevel folder ID not configured');
      return;
    }
    
    console.log(`🔍 Using main folder ID: ${mainFolderId}`);
    const coachFolders = await scanner.getCoachFolders(mainFolderId);
    console.log(`  ✓ Found ${coachFolders.length} coach folders`);
    
    // Combine with any explicitly configured coach folders
    const allCoachFolders = [
      ...coachFolders,
      ...Object.entries(config.driveSource?.coachFolders || {}).map(([name, id]) => ({ 
        name: `Coach ${name}`, 
        id 
      }))
    ];
    
    // Remove duplicates based on folder ID
    const uniqueFolders = allCoachFolders.filter((folder, index, self) => 
      index === self.findIndex(f => f.id === folder.id)
    );
    
    console.log(`  Total unique coach folders to scan: ${uniqueFolders.length}`);

    let allFiles = [];
    for (const folder of uniqueFolders) {
      console.log(`  Scanning ${folder.name}...`);
      try {
        const files = await scanner.scanFolder(folder.id, {
          recursive: true,
          maxDepth: 5,
          minFileSize: 100 * 1024 // 100KB minimum
        });
        console.log(`  ✓ Found ${files.length} potential recording files`);
        allFiles = allFiles.concat(files);
      } catch (error) {
        console.error(`  ✗ Failed to scan ${folder.name}:`, error.message);
      }
    }
    
    console.log(`\n📊 Total files found: ${allFiles.length}`);
    
    // Step 2: Group into sessions
    console.log('\n🔄 Grouping files into sessions...');
    const sessions = await matcher.matchRecordings(allFiles);
    const { validSessions, invalidSessions } = matcher.validateSessions(sessions);
    
    console.log(`✓ Valid sessions: ${validSessions.length}`);
    console.log(`✗ Invalid sessions: ${invalidSessions.length}`);
    
    if (validSessions.length === 0) {
      console.log('\n⚠️  No valid sessions found to process.');
      return;
    }
    
    // Step 3: Process sessions with progress tracking
    console.log(`\n🚀 Processing ${validSessions.length} sessions...\n`);
    
    const progress = new ProgressTracker(validSessions.length);
    const batchSize = 2; // Reduced from 5 to 2 to avoid overwhelming the API
    
    const results = {
      successful: [],
      failed: [],
      skipped: []
    };
    
    // Process in batches
    for (let i = 0; i < validSessions.length; i += batchSize) {
      const batch = validSessions.slice(i, i + batchSize);
      console.log(`\nProcessing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(validSessions.length/batchSize)} (sessions ${i+1}-${Math.min(i+batchSize, validSessions.length)})`);
      
      const batchPromises = batch.map(async (session) => {
        try {
          // Set current session name for progress display
          const sessionName = session.folderName || session.id;
          progress.setLastProcessed(sessionName);
          
          // Initialize processor if needed
          if (!processor.dualTabGoogleSheetsService) {
            await processor.initialize();
          }
          
          // Check if already processed
          const fingerprint = processor.generateFingerprint(session);
          const isDuplicate = await processor.dualTabGoogleSheetsService?.checkDuplicate?.(fingerprint);
          
          if (isDuplicate) {
            results.skipped.push({ session, reason: 'Already processed' });
            progress.increment('skipped');
            return;
          }
          
          // Process the session
          const processedSession = await processor.processSession(session);
          results.successful.push(processedSession);
          progress.increment('success');
          
        } catch (error) {
          console.error(`❌ Failed to process session ${session.folderName || session.id}:`, error.message);
          results.failed.push({ session, error: error.message });
          progress.increment('failed');
        }
      });
      
      // Wait for batch to complete
      await Promise.all(batchPromises);
      
      // Longer delay between batches to avoid rate limits
      if (i + batchSize < validSessions.length) {
        console.log('Waiting 2 seconds before next batch...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    progress.finish();
    
    // Step 4: Generate detailed report
    console.log('\n=== Detailed Processing Report ===\n');
    
    if (results.successful.length > 0) {
      console.log('✓ Successfully Processed:');
      results.successful.slice(0, 10).forEach(session => {
        console.log(`  - ${session.recording.topic} → ${session.nameAnalysis?.standardizedName || 'No standardized name'}`);
      });
      if (results.successful.length > 10) {
        console.log(`  ... and ${results.successful.length - 10} more`);
      }
    }
    
    if (results.failed.length > 0) {
      console.log('\n✗ Failed:');
      results.failed.slice(0, 10).forEach(({ session, error }) => {
        console.log(`  - ${session.folderName || session.id}: ${error}`);
      });
      if (results.failed.length > 10) {
        console.log(`  ... and ${results.failed.length - 10} more`);
      }
    }
    
    if (results.skipped.length > 0) {
      console.log('\n⊘ Skipped:');
      console.log(`  ${results.skipped.length} sessions were already processed`);
    }
    
    // Save summary to file
    const summaryPath = `./output/drive-import-summary-${new Date().toISOString().split('T')[0]}.json`;
    await require('fs').promises.writeFile(
      summaryPath,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        statistics: {
          totalFiles: allFiles.length,
          totalSessions: sessions.length,
          validSessions: validSessions.length,
          processed: results.successful.length,
          failed: results.failed.length,
          skipped: results.skipped.length
        },
        successful: results.successful.map(s => ({
          original: s.recording.topic,
          standardized: s.nameAnalysis?.standardizedName,
          category: s.category,
          confidence: s.nameAnalysis?.confidence
        })),
        failed: results.failed
      }, null, 2)
    );
    
    console.log(`\n📄 Summary saved to: ${summaryPath}`);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  processAllDriveRecordings().catch(console.error);
}

module.exports = { processAllDriveRecordings };