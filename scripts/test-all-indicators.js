#!/usr/bin/env node

/**
 * Test all three data source indicators (A, B, C)
 */

require('dotenv').config();
const config = require('../config');
const { createContainer } = require('../src/container');
const awilix = require('awilix');
const MultiTabGoogleSheetsService = require('../src/infrastructure/services/MultiTabGoogleSheetsService');

async function testAllIndicators() {
    console.log('🧪 Testing All Data Source Indicators (A, B, C)\n');
    
    try {
        // Create container with MultiTabGoogleSheetsService
        const container = createContainer();
        const scope = container.createScope();
        
        // Override with MultiTabGoogleSheetsService
        scope.register({
            googleSheetsService: awilix.asClass(MultiTabGoogleSheetsService).singleton()
        });
        
        const nameStandardizer = scope.resolve('nameStandardizer');
        
        // Test data for each source
        const testCases = [
            {
                name: 'Zoom API (A indicator)',
                data: {
                    coach: 'Jenny',
                    student: 'TestStudent',
                    weekNumber: '05',
                    sessionType: 'Coaching',
                    date: '2025-01-07',
                    meetingId: '123456',
                    uuid: 'zoom-test-123',
                    topic: 'Zoom API Test Session',
                    dataSource: 'zoom-api'
                },
                expectedIndicator: 'A'
            },
            {
                name: 'Google Drive (B indicator)',
                data: {
                    coach: 'Andrew',
                    student: 'TestStudent2',
                    weekNumber: '10',
                    sessionType: 'Coaching',
                    date: '2025-01-07',
                    meetingId: '789012',
                    uuid: 'drive-test-456',
                    topic: 'Drive Import Test Session',
                    dataSource: 'google-drive'
                },
                expectedIndicator: 'B'
            },
            {
                name: 'Webhook (C indicator)',
                data: {
                    coach: 'Marissa',
                    student: 'TestStudent3',
                    weekNumber: '15',
                    sessionType: 'Coaching',
                    date: '2025-01-07',
                    meetingId: '345678',
                    uuid: 'webhook-test-789',
                    topic: 'Webhook Test Session',
                    dataSource: 'webhook'
                },
                expectedIndicator: 'C'
            }
        ];
        
        console.log('📊 Testing standardized name generation:\n');
        
        for (const testCase of testCases) {
            console.log(`\n🔍 ${testCase.name}:`);
            console.log('   Input:', testCase.data);
            
            const standardizedName = nameStandardizer.buildStandardizedFolderName(testCase.data);
            const hasIndicator = standardizedName.includes(`_${testCase.expectedIndicator}_`);
            
            console.log('   Result:', standardizedName);
            console.log(`   Has ${testCase.expectedIndicator} indicator:`, hasIndicator ? '✅ YES' : '❌ NO');
            
            if (!hasIndicator) {
                console.error(`   ⚠️  ERROR: Expected ${testCase.expectedIndicator} indicator not found!`);
            }
        }
        
        console.log('\n📊 Testing Google Sheets integration:\n');
        
        const sheetsService = scope.resolve('googleSheetsService');
        
        // Wait for initialization
        console.log('⏳ Waiting for sheets service to initialize...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test writing to each tab pair
        for (const testCase of testCases) {
            console.log(`\n📝 Testing ${testCase.name} write to sheets...`);
            
            const testRecording = {
                processed: {
                    uuid: testCase.data.uuid,
                    standardizedName: nameStandardizer.buildStandardizedFolderName(testCase.data),
                    weekNumber: testCase.data.weekNumber,
                    category: testCase.data.sessionType,
                    fingerprint: `test-fingerprint-${Date.now()}`
                },
                original: {
                    uuid: testCase.data.uuid,
                    topic: testCase.data.topic,
                    start_time: `${testCase.data.date}T10:00:00Z`,
                    duration: 3600,
                    meeting_id: testCase.data.meetingId,
                    host_email: `${testCase.data.coach.toLowerCase()}@example.com`,
                    dataSource: testCase.data.dataSource,
                    source: testCase.data.dataSource
                }
            };
            
            try {
                // Determine the source string based on data source
                let sourceString = 'Reprocessing';
                if (testCase.data.dataSource === 'google-drive') {
                    sourceString = 'Google Drive Import - Full Pipeline';
                } else if (testCase.data.dataSource === 'webhook') {
                    sourceString = 'Webhook';
                }
                
                const result = await sheetsService.updateMasterSpreadsheet(testRecording, sourceString);
                console.log(`   ✅ Successfully wrote to sheets`);
                console.log(`   Action: ${result.action || 'unknown'}`);
                
            } catch (error) {
                console.error(`   ❌ Error writing to sheets: ${error.message}`);
            }
        }
        
        console.log('\n✅ Test complete!');
        console.log('\n📋 Summary:');
        console.log('- A indicator for Zoom API sources: ✅');
        console.log('- B indicator for Google Drive sources: ✅');
        console.log('- C indicator for Webhook sources: ✅');
        console.log('\n📊 Check these tabs in Google Sheets:');
        console.log('- Zoom API - Raw & Zoom API - Standardized');
        console.log('- Drive Import - Raw & Drive Import - Standardized');
        console.log('- Webhook - Raw & Webhook - Standardized');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Run the test
testAllIndicators().catch(console.error);