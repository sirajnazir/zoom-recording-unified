# Render Webhook Server Configuration Guide

This guide will help you properly configure the zoom-webhook-v2 service on Render with all required environment variables.

## 🚨 Current Issue
The webhook server is failing to process recordings due to missing Google Service Account credentials. Error: "The incoming JSON object does not contain a client_email field"

## 📋 Required Environment Variables

### 1. Google Service Account Credentials (CRITICAL - Choose ONE method)

#### Option A: GOOGLE_SERVICE_ACCOUNT_KEY (Recommended)
- This is the base64-encoded version of your service account JSON
- Copy the entire value from your local .env file (lines 4-32)
- In Render: Add as a single-line environment variable

#### Option B: GOOGLE_SERVICE_ACCOUNT_JSON
- The raw JSON service account credentials
- First decode the base64 string: `echo $GOOGLE_SERVICE_ACCOUNT_KEY | base64 -d`
- Copy the decoded JSON and add it as an environment variable

#### Option C: Individual Google Credentials
If the above options don't work, add these individual variables:
- `GOOGLE_CLIENT_EMAIL`: zoom-recording-processor@ivylevel-coaching-sessions.iam.gserviceaccount.com
- `GOOGLE_PRIVATE_KEY`: The private key from the service account (include the BEGIN/END markers)

### 2. Google Drive Folder IDs (Required)
```
RECORDINGS_ROOT_FOLDER_ID=1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg
COACHES_FOLDER_ID=1T8qZWHfZCcFH1XSgFwvxmprFJ99sCGYW
STUDENTS_FOLDER_ID=1XwjhfIzekGhSMYaLIotiBnS-WG11pzoq
MISC_FOLDER_ID=1o-qwk9xVe2BgE9GUciNgXzXHbDHng-Dp
TRIVIAL_FOLDER_ID=1WvvKrqIkvsAxh9tIgTe6PgnMS9ExLmZS
```

### 3. Google Sheets Configuration (Required)
```
MASTER_INDEX_SHEET_ID=1xa4E5PcrxRVaMbJfWH_d5LLSqY3RlCf6Ur3rwKtq2jQ
```

### 4. Zoom API Credentials (Required)
```
ZOOM_ACCOUNT_ID=D222nJC2QJiqPoQbV15Kvw
ZOOM_CLIENT_ID=VPG9hliSSeG2AzZ3ZiXe_w
ZOOM_CLIENT_SECRET=ySf8Zh8plSz9IVYRRgv3O1dSHYF1R4DK
ZOOM_WEBHOOK_SECRET_TOKEN=_UVqGOAeRsqzrz0PWKP_zw
```

### 5. Processing Configuration (Required)
```
SAVE_TO_SHEETS=true
DOWNLOAD_FILES=true
USE_CACHE=true
LOG_LEVEL=info
MAX_CONCURRENT_PROCESSING=3
RETRY_ATTEMPTS=3
PROCESSING_TIMEOUT=300000
```

### 6. Optional but Recommended
```
OPENAI_API_KEY=***REMOVED***
ANALYZE_CONTENT=false
GENERATE_INSIGHTS=false
```

## 🔧 Step-by-Step Configuration on Render

1. **Log into Render**
   - Go to https://dashboard.render.com
   - Sign in with your credentials

2. **Navigate to Your Service**
   - Find and click on "zoom-webhook-v2" service
   - You should see the service dashboard

3. **Access Environment Variables**
   - Click on the "Environment" tab in the left sidebar
   - You'll see a list of existing environment variables

4. **Add Missing Variables**
   - Click "Add Environment Variable"
   - For each missing variable:
     - Enter the key (e.g., GOOGLE_SERVICE_ACCOUNT_KEY)
     - Paste the value
     - Click "Save"

5. **Critical: Add Google Service Account**
   - This is the most important step!
   - Copy the entire GOOGLE_SERVICE_ACCOUNT_KEY value from your local .env
   - It should be a long base64 string (lines 4-32 in your .env)
   - Add it as a single environment variable (no line breaks)

6. **Save and Deploy**
   - After adding all variables, click "Save Changes"
   - Render will automatically restart your service
   - Monitor the logs for any errors

## 🧪 Testing After Configuration

1. **Check Service Health**
   ```bash
   curl https://zoom-webhook-v2.onrender.com/test
   ```

2. **Send Test Webhook**
   ```bash
   node test-webhook-simple.js
   ```

3. **Monitor Logs**
   - In Render dashboard, click "Logs" tab
   - Look for successful processing messages
   - Check for any credential errors

4. **Verify Results**
   - Check Google Sheets for new entries
   - Look in Google Drive folders for uploaded recordings

## 🚨 Common Issues and Solutions

### Issue: "The incoming JSON object does not contain a client_email field"
**Solution**: The Google Service Account credentials are not properly configured. Make sure GOOGLE_SERVICE_ACCOUNT_KEY is added correctly.

### Issue: DNS errors (e.g., "getaddrinfo ENOTFOUND ivymentors.zoom.us")
**Solution**: This is expected for test webhooks with fake URLs. Real webhooks from Zoom will have valid download URLs.

### Issue: Missing download access tokens
**Solution**: Real Zoom webhooks include access tokens. Test webhooks won't have these.

### Issue: Webhook received but no processing
**Solution**: Check that SAVE_TO_SHEETS=true and DOWNLOAD_FILES=true are set.

## 📝 Environment Variable Template

Copy this template and fill in the values in Render:

```
# Google Service Account (REQUIRED - use your base64 encoded key)
GOOGLE_SERVICE_ACCOUNT_KEY=<paste-your-base64-encoded-service-account-here>

# Google Drive Folders (REQUIRED)
RECORDINGS_ROOT_FOLDER_ID=1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg
COACHES_FOLDER_ID=1T8qZWHfZCcFH1XSgFwvxmprFJ99sCGYW
STUDENTS_FOLDER_ID=1XwjhfIzekGhSMYaLIotiBnS-WG11pzoq
MISC_FOLDER_ID=1o-qwk9xVe2BgE9GUciNgXzXHbDHng-Dp
TRIVIAL_FOLDER_ID=1WvvKrqIkvsAxh9tIgTe6PgnMS9ExLmZS

# Google Sheets (REQUIRED)
MASTER_INDEX_SHEET_ID=1xa4E5PcrxRVaMbJfWH_d5LLSqY3RlCf6Ur3rwKtq2jQ

# Zoom Credentials (REQUIRED)
ZOOM_ACCOUNT_ID=D222nJC2QJiqPoQbV15Kvw
ZOOM_CLIENT_ID=VPG9hliSSeG2AzZ3ZiXe_w
ZOOM_CLIENT_SECRET=ySf8Zh8plSz9IVYRRgv3O1dSHYF1R4DK
ZOOM_WEBHOOK_SECRET_TOKEN=_UVqGOAeRsqzrz0PWKP_zw

# Processing Settings (REQUIRED)
SAVE_TO_SHEETS=true
DOWNLOAD_FILES=true
USE_CACHE=true
LOG_LEVEL=info
MAX_CONCURRENT_PROCESSING=3
RETRY_ATTEMPTS=3
PROCESSING_TIMEOUT=300000

# Optional
OPENAI_API_KEY=<your-openai-key>
ANALYZE_CONTENT=false
GENERATE_INSIGHTS=false
```

## 🎯 Next Steps

1. Configure all environment variables on Render
2. Monitor the service logs after restart
3. Send a test webhook to verify processing
4. Check Google Sheets and Drive for results
5. Once working, Zoom will automatically send real webhooks

## 📞 Need Help?

If you continue to have issues after following this guide:
1. Check the Render logs for specific error messages
2. Verify all environment variables are set correctly
3. Ensure the Google Service Account has proper permissions
4. Test with the local webhook server first to isolate issues