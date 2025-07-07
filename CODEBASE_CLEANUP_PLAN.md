# Codebase Cleanup and Reorganization Plan

## Current State Analysis

### Core Production Code (KEEP)
These files constitute the actual production system:

#### 1. Main Entry Points
- `complete-production-processor.js` - Main batch processor
- `webhook-server.js` - Real-time webhook server
- `unified-processor.js` - Sync between batch and webhook
- `scripts/process-drive-recordings.js` - Drive import

#### 2. Core Services
- `src/infrastructure/services/`
  - `CompleteSmartNameStandardizer.js`
  - `DualTabGoogleSheetsService.js`
  - `DriveOrganizer.js`
  - `EnhancedRecordingDownloader.js`
  - `WebhookRecordingAdapter.js`
  - `ZoomService.js`
  - `SmartWeekInferencer.js`
  - `EnhancedMetadataExtractor.js`

#### 3. Domain Logic
- `src/domain/services/`
  - `OutcomesProcessor.js`
  - `OutcomeExtractor.js`
  - `RelationshipAnalyzer.js`

#### 4. Shared Components
- `src/shared/` - All shared utilities
- `src/utils/RecordingCategorizer.js`

#### 5. Configuration
- `.env` (not in repo)
- `package.json`
- `render.yaml`
- `src/shared/config/`

### Files to Archive (MOVE)

#### 1. Test Scripts (move to `archive/tests/`)
```
test-*.js (23 files)
simulate-*.js (4 files)
check-*.js
verify-*.js
```

#### 2. Old Processors (move to `archive/old-processors/`)
```
enhanced-processor.js
enhanced-processor-with-downloads.js
final-production-processor-enhanced.js
parallel-download-processor.js
streaming-download-processor.js
batch-processor.js
batch-processor-v2.js
```

#### 3. Utility Scripts (move to `archive/utilities/`)
```
clean-*.js
update-*.js
fix-*.js
master-reset-*.js
download-and-*.js (except current reprocess script)
```

#### 4. Backup Directories (move to `archive/backups/`)
```
src/application/services.backup.20250629_063007/
src/infrastructure/services.backup.20250629_062952/
```

#### 5. Documentation (move to `archive/docs/`)
```
Old documentation files that are outdated
Test results
One-off analysis files
```

### Files to Delete (REMOVE)

#### 1. Temporary Files
- `*.log` files (except critical ones)
- `output/` contents (can be regenerated)
- `downloads/` contents (can be re-downloaded)

#### 2. Duplicate Code
- Scripts that have been superseded by newer versions
- Test data files

## Proposed New Structure

```
zoom-recording-unified/
├── src/                    # Core application code
│   ├── api/               # API endpoints
│   ├── application/       # Application services
│   ├── domain/           # Domain logic
│   ├── infrastructure/   # External services
│   ├── shared/           # Shared utilities
│   └── utils/            # Helper utilities
├── scripts/               # Production scripts only
│   └── process-drive-recordings.js
├── config/                # Configuration files
├── docs/                  # Current documentation
│   ├── API.md
│   ├── ARCHITECTURE.md
│   └── DEPLOYMENT.md
├── archive/               # Non-production code
│   ├── tests/            # All test scripts
│   ├── old-processors/   # Previous versions
│   ├── utilities/        # One-off utilities
│   ├── reprocessing-scripts/ # Reprocessing tools
│   ├── debug-scripts/    # Debug utilities
│   ├── monitoring-scripts/ # Monitoring tools
│   ├── runners/          # Alternative runners
│   ├── backups/          # Backup directories
│   └── docs/             # Old documentation
├── .gitignore
├── package.json
├── render.yaml
├── README.md
├── CODEBASE_CLEANUP_PLAN.md
├── complete-production-processor.js
├── webhook-server.js
└── unified-processor.js
```

## Implementation Steps

1. **Create Archive Structure**
   ```bash
   mkdir -p archive/{tests,old-processors,utilities,backups,docs}
   ```

2. **Move Test Files**
   ```bash
   mv test-*.js archive/tests/
   mv simulate-*.js archive/tests/
   ```

3. **Move Old Processors**
   ```bash
   mv enhanced-processor*.js archive/old-processors/
   mv *-processor-v*.js archive/old-processors/
   ```

4. **Move Utilities**
   ```bash
   mv clean-*.js archive/utilities/
   mv fix-*.js archive/utilities/
   mv update-*.js archive/utilities/
   ```

5. **Move Backups**
   ```bash
   mv src/*/services.backup.* archive/backups/
   ```

6. **Update .gitignore**
   Add:
   ```
   output/
   downloads/
   logs/
   *.log
   ```

7. **Update Documentation**
   - Create clear README.md explaining the production system
   - Document the three data sources
   - Explain the unified pipeline

## Benefits

1. **Clarity**: Clear separation between production and non-production code
2. **Maintainability**: Easier to understand what's actually used
3. **Performance**: Smaller working directory
4. **Onboarding**: New developers can focus on core code
5. **Testing**: Test scripts organized and accessible when needed