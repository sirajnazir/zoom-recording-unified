#!/usr/bin/env node

// Process ALL Google Drive recordings automatically without prompts
const RecordingSourceManager = require('../src/services/RecordingSourceManager');
const config = require('../config');

async function processAllDriveRecordings() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║      Process ALL Google Drive Recordings (Automated)           ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // Ensure we're using production folders
    config.features.enableDriveSource = true;
    config.driveSource.enabled = true;
    config.driveSource.useTestFolders = false;

    console.log('📋 Configuration:');
    console.log(`   Using production folders: ${!config.driveSource.useTestFolders}`);
    console.log(`   Master Sheet ID: ${config.google.sheets.masterIndexSheetId}`);
    console.log(`   Root Folder ID: ${config.google.drive.recordingsRootFolderId}`);
    console.log(`   Source identifier: "Google Drive Import"`);
    console.log(`   Mode: FULL AUTOMATED (all coaches, all recordings)\n`);

    const sourceManager = new RecordingSourceManager(config);

    // Get all coaches
    const coaches = Object.keys(config.driveSource.coachFolders);
    console.log(`🎯 Found ${coaches.length} coaches to process:\n`);
    coaches.forEach((coach, index) => {
        console.log(`   ${index + 1}. ${coach} - Folder: ${config.driveSource.coachFolders[coach]}`);
    });
    console.log('');

    // Stats tracking
    let totalStats = {
        coaches: 0,
        sessions: 0,
        processed: 0,
        errors: 0,
        startTime: Date.now()
    };

    // Process each coach
    for (const coach of coaches) {
        totalStats.coaches++;
        console.log(`\n${'━'.repeat(60)}`);
        console.log(`📁 Processing Coach ${totalStats.coaches}/${coaches.length}: ${coach}`);
        console.log(`${'━'.repeat(60)}\n`);

        try {
            const coachStats = await sourceManager.processDriveSource({
                coachName: coach,
                folderId: config.driveSource.coachFolders[coach],
                maxSessions: 1000 // Process all sessions
            });

            // Update stats
            totalStats.sessions += coachStats.totalSessions || 0;
            totalStats.processed += coachStats.processed || 0;
            totalStats.errors += coachStats.errors || 0;

            console.log(`\n✅ Coach ${coach} processing complete:`);
            console.log(`   Sessions found: ${coachStats.totalSessions || 0}`);
            console.log(`   Successfully processed: ${coachStats.processed || 0}`);
            console.log(`   Errors: ${coachStats.errors || 0}`);

        } catch (error) {
            console.error(`\n❌ Error processing coach ${coach}:`, error.message);
            totalStats.errors++;
        }

        // Progress update
        const elapsedMinutes = Math.floor((Date.now() - totalStats.startTime) / 60000);
        console.log(`\n📊 Overall Progress:`);
        console.log(`   Coaches completed: ${totalStats.coaches}/${coaches.length}`);
        console.log(`   Total sessions processed: ${totalStats.processed}`);
        console.log(`   Total errors: ${totalStats.errors}`);
        console.log(`   Elapsed time: ${elapsedMinutes} minutes`);
    }

    // Final summary
    const totalMinutes = Math.floor((Date.now() - totalStats.startTime) / 60000);
    console.log('\n' + '═'.repeat(60));
    console.log('📊 FINAL PROCESSING SUMMARY');
    console.log('═'.repeat(60));
    console.log(`✅ Total Coaches Processed: ${totalStats.coaches}`);
    console.log(`✅ Total Sessions Found: ${totalStats.sessions}`);
    console.log(`✅ Successfully Processed: ${totalStats.processed}`);
    console.log(`❌ Total Errors: ${totalStats.errors}`);
    console.log(`⏱️ Total Time: ${totalMinutes} minutes`);
    if (totalStats.sessions > 0) {
        console.log(`📈 Success Rate: ${((totalStats.processed / totalStats.sessions) * 100).toFixed(1)}%`);
    }
    console.log('═'.repeat(60));

    console.log('\n✅ All processing complete!');
    console.log('📊 Check your Google Sheets for all processed recordings in:');
    console.log('   - Drive Import - Raw');
    console.log('   - Drive Import - Standardized');
}

// Run the automated processor
console.log('🚀 Starting AUTOMATED Google Drive recordings processing...');
console.log('⏱️ This will process ALL recordings and may take several hours...\n');

processAllDriveRecordings()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    });