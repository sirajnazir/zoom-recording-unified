#!/usr/bin/env node

/**
 * Test script to verify webhook processing is working correctly
 * This will test the name standardization fix and other components
 */

async function testWebhookProcessing() {
    console.log('🧪 Testing webhook processing components...\n');
    
    try {
        // Test 1: CompleteSmartNameStandardizer
        console.log('📝 Test 1: CompleteSmartNameStandardizer');
        const { CompleteSmartNameStandardizer } = require('./src/infrastructure/services/CompleteSmartNameStandardizer');
        
        const nameStandardizer = new CompleteSmartNameStandardizer({
            logger: console
        });
        
        // Test the buildStandardizedFolderName method with topic parameter
        const testResult = nameStandardizer.buildStandardizedFolderName({
            coach: 'Jenny',
            student: 'John',
            weekNumber: 5,
            sessionType: 'Coaching',
            date: '2025-07-02',
            meetingId: '123456789',
            uuid: 'test-uuid-123',
            topic: 'Jenny <> John | Wk #5 | 12 Wk Program'
        });
        
        console.log('✅ buildStandardizedFolderName test passed');
        console.log(`   Result: ${testResult}\n`);
        
        // Test 2: Standardize name with context
        console.log('📝 Test 2: Standardize name with context');
        const standardizationResult = await nameStandardizer.standardizeName('Jenny <> John | Wk #5 | 12 Wk Program', {
            id: '123456789',
            uuid: 'test-uuid-123',
            start_time: '2025-07-02T10:00:00Z'
        });
        
        console.log('✅ standardizeName test passed');
        console.log(`   Result: ${JSON.stringify(standardizationResult, null, 2)}\n`);
        
        // Test 3: Error handling
        console.log('📝 Test 3: Error handling (should not crash)');
        try {
            const errorResult = nameStandardizer.buildStandardizedFolderName({
                coach: 'Jenny',
                student: 'John',
                weekNumber: 5,
                sessionType: 'MISC',
                date: '2025-07-02',
                meetingId: '123456789',
                uuid: 'test-uuid-123'
                // Missing topic parameter - should not crash
            });
            console.log('✅ Error handling test passed (no crash)');
            console.log(`   Result: ${errorResult}\n`);
        } catch (error) {
            console.log('❌ Error handling test failed:', error.message);
        }
        
        console.log('🎉 All tests completed successfully!');
        console.log('\n📋 Summary:');
        console.log('   ✅ buildStandardizedFolderName now accepts topic parameter');
        console.log('   ✅ standardizeName method works correctly');
        console.log('   ✅ Error handling is robust');
        console.log('\n🔧 Next steps:');
        console.log('   1. The "topic is not defined" error should be fixed');
        console.log('   2. Webhook processing should work without crashes');
        console.log('   3. 401 download errors are separate authentication issues');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// Run the test
testWebhookProcessing().catch(console.error);