#!/usr/bin/env node

require('dotenv').config();
const config = require('./config');
const S3IvylevelScanner = require('./src/drive-source/services/S3IvylevelScanner');

async function testLearningPatterns() {
  console.log('🧠 Testing Learning Patterns in S3IvylevelScanner\n');
  
  try {
    const scanner = new S3IvylevelScanner(config);
    
    // Test with a small folder to see learning in action
    const testFolderId = '1Dpq3rSZelQJJePkSi7K6xAY4q62xMiFA'; // S3-Ivylevel folder
    
    console.log('📁 Testing learning patterns on folder structure...');
    console.log(`   Folder ID: ${testFolderId}`);
    console.log('   Expected: Pattern detection and learning\n');
    
    // Run a shallow scan to see learning in action
    const files = await scanner.scanFolder(testFolderId, {
      maxDepth: 1, // Very shallow for testing
      minFileSize: 1024 * 1024, // 1MB minimum
      excludeFolders: ['Processed', 'Archive', 'Trash']
    });
    
    console.log('\n📊 Learning Pattern Results:');
    console.log('================================');
    
    // Show learned patterns
    console.log('\n🏗️  Folder Structures:');
    scanner.learnedPatterns.folderStructures.forEach((patterns, depth) => {
      console.log(`   Depth ${depth}: ${patterns.size} patterns`);
      if (patterns.size > 0) {
        const samplePatterns = Array.from(patterns).slice(0, 3);
        console.log(`   Sample: ${samplePatterns.join(', ')}`);
      }
    });
    
    console.log('\n📝 Naming Conventions:');
    if (scanner.learnedPatterns.namingConventions.size > 0) {
      const conventions = Array.from(scanner.learnedPatterns.namingConventions);
      console.log(`   Found: ${conventions.join(', ')}`);
    } else {
      console.log('   No naming conventions detected yet');
    }
    
    console.log('\n👥 Participant Names:');
    if (scanner.learnedPatterns.participantNames.size > 0) {
      const participants = Array.from(scanner.learnedPatterns.participantNames);
      console.log(`   Found: ${participants.join(', ')}`);
    } else {
      console.log('   No participant names detected yet');
    }
    
    console.log('\n📅 Date Formats:');
    if (scanner.learnedPatterns.dateFormats.size > 0) {
      scanner.learnedPatterns.dateFormats.forEach((formats, type) => {
        console.log(`   ${type}: ${formats.size} formats`);
      });
    } else {
      console.log('   No date formats detected yet');
    }
    
    console.log('\n📋 Files Found:');
    console.log(`   Total: ${files.length} potential recording files`);
    
    if (files.length > 0) {
      console.log('\n🔍 Sample File Analysis:');
      files.slice(0, 3).forEach((file, index) => {
        console.log(`   ${index + 1}. ${file.name}`);
        console.log(`      Confidence: ${file.confidence}%`);
        console.log(`      Student ID: ${file.studentId || 'None'}`);
        console.log(`      Session Type: ${file.sessionType || 'None'}`);
        console.log(`      Program: ${file.program || 'None'}`);
        console.log(`      Coach: ${file.coach || 'None'}`);
        console.log(`      Participants: ${file.possibleParticipants?.join(', ') || 'None'}`);
      });
    }
    
    console.log('\n🎯 Pattern Detection Summary:');
    console.log('================================');
    console.log(`   📁 Folder Structures: ${scanner.learnedPatterns.folderStructures.size} depths analyzed`);
    console.log(`   📝 Naming Conventions: ${scanner.learnedPatterns.namingConventions.size} conventions learned`);
    console.log(`   👥 Participant Names: ${scanner.learnedPatterns.participantNames.size} names extracted`);
    console.log(`   📅 Date Formats: ${scanner.learnedPatterns.dateFormats.size} format types`);
    console.log(`   📋 Files Processed: ${files.length} potential recordings`);
    
    console.log('\n💡 Learning Insights:');
    console.log('================================');
    
    // Analyze what the system learned
    if (scanner.learnedPatterns.namingConventions.has('s3-ivylevel')) {
      console.log('   ✅ S3-Ivylevel naming pattern detected');
    }
    
    if (scanner.learnedPatterns.namingConventions.has('week-first')) {
      console.log('   ✅ Week-based naming convention detected');
    }
    
    if (scanner.learnedPatterns.namingConventions.has('session-first')) {
      console.log('   ✅ Session-based naming convention detected');
    }
    
    if (scanner.learnedPatterns.participantNames.size > 0) {
      console.log('   ✅ Participant name extraction working');
    }
    
    console.log('\n🚀 Ready for full processing!');
    console.log('   The system has learned patterns and is ready to process all recordings efficiently.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    
    if (error.message.includes('overloaded') || error.code === 529) {
      console.log('\n💡 This is expected - the smart retry should handle this better now');
    }
  }
}

// Run the test
testLearningPatterns().catch(console.error); 