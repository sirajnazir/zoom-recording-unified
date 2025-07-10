#!/usr/bin/env node

/**
 * Debug what's being sent to Google Sheets
 */

require('dotenv').config();
const config = require('../config');
const { createContainer } = require('../src/container');
const IntegratedDriveProcessorV4 = require('../src/drive-source/services/IntegratedDriveProcessorV4');

// We'll patch it after loading the service
const { DualTabGoogleSheetsService } = require('../src/infrastructure/services/DualTabGoogleSheetsService');

async function debugSingleUpdate() {
    console.log('🐛 Debug Sheets Update\n');
    
    try {
        // Create minimal test data
        const testRecording = {
            id: 'test-123',
            uuid: 'test-uuid-123',
            topic: 'Test Recording',
            start_time: '2025-01-07T10:00:00Z',
            duration: 3600,
            meeting_id: '123456',
            host_email: 'test@example.com',
            participant_count: 2,
            recording_type: 'cloud_recording',
            file_size: 1000000,
            dataSource: 'google-drive'
        };
        
        const container = createContainer();
        const scope = container.createScope();
        
        const services = {
            googleSheetsService: scope.resolve('googleSheetsService'),
            nameStandardizer: scope.resolve('nameStandardizer'),
            completeSmartNameStandardizer: scope.resolve('nameStandardizer')
        };
        
        // Test the standardizer directly
        const standardizer = services.completeSmartNameStandardizer;
        const testData = {
            coach: 'Jenny',
            student: 'TestStudent',
            weekNumber: '05',
            sessionType: 'Coaching',
            date: '2025-01-07',
            meetingId: '123456',
            uuid: 'test-uuid-123',
            topic: 'Test Session',
            dataSource: 'google-drive'
        };
        
        console.log('Testing standardizer with:', testData);
        const standardizedName = standardizer.buildStandardizedFolderName(testData);
        console.log('Result:', standardizedName);
        console.log('Has B indicator:', standardizedName.includes('_B_') ? '✅ YES' : '❌ NO');
        
        // Now test the sheets update
        console.log('\n📊 Testing Sheets Update...');
        const processedData = {
            standardizedName: standardizedName,
            weekNumber: 5,
            category: 'Coaching',
            uuid: 'test-uuid-123',
            fingerprint: 'test-fingerprint'
        };
        
        await services.googleSheetsService.updateMasterSpreadsheet({
            processed: processedData,
            original: testRecording
        }, 'Debug Test');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Run the debug
debugSingleUpdate().catch(console.error);