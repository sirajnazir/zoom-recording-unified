#!/usr/bin/env node

/**
 * Process Google Drive recordings using MultiTabGoogleSheetsService
 * This will write to the dedicated Drive Import tabs
 */

require('dotenv').config();
const config = require('../config');
const { createContainer } = require('../src/container');
const awilix = require('awilix');
const IntegratedDriveProcessorV4 = require('../src/drive-source/services/IntegratedDriveProcessorV4');
const MultiTabGoogleSheetsService = require('../src/infrastructure/services/MultiTabGoogleSheetsService');
const S3IvylevelScanner = require('../src/drive-source/services/S3IvylevelScanner');
const RecordingMatcher = require('../src/drive-source/services/RecordingMatcher');

async function processDriveWithMultiTab() {
    console.log('🚀 Google Drive Recording Processor with MultiTab Support\n');
    
    try {
        // Create container and override the sheets service
        const container = createContainer();
        const scope = container.createScope();
        
        // Register MultiTabGoogleSheetsService instead of DualTab
        scope.register({
            googleSheetsService: awilix.asClass(MultiTabGoogleSheetsService).singleton()
        });
        
        // Get all services
        const services = {
            googleSheetsService: scope.resolve('googleSheetsService'),
            nameStandardizer: scope.resolve('nameStandardizer'),
            weekInferencer: scope.resolve('weekInferencer'),
            metadataExtractor: scope.resolve('metadataExtractor'),
            driveOrganizer: scope.resolve('driveOrganizer'),
            logger: scope.resolve('logger'),
            completeSmartNameStandardizer: scope.resolve('nameStandardizer')
        };
        
        // Services will initialize automatically
        console.log('🔧 Using MultiTab Google Sheets Service...');
        
        // Initialize processor and scanner
        const processor = new IntegratedDriveProcessorV4(config, services);
        const scanner = new S3IvylevelScanner(config);
        
        // Get coach folders
        const S3_IVYLEVEL_ROOT_ID = '1Dpq3rSZelQJJePkSi7K6xAY4q62xMiFA';
        const coachFolders = await scanner.getCoachFolders(S3_IVYLEVEL_ROOT_ID);
        
        console.log(`📁 Found ${coachFolders.length} coach folders\n`);
        
        // Process just the first coach as a test
        if (coachFolders.length > 0) {
            const coach = coachFolders[0];
            console.log(`📁 Processing ${coach.name}...`);
            
            const files = await scanner.scanFolder(coach.id, {
                recursive: true,
                maxDepth: 3,
                minFileSize: 100 * 1024
            });
            
            console.log(`   Found ${files.length} files`);
            
            const matcher = new RecordingMatcher();
            const sessions = await matcher.matchRecordings(files);
            console.log(`   Grouped into ${sessions.length} sessions`);
            
            // Process first few sessions
            const sessionsToProcess = sessions.slice(0, 3);
            
            for (let i = 0; i < sessionsToProcess.length; i++) {
                const session = sessionsToProcess[i];
                console.log(`\n🎬 Processing session ${i + 1}/${sessionsToProcess.length}: ${session.metadata?.folderName || session.id}`);
                
                const processableSession = {
                    id: session.id,
                    folderName: session.metadata?.folderName || session.id,
                    folderId: session.metadata?.folderId,
                    files: session.files,
                    metadata: session.metadata,
                    source: 'google-drive',
                    dataSource: 'google-drive'
                };
                
                try {
                    const result = await processor.processRecording(processableSession);
                    
                    if (result) {
                        console.log(`   ✅ Processed successfully`);
                        console.log(`   Standardized: ${result.standardizedName || 'N/A'}`);
                        console.log(`   Has B indicator: ${result.standardizedName?.includes('_B_') ? '✅' : '❌'}`);
                        console.log(`   Should be in: Drive Import tabs`);
                    }
                } catch (error) {
                    console.error(`   ❌ Error: ${error.message}`);
                }
            }
            
            console.log('\n✅ Test processing complete!');
            console.log('📊 Check the "Drive Import - Raw" and "Drive Import - Standardized" tabs in Google Sheets');
        }
        
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        console.error(error.stack);
    }
}

// Run the processor
processDriveWithMultiTab().catch(console.error);