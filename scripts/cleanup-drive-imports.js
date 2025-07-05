#!/usr/bin/env node

// Cleanup existing Google Drive imports before reprocessing
// This script identifies and optionally removes Drive import records from sheets

const { google } = require('googleapis');
const config = require('../config');
const readline = require('readline');

class DriveImportCleaner {
  constructor() {
    this.auth = new google.auth.JWT(
      config.google.clientEmail,
      null,
      config.google.privateKey,
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    this.spreadsheetId = config.google.sheets.masterIndexSheetId;
  }

  async findDriveImports() {
    console.log('🔍 Scanning for existing Drive imports...\n');
    
    const results = {
      raw: [],
      standardized: []
    };
    
    try {
      // Check Raw Master Index (Tab 1)
      console.log('Checking Raw Master Index...');
      const rawResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Raw Master Index!A:O'
      });
      
      const rawValues = rawResponse.data.values || [];
      const rawHeaders = rawValues[0];
      
      // Find rows with Drive imports (check multiple indicators)
      for (let i = 1; i < rawValues.length; i++) {
        const row = rawValues[i];
        if (!row || row.length === 0) continue;
        
        const uuid = row[0];
        const topic = row[2] || '';
        const hostEmail = row[6] || '';
        
        // Check if this is a Drive import
        if (hostEmail.includes('drive-import@') || 
            hostEmail.includes('@ivymentors.co') ||
            (uuid && uuid.length === 16 && !uuid.includes('=='))) { // Hex IDs from Drive
          results.raw.push({
            row: i + 1,
            uuid: uuid,
            topic: topic,
            hostEmail: hostEmail,
            date: row[3] || ''
          });
        }
      }
      
      console.log(`Found ${results.raw.length} Drive imports in Raw Master Index`);
      
      // Check Standardized Master Index (Tab 2)
      console.log('\nChecking Standardized Master Index...');
      const standardizedResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Standardized Master Index!A:AY'
      });
      
      const standardizedValues = standardizedResponse.data.values || [];
      
      // Find rows with "Google Drive Import" data source
      for (let i = 1; i < standardizedValues.length; i++) {
        const row = standardizedValues[i];
        if (!row || row.length === 0) continue;
        
        const uuid = row[0];
        const dataSource = row[48] || ''; // Column AW - Data Source
        const hostEmail = row[11] || '';
        
        if (dataSource === 'Google Drive Import' || 
            hostEmail.includes('@ivymentors.co') ||
            (uuid && uuid.length === 16 && !uuid.includes('=='))) {
          results.standardized.push({
            row: i + 1,
            uuid: uuid,
            standardizedName: row[4] || '',
            dataSource: dataSource,
            date: row[2] || ''
          });
        }
      }
      
      console.log(`Found ${results.standardized.length} Drive imports in Standardized Master Index`);
      
      return results;
      
    } catch (error) {
      console.error('Error scanning sheets:', error.message);
      throw error;
    }
  }
  
  async displayResults(results) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('📊 DRIVE IMPORT SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log(`Raw Master Index: ${results.raw.length} records`);
    console.log(`Standardized Master Index: ${results.standardized.length} records`);
    
    if (results.raw.length > 0) {
      console.log('\nSample Raw records:');
      results.raw.slice(0, 5).forEach(record => {
        console.log(`  Row ${record.row}: ${record.topic} (${record.date})`);
      });
      if (results.raw.length > 5) {
        console.log(`  ... and ${results.raw.length - 5} more`);
      }
    }
    
    if (results.standardized.length > 0) {
      console.log('\nSample Standardized records:');
      results.standardized.slice(0, 5).forEach(record => {
        console.log(`  Row ${record.row}: ${record.standardizedName} (${record.date})`);
      });
      if (results.standardized.length > 5) {
        console.log(`  ... and ${results.standardized.length - 5} more`);
      }
    }
  }
  
  async deleteRows(tabName, rowNumbers) {
    // Sort row numbers in descending order to delete from bottom to top
    const sortedRows = [...rowNumbers].sort((a, b) => b - a);
    
    console.log(`\nDeleting ${sortedRows.length} rows from ${tabName}...`);
    
    const requests = sortedRows.map(rowNum => ({
      deleteDimension: {
        range: {
          sheetId: tabName === 'Raw Master Index' ? 0 : 1, // Assuming tab IDs
          dimension: 'ROWS',
          startIndex: rowNum - 1,
          endIndex: rowNum
        }
      }
    }));
    
    // Process in batches to avoid API limits
    const batchSize = 100;
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      
      try {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: { requests: batch }
        });
        
        console.log(`  Deleted batch ${Math.floor(i / batchSize) + 1} (${batch.length} rows)`);
      } catch (error) {
        console.error(`  Error deleting batch: ${error.message}`);
      }
    }
  }
  
  async promptUser(question) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise(resolve => {
      rl.question(question, answer => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         Google Drive Import Cleanup Tool                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.log('This tool will help you clean up existing Drive imports before reprocessing.\n');
  
  const cleaner = new DriveImportCleaner();
  
  try {
    // Find existing imports
    const results = await cleaner.findDriveImports();
    
    // Display results
    await cleaner.displayResults(results);
    
    if (results.raw.length === 0 && results.standardized.length === 0) {
      console.log('\n✅ No Drive imports found. You can proceed with fresh processing.');
      return;
    }
    
    // Ask user what to do
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('OPTIONS:');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('1. List all Drive import UUIDs (for backup)');
    console.log('2. Delete all Drive imports from BOTH tabs');
    console.log('3. Delete from Raw Master Index only');
    console.log('4. Delete from Standardized Master Index only');
    console.log('5. Exit without changes');
    
    const choice = await cleaner.promptUser('\nSelect option (1-5): ');
    
    switch (choice) {
      case '1':
        // List UUIDs for backup
        console.log('\n📋 Drive Import UUIDs:\n');
        console.log('Raw Master Index UUIDs:');
        results.raw.forEach(r => console.log(r.uuid));
        console.log('\nStandardized Master Index UUIDs:');
        results.standardized.forEach(r => console.log(r.uuid));
        break;
        
      case '2':
        // Delete from both
        const confirm2 = await cleaner.promptUser('\n⚠️  This will DELETE all Drive imports from BOTH tabs. Are you sure? (yes/no): ');
        if (confirm2.toLowerCase() === 'yes') {
          console.log('\n🗑️  Deleting Drive imports...');
          
          // Note: This is a simplified approach. In production, you'd need to:
          // 1. Get the actual sheet IDs
          // 2. Handle deletion more carefully to preserve data integrity
          console.log('\n⚠️  For safety, please manually delete the rows using the spreadsheet UI.');
          console.log('Filter by:');
          console.log('- Data Source = "Google Drive Import" in Standardized tab');
          console.log('- Host Email containing "@ivymentors.co" or "drive-import@"');
          console.log('- UUID length = 16 characters (hex format)');
        }
        break;
        
      case '3':
      case '4':
      case '5':
        console.log('\n👍 Exiting without changes.');
        break;
        
      default:
        console.log('\n❌ Invalid option.');
    }
    
    console.log('\n✅ Cleanup tool finished.');
    console.log('\nNext steps:');
    console.log('1. If you deleted records, verify the sheets look correct');
    console.log('2. Run the batch processor: node scripts/batch-process-drive.js ALL 100');
    console.log('3. Monitor the processing and check for any errors');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the cleanup tool
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});