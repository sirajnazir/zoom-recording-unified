# Zoom Webhook Enhanced - Unified V3 System

A comprehensive coaching platform that processes Zoom recordings to generate detailed insights supporting coach training and student progress tracking.

## 🚀 Latest Unified V3 System

This project has been reorganized to focus on the **latest unified V3 processing system** with enhanced AI-powered insights, smart name extraction, and comprehensive session analysis.

## 📁 Project Structure

### Root Directory (Latest Files Only)
```
zoom-webhook-enhanced/
├── process-recent-zoom-recordings-v3.js    # Main V3 processing script
├── process-all-zoom-recordings-v3.js       # Alternative V3 processing script  
├── test-rishi-name-extraction.js           # Latest test script
├── UNIFIED_SYSTEM_V3_IMPLEMENTATION_SUMMARY.md  # Latest documentation
├── standardized-master-index-headers.csv   # Latest CSV headers
├── enhanced-raw-master-index-headers.csv   # Latest CSV headers
├── local.env                               # Environment configuration
├── package.json                            # Dependencies
├── yarn.lock                               # Lock file
└── README.md                               # This file
```

### Core Source Files (`src/`)
```
src/
├── unified-recording-processor-v3.js       # Main V3 processor
├── enhanced-name-builder.js                # Smart name extraction
├── smart-week-inference-system.js          # Week number inference
├── ai-powered-insights-generator.js        # OpenAI/Claude insights
├── comprehensive-insights-generator.js     # Combined insights
├── enhanced-zoom-insights-extractor.js     # Zoom API insights
├── enhanced-transcript-analyzer.js         # VTT transcript analysis
├── tangible-outcomes-processor.js          # Outcomes tracking
├── master-index-updater.js                 # Spreadsheet updates
├── unified-spreadsheet-updater.js          # Google Sheets integration
├── google-drive-uploader.js                # Drive uploads
├── zoom-auth.js                            # Zoom API authentication
├── google-auth.js                          # Google API authentication
├── enhanced-unified-knowledge-base.js      # Knowledge base
├── unified-knowledge-base-core.js          # Core KB logic
├── knowledge-base.js                       # Basic KB operations
├── week-number-extractor.js                # Week extraction
├── enhanced-zoom-metadata-extractor.js     # Metadata extraction
├── server.js                               # Webhook server
└── logger.js                               # Logging utility
```

### Data & Configuration
```
data/
├── coaches.json                            # Coach definitions
├── students.json                           # Student definitions
└── unified-kb-state.json                   # Knowledge base state

config/                                     # Configuration files
credentials/                                # API credentials
logs/                                       # Processing logs
reports/                                    # Generated reports
temp/                                       # Temporary processing files
backups/                                    # System backups
```

### Archive Structure
```
archive/
├── old-scripts/                            # Previous processing scripts
├── old-test-scripts/                       # Previous test scripts
├── old-docs/                               # Previous documentation
├── old-results/                            # Previous test results
└── old-src-files/                          # Previous source files
```

## 🎯 Key Features

### V3 Unified Processing System
- **Enhanced Name Builder**: Smart extraction from Personal Meeting Rooms, topic analysis, and authoritative matching
- **AI-Powered Insights**: OpenAI GPT-4 and Anthropic Claude integration for comprehensive session analysis
- **Smart Week Inference**: Advanced week number calculation and validation
- **Tangible Outcomes Processing**: Tracking awards, scholarships, and concrete achievements
- **Quality Assessment**: Multi-dimensional quality scoring and validation
- **Google Drive Integration**: Automated folder creation and file organization
- **Spreadsheet Updates**: Real-time master index updates with comprehensive metadata

### 🔍 **NEW: Pre-Processing Confirmation**
- **Folder Names Preview**: Shows all generated folder names before processing
- **Session Type Summary**: Displays breakdown of Coaching/MISC/Trivial sessions
- **User Confirmation**: Requires explicit "yes" approval before downloading
- **Detailed Review**: Shows coach, student, session type, and duration for each recording

### Session Categorization
- **Coaching**: Full coach-student sessions with AI insights
- **MISC**: Administrative meetings and non-coaching sessions
- **Trivial**: Short test sessions (< 5 minutes)

### Name Extraction Logic
- **Personal Meeting Room Detection**: Extracts coach names from "X's Personal Meeting Room"
- **Authoritative Matching**: Uses coaches.json and students.json as primary sources
- **Fuzzy Matching**: Handles name variations and concatenated names
- **Host Email Analysis**: Extracts coach information from Zoom host emails

## 🚀 Quick Start

1. **Setup Environment**:
   ```bash
   cp local.env.example local.env
   # Edit local.env with your API keys
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Run V3 Processing** (with confirmation):
   ```bash
   node process-recent-zoom-recordings-v3.js
   ```

4. **Test Name Extraction**:
   ```bash
   node test-rishi-name-extraction.js
   ```

## 🔍 Pre-Processing Confirmation Flow

### Step 1: Fetch Recordings
The system fetches all recordings from the last 2 months and displays:
- Total number of recordings found
- Breakdown by user/coach
- Date range being processed

### Step 2: Generate Folder Preview
For each recording, the system:
- Extracts coach and student names
- Determines session type (Coaching/MISC/Trivial)
- Generates standardized folder names
- Shows detailed information for review

### Step 3: Display Summary
The system shows:
- **Folder Names Preview**: All generated folder names
- **Session Type Summary**: Count of each session type
- **Detailed Information**: Coach, student, duration, date for each

### Step 4: User Confirmation
```
⚠️  REVIEW REQUIRED: Please review the folder names above.
================================================================================

❓ Do you want to proceed with downloading and processing these recordings? (yes/no):
```

### Step 5: Processing
Only after user confirms with "yes" or "y":
- Downloads recordings from Zoom
- Processes with AI insights
- Uploads to Google Drive
- Updates spreadsheets

## 📊 Output Files

The V3 system generates comprehensive outputs:
- **Session Insights**: AI-generated summaries, highlights, action items
- **Tangible Outcomes**: Awards, scholarships, achievements tracking
- **Quality Metrics**: Multi-dimensional quality assessment
- **Google Drive Folders**: Organized by coach-student-week structure
- **Master Spreadsheet**: Comprehensive recording index with metadata

## 🔧 Configuration

Key environment variables in `local.env`:
- `ZOOM_API_KEY`: Zoom API credentials
- `OPENAI_API_KEY`: OpenAI API for insights generation
- `ANTHROPIC_API_KEY`: Claude API for insights generation
- `GOOGLE_DRIVE_FOLDER_ID`: Google Drive folder for uploads
- `GOOGLE_SHEETS_ID`: Master spreadsheet ID

## 📈 Recent Improvements

### V3 Enhancements (Latest)
- ✅ **Personal Meeting Room Detection**: Fixed Rishi's recordings identification
- ✅ **Enhanced Session Categorization**: Smart MISC vs Coaching classification
- ✅ **AI-Powered Insights**: OpenAI/Claude integration for comprehensive analysis
- ✅ **Improved Name Extraction**: Authoritative matching with coaches.json/students.json
- ✅ **Quality Assessment**: Multi-dimensional scoring system
- ✅ **Tangible Outcomes**: Tracking concrete achievements and awards
- ✅ **Pre-Processing Confirmation**: Review folder names before processing

## 📚 Documentation

- `UNIFIED_SYSTEM_V3_IMPLEMENTATION_SUMMARY.md`: Complete V3 system documentation
- `standardized-master-index-headers.csv`: CSV schema for master index
- `enhanced-raw-master-index-headers.csv`: CSV schema for raw index

## 🔄 Archive Access

Previous versions and experimental scripts are preserved in the `archive/` directory:
- `archive/old-scripts/`: Previous processing scripts
- `archive/old-test-scripts/`: Previous test scripts  
- `archive/old-docs/`: Previous documentation
- `archive/old-src-files/`: Previous source files

## 🤝 Contributing

This project follows a unified approach with the V3 system as the primary processing pipeline. All enhancements should be integrated into the V3 components in the `src/` directory. 