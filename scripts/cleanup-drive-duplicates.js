#!/usr/bin/env node
/**
 * Clean up duplicate Drive Import entries in Google Sheets
 * Keeps only the most complete entry for each week/session
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

async function cleanupDuplicates() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║           Drive Import Duplicate Cleanup                       ║');
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
        
        // Process both tabs
        const tabs = [
            { name: 'Drive Import - Raw', range: 'A:Z' },
            { name: 'Drive Import - Standardized', range: 'A:Z' }
        ];
        
        for (const tab of tabs) {
            console.log(`\n📋 Processing ${tab.name}...`);
            
            // Get all data
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `'${tab.name}'!${tab.range}`
            });
            
            const rows = response.data.values || [];
            if (rows.length <= 1) {
                console.log('   No data to process');
                continue;
            }
            
            const headers = rows[0];
            const dataRows = rows.slice(1);
            
            console.log(`   Found ${dataRows.length} data rows`);
            
            // Group rows by session key (coach + student + week)
            const sessionGroups = {};
            
            dataRows.forEach((row, index) => {
                // Extract key fields based on tab type
                let sessionKey;
                
                if (tab.name.includes('Standardized')) {
                    // For standardized tab, use the standardized name
                    const standardizedName = row[4]; // Column E
                    if (standardizedName) {
                        // Extract coach, student, and week from standardized name
                        const parts = standardizedName.split('_');
                        const coach = parts[2] || 'Unknown';
                        const student = parts[3] || 'Unknown';
                        const week = parts[4] || 'Unknown';
                        sessionKey = `${coach}_${student}_${week}`;
                    }
                } else {
                    // For raw tab, use topic and date
                    const topic = row[2]; // Column C - topic
                    const date = row[3]; // Column D - start_time
                    if (topic && date) {
                        // Extract date part only
                        const dateOnly = date.split('T')[0];
                        sessionKey = `${topic}_${dateOnly}`;
                    }
                }
                
                if (!sessionKey) {
                    sessionKey = `unknown_${index}`;
                }
                
                if (!sessionGroups[sessionKey]) {
                    sessionGroups[sessionKey] = [];
                }
                
                sessionGroups[sessionKey].push({
                    row,
                    index: index + 1, // 1-based for sheets
                    fileCount: countFiles(row)
                });
            });
            
            // Find duplicates
            const duplicates = [];
            const toKeep = [];
            
            Object.entries(sessionGroups).forEach(([key, group]) => {
                if (group.length > 1) {
                    console.log(`   Found duplicate session: ${key} (${group.length} entries)`);
                    
                    // Keep the entry with the most files
                    group.sort((a, b) => b.fileCount - a.fileCount);
                    
                    toKeep.push(group[0]);
                    duplicates.push(...group.slice(1));
                } else {
                    toKeep.push(group[0]);
                }
            });
            
            console.log(`   Found ${duplicates.length} duplicate entries to remove`);
            
            if (duplicates.length > 0) {
                // Create new data without duplicates
                const newData = [headers];
                
                // Sort toKeep by original index to maintain order
                toKeep.sort((a, b) => a.index - b.index);
                toKeep.forEach(item => newData.push(item.row));
                
                // Clear and update the sheet
                console.log(`   Updating sheet with ${newData.length - 1} unique entries...`);
                
                await sheets.spreadsheets.values.clear({
                    spreadsheetId,
                    range: `'${tab.name}'!${tab.range}`
                });
                
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `'${tab.name}'!A1`,
                    valueInputOption: 'RAW',
                    resource: {
                        values: newData
                    }
                });
                
                console.log(`   ✅ Removed ${duplicates.length} duplicates`);
            } else {
                console.log('   ✅ No duplicates found');
            }
        }
        
        console.log('\n✅ Cleanup complete!');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

// Helper to count files in a row
function countFiles(row) {
    let count = 0;
    // Check various file columns
    row.forEach(cell => {
        if (cell && (
            cell.includes('.mp4') || 
            cell.includes('.m4a') || 
            cell.includes('.vtt') || 
            cell.includes('.txt')
        )) {
            count++;
        }
    });
    return count;
}

// Helper is defined above, no need to add to prototype

// Run cleanup
cleanupDuplicates()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('Script failed:', error);
        process.exit(1);
    });