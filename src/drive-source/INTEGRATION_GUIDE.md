# Drive Source (3) Integration Guide

## Overview
This guide explains how to integrate the standalone drive-source solution into the main project after the current batch processing of 324 recordings is complete.

## Current Architecture

### Standalone Components Created:
1. **Services**:
   - `DriveScanner.js` - Base scanner for Google Drive traversal
   - `S3IvylevelScanner.js` - Specialized scanner for S3-Ivylevel patterns
   - `RecordingMatcher.js` - Groups related files into sessions
   - `StandaloneDriveProcessor.js` - Processes and reorganizes recordings

2. **Configuration**:
   - `standalone-config.js` - Separate config for testing

3. **Scripts**:
   - `setup-test-environment.js` - Creates test folders/sheet
   - `dry-run-jenny-huda.js` - Simulates processing without moving files
   - `process-jenny-huda-standalone.js` - Actual processing in test environment

## Pre-Integration Testing

1. **Setup Test Environment**:
   ```bash
   node scripts/drive-source/setup-test-environment.js
   ```
   This creates separate test folders and Google Sheet.

2. **Run Dry Run**:
   ```bash
   node scripts/drive-source/dry-run-jenny-huda.js
   ```
   Shows what would happen without moving files.

3. **Process Test Batch**:
   ```bash
   node scripts/drive-source/process-jenny-huda-standalone.js
   ```
   Processes 5 sessions in test environment.

## Integration Steps

### Step 1: Update Main Configuration
Add drive source settings to main `config/index.js`:

```javascript
driveSource: {
  enabled: process.env.ENABLE_DRIVE_SOURCE === 'true',
  s3IvylevelFolderId: process.env.S3_IVYLEVEL_FOLDER_ID,
  scanOptions: {
    maxDepth: 5,
    minFileSize: 100 * 1024,
    batchSize: parseInt(process.env.DRIVE_SOURCE_BATCH_SIZE || '10')
  }
}
```

### Step 2: Create Service Registry
Create a service to manage multiple recording sources:

```javascript
// src/services/RecordingSourceManager.js
class RecordingSourceManager {
  constructor(config) {
    this.sources = {
      zoom: new ZoomWebhookProcessor(config),
      driveImport: new StandaloneDriveProcessor(config)
    };
  }
  
  async processFromSource(sourceName, data) {
    const processor = this.sources[sourceName];
    if (!processor) {
      throw new Error(`Unknown source: ${sourceName}`);
    }
    return processor.process(data);
  }
}
```

### Step 3: Update Database Schema
Add source tracking to recordings:

```sql
ALTER TABLE recordings ADD COLUMN source VARCHAR(50) DEFAULT 'zoom';
ALTER TABLE recordings ADD COLUMN source_metadata JSONB;
```

### Step 4: Create Unified Processing Pipeline
```javascript
// src/services/UnifiedProcessor.js
class UnifiedProcessor {
  async processRecording(recording, source) {
    // Common processing steps
    const processed = await this.standardize(recording);
    const stored = await this.storeInDrive(processed);
    const tracked = await this.updateTracking(stored, source);
    return tracked;
  }
}
```

### Step 5: Add to Main Application
Update `src/app.js`:

```javascript
// Add drive source endpoint
app.post('/api/drive-source/scan', async (req, res) => {
  const { folderId, options } = req.body;
  const scanner = new S3IvylevelScanner(config);
  const results = await scanner.scanFolder(folderId, options);
  res.json({ sessions: results.length });
});

// Add batch processing
app.post('/api/drive-source/process-batch', async (req, res) => {
  const processor = new StandaloneDriveProcessor(config);
  const results = await processor.processBatch(req.body.sessions);
  res.json(results);
});
```

### Step 6: Create Migration Script
```javascript
// scripts/migrate-drive-recordings.js
async function migrateDriveRecordings() {
  // 1. Scan all coach folders
  // 2. Process in batches
  // 3. Update master index
  // 4. Generate report
}
```

## Testing Integration

1. **Test with Single Coach**:
   ```bash
   node scripts/process-single-coach.js --coach Jenny --dry-run
   ```

2. **Verify Data Consistency**:
   - Check standardized names match expected format
   - Verify no duplicates with existing recordings
   - Ensure all files are properly moved

3. **Performance Testing**:
   - Process 100 sessions and measure time
   - Check API rate limits
   - Monitor memory usage

## Rollback Plan

If issues occur:

1. **Files are safe**: Original files remain in source folders until explicitly deleted
2. **Tracking**: All moves are logged in Google Sheet
3. **Restore**: Script to move files back to original locations

```javascript
// scripts/rollback-drive-processing.js
async function rollbackProcessing(sessionIds) {
  // Read from sheet
  // Move files back
  // Update tracking
}
```

## Post-Integration Monitoring

1. **Dashboard Updates**:
   - Add drive source statistics
   - Show processing queue
   - Display error rates

2. **Alerts**:
   - Failed processing
   - Duplicate detection
   - Missing files

3. **Reports**:
   - Daily processing summary
   - Coach-wise statistics
   - Storage optimization

## Benefits of This Approach

1. **Parallel Development**: Drive source developed independently
2. **No Disruption**: Current processing continues unaffected  
3. **Easy Testing**: Separate test environment validates approach
4. **Gradual Migration**: Can process coaches one at a time
5. **Rollback Safety**: Original files preserved until verified

## Timeline

1. **Now**: Continue testing in standalone environment
2. **After current batch**: Review and approve integration plan
3. **Integration**: 2-3 days for careful integration
4. **Migration**: Process historical recordings in batches
5. **Cleanup**: Remove successfully migrated source files

## Notes

- All coaches have different folder structures - scanner adapts
- Many-to-many relationships (like Alan & Rayaan) handled
- Confidence scoring helps identify edge cases
- Standardized naming ensures consistency across sources