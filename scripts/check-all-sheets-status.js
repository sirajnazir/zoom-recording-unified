#!/usr/bin/env node
/**
 * Check all sheets and tabs to see where data is
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

async function checkAllSheets() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              All Sheets and Tabs Status Check                  ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    try {
        // Initialize Google Sheets API
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: config.google.clientEmail,
                private_key: config.google.privateKey
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = config.google.sheets.masterIndexSheetId;
        
        console.log(`📊 Spreadsheet ID: ${spreadsheetId}\n`);
        
        // Get all sheets/tabs
        const spreadsheet = await sheets.spreadsheets.get({
            spreadsheetId
        });
        
        const allSheets = spreadsheet.data.sheets || [];
        console.log(`📋 Found ${allSheets.length} tabs:\n`);
        
        for (const sheet of allSheets) {
            const title = sheet.properties.title;
            const sheetId = sheet.properties.sheetId;
            
            try {
                // Get row count
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId,
                    range: `'${title}'!A:A`
                });
                
                const rows = response.data.values || [];
                const dataRows = rows.length > 1 ? rows.length - 1 : 0;
                
                console.log(`📋 ${title} (ID: ${sheetId})`);
                console.log(`   Total rows: ${rows.length} (${dataRows} data rows)`);
                
                // Check for indicators in standardized tabs
                if (title.includes('Standardized') && dataRows > 0) {
                    // Get a sample
                    const sampleResponse = await sheets.spreadsheets.values.get({
                        spreadsheetId,
                        range: `'${title}'!E2:E10`
                    });
                    
                    const samples = (sampleResponse.data.values || []).flat().filter(Boolean);
                    
                    const indicators = {
                        A: samples.filter(s => s.includes('_A_')).length,
                        B: samples.filter(s => s.includes('_B_')).length,
                        C: samples.filter(s => s.includes('_C_')).length
                    };
                    
                    if (indicators.A > 0 || indicators.B > 0 || indicators.C > 0) {
                        console.log(`   Indicators found: A=${indicators.A}, B=${indicators.B}, C=${indicators.C}`);
                    }
                }
                
                console.log('');
                
            } catch (error) {
                console.log(`📋 ${title} (ID: ${sheetId})`);
                console.log(`   ❌ Error: ${error.message}\n`);
            }
        }
        
        console.log('✅ Sheet scan complete!');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

// Run the check
checkAllSheets()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('Script failed:', error);
        process.exit(1);
    });