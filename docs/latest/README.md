# Latest Documentation (July 2025)

This folder contains the most up-to-date documentation for the Zoom Recording Unified Processing System, updated with the new Google Drive folder structure and IDs.

## 📅 Last Updated: July 2025

### What's New

This documentation has been updated to reflect the new Google Drive knowledge base structure with updated folder IDs and additional auxiliary folders.

## 📁 Updated Documentation Files

### [Google Drive Folder Structure](GOOGLE_DRIVE_FOLDER_STRUCTURE.md) ✨ **NEW**
- Complete overview of the Google Drive folder structure
- All folder IDs with their purposes and content types
- File organization rules and naming conventions
- Environment variable configuration
- Troubleshooting and maintenance guides

### [Unified System Architecture](UNIFIED_SYSTEM_ARCHITECTURE.md) 🔄 **UPDATED**
- Updated with new Google Drive folder IDs
- Current architecture overview of webhook and batch processing systems
- Shared resources and data flow documentation

### [Integration Guide](INTEGRATION_GUIDE.md) 🔄 **UPDATED**
- Updated with new folder structure section
- Drive source integration documentation
- Current Google Drive folder IDs

### [Documentation Index](README.md) 🔄 **UPDATED**
- Complete documentation index
- Quick reference for folder IDs
- Recent changes summary

## 🆕 New Google Drive Folder Structure

### Main Folders
```
RECORDINGS_ROOT_FOLDER_ID=1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg
├── Coaches/ (1fLA2s5KBgg0t0JHwoihjj35-wiwr8hJ8)
├── Students/ (12LgtSd9CpOllNBBycCfxPVFB6Sk9bTIp)
├── MISC/ (1jMQ_gmwfUQv6gvGAXog3UrnXinUej0Qt)
└── TRIVIAL/ (12oCxJ6xwJ5xDWo7H89nSh9OQJroTBhhH)
```

### Auxiliary Folders (NEW)
```
├── Game Plan Reports/ (1Gxok38h6CAa0fw-zs8JFWoKSkzWlWEUG)
└── Execution Docs/ (1ZElDyXLjHPW5kTkn2piUHmJ9n6iwYNkK)
```

## 🔧 Environment Variables

### Required for New Structure
```env
# Main folders
COACHES_FOLDER_ID=1fLA2s5KBgg0t0JHwoihjj35-wiwr8hJ8
STUDENTS_FOLDER_ID=12LgtSd9CpOllNBBycCfxPVFB6Sk9bTIp
MISC_FOLDER_ID=1jMQ_gmwfUQv6gvGAXog3UrnXinUej0Qt
TRIVIAL_FOLDER_ID=12oCxJ6xwJ5xDWo7H89nSh9OQJroTBhhH

# Auxiliary folders
GAME_PLAN_REPORTS_FOLDER_ID=1Gxok38h6CAa0fw-zs8JFWoKSkzWlWEUG
EXECUTION_DOCS_FOLDER_ID=1ZElDyXLjHPW5kTkn2piUHmJ9n6iwYNkK
```

## 📋 Migration Summary

### What Changed
- ✅ Updated all Google Drive folder IDs to new knowledge base structure
- ✅ Added two new auxiliary folders for Game Plan Reports and Execution Docs
- ✅ Updated all configuration files with fallback values
- ✅ Created comprehensive folder structure documentation
- ✅ Updated all relevant documentation files

### What's Backward Compatible
- ✅ Environment variables still work (with fallback to new IDs)
- ✅ Existing functionality remains unchanged
- ✅ All API endpoints continue to work
- ✅ Processing workflows remain the same

## 🚀 Quick Start

1. **Update Environment Variables**: Set the new folder IDs in your `.env` file
2. **Verify Access**: Test folder access with the new IDs
3. **Review Documentation**: Check the updated folder structure documentation
4. **Test Processing**: Run a test recording to ensure everything works

## 📞 Support

If you encounter any issues with the new folder structure:
1. Check the [Google Drive Folder Structure](GOOGLE_DRIVE_FOLDER_STRUCTURE.md) documentation
2. Verify your environment variables are set correctly
3. Test folder access permissions
4. Review the troubleshooting section in the documentation

## 📝 Version History

- **v2.1** (July 2025): Updated folder IDs for new knowledge base structure
- **v2.0**: Added auxiliary folders (Game Plan Reports, Execution Docs)
- **v1.0**: Initial folder structure

---

**Note**: This documentation supersedes all previous versions. For historical reference, older documentation is available in the parent `docs/` directory. 