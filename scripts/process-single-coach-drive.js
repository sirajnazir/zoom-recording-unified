#!/usr/bin/env node
/**
 * Process a single coach's Google Drive recordings
 */

require('dotenv').config();
const { createContainer } = require('../src/container');
const MultiTabGoogleSheetsService = require('../src/infrastructure/services/MultiTabGoogleSheetsService');
const IntegratedDriveProcessorV4 = require('../src/drive-source/services/IntegratedDriveProcessorV4');
const S3IvylevelScanner = require('../src/drive-source/services/S3IvylevelScanner');
const RecordingMatcher = require('../src/drive-source/services/RecordingMatcher');
const awilix = require('awilix');

async function processSingleCoach(coachName = 'Coach Jenny') {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log(`║  Process ${coachName.padEnd(20)} Google Drive Recordings  ║`);
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    try {
        // Initialize container with MultiTabGoogleSheetsService
        const container = createContainer();
        const scope = container.createScope();
        
        // Override with MultiTabGoogleSheetsService
        scope.register({
            googleSheetsService: awilix.asClass(MultiTabGoogleSheetsService).singleton()
        });
        
        console.log('🔧 Initializing services...');
        
        const googleDrive = scope.resolve('googleDriveService');
        const processor = new IntegratedDriveProcessorV4({
            googleDriveService: googleDrive,
            googleSheetsService: scope.resolve('googleSheetsService'),
            nameStandardizer: scope.resolve('nameStandardizer'),
            weekInferencer: scope.resolve('weekInferencer'),
            metadataExtractor: scope.resolve('metadataExtractor'),
            driveOrganizer: scope.resolve('driveOrganizer'),
            logger: scope.resolve('logger')
        });
        
        const scanner = new S3IvylevelScanner({
            googleDriveService: googleDrive,
            logger: scope.resolve('logger')
        });
        
        const matcher = new RecordingMatcher({
            logger: scope.resolve('logger')
        });
        
        console.log('✅ Services initialized\n');
        
        // Find the coach folder
        const rootFolderId = '1Dpq3rSZelQJJePkSi7K6xAY4q62xMiFA'; // S3-Ivylevel folder
        const folders = await googleDrive.listFolders(rootFolderId);
        const coachFolder = folders.find(f => f.name === coachName);
        
        if (!coachFolder) {
            throw new Error(`Coach folder "${coachName}" not found`);
        }
        
        console.log(`📁 Found ${coachName} folder: ${coachFolder.id}\n`);
        
        // Scan for recordings
        console.log('🔍 Scanning for recordings...');
        const { files } = await scanner.scanFolder(coachFolder.id, coachFolder.name);
        console.log(`✅ Found ${files.length} files\n`);
        
        // Group into sessions
        console.log('📊 Grouping files into sessions...');
        const sessions = await matcher.matchRecordings(files);
        console.log(`✅ Found ${sessions.length} sessions\n`);
        
        // Process each session
        let processed = 0;
        let errors = 0;
        
        for (let i = 0; i < sessions.length; i++) {
            const session = sessions[i];
            console.log(`\n📹 Processing session ${i + 1}/${sessions.length}:`);
            console.log(`   Folder: ${session.folderName}`);
            console.log(`   Files: ${session.files.length}`);
            
            try {
                // Ensure dataSource is set
                session.dataSource = 'google-drive';
                
                // Process through pipeline
                const result = await processor.processSession(session, 'full');
                
                if (result.success) {
                    processed++;
                    console.log(`   ✅ Success: ${result.standardizedName}`);
                    console.log(`   📊 B indicator: ${result.standardizedName?.includes('_B_') ? 'YES' : 'NO'}`);
                    console.log(`   📋 Updated in Google Sheets`);
                } else {
                    errors++;
                    console.log(`   ⚠️ Failed: ${result.error}`);
                }
                
            } catch (error) {
                errors++;
                console.error(`   ❌ Error: ${error.message}`);
            }
            
            // Progress update every 5 sessions
            if ((i + 1) % 5 === 0) {
                console.log(`\n📊 Progress: ${i + 1}/${sessions.length} sessions (${processed} successful, ${errors} errors)`);
            }
        }
        
        // Summary
        console.log('\n' + '═'.repeat(60));
        console.log(`📊 ${coachName.toUpperCase()} PROCESSING COMPLETE`);
        console.log('═'.repeat(60));
        console.log(`✅ Total Sessions: ${sessions.length}`);
        console.log(`✅ Successfully Processed: ${processed}`);
        console.log(`❌ Errors: ${errors}`);
        console.log(`📈 Success Rate: ${((processed / sessions.length) * 100).toFixed(1)}%`);
        console.log('═'.repeat(60));
        
        console.log('\n✅ Processing complete!');
        console.log('📊 Check these tabs in Google Sheets:');
        console.log('   - Drive Import - Raw');
        console.log('   - Drive Import - Standardized (with _B_ indicators)');
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Get coach name from command line or use default
const coachName = process.argv[2] || 'Coach Jenny';

console.log(`🚀 Starting processing for ${coachName}...`);
console.log('⏱️ This will process all recordings for this coach\n');

processSingleCoach(coachName)
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });