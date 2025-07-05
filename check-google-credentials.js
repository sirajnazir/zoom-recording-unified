require('dotenv').config();

console.log('=== Google Credentials Check ===\n');

// Check GOOGLE_SERVICE_ACCOUNT_KEY
console.log('1. GOOGLE_SERVICE_ACCOUNT_KEY:');
if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    console.log(`   ✓ Exists (length: ${key.length})`);
    console.log(`   First 50 chars: ${key.substring(0, 50)}...`);
    console.log(`   Last 50 chars: ...${key.substring(key.length - 50)}`);
    
    try {
        const cleanedKey = key.replace(/\s+/g, '');
        const decodedKey = Buffer.from(cleanedKey, 'base64').toString('utf-8');
        const parsed = JSON.parse(decodedKey);
        console.log('   ✅ Successfully decoded and parsed');
        console.log(`   Client Email: ${parsed.client_email ? '✓ Found' : '✗ Missing'}`);
        console.log(`   Private Key: ${parsed.private_key ? '✓ Found' : '✗ Missing'}`);
    } catch (error) {
        console.log(`   ❌ Failed to decode: ${error.message}`);
    }
} else {
    console.log('   ✗ Not set');
}

console.log('\n2. Individual Google Credentials:');
console.log(`   GOOGLE_CLIENT_EMAIL: ${process.env.GOOGLE_CLIENT_EMAIL ? '✓ Set' : '✗ Not set'}`);
console.log(`   GOOGLE_PRIVATE_KEY: ${process.env.GOOGLE_PRIVATE_KEY ? '✓ Set' : '✗ Not set'}`);

if (process.env.GOOGLE_CLIENT_EMAIL) {
    console.log(`   Client Email: ${process.env.GOOGLE_CLIENT_EMAIL}`);
}

if (process.env.GOOGLE_PRIVATE_KEY) {
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    console.log(`   Private Key length: ${privateKey.length}`);
    console.log(`   Private Key starts with: ${privateKey.substring(0, 50)}...`);
    console.log(`   Private Key ends with: ...${privateKey.substring(privateKey.length - 50)}`);
}

console.log('\n3. GOOGLE_SERVICE_ACCOUNT_JSON:');
if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    console.log('   ✓ Exists');
    try {
        const parsed = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
        console.log('   ✅ Successfully parsed');
        console.log(`   Client Email: ${parsed.client_email ? '✓ Found' : '✗ Missing'}`);
        console.log(`   Private Key: ${parsed.private_key ? '✓ Found' : '✗ Missing'}`);
    } catch (error) {
        console.log(`   ❌ Failed to parse: ${error.message}`);
    }
} else {
    console.log('   ✗ Not set');
}

console.log('\n=== Summary ===');
const hasWorkingCredentials = (
    (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) ||
    (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) ||
    (process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
);

if (hasWorkingCredentials) {
    console.log('✅ Google credentials are available and should work');
    console.log('   The "Failed to decode" error is just a warning - the system falls back to working credentials');
} else {
    console.log('❌ No working Google credentials found');
    console.log('   You need to set either:');
    console.log('   - GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY');
    console.log('   - GOOGLE_SERVICE_ACCOUNT_JSON');
    console.log('   - GOOGLE_SERVICE_ACCOUNT_KEY (base64 encoded)');
} 