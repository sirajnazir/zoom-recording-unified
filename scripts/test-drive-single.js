#!/usr/bin/env node
/**
 * Test processing a single Drive recording to verify B indicator and tab routing
 */

require('dotenv').config();
const { createContainer } = require('../src/container');
const MultiTabGoogleSheetsService = require('../src/infrastructure/services/MultiTabGoogleSheetsService');
const IntegratedDriveProcessorV4 = require('../src/drive-source/services/IntegratedDriveProcessorV4');
const awilix = require('awilix');

async function testSingleDriveRecording() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║        Test Single Drive Recording with B Indicator            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    try {
        // Initialize container
        const container = createContainer();
        const scope = container.createScope();
        
        // Override with MultiTabGoogleSheetsService
        scope.register({
            googleSheetsService: awilix.asClass(MultiTabGoogleSheetsService).singleton()
        });
        
        console.log('🔧 Initializing services...');
        
        const googleDrive = scope.resolve('googleDriveService');
        
        // Find a sample recording from Coach Jenny
        const rootFolderId = '1Dpq3rSZelQJJePkSi7K6xAY4q62xMiFA'; // S3-Ivylevel folder
        const folders = await googleDrive.listFolders(rootFolderId);
        const jennyFolder = folders.find(f => f.name === 'Coach Jenny');
        
        if (!jennyFolder) {
            throw new Error('Coach Jenny folder not found');
        }
        
        console.log(`✅ Found Coach Jenny folder: ${jennyFolder.id}\n`);
        
        // Get first student folder
        const studentFolders = await googleDrive.listFolders(jennyFolder.id);
        if (studentFolders.length === 0) {
            throw new Error('No student folders found');
        }
        
        const studentFolder = studentFolders[0];
        console.log(`📁 Processing student: ${studentFolder.name}\n`);
        
        // Get first session folder
        const sessionFolders = await googleDrive.listFolders(studentFolder.id);
        const sessionFolder = sessionFolders.find(f => 
            f.name.includes('Coaching') || f.name.includes('GamePlan')
        );
        
        if (!sessionFolder) {
            throw new Error('No session folder found');
        }
        
        console.log(`📹 Found session: ${sessionFolder.name}`);
        console.log(`   Folder ID: ${sessionFolder.id}\n`);
        
        // Get files in session
        const files = await googleDrive.listFiles(sessionFolder.id);
        console.log(`   Files found: ${files.length}`);
        files.forEach(f => console.log(`     - ${f.name}`));
        console.log('');
        
        // Create a mock session object
        const session = {
            folderId: sessionFolder.id,
            folderName: sessionFolder.name,
            parentPath: `${jennyFolder.name}/${studentFolder.name}`,
            files: files.map(f => ({
                id: f.id,
                name: f.name,
                mimeType: f.mimeType,
                folderId: sessionFolder.id
            })),
            dataSource: 'google-drive' // Ensure B indicator
        };
        
        // Process through IntegratedDriveProcessorV4
        const processor = new IntegratedDriveProcessorV4({
            googleDriveService: googleDrive,
            googleSheetsService: scope.resolve('googleSheetsService'),
            nameStandardizer: scope.resolve('nameStandardizer'),
            weekInferencer: scope.resolve('weekInferencer'),
            metadataExtractor: scope.resolve('metadataExtractor'),
            driveOrganizer: scope.resolve('driveOrganizer'),
            logger: scope.resolve('logger'),
            config: scope.resolve('config')
        });
        
        console.log('🔄 Processing session...\n');
        
        const result = await processor.processSession(session, 'full');
        
        if (result.success) {
            console.log('✅ Processing successful!');
            console.log(`   Standardized name: ${result.standardizedName}`);
            console.log(`   Has B indicator: ${result.standardizedName?.includes('_B_') ? 'YES ✅' : 'NO ❌'}`);
            console.log(`   Updated in sheets: ${result.sheetsUpdated ? 'YES' : 'NO'}`);
            
            console.log('\n📊 Verify in Google Sheets:');
            console.log('   1. Check "Drive Import - Raw" tab');
            console.log('   2. Check "Drive Import - Standardized" tab');
            console.log('   3. Look for the B indicator in the standardized name');
        } else {
            console.error('❌ Processing failed:', result.error);
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

console.log('🚀 Starting single Drive recording test...\n');

testSingleDriveRecording()
    .then(() => {
        console.log('\n✅ Test completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    });
