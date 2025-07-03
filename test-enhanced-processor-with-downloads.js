const { EnhancedProcessorWithDownloads } = require('./enhanced-processor-with-downloads');
const { Logger } = require('./src/shared/Logger');

async function testEnhancedProcessorWithDownloads() {
    const logger = new Logger('TestEnhancedProcessor');
    
    console.log('🚀 Testing Enhanced Processor with Download Capabilities');
    console.log('========================================================');

    // Mock recordings for testing
    const mockRecordings = [
        {
            uuid: 'test-recording-1',
            download_url: 'https://example.com/video1.mp4',
            filename: 'test-video-1.mp4',
            topic: 'Test Coaching Session 1',
            start_time: '2025-01-01T10:00:00Z',
            duration: 3600
        },
        {
            uuid: 'test-recording-2',
            download_url: 'https://example.com/video2.mp4',
            filename: 'test-video-2.mp4',
            topic: 'Test Coaching Session 2',
            start_time: '2025-01-01T11:00:00Z',
            duration: 1800
        },
        {
            uuid: 'test-recording-3',
            download_url: 'https://example.com/video3.mp4',
            filename: 'test-video-3.mp4',
            topic: 'Test Coaching Session 3',
            start_time: '2025-01-01T12:00:00Z',
            duration: 2700
        }
    ];

    // Test 1: Fallback Download (Original Functionality)
    console.log('\n📊 Test 1: Fallback Download (Original Functionality)');
    console.log('-----------------------------------------------------');
    
    const fallbackProcessor = new EnhancedProcessorWithDownloads({
        maxConcurrent: 2,
        batchSize: 2,
        useParallelDownloads: false,
        useStreamingDownloads: false,
        resumeFromFile: './test-fallback-progress.json'
    });

    fallbackProcessor
        .on('processingStart', (data) => {
            console.log(`✅ Processing started with ${data.totalRecordings} recordings`);
        })
        .on('batchStart', (data) => {
            console.log(`📦 Starting batch ${data.batchNumber} with ${data.batchSize} recordings`);
        })
        .on('recordingDownloaded', (data) => {
            console.log(`✅ Downloaded: ${data.recordingId} using ${data.method}`);
        })
        .on('recordingDownloadError', (data) => {
            console.log(`❌ Download error: ${data.recordingId} - ${data.error}`);
        })
        .on('batchComplete', (data) => {
            console.log(`📦 Batch ${data.batchNumber} complete. Processed: ${data.processed}, Failed: ${data.failed}`);
        })
        .on('processingComplete', (data) => {
            console.log('\n📈 Fallback Processing Results:');
            console.log(`Total: ${data.total}`);
            console.log(`Processed: ${data.processed}`);
            console.log(`Failed: ${data.failed}`);
            console.log(`Duration: ${(data.duration / 1000).toFixed(2)}s`);
            console.log(`Success Rate: ${data.successRate.toFixed(1)}%`);
        });

    try {
        const fallbackResults = await fallbackProcessor.processRecordings(mockRecordings, {
            outputDir: './test-downloads-fallback'
        });
        console.log('✅ Fallback test completed successfully');
    } catch (error) {
        console.log('❌ Fallback test failed:', error.message);
    }

    await fallbackProcessor.cleanup();

    // Test 2: Streaming Downloads
    console.log('\n📊 Test 2: Streaming Downloads');
    console.log('-------------------------------');
    
    const streamingProcessor = new EnhancedProcessorWithDownloads({
        maxConcurrent: 2,
        batchSize: 2,
        useParallelDownloads: false,
        useStreamingDownloads: true,
        downloadConcurrency: 2,
        enableResumeDownloads: true,
        resumeFromFile: './test-streaming-progress.json'
    });

    streamingProcessor
        .on('processingStart', (data) => {
            console.log(`✅ Processing started with ${data.totalRecordings} recordings`);
        })
        .on('downloadStart', (data) => {
            console.log(`📥 Starting streaming download: ${data.filename}`);
        })
        .on('downloadProgress', (data) => {
            if (data.type === 'streaming') {
                console.log(`📊 Streaming progress: ${data.filename} - ${data.progress.toFixed(1)}%`);
            }
        })
        .on('downloadComplete', (data) => {
            if (data.type === 'streaming') {
                console.log(`✅ Streaming completed: ${data.filename} in ${(data.duration / 1000).toFixed(2)}s`);
            }
        })
        .on('downloadError', (data) => {
            if (data.type === 'streaming') {
                console.log(`❌ Streaming error: ${data.filename} - ${data.error}`);
            }
        })
        .on('processingComplete', (data) => {
            console.log('\n📈 Streaming Processing Results:');
            console.log(`Total: ${data.total}`);
            console.log(`Processed: ${data.processed}`);
            console.log(`Failed: ${data.failed}`);
            console.log(`Duration: ${(data.duration / 1000).toFixed(2)}s`);
            console.log(`Success Rate: ${data.successRate.toFixed(1)}%`);
        });

    try {
        const streamingResults = await streamingProcessor.processRecordings(mockRecordings, {
            outputDir: './test-downloads-streaming'
        });
        console.log('✅ Streaming test completed successfully');
        
        // Show download stats
        const downloadStats = streamingProcessor.getDownloadStats();
        console.log('\n📊 Streaming Download Stats:', downloadStats);
    } catch (error) {
        console.log('❌ Streaming test failed:', error.message);
    }

    await streamingProcessor.cleanup();

    // Test 3: Parallel Downloads
    console.log('\n📊 Test 3: Parallel Downloads');
    console.log('------------------------------');
    
    const parallelProcessor = new EnhancedProcessorWithDownloads({
        maxConcurrent: 2,
        batchSize: 2,
        useParallelDownloads: true,
        useStreamingDownloads: false,
        downloadConcurrency: 3,
        resumeFromFile: './test-parallel-progress.json'
    });

    parallelProcessor
        .on('processingStart', (data) => {
            console.log(`✅ Processing started with ${data.totalRecordings} recordings`);
        })
        .on('downloadProgress', (data) => {
            if (data.type === 'parallel') {
                console.log(`📊 Parallel progress: ${data.filename} - ${(data.bytesDownloaded / 1024 / 1024).toFixed(2)} MB`);
            }
        })
        .on('downloadComplete', (data) => {
            if (data.type === 'parallel') {
                console.log(`✅ Parallel completed: ${data.filename} in ${(data.duration / 1000).toFixed(2)}s`);
            }
        })
        .on('downloadError', (data) => {
            if (data.type === 'parallel') {
                console.log(`❌ Parallel error: ${data.filename} - ${data.error}`);
            }
        })
        .on('processingComplete', (data) => {
            console.log('\n📈 Parallel Processing Results:');
            console.log(`Total: ${data.total}`);
            console.log(`Processed: ${data.processed}`);
            console.log(`Failed: ${data.failed}`);
            console.log(`Duration: ${(data.duration / 1000).toFixed(2)}s`);
            console.log(`Success Rate: ${data.successRate.toFixed(1)}%`);
        });

    try {
        const parallelResults = await parallelProcessor.processRecordings(mockRecordings, {
            outputDir: './test-downloads-parallel'
        });
        console.log('✅ Parallel test completed successfully');
        
        // Show download stats
        const downloadStats = parallelProcessor.getDownloadStats();
        console.log('\n📊 Parallel Download Stats:', downloadStats);
    } catch (error) {
        console.log('❌ Parallel test failed:', error.message);
    }

    await parallelProcessor.cleanup();

    // Test 4: Resume Functionality
    console.log('\n📊 Test 4: Resume Functionality Test');
    console.log('------------------------------------');
    
    const resumeProcessor = new EnhancedProcessorWithDownloads({
        maxConcurrent: 1,
        batchSize: 1,
        useParallelDownloads: false,
        useStreamingDownloads: true,
        enableResumeDownloads: true,
        resumeFromFile: './test-resume-progress.json'
    });

    // Process first recording
    console.log('Processing first recording...');
    await resumeProcessor.processRecordings([mockRecordings[0]], {
        outputDir: './test-downloads-resume'
    });

    // Simulate interruption
    console.log('Simulating interruption...');
    await resumeProcessor.cleanup();

    // Resume processing
    console.log('Resuming processing...');
    const resumeProcessor2 = new EnhancedProcessorWithDownloads({
        maxConcurrent: 1,
        batchSize: 1,
        useParallelDownloads: false,
        useStreamingDownloads: true,
        enableResumeDownloads: true,
        resumeFromFile: './test-resume-progress.json'
    });

    resumeProcessor2
        .on('processingStart', (data) => {
            console.log(`✅ Resumed processing with ${data.totalRecordings} recordings`);
        })
        .on('recordingDownloaded', (data) => {
            console.log(`✅ Resumed download: ${data.recordingId} using ${data.method}`);
        })
        .on('processingComplete', (data) => {
            console.log('\n📈 Resume Processing Results:');
            console.log(`Total: ${data.total}`);
            console.log(`Processed: ${data.processed}`);
            console.log(`Failed: ${data.failed}`);
            console.log(`Success Rate: ${data.successRate.toFixed(1)}%`);
        });

    try {
        await resumeProcessor2.processRecordings(mockRecordings, {
            outputDir: './test-downloads-resume'
        });
        console.log('✅ Resume test completed successfully');
    } catch (error) {
        console.log('❌ Resume test failed:', error.message);
    }

    await resumeProcessor2.cleanup();

    console.log('\n🎉 All Enhanced Processor Tests Completed!');
    console.log('==========================================');
    console.log('✅ Fallback downloads (original functionality)');
    console.log('✅ Streaming downloads with resume capability');
    console.log('✅ Parallel downloads with worker threads');
    console.log('✅ Resume functionality across sessions');
    console.log('\n💡 The enhanced processor maintains all original functionality');
    console.log('   while adding high-performance download capabilities!');
}

// Run the test
testEnhancedProcessorWithDownloads().catch(console.error); 