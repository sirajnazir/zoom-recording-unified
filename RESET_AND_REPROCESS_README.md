# Reset and Reprocessing Workflow

This document outlines the comprehensive reset and reprocessing workflow for the Zoom recording processing system.

## 🎯 Overview

The reset and reprocessing workflow provides a complete solution to:
1. **Clean up** all existing data and files
2. **Reprocess** all historical recordings from Zoom Cloud
3. **Verify** the webhook system is working correctly
4. **Establish** a unified processing pipeline

## 📁 Scripts Overview

### 1. `cleanup-and-reset-plan.js`
- Cleans all local files and directories
- Archives old Google Drive folders
- Clears Google Sheets data (keeps headers)
- Creates fresh directory structure
- Generates a reprocessing plan

### 2. `reprocess-all-recordings.js`
- Lists all recordings from Zoom Cloud
- Generates comprehensive CSV with all recordings
- Processes all recordings using the complete production processor
- Ensures all gates are properly executed
- Provides detailed progress tracking and reporting

### 3. `master-reset-and-reprocess.js`
- Orchestrates the entire workflow
- Runs cleanup, reprocessing, and webhook verification
- Provides comprehensive reporting
- Handles errors gracefully

## 🚀 Quick Start

### Option 1: Run Everything (Recommended)
```bash
# Run the complete workflow with auto-approval
node master-reset-and-reprocess.js --auto-approve

# Run with custom batch size
node master-reset-and-reprocess.js --auto-approve --batch-size=5
```

### Option 2: Step-by-Step
```bash
# Step 1: Cleanup and reset
node cleanup-and-reset-plan.js

# Step 2: Reprocess all recordings
node reprocess-all-recordings.js --auto-approve

# Step 3: Verify webhook (optional)
# The webhook will be tested automatically during reprocessing
```

### Option 3: Custom Workflow
```bash
# Skip cleanup if you want to keep existing data
node master-reset-and-reprocess.js --skip-cleanup --auto-approve

# Test mode - don't actually process
node master-reset-and-reprocess.js --dry-run

# Custom batch size for processing
node master-reset-and-reprocess.js --batch-size=3 --auto-approve
```

## 📋 Detailed Workflow

### Step 1: Cleanup and Reset
The cleanup process will:

**Local Files:**
- Remove `output/`, `logs/`, `temp/`, `cache/`, `downloads/` directories
- Clean temporary files (*.log, *.json, *.csv, *.mp4, *.txt, *.md)
- Create fresh directory structure

**Google Drive:**
- Archive existing recordings in organized folders
- Create `ARCHIVE_[FolderName]_[Date]` folders
- Move all existing recordings to archive folders
- Keep folder structure intact for future reference

**Google Sheets:**
- Clear all data from "Raw Master Index" and "Standardized Master Index"
- Keep headers intact
- Preserve sheet structure

### Step 2: Reprocessing All Recordings
The reprocessing process will:

**Recording Discovery:**
- Fetch recordings from multiple time periods (7, 30, 90, 180, 365 days)
- Generate comprehensive CSV with all unique recordings
- Display summary statistics

**Processing:**
- Use the complete production processor with all gates
- Process recordings in configurable batches
- Apply all AI insights and analysis
- Upload to Google Drive with proper organization
- Update Google Sheets with comprehensive data

**Quality Assurance:**
- Execute all gates (Gate 0: CSV generation, Gate 1: Pre-processing review, Gate 3: Duplicate checking)
- Provide detailed progress tracking
- Generate comprehensive error reports

### Step 3: Webhook Verification
The webhook verification will:

**Health Check:**
- Test webhook server connectivity
- Verify webhook is responding correctly
- Ensure webhook can process new recordings

**Future Processing:**
- Confirm webhook will handle new recordings automatically
- Verify integration with the unified processing pipeline

## ⚙️ Configuration

### Environment Variables Required
```bash
# Zoom API
ZOOM_ACCOUNT_ID=your_account_id
ZOOM_CLIENT_ID=your_client_id
ZOOM_CLIENT_SECRET=your_client_secret
ZOOM_WEBHOOK_SECRET_TOKEN=your_webhook_secret

# Google Drive
RECORDINGS_ROOT_FOLDER_ID=your_root_folder_id
COACHES_FOLDER_ID=your_coaches_folder_id
STUDENTS_FOLDER_ID=your_students_folder_id
MISC_FOLDER_ID=your_misc_folder_id
TRIVIAL_FOLDER_ID=your_trivial_folder_id

# Google Sheets
MASTER_INDEX_SHEET_ID=your_sheet_id

# Google Auth
GOOGLE_CLIENT_EMAIL=your_service_account_email
GOOGLE_PRIVATE_KEY=your_private_key

# OpenAI
OPENAI_API_KEY=your_openai_key
```

### Command Line Options

**Master Script Options:**
- `--auto-approve`: Skip confirmation prompts
- `--batch-size=N`: Set batch size for processing (default: 10)
- `--dry-run`: Test mode - don't actually process
- `--skip-cleanup`: Skip the cleanup step
- `--skip-reprocessing`: Skip the reprocessing step
- `--skip-webhook`: Skip the webhook verification step

**Reprocessing Script Options:**
- `--auto-approve`: Skip confirmation prompts
- `--batch-size=N`: Set batch size for processing (default: 10)
- `--dry-run`: Test mode - don't actually process

## 📊 Output Files

### Generated Files
- `comprehensive-recordings-[timestamp].csv`: Complete list of all recordings
- `reprocessing-report-[timestamp].json`: Detailed reprocessing report
- `master-workflow-report-[timestamp].json`: Complete workflow report
- `reprocessing-plan.json`: Generated reprocessing plan

### Directory Structure
```
output/
├── webhook-logs/          # Webhook processing logs
├── webhook-queue/         # Queued webhook recordings
logs/                      # Processing logs
temp/                      # Temporary files
cache/                     # Cache files
downloads/
├── videos/               # Downloaded video files
├── transcripts/          # Downloaded transcript files
└── chats/                # Downloaded chat files
```

## 🔍 Monitoring and Troubleshooting

### Progress Tracking
- Real-time progress updates during processing
- Batch-by-batch status reporting
- Error tracking and reporting
- Success rate calculations

### Error Handling
- Graceful error handling for individual recordings
- Detailed error logging
- Error categorization and reporting
- Automatic retry mechanisms

### Common Issues
1. **Zoom API Rate Limits**: Script includes delays between requests
2. **Google Drive Quotas**: Processing is batched to avoid quota issues
3. **Network Timeouts**: Configurable timeouts and retry logic
4. **Authentication Issues**: Comprehensive auth verification

## 🎯 Expected Results

After running the complete workflow, you should have:

### Google Drive
- Clean, organized folder structure
- All historical recordings properly processed and organized
- AI insights documents for each recording
- Proper categorization (Coaching, MISC, TRIVIAL)

### Google Sheets
- Clean "Raw Master Index" with all original recording data
- Comprehensive "Standardized Master Index" with processed data
- Drive links for all processed recordings
- Complete AI insights and analysis data

### Webhook System
- Ready to process new recordings automatically
- Integrated with the unified processing pipeline
- Proper error handling and logging

## 🚨 Important Notes

1. **Backup**: The cleanup process archives existing data, but consider creating additional backups
2. **Time**: Processing can take several hours depending on the number of recordings
3. **Resources**: Ensure sufficient disk space and API quotas
4. **Monitoring**: Monitor the process and check logs for any issues
5. **Testing**: Consider running in `--dry-run` mode first

## 📞 Support

If you encounter issues:
1. Check the generated log files
2. Review the error reports
3. Verify environment variables are correct
4. Test individual components separately
5. Check API quotas and rate limits

## 🔄 Maintenance

After the initial reset and reprocessing:
1. Monitor the webhook system for new recordings
2. Regularly check Google Drive organization
3. Review Google Sheets data quality
4. Update AI models and processing logic as needed
5. Consider periodic re-runs for data consistency 