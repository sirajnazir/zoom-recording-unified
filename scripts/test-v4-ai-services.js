#!/usr/bin/env node

// Quick test to verify V4 AI services are working
const config = require('../config');

async function testAIServices() {
  console.log('Testing V4 AI Services Loading...\n');
  
  try {
    // Test AI service loading
    console.log('1. Testing AIPoweredInsightsGenerator...');
    const AIPoweredInsightsGenerator = require('../src/infrastructure/ai/ai-powered-insights-generator');
    const aiService = new AIPoweredInsightsGenerator({ logger: console, config });
    console.log('✅ AIPoweredInsightsGenerator loaded successfully');
    
    // Test Outcomes Processor
    console.log('\n2. Testing TangibleOutcomesProcessor...');
    const { TangibleOutcomesProcessor } = require('../src/infrastructure/services/tangible-outcomes-processor');
    const outcomesProcessor = new TangibleOutcomesProcessor();
    console.log('✅ TangibleOutcomesProcessor loaded successfully');
    
    // Test Drive Organizer
    console.log('\n3. Testing DriveOrganizer...');
    const DriveOrganizer = require('../src/infrastructure/services/DriveOrganizer');
    const { GoogleDriveService } = require('../src/infrastructure/services/GoogleDriveService');
    const googleDriveService = new GoogleDriveService({ config, logger: console });
    const driveOrganizer = new DriveOrganizer({ 
      logger: console, 
      config, 
      googleDriveService,
      knowledgeBaseService: null 
    });
    console.log('✅ DriveOrganizer loaded successfully');
    
    // Test V4 Processor
    console.log('\n4. Testing IntegratedDriveProcessorV4...');
    const IntegratedDriveProcessorV4 = require('../src/drive-source/services/IntegratedDriveProcessorV4');
    const services = {
      googleSheetsService: { updateMasterSpreadsheet: async () => {}, checkRecordingExists: async () => ({ exists: false }) },
      completeSmartNameStandardizer: { standardizeName: async () => ({ standardizedName: 'Test', confidence: 1, method: 'test' }) },
      smartWeekInferencer: { inferWeek: async () => ({ weekNumber: '01', confidence: 1, method: 'test' }) },
      logger: console,
      aiPoweredInsightsGenerator: aiService,
      outcomeExtractor: outcomesProcessor,
      driveOrganizer: driveOrganizer
    };
    
    const processor = new IntegratedDriveProcessorV4(config, services);
    console.log('✅ IntegratedDriveProcessorV4 loaded successfully');
    console.log('\n✅ All services loaded successfully! V4 pipeline is ready.');
    
    // Show service status
    console.log('\n📊 Service Status:');
    console.log('  AI Service Provider:', aiService.activeProvider);
    console.log('  OpenAI Available:', aiService.useOpenAI);
    console.log('  Anthropic Available:', aiService.useAnthropic);
    
  } catch (error) {
    console.error('❌ Error loading services:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testAIServices();