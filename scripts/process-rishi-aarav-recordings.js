#!/usr/bin/env node

/**
 * Process all Rishi & Aarav recordings from S3-Ivylevel folder
 * Add _B_ indicator and proper standardization
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');
const IntegratedDriveProcessorV4 = require('../src/processors/IntegratedDriveProcessorV4');
const crypto = require('crypto');

const RISHI_AARAV_FOLDER_ID = '1lGkcHEwpsoZ96fqUeuFfudbsD0yPrA-H';

// All the recording folder IDs from the check
const RECORDING_FOLDERS = [
    { id: '17dONZiyazCagdYNndqOwf1BWITD8OrFK', name: 'Coaching_Rishi_Aarav_Wk01_2024-05-22_17dONZiyazCagdYNndqOwf1BWITD8OrFK' },
    { id: '1OcKMp9VqcZy1jQOokOULOzqCyWQj-Sb_', name: 'Coaching_Rishi_Aarav_Wk02_2024-07-03_1OcKMp9VqcZy1jQOokOULOzqCyWQj-Sb_' },
    { id: '1P9BBLT6XF1H-Y0j4ZrEEsdZhUPbUq9ur', name: 'Coaching_Rishi_Aarav_Wk03_2024-07-10_1P9BBLT6XF1H-Y0j4ZrEEsdZhUPbUq9ur' },
    { id: '1XBWs5GDVjRVqPauCBD9uxMSTKO8VeDkp', name: 'Coaching_Rishi_Aarav_Wk04_2024-07-17_1XBWs5GDVjRVqPauCBD9uxMSTKO8VeDkp' },
    { id: '1mfOIvL7TLcA41vDDaYuMyOnF3fbva9-b', name: 'Coaching_Rishi_Aarav_Wk05_2024-07-24_1mfOIvL7TLcA41vDDaYuMyOnF3fbva9-b' },
    { id: '1Kvhz1Eq4V1r8kvqyDTxeZelUi5au6DmW', name: 'Coaching_Rishi_Aarav_Wk06_2024-07-31_1Kvhz1Eq4V1r8kvqyDTxeZelUi5au6DmW' },
    { id: '1Nb_OrOTRqbLOuJAIV1-tjnKWTcwlhHgh', name: 'Coaching_Rishi_Aarav_Wk07_2024-08-07_1Nb_OrOTRqbLOuJAIV1-tjnKWTcwlhHgh' },
    { id: '1ZurrqL-fRtPvYysMYTsdEAs-hfdk-vi6', name: 'Coaching_Rishi_Aarav_Wk08_2024-08-15_1ZurrqL-fRtPvYysMYTsdEAs-hfdk-vi6' },
    { id: '1_Lzf5P6cBNzWXmMuZF5u5Pfv4wblsqen', name: 'Coaching_Rishi_Aarav_Wk09_2024-08-21_1_Lzf5P6cBNzWXmMuZF5u5Pfv4wblsqen' },
    { id: '1Xs0-jfuJjn2yb8eQ8In6-B4K_CVnjJeb', name: 'Coaching_Rishi_Aarav_Wk10_2024-08-28_1Xs0-jfuJjn2yb8eQ8In6-B4K_CVnjJeb' },
    { id: '11dI1KLaxThNXZpECuHSxBjbxe10-z50A', name: 'Coaching_Rishi_Aarav_Wk11_2024-09-04_11dI1KLaxThNXZpECuHSxBjbxe10-z50A' },
    { id: '1EY3YjRCBUDjhlGTA714cHbgKHKBPmTRz', name: 'Coaching_Rishi_Aarav_Wk12_2024-09-11_1EY3YjRCBUDjhlGTA714cHbgKHKBPmTRz' },
    { id: '10N67vLdLtkw7hDncOz6iYj2rl4844eUv', name: 'Coaching_Rishi_Aarav_Wk13_2024-09-18_10N67vLdLtkw7hDncOz6iYj2rl4844eUv' },
    { id: '1rkgbZug06vewsXiJg19VEsacTvNWZIta', name: 'Coaching_Rishi_Aarav_Wk14_2024-09-25_1rkgbZug06vewsXiJg19VEsacTvNWZIta' },
    { id: '1ivA0-Ev6pKtVbt2HeWb3xgmDstJl4_L5', name: 'Coaching_Rishi_Aarav_Wk15_2024-10-09_1ivA0-Ev6pKtVbt2HeWb3xgmDstJl4_L5' },
    { id: '12B40D28uvVTDdSHAO_S2S7GTKlQCes2A', name: 'Coaching_Rishi_Aarav_Wk16_2024-10-30_12B40D28uvVTDdSHAO_S2S7GTKlQCes2A' },
    { id: '1bpwA_QNmxXjqszLrXUidaX-Q4PLW2K0M', name: 'Coaching_Rishi_Aarav_Wk17_2024-11-06_1bpwA_QNmxXjqszLrXUidaX-Q4PLW2K0M' },
    { id: '1X2zuTI81JdD93Sylhm-WcaWp-sOmyFJA', name: 'Coaching_Rishi_Aarav_Wk18_2024-11-13_1X2zuTI81JdD93Sylhm-WcaWp-sOmyFJA' },
    { id: '1MOjuiEThZm85mi7ZD-m0cc6hqKOJ6d2_', name: 'Coaching_Rishi_Aarav_Wk19_2024-11-26_1MOjuiEThZm85mi7ZD-m0cc6hqKOJ6d2_' },
    { id: '1sGGRNTMd0shll2fy_gSD16OL0T1XCDFM', name: 'Coaching_Rishi_Aarav_Wk20_2024-12-07_1sGGRNTMd0shll2fy_gSD16OL0T1XCDFM' },
    { id: '1P7NqTQQ2IBdnhUM3nYVBANzIP1kqQ6PK', name: 'Coaching_Rishi_Aarav_Wk21_2024-12-14_1P7NqTQQ2IBdnhUM3nYVBANzIP1kqQ6PK' }
];

async function initializeServices() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: config.google.clientEmail,
            private_key: config.google.privateKey
        },
        scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
    });
    
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });
    
    return { drive, sheets, auth };
}

async function processRishiAaravRecordings() {
    console.log('🔧 Processing All Rishi & Aarav Recordings');
    console.log('=' .repeat(70));
    console.log(`\nTotal recordings to process: ${RECORDING_FOLDERS.length}`);
    
    try {
        const { drive, sheets, auth } = await initializeServices();
        
        // Initialize the processor
        const processor = new IntegratedDriveProcessorV4({
            drive,
            sheets,
            auth,
            spreadsheetId: config.google.sheets.masterIndexSheetId
        });
        
        console.log('\n📊 Starting batch processing...\n');
        
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < RECORDING_FOLDERS.length; i++) {
            const recording = RECORDING_FOLDERS[i];
            console.log(`\n[${i + 1}/${RECORDING_FOLDERS.length}] Processing: ${recording.name}`);
            console.log('-'.repeat(70));
            
            try {
                // Get all files in the folder
                const filesResponse = await drive.files.list({
                    q: `'${recording.id}' in parents and trashed = false`,
                    fields: 'files(id,name,mimeType,size)',
                    pageSize: 100
                });
                
                const files = filesResponse.data.files || [];
                console.log(`  Files found: ${files.length}`);
                
                if (files.length === 0) {
                    console.log('  ⚠️  No files found, skipping...');
                    continue;
                }
                
                // Create session object
                const session = {
                    id: crypto.randomBytes(8).toString('hex'),
                    folderId: recording.id,
                    folderName: recording.name,
                    files: files.map(file => ({
                        id: file.id,
                        name: file.name,
                        mimeType: file.mimeType,
                        size: file.size || 0,
                        folderId: recording.id,
                        folderName: recording.name
                    })),
                    metadata: {
                        folderName: recording.name,
                        folderId: recording.id,
                        fileCount: files.length,
                        dataSource: 'google-drive'
                    },
                    dataSource: 'google-drive',
                    source: 'google-drive'
                };
                
                console.log('  Processing through pipeline...');
                
                // Process through the full pipeline
                await processor.processSession(session);
                
                console.log('  ✅ Successfully processed');
                successCount++;
                
            } catch (error) {
                console.error(`  ❌ Error: ${error.message}`);
                errorCount++;
            }
        }
        
        console.log('\n' + '=' .repeat(70));
        console.log('📊 Processing Complete!');
        console.log(`✅ Successful: ${successCount}`);
        console.log(`❌ Errors: ${errorCount}`);
        console.log(`📝 Total: ${RECORDING_FOLDERS.length}`);
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
    }
}

async function main() {
    console.log('🚀 Starting Rishi & Aarav recordings processing...\n');
    
    try {
        await processRishiAaravRecordings();
    } catch (error) {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    }
}

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });