#!/usr/bin/env node

/**
 * Direct test of MultiTabGoogleSheetsService
 */

require('dotenv').config();
const config = require('../config');
const MultiTabGoogleSheetsService = require('../src/infrastructure/services/MultiTabGoogleSheetsService');

async function testMultiTabDirect() {
    console.log('🧪 Testing MultiTabGoogleSheetsService directly\n');
    
    try {
        // Create service instance with all required dependencies
        const { EventBus } = require('../src/shared/EventBus');
        const { Logger } = require('../src/shared/Logger');
        const { Cache } = require('../src/shared/Cache');
        const { MetricsCollector } = require('../src/shared/MetricsCollector');
        
        const service = new MultiTabGoogleSheetsService({ 
            config,
            eventBus: new EventBus(),
            logger: new Logger('MultiTabGoogleSheetsService'),
            cache: new Cache(),
            metricsCollector: new MetricsCollector()
        });
        
        // Create test data
        const testRecording = {
            processed: {
                uuid: 'test-drive-' + Date.now(),
                standardizedName: 'Coaching_B_TestCoach_TestStudent_Wk05_2025-01-07',
                weekNumber: 5,
                category: 'Coaching',
                fingerprint: 'test-fingerprint-' + Date.now()
            },
            original: {
                uuid: 'test-drive-' + Date.now(),
                topic: 'Test Drive Recording',
                start_time: '2025-01-07T10:00:00Z',
                duration: 3600,
                meeting_id: '123456',
                host_email: 'test@example.com',
                dataSource: 'google-drive'
            }
        };
        
        console.log('📊 Attempting to update with:');
        console.log('   Source: Google Drive Import - Full Pipeline');
        console.log('   Data source in original:', testRecording.original.dataSource);
        console.log('   Standardized name:', testRecording.processed.standardizedName);
        console.log('   Has B indicator:', testRecording.processed.standardizedName.includes('_B_'));
        
        // Log to see what's happening in the service
        console.log('\n🔍 Debugging data source detection...');
        
        // Wait for service to initialize
        console.log('⏳ Waiting for service to initialize...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Try to update
        const result = await service.updateMasterSpreadsheet(testRecording, 'Google Drive Import - Full Pipeline');
        
        console.log('\n✅ Update successful!');
        console.log('   Result:', result);
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Run the test
testMultiTabDirect().catch(console.error);