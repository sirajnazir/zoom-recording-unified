#!/usr/bin/env node

const path = require('path');
const fs = require('fs').promises;
const S3IvylevelScanner = require('../../src/drive-source/services/S3IvylevelScanner');
const RecordingMatcher = require('../../src/drive-source/services/RecordingMatcher');
const DriveRecordingProcessor = require('../../src/drive-source/services/DriveRecordingProcessor');
const s3IvylevelConfig = require('../../src/drive-source/config/s3-ivylevel-config');

// Load main configuration and merge with S3-Ivylevel config
const mainConfig = require('../../config');
const config = {
  ...mainConfig,
  s3Ivylevel: s3IvylevelConfig
};

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║      S3-Ivylevel Google Drive Recording Processor              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.log('📁 Target: S3-Ivylevel-GDrive-Session-Recordings');
  console.log(`📍 Folder ID: ${s3IvylevelConfig.rootFolderId}`);
  console.log('🔍 This tool will intelligently scan, analyze, and reorganize');
  console.log('   fragmented recordings using S3-Ivylevel specific patterns.\n');

  // Get folder ID from command line or use S3-Ivylevel default
  const targetFolderId = process.argv[2] || s3IvylevelConfig.rootFolderId;
  
  // Options for different scan modes
  const scanMode = process.argv[3] || 'full'; // full, quick, or test
  
  const scanOptions = {
    full: {
      ...s3IvylevelConfig.scanning,
      maxDepth: 7,
      generateReport: true
    },
    quick: {
      ...s3IvylevelConfig.scanning,
      maxDepth: 3,
      maxFilesPerBatch: 100
    },
    test: {
      ...s3IvylevelConfig.scanning,
      maxDepth: 2,
      maxFilesPerBatch: 20
    }
  };

  console.log(`📊 Scan mode: ${scanMode.toUpperCase()}`);
  console.log(`⚙️  Settings: Max depth=${scanOptions[scanMode].maxDepth}, Batch size=${scanOptions[scanMode].maxFilesPerBatch || 'unlimited'}\n`);

  try {
    // Step 1: Intelligent Scanning with Pattern Learning
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 1: INTELLIGENT FOLDER SCANNING');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const scanner = new S3IvylevelScanner(config);
    const files = await scanner.scanFolder(targetFolderId, scanOptions[scanMode]);
    
    console.log(`\n✅ Found ${files.length} potential recording files`);

    if (files.length === 0) {
      console.log('❌ No recording files found. Exiting.');
      return;
    }

    // Display file type distribution
    const fileTypeStats = files.reduce((acc, file) => {
      acc[file.fileType] = (acc[file.fileType] || 0) + 1;
      return acc;
    }, {});
    
    console.log('\n📈 File Type Distribution:');
    Object.entries(fileTypeStats).forEach(([type, count]) => {
      console.log(`   ${type}: ${count} files`);
    });

    // Step 2: Advanced Pattern-Based Grouping
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 2: INTELLIGENT GROUPING');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Use scanner's grouping first
    const scannerGroups = await scanner.discoverRecordingGroups(files);
    scanner.generateReport(scannerGroups);

    // Then apply advanced matching
    console.log('\n🔬 Applying advanced matching algorithms...');
    const matcher = new RecordingMatcher();
    const sessions = await matcher.matchRecordings(files);
    
    // Validate and categorize sessions
    const { validSessions, invalidSessions } = matcher.validateSessions(sessions);
    
    // Categorize by confidence
    const categorizedSessions = {
      high: validSessions.filter(s => s.confidence >= s3IvylevelConfig.confidence.high),
      medium: validSessions.filter(s => s.confidence >= s3IvylevelConfig.confidence.medium && s.confidence < s3IvylevelConfig.confidence.high),
      low: validSessions.filter(s => s.confidence >= s3IvylevelConfig.confidence.low && s.confidence < s3IvylevelConfig.confidence.medium),
      veryLow: validSessions.filter(s => s.confidence < s3IvylevelConfig.confidence.low)
    };

    console.log('\n📊 Session Confidence Distribution:');
    console.log(`   🟢 High confidence (≥${s3IvylevelConfig.confidence.high}%): ${categorizedSessions.high.length} sessions`);
    console.log(`   🟡 Medium confidence (${s3IvylevelConfig.confidence.medium}-${s3IvylevelConfig.confidence.high - 1}%): ${categorizedSessions.medium.length} sessions`);
    console.log(`   🟠 Low confidence (${s3IvylevelConfig.confidence.low}-${s3IvylevelConfig.confidence.medium - 1}%): ${categorizedSessions.low.length} sessions`);
    console.log(`   🔴 Very low confidence (<${s3IvylevelConfig.confidence.low}%): ${categorizedSessions.veryLow.length} sessions`);
    console.log(`   ❌ Invalid sessions: ${invalidSessions.length}`);

    // Generate detailed matching report
    matcher.generateMatchingReport(validSessions);

    // Step 3: User Confirmation and Processing Options
    if (validSessions.length === 0) {
      console.log('\n❌ No valid sessions to process. Exiting.');
      return;
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 3: PROCESSING OPTIONS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Show processing options
    console.log('🔧 Processing Options:');
    console.log('1. Process all sessions');
    console.log('2. Process only high confidence sessions');
    console.log('3. Process high and medium confidence sessions');
    console.log('4. Review sessions before processing');
    console.log('5. Export session list and exit');
    console.log('6. Cancel\n');

    const option = await new Promise(resolve => {
      readline.question('Select option (1-6): ', resolve);
    });

    let sessionsToProcess = [];
    
    switch (option) {
      case '1':
        sessionsToProcess = validSessions;
        break;
      case '2':
        sessionsToProcess = categorizedSessions.high;
        break;
      case '3':
        sessionsToProcess = [...categorizedSessions.high, ...categorizedSessions.medium];
        break;
      case '4':
        // Interactive review
        console.log('\n📋 Session Review Mode');
        for (const session of validSessions.slice(0, 10)) {
          console.log(`\n━━━ Session ${session.id} ━━━`);
          console.log(`Confidence: ${session.confidence}%`);
          console.log(`Files: ${session.files.length}`);
          session.files.forEach(f => console.log(`  - ${f.name}`));
          
          const include = await new Promise(resolve => {
            readline.question('Include this session? (y/n/stop): ', resolve);
          });
          
          if (include.toLowerCase() === 'stop') break;
          if (include.toLowerCase() === 'y') sessionsToProcess.push(session);
        }
        break;
      case '5':
        // Export and exit
        const exportFile = `s3-ivylevel-sessions-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        await fs.writeFile(
          path.join(__dirname, exportFile),
          JSON.stringify({
            scanDate: new Date().toISOString(),
            targetFolder: targetFolderId,
            stats: {
              filesScanned: files.length,
              sessionsFound: sessions.length,
              validSessions: validSessions.length,
              ...categorizedSessions
            },
            sessions: validSessions
          }, null, 2)
        );
        console.log(`\n✅ Session list exported to: ${exportFile}`);
        readline.close();
        return;
      case '6':
      default:
        console.log('\n❌ Processing cancelled.');
        readline.close();
        return;
    }

    readline.close();

    if (sessionsToProcess.length === 0) {
      console.log('\n❌ No sessions selected for processing.');
      return;
    }

    // Step 4: Process Selected Sessions
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 4: PROCESSING RECORDINGS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`🚀 Processing ${sessionsToProcess.length} sessions...`);

    const processor = new DriveRecordingProcessor(config);
    
    // Process in batches
    const batchSize = s3IvylevelConfig.processing.batchSize;
    const results = {
      successful: [],
      failed: [],
      skipped: []
    };

    for (let i = 0; i < sessionsToProcess.length; i += batchSize) {
      const batch = sessionsToProcess.slice(i, i + batchSize);
      console.log(`\n📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(sessionsToProcess.length/batchSize)}`);
      
      const batchResults = await processor.processRecordingSessions(batch);
      results.successful.push(...batchResults.successful);
      results.failed.push(...batchResults.failed);
      results.skipped.push(...batchResults.skipped);
    }

    // Final Summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                        FINAL SUMMARY                           ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    console.log(`✅ Successfully processed: ${results.successful.length} sessions`);
    console.log(`❌ Failed: ${results.failed.length} sessions`);
    console.log(`⏭️  Skipped (duplicates): ${results.skipped.length} sessions`);

    // Calculate file statistics
    const totalFilesProcessed = results.successful.reduce((sum, s) => 
      sum + s.reorganizedFiles.files.length, 0
    );
    console.log(`\n📁 Total files reorganized: ${totalFilesProcessed}`);

    // Save comprehensive results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsFile = path.join(__dirname, `s3-ivylevel-results-${timestamp}.json`);
    
    await fs.writeFile(
      resultsFile,
      JSON.stringify({
        processingDate: new Date().toISOString(),
        targetFolder: targetFolderId,
        scanMode: scanMode,
        statistics: {
          filesScanned: files.length,
          sessionsFound: sessions.length,
          validSessions: validSessions.length,
          sessionsProcessed: sessionsToProcess.length,
          successful: results.successful.length,
          failed: results.failed.length,
          skipped: results.skipped.length,
          totalFilesReorganized: totalFilesProcessed
        },
        confidence: {
          high: categorizedSessions.high.length,
          medium: categorizedSessions.medium.length,
          low: categorizedSessions.low.length,
          veryLow: categorizedSessions.veryLow.length
        },
        results: results
      }, null, 2)
    );

    console.log(`\n📄 Detailed results saved to: ${resultsFile}`);

    // Generate human-readable report
    if (s3IvylevelConfig.processing.generateReports) {
      const reportFile = path.join(__dirname, `s3-ivylevel-report-${timestamp}.txt`);
      await generateHumanReadableReport(reportFile, {
        scanDate: new Date().toISOString(),
        targetFolder: targetFolderId,
        files, sessions, validSessions, results, categorizedSessions
      });
      console.log(`📊 Human-readable report saved to: ${reportFile}`);
    }

  } catch (error) {
    console.error('\n❌ Error during processing:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

async function generateHumanReadableReport(filepath, data) {
  const report = `
S3-IVYLEVEL RECORDING PROCESSING REPORT
======================================
Generated: ${new Date().toISOString()}
Target Folder: ${data.targetFolder}

SCANNING SUMMARY
---------------
Total Files Scanned: ${data.files.length}
Recording Sessions Found: ${data.sessions.length}
Valid Sessions: ${data.validSessions.length}

CONFIDENCE DISTRIBUTION
----------------------
High Confidence (≥80%): ${data.categorizedSessions.high.length}
Medium Confidence (60-79%): ${data.categorizedSessions.medium.length}
Low Confidence (40-59%): ${data.categorizedSessions.low.length}
Very Low Confidence (<40%): ${data.categorizedSessions.veryLow.length}

PROCESSING RESULTS
-----------------
Successfully Processed: ${data.results.successful.length}
Failed: ${data.results.failed.length}
Skipped (Duplicates): ${data.results.skipped.length}

TOP ISSUES (if any)
------------------
${data.results.failed.slice(0, 10).map(f => `- ${f.session.id}: ${f.error}`).join('\n') || 'No failures recorded'}

SAMPLE PROCESSED SESSIONS
------------------------
${data.results.successful.slice(0, 5).map(s => `
Session: ${s.metadata.standardizedName}
- Original Files: ${s.originalFiles.length}
- Confidence: ${s.confidence}%
- Target Folder: ${s.targetFolder}
`).join('\n')}
`;

  await fs.writeFile(filepath, report);
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});