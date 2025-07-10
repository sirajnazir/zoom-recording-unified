#!/usr/bin/env node

/**
 * Update the standardizedName column for unknown recordings
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

// Mapping of session IDs to correct coach/student
const sessionMapping = {
    '330f04559d336f8b': { coach: 'Jenny', student: 'Huda', date: '2023-09-02' },
    '67b7b4ddb94d9714': { coach: 'Jenny', student: 'Huda', date: '2023-08-30' },
    '7247ecbd0e5fae62': { coach: 'Jenny', student: 'Huda', date: '2023-08-25' },
    '7190c776c4c0d307': { coach: 'Jenny', student: 'Huda', date: '2023-08-21' },
    '324b9bb1a74a3f89': { coach: 'Jenny', student: 'Huda', date: '2023-08-15' },
    '0f53dda2ddac18b2': { coach: 'Jenny', student: 'Huda', date: '2023-08-08' },
    '37b4f7c7f24f1a85': { coach: 'Alan', student: 'Rayaan', date: '2025-01-30' }
};

async function initializeSheets() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: config.google.clientEmail,
            private_key: config.google.privateKey
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    
    return google.sheets({ version: 'v4', auth });
}

// Helper function to convert column index to A1 notation
function getColumnLetter(colIndex) {
    let letter = '';
    let num = colIndex;
    while (num >= 0) {
        letter = String.fromCharCode((num % 26) + 65) + letter;
        num = Math.floor(num / 26) - 1;
    }
    return letter;
}

async function updateStandardizedNames(sheets) {
    const spreadsheetId = config.google.sheets.masterIndexSheetId;
    
    // Update both tabs
    const tabs = [
        { name: 'Drive Import - Standardized', hasParticipants: true },
        { name: 'Standardized Master Index', hasParticipants: true }
    ];
    
    for (const tab of tabs) {
        console.log(`\n🔄 Updating ${tab.name} tab...`);
        console.log('=' .repeat(70));
        
        const range = `'${tab.name}'!A:BZ`;
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        const rows = response.data.values || [];
        const headers = rows[0];
        
        // Find column indices
        const cols = {
            uuid: headers.indexOf('uuid'),
            standardizedName: headers.indexOf('standardizedName'),
            rawName: headers.indexOf('rawName'),
            meetingTopic: headers.indexOf('meetingTopic'),
            participants: headers.indexOf('participants')
        };
        
        console.log(`Total rows: ${rows.length - 1}`);
        
        const updates = [];
        let updateCount = 0;
        
        // Find rows with unknown in standardizedName
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            
            const standardizedName = row[cols.standardizedName] || '';
            const uuid = row[cols.uuid] || '';
            
            if (standardizedName.toLowerCase().includes('unknown')) {
                // Extract session ID from standardizedName or uuid
                let sessionId = null;
                const match = standardizedName.match(/M:([a-f0-9]{16})U:/);
                if (match) {
                    sessionId = match[1];
                } else if (uuid.length === 16 && /^[a-f0-9]{16}$/.test(uuid)) {
                    sessionId = uuid;
                }
                
                if (sessionId && sessionMapping[sessionId]) {
                    const mapping = sessionMapping[sessionId];
                    console.log(`\n✅ Found match for row ${i + 1}:`);
                    console.log(`   Session ID: ${sessionId}`);
                    console.log(`   Current: ${standardizedName}`);
                    
                    // Create new standardized name - fix the replacement logic
                    const newStandardizedName = standardizedName
                        .replace(/unknown/i, mapping.coach)  // First unknown -> coach
                        .replace(/Unknown/i, mapping.student) // First Unknown -> student
                        .replace(/2025-07-07/g, mapping.date);
                    
                    console.log(`   New: ${newStandardizedName}`);
                    
                    // Update standardizedName
                    updates.push({
                        range: `'${tab.name}'!${getColumnLetter(cols.standardizedName)}${i + 1}`,
                        values: [[newStandardizedName]]
                    });
                    
                    // Update participants if available
                    if (tab.hasParticipants && cols.participants >= 0) {
                        updates.push({
                            range: `'${tab.name}'!${getColumnLetter(cols.participants)}${i + 1}`,
                            values: [[`${mapping.coach}, ${mapping.student}`]]
                        });
                    }
                    
                    updateCount++;
                }
            }
        }
        
        // Execute updates
        if (updates.length > 0) {
            console.log(`\n📝 Applying ${updates.length} updates...`);
            
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                resource: {
                    data: updates,
                    valueInputOption: 'USER_ENTERED'
                }
            });
            
            console.log(`✅ Updated ${updateCount} recordings in ${tab.name}`);
        } else {
            console.log(`ℹ️ No matching unknown recordings found in ${tab.name}`);
        }
    }
    
    // Also check if we need to update Drive Import - Raw
    console.log(`\n🔄 Checking Drive Import - Raw tab...`);
    console.log('=' .repeat(70));
    
    const rawRange = `'Drive Import - Raw'!A:Z`;
    const rawResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: rawRange
    });
    
    const rawRows = rawResponse.data.values || [];
    const rawHeaders = rawRows[0];
    
    const rawCols = {
        uuid: rawHeaders.indexOf('uuid'),
        sessionName: rawHeaders.indexOf('sessionName'),
        folderName: rawHeaders.indexOf('folderName')
    };
    
    const rawUpdates = [];
    
    for (let i = 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.length === 0) continue;
        
        const uuid = row[rawCols.uuid] || '';
        const sessionName = row[rawCols.sessionName] || '';
        
        if (uuid && sessionMapping[uuid]) {
            const mapping = sessionMapping[uuid];
            
            // Update session name
            if (rawCols.sessionName >= 0 && sessionName.toLowerCase().includes('unknown')) {
                const newSessionName = sessionName
                    .replace(/unknown/gi, mapping.coach)
                    .replace(/Unknown/g, mapping.student);
                
                rawUpdates.push({
                    range: `'Drive Import - Raw'!${getColumnLetter(rawCols.sessionName)}${i + 1}`,
                    values: [[newSessionName]]
                });
            }
        }
    }
    
    if (rawUpdates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            resource: {
                data: rawUpdates,
                valueInputOption: 'USER_ENTERED'
            }
        });
        
        console.log(`✅ Updated ${rawUpdates.length} rows in Raw tab`);
    }
}

async function main() {
    console.log('🔧 Updating StandardizedName for Unknown Recordings');
    console.log('=' .repeat(70));
    console.log('\nThis will update the standardizedName column to replace unknown with proper names');
    
    try {
        const sheets = await initializeSheets();
        await updateStandardizedNames(sheets);
        
        console.log('\n✅ Update complete!');
        console.log('\n📊 The following recordings should now be fixed:');
        console.log('   - 6 recordings: Coach Jenny, Student Huda');
        console.log('   - 1 recording: Coach Alan, Student Rayaan');
        console.log('\n🎉 Check the sheets - the standardizedName column should show proper names!');
        
    } catch (error) {
        console.error('\n❌ Error:', error);
        console.error('Stack:', error.stack);
    }
}

console.log('🚀 Starting standardizedName update...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });