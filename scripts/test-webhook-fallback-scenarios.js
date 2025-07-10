/**
 * Test script to verify different webhook download fallback scenarios
 */

require('dotenv').config();
const { getContainer } = require('../src/container');
const { WebhookRecordingAdapter } = require('../src/infrastructure/services/WebhookRecordingAdapter');

// Mock axios for testing different scenarios
const axios = require('axios');
const originalAxios = axios.create;

async function testScenario(scenarioName, mockAxiosResponse, expectedBehavior) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing Scenario: ${scenarioName}`);
    console.log('='.repeat(60));
    
    const container = getContainer();
    const logger = container.resolve('logger');
    const adapter = new WebhookRecordingAdapter(container);

    // Mock webhook payload
    const mockWebhookPayload = {
        payload: {
            object: {
                uuid: "test-uuid-123",
                id: "123456789",
                topic: `Test Recording - ${scenarioName}`,
                start_time: new Date().toISOString(),
                duration: 3600,
                timezone: "America/New_York",
                host_id: "test-host-id",
                host_email: "test@example.com",
                type: 8,
                share_url: "https://zoom.us/share/test",
                download_access_token: "test-access-token",
                recording_files: [
                    {
                        id: "file-1",
                        meeting_id: "123456789",
                        recording_start: new Date().toISOString(),
                        recording_end: new Date(Date.now() + 3600000).toISOString(),
                        file_type: "MP4",
                        file_size: 1024000,
                        play_url: "https://zoom.us/play/test",
                        download_url: "https://zoom.us/rec/download/test-file",
                        status: "completed"
                    }
                ]
            }
        }
    };

    // Mock axios for this scenario
    axios.create = () => ({
        get: mockAxiosResponse.get || originalAxios().get,
        post: mockAxiosResponse.post || originalAxios().post
    });
    
    // Override axios direct call
    const originalAxiosCall = axios;
    axios.default = mockAxiosResponse.directCall || originalAxiosCall;
    Object.setPrototypeOf(axios, mockAxiosResponse.directCall || originalAxiosCall);

    try {
        const transformedRecording = await adapter.transformWebhookRecording(mockWebhookPayload);
        const downloadResults = await adapter.downloadWebhookRecordingFiles(transformedRecording);
        
        // Analyze results
        const successCount = downloadResults.filter(r => r.success).length;
        const fallbackCount = downloadResults.filter(r => r.fallback_method === 'zoom_api').length;
        
        console.log('\nResults:');
        console.log(`- Total files: ${downloadResults.length}`);
        console.log(`- Successful downloads: ${successCount}`);
        console.log(`- Failed downloads: ${downloadResults.length - successCount}`);
        console.log(`- Used fallback: ${fallbackCount > 0 ? 'Yes' : 'No'}`);
        console.log(`- Expected: ${expectedBehavior}`);
        
        // Verify expectation
        const meetExpectation = expectedBehavior.includes('fallback') ? 
            fallbackCount > 0 : fallbackCount === 0;
        console.log(`- Test ${meetExpectation ? 'PASSED' : 'FAILED'}`);
        
    } catch (error) {
        console.error('Test error:', error.message);
    } finally {
        // Restore axios
        axios.create = originalAxios;
    }
}

async function runTests() {
    console.log('Starting Webhook Fallback Tests...\n');

    // Scenario 1: Authentication failure (401) - should trigger fallback
    await testScenario(
        'Authentication Failure (401)',
        {
            directCall: () => Promise.reject({
                response: { status: 401 },
                message: 'Unauthorized'
            })
        },
        'Should trigger fallback to Zoom API'
    );

    // Scenario 2: Forbidden (403) - should trigger fallback
    await testScenario(
        'Forbidden Access (403)', 
        {
            directCall: () => Promise.reject({
                response: { status: 403 },
                message: 'Forbidden'
            })
        },
        'Should trigger fallback to Zoom API'
    );

    // Scenario 3: Network timeout - should NOT trigger fallback
    await testScenario(
        'Network Timeout',
        {
            directCall: () => Promise.reject({
                code: 'ETIMEDOUT',
                message: 'Network timeout'
            })
        },
        'Should NOT trigger fallback (not an auth issue)'
    );

    // Scenario 4: Server error (500) - should NOT trigger fallback
    await testScenario(
        'Server Error (500)',
        {
            directCall: () => Promise.reject({
                response: { status: 500 },
                message: 'Internal Server Error'
            })
        },
        'Should NOT trigger fallback (not an auth issue)'
    );

    // Scenario 5: Successful download - should NOT trigger fallback
    await testScenario(
        'Successful Download',
        {
            directCall: () => Promise.resolve({
                data: {
                    pipe: (writer) => {
                        // Simulate successful stream
                        setTimeout(() => writer.emit('finish'), 100);
                    }
                }
            })
        },
        'Should NOT trigger fallback (download successful)'
    );

    console.log('\n' + '='.repeat(60));
    console.log('All tests completed!');
    console.log('='.repeat(60));
}

// Run all test scenarios
runTests().catch(console.error);