# How to Fix the 20 Unknown Recordings

## The Issue
The 20 unknown recordings have non-standard folder names like:
- "Re: Aaryan/ Leena: Ivylevel Basic Plan - 15 Minute with Rishi - May 9, 2024"

These don't match the expected pattern, so they're processed as "unknown" even though they're in proper coach/student folders.

## The Solution

### Option 1: Quick Manual Fix (Recommended)
Since there are only 20 recordings and you've already processed 350 successfully:

1. **In Google Sheets**, for each unknown row:
   - Look at the folder path in the Drive Link column
   - Extract coach from path (e.g., "Coach Rishi" → Rishi)
   - Extract student from path or folder name
   - Update the Coach and Student columns manually

2. **Update the standardized names** to follow the pattern:
   - From: `Coaching_B_unknown_Unknown_Wk01_2025-07-07_...`
   - To: `Coaching_B_Rishi_Aaryan_Wk01_2024-05-09_...`

### Option 2: Delete and Reprocess with Enhanced Logic
1. Delete the 20 unknown rows from sheets
2. Delete the unknown folders from Knowledge Base
3. Use the EnhancedDriveProcessorV5 that extracts from folder hierarchy
4. Process only these 20 recordings

### Option 3: Update Sheets Programmatically
Create a script to:
1. Read the unknown rows from sheets
2. Parse the folder paths to extract coach/student
3. Update the sheets with correct information

## Known Problematic Recordings
From the one we found:
- **Path**: S3-Ivylevel-GDrive-Session-Recordings / Coach Rishi / Ivylevel <> Coach Rishi & Aaryan / Re: Aaryan/ Leena: Ivylevel Basic Plan - 15 Minute with Rishi - May 9, 2024
- **Should be**: Coach: Rishi, Student: Aaryan, Date: 2024-05-09

The pattern shows these are in the correct folder structure, just with non-standard names.