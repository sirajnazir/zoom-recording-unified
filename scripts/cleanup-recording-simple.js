const path = require('path');
const fs = require('fs').promises;
const { google } = require('googleapis');

// Load config directly
const config = require('../config');

async function cleanupRecording(recordingId) {
    try {
        console.log(`🧹 Starting cleanup for recording: ${recordingId}`);
        
        // 1. Clean up local output directory
        console.log(`📁 Cleaning up local output directory...`);
        const outputDir = path.join(process.cwd(), 'output');
        
        try {
            const outputFolders = await fs.readdir(outputDir);
            
            for (const folder of outputFolders) {
                if (folder.includes(recordingId)) {
                    const folderPath = path.join(outputDir, folder);
                    console.log(`🗑️ Removing local folder: ${folder}`);
                    await fs.rm(folderPath, { recursive: true, force: true });
                }
            }
            
            console.log(`✅ Local output cleaned up`);
        } catch (error) {
            console.warn(`⚠️ Could not clean up local output:`, error.message);
        }
        
        // 2. Clean up Google Drive (if credentials are available)
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS || config.google?.serviceAccountKey) {
            console.log(`☁️ Cleaning up Google Drive...`);
            
            try {
                // Initialize Google Drive API
                const auth = new google.auth.GoogleAuth({
                    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || config.google?.serviceAccountKey,
                    scopes: ['https://www.googleapis.com/auth/drive']
                });
                
                const drive = google.drive({ version: 'v3', auth });
                
                // Search for folders containing the recording ID
                const folderResponse = await drive.files.list({
                    q: `name contains '${recordingId}' and mimeType = 'application/vnd.google-apps.folder'`,
                    fields: 'files(id, name)'
                });
                
                for (const folder of folderResponse.data.files || []) {
                    console.log(`🗑️ Removing Drive folder: ${folder.name} (${folder.id})`);
                    
                    // Delete all files in the folder first
                    const filesResponse = await drive.files.list({
                        q: `'${folder.id}' in parents`,
                        fields: 'files(id, name)'
                    });
                    
                    for (const file of filesResponse.data.files || []) {
                        await drive.files.delete({ fileId: file.id });
                    }
                    
                    // Delete the folder itself
                    await drive.files.delete({ fileId: folder.id });
                }
                
                // Also search for any files with the recording ID in the name
                const fileResponse = await drive.files.list({
                    q: `name contains '${recordingId}'`,
                    fields: 'files(id, name)'
                });
                
                for (const file of fileResponse.data.files || []) {
                    console.log(`🗑️ Removing Drive file: ${file.name} (${file.id})`);
                    await drive.files.delete({ fileId: file.id });
                }
                
                console.log(`✅ Google Drive cleaned up`);
            } catch (error) {
                console.warn(`⚠️ Could not clean up Google Drive:`, error.message);
            }
        } else {
            console.log(`⚠️ Skipping Google Drive cleanup - no credentials found`);
        }
        
        // 3. Clean up Google Sheets (if credentials are available)
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS || config.google?.serviceAccountKey) {
            console.log(`📊 Cleaning up Google Sheets...`);
            
            try {
                const auth = new google.auth.GoogleAuth({
                    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || config.google?.serviceAccountKey,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets']
                });
                
                const sheets = google.sheets({ version: 'v4', auth });
                const sheetId = config.google.sheets.trackingSheetId;
                
                // Read existing data
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: sheetId,
                    range: 'A:ZZ'
                });
                
                const rows = response.data.values || [];
                
                // Find and remove the row with this recording ID
                const filteredRows = rows.filter(row => {
                    return !row.some(cell => cell && cell.includes(recordingId));
                });
                
                // Clear the sheet and write back filtered data
                await sheets.spreadsheets.values.clear({
                    spreadsheetId: sheetId,
                    range: 'A:ZZ'
                });
                
                if (filteredRows.length > 0) {
                    await sheets.spreadsheets.values.update({
                        spreadsheetId: sheetId,
                        range: 'A1',
                        valueInputOption: 'RAW',
                        resource: { values: filteredRows }
                    });
                }
                
                console.log(`✅ Google Sheets cleaned up`);
            } catch (error) {
                console.warn(`⚠️ Could not clean up Google Sheets:`, error.message);
            }
        } else {
            console.log(`⚠️ Skipping Google Sheets cleanup - no credentials found`);
        }
        
        console.log(`🎉 Cleanup completed for recording: ${recordingId}`);
        
    } catch (error) {
        console.error('❌ Error during cleanup:', error);
        throw error;
    }
}

// Get recording ID from command line arguments
const recordingId = process.argv[2];

if (!recordingId) {
    console.error('❌ Please provide a recording ID as an argument');
    console.log('Usage: node scripts/cleanup-recording-simple.js <recording-id>');
    process.exit(1);
}

// Run the cleanup
cleanupRecording(recordingId)
    .then(() => {
        console.log('✅ Cleanup completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Cleanup failed:', error);
        process.exit(1);
    }); 