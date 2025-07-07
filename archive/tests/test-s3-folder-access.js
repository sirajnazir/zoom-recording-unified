const { google } = require('googleapis');
const config = require('./config');

async function testS3FolderAccess() {
  console.log('=== Testing S3-Ivylevel Folder Access ===\n');
  
  try {
    // Initialize Google Drive API
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: config.google.clientEmail,
        private_key: config.google.privateKey,
        type: 'service_account'
      },
      scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });
    
    const drive = google.drive({ version: 'v3', auth });
    
    const folderId = '1Dpq3rSZelQJJePkSi7K6xAY4q62xMiFA';
    
    console.log(`📁 Testing access to folder: ${folderId}`);
    
    // Get folder info
    const folderInfo = await drive.files.get({
      fileId: folderId,
      fields: 'id,name,mimeType,createdTime,modifiedTime'
    });
    
    console.log(`✅ Folder found: ${folderInfo.data.name}`);
    console.log(`   Type: ${folderInfo.data.mimeType}`);
    console.log(`   Created: ${folderInfo.data.createdTime}`);
    console.log(`   Modified: ${folderInfo.data.modifiedTime}`);
    
    // List files in the folder
    console.log('\n📋 Listing files in folder...');
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id,name,mimeType,size,createdTime,modifiedTime)',
      pageSize: 50
    });
    
    const files = response.data.files || [];
    console.log(`\n📊 Found ${files.length} items in folder:`);
    
    if (files.length === 0) {
      console.log('⚠️  No files found in the folder');
      return;
    }
    
    // Group by type
    const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    const documents = files.filter(f => f.mimeType.includes('document'));
    const videos = files.filter(f => f.mimeType.includes('video'));
    const other = files.filter(f => !f.mimeType.includes('folder') && !f.mimeType.includes('document') && !f.mimeType.includes('video'));
    
    console.log(`\n📁 Folders (${folders.length}):`);
    folders.slice(0, 10).forEach(f => {
      console.log(`  - ${f.name} (${f.id})`);
    });
    if (folders.length > 10) console.log(`  ... and ${folders.length - 10} more`);
    
    console.log(`\n📄 Documents (${documents.length}):`);
    documents.slice(0, 5).forEach(f => {
      console.log(`  - ${f.name} (${f.id})`);
    });
    if (documents.length > 5) console.log(`  ... and ${documents.length - 5} more`);
    
    console.log(`\n🎥 Videos (${videos.length}):`);
    videos.slice(0, 5).forEach(f => {
      console.log(`  - ${f.name} (${f.id}) - ${(f.size / 1024 / 1024).toFixed(1)}MB`);
    });
    if (videos.length > 5) console.log(`  ... and ${videos.length - 5} more`);
    
    console.log(`\n📎 Other files (${other.length}):`);
    other.slice(0, 5).forEach(f => {
      console.log(`  - ${f.name} (${f.id}) - ${f.mimeType}`);
    });
    if (other.length > 5) console.log(`  ... and ${other.length - 5} more`);
    
    // Test recursive scan of first subfolder
    if (folders.length > 0) {
      console.log(`\n🔍 Testing recursive scan of first subfolder: ${folders[0].name}`);
      
      const subResponse = await drive.files.list({
        q: `'${folders[0].id}' in parents and trashed=false`,
        fields: 'files(id,name,mimeType,size)',
        pageSize: 20
      });
      
      const subFiles = subResponse.data.files || [];
      console.log(`   Found ${subFiles.length} items in subfolder`);
      
      subFiles.slice(0, 5).forEach(f => {
        const size = f.size ? ` (${(f.size / 1024 / 1024).toFixed(1)}MB)` : '';
        console.log(`     - ${f.name}${size}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error accessing folder:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testS3FolderAccess().catch(console.error); 