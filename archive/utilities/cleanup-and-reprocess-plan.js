#!/usr/bin/env node

const { google } = require('googleapis');
const config = require('./config');

class CleanupAndReprocessPlan {
  constructor(config) {
    this.config = config;
    this.sheets = google.sheets({ version: 'v4', auth: this.getAuthClient() });
    this.spreadsheetId = config.google.sheets.masterIndexSheetId;
  }

  getAuthClient() {
    return new google.auth.JWT(
      this.config.google.clientEmail,
      null,
      this.config.google.privateKey,
      ['https://www.googleapis.com/auth/spreadsheets']
    );
  }

  async cleanupTestData() {
    console.log('🧹 Cleaning up test data from Google Sheets...\n');
    
    try {
      // Get all data from both tabs
      const [rawResponse, standardizedResponse] = await Promise.all([
        this.sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: 'Raw Master Index!A:Z'
        }),
        this.sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: 'Standardized Master Index!A:Z'
        })
      ]);

      const rawRows = rawResponse.data.values || [];
      const standardizedRows = standardizedResponse.data.values || [];

      console.log(`📊 Found ${rawRows.length} rows in Raw tab`);
      console.log(`📊 Found ${standardizedRows.length} rows in Standardized tab`);

      // Find rows to remove (Google Drive Import test data)
      const rawRowsToRemove = [];
      const standardizedRowsToRemove = [];

      // Check Raw tab for Google Drive Import rows
      for (let i = 1; i < rawRows.length; i++) { // Skip header
        const row = rawRows[i];
        if (row.length > 0 && this.isGoogleDriveTestRow(row)) {
          rawRowsToRemove.push(i + 1); // +1 because sheets are 1-indexed
        }
      }

      // Check Standardized tab for Google Drive Import rows
      for (let i = 1; i < standardizedRows.length; i++) { // Skip header
        const row = standardizedRows[i];
        if (row.length > 0 && this.isGoogleDriveTestRow(row)) {
          standardizedRowsToRemove.push(i + 1); // +1 because sheets are 1-indexed
        }
      }

      console.log(`🗑️  Found ${rawRowsToRemove.length} test rows to remove from Raw tab`);
      console.log(`🗑️  Found ${standardizedRowsToRemove.length} test rows to remove from Standardized tab`);

      if (rawRowsToRemove.length === 0 && standardizedRowsToRemove.length === 0) {
        console.log('✅ No test data found to clean up');
        return;
      }

      // Remove rows from Raw tab (in reverse order to maintain indices)
      if (rawRowsToRemove.length > 0) {
        console.log('🗑️  Removing test rows from Raw tab...');
        for (let i = rawRowsToRemove.length - 1; i >= 0; i--) {
          await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            requestBody: {
              requests: [{
                deleteDimension: {
                  range: {
                    sheetId: 0, // Raw Master Index
                    dimension: 'ROWS',
                    startIndex: rawRowsToRemove[i] - 1,
                    endIndex: rawRowsToRemove[i]
                  }
                }
              }]
            }
          });
          console.log(`   Removed row ${rawRowsToRemove[i]} from Raw tab`);
        }
      }

      // Remove rows from Standardized tab (in reverse order to maintain indices)
      if (standardizedRowsToRemove.length > 0) {
        console.log('🗑️  Removing test rows from Standardized tab...');
        for (let i = standardizedRowsToRemove.length - 1; i >= 0; i--) {
          await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            requestBody: {
              requests: [{
                deleteDimension: {
                  range: {
                    sheetId: 674892161, // Standardized Master Index
                    dimension: 'ROWS',
                    startIndex: standardizedRowsToRemove[i] - 1,
                    endIndex: standardizedRowsToRemove[i]
                  }
                }
              }]
            }
          });
          console.log(`   Removed row ${standardizedRowsToRemove[i]} from Standardized tab`);
        }
      }

      console.log('\n✅ Cleanup completed successfully!');
      console.log(`🗑️  Removed ${rawRowsToRemove.length} rows from Raw tab`);
      console.log(`🗑️  Removed ${standardizedRowsToRemove.length} rows from Standardized tab`);

    } catch (error) {
      console.error('❌ Error during cleanup:', error.message);
      throw error;
    }
  }

  isGoogleDriveTestRow(row) {
    // Check if this is a Google Drive Import test row
    // Look for dataSource column or specific patterns
    if (row.length > 0) {
      const dataSource = row.find(cell => 
        cell && typeof cell === 'string' && 
        cell.includes('Google Drive Import')
      );
      
      if (dataSource) {
        return true;
      }

      // Also check for test patterns in the data
      const hasTestPattern = row.some(cell => 
        cell && typeof cell === 'string' && 
        (cell.includes('test') || cell.includes('Test') || cell.includes('TEST'))
      );

      if (hasTestPattern) {
        return true;
      }
    }
    
    return false;
  }

  async showReprocessPlan() {
    console.log('\n📋 REPROCESS PLAN');
    console.log('==================');
    console.log('1. ✅ Cleanup completed - test data removed');
    console.log('2. 🔄 Ready to reprocess all Google Drive recordings');
    console.log('3. 🤖 Will use unified AI processing pipeline');
    console.log('4. 📊 Will extract high fidelity names from transcripts/files');
    console.log('5. 🧠 Will generate comprehensive AI insights');
    console.log('');
    console.log('🚀 Next steps:');
    console.log('   node src/drive-source/unified-drive-processor.js --startFrom 0 --maxSessions 10');
    console.log('   (Process all 10 smart sessions through unified pipeline)');
    console.log('');
    console.log('📁 Smart sessions available:');
    console.log('   - Coaching sessions with transcripts');
    console.log('   - GamePlan sessions with AI analysis');
    console.log('   - MISC sessions with metadata');
    console.log('');
    console.log('🎯 Expected results:');
    console.log('   - High fidelity names from transcript analysis');
    console.log('   - AI-generated coaching insights');
    console.log('   - Same processing quality as Zoom recordings');
  }
}

async function main() {
  console.log('🧹 Google Drive Test Data Cleanup & Reprocess Plan\n');
  
  const plan = new CleanupAndReprocessPlan(config);
  
  try {
    // Step 1: Clean up test data
    await plan.cleanupTestData();
    
    // Step 2: Show reprocess plan
    await plan.showReprocessPlan();
    
  } catch (error) {
    console.error('❌ Failed to execute cleanup plan:', error.message);
    process.exit(1);
  }
}

main(); 