/**
 * Verify Render Configuration
 * 
 * This script helps verify that all required environment variables
 * are properly configured on the Render webhook server
 */

require('dotenv').config();
const axios = require('axios');

async function verifyRenderConfig() {
    console.log('🔍 Verifying Render Webhook Configuration\n');
    
    const WEBHOOK_URL = process.env.WEBHOOK_BASE_URL || 'https://zoom-webhook-v2.onrender.com';
    
    console.log('📡 Testing webhook server at:', WEBHOOK_URL);
    console.log('=' .repeat(60));
    
    // Required environment variables
    const requiredVars = {
        'Google Auth': [
            'GOOGLE_SERVICE_ACCOUNT_KEY',
            'GOOGLE_SERVICE_ACCOUNT_JSON',
            'GOOGLE_CLIENT_EMAIL'
        ],
        'Google Drive': [
            'RECORDINGS_ROOT_FOLDER_ID',
            'COACHES_FOLDER_ID', 
            'STUDENTS_FOLDER_ID',
            'MISC_FOLDER_ID',
            'TRIVIAL_FOLDER_ID'
        ],
        'Google Sheets': [
            'MASTER_INDEX_SHEET_ID'
        ],
        'Zoom API': [
            'ZOOM_ACCOUNT_ID',
            'ZOOM_CLIENT_ID',
            'ZOOM_CLIENT_SECRET',
            'ZOOM_WEBHOOK_SECRET_TOKEN'
        ],
        'Processing': [
            'SAVE_TO_SHEETS',
            'DOWNLOAD_FILES',
            'USE_CACHE'
        ]
    };
    
    try {
        // Test server health
        console.log('\n1️⃣ Testing Server Health...');
        const healthResponse = await axios.get(WEBHOOK_URL);
        console.log('✅ Server is running:', healthResponse.data.status || 'OK');
        
        // Test environment endpoint if available
        console.log('\n2️⃣ Checking Environment Variables...');
        try {
            const envResponse = await axios.get(`${WEBHOOK_URL}/test`);
            const envData = envResponse.data;
            
            console.log('\n📋 Environment Status:');
            
            // Check each category
            for (const [category, vars] of Object.entries(requiredVars)) {
                console.log(`\n${category}:`);
                
                for (const varName of vars) {
                    const isSet = envData.environment?.[varName] || 
                                 envData[varName] || 
                                 (envData.message && envData.message.includes(varName));
                    
                    if (isSet) {
                        console.log(`  ✅ ${varName}: Configured`);
                    } else {
                        console.log(`  ❌ ${varName}: Missing or not visible`);
                    }
                }
            }
            
            // Special check for Google Auth
            console.log('\n🔐 Google Authentication Status:');
            const hasGoogleAuth = 
                envData.environment?.GOOGLE_SERVICE_ACCOUNT_KEY ||
                envData.environment?.GOOGLE_SERVICE_ACCOUNT_JSON ||
                envData.environment?.GOOGLE_CLIENT_EMAIL;
            
            if (hasGoogleAuth) {
                console.log('✅ Google Service Account appears to be configured');
            } else {
                console.log('❌ Google Service Account NOT configured!');
                console.log('   This is why webhook processing is failing!');
            }
            
        } catch (error) {
            console.log('⚠️  Test endpoint not available or restricted');
        }
        
        // Test webhook endpoint
        console.log('\n3️⃣ Testing Webhook Endpoint...');
        try {
            const webhookTest = await axios.post(
                `${WEBHOOK_URL}/webhook`,
                { event: 'test' },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-zm-signature': 'test',
                        'x-zm-timestamp': Date.now().toString()
                    },
                    validateStatus: () => true
                }
            );
            
            if (webhookTest.status === 200) {
                console.log('✅ Webhook endpoint is responding');
            } else {
                console.log(`⚠️  Webhook returned status: ${webhookTest.status}`);
            }
        } catch (error) {
            console.log('❌ Webhook endpoint error:', error.message);
        }
        
    } catch (error) {
        console.error('❌ Server connection error:', error.message);
        console.log('\nMake sure the webhook server is running on Render');
    }
    
    console.log('\n' + '=' .repeat(60));
    console.log('\n📝 Configuration Checklist:');
    console.log('1. [ ] Add GOOGLE_SERVICE_ACCOUNT_KEY to Render environment');
    console.log('2. [ ] Add all Google Drive folder IDs');
    console.log('3. [ ] Add Google Sheets ID');
    console.log('4. [ ] Add Zoom API credentials');
    console.log('5. [ ] Set processing flags (SAVE_TO_SHEETS=true, etc.)');
    console.log('6. [ ] Save changes and wait for service restart');
    
    console.log('\n💡 Next Steps:');
    console.log('1. Go to https://dashboard.render.com');
    console.log('2. Open your zoom-webhook-v2 service');
    console.log('3. Click "Environment" tab');
    console.log('4. Add missing variables from the checklist above');
    console.log('5. Use render-webhook-configuration-guide.md for detailed instructions');
}

// Run verification
verifyRenderConfig().catch(console.error);