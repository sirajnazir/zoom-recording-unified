const S3IvylevelScanner = require('./services/S3IvylevelScanner');
const RecordingMatcher = require('./services/RecordingMatcher');
const fs = require('fs').promises;
const path = require('path');
const config = require('../../config');

async function discoverAllSessions() {
  console.log('=== Session Discovery Script ===\n');
  
  try {
    // Create services
    const scanner = new S3IvylevelScanner(config);
    const matcher = new RecordingMatcher();
    
    console.log('✅ Services initialized');
    
    // Get coach folders
    const coachFolders = await scanner.getCoachFolders();
    console.log(`Found ${coachFolders.length} coach folders`);
    
    if (coachFolders.length === 0) {
      console.log('No coach folders found');
      return;
    }
    
    // Scan all folders
    console.log('\n🔍 Scanning all coach folders...');
    const allFiles = [];
    
    for (const [index, folder] of coachFolders.entries()) {
      console.log(`[${index + 1}/${coachFolders.length}] Scanning ${folder.name}...`);
      const files = await scanner.scanFolder(folder.id, {
        recursive: true,
        maxDepth: 5,
        minFileSize: 100 * 1024
      });
      allFiles.push(...files);
      console.log(`  Found ${files.length} files`);
    }
    
    console.log(`\nTotal files found: ${allFiles.length}`);
    
    if (allFiles.length === 0) {
      console.log('No files found');
      return;
    }
    
    // Group into sessions
    console.log('\nGrouping files into sessions...');
    const sessions = await matcher.matchRecordings(allFiles);
    const { validSessions, invalidSessions } = matcher.validateSessions(sessions);
    
    console.log(`Valid sessions: ${validSessions.length}`);
    console.log(`Invalid sessions: ${invalidSessions.length}`);
    
    if (validSessions.length === 0) {
      console.log('No valid sessions found');
      return;
    }
    
    // Save sessions to file
    const sessionsFile = path.join(__dirname, 'discovered-sessions.json');
    const sessionsData = {
      discoveredAt: new Date().toISOString(),
      totalFiles: allFiles.length,
      validSessions: validSessions.length,
      invalidSessions: invalidSessions.length,
      sessions: validSessions
    };
    
    await fs.writeFile(sessionsFile, JSON.stringify(sessionsData, null, 2));
    
    console.log(`\n✅ Saved ${validSessions.length} sessions to: ${sessionsFile}`);
    
    // Show session summary
    console.log('\n=== Session Summary ===');
    const coachCounts = {};
    const weekCounts = {};
    
    validSessions.forEach(session => {
      const folderName = session.folderName || 'Unknown';
      
      // Count by coach
      if (folderName.includes('Andrew')) coachCounts['Andrew'] = (coachCounts['Andrew'] || 0) + 1;
      else if (folderName.includes('Alan')) coachCounts['Alan'] = (coachCounts['Alan'] || 0) + 1;
      else if (folderName.includes('Jenny')) coachCounts['Jenny'] = (coachCounts['Jenny'] || 0) + 1;
      else if (folderName.includes('Juli')) coachCounts['Juli'] = (coachCounts['Juli'] || 0) + 1;
      else coachCounts['Other'] = (coachCounts['Other'] || 0) + 1;
      
      // Count by week
      const weekMatch = folderName.match(/Wk(\d+)/);
      if (weekMatch) {
        const week = weekMatch[1];
        weekCounts[`Week ${week}`] = (weekCounts[`Week ${week}`] || 0) + 1;
      }
    });
    
    console.log('\nBy Coach:');
    Object.entries(coachCounts).forEach(([coach, count]) => {
      console.log(`  ${coach}: ${count} sessions`);
    });
    
    console.log('\nBy Week:');
    Object.entries(weekCounts)
      .sort(([a], [b]) => {
        const weekA = parseInt(a.match(/\d+/)[0]);
        const weekB = parseInt(b.match(/\d+/)[0]);
        return weekA - weekB;
      })
      .forEach(([week, count]) => {
        console.log(`  ${week}: ${count} sessions`);
      });
    
    console.log('\n📋 Next steps:');
    console.log(`1. Run: node src/drive-source/process-discovered-sessions.js`);
    console.log(`2. Or process in batches: node src/drive-source/process-discovered-sessions.js --startFrom 0 --maxSessions 50`);
    
  } catch (error) {
    console.error('❌ Discovery failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

discoverAllSessions(); 