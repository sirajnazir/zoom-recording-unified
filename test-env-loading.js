require('dotenv').config();

console.log('🔍 Testing Environment Variable Loading');
console.log('======================================');

// Check if key environment variables are loaded
const requiredVars = [
    'GOOGLE_CLIENT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
    'MASTER_INDEX_SHEET_ID',
    'RECORDINGS_ROOT_FOLDER_ID'
];

console.log('\n📋 Environment Variables Check:');
console.log('--------------------------------');

let allPresent = true;
requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
        console.log(`✅ ${varName}: ${value.substring(0, 20)}...`);
    } else {
        console.log(`❌ ${varName}: NOT FOUND`);
        allPresent = false;
    }
});

if (allPresent) {
    console.log('\n✅ All required environment variables are loaded!');
} else {
    console.log('\n❌ Some environment variables are missing!');
}

// Test config loading
console.log('\n📋 Testing Config Loading:');
console.log('---------------------------');

try {
    const config = require('./src/shared/config/smart-config');
    console.log('✅ SmartConfig loaded successfully');
    
    // Check specific config values
    const googleEmail = config.get('google.clientEmail');
    const sheetId = config.get('google.sheets.masterIndexSheetId');
    const driveFolderId = config.get('google.drive.parentFolderId');
    
    console.log(`Google Email: ${googleEmail ? 'Present' : 'Missing'}`);
    console.log(`Sheet ID: ${sheetId ? 'Present' : 'Missing'}`);
    console.log(`Drive Folder ID: ${driveFolderId ? 'Present' : 'Missing'}`);
    
} catch (error) {
    console.log('❌ Failed to load SmartConfig:', error.message);
} 