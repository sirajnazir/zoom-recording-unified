#!/usr/bin/env node

/**
 * Test script to verify standardized file naming
 */

const path = require('path');
const DriveOrganizer = require('./src/infrastructure/services/DriveOrganizer');

// Mock dependencies
const mockLogger = {
    info: console.log,
    debug: console.log,
    warn: console.warn,
    error: console.error
};

const mockConfig = {
    google: {
        drive: {
            recordingsRootFolderId: 'test-root-id',
            studentsFolderId: 'test-students-id',
            coachesFolderId: 'test-coaches-id'
        }
    }
};

const mockGoogleDriveService = {
    uploadFile: async (filePath, metadata) => {
        console.log(`📤 Mock upload: ${metadata.name} to folder ${metadata.parents[0]}`);
        return {
            id: 'mock-file-id',
            name: metadata.name,
            size: '1024',
            webViewLink: 'https://drive.google.com/mock'
        };
    }
};

const mockKnowledgeBaseService = {
    // Mock implementation
};

// Create DriveOrganizer instance
const driveOrganizer = new DriveOrganizer({
    logger: mockLogger,
    config: mockConfig,
    googleDriveService: mockGoogleDriveService,
    knowledgeBaseService: mockKnowledgeBaseService
});

// Test data
const mockRecording = {
    id: 84798350969,
    topic: 'ananyaa and juli ivy level meeting',
    start_time: '2025-07-01T03:00:32Z',
    duration: 72
};

const mockProcessedData = {
    nameAnalysis: {
        standardizedName: 'Coaching_Juli_Ananyaa_Wk26_2025-07-01_M_84798350969U_53eaa505-636f-4acf-81ef-202fa5c4809b',
        components: {
            coach: 'Juli',
            student: 'Ananyaa',
            week: 26,
            sessionType: 'Coaching'
        }
    }
};

const mockSessionFolder = {
    id: 'mock-session-folder-id',
    name: 'Coaching_Juli_Ananyaa_Wk26_2025-07-01_M_84798350969U_53eaa505-636f-4acf-81ef-202fa5c4809b'
};

const mockFiles = {
    video: '/tmp/test-video.mp4',
    audio: '/tmp/test-audio.m4a',
    transcript: '/tmp/test-transcript.vtt',
    timeline: '/tmp/test-timeline.json',
    chat: '/tmp/test-chat.txt'
};

async function testFileNaming() {
    console.log('🧪 Testing standardized file naming...\n');

    // Test 1: Generate standardized file names
    console.log('📝 Test 1: Generate standardized file names');
    const folderName = mockSessionFolder.name;
    
    Object.entries(mockFiles).forEach(([type, filePath]) => {
        const standardizedName = driveOrganizer.generateStandardizedFileName(folderName, type);
        console.log(`   ${type}: ${standardizedName}`);
    });

    // Test 2: Test insights document naming
    console.log('\n📝 Test 2: Insights document naming');
    const insightsDocName = `${folderName}.md`;
    console.log(`   Insights document: ${insightsDocName}`);

    // Test 3: Mock file upload with new naming
    console.log('\n📝 Test 3: Mock file upload with standardized naming');
    
    // Create temporary files for testing
    const fs = require('fs');
    const tempDir = './temp-test-files';
    
    try {
        await fs.promises.mkdir(tempDir, { recursive: true });
        
        // Create temporary test files
        for (const [type, filePath] of Object.entries(mockFiles)) {
            const tempPath = path.join(tempDir, `temp-${type}${path.extname(filePath)}`);
            await fs.promises.writeFile(tempPath, `Mock ${type} content`);
            mockFiles[type] = tempPath;
        }

        // Test upload with new naming
        const uploadedFiles = await driveOrganizer.uploadRecordingFiles(
            mockRecording,
            mockFiles,
            mockSessionFolder
        );

        console.log('\n✅ Upload results:');
        Object.entries(uploadedFiles).forEach(([type, file]) => {
            console.log(`   ${type}: ${file.name}`);
        });

        // Clean up
        await fs.promises.rm(tempDir, { recursive: true, force: true });

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }

    console.log('\n✅ File naming test completed!');
}

// Run the test
testFileNaming().catch(console.error); 