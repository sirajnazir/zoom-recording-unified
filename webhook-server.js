/**
 * Webhook Server for Real-time Recording Processing
 * 
 * This server receives Zoom webhooks and processes recordings using the same
 * pipeline as the batch processor, ensuring consistency across all recordings
 */

require('dotenv').config();

// Debug Google Authentication
console.log('\n🔍 DEBUG: Google Authentication Environment Check');
console.log('================================================');
const hasServiceAccountJson = !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
console.log('GOOGLE_SERVICE_ACCOUNT_JSON exists:', hasServiceAccountJson);
if (hasServiceAccountJson) {
    const jsonPreview = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.substring(0, 100);
    console.log('JSON Preview (first 100 chars):', jsonPreview + '...');
    try {
        const parsed = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
        console.log('✅ JSON parses successfully');
        console.log('Has client_email:', !!parsed.client_email);
        console.log('Has private_key:', !!parsed.private_key);
        console.log('client_email value:', parsed.client_email || 'MISSING');
        
        // IMPORTANT: Set the parsed values as environment variables
        // so the config module can pick them up
        if (parsed.client_email && parsed.private_key) {
            process.env.GOOGLE_CLIENT_EMAIL = parsed.client_email;
            process.env.GOOGLE_PRIVATE_KEY = parsed.private_key;
            console.log('✅ Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY env vars');
        }
    } catch (error) {
        console.log('❌ JSON parse error:', error.message);
    }
}
console.log('Drive Folder IDs:');
console.log(`  root: ${process.env.RECORDINGS_ROOT_FOLDER_ID ? '✓' : '✗'}`);
console.log(`  coaches: ${process.env.COACHES_FOLDER_ID ? '✓' : '✗'}`);
console.log(`  students: ${process.env.STUDENTS_FOLDER_ID ? '✓' : '✗'}`);
console.log(`  misc: ${process.env.MISC_FOLDER_ID ? '✓' : '✗'}`);
console.log(`  trivial: ${process.env.TRIVIAL_FOLDER_ID ? '✓' : '✗'}`);
console.log('MASTER_INDEX_SHEET_ID:', process.env.MASTER_INDEX_SHEET_ID ? '✓' : '✗');
console.log('================================================\n');

const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const { ProductionZoomProcessor } = require('./complete-production-processor');
const { WebhookRecordingAdapter } = require('./src/infrastructure/services/WebhookRecordingAdapter');
const { createContainer } = require('awilix');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.WEBHOOK_PORT || 3000;

// Initialize production processor and adapter
let productionProcessor = null;
let webhookAdapter = null;
let isInitialized = false;

// Middleware
app.use(bodyParser.json());

// Zoom webhook validation
function validateWebhook(req, res, next) {
    const message = `v0:${req.headers['x-zm-request-timestamp']}:${JSON.stringify(req.body)}`;
    const hashForValidate = crypto
        .createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN)
        .update(message)
        .digest('hex');
    const signature = `v0=${hashForValidate}`;

    if (req.headers['x-zm-signature'] === signature) {
        next();
    } else {
        console.error('Webhook validation failed');
        res.status(401).send('Unauthorized');
    }
}

// Initialize processor
async function initializeProcessor() {
    if (isInitialized) return;

    try {
        console.log('🚀 Initializing Production Processor for Webhook Server...');
        
        productionProcessor = new ProductionZoomProcessor();
        await productionProcessor.initialize();
        
        // Create adapter with the processor's container
        webhookAdapter = new WebhookRecordingAdapter(productionProcessor.container);
        
        isInitialized = true;
        console.log('✅ Webhook server initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize webhook server:', error);
        process.exit(1);
    }
}

// Health check endpoint
app.get('/health', async (req, res) => {
    const health = {
        status: isInitialized ? 'healthy' : 'initializing',
        timestamp: new Date().toISOString(),
        processor: isInitialized ? 'ready' : 'not ready',
        environment: process.env.NODE_ENV || 'development'
    };
    
    res.json(health);
});

// Test webhook endpoint (bypasses validation)
app.post('/webhook-test', async (req, res) => {
    const { event, payload } = req.body;
    
    console.log(`📨 TEST Webhook received: ${event}`);
    console.log('⚠️  This is a TEST endpoint - no signature validation');
    
    // Immediately acknowledge the webhook
    res.status(200).json({ message: 'Test webhook received' });
    
    // Process recording.completed events
    if (event === 'recording.completed') {
        processRecordingCompleted(req.body).catch(error => {
            console.error('Error processing recording.completed:', error);
        });
    }
});

// Webhook endpoint for recording.completed events
app.post('/webhook', validateWebhook, async (req, res) => {
    const { event, payload } = req.body;
    
    console.log(`📨 Webhook received: ${event}`);
    
    // Immediately acknowledge the webhook
    res.status(200).json({ message: 'Webhook received' });
    
    // Process recording.completed events
    if (event === 'recording.completed') {
        processRecordingCompleted(req.body).catch(error => {
            console.error('Error processing recording.completed:', error);
        });
    }
});

// Process recording.completed event
async function processRecordingCompleted(webhookData) {
    try {
        const recording = webhookData.payload?.object;
        if (!recording) {
            console.error('No recording object in webhook payload');
            return;
        }

        console.log(`\n${'='.repeat(80)}`);
        console.log(`🎬 Processing Recording from Webhook`);
        console.log(`📋 Meeting: ${recording.topic}`);
        console.log(`🆔 Recording ID: ${recording.id}`);
        console.log(`📅 Date: ${recording.start_time}`);
        console.log(`${'='.repeat(80)}\n`);

        // Log webhook recording details
        await logWebhookRecording(webhookData);

        // Transform and process the recording
        const result = await webhookAdapter.processWebhookRecording(
            webhookData,
            productionProcessor
        );

        if (result.success) {
            console.log(`✅ Webhook recording processed successfully`);
            console.log(`📁 Standardized Name: ${result.processingResult?.nameAnalysis?.standardizedName || result.processingResult?.nameAnalysis?.standardized}`);
            console.log(`📊 Category: ${result.processingResult?.category}`);
        } else {
            console.error(`❌ Webhook recording processing failed: ${result.error}`);
        }

    } catch (error) {
        console.error('Fatal error in processRecordingCompleted:', error);
    }
}

// Log webhook recordings for monitoring
async function logWebhookRecording(webhookData) {
    try {
        const logDir = path.join(process.env.OUTPUT_DIR || './output', 'webhook-logs');
        await fs.mkdir(logDir, { recursive: true });
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const logFile = path.join(logDir, `webhook-${timestamp}.json`);
        
        await fs.writeFile(logFile, JSON.stringify(webhookData, null, 2));
        console.log(`📝 Webhook logged to: ${logFile}`);
    } catch (error) {
        console.error('Error logging webhook:', error);
    }
}

// Queue monitoring endpoint
app.get('/queue-status', async (req, res) => {
    try {
        const queueDir = path.join(process.env.OUTPUT_DIR || './output', 'webhook-queue');
        const files = await fs.readdir(queueDir).catch(() => []);
        
        res.json({
            queued_recordings: files.length,
            files: files
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Process queued recordings endpoint (manual trigger)
app.post('/process-queue', async (req, res) => {
    try {
        const queueDir = path.join(process.env.OUTPUT_DIR || './output', 'webhook-queue');
        const files = await fs.readdir(queueDir).catch(() => []);
        
        const results = [];
        for (const file of files) {
            if (file.endsWith('.json')) {
                const filePath = path.join(queueDir, file);
                const recording = JSON.parse(await fs.readFile(filePath, 'utf-8'));
                
                const result = await productionProcessor.processRecording(recording);
                results.push({
                    file,
                    success: result.success,
                    error: result.error
                });
                
                // Remove from queue after processing
                if (result.success) {
                    await fs.unlink(filePath);
                }
            }
        }
        
        res.json({
            processed: results.length,
            results
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Graceful shutdown
async function shutdown() {
    console.log('\n🔄 Shutting down webhook server...');
    
    if (productionProcessor) {
        await productionProcessor.shutdown();
    }
    
    console.log('✅ Webhook server shutdown complete');
    process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
app.listen(PORT, async () => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🚀 Zoom Webhook Server Starting`);
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`${'='.repeat(80)}\n`);
    
    await initializeProcessor();
    
    console.log(`\n✅ Webhook server is ready!`);
    console.log(`📍 Webhook URL: http://localhost:${PORT}/webhook`);
    console.log(`🧪 Test Webhook URL: http://localhost:${PORT}/webhook-test (no validation)`);
    console.log(`📊 Health Check: http://localhost:${PORT}/health`);
    console.log(`📋 Queue Status: http://localhost:${PORT}/queue-status\n`);
});