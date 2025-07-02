# Unified System Architecture

## Overview

The Zoom recording processing system consists of two complementary components that work together to provide comprehensive recording management:

1. **Webhook System** (zoom-webhook-enhanced) - Hosted on Render
2. **Batch Processor** (zoom-recording-processor-v2) - Can run anywhere

Both systems share the same Google Drive folders and Google Sheets, ensuring a unified view of all recordings.

## System Components

### 1. Webhook System (Real-time Processing)
- **Location**: Hosted on Render at `zoom-webhook-enhanced.onrender.com`
- **Purpose**: Process recordings immediately when they complete
- **Trigger**: Zoom webhook events (`recording.completed`)
- **Features**:
  - Real-time processing
  - Immediate upload to Google Drive
  - Updates shared Google Sheet
  - AI insights generation
  - Standardized naming

### 2. Batch Processor (Historical & Bulk Processing)
- **Location**: Run on-demand or scheduled
- **Purpose**: Process historical recordings and bulk operations
- **Trigger**: Manual execution or cron job
- **Features**:
  - Process recordings from Zoom Cloud
  - Advanced categorization (TRIVIAL, MISC, Coaching)
  - Comprehensive AI analysis
  - Bulk operations
  - Data reconciliation

## Shared Resources

Both systems share these Google resources:

### Google Drive Folders
```
RECORDINGS_ROOT_FOLDER_ID=1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg
├── COACHES_FOLDER_ID=1T8qZWHfZCcFH1XSgFwvxmprFJ99sCGYW
├── STUDENTS_FOLDER_ID=1XwjhfIzekGhSMYaLIotiBnS-WG11pzoq
├── MISC_FOLDER_ID=1o-qwk9xVe2BgE9GUciNgXzXHbDHng-Dp
└── TRIVIAL_FOLDER_ID=1WvvKrqIkvsAxh9tIgTe6PgnMS9ExLmZS
```

### Google Sheet
```
MASTER_INDEX_SHEET_ID=1xa4E5PcrxRVaMbJfWH_d5LLSqY3RlCf6Ur3rwKtq2jQ
├── Tab 1: Raw Master Index
└── Tab 2: Standardized Master Index
```

## Data Flow

### Real-time Flow (Webhook)
1. Zoom recording completes
2. Webhook received at Render
3. Recording processed immediately
4. Files uploaded to Google Drive
5. Google Sheet updated
6. Recording available instantly

### Batch Flow
1. Scheduler/Manual trigger
2. Fetch recordings from Zoom Cloud
3. Process through comprehensive pipeline
4. Upload to same Google Drive folders
5. Update same Google Sheet
6. Reconcile with webhook recordings

## Unified Processor

The `unified-processor.js` bridges both systems:

```bash
# Sync from both systems
node unified-processor.js sync

# Import webhook recordings to batch system
node unified-processor.js drive

# Check Google Sheets for gaps
node unified-processor.js sheets

# Run normal batch processing
node unified-processor.js batch
```

## Configuration

### Environment Variables (Both Systems)
```env
# Zoom API (Same for both)
ZOOM_ACCOUNT_ID=D222nJC2QJiqPoQbV15Kvw
ZOOM_CLIENT_ID=VPG9hliSSeG2AzZ3ZiXe_w
ZOOM_CLIENT_SECRET=ySf8Zh8plSz9IVYRRgv3O1dSHYF1R4DK

# Google Drive (Shared folders)
RECORDINGS_ROOT_FOLDER_ID=1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg
COACHES_FOLDER_ID=1T8qZWHfZCcFH1XSgFwvxmprFJ99sCGYW
STUDENTS_FOLDER_ID=1XwjhfIzekGhSMYaLIotiBnS-WG11pzoq
MISC_FOLDER_ID=1o-qwk9xVe2BgE9GUciNgXzXHbDHng-Dp
TRIVIAL_FOLDER_ID=1WvvKrqIkvsAxh9tIgTe6PgnMS9ExLmZS

# Google Sheet (Same sheet)
MASTER_INDEX_SHEET_ID=1xa4E5PcrxRVaMbJfWH_d5LLSqY3RlCf6Ur3rwKtq2jQ
```

### Webhook-Specific
```env
# Webhook Secret (Render)
ZOOM_WEBHOOK_SECRET_TOKEN=_UVqGOAeRsqzrz0PWKP_zw
PORT=10000
```

### Batch Processor-Specific
```env
# Additional processors
OPENAI_API_KEY=your_key
OUTPUT_DIR=./output
```

## Deployment Architecture

```
┌─────────────────────┐         ┌─────────────────────┐
│   Zoom Platform     │         │   Google Cloud      │
│                     │         │                     │
│ ┌─────────────────┐ │         │ ┌─────────────────┐ │
│ │ Recording       │ │         │ │  Google Drive   │ │
│ │ Completed       │ │         │ │  (Shared)       │ │
│ └────────┬────────┘ │         │ └────────▲────────┘ │
│          │Webhook   │         │          │          │
│          ▼          │         │          │          │
│ ┌─────────────────┐ │         │ ┌────────┴────────┐ │
│ │ Zoom Cloud      │ │         │ │ Google Sheets   │ │
│ │ Storage         │ │         │ │ (Shared)        │ │
│ └────────┬────────┘ │         │ └────────▲────────┘ │
└──────────┼──────────┘         └──────────┼──────────┘
           │                               │
           │Batch                          │Updates
           ▼                               │
┌─────────────────────┐         ┌─────────────────────┐
│  Batch Processor    │         │  Webhook System     │
│  (On-demand)        │         │  (Render)           │
│                     │         │                     │
│ • Historical data   │         │ • Real-time         │
│ • Bulk operations   │         │ • Immediate upload  │
│ • Reconciliation    │         │ • Quick processing  │
└─────────────────────┘         └─────────────────────┘
```

## Benefits of Unified Architecture

1. **No Duplicate Processing**: Shared Google Sheet prevents reprocessing
2. **Consistent Naming**: Both systems use same standardization
3. **Unified Storage**: All recordings in same Drive structure
4. **Complementary Strengths**:
   - Webhook: Speed and real-time
   - Batch: Thoroughness and bulk operations
5. **Fault Tolerance**: If webhook fails, batch catches it
6. **Flexible Deployment**: Systems can run independently

## Monitoring and Maintenance

### Webhook System Health
```bash
curl https://zoom-webhook-enhanced.onrender.com/health
```

### Batch Processor Status
```bash
node unified-processor.js sync
```

### Google Sheet Audit
- Check for gaps in recording sequence
- Identify failed processing
- Monitor duplicate entries

### Drive Organization
- Verify folder structure
- Check for orphaned recordings
- Monitor storage usage

## Common Operations

### Process Last Week's Recordings
```bash
node complete-production-processor.js --mode=recent --date-range=7
```

### Import Webhook Recordings
```bash
node unified-processor.js drive 50
```

### Full System Sync
```bash
node unified-processor.js sync
```

### Check for Gaps
```bash
node unified-processor.js sheets
```

## Troubleshooting

### Webhook Not Processing
1. Check Render logs
2. Verify webhook secret
3. Test with: `curl https://zoom-webhook-enhanced.onrender.com/health`

### Batch Missing Recordings
1. Check Zoom API permissions
2. Verify date ranges
3. Look for webhook-processed recordings

### Duplicate Recordings
1. Check Google Sheet for duplicates
2. Use recording UUID as unique key
3. Implement deduplication logic

### Storage Issues
1. Monitor Google Drive quota
2. Archive old recordings
3. Implement retention policy