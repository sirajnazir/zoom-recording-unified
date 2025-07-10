// Script to setup proper headers for all Google Sheets tabs
require('dotenv').config();
const { google } = require('googleapis');

async function setupTabHeaders() {
    console.log('📊 Setting up headers for all Google Sheets tabs...\n');
    
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
        
        // Initialize Google Sheets API
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.MASTER_INDEX_SHEET_ID;
        
        // Define headers for Raw tabs (15 columns)
        const rawHeaders = [
            'UUID',
            'Meeting ID',
            'Topic',
            'Start Time',
            'End Time',
            'Duration',
            'Recording Count',
            'Host Email',
            'Host Name',
            'Account ID',
            'Status',
            'UUID (Base64)',
            'UUID (Hex)',
            'UUID (Hex with Dashes)',
            'Data Source'
        ];
        
        // Define headers for Standardized tabs (48 columns)
        const standardizedHeaders = [
            // Basic fields (1-15)
            'UUID',
            'Meeting ID', 
            'Topic',
            'Start Time',
            'End Time',
            'Duration',
            'Recording Count',
            'Host Email',
            'Host Name',
            'Account ID',
            'Status',
            'UUID (Base64)',
            'UUID (Hex)',
            'UUID (Hex with Dashes)',
            'Data Source',
            
            // Smart fields (16-48)
            'Standardized Topic',
            'Session Type',
            'Week Number',
            'Coach Name',
            'Student Name',
            'Date (YYYY-MM-DD)',
            'Participants',
            'Participant Count',
            'Has Transcript',
            'Has Chat',
            'Transcript Word Count',
            'Chat Message Count',
            'Total File Size (MB)',
            'Video Files',
            'Audio Files',
            'Other Files',
            'Processing Date',
            'Folder Category',
            'Drive Folder ID',
            'Drive Folder Link',
            'Outcomes Extracted',
            'Key Topics',
            'Action Items',
            'Questions Asked',
            'Insights Generated',
            'Engagement Score',
            'Technical Issues',
            'Follow-up Required',
            'Session Goals',
            'Progress Notes',
            'Next Steps',
            'Recording Quality',
            'Processing Status'
        ];
        
        // Define which tabs need which headers
        const tabConfigs = [
            { name: 'Zoom API - Raw', headers: rawHeaders },
            { name: 'Zoom API - Standardized', headers: standardizedHeaders },
            { name: 'Webhook - Raw', headers: rawHeaders },
            { name: 'Webhook - Standardized', headers: standardizedHeaders },
            { name: 'Drive Import - Raw', headers: rawHeaders },
            { name: 'Drive Import - Standardized', headers: standardizedHeaders }
        ];
        
        console.log('🔍 Checking and setting headers for each tab...\n');
        
        for (const config of tabConfigs) {
            try {
                console.log(`📋 Processing: ${config.name}`);
                
                // Check if tab has any data in row 1
                const checkRange = `'${config.name}'!A1:AV1`;
                const checkResponse = await sheets.spreadsheets.values.get({
                    spreadsheetId,
                    range: checkRange
                });
                
                const existingHeaders = checkResponse.data.values?.[0] || [];
                
                if (existingHeaders.length === 0) {
                    // No headers, add them
                    console.log(`   → No headers found, adding ${config.headers.length} headers`);
                    
                    const updateRange = `'${config.name}'!A1`;
                    await sheets.spreadsheets.values.update({
                        spreadsheetId,
                        range: updateRange,
                        valueInputOption: 'USER_ENTERED',
                        resource: {
                            values: [config.headers]
                        }
                    });
                    
                    console.log(`   ✅ Headers added successfully`);
                } else {
                    console.log(`   → Headers already exist (${existingHeaders.length} columns)`);
                    
                    // Check if headers match expected count
                    if (existingHeaders.length !== config.headers.length) {
                        console.log(`   ⚠️  Header count mismatch: expected ${config.headers.length}, found ${existingHeaders.length}`);
                        console.log(`   → Updating headers...`);
                        
                        const updateRange = `'${config.name}'!A1`;
                        await sheets.spreadsheets.values.update({
                            spreadsheetId,
                            range: updateRange,
                            valueInputOption: 'USER_ENTERED',
                            resource: {
                                values: [config.headers]
                            }
                        });
                        
                        console.log(`   ✅ Headers updated successfully`);
                    } else {
                        console.log(`   ✅ Headers are correct`);
                    }
                }
                
                // Format header row (make it bold and freeze it)
                const sheetId = await getSheetId(sheets, spreadsheetId, config.name);
                if (sheetId !== null) {
                    const requests = [
                        // Make header row bold
                        {
                            repeatCell: {
                                range: {
                                    sheetId: sheetId,
                                    startRowIndex: 0,
                                    endRowIndex: 1
                                },
                                cell: {
                                    userEnteredFormat: {
                                        textFormat: {
                                            bold: true
                                        }
                                    }
                                },
                                fields: 'userEnteredFormat.textFormat.bold'
                            }
                        },
                        // Freeze header row
                        {
                            updateSheetProperties: {
                                properties: {
                                    sheetId: sheetId,
                                    gridProperties: {
                                        frozenRowCount: 1
                                    }
                                },
                                fields: 'gridProperties.frozenRowCount'
                            }
                        }
                    ];
                    
                    await sheets.spreadsheets.batchUpdate({
                        spreadsheetId,
                        resource: {
                            requests
                        }
                    });
                    
                    console.log(`   ✅ Header formatting applied (bold + frozen)`);
                }
                
                console.log('');
                
            } catch (error) {
                console.error(`   ❌ Error processing ${config.name}: ${error.message}`);
            }
        }
        
        console.log('✅ Header setup complete!');
        console.log('\n📊 Summary:');
        console.log('   - Raw tabs: 15 columns each');
        console.log('   - Standardized tabs: 48 columns each');
        console.log('   - All headers are bold and frozen');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

async function getSheetId(sheets, spreadsheetId, sheetName) {
    try {
        const response = await sheets.spreadsheets.get({
            spreadsheetId
        });
        
        const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
        return sheet ? sheet.properties.sheetId : null;
    } catch (error) {
        console.error(`Error getting sheet ID for ${sheetName}:`, error.message);
        return null;
    }
}

// Run the setup
setupTabHeaders().catch(console.error);