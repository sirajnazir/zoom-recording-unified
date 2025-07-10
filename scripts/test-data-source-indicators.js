// Test script to verify data source indicators in standardized names
const CompleteSmartNameStandardizer = require('../src/infrastructure/services/CompleteSmartNameStandardizer');

async function testDataSourceIndicators() {
    console.log('🧪 Testing data source indicators in standardized names...\n');
    
    const standardizer = new CompleteSmartNameStandardizer();
    
    // Test cases with different data sources
    const testCases = [
        {
            name: 'Zoom API Recording',
            input: 'Coaching Session - Jenny & Arshiya Week 5',
            context: {
                dataSource: 'zoom-api',
                meeting_id: '123456',
                uuid: 'ABC123DEF456==',
                start_time: '2025-01-07T10:00:00Z'
            },
            expected: 'Coaching_A'
        },
        {
            name: 'Google Drive Import',
            input: 'Coaching_Jenny Duan_Arshiya_Wk05_2024-11-17',
            context: {
                dataSource: 'google-drive',
                meeting_id: '789012',
                uuid: 'GHI789JKL012==',
                start_time: '2024-11-17T14:00:00Z'
            },
            expected: 'Coaching_B'
        },
        {
            name: 'Webhook Recording',
            input: 'Jamie JudahBram\'s Personal Meeting Room',
            context: {
                dataSource: 'webhook',
                meeting_id: '345678',
                uuid: 'MNO345PQR678==',
                start_time: '2025-01-07T16:00:00Z'
            },
            expected: 'MISC_C'
        },
        {
            name: 'Cloud Batch Recording',
            input: 'SAT Prep Session - Rishi & Kavya',
            context: {
                dataSource: 'zoom-cloud-batch',
                meeting_id: '901234',
                uuid: 'STU901VWX234==',
                start_time: '2025-01-06T09:00:00Z'
            },
            expected: 'SAT_A'
        },
        {
            name: 'Drive MISC Session',
            input: 'Team Meeting - Admin',
            context: {
                dataSource: 'google-drive-import',
                meeting_id: '567890',
                uuid: 'YZA567BCD890==',
                start_time: '2025-01-05T15:00:00Z'
            },
            expected: 'MISC_B'
        }
    ];
    
    console.log('Running test cases...\n');
    
    for (const testCase of testCases) {
        console.log(`📝 Test: ${testCase.name}`);
        console.log(`   Input: "${testCase.input}"`);
        console.log(`   Data Source: ${testCase.context.dataSource}`);
        
        const result = await standardizer.standardizeName(testCase.input, testCase.context);
        
        console.log(`   Result: ${result.standardized}`);
        
        // Check if the result contains the expected indicator
        const hasExpectedIndicator = result.standardized.includes(testCase.expected);
        console.log(`   ✅ Contains "${testCase.expected}": ${hasExpectedIndicator ? 'YES' : 'NO'}`);
        
        if (!hasExpectedIndicator) {
            console.log(`   ❌ Expected to find "${testCase.expected}" in the result`);
        }
        
        console.log('');
    }
    
    console.log('✅ Test complete!');
}

// Run the test
testDataSourceIndicators().catch(console.error);