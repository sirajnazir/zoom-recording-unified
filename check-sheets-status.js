#!/usr/bin/env node
require('dotenv').config();

const { google } = require('googleapis');

async function checkSheetsStatus() {
    // Initialize Google Sheets
    const credentials = JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString());
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.MASTER_INDEX_SHEET_ID;
    
    if (!spreadsheetId) {
        console.error('❌ MASTER_INDEX_SHEET_ID not found in environment variables');
        return;
    }
    
    try {
        // Get sheet metadata
        const response = await sheets.spreadsheets.get({
            spreadsheetId,
            includeGridData: false
        });
        
        console.log('\n📊 Google Sheets Status Report');
        console.log('=====================================\n');
        
        const sheetInfo = {};
        
        for (const sheet of response.data.sheets) {
            const title = sheet.properties.title;
            const rowCount = sheet.properties.gridProperties.rowCount;
            
            // Get actual data count (excluding header)
            const dataResponse = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `'${title}'!A:A`
            });
            
            const dataRows = (dataResponse.data.values || []).length - 1; // Subtract header
            
            sheetInfo[title] = {
                totalRows: rowCount,
                dataRows: Math.max(0, dataRows)
            };
            
            console.log(`📋 ${title}`);
            console.log(`   Data rows: ${sheetInfo[title].dataRows}`);
            console.log(`   Total rows: ${rowCount}\n`);
        }
        
        // Summary
        console.log('📊 Summary:');
        console.log(`   Zoom API - Raw: ${sheetInfo['Zoom API - Raw']?.dataRows || 0} recordings`);
        console.log(`   Zoom API - Standardized: ${sheetInfo['Zoom API - Standardized']?.dataRows || 0} recordings`);
        console.log(`   Total unique recordings: ${Math.max(
            sheetInfo['Zoom API - Raw']?.dataRows || 0,
            sheetInfo['Zoom API - Standardized']?.dataRows || 0
        )}`);
        
    } catch (error) {
        console.error('❌ Error checking sheets:', error.message);
    }
}

checkSheetsStatus().catch(console.error);