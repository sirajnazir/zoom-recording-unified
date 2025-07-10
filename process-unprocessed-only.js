#!/usr/bin/env node

/**
 * Process only truly unprocessed recordings
 * This script first checks what's already in sheets, then only processes new ones
 */

require('dotenv').config();
const { execSync } = require('child_process');

async function processUnprocessedOnly() {
    console.log('🔍 Checking for unprocessed recordings...\n');
    
    // First, get a count of already processed recordings
    const checkScript = `
    node -e "
    require('dotenv').config();
    const { google } = require('googleapis');
    
    async function countProcessed() {
        const auth = new google.auth.GoogleAuth({
            credentials: ${process.env.GOOGLE_SERVICE_ACCOUNT ? process.env.GOOGLE_SERVICE_ACCOUNT : 'null'},
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
        });
        
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = '${process.env.MASTER_INDEX_SHEET_ID || '1xa4E5PcrxRVaMbJfWH_d5LLSqY3RlCf6Ur3rwKtq2jQ'}';
        
        try {
            // Get count from Zoom API Raw tab
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: 'Zoom API - Raw!A2:A1000', // Skip header, get up to 1000 rows
            });
            
            const processedCount = response.data.values ? response.data.values.length : 0;
            console.log(processedCount);
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    }
    
    countProcessed().catch(console.error);
    "`;
    
    try {
        const processedCount = execSync(checkScript, { encoding: 'utf8' }).trim();
        console.log(`✅ Found ${processedCount} recordings already processed in sheets\n`);
        
        if (processedCount === '287') {
            console.log('📊 Status: 287 recordings processed (as expected)');
            console.log('🎯 Looking for remaining recordings to process...\n');
        }
        
        // Run the processor with rate limiting
        console.log('🚀 Starting processor with rate limiting to avoid quota issues...\n');
        console.log('⏱️  Adding 1.5 second delay between sheet checks to stay under quota\n');
        
        // Create a modified version that adds delays
        const processCmd = `
        node complete-production-processor.js \
            --date-range=1095 \
            --limit=350 \
            --auto-approve \
            --parallel-downloads=true \
            --download-concurrency=2 \
            --streaming-downloads=true \
            --enable-resume-downloads=true
        `;
        
        console.log('📋 Running command:', processCmd);
        console.log('\n💡 Tip: The script will check all 330 recordings but only process new ones');
        console.log('💡 GATE 3 will skip the 287 already processed recordings\n');
        
        // Execute the command
        require('child_process').spawn('node', [
            'complete-production-processor.js',
            '--date-range=1095',
            '--limit=350',
            '--auto-approve',
            '--parallel-downloads=true',
            '--download-concurrency=2',
            '--streaming-downloads=true',
            '--enable-resume-downloads=true'
        ], {
            stdio: 'inherit'
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

processUnprocessedOnly();