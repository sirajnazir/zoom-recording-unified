const S3IvylevelScanner = require('./services/S3IvylevelScanner');
const RecordingMatcher = require('./services/RecordingMatcher');
const fs = require('fs').promises;
const config = require('../../config');

async function discoverSessions() {
  console.log('=== Session Discovery ===\n');
  
  try {
    const scanner = new S3IvylevelScanner(config);
    const matcher = new RecordingMatcher();
    
    // Get coach folders
    const coachFolders = await scanner.getCoachFolders();
    console.log(`Found ${coachFolders.length} coach folders`);
    
    // Scan all folders
    console.log('\n🔍 Scanning folders...');
    const allFiles = [];
    
    for (const folder of coachFolders) {
      console.log(`Scanning ${folder.name}...`);
      const files = await scanner.scanFolder(folder.id, {
        recursive: true,
        maxDepth: 5,
        minFileSize: 100 * 1024
      });
      allFiles.push(...files);
      console.log(`  Found ${files.length} files`);
    }
    
    console.log(`\nTotal files: ${allFiles.length}`);
    
    // Group into sessions
    console.log('\nGrouping into sessions...');
    const sessions = await matcher.matchRecordings(allFiles);
    const { validSessions } = matcher.validateSessions(sessions);
    
    console.log(`Valid sessions: ${validSessions.length}`);
    
    // Save to file
    const data = {
      discoveredAt: new Date().toISOString(),
      totalFiles: allFiles.length,
      validSessions: validSessions.length,
      sessions: validSessions
    };
    
    await fs.writeFile('discovered-sessions.json', JSON.stringify(data, null, 2));
    console.log(`\n✅ Saved ${validSessions.length} sessions to discovered-sessions.json`);
    
  } catch (error) {
    console.error('❌ Failed:', error.message);
  }
}

discoverSessions(); 