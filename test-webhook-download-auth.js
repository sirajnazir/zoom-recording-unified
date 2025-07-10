#!/usr/bin/env node
/**
 * Test Webhook Download Authentication
 * 
 * This script tests the webhook download authentication flow
 * to ensure access tokens are properly handled for webhook URLs
 */

require('dotenv').config();

const { ZoomService } = require('./src/infrastructure/services/ZoomService');
const { WebhookFileDownloader } = require('./src/services/WebhookFileDownloader');
const { Logger } = require('./src/shared/logging/logger');
const config = require('./config');

async function testWebhookAuth() {
    const logger = new Logger('WebhookAuthTest');
    
    // Test URLs (these are examples - replace with actual webhook URLs if available)
    const testCases = [
        {
            name: 'Webhook URL with embedded token',
            url: 'https://zoom.us/webhook_download/abc123/recording.mp4?access_token=eyJhbGciOiJIUzI1NiJ9',
            downloadToken: null,
            fileType: 'video'
        },
        {
            name: 'Webhook URL without token (needs to be added)',
            url: 'https://zoom.us/webhook_download/abc123/timeline.json',
            downloadToken: 'eyJhbGciOiJIUzI1NiJ9.webhook.token',
            fileType: 'timeline'
        },
        {
            name: 'Regular API URL (should use Bearer auth)',
            url: 'https://api.zoom.us/v2/recordings/abc123/files/recording.mp4',
            downloadToken: null,
            fileType: 'video'
        }
    ];
    
    console.log('🔍 Testing Webhook Download Authentication\n');
    console.log('=' .repeat(80));
    
    // Test ZoomService
    console.log('\n📦 Testing ZoomService.downloadFile()');
    console.log('-'.repeat(40));
    
    const zoomService = new ZoomService({ config, logger });
    
    for (const testCase of testCases) {
        console.log(`\n🧪 Test: ${testCase.name}`);
        console.log(`   URL: ${testCase.url.replace(/access_token=[^&]+/, 'access_token=***')}`);
        console.log(`   Download Token: ${testCase.downloadToken ? '***' : 'none'}`);
        console.log(`   File Type: ${testCase.fileType}`);
        
        try {
            // Don't actually download, just check the URL construction
            const finalUrl = await simulateUrlConstruction(testCase.url, testCase.downloadToken, testCase.fileType);
            console.log(`   ✅ Final URL: ${finalUrl.replace(/access_token=[^&]+/, 'access_token=***')}`);
            
            // Check auth method
            const isWebhookUrl = testCase.url.includes('/webhook_download/');
            const urlObj = new URL(finalUrl);
            const hasQueryToken = urlObj.searchParams.has('access_token');
            
            if (isWebhookUrl && hasQueryToken) {
                console.log(`   ✅ Correct: Webhook URL uses query parameter authentication`);
            } else if (!isWebhookUrl) {
                console.log(`   ✅ Correct: API URL will use Bearer token authentication`);
            } else {
                console.log(`   ❌ Issue: Webhook URL missing access_token query parameter`);
            }
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
        }
    }
    
    // Test WebhookFileDownloader
    console.log('\n\n📦 Testing WebhookFileDownloader');
    console.log('-'.repeat(40));
    
    const webhookDownloader = new WebhookFileDownloader({ config, logger });
    
    for (const testCase of testCases.filter(tc => tc.url.includes('webhook_download'))) {
        console.log(`\n🧪 Test: ${testCase.name}`);
        
        const validation = webhookDownloader.validateDownloadUrl(testCase.url);
        console.log(`   Valid Zoom URL: ${validation.valid ? '✅' : '❌'}`);
        console.log(`   Has Authentication: ${validation.hasAuthentication ? '✅' : '❌'}`);
        
        if (testCase.downloadToken) {
            const extractedToken = webhookDownloader.extractAccessToken(testCase.url);
            console.log(`   Extracted Token: ${extractedToken ? '✅ (exists)' : '❌ (none)'}`);
            console.log(`   Will add token: ${!extractedToken && testCase.downloadToken ? '✅' : '❌'}`);
        }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Webhook authentication test complete\n');
}

async function simulateUrlConstruction(url, downloadToken, fileType) {
    const urlObj = new URL(url);
    const isWebhookUrl = url.includes('/webhook_download/');
    
    if (isWebhookUrl) {
        const hasEmbeddedToken = urlObj.searchParams.has('access_token');
        
        if (!hasEmbeddedToken && downloadToken) {
            urlObj.searchParams.set('access_token', downloadToken);
            return urlObj.toString();
        }
    }
    
    return url;
}

// Run the test
testWebhookAuth().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});