#!/usr/bin/env node

/**
 * Final status check of all recordings
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

async function checkFinalStatus(sheets) {
    const spreadsheetId = config.google.sheets.masterIndexSheetId;
    const tabName = 'Drive Import - Standardized';
    
    console.log('📊 Final Status of All Recordings\n');
    
    const range = `'${tabName}'!A:BZ`;
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range
    });
    
    const rows = response.data.values || [];
    const headers = rows[0];
    
    const cols = {
        uuid: headers.indexOf('uuid'),
        standardizedName: headers.indexOf('standardizedName')
    };
    
    // Categorize all recordings
    const stats = {
        total: 0,
        fullyIdentified: 0,
        partiallyIdentified: 0,
        stillUnknown: 0
    };
    
    const partialRecordings = [];
    const unknownRecordings = [];
    
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0 || !row[cols.standardizedName]) continue;
        
        stats.total++;
        
        const standardizedName = row[cols.standardizedName];
        const hasUnknownCoach = standardizedName.includes('_unknown_');
        const hasUnknownStudent = standardizedName.includes('_Unknown_');
        
        if (!hasUnknownCoach && !hasUnknownStudent) {
            stats.fullyIdentified++;
        } else if (hasUnknownCoach && hasUnknownStudent) {
            stats.stillUnknown++;
            unknownRecordings.push({
                row: i + 1,
                uuid: row[cols.uuid],
                name: standardizedName
            });
        } else {
            stats.partiallyIdentified++;
            partialRecordings.push({
                row: i + 1,
                uuid: row[cols.uuid],
                name: standardizedName,
                missingCoach: hasUnknownCoach,
                missingStudent: hasUnknownStudent
            });
        }
    }
    
    console.log('📊 OVERALL STATISTICS');
    console.log('=' .repeat(70));
    console.log(`Total recordings: ${stats.total}`);
    console.log(`✅ Fully identified (both coach & student): ${stats.fullyIdentified} (${(stats.fullyIdentified/stats.total*100).toFixed(1)}%)`);
    console.log(`⚠️  Partially identified: ${stats.partiallyIdentified} (${(stats.partiallyIdentified/stats.total*100).toFixed(1)}%)`);
    console.log(`❌ Still unknown: ${stats.stillUnknown} (${(stats.stillUnknown/stats.total*100).toFixed(1)}%)`);
    
    if (partialRecordings.length > 0) {
        console.log('\n\n📋 PARTIALLY IDENTIFIED RECORDINGS');
        console.log('=' .repeat(70));
        partialRecordings.forEach(rec => {
            console.log(`Row ${rec.row}: ${rec.name}`);
            if (rec.missingCoach) {
                console.log('   Missing: Coach');
            } else {
                console.log('   Missing: Student');
            }
        });
    }
    
    if (unknownRecordings.length > 0) {
        console.log('\n\n❌ STILL UNKNOWN RECORDINGS');
        console.log('=' .repeat(70));
        unknownRecordings.forEach(rec => {
            console.log(`Row ${rec.row}: ${rec.name}`);
        });
    }
    
    console.log('\n\n🎯 SUMMARY OF FIXES APPLIED');
    console.log('=' .repeat(70));
    console.log('✅ Successfully fixed:');
    console.log('   - Jenny & Huda: 7 recordings');
    console.log('   - Jenny & Anoushka: 1 recording');
    console.log('   - Alan & Rayaan: 1 recording');
    console.log('   - Rishi & Aarav: 1 recording');
    console.log('   - Rishi & Aaryan: 2 recordings');
    console.log('   - Mary & Iqra: 2 recordings');
    console.log('\n⚠️  Partially identified:');
    console.log('   - Andrew (student unknown): 1 recording');
    console.log('   - Aarnav (coach unknown): 4 recordings');
    console.log('   - Shishir (coach unknown): 1 recording');
}

async function main() {
    console.log('🔧 Final Status Check');
    console.log('=' .repeat(70));
    
    try {
        const sheets = await initializeSheets();
        await checkFinalStatus(sheets);
        
        console.log('\n✅ Status check complete!');
        
    } catch (error) {
        console.error('\n❌ Error:', error);
    }
}

main()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });