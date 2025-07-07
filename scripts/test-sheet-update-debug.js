#!/usr/bin/env node
/**
 * Debug script to test Google Sheets update functionality
 */

require('dotenv').config();
const path = require('path');

async function testSheetUpdate() {
    console.log('🔍 Testing Google Sheets Update Functionality\n');
    
    try {
        // Load the MultiTabGoogleSheetsService
        const MultiTabGoogleSheetsService = require('../src/infrastructure/services/MultiTabGoogleSheetsService');
        
        // Create test configuration
        const config = {
            google: {
                sheets: {
                    masterIndexSheetId: process.env.GOOGLE_SHEETS_MASTER_INDEX_ID
                },
                serviceAccountJson: JSON.parse(
                    Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf-8')
                )
            },
            SHEETS_BATCH_SIZE: 100,
            SHEETS_RATE_LIMIT_DELAY: 100
        };
        
        // Initialize the service
        console.log('📊 Initializing MultiTabGoogleSheetsService...');
        const sheetsService = new MultiTabGoogleSheetsService({
            config,
            logger: console,
            nameStandardizer: null,
            weekInferencer: null,
            metadataExtractor: null,
            transcriptionAnalyzer: null
        });
        
        // Wait for initialization
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test checkRecordingExists method
        console.log('\n✅ Testing checkRecordingExists method...');
        const testUuid = 'test-uuid-12345';
        const result = await sheetsService.checkRecordingExists(testUuid);
        console.log('Result:', result);
        
        // Create a test recording
        const testRecording = {
            uuid: 'test-' + Date.now(),
            id: 'test-meeting-' + Date.now(),
            topic: 'Test Recording for Debug',
            start_time: new Date().toISOString(),
            duration: 3600,
            host_email: 'test@example.com',
            host_name: 'Test Host',
            participant_count: 2,
            file_size: 1000000,
            processedData: {
                standardizedName: 'GamePlan_Jenny_TestStudent_Wk01_2025-01-07',
                weekNumber: 1,
                weekConfidence: 100,
                weekInferenceMethod: 'test',
                nameAnalysis: {
                    confidence: 100,
                    method: 'test',
                    components: {
                        coach: 'Jenny',
                        student: 'TestStudent'
                    }
                }
            }
        };
        
        console.log('\n📝 Testing addRecording with test data...');
        console.log('Data source: google-drive');
        console.log('Standardized name:', testRecording.processedData.standardizedName);
        
        try {
            const addResult = await sheetsService.addRecording(testRecording, 'google-drive');
            console.log('✅ Add recording result:', addResult);
        } catch (error) {
            console.error('❌ Failed to add recording:', error.message);
            console.error('Stack:', error.stack);
        }
        
        // Test updateMasterSpreadsheet method (legacy)
        console.log('\n📝 Testing updateMasterSpreadsheet method...');
        const processedRecordingWrapper = {
            processed: {
                ...testRecording,
                ...testRecording.processedData,
                dataSource: 'google-drive'
            },
            original: testRecording
        };
        
        try {
            const updateResult = await sheetsService.updateMasterSpreadsheet(
                processedRecordingWrapper,
                'Google Drive Import - Full Pipeline'
            );
            console.log('✅ Update result:', updateResult);
        } catch (error) {
            console.error('❌ Failed to update master spreadsheet:', error.message);
            console.error('Stack:', error.stack);
        }
        
        // Check tab statistics
        console.log('\n📊 Checking data source statistics...');
        const stats = await sheetsService.getDataSourceStats();
        console.log('Stats:', JSON.stringify(stats, null, 2));
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Run the test
testSheetUpdate().catch(console.error);