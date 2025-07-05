#!/usr/bin/env node

// Test Full Pipeline Integration for Drive Recordings
const config = require('../config');
const RecordingSourceManager = require('../src/services/RecordingSourceManager');

async function testFullPipeline() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║        Testing Full Pipeline Integration (V4)                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════════════╝\n');

  // Enable drive source
  config.features.enableDriveSource = true;
  config.driveSource.enabled = true;
  config.driveSource.useTestFolders = false;

  // Load services from container
  let services = {};
  try {
    const { getContainer } = require('../src/container');
    const container = getContainer();
    
    // Get ALL services needed for V4
    services = {
      // Core services
      googleSheetsService: container.resolve('googleSheetsService'),
      completeSmartNameStandardizer: container.resolve('completeSmartNameStandardizer'),
      smartWeekInferencer: container.resolve('smartWeekInferencer'),
      logger: container.resolve('logger'),
      
      // AI & Processing services
      aiPoweredInsightsGenerator: container.resolve('aiPoweredInsightsGenerator'),
      outcomeExtractor: container.resolve('outcomeExtractor'),
      driveOrganizer: container.resolve('driveOrganizer'),
      enhancedMetadataExtractor: container.resolve('enhancedMetadataExtractor'),
      recordingCategorizer: container.resolve('recordingCategorizer'),
      
      // Optional services
      insightsGenerator: container.resolve('insightsGenerator'),
      relationshipAnalyzer: container.resolve('relationshipAnalyzer'),
      fileContentAnalyzer: container.resolve('fileContentAnalyzer'),
      transcriptionAnalyzer: container.resolve('transcriptionAnalyzer')
    };
    
    console.log('✅ Services loaded from container');
    console.log('\n📊 Service Status:');
    console.log('═══════════════════════════════════════');
    console.log('Core Services:');
    console.log(`  ✓ GoogleSheetsService: ${!!services.googleSheetsService ? 'Ready' : 'Missing'}`);
    console.log(`  ✓ NameStandardizer: ${!!services.completeSmartNameStandardizer ? 'Ready' : 'Missing'}`);
    console.log(`  ✓ WeekInferencer: ${!!services.smartWeekInferencer ? 'Ready' : 'Missing'}`);
    console.log(`  ✓ Logger: ${!!services.logger ? 'Ready' : 'Missing'}`);
    
    console.log('\nAI & Processing Services:');
    console.log(`  ✓ AI Insights Generator: ${!!services.aiPoweredInsightsGenerator ? 'Ready' : 'Missing'}`);
    console.log(`  ✓ Outcome Extractor: ${!!services.outcomeExtractor ? 'Ready' : 'Missing'}`);
    console.log(`  ✓ Drive Organizer: ${!!services.driveOrganizer ? 'Ready' : 'Missing'}`);
    console.log(`  ✓ Metadata Extractor: ${!!services.enhancedMetadataExtractor ? 'Ready' : 'Missing'}`);
    console.log(`  ✓ Recording Categorizer: ${!!services.recordingCategorizer ? 'Ready' : 'Missing'}`);
    
    console.log('\nOptional Services:');
    console.log(`  ✓ Insights Generator: ${!!services.insightsGenerator ? 'Ready' : 'Missing'}`);
    console.log(`  ✓ Relationship Analyzer: ${!!services.relationshipAnalyzer ? 'Ready' : 'Missing'}`);
    console.log(`  ✓ File Content Analyzer: ${!!services.fileContentAnalyzer ? 'Ready' : 'Missing'}`);
    console.log(`  ✓ Transcription Analyzer: ${!!services.transcriptionAnalyzer ? 'Ready' : 'Missing'}`);
    
  } catch (error) {
    console.log('⚠️  Container loading failed:', error.message);
    
    // Create minimal services manually
    const { DualTabGoogleSheetsService } = require('../src/infrastructure/services/DualTabGoogleSheetsService');
    const { CompleteSmartNameStandardizer } = require('../src/infrastructure/services/CompleteSmartNameStandardizer');
    const { SmartWeekInferencer } = require('../src/infrastructure/services/SmartWeekInferencer');
    const AIPoweredInsightsGenerator = require('../src/infrastructure/ai/ai-powered-insights-generator');
    const { TangibleOutcomesProcessor } = require('../src/infrastructure/services/tangible-outcomes-processor');
    const DriveOrganizer = require('../src/infrastructure/services/DriveOrganizer');
    const { GoogleDriveService } = require('../src/infrastructure/services/GoogleDriveService');
    
    services.googleSheetsService = new DualTabGoogleSheetsService({ config, logger: console });
    services.completeSmartNameStandardizer = new CompleteSmartNameStandardizer();
    services.smartWeekInferencer = new SmartWeekInferencer({ config });
    services.logger = console;
    services.aiPoweredInsightsGenerator = new AIPoweredInsightsGenerator({ logger: console, config });
    services.outcomeExtractor = new TangibleOutcomesProcessor();
    
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
    
    console.log('✅ Created minimal services manually');
  }

  console.log('\n═══════════════════════════════════════\n');

  // Create source manager
  const sourceManager = new RecordingSourceManager(config, services);

  // Process arguments
  const args = process.argv.slice(2);
  const coachName = args[0] || 'Jenny';
  const maxSessions = parseInt(args[1]) || 1; // Process just 1 session by default for testing

  console.log('🔧 Test Configuration:');
  console.log(`  Coach: ${coachName}`);
  console.log(`  Sessions to process: ${maxSessions}`);
  console.log(`  Master Sheet: ${config.google.sheets.masterIndexSheetId}`);
  console.log(`  Knowledge Base Drive: ${config.google.drive.rootFolderId}`);
  console.log('');

  try {
    const startTime = Date.now();
    
    console.log(`📁 Processing ${coachName}'s recordings...\n`);
    
    const result = await sourceManager.processDriveSource({
      coachName,
      maxSessions
    });

    if (result.success) {
      console.log('\n✅ Processing completed successfully!\n');
      console.log('📊 Summary:');
      console.log(`  Files scanned: ${result.results.scanned}`);
      console.log(`  Sessions processed: ${result.results.processed}`);
      console.log(`  Failed: ${result.results.failed}`);
      console.log(`  Skipped: ${result.results.skipped}`);
      
      if (result.details && result.details.successful.length > 0) {
        console.log('\n🎯 Processed Sessions:');
        result.details.successful.forEach((session, idx) => {
          console.log(`\n  ${idx + 1}. ${session.standardizedName || session.topic || 'Unknown'}`);
          console.log(`     - Week: ${session.weekNumber || 'Unknown'}`);
          console.log(`     - AI Insights: ${session.executiveSummary ? '✅ Generated' : '❌ Not generated'}`);
          console.log(`     - Outcomes: ${session.outcomesCount || 0} extracted`);
          console.log(`     - Drive Link: ${session.driveLink || 'Not organized'}`);
          
          // Check for AI insights fields
          if (session.executiveSummary) {
            console.log(`     - Executive Summary: ${session.executiveSummary.substring(0, 100)}...`);
          }
          if (session.keyThemes) {
            console.log(`     - Key Themes: ${session.keyThemes}`);
          }
          if (session.actionItems) {
            console.log(`     - Action Items: ${session.actionItems.substring(0, 100)}...`);
          }
        });
      }
      
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`\n⏱️  Time taken: ${duration} seconds`);
      
      console.log('\n📊 View results in Google Sheets:');
      console.log(`   https://docs.google.com/spreadsheets/d/${config.google.sheets.masterIndexSheetId}`);
      
      if (result.details?.successful?.[0]?.driveLink) {
        console.log('\n📁 View organized recording in Drive:');
        console.log(`   ${result.details.successful[0].driveLink}`);
      }
      
    } else {
      console.error(`\n❌ Processing failed: ${result.error}`);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Show usage
if (process.argv.includes('--help')) {
  console.log('Usage: node test-full-pipeline-integration.js [coach] [maxSessions]');
  console.log('');
  console.log('Tests the full V4 pipeline with AI insights and Drive organization');
  console.log('');
  console.log('Available coaches: Jenny, Alan, Juli, Andrew');
  console.log('');
  console.log('Examples:');
  console.log('  node test-full-pipeline-integration.js           # Test with 1 session from Jenny');
  console.log('  node test-full-pipeline-integration.js Alan 2    # Test with 2 sessions from Alan');
  process.exit(0);
}

testFullPipeline().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});