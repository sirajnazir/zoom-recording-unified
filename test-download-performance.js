const { ParallelDownloadProcessor } = require('./parallel-download-processor');
const { StreamingDownloadProcessor } = require('./streaming-download-processor');
const { Logger } = require('./src/shared/Logger');

async function testDownloadPerformance() {
    const logger = new Logger('DownloadPerformanceTest');
    
    // Mock recordings for testing
    const mockRecordings = [
        {
            uuid: 'test-1',
            download_url: 'https://example.com/video1.mp4',
            filename: 'test-video-1.mp4'
        },
        {
            uuid: 'test-2', 
            download_url: 'https://example.com/video2.mp4',
            filename: 'test-video-2.mp4'
        }
        // Add more mock recordings as needed
    ];

    console.log('🚀 Download Performance Comparison');
    console.log('===================================');

    // Test 1: Parallel Download Processor
    console.log('\n📊 Test 1: Parallel Download Processor');
    console.log('----------------------------------------');
    
    const parallelProcessor = new ParallelDownloadProcessor({
        maxConcurrent: 8,
        maxRetries: 3,
        timeout: 300000,
        connectionPool: 20
    });

    parallelProcessor
        .on('progress', (data) => {
            console.log(`📥 Progress: ${data.filename} - ${(data.bytesDownloaded / 1024 / 1024).toFixed(2)} MB`);
        })
        .on('fileComplete', (data) => {
            console.log(`✅ Completed: ${data.filename} in ${(data.duration / 1000).toFixed(2)}s`);
        })
        .on('fileError', (data) => {
            console.log(`❌ Error: ${data.filename} - ${data.error}`);
        })
        .on('complete', (stats) => {
            console.log('\n📈 Parallel Download Results:');
            console.log(`Total: ${stats.total}`);
            console.log(`Completed: ${stats.completed}`);
            console.log(`Failed: ${stats.failed}`);
            console.log(`Duration: ${(stats.duration / 1000).toFixed(2)}s`);
            console.log(`Total Bytes: ${(stats.totalBytes / 1024 / 1024).toFixed(2)} MB`);
            console.log(`Average Speed: ${(stats.averageSpeed / 1024 / 1024).toFixed(2)} MB/s`);
        });

    const startTime1 = Date.now();
    parallelProcessor.addRecordings(mockRecordings);
    await parallelProcessor.start();
    const parallelDuration = Date.now() - startTime1;

    // Test 2: Streaming Download Processor
    console.log('\n📊 Test 2: Streaming Download Processor');
    console.log('----------------------------------------');
    
    const streamingProcessor = new StreamingDownloadProcessor({
        maxConcurrent: 4,
        resumeDownloads: true,
        verifyChecksums: false
    });

    streamingProcessor
        .on('downloadStart', (data) => {
            console.log(`📥 Starting: ${data.filename}`);
        })
        .on('downloadProgress', (data) => {
            console.log(`📊 Progress: ${data.filename} - ${data.progress.toFixed(1)}% (${(data.speed / 1024 / 1024).toFixed(2)} MB/s)`);
        })
        .on('downloadComplete', (data) => {
            console.log(`✅ Completed: ${data.filename} in ${(data.duration / 1000).toFixed(2)}s`);
        })
        .on('downloadError', (data) => {
            console.log(`❌ Error: ${data.filename} - ${data.error}`);
        });

    const startTime2 = Date.now();
    const results = await streamingProcessor.downloadFiles(mockRecordings, './downloads');
    const streamingDuration = Date.now() - startTime2;

    console.log('\n📈 Streaming Download Results:');
    const streamingStats = streamingProcessor.getStats();
    console.log(`Total: ${streamingStats.total}`);
    console.log(`Completed: ${streamingStats.completed}`);
    console.log(`Failed: ${streamingStats.failed}`);
    console.log(`Duration: ${(streamingDuration / 1000).toFixed(2)}s`);
    console.log(`Total Bytes: ${(streamingStats.totalBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Average Speed: ${(streamingStats.averageSpeed / 1024 / 1024).toFixed(2)} MB/s`);

    // Performance Comparison
    console.log('\n🏆 Performance Comparison');
    console.log('=========================');
    console.log(`Parallel Download: ${(parallelDuration / 1000).toFixed(2)}s`);
    console.log(`Streaming Download: ${(streamingDuration / 1000).toFixed(2)}s`);
    
    if (parallelDuration < streamingDuration) {
        console.log(`✅ Parallel Download is ${((streamingDuration - parallelDuration) / streamingDuration * 100).toFixed(1)}% faster`);
    } else {
        console.log(`✅ Streaming Download is ${((parallelDuration - streamingDuration) / parallelDuration * 100).toFixed(1)}% faster`);
    }

    // Recommendations
    console.log('\n💡 Recommendations:');
    console.log('===================');
    console.log('• Use Parallel Download for:');
    console.log('  - High-speed internet connections');
    console.log('  - Large numbers of small files');
    console.log('  - When you need maximum throughput');
    console.log('');
    console.log('• Use Streaming Download for:');
    console.log('  - Large files that might get interrupted');
    console.log('  - Unstable network connections');
    console.log('  - When you need resume capability');
    console.log('  - Memory-constrained environments');
}

// Run the test
testDownloadPerformance().catch(console.error); 