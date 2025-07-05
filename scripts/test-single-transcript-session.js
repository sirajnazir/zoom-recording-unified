#!/usr/bin/env node

// Test a single session with transcript
const config = require('../config');
const RecordingSourceManager = require('../src/services/RecordingSourceManager');
const S3IvylevelScanner = require('../src/drive-source/services/S3IvylevelScanner');
const RecordingMatcher = require('../src/drive-source/services/RecordingMatcher');

async function testSingleTranscriptSession() {
  console.log('🔍 Testing Single Session with Transcript\n');

  // Enable drive source
  config.features.enableDriveSource = true;
  config.driveSource.enabled = true;
  config.driveSource.useTestFolders = false;

  // Create minimal services
  const { DualTabGoogleSheetsService } = require('../src/infrastructure/services/DualTabGoogleSheetsService');
  const { CompleteSmartNameStandardizer } = require('../src/infrastructure/services/CompleteSmartNameStandardizer');
  const { SmartWeekInferencer } = require('../src/infrastructure/services/SmartWeekInferencer');
  const AIPoweredInsightsGenerator = require('../src/infrastructure/ai/ai-powered-insights-generator');
  const { TangibleOutcomesProcessor } = require('../src/infrastructure/services/tangible-outcomes-processor');
  const DriveOrganizer = require('../src/infrastructure/services/DriveOrganizer');
  const { GoogleDriveService } = require('../src/infrastructure/services/GoogleDriveService');
  
  const services = {
    googleSheetsService: new DualTabGoogleSheetsService({ config, logger: console }),
    completeSmartNameStandardizer: new CompleteSmartNameStandardizer(),
    smartWeekInferencer: new SmartWeekInferencer({ config }),
    logger: console,
    aiPoweredInsightsGenerator: new AIPoweredInsightsGenerator({ logger: console, config }),
    outcomeExtractor: new TangibleOutcomesProcessor()
  };
  
  // Create a simple cache implementation
  const simpleCache = {
    get: async (key) => null,
    set: async (key, value, ttl) => {},
    has: async (key) => false,
    delete: async (key) => {}
  };
  
  const googleDriveService = new GoogleDriveService({ 
    config, 
    logger: console,
    cache: simpleCache,
    eventBus: null
  });
  services.driveOrganizer = new DriveOrganizer({ 
    logger: console, 
    config, 
    googleDriveService,
    knowledgeBaseService: null 
  });

  // Scan for a specific folder with transcript
  const scanner = new S3IvylevelScanner(config);
  const matcher = new RecordingMatcher();
  
  // Target the folder we know has a transcript: GamePlan_JennyDuan_Ananyaa_Wk00_2024-09-06
  console.log('📁 Scanning specific folder with transcript...');
  const files = await scanner.scanFolder('1OSyk9C57nvhAj5780I4GXOc0frdEpRDO', {
    maxDepth: 1,
    minFileSize: 1024
  });
  
  console.log(`\n✅ Found ${files.length} files:`);
  files.forEach(f => {
    console.log(`  - ${f.name} (Type: ${f.fileType || 'unknown'})`);
  });
  
  // Group into session
  const sessions = await matcher.matchRecordings(files);
  const { validSessions } = matcher.validateSessions(sessions);
  
  if (validSessions.length === 0) {
    console.error('❌ No valid sessions found!');
    return;
  }
  
  const session = validSessions[0];
  console.log('\n📊 Session details:');
  console.log(`  ID: ${session.id}`);
  console.log(`  Files: ${session.files.length}`);
  session.files.forEach(f => {
    console.log(`    - ${f.name} (${f.fileType})`);
  });
  
  // Process with V4
  console.log('\n🚀 Processing with IntegratedDriveProcessorV4...');
  const IntegratedDriveProcessorV4 = require('../src/drive-source/services/IntegratedDriveProcessorV4');
  const processor = new IntegratedDriveProcessorV4(config, services);
  
  const results = await processor.processRecordingSessions([session]);
  
  console.log('\n📊 Processing Results:');
  console.log(`  Successful: ${results.successful.length}`);
  console.log(`  Failed: ${results.failed.length}`);
  console.log(`  Skipped: ${results.skipped.length}`);
  
  if (results.successful.length > 0) {
    const processed = results.successful[0];
    console.log('\n✅ Successfully processed:');
    console.log(`  Standardized Name: ${processed.standardizedName}`);
    console.log(`  Week: ${processed.weekNumber}`);
    console.log(`  AI Insights: ${processed.executiveSummary ? 'Yes' : 'No'}`);
    console.log(`  Outcomes: ${processed.outcomesCount || 0}`);
    console.log(`  Drive Link: ${processed.driveLink}`);
    
    if (processed.executiveSummary) {
      console.log(`\n📝 Executive Summary:`);
      console.log(`  ${processed.executiveSummary.substring(0, 200)}...`);
    }
  }
}

testSingleTranscriptSession().catch(console.error);