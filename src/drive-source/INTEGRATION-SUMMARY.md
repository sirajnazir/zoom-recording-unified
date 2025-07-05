# Google Drive Source Integration Summary

## Problem Solved
The standalone processor wasn't using the existing standardization services, resulting in:
- Raw Master Index entries that didn't match the expected schema
- No entries in the Standardized Master Index
- Inconsistent naming formats across data sources

## Solution Implemented

### 1. IntegratedDriveProcessor
Created `IntegratedDriveProcessor.js` that properly integrates with existing services:
- Uses `CompleteSmartNameStandardizer` for consistent name standardization
- Uses `DualTabGoogleSheetsService` to update both Raw and Standardized tabs
- Optionally uses `DriveOrganizer` for file organization in Google Drive

### 2. Key Integration Points

#### Name Standardization
```javascript
// Preprocess Drive folder names to extract components
const processedTopic = this.preprocessDriveFolderName(recording.topic);

// Use the existing CompleteSmartNameStandardizer
const nameAnalysis = await this.completeSmartNameStandardizer.standardizeName(processedTopic, {
  hostEmail: recording.host_email,
  participantEmails: this.extractParticipantEmails(session),
  startTime: recording.start_time,
  uuid: recording.uuid || session.id,
  duration: recording.duration
});
```

#### Google Sheets Update
```javascript
// Update both Raw and Standardized tabs using DualTabGoogleSheetsService
await this.dualTabGoogleSheetsService.updateMasterSpreadsheet(
  {
    processed: processedRecording,
    original: recording
  },
  'Google Drive Import'
);
```

### 3. Preprocessing Logic
The `preprocessDriveFolderName` method converts Drive folder names into formats the standardizer understands:
- `Coaching_Jenny_Huda_Wk2_2025-01-02` → `Jenny & Huda`
- `S12-Ivylevel-Alan-Session-2024-12-15` → `Alan & Student12`

### 4. Expected Output

#### Raw Master Index (Tab 1)
- Original recording data as it comes from Google Drive
- Maintains source folder names and metadata
- Tracks data source as "Google Drive Import"

#### Standardized Master Index (Tab 2)
- Standardized names in format: `Coaching_Jenny_Huda_Wk2_2025-01-02_M:123U:abc==`
- Consistent coach/student name resolution
- Proper categorization (Coaching, MISC, TRIVIAL, etc.)
- Confidence scores for name matching

## Benefits
1. **Consistency**: All data sources use the same standardization logic
2. **Maintainability**: Changes to standardization rules apply everywhere
3. **Data Integrity**: Both raw and standardized data are preserved
4. **Traceability**: Clear audit trail from source to standardized format

## Usage
The integrated processor is automatically used by the RecordingSourceManager:
```javascript
// In RecordingSourceManager.js
this.sources.set('drive', {
  name: 'Google Drive Import',
  scanner: new S3IvylevelScanner(config),
  processor: new IntegratedDriveProcessor(config),
  enabled: true
});
```

## Testing
Run the integration demo to see how it works:
```bash
node src/drive-source/test-integration-demo.js
```

This demonstrates:
- Preprocessing of Drive folder names
- Name standardization using CompleteSmartNameStandardizer
- Expected Google Sheets updates for both tabs