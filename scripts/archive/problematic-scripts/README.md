# Archived Problematic Scripts

These scripts have been archived because they contain issues that cause problems:

## Issues Found:

### process-all-drive-auto.js
- Uses RecordingSourceManager which splits files from same folder into multiple sessions
- Creates duplicate rows in sheets (e.g., 8 rows for 2 folders)

### process-all-drive-dynamic.js  
- Similar file splitting issue
- Doesn't properly group files by folder

### process-all-drive-recordings.js
- Calls `processor.processSession()` which doesn't exist (should be `processRecording()`)
- Shows "Failed: undefined" for all recordings even though they process

### fix-drive-processor-script.js
- Was created to analyze the wrong script
- Not needed since process-drive-unified.js works correctly

## Use These Instead:

✅ **scripts/process-drive-unified.js** - WORKING PRODUCTION SCRIPT
✅ **scripts/process-all-drive-folders.js** - Alternative folder-based processing
✅ **scripts/test-drive-limited.js** - For testing with limited recordings

These scripts properly:
- Process each folder as ONE session
- Group all files together (no splitting)
- Create exactly one row per recording folder in sheets
- Add the _B_ indicator correctly