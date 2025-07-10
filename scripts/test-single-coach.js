#!/usr/bin/env node

/**
 * Test processing a single coach folder to verify B indicator
 */

require('dotenv').config();
const config = require('../config');
const { createContainer } = require('../src/container');
const IntegratedDriveProcessorV4 = require('../src/drive-source/services/IntegratedDriveProcessorV4');
const S3IvylevelScanner = require('../src/drive-source/services/S3IvylevelScanner');
const RecordingMatcher = require('../src/drive-source/services/RecordingMatcher');

async function testSingleCoach() {
    console.log('🧪 Testing Single Coach Processing with B Indicator\n');
    
    try {
        // Initialize services
        const container = createContainer();
        const scope = container.createScope();
        
        const services = {
            googleSheetsService: scope.resolve('googleSheetsService'),
            nameStandardizer: scope.resolve('nameStandardizer'),
            weekInferencer: scope.resolve('weekInferencer'),
            metadataExtractor: scope.resolve('metadataExtractor'),
            driveOrganizer: scope.resolve('driveOrganizer'),
            recordingProcessor: scope.resolve('recordingProcessor'),
            logger: scope.resolve('logger'),
            completeSmartNameStandardizer: scope.resolve('nameStandardizer')
        };
        
        const processor = new IntegratedDriveProcessorV4(config, services);
        const scanner = new S3IvylevelScanner(config);
        
        // First get coach folders from S3-Ivylevel root
        const S3_IVYLEVEL_ROOT_ID = '1Dpq3rSZelQJJePkSi7K6xAY4q62xMiFA';
        const coachFolders = await scanner.getCoachFolders(S3_IVYLEVEL_ROOT_ID);
        
        if (coachFolders.length === 0) {
            console.log('No coach folders found!');
            return;
        }
        
        // Use the first coach folder (should be Coach Aditi)
        const testFolder = coachFolders[0];
        console.log(`Testing with: ${testFolder.name} (ID: ${testFolder.id})`);
        const testFolderId = testFolder.id;
        
        console.log(`\n📁 Scanning ${testFolder.name} folder...`);
        const files = await scanner.scanFolder(testFolderId, {
            recursive: true,
            maxDepth: 3,
            minFileSize: 100 * 1024
        });
        
        console.log(`   Found ${files.length} files`);
        
        if (files.length === 0) {
            console.log('No files found!');
            return;
        }
        
        // Match recordings
        const matcher = new RecordingMatcher();
        console.log('   Calling matcher.matchRecordings...');
        const sessions = await matcher.matchRecordings(files);
        console.log('   Sessions result:', typeof sessions, Array.isArray(sessions) ? `Array with ${sessions.length} items` : 'Not an array');
        console.log(`   Grouped into ${sessions ? sessions.length : 0} sessions`);
        
        // Process just the first session to test
        if (sessions.length > 0) {
            const session = sessions[0];
            console.log(`\n🎬 Processing first session: ${session.metadata?.folderName || session.id}`);
            
            const processableSession = {
                id: session.id,
                folderName: session.metadata?.folderName || session.id,
                folderId: session.metadata?.folderId,
                files: session.files,
                metadata: session.metadata,
                source: 'google-drive',
                dataSource: 'google-drive'
            };
            
            console.log('   Data source:', processableSession.dataSource);
            
            const result = await processor.processRecording(processableSession);
            
            if (result) {
                console.log('\n✅ Processing complete!');
                console.log('   Standardized Name:', result.standardizedName || 'N/A');
                console.log('   Has B indicator:', result.standardizedName?.includes('_B_') ? '✅ YES' : '❌ NO');
                console.log('   Data Source:', processableSession.dataSource);
                console.log('   Recording Details:');
                console.log('     - Coach:', result.standardizedName?.split('_')[2] || 'Unknown');
                console.log('     - Student:', result.standardizedName?.split('_')[3] || 'Unknown');
                console.log('     - Week:', result.weekNumber || 'Unknown');
                console.log('     - Category:', result.category || 'Unknown');
                
                console.log('\n📊 Google Sheets Update:');
                console.log('   Would be updated with:', result.standardizedName);
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    }
}

// Run the test
testSingleCoach().catch(console.error);