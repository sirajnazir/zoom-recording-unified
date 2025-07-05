#!/usr/bin/env node

// Batch Process Drive Recordings - Efficient processing
const RecordingSourceManager = require('../src/services/RecordingSourceManager');
const config = require('../config');

async function batchProcessDrive() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║         Batch Process Google Drive Recordings                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════════════╝\n');

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
      logger: container.resolve('logger'),
      // Additional services for V4
      aiPoweredInsightsGenerator: container.resolve('aiPoweredInsightsGenerator'),
      outcomeExtractor: container.resolve('outcomeExtractor'),
      driveOrganizer: container.resolve('driveOrganizer'),
      enhancedMetadataExtractor: container.resolve('enhancedMetadataExtractor'),
      recordingCategorizer: container.resolve('recordingCategorizer')
    };
    
    console.log('✅ Services loaded from container');
    console.log('  Core Services:');
    console.log('  - GoogleSheetsService:', !!services.googleSheetsService);
    console.log('  - NameStandardizer:', !!services.completeSmartNameStandardizer);
    console.log('  - WeekInferencer:', !!services.smartWeekInferencer);
    console.log('  AI & Processing Services:');
    console.log('  - AI Insights Generator:', !!services.aiPoweredInsightsGenerator);
    console.log('  - Outcome Extractor:', !!services.outcomeExtractor);
    console.log('  - Drive Organizer:', !!services.driveOrganizer);
    console.log('  - Metadata Extractor:', !!services.enhancedMetadataExtractor);
    console.log('  - Recording Categorizer:', !!services.recordingCategorizer);
    console.log('');
  } catch (error) {
    console.log('⚠️  Container loading failed:', error.message);
    
    // Create services manually as fallback
    try {
      const { DualTabGoogleSheetsService } = require('../src/infrastructure/services/DualTabGoogleSheetsService');
      const { CompleteSmartNameStandardizer } = require('../src/infrastructure/services/CompleteSmartNameStandardizer');
      const { SmartWeekInferencer } = require('../src/infrastructure/services/SmartWeekInferencer');
      const AIPoweredInsightsGenerator = require('../src/infrastructure/ai/ai-powered-insights-generator');
      const { TangibleOutcomesProcessor } = require('../src/infrastructure/services/tangible-outcomes-processor');
      const DriveOrganizer = require('../src/infrastructure/services/DriveOrganizer');
      const { GoogleDriveService } = require('../src/infrastructure/services/GoogleDriveService');
      
      // Create sheets service with proper config
      services.googleSheetsService = new DualTabGoogleSheetsService({ 
        config: config,
        logger: console 
      });
      
      services.completeSmartNameStandardizer = new CompleteSmartNameStandardizer();
      services.smartWeekInferencer = new SmartWeekInferencer({ config: config });
      services.logger = console;
      
      // Create additional services for V4
      services.aiPoweredInsightsGenerator = new AIPoweredInsightsGenerator({ 
        logger: console, 
        config: config 
      });
      services.outcomeExtractor = new TangibleOutcomesProcessor();
      
      // Create Google Drive Service for DriveOrganizer
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
        config: config, 
        googleDriveService: googleDriveService,
        knowledgeBaseService: null 
      });
      
      console.log('✅ Services created manually');
      console.log('  Core Services:');
      console.log('  - GoogleSheetsService:', !!services.googleSheetsService);
      console.log('  - NameStandardizer:', !!services.completeSmartNameStandardizer);
      console.log('  - WeekInferencer:', !!services.smartWeekInferencer);
      console.log('  AI & Processing Services:');
      console.log('  - AI Insights Generator:', !!services.aiPoweredInsightsGenerator);
      console.log('  - Outcome Extractor:', !!services.outcomeExtractor);
      console.log('  - Drive Organizer:', !!services.driveOrganizer);
      console.log('');
    } catch (fallbackError) {
      console.log('⚠️  Could not create services:', fallbackError.message);
      // Continue with minimal services
    }
  }

  const sourceManager = new RecordingSourceManager(config, services);

  // Process arguments
  const args = process.argv.slice(2);
  const coachName = args[0] || 'ALL';
  const maxSessions = parseInt(args[1]) || 50;

  console.log('Configuration:');
  console.log(`- Coach: ${coachName}`);
  console.log(`- Max sessions per coach: ${maxSessions}`);
  console.log(`- Source: Google Drive Import`);
  console.log(`- Master Sheet: ${config.google.sheets.masterIndexSheetId}`);
  console.log('');

  try {
    const startTime = Date.now();
    let totalStats = {
      scanned: 0,
      processed: 0,
      failed: 0,
      skipped: 0
    };

    if (coachName === 'ALL') {
      // Process all coaches
      const coaches = Object.keys(config.driveSource.coachFolders);
      
      for (const coach of coaches) {
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📁 Processing ${coach}...`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        
        const result = await sourceManager.processDriveSource({
          coachName: coach,
          maxSessions
        });

        if (result.success) {
          console.log(`\n✅ ${coach} complete:`);
          console.log(`   Files: ${result.results.scanned} | Processed: ${result.results.processed} | Failed: ${result.results.failed} | Skipped: ${result.results.skipped}`);
          
          totalStats.scanned += result.results.scanned;
          totalStats.processed += result.results.processed;
          totalStats.failed += result.results.failed;
          totalStats.skipped += result.results.skipped;
        }
      }
    } else {
      // Process single coach
      console.log(`📁 Processing ${coachName}...\n`);
      
      const result = await sourceManager.processDriveSource({
        coachName,
        maxSessions
      });

      if (result.success) {
        totalStats = result.results;
        
        if (result.details && result.details.successful.length > 0) {
          console.log('\nSuccessfully processed:');
          result.details.successful.forEach(session => {
            // Debug: Check what we actually have
            if (!session) {
              console.log('  ✓ (Invalid session data)');
              return;
            }
            
            // Handle different session structures - sessions might be the processed objects directly
            const sessionName = session.standardizedName || 
                              session.rawName || 
                              session.metadata?.standardizedName || 
                              session.metadata?.rawName || 
                              session.topic || 
                              'Unknown Session';
            console.log(`  ✓ ${sessionName}`);
          });
        }
      } else {
        console.error(`\n❌ Processing failed: ${result.error}`);
        process.exit(1);
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    
    console.log('\n════════════════════════════════════════');
    console.log('📊 FINAL SUMMARY');
    console.log('════════════════════════════════════════');
    console.log(`Total files scanned: ${totalStats.scanned}`);
    console.log(`Sessions processed: ${totalStats.processed}`);
    console.log(`Failed: ${totalStats.failed}`);
    console.log(`Skipped (duplicates): ${totalStats.skipped}`);
    console.log(`Time taken: ${duration} seconds`);
    console.log('\n✅ All processing complete!');
    console.log(`\nView results: https://docs.google.com/spreadsheets/d/${config.google.sheets.masterIndexSheetId}`);

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Show usage
if (process.argv.includes('--help')) {
  console.log('Usage: node batch-process-drive.js [coach] [maxSessions]');
  console.log('');
  console.log('Available coaches: Jenny, Alan, Juli, Andrew');
  console.log('');
  console.log('Examples:');
  console.log('  node batch-process-drive.js           # Process all coaches, 50 sessions each');
  console.log('  node batch-process-drive.js Jenny 20  # Process 20 sessions from Jenny');
  console.log('  node batch-process-drive.js Alan 10   # Process 10 sessions from Alan');
  console.log('  node batch-process-drive.js ALL 100   # Process all coaches, 100 sessions each');
  process.exit(0);
}

batchProcessDrive().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});