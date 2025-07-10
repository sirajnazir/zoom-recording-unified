// Process ALL Google Drive recordings for all coaches and students
require('dotenv').config();
const path = require('path');
const { initializeContainer } = require('../src/shared/container');
const { IntegratedDriveProcessorV4 } = require('../src/drive-source/services/IntegratedDriveProcessorV4');

async function processAllDriveRecordings() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║         Process ALL Google Drive Historical Recordings         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    try {
        // Initialize dependencies
        console.log('🔧 Initializing services...');
        const container = await initializeContainer();
        
        // Initialize the processor
        const processor = new IntegratedDriveProcessorV4({
            config: container.config,
            googleDriveService: container.googleDriveService,
            googleSheetsService: container.googleSheetsService,
            nameStandardizer: container.nameStandardizer,
            weekInferencer: container.weekInferencer,
            metadataExtractor: container.metadataExtractor,
            driveOrganizer: container.driveOrganizer,
            recordingProcessor: container.recordingProcessor,
            logger: container.logger,
            eventBus: container.eventBus,
            cache: container.cache,
            metricsCollector: container.metricsCollector
        });
        
        console.log('✅ Services initialized\n');
        
        // Configuration
        const rootFolderId = container.config.google.drive.recordingsRootFolderId;
        const coachesFolderId = container.config.google.drive.coachesFolderId;
        
        console.log('📋 Configuration:');
        console.log(`   Root Folder: ${rootFolderId}`);
        console.log(`   Coaches Folder: ${coachesFolderId}`);
        console.log(`   Data Source: "google-drive"`);
        console.log(`   Processing Mode: FULL (all recordings)\n`);
        
        // Get all coach folders
        console.log('🔍 Scanning for coach folders...');
        const coachFolders = await processor.googleDriveService.listFolders(coachesFolderId);
        console.log(`✅ Found ${coachFolders.length} coach folders\n`);
        
        // Process statistics
        let totalCoaches = 0;
        let totalStudents = 0;
        let totalSessions = 0;
        let totalProcessed = 0;
        let totalErrors = 0;
        
        // Process each coach
        for (const coachFolder of coachFolders) {
            totalCoaches++;
            console.log(`\n${'━'.repeat(60)}`);
            console.log(`📁 Processing Coach ${totalCoaches}/${coachFolders.length}: ${coachFolder.name}`);
            console.log(`${'━'.repeat(60)}\n`);
            
            try {
                // Scan coach folder for student folders
                const studentFolders = await processor.googleDriveService.listFolders(coachFolder.id);
                console.log(`   Found ${studentFolders.length} student/program folders\n`);
                
                for (const studentFolder of studentFolders) {
                    totalStudents++;
                    console.log(`   📁 Processing: ${studentFolder.name}`);
                    
                    try {
                        // Scan for session folders (recursive)
                        const sessions = await processor.scanFolderRecursive(studentFolder.id, studentFolder.name);
                        console.log(`      Found ${sessions.length} sessions`);
                        
                        totalSessions += sessions.length;
                        
                        // Process each session
                        for (let i = 0; i < sessions.length; i++) {
                            const session = sessions[i];
                            console.log(`      Processing session ${i + 1}/${sessions.length}: ${session.folderName}`);
                            
                            try {
                                // Process through full pipeline
                                const result = await processor.processSession(session, 'full');
                                
                                if (result.success) {
                                    totalProcessed++;
                                    console.log(`      ✅ Processed: ${result.standardizedName || session.folderName}`);
                                } else {
                                    totalErrors++;
                                    console.log(`      ⚠️ Failed: ${result.error}`);
                                }
                                
                                // Add small delay to avoid rate limits
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                
                            } catch (error) {
                                totalErrors++;
                                console.error(`      ❌ Error processing session: ${error.message}`);
                            }
                        }
                        
                    } catch (error) {
                        console.error(`   ❌ Error scanning student folder: ${error.message}`);
                    }
                }
                
            } catch (error) {
                console.error(`❌ Error processing coach ${coachFolder.name}: ${error.message}`);
            }
            
            // Progress update
            console.log(`\n📊 Progress Update:`);
            console.log(`   Coaches processed: ${totalCoaches}/${coachFolders.length}`);
            console.log(`   Total students: ${totalStudents}`);
            console.log(`   Total sessions found: ${totalSessions}`);
            console.log(`   Successfully processed: ${totalProcessed}`);
            console.log(`   Errors: ${totalErrors}`);
        }
        
        // Final summary
        console.log('\n' + '═'.repeat(60));
        console.log('📊 FINAL PROCESSING SUMMARY');
        console.log('═'.repeat(60));
        console.log(`✅ Total Coaches: ${totalCoaches}`);
        console.log(`✅ Total Students: ${totalStudents}`);
        console.log(`✅ Total Sessions: ${totalSessions}`);
        console.log(`✅ Successfully Processed: ${totalProcessed}`);
        console.log(`❌ Total Errors: ${totalErrors}`);
        console.log(`📈 Success Rate: ${((totalProcessed / totalSessions) * 100).toFixed(1)}%`);
        console.log('═'.repeat(60));
        
        console.log('\n✅ Processing complete!');
        console.log('📊 Check your Google Sheets for all processed recordings in:');
        console.log('   - Drive Import - Raw');
        console.log('   - Drive Import - Standardized');
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Run the processor
console.log('🚀 Starting FULL Google Drive recordings processing...');
console.log('⏱️ This may take a while depending on the number of recordings...\n');

processAllDriveRecordings()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });