#!/usr/bin/env node

/**
 * Reprocess Zoom Recordings via Webhook Simulation
 * 
 * This script:
 * 1. Fetches recordings from Zoom API
 * 2. Downloads all files (including transcripts if available)
 * 3. Simulates webhook processing
 * 4. Handles transcript webhooks if transcripts are available
 */

require('dotenv').config();

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { ProductionZoomProcessor } = require('./complete-production-processor');
const { WebhookRecordingAdapter } = require('./src/infrastructure/services/WebhookRecordingAdapter');

// Target UUIDs to reprocess
const TARGET_UUIDS = [
    'vApNEKOGQdqz0E4SYtq4xQ==',
    '0H/uwuuuRJaZ5YJZCNxoxg==',
    'pS7JmjLmTtOcRQiL71k0BQ==',
    'Wp9/bIYzSxO87kD9pjkW3w==',
    '/6Cjud/RRf2hsjO/loR18Q==',
    'zATVEJi3S4afMPb3JTKwrg=='
];

class WebhookReprocessor {
    constructor() {
        this.processor = null;
        this.adapter = null;
        this.processedCount = 0;
        this.failedCount = 0;
    }

    async initialize() {
        console.log('🚀 Initializing webhook reprocessor...\n');
        
        // Initialize production processor
        this.processor = new ProductionZoomProcessor();
        await this.processor.initialize();
        
        // Create webhook adapter
        this.adapter = new WebhookRecordingAdapter(this.processor.container);
        
        console.log('✅ Initialization complete\n');
    }

    async getZoomToken() {
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
    }

    async fetchRecordingFromZoom(uuid) {
        try {
            const token = await this.getZoomToken();
            
            // URL encode the UUID for API calls
            const encodedUuid = encodeURIComponent(encodeURIComponent(uuid));
            
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
            console.error(`❌ Failed to fetch recording ${uuid}:`, error.response?.data || error.message);
            return null;
        }
    }

    createWebhookPayload(recording, downloadToken) {
        // Create a webhook payload that matches Zoom's structure
        return {
            event: 'recording.completed',
            event_ts: Date.now(),
            payload: {
                account_id: process.env.ZOOM_ACCOUNT_ID,
                object: {
                    uuid: recording.uuid,
                    id: recording.id,
                    account_id: recording.account_id,
                    host_id: recording.host_id,
                    topic: recording.topic,
                    type: recording.type,
                    start_time: recording.start_time,
                    timezone: recording.timezone,
                    duration: recording.duration,
                    total_size: recording.total_size,
                    recording_count: recording.recording_count,
                    share_url: recording.share_url,
                    recording_files: recording.recording_files,
                    password: recording.password,
                    recording_play_passcode: recording.recording_play_passcode,
                    download_access_token: downloadToken,
                    on_prem: false,
                    participant_audio_files: [],
                    participant_count: recording.participant_count || 0,
                    host_email: recording.host_email
                }
            },
            download_token: downloadToken
        };
    }

    async processRecording(uuid) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`📹 Processing Recording: ${uuid}`);
        console.log(`${'='.repeat(80)}\n`);
        
        try {
            // Step 1: Fetch from Zoom API
            console.log('1️⃣ Fetching recording from Zoom API...');
            const recording = await this.fetchRecordingFromZoom(uuid);
            
            if (!recording) {
                console.error(`❌ Could not fetch recording ${uuid}`);
                this.failedCount++;
                return;
            }
            
            console.log(`✅ Found recording: ${recording.topic}`);
            console.log(`   Meeting ID: ${recording.id}`);
            console.log(`   Date: ${new Date(recording.start_time).toLocaleString()}`);
            console.log(`   Duration: ${Math.round(recording.duration / 60)} minutes`);
            console.log(`   Files: ${recording.recording_files?.length || 0}`);
            
            // Log file types
            if (recording.recording_files) {
                const fileTypes = recording.recording_files.map(f => f.file_type);
                console.log(`   File types: ${fileTypes.join(', ')}`);
                
                const hasTranscript = fileTypes.includes('TRANSCRIPT');
                console.log(`   Has transcript: ${hasTranscript ? 'Yes' : 'No'}`);
            }
            
            // Step 2: Create download token (simulate webhook token)
            const downloadToken = await this.getZoomToken(); // Reuse OAuth token
            
            // Step 3: Create webhook payload
            console.log('\n2️⃣ Creating webhook payload...');
            const webhookPayload = this.createWebhookPayload(recording, downloadToken);
            
            // Save webhook payload for debugging
            const webhookLogPath = path.join(
                process.env.OUTPUT_DIR || './output',
                'webhook-logs',
                `reprocess-${recording.id}-${Date.now()}.json`
            );
            await fs.mkdir(path.dirname(webhookLogPath), { recursive: true });
            await fs.writeFile(webhookLogPath, JSON.stringify(webhookPayload, null, 2));
            console.log(`📝 Webhook payload saved to: ${webhookLogPath}`);
            
            // Step 4: Process through webhook adapter
            console.log('\n3️⃣ Processing through webhook pipeline...');
            const transformedRecording = this.adapter.transform(
                webhookPayload.payload.object,
                webhookPayload.download_token
            );
            
            console.log('✅ Recording transformed for processing');
            
            // Step 5: Process the recording
            console.log('\n4️⃣ Running comprehensive processing...');
            const result = await this.adapter.processWebhookRecording(transformedRecording);
            
            if (result.success) {
                console.log('✅ Recording processed successfully!');
                console.log(`   Standardized name: ${result.standardizedName}`);
                console.log(`   Category: ${result.category}`);
                console.log(`   Drive folder: ${result.driveLink}`);
                this.processedCount++;
                
                // Step 6: Check if transcript exists and simulate transcript webhook
                const transcriptFile = recording.recording_files?.find(f => 
                    f.file_type === 'TRANSCRIPT' || 
                    f.file_extension === 'VTT'
                );
                
                if (transcriptFile) {
                    console.log('\n5️⃣ Processing transcript webhook...');
                    await this.processTranscriptWebhook(recording, downloadToken);
                }
            } else {
                console.error('❌ Processing failed:', result.error);
                this.failedCount++;
            }
            
        } catch (error) {
            console.error(`❌ Error processing ${uuid}:`, error.message);
            this.failedCount++;
        }
    }

    async processTranscriptWebhook(recording, downloadToken) {
        try {
            // Create transcript completed webhook payload
            const transcriptWebhook = {
                event: 'recording.transcript_completed',
                event_ts: Date.now(),
                payload: {
                    account_id: process.env.ZOOM_ACCOUNT_ID,
                    object: {
                        uuid: recording.uuid,
                        id: recording.id,
                        account_id: recording.account_id,
                        host_id: recording.host_id,
                        topic: recording.topic,
                        start_time: recording.start_time,
                        duration: recording.duration,
                        recording_files: recording.recording_files.filter(f => 
                            f.file_type === 'TRANSCRIPT' || 
                            f.file_extension === 'VTT'
                        ),
                        host_email: recording.host_email
                    }
                },
                download_token: downloadToken
            };
            
            // Send to webhook server if running, or process directly
            if (process.env.WEBHOOK_SERVER_URL) {
                console.log('📤 Sending transcript webhook to server...');
                try {
                    await axios.post(
                        `${process.env.WEBHOOK_SERVER_URL}/webhook-test`,
                        transcriptWebhook,
                        { timeout: 60000 }
                    );
                    console.log('✅ Transcript webhook sent');
                } catch (error) {
                    console.log('⚠️ Webhook server not available, processing locally');
                    // Process locally if webhook server not available
                    await this.processTranscriptLocally(transcriptWebhook);
                }
            } else {
                await this.processTranscriptLocally(transcriptWebhook);
            }
            
        } catch (error) {
            console.error('❌ Error processing transcript webhook:', error.message);
        }
    }

    async processTranscriptLocally(webhookData) {
        // This would normally be handled by the webhook server
        console.log('📝 Processing transcript locally...');
        console.log('ℹ️ Note: For full transcript processing, ensure webhook server is running');
    }

    async processAll() {
        console.log(`\n🎯 Starting reprocessing of ${TARGET_UUIDS.length} recordings...\n`);
        
        for (const uuid of TARGET_UUIDS) {
            try {
                await this.processRecording(uuid);
                
                // Add delay between recordings to avoid rate limits
                if (TARGET_UUIDS.indexOf(uuid) < TARGET_UUIDS.length - 1) {
                    console.log('\n⏳ Waiting 5 seconds before next recording...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            } catch (error) {
                console.error(`❌ Failed to process ${uuid}:`, error.message);
                this.failedCount++;
            }
        }
        
        // Summary
        console.log(`\n${'='.repeat(80)}`);
        console.log('📊 Reprocessing Summary');
        console.log(`${'='.repeat(80)}`);
        console.log(`✅ Successfully processed: ${this.processedCount}`);
        console.log(`❌ Failed: ${this.failedCount}`);
        console.log(`📁 Total: ${TARGET_UUIDS.length}`);
        console.log(`${'='.repeat(80)}\n`);
    }

    async shutdown() {
        if (this.processor) {
            await this.processor.shutdown();
        }
    }
}

// Main execution
async function main() {
    const reprocessor = new WebhookReprocessor();
    
    try {
        await reprocessor.initialize();
        await reprocessor.processAll();
    } catch (error) {
        console.error('💥 Fatal error:', error);
        process.exit(1);
    } finally {
        await reprocessor.shutdown();
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { WebhookReprocessor };