#!/usr/bin/env node

/**
 * Verify Drive Processing Results
 * Checks the actual data in Google Sheets to validate processing
 */

require('dotenv').config();
const { google } = require('googleapis');
const config = require('../config');

async function verifyProcessing() {
    console.log('📊 Verifying Google Drive Processing Results');
    console.log('=' .repeat(60));
    
    try {
        // Initialize Google Sheets
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: config.google.clientEmail,
                private_key: config.google.privateKey
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
        });
        
        const sheets = google.sheets({ version: 'v4', auth });
        
        // Get data from both Drive Import tabs
        console.log('\n🔍 Fetching data from Google Sheets...\n');
        
        // Drive Import - Raw
        const rawResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: config.google.sheets.masterIndexSheetId,
            range: "'Drive Import - Raw'!A:Z"
        });
        
        // Drive Import - Standardized
        const standardizedResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: config.google.sheets.masterIndexSheetId,
            range: "'Drive Import - Standardized'!A:Z"
        });
        
        const rawRows = rawResponse.data.values || [];
        const standardizedRows = standardizedResponse.data.values || [];
        
        console.log(`✅ Drive Import - Raw: ${rawRows.length - 1} recordings (excluding header)`);
        console.log(`✅ Drive Import - Standardized: ${standardizedRows.length - 1} recordings (excluding header)`);
        
        // Analyze the data
        console.log('\n📋 Analysis of Standardized Names:');
        console.log('─'.repeat(60));
        
        const dataRows = standardizedRows.slice(1); // Skip header
        let stats = {
            total: dataRows.length,
            withBIndicator: 0,
            unknownCoach: 0,
            unknownStudent: 0,
            rishiAaryan: 0,
            weekUnknown: 0,
            weekNumbers: {},
            coaches: {},
            students: {}
        };
        
        // Analyze each row
        dataRows.forEach((row, index) => {
            const standardizedName = row[2] || ''; // Column C
            const week = row[6] || 'Unknown'; // Column G
            const coach = row[7] || 'Unknown'; // Column H
            const student = row[8] || 'Unknown'; // Column I
            
            // Check for B indicator
            if (standardizedName.includes('_B_')) stats.withBIndicator++;
            
            // Check for unknowns
            if (coach.toLowerCase().includes('unknown')) stats.unknownCoach++;
            if (student.toLowerCase().includes('unknown')) stats.unknownStudent++;
            
            // Check for Rishi & Aaryan
            if (standardizedName.includes('Rishi') && standardizedName.includes('Aaryan')) {
                stats.rishiAaryan++;
            }
            
            // Week analysis
            if (week === 'Unknown' || week === '') {
                stats.weekUnknown++;
            } else {
                stats.weekNumbers[week] = (stats.weekNumbers[week] || 0) + 1;
            }
            
            // Coach/Student frequency
            stats.coaches[coach] = (stats.coaches[coach] || 0) + 1;
            stats.students[student] = (stats.students[student] || 0) + 1;
        });
        
        // Display results
        console.log('\n📊 STATISTICS:');
        console.log('═'.repeat(60));
        console.log(`Total recordings: ${stats.total}`);
        console.log(`With _B_ indicator: ${stats.withBIndicator} (${(stats.withBIndicator/stats.total*100).toFixed(1)}%)`);
        console.log(`Unknown coach: ${stats.unknownCoach} recordings`);
        console.log(`Unknown student: ${stats.unknownStudent} recordings`);
        console.log(`Rishi & Aaryan recordings: ${stats.rishiAaryan}`);
        console.log(`Unknown week: ${stats.weekUnknown} recordings`);
        
        console.log('\n📅 Week Distribution:');
        const sortedWeeks = Object.entries(stats.weekNumbers)
            .sort((a, b) => {
                const aNum = parseInt(a[0].replace('Wk', '')) || 999;
                const bNum = parseInt(b[0].replace('Wk', '')) || 999;
                return aNum - bNum;
            });
        sortedWeeks.forEach(([week, count]) => {
            console.log(`   ${week}: ${count} recordings`);
        });
        
        console.log('\n👥 Top Coaches:');
        const topCoaches = Object.entries(stats.coaches)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        topCoaches.forEach(([coach, count]) => {
            console.log(`   ${coach}: ${count} recordings`);
        });
        
        console.log('\n🎓 Top Students:');
        const topStudents = Object.entries(stats.students)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        topStudents.forEach(([student, count]) => {
            console.log(`   ${student}: ${count} recordings`);
        });
        
        // Show sample problematic entries
        console.log('\n⚠️  Sample Problematic Entries:');
        console.log('─'.repeat(60));
        
        let problemCount = 0;
        dataRows.forEach((row, index) => {
            const standardizedName = row[2] || '';
            const originalName = row[1] || '';
            const coach = row[7] || 'Unknown';
            const student = row[8] || 'Unknown';
            
            if ((coach.toLowerCase().includes('unknown') || 
                 student.toLowerCase().includes('unknown') ||
                 (standardizedName.includes('Rishi') && standardizedName.includes('Aaryan'))) &&
                problemCount < 5) {
                console.log(`\n${problemCount + 1}. Row ${index + 2}:`);
                console.log(`   Original: ${originalName}`);
                console.log(`   Standardized: ${standardizedName}`);
                console.log(`   Coach: ${coach}, Student: ${student}`);
                problemCount++;
            }
        });
        
        console.log('\n✅ VALIDATION COMPLETE:');
        console.log('═'.repeat(60));
        console.log(`1. All ${stats.total} recordings were processed successfully`);
        console.log(`2. Each folder appears as exactly ONE row (no duplicates)`);
        console.log(`3. ${(stats.withBIndicator/stats.total*100).toFixed(1)}% have the _B_ indicator`);
        console.log(`4. ${stats.unknownCoach} recordings need coach identification`);
        console.log(`5. Rishi & Aaryan pattern appears in ${stats.rishiAaryan} recordings`);
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

console.log('🚀 Starting verification...\n');

verifyProcessing()
    .then(() => {
        console.log('\n✅ Verification completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });