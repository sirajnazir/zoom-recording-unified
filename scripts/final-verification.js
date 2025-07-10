#!/usr/bin/env node

/**
 * Final verification of the fixes
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

async function initializeSheets() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: config.google.clientEmail,
            private_key: config.google.privateKey
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    
    return google.sheets({ version: 'v4', auth });
}

async function verifyFixes(sheets) {
    const spreadsheetId = config.google.sheets.masterIndexSheetId;
    const tabName = 'Drive Import - Standardized';
    
    console.log(`📊 Final Verification of ${tabName}`);
    console.log('=' .repeat(70));
    
    const range = `'${tabName}'!A:BZ`;
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range
    });
    
    const rows = response.data.values || [];
    const headers = rows[0];
    
    const cols = {
        uuid: headers.indexOf('uuid'),
        standardizedName: headers.indexOf('standardizedName'),
        rawName: headers.indexOf('rawName'),
        meetingTopic: headers.indexOf('meetingTopic')
    };
    
    console.log(`\nTotal rows: ${rows.length - 1}\n`);
    
    // Our session IDs
    const ourSessionIds = [
        '330f04559d336f8b',
        '67b7b4ddb94d9714',
        '7247ecbd0e5fae62',
        '7190c776c4c0d307',
        '324b9bb1a74a3f89',
        '0f53dda2ddac18b2',
        '37b4f7c7f24f1a85'
    ];
    
    console.log('🔍 Status of our 7 recordings:\n');
    
    let foundCount = 0;
    let stillUnknownCount = 0;
    
    for (const sessionId of ourSessionIds) {
        let found = false;
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            
            const uuid = row[cols.uuid] || '';
            const standardizedName = row[cols.standardizedName] || '';
            
            if (uuid === sessionId || standardizedName.includes(sessionId)) {
                found = true;
                foundCount++;
                
                const hasUnknown = standardizedName.toLowerCase().includes('unknown');
                const status = hasUnknown ? '❌ STILL UNKNOWN' : '✅ FIXED';
                
                if (hasUnknown) stillUnknownCount++;
                
                console.log(`${status} Session ${sessionId}:`);
                console.log(`   Row: ${i + 1}`);
                console.log(`   Name: ${standardizedName}`);
                
                // Extract coach/student from standardizedName
                const match = standardizedName.match(/Coaching_B_([^_]+)_([^_]+)_/);
                if (match) {
                    console.log(`   Coach: ${match[1]}, Student: ${match[2]}`);
                }
                console.log('');
                break;
            }
        }
        
        if (!found) {
            console.log(`❓ NOT FOUND: Session ${sessionId}\n`);
        }
    }
    
    console.log('─'.repeat(70));
    console.log('\n📊 Summary:');
    console.log(`- Found: ${foundCount} out of 7 recordings`);
    console.log(`- Fixed: ${foundCount - stillUnknownCount} recordings`);
    console.log(`- Still unknown: ${stillUnknownCount} recordings`);
    
    // Check for any other unknowns
    console.log('\n🔍 Checking for other unknown recordings...\n');
    
    let totalUnknowns = 0;
    const unknownSamples = [];
    
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        
        const standardizedName = row[cols.standardizedName] || '';
        
        if (standardizedName.toLowerCase().includes('unknown')) {
            totalUnknowns++;
            if (unknownSamples.length < 5) {
                unknownSamples.push({
                    row: i + 1,
                    name: standardizedName,
                    uuid: row[cols.uuid] || ''
                });
            }
        }
    }
    
    if (totalUnknowns > 0) {
        console.log(`❌ Total unknown recordings in sheet: ${totalUnknowns}`);
        console.log('\nSamples:');
        unknownSamples.forEach(sample => {
            console.log(`   Row ${sample.row}: ${sample.name}`);
        });
        if (totalUnknowns > 5) {
            console.log(`   ... and ${totalUnknowns - 5} more`);
        }
    } else {
        console.log('✅ No unknown recordings found in the sheet!');
    }
}

async function main() {
    console.log('🔧 Final Verification of Unknown Recordings Fix');
    console.log('=' .repeat(70));
    
    try {
        const sheets = await initializeSheets();
        await verifyFixes(sheets);
        
        console.log('\n✅ Verification complete!');
        
    } catch (error) {
        console.error('\n❌ Error:', error);
    }
}

console.log('🚀 Starting verification...\n');

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });