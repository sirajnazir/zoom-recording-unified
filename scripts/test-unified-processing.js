#!/usr/bin/env node

/**
 * Test Unified Processing - Limited to first few recordings
 */

require('dotenv').config();
const { google } = require('googleapis');
const { createContainer } = require('../src/container');
const IntegratedDriveProcessorV4 = require('../src/drive-source/services/IntegratedDriveProcessorV4');
const MultiTabGoogleSheetsService = require('../src/infrastructure/services/MultiTabGoogleSheetsService');
const awilix = require('awilix');
const crypto = require('crypto');

const config = require('../config');

async function main() {
    console.log('🧪 Testing Unified Drive Processing');
    console.log('=' .repeat(50));
    
    try {
        // Initialize services
        const container = createContainer();
        const scope = container.createScope();
        
        scope.register({
            googleSheetsService: awilix.asClass(MultiTabGoogleSheetsService).singleton()
        });
        
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: config.google.clientEmail,
                private_key: config.google.privateKey
            },
            scopes: ['https://www.googleapis.com/auth/drive.readonly']
        });
        
        const drive = google.drive({ version: 'v3', auth });
        
        const processor = new IntegratedDriveProcessorV4(config, {
            googleDriveService: scope.resolve('googleDriveService'),
            googleSheetsService: scope.resolve('googleSheetsService'),
            nameStandardizer: scope.resolve('nameStandardizer'),
            weekInferencer: scope.resolve('weekInferencer'),
            metadataExtractor: scope.resolve('metadataExtractor'),
            driveOrganizer: scope.resolve('driveOrganizer'),
            logger: scope.resolve('logger'),
            config: scope.resolve('config')
        });
        
        // Test with specific recording folders
        const testFolders = [
            {
                id: '1avx9QBsaurpc26oCPVXkoce6DSkP2qts',
                name: 'Coaching_Aditi_Kavya_Wk07_2024-09-01_1avx9QBsaurpc26oCPVXkoce6DSkP2qts'
            },
            {
                id: '10smNG7SizEERM6RbBViKv0jLnFMSWb3g',
                name: 'GamePlan_JennyDuan_Kavya_Wk00A_2024-06-10_10smNG7SizEERM6RbBViKv0jLnFMSWb3g'
            }
        ];
        
        console.log(`\n📁 Testing with ${testFolders.length} recording folders\n`);
        
        for (const folder of testFolders) {
            console.log(`\n🎯 Processing: ${folder.name}`);
            console.log('-'.repeat(70));
            
            // Get ALL files in this folder
            const filesResponse = await drive.files.list({
                q: `'${folder.id}' in parents and trashed = false`,
                fields: 'files(id, name, mimeType, size)',
                pageSize: 1000
            });
            
            const files = filesResponse.data.files || [];
            console.log(`   📁 Total files in folder: ${files.length}`);
            
            // Group by type
            const fileTypes = {
                video: files.filter(f => f.name.toLowerCase().includes('.mp4')),
                audio: files.filter(f => f.name.toLowerCase().includes('.m4a')),
                transcript: files.filter(f => f.name.toLowerCase().includes('.vtt')),
                chat: files.filter(f => f.name.toLowerCase().includes('.txt')),
                other: files.filter(f => !f.name.match(/\.(mp4|m4a|vtt|txt)$/i))
            };
            
            console.log(`   📹 Videos: ${fileTypes.video.length}`);
            console.log(`   🔊 Audio: ${fileTypes.audio.length}`);
            console.log(`   📝 Transcripts: ${fileTypes.transcript.length}`);
            console.log(`   💬 Chat: ${fileTypes.chat.length}`);
            console.log(`   📄 Other: ${fileTypes.other.length}`);
            
            // Show all files
            console.log(`\n   Files:`);
            files.forEach(f => console.log(`     - ${f.name} (${Math.round(f.size / 1024 / 1024)}MB)`));
            
            // Create ONE session with ALL files
            const session = {
                id: crypto.randomBytes(8).toString('hex'),
                folderId: folder.id,
                folderName: folder.name,
                files: files.map(file => ({
                    id: file.id,
                    name: file.name,
                    mimeType: file.mimeType,
                    size: file.size,
                    folderId: folder.id,
                    folderName: folder.name
                })),
                metadata: {
                    folderName: folder.name,
                    folderId: folder.id,
                    fileCount: files.length
                },
                dataSource: 'google-drive',
                source: 'google-drive'
            };
            
            console.log(`\n   🔄 Processing as ONE session with ${files.length} files...`);
            
            try {
                const result = await processor.processRecording(session);
                
                if (result.success) {
                    console.log(`   ✅ Success!`);
                    console.log(`      Session ID: ${session.id}`);
                    console.log(`      Standardized: ${result.standardizedName}`);
                    console.log(`      B indicator: ${result.standardizedName?.includes('_B_') ? 'YES ✓' : 'NO ✗'}`);
                } else {
                    console.log(`   ❌ Failed: ${result.error}`);
                }
            } catch (error) {
                console.error(`   ❌ Error: ${error.message}`);
            }
        }
        
        console.log('\n' + '='.repeat(70));
        console.log('✅ Test complete!');
        console.log('\n📊 Expected results:');
        console.log('   - Wk07 folder: Should appear as 1 row with 5 files grouped');
        console.log('   - GamePlan folder: Should appear as 1 row with 4 files grouped');
        console.log('   - Check the Drive Import - Standardized tab');
        
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('Script failed:', error);
        process.exit(1);
    });