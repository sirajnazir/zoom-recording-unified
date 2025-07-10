#!/usr/bin/env node

/**
 * Test script to process only GamePlan folders
 * Demonstrates proper folder-based grouping
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
    console.log('🎮 GamePlan Folder Processing Test');
    console.log('=' .repeat(50));
    
    try {
        // Initialize services
        const container = createContainer();
        const scope = container.createScope();
        
        // Override with MultiTabGoogleSheetsService
        scope.register({
            googleSheetsService: awilix.asClass(MultiTabGoogleSheetsService).singleton()
        });
        
        // Initialize Google Drive
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: config.google.clientEmail,
                private_key: config.google.privateKey
            },
            scopes: ['https://www.googleapis.com/auth/drive.readonly']
        });
        
        const drive = google.drive({ version: 'v3', auth });
        
        // Create processor
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
        
        // Get GamePlan folders directly
        const gameplanFolders = [
            {
                id: '10smNG7SizEERM6RbBViKv0jLnFMSWb3g',
                name: 'GamePlan_JennyDuan_Kavya_Wk00A_2024-06-10_10smNG7SizEERM6RbBViKv0jLnFMSWb3g'
            },
            {
                id: '1OgwxulBFURXTlO4CnXWKs6gtuVKLWgZh',
                name: 'GamePlan_JennyDuan_Kavya_Wk00B_2024-06-23_1OgwxulBFURXTlO4CnXWKs6gtuVKLWgZh'
            }
        ];
        
        console.log(`\n📁 Processing ${gameplanFolders.length} GamePlan folders...\n`);
        
        for (const folder of gameplanFolders) {
            console.log(`\n🎯 Processing ${folder.name}`);
            console.log('-'.repeat(50));
            
            // Get files in folder
            const filesResponse = await drive.files.list({
                q: `'${folder.id}' in parents and trashed = false`,
                fields: 'files(id, name, mimeType, size, createdTime, modifiedTime)',
                pageSize: 1000
            });
            
            const files = filesResponse.data.files || [];
            console.log(`   Files found: ${files.length}`);
            files.forEach(f => console.log(`     - ${f.name}`));
            
            // Create session object
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
                    folderName: folder.name,
                    createdTime: file.createdTime,
                    modifiedTime: file.modifiedTime
                })),
                metadata: {
                    folderName: folder.name,
                    folderId: folder.id,
                    fileCount: files.length
                },
                dataSource: 'google-drive',
                source: 'google-drive'
            };
            
            // Process the session
            try {
                console.log(`\n   🔄 Processing as single session...`);
                const result = await processor.processRecording(session);
                
                if (result.success) {
                    console.log(`   ✅ Success!`);
                    console.log(`      Standardized: ${result.standardizedName}`);
                    console.log(`      B indicator: ${result.standardizedName?.includes('_B_') ? 'YES ✓' : 'NO ✗'}`);
                    console.log(`      Sheet updated: ${result.sheetsUpdated ? 'YES ✓' : 'NO ✗'}`);
                } else {
                    console.log(`   ❌ Failed: ${result.error}`);
                }
            } catch (error) {
                console.error(`   ❌ Error: ${error.message}`);
            }
        }
        
        console.log('\n' + '='.repeat(50));
        console.log('✅ Test complete!');
        console.log('\n📊 Check the Drive Import tabs in Google Sheets');
        console.log('   Each GamePlan folder should appear as ONE row');
        console.log('   All files from the folder should be grouped together');
        
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