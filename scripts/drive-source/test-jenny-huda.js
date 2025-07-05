#!/usr/bin/env node

const { google } = require('googleapis');
const path = require('path');
const config = require('../../config');

async function testJennyHuda() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║          Test Processing: Coach Jenny & Huda Sessions          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const auth = new google.auth.JWT(
    config.google.clientEmail,
    null,
    config.google.privateKey,
    ['https://www.googleapis.com/auth/drive']
  );
  
  const drive = google.drive({ version: 'v3', auth });
  
  try {
    // Step 1: Find Jenny's folder
    console.log('🔍 Looking for Coach Jenny folder...');
    const jennyFolderId = '1hlwz3XSGz53Q1OPmVHAzLf4-46CAmh40';
    
    // List subfolders in Jenny's folder
    const response = await drive.files.list({
      q: `'${jennyFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      pageSize: 100
    });
    
    console.log(`\nFound ${response.data.files.length} subfolders:`);
    response.data.files.forEach(folder => {
      console.log(`- ${folder.name} (${folder.id})`);
    });
    
    // Find Huda's folder
    const hudaFolder = response.data.files.find(f => f.name.includes('Huda'));
    if (!hudaFolder) {
      console.log('❌ Could not find Huda folder');
      return;
    }
    
    console.log(`\n✅ Found Huda folder: ${hudaFolder.name}`);
    
    // Step 2: Scan Huda's folder for session folders
    console.log('\n🔍 Scanning for session folders...');
    const sessionResponse = await drive.files.list({
      q: `'${hudaFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      pageSize: 20
    });
    
    const sessionFolders = sessionResponse.data.files
      .filter(f => f.name.includes('Coaching') || f.name.includes('GamePlan'))
      .slice(0, 5); // Take first 5 sessions
    
    console.log(`\nFound ${sessionFolders.length} session folders to process:`);
    sessionFolders.forEach(folder => {
      console.log(`- ${folder.name}`);
    });
    
    // Step 3: Scan one session folder to see files
    if (sessionFolders.length > 0) {
      console.log(`\n📁 Examining first session: ${sessionFolders[0].name}`);
      
      const filesResponse = await drive.files.list({
        q: `'${sessionFolders[0].id}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType, size)',
        pageSize: 100
      });
      
      console.log(`\nFiles in session:`);
      filesResponse.data.files.forEach(file => {
        const size = file.size ? `${Math.round(file.size / 1024 / 1024)}MB` : 'N/A';
        console.log(`  - ${file.name} (${size})`);
      });
      
      // Extract metadata from folder name
      console.log('\n📊 Extracted metadata from folder name:');
      const folderName = sessionFolders[0].name;
      const patterns = {
        coach: /Coaching_([^_]+)_/,
        student: /Coaching_[^_]+_([^_]+)_/,
        week: /Wk(\d+)/,
        date: /(\d{4}-\d{2}-\d{2})/
      };
      
      Object.entries(patterns).forEach(([key, pattern]) => {
        const match = folderName.match(pattern);
        if (match) {
          console.log(`  ${key}: ${match[1]}`);
        }
      });
    }
    
    // Step 4: Show what would be processed
    console.log('\n💡 Processing Plan:');
    console.log('1. Extract coach name: Jenny Duan');
    console.log('2. Extract student name: Huda');
    console.log('3. Extract week number from folder name');
    console.log('4. Extract date from folder name or GMT timestamp');
    console.log('5. Generate standardized name: YYYY-MM-DD_Jenny-Huda_Week#_UUID-XXXX');
    console.log('6. Move files to standardized structure');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testJennyHuda().catch(console.error);