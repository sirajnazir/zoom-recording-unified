# Documentation Index

This directory contains comprehensive documentation for the Zoom Recording Unified Processing System.

## 🆕 Latest Documentation

**For the most up-to-date documentation with the new Google Drive folder structure (July 2025), see:**
**[📁 docs/latest/](latest/README.md)**

The `latest/` folder contains all documentation updated with the new Google Drive folder IDs and auxiliary folders.

## Core Documentation

### [Google Drive Folder Structure](GOOGLE_DRIVE_FOLDER_STRUCTURE.md)
Complete overview of the Google Drive folder structure, folder IDs, and organization rules. **Updated with new folder IDs as of July 2025.**

### [Unified System Architecture](UNIFIED_SYSTEM_ARCHITECTURE.md)
Architecture overview of the webhook and batch processing systems, including shared resources and data flow.

### [Data Source Values](DATA_SOURCE_VALUES.md)
Reference for data source values and their meanings in the system.

## Processing Documentation

### [Smart Processor](smart-processor.md)
Documentation for the intelligent processing system with AI insights generation.

### [Preflight Analyzer](preflight-analyzer.md)
Guide for the preflight analysis system that validates recordings before processing.

### [Batch Processing](BATCH_README.md)
Comprehensive guide for batch processing operations and workflows.

## Integration Documentation

### [Webhook Integration](WEBHOOK_INTEGRATION.md)
Detailed guide for webhook system integration and configuration.

### [Webhook README](WEBHOOK_README.md)
Complete webhook system documentation and usage guide.

### [Render Webhook Configuration](render-webhook-configuration-guide.md)
Step-by-step guide for configuring webhooks on Render platform.

## Development Documentation

### [Refactoring Plan](refactoring-plan.md)
Original plan for system refactoring and improvements.

### [Refactoring Complete](refactoring-complete.md)
Summary of completed refactoring work and improvements.

### [Gates System Tester](gates-system-tester.md)
Documentation for the testing and validation system.

## Quick Reference

### Google Drive Folder IDs (Updated July 2025)
```
RECORDINGS_ROOT_FOLDER_ID=1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg
COACHES_FOLDER_ID=1fLA2s5KBgg0t0JHwoihjj35-wiwr8hJ8
STUDENTS_FOLDER_ID=12LgtSd9CpOllNBBycCfxPVFB6Sk9bTIp
MISC_FOLDER_ID=1jMQ_gmwfUQv6gvGAXog3UrnXinUej0Qt
TRIVIAL_FOLDER_ID=12oCxJ6xwJ5xDWo7H89nSh9OQJroTBhhH
GAME_PLAN_REPORTS_FOLDER_ID=1Gxok38h6CAa0fw-zs8JFWoKSkzWlWEUG
EXECUTION_DOCS_FOLDER_ID=1ZElDyXLjHPW5kTkn2piUHmJ9n6iwYNkK
```

### Environment Variables
Key environment variables for system configuration:
- `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`
- `GOOGLE_SERVICE_ACCOUNT_KEY` or `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY`
- `MASTER_INDEX_SHEET_ID`
- All folder IDs listed above

## Documentation Updates

### Recent Changes (July 2025)
- ✅ Updated Google Drive folder IDs for new knowledge base structure
- ✅ Added auxiliary folders (Game Plan Reports, Execution Docs)
- ✅ Created comprehensive Google Drive folder structure documentation
- ✅ Updated all configuration files with new folder IDs

### Maintenance
- All documentation is kept up-to-date with system changes
- Folder IDs are synchronized across all configuration files
- Environment variables are documented with current values
- Migration procedures are documented for major changes 