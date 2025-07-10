#!/usr/bin/env node
/**
 * Test Resume Setup
 * Verifies the CSV file and shows what would be processed
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parse/sync');

const CSV_FILE = 'recordings-last30days-2025-07-07.csv';
const RECORDINGS_TO_SKIP = 221;

console.log('🔍 Testing Resume Setup...\n');

// Check CSV file
const csvPath = path.join(process.cwd(), CSV_FILE);
if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    process.exit(1);
}

// Read and parse CSV
const csvContent = fs.readFileSync(csvPath, 'utf8');
const records = csv.parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
});

console.log(`📊 Total recordings in CSV: ${records.length}`);
console.log(`📊 Will skip first: ${RECORDINGS_TO_SKIP} recordings`);
console.log(`📊 Will process: ${records.length - RECORDINGS_TO_SKIP} recordings\n`);

// Show recording #222 details
if (records.length >= 222) {
    const recording222 = records[221]; // 0-based index
    console.log('📋 Recording #222 (first to process):');
    console.log(`   Topic: ${recording222.topic || 'No Topic'}`);
    console.log(`   UUID: ${recording222.uuid || recording222.uuid_base64}`);
    console.log(`   Meeting ID: ${recording222.meeting_id}`);
    console.log(`   Host: ${recording222.host_email}`);
    console.log(`   Start Time: ${recording222.start_time}`);
}

// Show last few recordings
console.log('\n📋 Last 3 recordings in file:');
for (let i = Math.max(0, records.length - 3); i < records.length; i++) {
    const rec = records[i];
    const num = i + 1;
    console.log(`\n   Recording #${num}:`);
    console.log(`   Topic: ${rec.topic || 'No Topic'}`);
    console.log(`   UUID: ${rec.uuid || rec.uuid_base64}`);
    console.log(`   Meeting ID: ${rec.meeting_id}`)
}

// Check UUID availability
console.log('\n🔍 UUID Check:');
let missingUuid = 0;
records.forEach((rec, idx) => {
    if (!rec.uuid && !rec.uuid_base64) {
        missingUuid++;
        if (missingUuid <= 5) { // Show first 5 missing
            console.log(`   ⚠️ Missing UUID: Recording #${idx + 1} - ${rec.topic}`);
        }
    }
});

if (missingUuid > 0) {
    console.log(`\n⚠️ Total recordings missing UUID: ${missingUuid}`);
} else {
    console.log('✅ All recordings have UUID!');
}

console.log('\n✅ Test complete. Run ./resume-zoom-processing.js to start processing.');