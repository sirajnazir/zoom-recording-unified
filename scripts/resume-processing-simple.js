#!/usr/bin/env node
/**
 * Simple Resume Processing Script
 * 
 * This script creates a modified version of complete-production-processor.js
 * that skips the first 221 recordings when processing
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const RECORDINGS_TO_SKIP = 221;

async function createResumeProcessor() {
    console.log(`
================================================================================
📋 RESUME PROCESSING FROM RECORDING 222
================================================================================
📅 Date: ${new Date().toISOString()}
⏭️ Will skip first ${RECORDINGS_TO_SKIP} recordings
📄 Mode: last30days with skip functionality
================================================================================
`);

    // Read the original processor
    const originalPath = path.join(process.cwd(), 'complete-production-processor.js');
    if (!fs.existsSync(originalPath)) {
        console.error('❌ complete-production-processor.js not found');
        process.exit(1);
    }

    const originalContent = fs.readFileSync(originalPath, 'utf8');
    
    // Find the processing loop and inject skip logic
    const modifiedContent = originalContent.replace(
        /for \(const recording of recordings\) \{/g,
        `// RESUME MODIFICATION: Skip first ${RECORDINGS_TO_SKIP} recordings
        const startIndex = ${RECORDINGS_TO_SKIP};
        console.log('\\n⏭️ RESUME MODE: Skipping first ' + startIndex + ' recordings');
        console.log('📊 Starting from recording ' + (startIndex + 1) + ' of ' + recordings.length);
        
        for (let i = startIndex; i < recordings.length; i++) {
            const recording = recordings[i];
            const recordingIndex = i + 1; // 1-based index for display`
    ).replace(
        /console\.log\(`\\n🔄 Processing Recording \${recordings\.indexOf\(recording\) \+ 1\}\/\${recordings\.length\}:`\);/g,
        'console.log(`\\n🔄 Processing Recording ${recordingIndex}/${recordings.length}:`);'
    );

    // Save the modified processor
    const resumePath = path.join(process.cwd(), 'resume-processor-temp.js');
    fs.writeFileSync(resumePath, modifiedContent);
    console.log(`✅ Created temporary resume processor: ${resumePath}`);

    // Ask for confirmation
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log(`
================================================================================
⚠️  IMPORTANT: This will process recordings starting from #222
================================================================================
`);

    const answer = await new Promise(resolve => {
        readline.question('Do you want to continue? (yes/no): ', resolve);
    });
    readline.close();

    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
        console.log('❌ Processing cancelled by user.');
        fs.unlinkSync(resumePath);
        process.exit(0);
    }

    // Run the modified processor
    console.log('\n🚀 Starting resume processing...');
    console.log('================================================================================\n');

    const child = spawn('node', [
        resumePath,
        '--mode=last30days',
        '--auto-approve',
        '--limit=500'
    ], {
        stdio: 'inherit',
        cwd: process.cwd()
    });

    child.on('exit', (code) => {
        // Clean up temporary file
        try {
            fs.unlinkSync(resumePath);
            console.log('\n✅ Cleaned up temporary files');
        } catch (e) {
            // Ignore cleanup errors
        }

        if (code === 0) {
            console.log('\n✅ Resume processing completed successfully!');
        } else {
            console.log(`\n❌ Processing exited with code ${code}`);
        }
        process.exit(code);
    });

    child.on('error', (error) => {
        console.error('\n❌ Error running processor:', error);
        try {
            fs.unlinkSync(resumePath);
        } catch (e) {
            // Ignore cleanup errors
        }
        process.exit(1);
    });
}

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log('\n\n🛑 Process interrupted by user');
    // Try to clean up temp file
    try {
        fs.unlinkSync(path.join(process.cwd(), 'resume-processor-temp.js'));
    } catch (e) {
        // Ignore
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n🛑 Process terminated');
    // Try to clean up temp file
    try {
        fs.unlinkSync(path.join(process.cwd(), 'resume-processor-temp.js'));
    } catch (e) {
        // Ignore
    }
    process.exit(0);
});

// Run the resume processor creation
createResumeProcessor().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});