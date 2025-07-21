#!/usr/bin/env node

/**
 * Send Webhook Events for Specific UUIDs
 * 
 * This script fetches recordings from Zoom and sends them to the webhook server
 * as if they were real webhook events from Zoom
 */

require('dotenv').config();

const axios = require('axios');
const crypto = require('crypto');

// Target UUIDs to reprocess - only the ones that failed
const TARGET_UUIDS = [
    'pS7JmjLmTtOcRQiL71k0BQ==',
    'Wp9/bIYzSxO87kD9pjkW3w==',
    '/6Cjud/RRf2hsjO/loR18Q==',
    'zATVEJi3S4afMPb3JTKwrg=='
];

// Webhook server configuration
const WEBHOOK_URL = process.env.WEBHOOK_SERVER_URL || 'https://zoom-webhook-v2.onrender.com/webhook';
const WEBHOOK_SECRET = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
const USE_TEST_ENDPOINT = true; // Use test endpoint to bypass signature validation

class WebhookSender {
    constructor() {
        this.successCount = 0;
        this.failureCount = 0;
        this.results = [];
    }

    async getZoomToken() {
        try {
            const auth = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64');
            
            const response = await axios.post('https://zoom.us/oauth/token', null, {
                params: {
                    grant_type: 'account_credentials',
                    account_id: process.env.ZOOM_ACCOUNT_ID
                },
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            
            return response.data.access_token;
        } catch (error) {
            console.error('Failed to get Zoom token:', error.response?.data || error.message);
            throw error;
        }
    }

    async fetchRecordingFromZoom(uuid) {
        try {
            const token = await this.getZoomToken();
            
            // Double URL encode for Zoom API
            const encodedUuid = encodeURIComponent(encodeURIComponent(uuid));
            
            console.log(`   Fetching from Zoom API: /meetings/${encodedUuid}/recordings`);
            
            const response = await axios.get(
                `https://api.zoom.us/v2/meetings/${encodedUuid}/recordings`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            return response.data;
        } catch (error) {
            if (error.response?.status === 404) {
                console.log(`   ⚠️ Recording not found in Zoom Cloud`);
            } else {
                console.error(`   ❌ API Error:`, error.response?.data || error.message);
            }
            return null;
        }
    }

    generateWebhookSignature(payload, secret, timestamp) {
        const message = `v0:${timestamp}:${JSON.stringify(payload)}`;
        const hash = crypto.createHmac('sha256', secret).update(message).digest('hex');
        return `v0=${hash}`;
    }

    async createWebhookPayload(recording) {
        // Create webhook payload matching Zoom's structure
        const downloadToken = await this.getZoomToken(); // Get token first
        
        return {
            event: 'recording.completed',
            event_ts: Date.now(),
            payload: {
                account_id: recording.account_id || process.env.ZOOM_ACCOUNT_ID,
                object: {
                    uuid: recording.uuid,
                    id: recording.id || recording.meeting_id,
                    account_id: recording.account_id || process.env.ZOOM_ACCOUNT_ID,
                    host_id: recording.host_id,
                    topic: recording.topic,
                    type: recording.type || 2,
                    start_time: recording.start_time,
                    timezone: recording.timezone || 'America/Los_Angeles',
                    duration: recording.duration,
                    total_size: recording.total_size,
                    recording_count: recording.recording_count || recording.recording_files?.length || 0,
                    share_url: recording.share_url,
                    recording_files: recording.recording_files || [],
                    password: recording.password,
                    recording_play_passcode: recording.recording_play_passcode,
                    on_prem: false,
                    participant_audio_files: [],
                    participant_count: recording.participant_count || 0,
                    host_email: recording.host_email || recording.host_id + '@ivymentors.co'
                }
            },
            download_token: downloadToken
        };
    }

    async sendWebhook(webhookPayload) {
        try {
            const url = USE_TEST_ENDPOINT ? WEBHOOK_URL.replace('/webhook', '/webhook-test') : WEBHOOK_URL;
            console.log(`   📤 Sending to: ${url}`);
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            // Add signature headers if not using test endpoint
            if (!USE_TEST_ENDPOINT && WEBHOOK_SECRET) {
                const timestamp = Date.now().toString();
                const signature = this.generateWebhookSignature(webhookPayload, WEBHOOK_SECRET, timestamp);
                headers['x-zm-signature'] = signature;
                headers['x-zm-request-timestamp'] = timestamp;
            }
            
            const response = await axios.post(url, webhookPayload, {
                headers,
                timeout: 300000, // 5 minutes timeout
                maxRedirects: 5,
                validateStatus: (status) => status < 500
            });
            
            console.log(`   ✅ Webhook sent successfully (${response.status})`);
            return { success: true, status: response.status };
            
        } catch (error) {
            console.error(`   ❌ Failed to send webhook:`, error.response?.data || error.message);
            return { success: false, error: error.message };
        }
    }

    async processTranscriptWebhook(recording) {
        // Check if recording has transcript
        const transcriptFile = recording.recording_files?.find(f => 
            f.file_type === 'TRANSCRIPT' || 
            f.file_extension === 'VTT' ||
            f.recording_type === 'audio_transcript'
        );
        
        if (!transcriptFile) {
            console.log('   ℹ️ No transcript available');
            return;
        }
        
        console.log('   📝 Sending transcript webhook...');
        
        const transcriptPayload = {
            event: 'recording.transcript_completed',
            event_ts: Date.now(),
            payload: {
                account_id: recording.account_id || process.env.ZOOM_ACCOUNT_ID,
                object: {
                    uuid: recording.uuid,
                    id: recording.id || recording.meeting_id,
                    account_id: recording.account_id || process.env.ZOOM_ACCOUNT_ID,
                    host_id: recording.host_id,
                    topic: recording.topic,
                    start_time: recording.start_time,
                    duration: recording.duration,
                    recording_files: [transcriptFile],
                    host_email: recording.host_email || recording.host_id + '@ivymentors.co'
                }
            },
            download_token: await this.getZoomToken()
        };
        
        await this.sendWebhook(transcriptPayload);
    }

    async processUUID(uuid) {
        console.log(`\n📹 Processing: ${uuid}`);
        console.log(`${'─'.repeat(60)}`);
        
        try {
            // Fetch recording from Zoom
            console.log('1️⃣ Fetching recording details...');
            const recording = await this.fetchRecordingFromZoom(uuid);
            
            if (!recording) {
                this.failureCount++;
                this.results.push({
                    uuid,
                    status: 'failed',
                    reason: 'Not found in Zoom Cloud'
                });
                return;
            }
            
            console.log(`   ✅ Found: ${recording.topic}`);
            console.log(`   📅 Date: ${new Date(recording.start_time).toLocaleString()}`);
            console.log(`   ⏱️ Duration: ${Math.round(recording.duration / 60)} minutes`);
            console.log(`   📁 Files: ${recording.recording_files?.length || 0}`);
            
            // List file types
            if (recording.recording_files?.length > 0) {
                const fileTypes = recording.recording_files.map(f => f.file_type).join(', ');
                console.log(`   📄 Types: ${fileTypes}`);
            }
            
            // Create and send webhook
            console.log('\n2️⃣ Creating webhook payload...');
            const webhookPayload = await this.createWebhookPayload(recording);
            
            console.log('3️⃣ Sending recording.completed webhook...');
            const result = await this.sendWebhook(webhookPayload);
            
            if (result.success) {
                this.successCount++;
                
                // Send transcript webhook if available
                await this.processTranscriptWebhook(recording);
                
                this.results.push({
                    uuid,
                    status: 'success',
                    topic: recording.topic,
                    hasTranscript: recording.recording_files?.some(f => f.file_type === 'TRANSCRIPT')
                });
            } else {
                this.failureCount++;
                this.results.push({
                    uuid,
                    status: 'failed',
                    reason: result.error,
                    topic: recording.topic
                });
            }
            
        } catch (error) {
            console.error(`   ❌ Error: ${error.message}`);
            this.failureCount++;
            this.results.push({
                uuid,
                status: 'failed',
                reason: error.message
            });
        }
    }

    async processAll() {
        console.log('🚀 Zoom Recording Webhook Sender');
        console.log(`📍 Target: ${WEBHOOK_URL}`);
        console.log(`🔐 Mode: ${USE_TEST_ENDPOINT ? 'Test (no signature validation)' : 'Production'}`);
        console.log(`📋 UUIDs to process: ${TARGET_UUIDS.length}`);
        console.log(`${'═'.repeat(80)}\n`);
        
        // Process each UUID
        for (let i = 0; i < TARGET_UUIDS.length; i++) {
            const uuid = TARGET_UUIDS[i];
            await this.processUUID(uuid);
            
            // Add delay between requests
            if (i < TARGET_UUIDS.length - 1) {
                console.log('\n⏳ Waiting 3 seconds...');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        
        // Print summary
        console.log(`\n${'═'.repeat(80)}`);
        console.log('📊 Summary');
        console.log(`${'═'.repeat(80)}`);
        console.log(`✅ Success: ${this.successCount}`);
        console.log(`❌ Failed: ${this.failureCount}`);
        console.log(`📁 Total: ${TARGET_UUIDS.length}`);
        
        // Detailed results
        console.log('\n📋 Detailed Results:');
        console.log(`${'─'.repeat(80)}`);
        this.results.forEach((result, index) => {
            console.log(`${index + 1}. ${result.uuid}`);
            console.log(`   Status: ${result.status}`);
            if (result.topic) console.log(`   Topic: ${result.topic}`);
            if (result.reason) console.log(`   Reason: ${result.reason}`);
            if (result.hasTranscript !== undefined) {
                console.log(`   Transcript: ${result.hasTranscript ? 'Yes' : 'No'}`);
            }
            console.log('');
        });
    }
}

// Main execution
async function main() {
    try {
        const sender = new WebhookSender();
        await sender.processAll();
    } catch (error) {
        console.error('💥 Fatal error:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { WebhookSender };