# Render Deployment Fixes for Webhook Issues

## Overview
This document provides step-by-step instructions to fix the webhook recording issues on your Render deployment.

## Issues Fixed
1. **401 Authentication Errors** - All file downloads failing
2. **Incorrect Categorization** - MISC/TRIVIAL instead of Coaching
3. **Duration Detection** - Incorrect duration causing wrong categorization
4. **Student Name Extraction** - Missing student names from topics

## Files to Update on Render

### 1. Update CompleteSmartNameStandardizer.js
Add the enhanced pattern matching for:
- "Name | IvyLevel Week X" format
- Better Personal Meeting Room student extraction
- Known coach name detection

### 2. Create WebhookFileDownloader.js
New file that handles:
- Proper Zoom webhook authentication
- Embedded access tokens in URLs
- Retry logic for failed downloads
- Better error handling

### 3. Update WebhookRecordingAdapter.js
Enhanced with:
- Duration validation and conversion
- Better authentication handling
- Integration with WebhookFileDownloader

## Deployment Steps

### Step 1: Update Container Registration
Add the new WebhookFileDownloader to your container configuration:

```javascript
// In your container.js or wherever you register services
container.register({
    webhookFileDownloader: asClass(WebhookFileDownloader).singleton()
});
```

### Step 2: Environment Variables
Ensure these are set on Render:
- `ZOOM_WEBHOOK_SECRET_TOKEN` - For webhook validation
- `OUTPUT_DIR` - Directory for downloads

### Step 3: Deploy Changes
1. Commit all changes to your repository
2. Push to the branch connected to Render
3. Render will automatically deploy

### Step 4: Verify Deployment
After deployment, check:
1. Webhook endpoint is responding (should return 200 OK)
2. Check logs for successful file downloads
3. Verify recordings are categorized correctly in Google Sheets

## Testing Webhook Endpoint

```bash
# Test webhook endpoint (from local machine)
curl -X POST https://your-render-url/api/webhooks/zoom \
  -H "Content-Type: application/json" \
  -d '{"event": "recording.completed", "payload": {"object": {}}}'
```

## Monitoring

### Check Logs on Render
Look for these success indicators:
- "Downloading webhook file: [filename]"
- "Successfully downloaded: [filename]"
- "Rule X matched: [category]"
- "Recording processed successfully"

### Check for Errors
Common errors and solutions:
- **401 errors**: Check if download URLs have access_token parameter
- **TRIVIAL categorization**: Check duration is in seconds, not milliseconds
- **Missing student**: Check topic pattern matching in logs

## Rollback Plan
If issues persist:
1. Revert to previous deployment on Render
2. Check webhook logs for specific error patterns
3. Test with the local test script first before deploying

## Additional Notes
- The fixes handle both embedded tokens (in URL) and separate tokens (Bearer header)
- Duration is automatically converted from milliseconds to seconds if needed
- Student extraction now handles compound names like "Jamie JudahBram"