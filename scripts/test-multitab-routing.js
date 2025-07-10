#!/usr/bin/env node
/**
 * Test MultiTabGoogleSheetsService routing for Drive Import
 */

require('dotenv').config();
const { createContainer } = require('../src/container');
const MultiTabGoogleSheetsService = require('../src/infrastructure/services/MultiTabGoogleSheetsService');
const awilix = require('awilix');

async function testMultiTabRouting() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║          Test MultiTabGoogleSheetsService Routing              ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    try {
        // Initialize container
        const container = createContainer();
        const scope = container.createScope();
        
        // Override with MultiTabGoogleSheetsService
        scope.register({
            googleSheetsService: awilix.asClass(MultiTabGoogleSheetsService).singleton()
        });
        
        console.log('🔧 Initializing MultiTabGoogleSheetsService...');
        const sheetsService = scope.resolve('googleSheetsService');
        
        // Wait for initialization
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Create a test Drive Import recording
        const testRecording = {
            processed: {
                uuid: 'test-drive-' + Date.now(),
                standardizedName: 'Coaching_B_TestCoach_TestStudent_Wk01_2025-01-07_M_testidU_testid',
                weekNumber: '01',
                category: 'Coaching',
                fingerprint: 'test-fingerprint-' + Date.now()
            },
            original: {
                uuid: 'test-drive-' + Date.now(),
                topic: 'Test Drive Import Recording',
                start_time: '2025-01-07T10:00:00Z',
                duration: 3600,
                meeting_id: 'test-meeting-id',
                host_email: 'testcoach@example.com',
                dataSource: 'google-drive',
                source: 'Google Drive Import - Full Pipeline',
                driveFileId: 'test-drive-file-id'
            }
        };
        
        console.log('\n📊 Test Recording:');
        console.log(`   UUID: ${testRecording.original.uuid}`);
        console.log(`   Standardized Name: ${testRecording.processed.standardizedName}`);
        console.log(`   Data Source: ${testRecording.original.dataSource}`);
        console.log(`   Source String: ${testRecording.original.source}`);
        console.log(`   Has B indicator: ${testRecording.processed.standardizedName.includes('_B_') ? 'YES ✅' : 'NO ❌'}`);
        
        console.log('\n🔄 Calling updateMasterSpreadsheet...');
        
        try {
            const result = await sheetsService.updateMasterSpreadsheet(
                testRecording, 
                'Google Drive Import - Full Pipeline'
            );
            
            console.log('\n✅ Update successful!');
            console.log(`   Action: ${result.action || 'unknown'}`);
            console.log(`   Tabs updated: ${result.tabsUpdated || 'unknown'}`);
            
            console.log('\n📊 Expected behavior:');
            console.log('   1. Recording should appear in "Drive Import - Raw" tab');
            console.log('   2. Recording should appear in "Drive Import - Standardized" tab');
            console.log('   3. Recording should NOT appear in other data source tabs');
            
        } catch (error) {
            console.error('\n❌ Update failed:', error.message);
            console.error('Stack:', error.stack);
        }
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

console.log('🚀 Starting MultiTabGoogleSheetsService routing test...\n');

testMultiTabRouting()
    .then(() => {
        console.log('\n✅ Test completed successfully');
        console.log('\n💡 Run this to verify:');
        console.log('   node scripts/check-drive-import-status.js');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    });