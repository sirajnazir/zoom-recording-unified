# Webhook Authentication Fix Summary

## Problem
Webhook download URLs were returning 401 Unauthorized errors when attempting to download recording files. The issue was that webhook URLs require special authentication handling different from regular Zoom API URLs.

## Root Cause
1. **Webhook URLs use query parameter authentication**: Webhook download URLs expect the access token to be passed as a query parameter (`?access_token=xxx`), not as a Bearer token in the Authorization header.
2. **Incorrect authentication method**: The code was trying to use webhook access tokens as Bearer tokens, which doesn't work for webhook URLs.

## Changes Made

### 1. ZoomService.js (`src/infrastructure/services/ZoomService.js`)
- **Modified `downloadFile()` method** to properly handle webhook URLs:
  - Detects webhook URLs by checking for `/webhook_download/` in the URL
  - For webhook URLs, adds the access token as a query parameter instead of using Bearer authentication
  - For regular API URLs, continues to use Bearer token authentication
  - Preserves existing access tokens in URLs if already present

### 2. EnhancedRecordingDownloader.js (`src/infrastructure/services/EnhancedRecordingDownloader.js`)
- **Updated all download methods** to pass the `downloadToken` parameter:
  - `downloadRecordingFiles()`: Extracts `download_access_token` from recording object
  - `downloadFileWithRetry()`: Accepts and passes through download token
  - `downloadFileStreaming()`: Accepts and passes through download token  
  - `downloadFile()`: Accepts and passes through download token
- **Fixed data writing**: Handles both stream objects with buffers and direct buffer data

### 3. WebhookRecordingAdapter.js (`src/infrastructure/services/WebhookRecordingAdapter.js`)
- **Fixed fallback download method**:
  - No longer tries to use webhook access tokens as Bearer tokens
  - Adds access token to URL as query parameter when not already present
  - Properly logs authentication method being used

### 4. WebhookFileDownloader.js (`src/services/WebhookFileDownloader.js`)
- **Updated authentication logic**:
  - Adds access tokens as query parameters for webhook URLs
  - No longer attempts Bearer authentication for webhook URLs
  - Improved logging to show authentication method

## How It Works Now

1. **Webhook Recording Received**: When a webhook is received, the `download_access_token` is preserved in the recording object.

2. **Download Process**:
   - The EnhancedRecordingDownloader passes the `download_access_token` to the download methods
   - For webhook URLs (`/webhook_download/`), the token is added as a query parameter
   - For API URLs, Bearer authentication is used with the OAuth token

3. **Authentication Flow**:
   ```
   Webhook URL without token:
   https://zoom.us/webhook_download/abc/file.mp4
   ↓
   https://zoom.us/webhook_download/abc/file.mp4?access_token=webhook_token

   Webhook URL with token (no change):
   https://zoom.us/webhook_download/abc/file.mp4?access_token=existing_token

   API URL (uses Bearer auth):
   https://api.zoom.us/v2/recordings/abc/file.mp4
   + Authorization: Bearer oauth_token
   ```

## Testing
A test script (`test-webhook-download-auth.js`) has been created to verify the authentication logic without actually downloading files.

## Next Steps
1. Test with actual webhook recordings to confirm 401 errors are resolved
2. Monitor logs for successful webhook file downloads
3. Verify that both webhook and API downloads work correctly