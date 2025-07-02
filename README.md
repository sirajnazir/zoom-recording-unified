# Zoom Recording Processor - Unified Project

This is the unified version of the Zoom Recording Processor that combines batch processing and webhook capabilities.

## Features

- **Batch Processing**: Process multiple Zoom recordings from CSV files
- **Webhook Support**: Real-time processing of recordings via Zoom webhooks
- **Google Drive Integration**: Automatic upload and organization of recordings
- **Google Sheets Tracking**: Dual-tab tracking with raw and standardized data
- **AI-Powered Insights**: Generate coaching insights using OpenAI
- **Smart Categorization**: Automatic categorization (Coaching, MISC, TRIVIAL)

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   - Copy `.env.example` to `.env`
   - Add your credentials

3. **Run Batch Processing**
   ```bash
   node complete-production-processor.js
   ```

4. **Run Webhook Server**
   ```bash
   node webhook-server.js
   ```

## Deployment

### Deploy to Render

1. Push to GitHub
2. Connect Render to this repository
3. Set environment variables
4. Deploy

### Environment Variables Required

See `.env.example` for all required variables.

## Testing

```bash
# Test webhook integration
node test-webhook-comprehensive.js

# Test batch processing
node complete-production-processor.js --test
```

## Architecture

- `webhook-server.js` - Express server for handling Zoom webhooks
- `complete-production-processor.js` - Main batch processor
- `src/` - Core application code
- `config/` - Configuration files
- `scripts/` - Utility scripts

## Schema

### Google Sheets Schema (50 columns)
- **Raw Master Index**: 15 columns
- **Standardized Master Index**: 50 columns

See `update-sheet-headers.js` for exact column definitions.
