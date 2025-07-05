#!/usr/bin/env node

const { google } = require('googleapis');
const standaloneConfig = require('../../src/drive-source/config/standalone-config');

async function setupTestEnvironment() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         Setup Test Environment for Drive Source (3)            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const auth = new google.auth.JWT(
    standaloneConfig.google.clientEmail,
    null,
    standaloneConfig.google.privateKey,
    ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
  );

  const drive = google.drive({ version: 'v3', auth });
  const sheets = google.sheets({ version: 'v4', auth });

  try {
    // Step 1: Create test folder structure in Google Drive
    console.log('📁 Creating test folder structure...\n');
    
    // Create root test folder
    const rootFolder = await createFolder(drive, 'Drive-Source-Test-Recordings', standaloneConfig.driveSource.s3IvylevelFolderId);
    console.log(`✓ Created root folder: ${rootFolder.name} (${rootFolder.id})`);
    
    // Create subfolders
    const folders = {
      coaches: await createFolder(drive, 'Test-Coaches', rootFolder.id),
      students: await createFolder(drive, 'Test-Students', rootFolder.id),
      misc: await createFolder(drive, 'Test-Misc', rootFolder.id),
      trivial: await createFolder(drive, 'Test-Trivial', rootFolder.id)
    };
    
    console.log(`✓ Created Coaches folder: ${folders.coaches.id}`);
    console.log(`✓ Created Students folder: ${folders.students.id}`);
    console.log(`✓ Created Misc folder: ${folders.misc.id}`);
    console.log(`✓ Created Trivial folder: ${folders.trivial.id}`);

    // Step 2: Create test Google Sheet
    console.log('\n📊 Creating test Google Sheet...\n');
    
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: 'Drive Source Test - Recording Index'
        },
        sheets: [{
          properties: {
            sheetId: 0,
            title: 'Recordings',
            gridProperties: {
              rowCount: 1000,
              columnCount: 20
            }
          }
        }]
      }
    });
    
    console.log(`✓ Created test sheet: ${spreadsheet.data.properties.title}`);
    console.log(`  ID: ${spreadsheet.data.spreadsheetId}`);
    console.log(`  URL: ${spreadsheet.data.spreadsheetUrl}`);

    // Add headers to the sheet
    const headers = [
      'Fingerprint', 'Standardized Name', 'Date', 'Participants', 'Week',
      'Folder Name', 'Folder ID', 'File IDs', 'Source', 'Process Time',
      'Confidence', 'Word Count', 'Duration', 'Speakers', 'Topics',
      'Original Location', 'Status', 'Notes'
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheet.data.spreadsheetId,
      range: 'Recordings!A1:R1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers]
      }
    });

    console.log('✓ Added headers to sheet');

    // Step 3: Generate .env configuration
    console.log('\n📝 Configuration for .env file:\n');
    console.log('# Drive Source Test Environment');
    console.log(`DRIVE_SOURCE_TEST_ROOT=${standaloneConfig.driveSource.s3IvylevelFolderId}`);
    console.log(`DRIVE_SOURCE_RECORDINGS_ROOT=${rootFolder.id}`);
    console.log(`DRIVE_SOURCE_COACHES_FOLDER=${folders.coaches.id}`);
    console.log(`DRIVE_SOURCE_STUDENTS_FOLDER=${folders.students.id}`);
    console.log(`DRIVE_SOURCE_MISC_FOLDER=${folders.misc.id}`);
    console.log(`DRIVE_SOURCE_TRIVIAL_FOLDER=${folders.trivial.id}`);
    console.log(`DRIVE_SOURCE_TEST_SHEET=${spreadsheet.data.spreadsheetId}`);

    console.log('\n✅ Test environment setup complete!');
    console.log('\nNext steps:');
    console.log('1. Add the above configuration to your .env file');
    console.log('2. Run the processing scripts to test with real data');
    console.log('3. Check the test folders and sheet for results');

    // Share the folders and sheet link
    console.log('\n🔗 Quick Links:');
    console.log(`Root Folder: https://drive.google.com/drive/folders/${rootFolder.id}`);
    console.log(`Test Sheet: ${spreadsheet.data.spreadsheetUrl}`);

  } catch (error) {
    console.error('Error setting up test environment:', error.message);
    console.error(error.stack);
  }
}

async function createFolder(drive, name, parentId) {
  try {
    // Check if folder already exists
    const existing = await drive.files.list({
      q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)'
    });

    if (existing.data.files && existing.data.files.length > 0) {
      console.log(`  Folder '${name}' already exists`);
      return existing.data.files[0];
    }

    // Create new folder
    const folder = await drive.files.create({
      requestBody: {
        name: name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      },
      fields: 'id, name'
    });

    return folder.data;
  } catch (error) {
    throw new Error(`Failed to create folder ${name}: ${error.message}`);
  }
}

setupTestEnvironment().catch(console.error);