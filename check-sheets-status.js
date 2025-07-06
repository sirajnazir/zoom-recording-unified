#!/usr/bin/env node
/**
 * Check Google Sheets status and optionally clean up test entries
 * Helps debug why entries aren't being added to the Standardized Master Index
 */

require('dotenv').config();
const { google } = require('googleapis');

// Target recordings we're testing
const TEST_RECORDINGS = [
  {
    uuid: 'SsXeFZHsSCe99P1kAbOz5Q==',
    meetingId: '8390038905',
    name: "Jamie JudahBram's Recording"
  },
  {
    uuid: 'mOjpJueTSx6FAMuHis3GxQ==',
    meetingId: '3242527137',
    name: "Noor Hiba's Recording"
  }
];

class GoogleSheetsChecker {
  constructor() {
    this.sheets = null;
    this.auth = null;
    this.spreadsheetId = process.env.MASTER_INDEX_SHEET_ID;
  }

  async initialize() {
    try {
      // Initialize auth
      this.auth = new google.auth.JWT({
        email: process.env.GOOGLE_CLIENT_EMAIL,
        key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      console.log('✅ Google Sheets API initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Google Sheets:', error.message);
      throw error;
    }
  }

  async getSheetInfo() {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId
      });

      console.log('\n📊 Spreadsheet Info:');
      console.log(`   Title: ${response.data.properties.title}`);
      console.log(`   Sheets: ${response.data.sheets.length}`);
      
      response.data.sheets.forEach((sheet, index) => {
        console.log(`   ${index + 1}. ${sheet.properties.title} (ID: ${sheet.properties.sheetId})`);
      });

      return response.data.sheets;
    } catch (error) {
      console.error('❌ Failed to get sheet info:', error.message);
      throw error;
    }
  }

  async checkForDuplicates(sheetName) {
    try {
      console.log(`\n🔍 Checking ${sheetName} for test recordings...`);
      
      // Get all data from the sheet
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:Z`
      });

      const rows = response.data.values || [];
      console.log(`   Total rows: ${rows.length}`);

      if (rows.length === 0) {
        console.log('   ⚠️ Sheet is empty');
        return [];
      }

      // Find header row
      const headerIndex = rows.findIndex(row => 
        row.some(cell => cell && cell.toString().toLowerCase().includes('uuid'))
      );

      if (headerIndex === -1) {
        console.log('   ⚠️ Could not find header row with UUID column');
        return [];
      }

      const headers = rows[headerIndex];
      console.log(`   Header row at index ${headerIndex}`);

      // Find UUID column
      const uuidCol = headers.findIndex(h => h && h.toString().toLowerCase().includes('uuid'));
      const idCol = headers.findIndex(h => h && h.toString().toLowerCase().includes('meeting') && h.toString().toLowerCase().includes('id'));
      const nameCol = headers.findIndex(h => h && h.toString().toLowerCase().includes('standardized') && h.toString().toLowerCase().includes('name'));

      console.log(`   UUID column: ${uuidCol >= 0 ? headers[uuidCol] : 'Not found'}`);
      console.log(`   ID column: ${idCol >= 0 ? headers[idCol] : 'Not found'}`);
      console.log(`   Name column: ${nameCol >= 0 ? headers[nameCol] : 'Not found'}`);

      // Find test recordings
      const testRows = [];
      for (let i = headerIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const uuid = uuidCol >= 0 ? row[uuidCol] : '';
        const meetingId = idCol >= 0 ? row[idCol] : '';
        
        for (const testRec of TEST_RECORDINGS) {
          if ((uuid && uuid.includes(testRec.uuid)) || 
              (meetingId && meetingId.toString() === testRec.meetingId)) {
            testRows.push({
              rowIndex: i + 1, // Sheets uses 1-based indexing
              uuid: uuid,
              meetingId: meetingId,
              name: nameCol >= 0 ? row[nameCol] : 'Unknown',
              testRecording: testRec.name
            });
          }
        }
      }

      console.log(`\n   Found ${testRows.length} test recording entries:`);
      testRows.forEach(row => {
        console.log(`   Row ${row.rowIndex}: ${row.name}`);
        console.log(`      UUID: ${row.uuid}`);
        console.log(`      Meeting ID: ${row.meetingId}`);
      });

      return testRows;
    } catch (error) {
      console.error(`❌ Error checking ${sheetName}:`, error.message);
      return [];
    }
  }

  async deleteRows(sheetName, rowIndices) {
    if (rowIndices.length === 0) {
      console.log('No rows to delete');
      return;
    }

    // Get sheet ID
    const sheets = await this.getSheetInfo();
    const sheet = sheets.find(s => s.properties.title === sheetName);
    if (!sheet) {
      console.error(`❌ Sheet "${sheetName}" not found`);
      return;
    }

    const sheetId = sheet.properties.sheetId;

    // Sort indices in descending order to delete from bottom to top
    const sortedIndices = [...rowIndices].sort((a, b) => b - a);

    console.log(`\n🗑️ Deleting ${sortedIndices.length} rows from ${sheetName}...`);

    for (const rowIndex of sortedIndices) {
      try {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          resource: {
            requests: [{
              deleteDimension: {
                range: {
                  sheetId: sheetId,
                  dimension: 'ROWS',
                  startIndex: rowIndex - 1, // 0-based for API
                  endIndex: rowIndex
                }
              }
            }]
          }
        });
        console.log(`   ✅ Deleted row ${rowIndex}`);
      } catch (error) {
        console.error(`   ❌ Failed to delete row ${rowIndex}:`, error.message);
      }
    }
  }

  async getRecentEntries(sheetName, count = 10) {
    try {
      console.log(`\n📋 Recent entries in ${sheetName}:`);
      
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:Z`
      });

      const rows = response.data.values || [];
      if (rows.length === 0) {
        console.log('   Sheet is empty');
        return;
      }

      // Find header row
      const headerIndex = rows.findIndex(row => 
        row.some(cell => cell && cell.toString().toLowerCase().includes('uuid'))
      );

      if (headerIndex === -1 || rows.length <= headerIndex + 1) {
        console.log('   No data rows found');
        return;
      }

      const headers = rows[headerIndex];
      const dataRows = rows.slice(headerIndex + 1).filter(row => row && row.length > 0);
      const recentRows = dataRows.slice(-count);

      console.log(`   Showing last ${recentRows.length} entries:`);
      
      // Find key columns
      const dateCol = headers.findIndex(h => h && h.toString().toLowerCase().includes('date'));
      const nameCol = headers.findIndex(h => h && h.toString().toLowerCase().includes('name'));
      const uuidCol = headers.findIndex(h => h && h.toString().toLowerCase().includes('uuid'));

      recentRows.forEach((row, index) => {
        const date = dateCol >= 0 ? row[dateCol] : 'Unknown date';
        const name = nameCol >= 0 ? row[nameCol] : 'Unknown name';
        const uuid = uuidCol >= 0 ? row[uuidCol] : 'Unknown UUID';
        
        console.log(`   ${dataRows.length - recentRows.length + index + 1}. ${date} - ${name}`);
        console.log(`      UUID: ${uuid}`);
      });
    } catch (error) {
      console.error(`❌ Error getting recent entries:`, error.message);
    }
  }
}

async function main() {
  console.log('🔍 Google Sheets Status Checker\n');

  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log(`
Google Sheets Status Checker
============================

Check for duplicate test recordings and optionally clean them up.

Usage:
  node check-sheets-status.js [options]

Options:
  --clean           Delete test recording entries from sheets
  --recent <n>      Show last n entries (default: 10)
  --help            Show this help

Examples:
  # Check status only
  node check-sheets-status.js

  # Clean up test entries
  node check-sheets-status.js --clean

  # Show last 20 entries
  node check-sheets-status.js --recent 20
    `);
    process.exit(0);
  }

  // Check environment
  if (!process.env.MASTER_INDEX_SHEET_ID || !process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    console.error('❌ Missing required environment variables!');
    console.error('   Required: MASTER_INDEX_SHEET_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY');
    process.exit(1);
  }

  const shouldClean = args.includes('--clean');
  const recentIndex = args.findIndex(arg => arg === '--recent');
  const recentCount = recentIndex >= 0 && args[recentIndex + 1] ? parseInt(args[recentIndex + 1]) : 10;

  const checker = new GoogleSheetsChecker();
  
  try {
    await checker.initialize();
    const sheets = await checker.getSheetInfo();

    // Check both tabs
    const tabNames = ['Raw Master Index', 'Standardized Master Index'];
    
    for (const tabName of tabNames) {
      const duplicates = await checker.checkForDuplicates(tabName);
      
      if (shouldClean && duplicates.length > 0) {
        const rowIndices = duplicates.map(d => d.rowIndex);
        await checker.deleteRows(tabName, rowIndices);
      }

      await checker.getRecentEntries(tabName, recentCount);
    }

    if (!shouldClean && TEST_RECORDINGS.length > 0) {
      console.log('\n💡 Tip: Use --clean to remove test entries and allow re-processing');
    }

  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});