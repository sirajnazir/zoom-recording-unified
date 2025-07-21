# Google Drive Folder Structure

## Overview

This document outlines the complete Google Drive folder structure used by the Zoom Recording Unified Processing System. All folders are organized under a main recordings root folder and serve specific purposes in the recording management workflow.

## Main Folder Structure

```
RECORDINGS_ROOT_FOLDER_ID=1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg
├── Coaches/ (1fLA2s5KBgg0t0JHwoihjj35-wiwr8hJ8)
├── Students/ (12LgtSd9CpOllNBBycCfxPVFB6Sk9bTIp)
├── MISC/ (1jMQ_gmwfUQv6gvGAXog3UrnXinUej0Qt)
├── TRIVIAL/ (12oCxJ6xwJ5xDWo7H89nSh9OQJroTBhhH)
├── Game Plan Reports/ (1Gxok38h6CAa0fw-zs8JFWoKSkzWlWEUG)
└── Execution Docs/ (1ZElDyXLjHPW5kTkn2piUHmJ9n6iwYNkK)
```

## Folder Details

### 1. Coaches Folder
- **Folder ID**: `1fLA2s5KBgg0t0JHwoihjj35-wiwr8hJ8`
- **Purpose**: Contains coach-specific folders with their recordings
- **Structure**:
  ```
  Coaches/
  ├── Jenny/
  ├── Aditi/
  ├── Juli/
  ├── Andrew/
  ├── Alan/
  ├── Jamie/
  ├── Rishi/
  ├── Noor/
  ├── Steven/
  ├── Katie/
  ├── Marissa/
  ├── Janice/
  ├── Erin/
  ├── Anne/
  └── Summer/
  ```
- **Environment Variable**: `COACHES_FOLDER_ID`

### 2. Students Folder
- **Folder ID**: `12LgtSd9CpOllNBBycCfxPVFB6Sk9bTIp`
- **Purpose**: Contains student-specific folders with their coaching recordings
- **Structure**:
  ```
  Students/
  ├── Aarav/
  ├── Aarnav/
  ├── Aaryan/
  ├── Abhi/
  ├── Aditi/
  ├── Advay/
  ├── Ananyaa/
  ├── Anoushka/
  ├── Anshika/
  ├── Armaan/
  ├── Arshiya/
  ├── Arushi/
  ├── Ayaan/
  ├── Beya/
  ├── Connor/
  ├── Damaris/
  ├── Hamzah/
  ├── Hiba/
  ├── Huda/
  ├── Iqra/
  ├── Ishaan/
  ├── Kabir/
  ├── Kavya/
  ├── Minseo/
  ├── Netra/
  ├── Payal/
  ├── Prishaa/
  ├── Rayaan/
  ├── Rishit/
  ├── Sameeha/
  ├── Shashank/
  ├── Soham/
  ├── Srinidhi/
  ├── Victoria/
  ├── Yosi/
  └── Zainab/
  ```
- **Environment Variable**: `STUDENTS_FOLDER_ID`

### 3. MISC Folder
- **Folder ID**: `1jMQ_gmwfUQv6gvGAXog3UrnXinUej0Qt`
- **Purpose**: Contains miscellaneous recordings (interviews, team meetings, etc.)
- **Content Types**:
  - Team meetings
  - Interviews
  - Training sessions
  - Administrative meetings
  - Non-coaching sessions
- **Environment Variable**: `MISC_FOLDER_ID`

### 4. TRIVIAL Folder
- **Folder ID**: `12oCxJ6xwJ5xDWo7H89nSh9OQJroTBhhH`
- **Purpose**: Contains short or non-meaningful recordings
- **Criteria**:
  - Recordings under 5 minutes
  - Test recordings
  - Failed recordings
  - Non-meaningful content
- **Environment Variable**: `TRIVIAL_FOLDER_ID`

### 5. Game Plan Reports Folder
- **Folder ID**: `1Gxok38h6CAa0fw-zs8JFWoKSkzWlWEUG`
- **Purpose**: Stores game plan reports and strategic documents
- **Content Types**:
  - Student game plans
  - Strategic planning documents
  - Progress reports
  - Goal-setting documents
- **Environment Variable**: `GAME_PLAN_REPORTS_FOLDER_ID`

### 6. Execution Docs Folder
- **Folder ID**: `1ZElDyXLjHPW5kTkn2piUHmJ9n6iwYNkK`
- **Purpose**: Stores execution-related documents and materials
- **Content Types**:
  - Execution plans
  - Implementation guides
  - Process documents
  - Operational materials
- **Environment Variable**: `EXECUTION_DOCS_FOLDER_ID`

## Environment Variables

All folder IDs can be configured via environment variables:

```env
# Main folders
RECORDINGS_ROOT_FOLDER_ID=1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg
COACHES_FOLDER_ID=1fLA2s5KBgg0t0JHwoihjj35-wiwr8hJ8
STUDENTS_FOLDER_ID=12LgtSd9CpOllNBBycCfxPVFB6Sk9bTIp
MISC_FOLDER_ID=1jMQ_gmwfUQv6gvGAXog3UrnXinUej0Qt
TRIVIAL_FOLDER_ID=12oCxJ6xwJ5xDWo7H89nSh9OQJroTBhhH

# Auxiliary folders
GAME_PLAN_REPORTS_FOLDER_ID=1Gxok38h6CAa0fw-zs8JFWoKSkzWlWEUG
EXECUTION_DOCS_FOLDER_ID=1ZElDyXLjHPW5kTkn2piUHmJ9n6iwYNkK
```

## File Organization Rules

### Recording Files
Each recording session typically contains:
- **Video file**: `.mp4` format
- **Audio file**: `.m4a` format  
- **Transcript file**: `.vtt` or `.txt` format
- **Metadata file**: `.json` format (if available)

### Naming Convention
Recordings follow the standardized naming pattern:
```
Coaching_CoachName_StudentName_WkXX_YYYY-MM-DD_HH-MM-SS.mp4
```

### Dual-Path Organization
The system creates two organizational paths:
1. **Student-centric**: `/Students/StudentName/Coaching_Coach_Student_WkXX.mp4`
2. **Coach shortcuts**: `/Coaches/CoachName/shortcuts/→ Student recordings`

## Access Permissions

### Required Permissions
- **View**: Read access to all folders
- **Edit**: Write access for file uploads and organization
- **Delete**: For cleanup operations (optional)

### Service Account Access
The system uses a Google Service Account with the following scopes:
- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/drive.file`
- `https://www.googleapis.com/auth/spreadsheets`

## Backup and Recovery

### Backup Strategy
- Original files are preserved in source locations
- All file movements are logged in Google Sheets
- Processing history is maintained in logs

### Recovery Process
If files need to be restored:
1. Check Google Sheets for file movement history
2. Use the rollback scripts in `scripts/` directory
3. Verify file integrity after restoration

## Monitoring and Maintenance

### Health Checks
- Regular folder structure validation
- Permission verification
- Storage quota monitoring
- File count reconciliation

### Cleanup Operations
- Remove duplicate files
- Archive old recordings
- Optimize storage usage
- Update folder permissions

## Integration Points

### Webhook System
- Real-time file uploads to appropriate folders
- Immediate categorization and organization

### Batch Processor
- Historical file processing and organization
- Bulk operations and cleanup

### Drive Source
- Import from existing Drive structures
- Migration and reorganization

## Troubleshooting

### Common Issues
1. **Permission Denied**: Check service account permissions
2. **Folder Not Found**: Verify folder IDs in configuration
3. **Storage Quota**: Monitor Drive storage limits
4. **File Conflicts**: Check for duplicate file names

### Debug Commands
```bash
# Verify folder access
node scripts/verify-drive-access.js

# Check folder structure
node scripts/validate-folder-structure.js

# Test file upload
node scripts/test-drive-upload.js
```

## Updates and Changes

### Version History
- **v1.0**: Initial folder structure
- **v2.0**: Added auxiliary folders (Game Plan Reports, Execution Docs)
- **v2.1**: Updated folder IDs for new knowledge base structure

### Change Management
- All folder changes are documented here
- Environment variables are updated accordingly
- Migration scripts are provided for major changes
- Rollback procedures are tested before deployment 