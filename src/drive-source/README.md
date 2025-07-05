# Google Drive Source Integration

This directory contains the Google Drive source integration for processing historical recordings stored in Google Drive.

## Architecture

### Services

1. **DriveScanner** - Base class for scanning Google Drive folders
2. **S3IvylevelScanner** - Specialized scanner for S3-Ivylevel folder structure
3. **RecordingMatcher** - Groups related files (video, audio, transcript) into sessions
4. **IntegratedDriveProcessor** - Processes sessions using existing standardization services

### Integration with Existing System

The `IntegratedDriveProcessor` integrates with:
- `CompleteSmartNameStandardizer` - For consistent name standardization
- `DualTabGoogleSheetsService` - For updating both Raw and Standardized tabs
- `DriveOrganizer` - For organizing files in Google Drive (optional)

## Usage

### Quick Test Scripts

1. **Test Scanner Only**
   ```bash
   node src/drive-source/test-scanner.js
   ```

2. **Test with Specific Coach**
   ```bash
   node src/drive-source/quick-test-jenny.js
   ```

3. **Test Integration Demo**
   ```bash
   node src/drive-source/test-integration-demo.js
   ```

### Processing Recordings

The drive source is managed through the `RecordingSourceManager`:

```javascript
const RecordingSourceManager = require('./src/services/RecordingSourceManager');
const manager = new RecordingSourceManager(config);

// Process drive recordings
const results = await manager.processDriveSource({
  coachName: 'Jenny',
  maxSessions: 10
});
```

### Configuration

Enable the drive source in your `.env`:
```bash
ENABLE_DRIVE_SOURCE=true
S3_IVYLEVEL_FOLDER_ID=your-folder-id
```

Configure coach folders:
```bash
JENNY_FOLDER_ID=folder-id
ALAN_FOLDER_ID=folder-id
JULI_FOLDER_ID=folder-id
ANDREW_FOLDER_ID=folder-id
```

## Data Flow

1. **Scanner** finds recording files in Google Drive
2. **Matcher** groups files into sessions
3. **Processor** converts sessions to standard format
4. **Standardizer** generates consistent names
5. **Sheets Service** updates both Raw and Standardized tabs

## Folder Name Preprocessing

The processor handles various folder naming formats:
- `Coaching_Jenny_Huda_Wk2_2025-01-02` (already standardized)
- `S12-Ivylevel-Alan-Session-2024-12-15` (S3-Ivylevel format)
- `Jenny & Huda - Week 2` (simple format)

All formats are converted to a standard format before processing.

## Expected Output

### Raw Master Index
- Original folder/file names
- Metadata from Google Drive
- Processing timestamps
- Data source: "Google Drive Import"

### Standardized Master Index
- Standardized name: `Coaching_Jenny_Huda_Wk2_2025-01-02_M:123U:abc==`
- Extracted components (coach, student, week)
- Confidence scores
- Consistent categorization