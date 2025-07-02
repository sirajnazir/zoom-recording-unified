# Webhook Integration for Real-Time Recording Processing

## Overview

The webhook integration allows the Zoom Recording Processor to handle recordings in real-time as they complete, in addition to the existing batch processing capabilities. This ensures immediate processing of new recordings while maintaining consistency with the batch processing pipeline.

## Architecture

### Components

1. **Webhook Server** (`webhook-server.js`)
   - Express server that receives Zoom webhook events
   - Validates webhook signatures for security
   - Processes `recording.completed` events

2. **WebhookRecordingAdapter** (`src/infrastructure/services/WebhookRecordingAdapter.js`)
   - Transforms webhook payload to match batch processor format
   - Handles webhook-specific authentication (download tokens)
   - Manages file downloads from webhook URLs

3. **Integration with ProductionZoomProcessor**
   - Uses the same processing pipeline as batch recordings
   - Ensures consistent categorization, naming, and storage
   - Maintains all AI insights and analysis features

## Setup

### 1. Configure Webhook in Zoom

1. Go to Zoom App Marketplace
2. Navigate to your app's "Feature" section
3. Enable "Event Subscriptions"
4. Add Event Subscription URL: `https://your-domain.com/webhook`
5. Add events:
   - `recording.completed`
   - `recording.started` (optional)
   - `recording.stopped` (optional)

### 2. Environment Variables

Add these to your `.env` file:

```env
# Webhook Configuration
WEBHOOK_PORT=3000
ZOOM_WEBHOOK_SECRET_TOKEN=your_webhook_secret_token

# Existing variables should already be set
ZOOM_ACCOUNT_ID=...
ZOOM_CLIENT_ID=...
ZOOM_CLIENT_SECRET=...
```

### 3. Start the Webhook Server

```bash
# Production
npm run start:webhook

# Development (with auto-reload)
npm run dev:webhook
```

## How It Works

### Processing Flow

1. **Webhook Receipt**
   - Zoom sends `recording.completed` event to webhook endpoint
   - Server validates the webhook signature
   - Immediately acknowledges receipt (200 OK)

2. **Data Transformation**
   - WebhookRecordingAdapter transforms webhook payload
   - Maps webhook fields to batch processor format
   - Preserves webhook-specific data (download tokens, etc.)

3. **Recording Processing**
   - Recording is processed through ProductionZoomProcessor
   - Same categorization logic (TRIVIAL, MISC, Coaching)
   - Same naming standardization
   - Same AI insights generation

4. **Storage**
   - Files uploaded to Google Drive in correct folders
   - Google Sheets updated with recording metadata
   - All outputs match batch processing format

### Data Mapping

| Webhook Field | Batch Processor Field | Notes |
|--------------|----------------------|-------|
| `uuid` | `uuid` | Unique recording identifier |
| `id` | `id`, `meeting_id` | Meeting ID |
| `topic` | `topic` | Meeting title |
| `host_email` | `host_email` | Host email |
| `download_access_token` | N/A | Webhook-specific auth |
| `recording_files` | `recording_files` | Array of file objects |

## Features

### Real-Time Processing
- Recordings processed immediately upon completion
- No waiting for batch runs
- Instant availability in Google Drive

### Consistency
- Same processing pipeline as batch
- Identical file naming and organization
- Unified Google Sheets tracking

### Reliability
- Webhook validation for security
- Error handling and logging
- Queue system for failed processing

### Monitoring
- Health check: `GET /health`
- Queue status: `GET /queue-status`
- Processing logs in `output/webhook-logs/`

## API Endpoints

### POST /webhook
Receives Zoom webhook events.

**Headers:**
- `x-zm-signature`: Zoom webhook signature
- `x-zm-request-timestamp`: Request timestamp

**Body:**
```json
{
  "event": "recording.completed",
  "payload": {
    "object": {
      "uuid": "...",
      "id": "...",
      "topic": "...",
      "recording_files": [...]
    }
  }
}
```

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-07-02T12:00:00Z",
  "processor": "ready",
  "environment": "production"
}
```

### GET /queue-status
Check queued recordings.

**Response:**
```json
{
  "queued_recordings": 2,
  "files": [
    "uuid1.json",
    "uuid2.json"
  ]
}
```

### POST /process-queue
Manually process queued recordings.

**Response:**
```json
{
  "processed": 2,
  "results": [
    {
      "file": "uuid1.json",
      "success": true
    }
  ]
}
```

## Deployment

### Using PM2

```bash
pm2 start webhook-server.js --name zoom-webhook
pm2 save
pm2 startup
```

### Using Docker

```dockerfile
# Add to existing Dockerfile
EXPOSE 3000
CMD ["node", "webhook-server.js"]
```

### Using systemd

```ini
[Unit]
Description=Zoom Webhook Server
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/zoom-recording-processor-v2
ExecStart=/usr/bin/node webhook-server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Troubleshooting

### Webhook Not Receiving Events
1. Check webhook URL is publicly accessible
2. Verify webhook secret token matches
3. Check Zoom app webhook subscriptions

### Processing Failures
1. Check logs in `output/webhook-logs/`
2. Verify environment variables
3. Check Google Drive/Sheets permissions

### Queue Building Up
1. Check `/queue-status` endpoint
2. Manually trigger with `/process-queue`
3. Review error logs for processing issues

## Security Considerations

1. **Webhook Validation**: All webhooks are validated using Zoom's signature
2. **HTTPS Required**: Use HTTPS in production for webhook endpoint
3. **Rate Limiting**: Consider adding rate limiting for public endpoints
4. **Access Tokens**: Webhook download tokens are handled securely

## Integration with Existing System

The webhook integration is designed to work alongside the existing batch processor:

- **Batch Processing**: Continue running for historical recordings
- **Webhook Processing**: Handles new recordings in real-time
- **Shared Pipeline**: Both use the same processing logic
- **Unified Storage**: All recordings end up in the same Google Drive structure
- **Single Source of Truth**: Google Sheets contains all recordings

## Future Enhancements

1. **WebSocket Notifications**: Real-time updates to connected clients
2. **Processing Dashboard**: Web UI for monitoring webhook processing
3. **Retry Queue**: Automatic retry for failed processing
4. **Metrics Collection**: Prometheus metrics for monitoring
5. **Multi-tenant Support**: Handle webhooks for multiple Zoom accounts