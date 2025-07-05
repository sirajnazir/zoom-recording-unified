#!/usr/bin/env node

const { google } = require('googleapis');
const config = require('../../config');

async function testSingleFolder() {
  const auth = new google.auth.JWT(
    config.google.clientEmail,
    null,
    config.google.privateKey,
    ['https://www.googleapis.com/auth/drive']
  );
  
  const drive = google.drive({ version: 'v3', auth });
  
  // Test with a specific folder that we know has files
  const testFolderId = '1C4F34xykOiRWwFkDIFg5vR9zn4XHV4It'; // Coaching_Andrew_Rayaan_Wk08
  
  console.log('Testing folder access...\n');
  
  try {
    // Get folder info
    const folderInfo = await drive.files.get({
      fileId: testFolderId,
      fields: 'id, name, webViewLink'
    });
    
    console.log('Folder:', folderInfo.data.name);
    console.log('Link:', folderInfo.data.webViewLink);
    
    // List files in folder
    const response = await drive.files.list({
      q: `'${testFolderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, size, createdTime)',
      pageSize: 100
    });
    
    console.log(`\nFiles found: ${response.data.files.length}`);
    
    response.data.files.forEach(file => {
      const size = file.size ? `${Math.round(file.size / 1024 / 1024)}MB` : 'N/A';
      console.log(`- ${file.name} (${file.mimeType}, ${size})`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.code === 404) {
      console.log('\nTrying with root folder...');
      
      // Try with the root S3-Ivylevel folder
      const rootResponse = await drive.files.list({
        q: `'1Dpq3rSZelQJJePkSi7K6xAY4q62xMiFA' in parents and trashed = false`,
        fields: 'files(id, name, mimeType)',
        pageSize: 10
      });
      
      console.log('\nRoot folder contents:');
      rootResponse.data.files.forEach(file => {
        console.log(`- ${file.name} (${file.id})`);
      });
    }
  }
}

testSingleFolder().catch(console.error);