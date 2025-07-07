# Zoom Recording Unified Processing System

A comprehensive system for processing Zoom recordings from multiple sources with standardized naming, AI insights, and organized storage.

## Overview

This system processes Zoom recordings from three data sources:
1. **Zoom Cloud API** - Direct access to recordings via Zoom API
2. **Webhooks** - Real-time processing when recordings complete
3. **Google Drive Import** - Historical recordings stored in Drive

All recordings are:
- Standardized with consistent naming (Coaching_CoachName_StudentName_WkXX_Date)
- Categorized (COACHING, MISC, TRIVIAL)
- Stored in organized Google Drive folders
- Tracked in a dual-tab Google Sheet
- Enhanced with AI-generated insights

## Core Production Files

### Main Processors
- `complete-production-processor.js` - Main batch processor for Zoom Cloud recordings
- `webhook-server.js` - Real-time webhook server (runs on Render)
- `unified-processor.js` - Synchronizes between batch and webhook systems
- `scripts/process-drive-recordings.js` - Processes historical Drive recordings

### Key Services
Located in `src/infrastructure/services/`:
- `CompleteSmartNameStandardizer.js` - Intelligent name standardization
- `DualTabGoogleSheetsService.js` - Manages dual-tab sheet architecture
- `DriveOrganizer.js` - Organizes recordings in Drive with dual paths
- `WebhookRecordingAdapter.js` - Adapts webhook data to standard format
- `EnhancedRecordingDownloader.js` - Efficient parallel downloads
- `ZoomService.js` - Zoom API integration

## Quick Start

### Prerequisites
1. Node.js v18+
2. Google Cloud service account credentials
3. Zoom OAuth Server-to-Server app credentials

### Setup
```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials
```

### Running the System

#### Process Recent Zoom Cloud Recordings
```bash
# Process last 7 days
node complete-production-processor.js

# Process specific date range
node complete-production-processor.js --date-from=2025-06-01 --date-to=2025-06-30
```

#### Process Google Drive Historical Recordings
```bash
node scripts/process-drive-recordings.js
```

#### Run Webhook Server (for Render deployment)
```bash
node webhook-server.js
```

#### Synchronize All Sources
```bash
node unified-processor.js sync
```

## Architecture

### Data Flow
1. **Recording Sources** → 
2. **Standardization & Categorization** → 
3. **AI Processing** → 
4. **Google Drive Organization** → 
5. **Google Sheets Update**

### Google Drive Structure
```
Recordings Root/
├── Coaches/
│   ├── Jenny/
│   ├── Aditi/
│   └── ...
├── Students/
│   ├── Aarav/
│   ├── Kavya/
│   └── ...
├── MISC/
└── TRIVIAL/
```

### Google Sheet Structure
- **Tab 1: Raw Master Index** - All recordings with original data
- **Tab 2: Standardized Master Index** - Processed recordings with standardized names

## Key Features

### Intelligent Name Standardization
- Extracts coach and student names from various sources
- Handles multiple name formats and variations
- Maintains consistent capitalization
- Adds week numbers and dates

### Smart Categorization
- **COACHING**: Regular coaching sessions (>5 minutes, has transcript)
- **MISC**: Non-coaching meetings (interviews, team meetings)
- **TRIVIAL**: Short recordings (<5 minutes, no meaningful content)

### AI Insights
- Executive summaries
- Key themes and discussion points
- Breakthrough moments
- Action items and next steps

### Dual-Path Drive Organization
- Student-centric paths: `/Students/StudentName/Coaching_Coach_Student_WkXX.mp4`
- Coach shortcuts: `/Coaches/CoachName/shortcuts/→ Student recordings`

## Configuration

### Environment Variables
```env
# Zoom OAuth (Server-to-Server)
ZOOM_ACCOUNT_ID=your_account_id
ZOOM_CLIENT_ID=your_client_id
ZOOM_CLIENT_SECRET=your_client_secret

# Google Drive
RECORDINGS_ROOT_FOLDER_ID=your_root_folder_id
COACHES_FOLDER_ID=your_coaches_folder_id
STUDENTS_FOLDER_ID=your_students_folder_id

# Google Sheets
MASTER_INDEX_SHEET_ID=your_sheet_id

# OpenAI (for insights)
OPENAI_API_KEY=your_api_key
```

## Monitoring

### Check Processing Status
```bash
# View recent processing report
cat reports/production-*.json | jq '.summary'

# Check webhook health (if deployed)
curl https://your-webhook-url.onrender.com/health
```

### Common Issues

1. **Duplicate Processing**: System checks sheet before processing
2. **Wrong Duration**: Calculates from file timestamps, not Zoom API
3. **Missing Students**: Extracts from transcripts and participant names
4. **Drive Organization**: Ensures dual paths are created

## Development

### Running Tests
```bash
# Run a test simulation
node download-and-reprocess-zoom-recording.js <recording-uuid>
```

### Archive Structure
Non-production code is organized in `archive/`:
- `archive/tests/` - Test scripts
- `archive/old-processors/` - Previous processor versions
- `archive/utilities/` - One-off utility scripts
- `archive/backups/` - Code backups

## Support

For issues or questions:
1. Check logs in `output/` directory
2. Review Google Sheets for processing status
3. Verify environment variables are set correctly

## License

Internal use only. All rights reserved.