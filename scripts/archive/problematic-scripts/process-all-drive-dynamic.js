#!/usr/bin/env node

/**
 * Process all Google Drive recordings dynamically
 * Discovers all coach folders automatically instead of using hardcoded config
 */

require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs').promises;
const config = require('../config');
const { createContainer } = require('../src/container');
const IntegratedDriveProcessorV4 = require('../src/drive-source/services/IntegratedDriveProcessorV4');
const S3IvylevelScanner = require('../src/drive-source/services/S3IvylevelScanner');
const RecordingMatcher = require('../src/drive-source/services/RecordingMatcher');
const MultiTabGoogleSheetsService = require('../src/infrastructure/services/MultiTabGoogleSheetsService');
const awilix = require('awilix');

// S3-Ivylevel root folder ID (from the URL provided)
const S3_IVYLEVEL_ROOT_ID = '1Dpq3rSZelQJJePkSi7K6xAY4q62xMiFA';

async function initializeGoogleDrive() {
    console.log('🔧 Initializing Google Drive authentication...');
    
    const auth = new google.auth.JWT(
        config.google.clientEmail,
        null,
        config.google.privateKey,
        ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
    );
    
    return google.drive({ version: 'v3', auth });
}

async function discoverCoachFolders(drive) {
    console.log('\n🔍 Discovering coach folders dynamically...');
    
    try {
        const response = await drive.files.list({
            q: `'${S3_IVYLEVEL_ROOT_ID}' in parents and mimeType = 'application/vnd.google-apps.folder'`,
            fields: 'files(id, name)',
            orderBy: 'name'
        });
        
        const folders = response.data.files || [];
        
        // Filter for coach folders - looking for folders with "Coach" in the name
        const coachFolders = folders.filter(folder => 
            folder.name.toLowerCase().includes('coach')
        );
        
        console.log(`✅ Found ${coachFolders.length} coach folders:`);
        coachFolders.forEach((folder, index) => {
            console.log(`   ${index + 1}. ${folder.name} (ID: ${folder.id})`);
        });
        
        return coachFolders;
    } catch (error) {
        console.error('❌ Error discovering coach folders:', error.message);
        throw error;
    }
}

async function processCoachFolder(drive, coach, processor, scanner) {
    const coachName = coach.name.replace('Coach ', '').trim();
    console.log(`\n📁 Processing ${coach.name}...`);
    
    try {
        // Use production scanner to scan for all recordings in coach folder
        console.log(`   🔍 Scanning ${coach.name} folder for recordings...`);
        const files = await scanner.scanFolder(coach.id, {
            recursive: true,
            maxDepth: 7,
            minFileSize: 100 * 1024, // 100KB minimum
            includeMetadata: true
        });
        
        console.log(`   📊 Found ${files.length} files`);
        
        // Use RecordingMatcher to group files into sessions
        const matcher = new RecordingMatcher();
        const sessions = await matcher.matchRecordings(files);
        console.log(`   📁 Grouped into ${sessions.length} sessions`);
        
        // Process each session through the production pipeline
        for (let i = 0; i < sessions.length; i++) {
            const session = sessions[i];
            console.log(`   🎬 Processing session ${i + 1}/${sessions.length}: ${session.metadata?.folderName || session.id}`);
            console.log(`      Files: ${session.files.length}, Confidence: ${session.confidence}%`);
            
            try {
                // Convert to format expected by processor
                const processableSession = {
                    id: session.id,
                    folderName: session.metadata?.folderName || session.id,
                    folderId: session.metadata?.folderId,
                    files: session.files,
                    metadata: session.metadata,
                    source: 'google-drive',
                    dataSource: 'google-drive'
                };
                
                const result = await processor.processRecording(processableSession);
                
                if (result) {
                    console.log(`      ✅ Processed successfully`);
                    console.log(`         Standardized: ${result.nameAnalysis?.standardizedName || 'N/A'}`);
                    console.log(`         Category: ${result.category || 'N/A'}`);
                    console.log(`         Week: ${result.weekAnalysis?.weekNumber || 'Unknown'}`);
                    console.log(`         Google Sheets: Updated`);
                }
                
                // Small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`      ❌ Error processing session: ${error.message}`);
            }
        }
        
        console.log(`✅ Completed processing ${coach.name}`);
        
    } catch (error) {
        console.error(`❌ Error processing ${coach.name}:`, error.message);
    }
}

async function main() {
    console.log('🚀 Google Drive Recording Processor - Dynamic Coach Discovery');
    console.log('=' .repeat(60));
    
    try {
        // Initialize all services using the container
        console.log('\n🔧 Initializing services container...');
        console.log('Config structure:', JSON.stringify({
            googleExists: !!config.google,
            sheetsExists: !!config.google?.sheets,
            masterIndexSheetId: config.google?.sheets?.masterIndexSheetId
        }, null, 2));
        
        const container = createContainer();
        const scope = container.createScope();
        
        // Override with MultiTabGoogleSheetsService
        scope.register({
            googleSheetsService: awilix.asClass(MultiTabGoogleSheetsService).singleton()
        });
        
        // Get drive service
        const drive = await initializeGoogleDrive();
        
        // Get all required services from container
        const services = {
            googleSheetsService: scope.resolve('googleSheetsService'),
            nameStandardizer: scope.resolve('nameStandardizer'),
            weekInferencer: scope.resolve('weekInferencer'),
            metadataExtractor: scope.resolve('metadataExtractor'),
            driveOrganizer: scope.resolve('driveOrganizer'),
            recordingProcessor: scope.resolve('recordingProcessor'),
            logger: scope.resolve('logger'),
            eventBus: scope.resolve('eventBus'),
            cache: scope.resolve('cache'),
            metricsCollector: scope.resolve('metricsCollector')
        };
        
        // Initialize the processor with config and services
        const processor = new IntegratedDriveProcessorV4(config, services);
        
        // Initialize the production scanner
        console.log('\n🔧 Initializing S3-Ivylevel scanner...');
        const scanner = new S3IvylevelScanner(config);
        console.log('✅ Scanner initialized with smart retry and pattern learning');
        
        // Discover all coach folders dynamically
        const coachFolders = await discoverCoachFolders(drive);
        
        if (coachFolders.length === 0) {
            console.log('⚠️  No coach folders found in S3-Ivylevel root');
            return;
        }
        
        console.log(`\n🎯 Starting to process ${coachFolders.length} coach folders...`);
        
        // Process each coach folder
        for (const coach of coachFolders) {
            await processCoachFolder(drive, coach, processor, scanner);
        }
        
        console.log('\n✅ All processing complete!');
        console.log('📊 Check the Google Sheets for detailed results');
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    main().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}

module.exports = { main };