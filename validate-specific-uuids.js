#!/usr/bin/env node
require('dotenv').config();
const { google } = require('googleapis');

async function validateSpecificRecordings() {
    const auth = new google.auth.GoogleAuth({
        keyFile: 'google-credentials.json',
        scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
    });
    
    const authClient = await auth.getClient();
    const drive = google.drive({ version: 'v3', auth: authClient });
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    
    // Check the Standardized Master Index
    console.log('📊 Checking Standardized Master Index sheet...');
    console.log('Sheet ID: 1xa4E5PcrxRVaMbJfWH_d5LLSqY3RlCf6Ur3rwKtq2jQ');
    console.log('Tab: Standardized Master Index\n');
    
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: '1xa4E5PcrxRVaMbJfWH_d5LLSqY3RlCf6Ur3rwKtq2jQ',
        range: "'Standardized Master Index'!A1:Z10"
    });
    
    const rows = response.data.values || [];
    const headers = rows[0];
    console.log('Column headers:', headers.slice(0, 10));
    
    const uuidCol = headers.findIndex(h => h && h.toLowerCase().includes('uuid'));
    const topicCol = headers.findIndex(h => h && h.toLowerCase().includes('topic'));
    const meetingIdCol = headers.findIndex(h => h && h.toLowerCase().includes('meeting') && h.toLowerCase().includes('id'));
    const dateCol = headers.findIndex(h => h && h.toLowerCase().includes('date') || h.toLowerCase().includes('start'));
    
    console.log(`\nColumn indices: UUID=${uuidCol}, Topic=${topicCol}, MeetingID=${meetingIdCol}, Date=${dateCol}`);
    
    // Get 3 specific recordings to validate
    console.log('\n🔍 Validating 3 specific recordings:\n');
    
    for (let i = 1; i <= 3 && i < rows.length; i++) {
        const row = rows[i];
        
        console.log(`\n${i}. Recording from Sheet:`);
        console.log(`   Topic: ${row[topicCol] || 'N/A'}`);
        console.log(`   UUID: ${row[uuidCol] || 'N/A'}`);
        console.log(`   Meeting ID: ${row[meetingIdCol] || 'N/A'}`);
        console.log(`   Date: ${row[dateCol] || 'N/A'}`);
        
        const uuid = row[uuidCol];
        if (uuid) {
            // Search in Drive by exact UUID
            console.log(`\n   Searching Drive for UUID: ${uuid}`);
            
            try {
                // Search for folders containing this UUID
                const searchQuery = `name contains '${uuid}' and mimeType = 'application/vnd.google-apps.folder'`;
                const driveSearch = await drive.files.list({
                    q: searchQuery,
                    fields: 'files(id, name)',
                    pageSize: 10
                });
                
                if (driveSearch.data.files.length > 0) {
                    console.log('   ✅ FOUND IN DRIVE:');
                    driveSearch.data.files.forEach(f => {
                        console.log(`      Folder: ${f.name}`);
                        
                        // Extract UUID from folder name to verify exact match
                        const folderUuidMatch = f.name.match(/U[_:]([A-Za-z0-9+/=]+)/);
                        if (folderUuidMatch) {
                            const folderUuid = folderUuidMatch[1];
                            console.log(`      Extracted UUID: ${folderUuid}`);
                            console.log(`      Match: ${folderUuid === uuid ? 'EXACT' : 'PARTIAL'}`);
                        }
                    });
                } else {
                    console.log('   ❌ NOT FOUND IN DRIVE');
                    
                    // Try searching by meeting ID
                    const meetingId = row[meetingIdCol];
                    if (meetingId && meetingId !== uuid) {
                        console.log(`   🔍 Trying meeting ID search: ${meetingId}`);
                        const meetingSearch = await drive.files.list({
                            q: `name contains '${meetingId}' and mimeType = 'application/vnd.google-apps.folder'`,
                            fields: 'files(name)',
                            pageSize: 5
                        });
                        
                        if (meetingSearch.data.files.length > 0) {
                            console.log('   📁 Found with Meeting ID:');
                            meetingSearch.data.files.forEach(f => console.log(`      ${f.name}`));
                        }
                    }
                }
            } catch (error) {
                console.log('   Error searching:', error.message);
            }
        }
    }
    
    // Now let's check if there are different sheets for A, B, C recordings
    console.log('\n\n📋 Checking for other recording sheets...\n');
    
    // Check if there are other sheet IDs in environment
    const envKeys = Object.keys(process.env);
    const sheetKeys = envKeys.filter(key => key.includes('SHEET') && key.includes('ID'));
    console.log('Sheet-related environment variables:', sheetKeys);
    
    // List all tabs in the current sheet
    const sheetInfo = await sheets.spreadsheets.get({
        spreadsheetId: '1xa4E5PcrxRVaMbJfWH_d5LLSqY3RlCf6Ur3rwKtq2jQ',
        fields: 'sheets.properties.title'
    });
    
    console.log('\nAll tabs in master sheet:');
    sheetInfo.data.sheets.forEach(sheet => {
        console.log(`- ${sheet.properties.title}`);
    });
}

validateSpecificRecordings().catch(console.error);