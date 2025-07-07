#!/usr/bin/env node

// Debug what files are in student folders
const { google } = require('googleapis');
const config = require('./config');

async function debugStudentFiles() {
  console.log('🔍 Debug Student Files\n');

  const auth = new google.auth.JWT(
    config.google.clientEmail,
    null,
    config.google.privateKey,
    ['https://www.googleapis.com/auth/drive']
  );
  const drive = google.drive({ version: 'v3', auth });

  try {
    // Search for one Arshiya folder
    const searchQuery = `name contains 'Arshiya' and name contains 'Wk02' and mimeType = 'application/vnd.google-apps.folder'`;
    const response = await drive.files.list({
      q: searchQuery,
      fields: 'files(id, name)',
      pageSize: 1
    });

    const folder = response.data.files[0];
    if (!folder) {
      console.log('No folder found');
      return;
    }

    console.log(`📁 Folder: ${folder.name}\n`);

    // Get ALL files in this folder
    const filesResponse = await drive.files.list({
      q: `'${folder.id}' in parents`,
      fields: 'files(id, name, mimeType, size, createdTime)',
      pageSize: 50
    });

    const files = filesResponse.data.files || [];
    console.log(`Found ${files.length} files:\n`);

    files.forEach((file, i) => {
      console.log(`${i + 1}. ${file.name}`);
      console.log(`   - MIME Type: ${file.mimeType}`);
      console.log(`   - Size: ${file.size ? (parseInt(file.size) / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'}`);
      console.log(`   - Created: ${file.createdTime}`);
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugStudentFiles();