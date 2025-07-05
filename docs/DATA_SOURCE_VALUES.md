# Data Source Values for Master Index Sheet

## Standard Values for `dataSource` Field (Column AW)

The following standard values should be used to identify the source of each recording:

### 1. **Zoom Webhook** 
- Value: `"Zoom Webhook"`
- Description: Real-time recordings received via Zoom webhook events
- Event: `recording.completed`
- Processing: Immediate upon webhook receipt

### 2. **Zoom API Batch**
- Value: `"Zoom API Batch"`  
- Description: Recordings fetched via Zoom API in batch mode
- Method: Scheduled or manual batch processing
- Current: Used for the 324 recordings being processed

### 3. **Google Drive Import**
- Value: `"Google Drive Import"`
- Description: Historical recordings imported from Google Drive folders
- Source: S3-Ivylevel-GDrive-Session-Recordings and coach folders
- Current: Being implemented for old recordings

### 4. **Manual Upload** (if applicable)
- Value: `"Manual Upload"`
- Description: Recordings manually uploaded by administrators
- Method: Direct file upload through UI or API

### 5. **Reprocessing** 
- Value: `"Reprocessing"`
- Description: Default value for recordings being reprocessed
- Current: Default in the codebase

## Implementation Notes

1. **Consistency**: Always use exact string values as listed above
2. **Case Sensitive**: Maintain the exact capitalization
3. **No Abbreviations**: Use full descriptive names
4. **Historical Data**: Existing "Comprehensive Processing" entries are from Zoom API Batch

## Code Updates Required

### Webhook Server (webhook-server.js)
```javascript
// When processing webhook recordings
await googleSheetsService.updateMasterSpreadsheet(
    processedRecording,
    'Zoom Webhook'  // <-- Use this value
);
```

### Batch Processor (complete-production-processor.js)
```javascript
// When processing batch API recordings
await googleSheetsService.updateMasterSpreadsheet(
    { processed: processedRecording, original: recording },
    'Zoom API Batch'  // <-- Use this value
);
```

### Drive Import (StandaloneDriveProcessor.js)
```javascript
// Already implemented correctly
'Google Drive Import'  // <-- Currently using this value
```

## Benefits

1. **Clear Tracking**: Easy to identify how each recording was ingested
2. **Reporting**: Can generate statistics by source
3. **Debugging**: Helps troubleshoot issues specific to each source
4. **Auditing**: Provides clear audit trail of data origins