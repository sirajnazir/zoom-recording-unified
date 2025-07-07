#!/bin/bash

# Webhook Test Script using curl
# This script tests the webhook endpoint using curl commands

# Configuration - Update these values
WEBHOOK_URL="https://zoom-webhook-v2.onrender.com"  # Update with your actual URL
USE_TEST_ENDPOINT=true  # Set to false for production endpoint

# Set endpoint
if [ "$USE_TEST_ENDPOINT" = true ]; then
    ENDPOINT="/webhook-test"
    echo "🔧 Using TEST endpoint (no signature validation)"
else
    ENDPOINT="/webhook"
    echo "🔧 Using PRODUCTION endpoint (requires signature validation)"
fi

echo "🚀 Testing Webhook Endpoint"
echo "📡 Webhook URL: ${WEBHOOK_URL}${ENDPOINT}"
echo "============================================================"

# Test webhook payload
CURRENT_TIME=$(date +%s)000
START_TIME=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
END_TIME=$(date -u -v+15M +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -d '+15 minutes' +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%S.000Z)

TEST_PAYLOAD='{
    "event": "recording.completed",
    "event_ts": '"$CURRENT_TIME"',
    "payload": {
        "account_id": "D222nJC2QJiqPoQbV15Kvw",
        "object": {
            "id": "test_recording_001",
            "uuid": "TestUUID123==",
            "host_id": "test_host_123",
            "host_email": "test@example.com",
            "topic": "Test Recording - Webhook Test",
            "type": 2,
            "start_time": "'"$START_TIME"'",
            "duration": 15,
            "total_size": 50000000,
            "recording_count": 1,
            "recording_files": [
                {
                    "id": "test_file_001",
                    "meeting_id": "test_recording_001",
                    "recording_start": "'"$START_TIME"'",
                    "recording_end": "'"$END_TIME"'",
                    "file_type": "MP4",
                    "file_size": 50000000,
                    "play_url": "https://zoom.us/rec/play/test-recording",
                    "download_url": "https://zoom.us/rec/download/test-recording",
                    "status": "completed",
                    "recording_type": "shared_screen_with_speaker_view"
                }
            ]
        }
    }
}'

echo ""
echo "📤 Sending test webhook..."
echo "   Topic: Test Recording - Webhook Test"
echo "   Duration: 15 minutes"
echo "   Host: test@example.com"
echo ""

# Send the webhook request
RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${WEBHOOK_URL}${ENDPOINT}" \
    -H "Content-Type: application/json" \
    -d "$TEST_PAYLOAD" \
    --max-time 30)

# Extract status code and response body
HTTP_STATUS=$(echo "$RESPONSE" | tail -1)
RESPONSE_BODY=$(echo "$RESPONSE" | sed '$d')

echo "Response Status: $HTTP_STATUS"
echo "Response Body: $RESPONSE_BODY"
echo ""

if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ Webhook test successful!"
    echo ""
    echo "📊 Next steps:"
    echo "1. Check the webhook server logs for processing details"
    echo "2. Verify the recording was processed correctly"
    echo "3. Check Google Drive for uploaded files"
    echo "4. Check Google Sheets for updated metadata"
else
    echo "❌ Webhook test failed!"
    echo ""
    echo "🔧 Troubleshooting:"
    echo "1. Verify the WEBHOOK_URL is correct"
    echo "2. Check if the webhook server is running"
    echo "3. Verify network connectivity"
    echo "4. Check server logs for errors"
fi

echo ""
echo "============================================================" 