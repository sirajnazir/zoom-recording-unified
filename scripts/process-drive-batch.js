#!/usr/bin/env node
/**
 * Batch process Google Drive recordings with resume capability
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const { createContainer } = require('../src/container');
const IntegratedDriveProcessorV4 = require('../src/drive-source/services/IntegratedDriveProcessorV4');
const MultiTabGoogleSheetsService = require('../src/infrastructure/services/MultiTabGoogleSheetsService');
const config = require('../config');

// Progress tracking file
const PROGRESS_FILE = path.join(__dirname, '.drive-batch-progress.json');

async function loadProgress() {
    try {
        const data = await fs.readFile(PROGRESS_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return {
            processedCoaches: [],
            processedSessions: [],
            stats: {
                totalProcessed: 0,
                totalErrors: 0,
                lastRun: null
            }
        };
    }
}

async function saveProgress(progress) {
    await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function processDriveBatch() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║      Batch Process Google Drive Recordings with B Indicator     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    try {
        // Load progress
        const progress = await loadProgress();
        console.log('📊 Loading previous progress...');
        console.log(`   Previously processed: ${progress.stats.totalProcessed} recordings`);
        console.log(`   Previous errors: ${progress.stats.totalErrors}`);
        if (progress.stats.lastRun) {
            console.log(`   Last run: ${new Date(progress.stats.lastRun).toLocaleString()}`);
        }
        console.log('');
        
        // Initialize container with MultiTabGoogleSheetsService
        const container = createContainer();
        const scope = container.createScope();
        
        // Override with MultiTabGoogleSheetsService
        scope.register({
            googleSheetsService: awilix.asClass(MultiTabGoogleSheetsService).singleton()
        });
        
        // Initialize processor
        console.log('🔧 Initializing services...');
        const processor = new IntegratedDriveProcessorV4({
            config,
            googleDriveService: scope.resolve('googleDriveService'),
            googleSheetsService: scope.resolve('googleSheetsService'),
            nameStandardizer: scope.resolve('nameStandardizer'),
            weekInferencer: scope.resolve('weekInferencer'),
            metadataExtractor: scope.resolve('metadataExtractor'),
            driveOrganizer: scope.resolve('driveOrganizer'),
            logger: scope.resolve('logger'),
            eventBus: scope.resolve('eventBus'),
            cache: scope.resolve('cache'),
            metricsCollector: scope.resolve('metricsCollector')
        });
        
        console.log('✅ Services initialized\n');
        
        // Get S3-Ivylevel folder
        const rootFolderId = '1Dpq3rSZelQJJePkSi7K6xAY4q62xMiFA'; // S3-Ivylevel folder
        
        console.log('📋 Configuration:');
        console.log(`   Root Folder: S3-Ivylevel-GDrive-Session-Recordings`);
        console.log(`   Folder ID: ${rootFolderId}`);
        console.log(`   Data Source: "google-drive" (B indicator)`);
        console.log(`   Processing Mode: BATCH (with resume)`);
        console.log(`   Batch Size: 5 sessions per batch\n`);
        
        // Get all coach folders
        console.log('🔍 Scanning for coach folders...');
        const googleDrive = scope.resolve('googleDriveService');
        const coachFolders = await googleDrive.listFolders(rootFolderId);
        console.log(`✅ Found ${coachFolders.length} coach folders\n`);
        
        // Filter out already processed coaches
        const remainingCoaches = coachFolders.filter(coach => 
            !progress.processedCoaches.includes(coach.id)
        );
        
        console.log(`📊 Coaches to process: ${remainingCoaches.length}/${coachFolders.length}`);
        
        let batchCount = 0;
        const BATCH_SIZE = 5;
        
        // Process each coach
        for (const coachFolder of remainingCoaches) {
            console.log(`\n${'━'.repeat(60)}`);
            console.log(`📁 Processing Coach: ${coachFolder.name}`);
            console.log(`${'━'.repeat(60)}\n`);
            
            try {
                // Scan for all recordings in coach folder (recursive)
                const sessions = await processor.scanFolderRecursive(coachFolder.id, coachFolder.name);
                console.log(`   Found ${sessions.length} total sessions`);
                
                // Filter out already processed sessions
                const remainingSessions = sessions.filter(session => 
                    !progress.processedSessions.includes(session.folderId)
                );
                
                console.log(`   Sessions to process: ${remainingSessions.length}/${sessions.length}\n`);
                
                // Process in batches
                for (let i = 0; i < remainingSessions.length; i += BATCH_SIZE) {
                    batchCount++;
                    const batch = remainingSessions.slice(i, i + BATCH_SIZE);
                    console.log(`   📦 Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(remainingSessions.length/BATCH_SIZE)} (${batch.length} sessions)`);
                    
                    for (const session of batch) {
                        try {
                            console.log(`      Processing: ${session.folderName}`);
                            
                            // Set dataSource explicitly
                            session.dataSource = 'google-drive';
                            
                            // Process through full pipeline
                            const result = await processor.processSession(session, 'full');
                            
                            if (result.success) {
                                progress.stats.totalProcessed++;
                                progress.processedSessions.push(session.folderId);
                                console.log(`      ✅ Success: ${result.standardizedName || session.folderName}`);
                                console.log(`         B indicator: ${result.standardizedName?.includes('_B_') ? '✓' : '✗'}`);
                            } else {
                                progress.stats.totalErrors++;
                                console.log(`      ⚠️ Failed: ${result.error}`);
                            }
                            
                        } catch (error) {
                            progress.stats.totalErrors++;
                            console.error(`      ❌ Error: ${error.message}`);
                        }
                    }
                    
                    // Save progress after each batch
                    progress.stats.lastRun = new Date().toISOString();
                    await saveProgress(progress);
                    console.log(`   💾 Progress saved (${progress.stats.totalProcessed} processed, ${progress.stats.totalErrors} errors)`);
                    
                    // Pause between batches to avoid rate limits
                    if (i + BATCH_SIZE < remainingSessions.length) {
                        console.log('   ⏸️ Pausing for 5 seconds...');
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                }
                
                // Mark coach as processed
                progress.processedCoaches.push(coachFolder.id);
                await saveProgress(progress);
                console.log(`\n✅ Completed coach: ${coachFolder.name}`);
                
            } catch (error) {
                console.error(`❌ Error processing coach ${coachFolder.name}: ${error.message}`);
            }
        }
        
        // Final summary
        console.log('\n' + '═'.repeat(60));
        console.log('📊 BATCH PROCESSING COMPLETE');
        console.log('═'.repeat(60));
        console.log(`✅ Total Processed: ${progress.stats.totalProcessed}`);
        console.log(`❌ Total Errors: ${progress.stats.totalErrors}`);
        console.log(`📈 Success Rate: ${((progress.stats.totalProcessed / (progress.stats.totalProcessed + progress.stats.totalErrors)) * 100).toFixed(1)}%`);
        console.log('═'.repeat(60));
        
        console.log('\n✅ All recordings processed!');
        console.log('📊 Check these tabs in Google Sheets:');
        console.log('   - Drive Import - Raw (for raw data)');
        console.log('   - Drive Import - Standardized (for recordings with _B_ indicator)');
        
        // Option to reset progress
        console.log('\n💡 To reset progress and reprocess all, delete:');
        console.log(`   ${PROGRESS_FILE}`);
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Add awilix import
const awilix = require('awilix');

// Run the processor
console.log('🚀 Starting batch processing of Google Drive recordings...');
console.log('⏱️ This supports resume - you can stop and restart anytime\n');

processDriveBatch()
    .then(() => {
        console.log('\n✅ Batch processing completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });