const path = require('path');
const fs = require('fs').promises;

// Import services
const container = require('../src/container');

async function cleanupRecording(recordingId) {
    try {
        console.log(`🧹 Starting cleanup for recording: ${recordingId}`);
        
        // 1. Clean up Google Sheets
        console.log(`📊 Cleaning up Google Sheets...`);
        const sheetsService = container.get('googleSheetsService');
        
        try {
            // Get the sheet ID from config
            const config = container.get('config');
            const sheetId = config.google.sheets.trackingSheetId;
            
            // Read existing data
            const response = await sheetsService.readSheet(sheetId, 'A:ZZ');
            const rows = response.data.values || [];
            
            // Find and remove the row with this recording ID
            const filteredRows = rows.filter(row => {
                // Check if the row contains the recording ID (usually in column A or a specific column)
                return !row.some(cell => cell && cell.includes(recordingId));
            });
            
            // Clear the sheet and write back filtered data
            await sheetsService.clearSheet(sheetId, 'A:ZZ');
            if (filteredRows.length > 0) {
                await sheetsService.writeSheet(sheetId, 'A1', filteredRows);
            }
            
            console.log(`✅ Google Sheets cleaned up`);
        } catch (error) {
            console.warn(`⚠️ Could not clean up Google Sheets:`, error.message);
        }
        
        // 2. Clean up local output directory
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
        
        // 3. Clean up Google Drive
        console.log(`☁️ Cleaning up Google Drive...`);
        const driveService = container.get('googleDriveService');
        
        try {
            // Search for folders containing the recording ID
            const query = `name contains '${recordingId}' and mimeType = 'application/vnd.google-apps.folder'`;
            const folders = await driveService.searchFiles(query);
            
            for (const folder of folders) {
                console.log(`🗑️ Removing Drive folder: ${folder.name} (${folder.id})`);
                
                // Delete all files in the folder first
                const files = await driveService.listFiles(folder.id);
                for (const file of files) {
                    await driveService.deleteFile(file.id);
                }
                
                // Delete the folder itself
                await driveService.deleteFile(folder.id);
            }
            
            // Also search for any files with the recording ID in the name
            const fileQuery = `name contains '${recordingId}'`;
            const files = await driveService.searchFiles(fileQuery);
            
            for (const file of files) {
                console.log(`🗑️ Removing Drive file: ${file.name} (${file.id})`);
                await driveService.deleteFile(file.id);
            }
            
            console.log(`✅ Google Drive cleaned up`);
        } catch (error) {
            console.warn(`⚠️ Could not clean up Google Drive:`, error.message);
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
    console.log('Usage: node scripts/cleanup-recording.js <recording-id>');
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