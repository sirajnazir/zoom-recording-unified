#!/usr/bin/env node
require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

async function validateRecordings() {
    console.log('🔍 Simple UUID-based Validation\n');
    
    const auth = new google.auth.GoogleAuth({
        keyFile: 'google-credentials.json',
        scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
    });
    
    const authClient = await auth.getClient();
    const drive = google.drive({ version: 'v3', auth: authClient });
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    
    // 1. Get all UUIDs from Drive
    console.log('📁 Collecting UUIDs from Google Drive...');
    const driveUuids = new Set();
    const driveRecordings = new Map();
    
    async function scanFolder(folderId, depth = 0) {
        try {
            const response = await drive.files.list({
                q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'files(id, name)',
                pageSize: 1000
            });
            
            for (const folder of response.data.files) {
                // Extract UUID from folder name
                const uuidMatch = folder.name.match(/U[_:]([A-Za-z0-9+/=]+)/);
                if (uuidMatch) {
                    const uuid = uuidMatch[1];
                    driveUuids.add(uuid);
                    driveRecordings.set(uuid, folder.name);
                } else if (depth < 3) {
                    // Scan subfolders
                    await scanFolder(folder.id, depth + 1);
                }
            }
        } catch (error) {
            console.error('Error scanning folder:', error.message);
        }
    }
    
    await scanFolder('1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg'); // Root folder
    console.log(`   Found ${driveUuids.size} recordings in Drive\n`);
    
    // 2. Get UUIDs from sheets
    console.log('📊 Collecting UUIDs from Google Sheets...');
    const sheetUuids = new Map();
    const hexUuids = new Map();
    
    const sheetId = '1xa4E5PcrxRVaMbJfWH_d5LLSqY3RlCf6Ur3rwKtq2jQ';
    const tabs = ['Raw Master Index', 'Standardized Master Index'];
    
    for (const tabName of tabs) {
        try {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: sheetId,
                range: `'${tabName}'!A:Z`
            });
            
            const rows = response.data.values || [];
            if (rows.length > 1) {
                const headers = rows[0];
                const uuidCol = headers.findIndex(h => h && h.toLowerCase().includes('uuid'));
                const topicCol = headers.findIndex(h => h && h.toLowerCase().includes('topic'));
                const dateCol = headers.findIndex(h => h && h.toLowerCase().includes('date') || h.toLowerCase().includes('start'));
                
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (row && uuidCol >= 0 && row[uuidCol]) {
                        const uuid = row[uuidCol];
                        const topic = topicCol >= 0 ? row[topicCol] : 'Unknown';
                        const date = dateCol >= 0 ? row[dateCol] : 'Unknown';
                        
                        // Check if it's hex format (16-32 chars, only hex)
                        if (/^[0-9a-f]{16,32}$/i.test(uuid)) {
                            hexUuids.set(uuid, { topic, date, tab: tabName });
                        } else {
                            sheetUuids.set(uuid, { topic, date, tab: tabName });
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Error loading ${tabName}:`, error.message);
        }
    }
    
    console.log(`   Found ${sheetUuids.size} Base64 UUIDs in sheets`);
    console.log(`   Found ${hexUuids.size} Hex UUIDs in sheets\n`);
    
    // 3. Compare and find missing
    console.log('🔍 Comparing UUIDs...\n');
    
    const missing = [];
    const found = [];
    
    // Check Base64 UUIDs
    for (const [uuid, info] of sheetUuids) {
        if (driveUuids.has(uuid)) {
            found.push({ uuid, ...info, folder: driveRecordings.get(uuid) });
        } else {
            missing.push({ uuid, ...info, format: 'base64' });
        }
    }
    
    // For hex UUIDs, we need to check if they might be partial matches
    console.log('🔍 Checking hex UUIDs for partial matches...');
    const hexMatches = [];
    
    for (const [hexUuid, info] of hexUuids) {
        let matched = false;
        
        // Check if hex UUID is part of any Drive UUID
        for (const driveUuid of driveUuids) {
            // Convert Drive UUID to hex to compare
            try {
                const buffer = Buffer.from(driveUuid.replace(/=+$/, ''), 'base64');
                const driveHex = buffer.toString('hex');
                
                if (driveHex.includes(hexUuid) || hexUuid.includes(driveHex)) {
                    hexMatches.push({
                        hexUuid,
                        driveUuid,
                        folder: driveRecordings.get(driveUuid),
                        ...info
                    });
                    matched = true;
                    break;
                }
            } catch (e) {
                // Invalid base64, skip
            }
        }
        
        if (!matched) {
            missing.push({ uuid: hexUuid, ...info, format: 'hex' });
        }
    }
    
    // 4. Generate report
    console.log('\n📊 VALIDATION RESULTS:');
    console.log('================================================================================');
    console.log(`Total recordings in Drive: ${driveUuids.size}`);
    console.log(`Total UUIDs in sheets: ${sheetUuids.size + hexUuids.size}`);
    console.log(`Found: ${found.length + hexMatches.length}`);
    console.log(`Missing: ${missing.length}`);
    
    if (missing.length > 0) {
        console.log('\n❌ MISSING RECORDINGS:');
        console.log('================================================================================');
        missing.slice(0, 20).forEach((rec, idx) => {
            console.log(`${idx + 1}. ${rec.topic}`);
            console.log(`   UUID: ${rec.uuid} (${rec.format})`);
            console.log(`   Date: ${rec.date}`);
            console.log(`   Source: ${rec.tab}`);
        });
        
        if (missing.length > 20) {
            console.log(`\n... and ${missing.length - 20} more`);
        }
    }
    
    if (hexMatches.length > 0) {
        console.log('\n✅ HEX UUID MATCHES FOUND:');
        console.log('================================================================================');
        hexMatches.slice(0, 10).forEach((match, idx) => {
            console.log(`${idx + 1}. ${match.topic}`);
            console.log(`   Hex UUID: ${match.hexUuid}`);
            console.log(`   Drive UUID: ${match.driveUuid}`);
            console.log(`   Folder: ${match.folder}`);
        });
    }
    
    // Save detailed report
    const report = {
        timestamp: new Date().toISOString(),
        summary: {
            driveTotal: driveUuids.size,
            sheetsTotal: sheetUuids.size + hexUuids.size,
            found: found.length + hexMatches.length,
            missing: missing.length
        },
        missing,
        hexMatches,
        found: found.slice(0, 100) // First 100 to keep file size reasonable
    };
    
    const reportPath = `validation-reports/simple-uuid-validation-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
}

validateRecordings().catch(console.error);