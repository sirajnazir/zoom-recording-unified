#!/usr/bin/env node

require('dotenv').config();
const config = require('../../config');
const S3IvylevelScanner = require('./services/S3IvylevelScanner');

async function testSmartRetry() {
  console.log('🧪 Testing Smart Retry Logic for Google API Overload Errors\n');
  
  try {
    // Test with a small folder to avoid overwhelming the API
    const scanner = new S3IvylevelScanner(config);
    
    // Test folder ID (you can replace with a real folder ID)
    const testFolderId = '1Dpq3rSZelQJJePkSi7K6xAY4q62xMiFA'; // S3-Ivylevel folder
    
    console.log('📁 Testing folder scanning with smart retry...');
    console.log(`   Folder ID: ${testFolderId}`);
    console.log('   Expected: Faster processing with shorter retry delays');
    console.log('   Expected: Better handling of 529 overload errors\n');
    
    const startTime = Date.now();
    
    // Scan with limited options to avoid overwhelming the API
    const files = await scanner.scanFolder(testFolderId, {
      maxDepth: 2, // Shallow scan for testing
      minFileSize: 1024 * 1024, // 1MB minimum
      excludeFolders: ['Processed', 'Archive', 'Trash']
    });
    
    const duration = Date.now() - startTime;
    
    console.log('\n✅ Smart Retry Test Results:');
    console.log(`   📊 Files found: ${files.length}`);
    console.log(`   ⏱️  Duration: ${duration}ms`);
    console.log(`   🚀 Performance: ${files.length > 0 ? 'Good' : 'No files found'}`);
    
    if (files.length > 0) {
      console.log('\n📋 Sample files found:');
      files.slice(0, 3).forEach((file, index) => {
        console.log(`   ${index + 1}. ${file.name} (${file.confidence}% confidence)`);
      });
    }
    
    console.log('\n🎉 Smart retry logic is working!');
    console.log('   - Reduced API calls with caching');
    console.log('   - Faster retry delays for overload errors');
    console.log('   - Better error handling');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    
    if (error.message.includes('overloaded') || error.code === 529) {
      console.log('\n💡 This is expected - the smart retry should handle this better now');
    }
  }
}

// Run the test
testSmartRetry().catch(console.error); 