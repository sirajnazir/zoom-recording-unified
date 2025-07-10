// Process a small sample of Google Drive recordings
require('dotenv').config();
const path = require('path');
const { google } = require('googleapis');

async function processDriveSample() {
    console.log('🚀 Processing sample Google Drive recordings...\n');
    
    try {
        // Decode service account key
        let credentials;
        if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
            const decoded = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf-8');
            credentials = JSON.parse(decoded);
            console.log('✅ Authentication configured');
        } else {
            throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not found');
        }
        
        // Initialize Google APIs
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: [
                'https://www.googleapis.com/auth/drive',
                'https://www.googleapis.com/auth/spreadsheets'
            ]
        });
        
        const drive = google.drive({ version: 'v3', auth });
        const sheets = google.sheets({ version: 'v4', auth });
        
        // Jenny's first coaching folder
        const testFolderId = '1GpvhZWEAX1aYrmSPHxJnDnC8WtCr65-2';
        const folderName = 'GamePlan_JennyDuan_Arshiya_Wk00_2024-09-14';
        
        console.log(`📁 Processing: ${folderName}`);
        console.log(`   Folder ID: ${testFolderId}`);
        
        // Get files
        const response = await drive.files.list({
            q: `'${testFolderId}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType, size)',
            pageSize: 100
        });
        
        const files = response.data.files || [];
        console.log(`   Found ${files.length} files`);
        
        // Extract metadata
        const sessionData = {
            sessionType: 'GamePlan',
            coach: 'Jenny Duan',
            student: 'Arshiya',
            week: '00',
            date: '2024-09-14',
            folderId: testFolderId,
            folderName: folderName,
            files: files.map(f => ({
                name: f.name,
                type: getFileType(f.name, f.mimeType),
                id: f.id
            })),
            dataSource: 'google-drive',
            timestamp: new Date().toISOString()
        };
        
        console.log('\n📊 Session metadata:');
        console.log(JSON.stringify(sessionData, null, 2));
        
        // Add to Google Sheets
        const spreadsheetId = process.env.MASTER_INDEX_SHEET_ID;
        console.log(`\n📊 Adding to Google Sheets (${spreadsheetId})...`);
        
        // Prepare row data for Drive Import - Raw tab
        const rawRow = [
            sessionData.folderId,                      // A: Folder ID
            sessionData.folderName,                    // B: Folder Name
            sessionData.sessionType,                   // C: Session Type
            sessionData.coach,                         // D: Coach
            sessionData.student,                       // E: Student
            sessionData.week,                          // F: Week
            sessionData.date,                          // G: Date
            sessionData.files.length,                  // H: File Count
            JSON.stringify(sessionData.files),         // I: Files JSON
            sessionData.dataSource,                    // J: Data Source
            sessionData.timestamp,                     // K: Processed At
            'sample-uuid-' + Date.now(),              // L: UUID (generated)
            '',                                        // M: Meeting ID
            '',                                        // N: Topic
            ''                                         // O: Duration
        ];
        
        // Add to Drive Import - Raw tab
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'Drive Import - Raw!A:O',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [rawRow]
            }
        });
        
        console.log('   ✅ Added to Drive Import - Raw tab');
        
        // Prepare standardized row (simplified version)
        const standardizedRow = [
            // First 15 columns similar to raw
            ...rawRow.slice(0, 15),
            // Additional standardized fields (placeholders for now)
            ...Array(33).fill('')  // Fill remaining columns with empty strings
        ];
        
        // Add to Drive Import - Standardized tab
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'Drive Import - Standardized!A:AV',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [standardizedRow]
            }
        });
        
        console.log('   ✅ Added to Drive Import - Standardized tab');
        
        console.log('\n✅ Sample processing complete!');
        console.log('   Check your Google Sheet to see the new records in:');
        console.log('   - Drive Import - Raw');
        console.log('   - Drive Import - Standardized');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

function getFileType(filename, mimeType) {
    if (filename.includes('.mp4') || mimeType.includes('video')) return 'video';
    if (filename.includes('.m4a') || mimeType.includes('audio')) return 'audio';
    if (filename.includes('.vtt')) return 'transcript';
    if (filename.includes('Chat.txt')) return 'chat';
    return 'other';
}

// Run the sample processor
processDriveSample().catch(console.error);