# Preflight Zoom Analyzer

## Overview

The Preflight Zoom Analyzer is a sophisticated tool that analyzes Zoom recordings **before downloading** to ensure accurate processing. It uses high-fidelity data sources including transcripts, timeline.json, and metadata to provide confidence scores and predictions.

## Key Features

### 🎯 Pre-Download Analysis
- Analyzes recordings using Zoom API metadata
- Examines available files (transcripts, timeline, chat)
- Provides confidence scores for name and week inference
- Predicts folder structure and naming

### 📊 Multi-Source Data Analysis
- **Transcripts**: Speaker identification and content analysis
- **Timeline.json**: Participant join/leave patterns
- **Metadata**: Meeting information and host details
- **Topic Analysis**: Pattern matching and name extraction

### 🔍 Interactive Review Process
- Two-gate approval system
- Detailed analysis display with tables
- Interactive recording review
- Batch approval options

### 📈 Confidence Scoring
- Name standardization confidence (0-100%)
- Week inference confidence (0-100%)
- Overall confidence calculation
- Warning system for low-confidence results

## Architecture

```
PreflightZoomAnalyzer
├── Gate 1: Fetch & Display Recordings
│   ├── Fetch recordings with metadata
│   ├── Display summary and table
│   └── User approval
├── Gate 2: Pre-Download Analysis
│   ├── Deep analysis without downloading
│   ├── Multi-source data processing
│   ├── Confidence scoring
│   └── Results review and approval
└── Output: Approved recordings for processing
```

## Usage

### Command Line Interface

```bash
# Basic analysis
npm run preflight:analyze

# With date range
npm run preflight:analyze -- --from 2024-06-01 --to 2024-06-30

# List recordings without analysis
npm run preflight:list -- --from 2024-06-01

# Show statistics
npm run preflight:stats

# Auto-approve high confidence recordings
npm run preflight:analyze -- --auto-approve --confidence-threshold 80

# Dry run with output file
npm run preflight:analyze -- --dry-run --output results.json
```

### Programmatic Usage

```javascript
const { PreflightZoomAnalyzer } = require('./preflight-zoom-analyzer');

async function analyzeRecordings() {
    const analyzer = new PreflightZoomAnalyzer();
    await analyzer.initialize();
    
    // Gate 1: Fetch and display recordings
    const recordingsApproved = await analyzer.fetchAndDisplayRecordings(
        '2024-06-01', 
        '2024-06-30'
    );
    
    if (recordingsApproved) {
        // Gate 2: Analyze recordings
        const analysisApproved = await analyzer.analyzeRecordingsWithoutDownload();
        
        if (analysisApproved) {
            // Get approved recordings for processing
            const approvedRecordings = analyzer.getApprovedRecordings();
            console.log(`Approved ${approvedRecordings.length} recordings for processing`);
        }
    }
}
```

## Data Sources

### 1. Transcript Analysis
- **Speaker Identification**: Extracts participant names from transcript speakers
- **Content Analysis**: Searches for week mentions in transcript content
- **Confidence**: High confidence when transcript data is available

### 2. Timeline.json Analysis
- **Participant Data**: Join/leave times and participant names
- **Event Patterns**: Meeting flow and participation patterns
- **Name Resolution**: Cross-references with other data sources

### 3. Metadata Analysis
- **Meeting Information**: Topic, host, duration, recording type
- **File Availability**: Checks for transcript, timeline, chat files
- **Size Information**: Total recording size and file breakdown

### 4. Topic Pattern Matching
- **Name Extraction**: Regex patterns for name identification
- **Week Detection**: Pattern matching for week mentions
- **Coach Identification**: Logic to identify coach vs student

## Analysis Process

### Step 1: Data Collection
```javascript
// Fetch recordings with enhanced metadata
const recordings = await this._fetchRecordingsWithMetadata(fromDate, toDate);

// Check available files for each recording
const hasTranscript = files.some(f => f.file_type === 'TRANSCRIPT');
const hasTimeline = files.some(f => f.file_type === 'TIMELINE');
const hasChat = files.some(f => f.file_type === 'CHAT');
```

### Step 2: Multi-Source Analysis
```javascript
// Analyze transcript if available
if (recording.availableFiles?.transcript) {
    const transcriptData = await this._analyzeTranscript(recording);
    // Extract speakers and week mentions
}

// Analyze timeline if available
if (recording.availableFiles?.timeline) {
    const timelineData = await this._analyzeTimeline(recording);
    // Extract participant information
}

// Analyze metadata
const metadataAnalysis = await this.services.metadataExtractor.extractMetadata(recording);
```

### Step 3: Name Standardization
```javascript
// Run name standardization with all collected data
const nameResult = await this.services.nameStandardizer.standardizeName(nameInput, {
    additionalContext: {
        coach: analysis.coach,
        hostEmail: recording.host_email,
        participants: analysis.metadataAnalysis?.participants,
        transcriptSpeakers: analysis.transcriptSpeakers
    }
});
```

### Step 4: Week Inference
```javascript
// Run week inference with all data
const weekResult = await this.services.weekInferencer.inferWeek({
    timestamp: recording.start_time,
    metadata: recording,
    recordingName: analysis.standardizedName,
    additionalContext: {
        transcriptWeek: analysis.weekFromTranscript,
        folderPattern: recording.topic,
        coach: analysis.coach,
        student: analysis.student
    }
});
```

### Step 5: Confidence Calculation
```javascript
// Calculate overall confidence
analysis.confidence.overall = Math.round(
    (analysis.confidence.name * 0.6 + analysis.confidence.week * 0.4)
);
```

## Output Format

### Analysis Results
```javascript
{
    originalTopic: "Personal Meeting Room - John Smith",
    standardizedName: "John Smith",
    coach: "Coach Name",
    student: "John Smith",
    weekNumber: "Week-5",
    confidence: {
        name: 85,
        week: 70,
        overall: 79
    },
    dataSources: ["transcript", "metadata", "timeline"],
    predictedFolderName: "2024-06-15 John Smith Week-5",
    predictedPath: "Zoom Recordings/2024-06-15 John Smith Week-5",
    warnings: ["Low week confidence: 70%"]
}
```

### Report File
```json
{
    "timestamp": "2024-06-15T10:30:00.000Z",
    "summary": {
        "total": 25,
        "approved": 20,
        "rejected": 5
    },
    "approvedRecordings": [
        {
            "uuid": "recording-uuid",
            "originalTopic": "Personal Meeting Room - John Smith",
            "standardizedName": "John Smith",
            "weekNumber": "Week-5",
            "confidence": 79,
            "predictedPath": "Zoom Recordings/2024-06-15 John Smith Week-5"
        }
    ],
    "rejectedRecordings": [
        {
            "uuid": "recording-uuid",
            "originalTopic": "Meeting with Unknown",
            "reason": "Low confidence: 45%"
        }
    ]
}
```

## Configuration

### Environment Variables
```bash
# Required
ZOOM_API_KEY=your_zoom_api_key
ZOOM_API_SECRET=your_zoom_api_secret

# Optional
ZOOM_FROM_DATE=2024-04-01
ZOOM_TO_DATE=2024-12-31
CONFIDENCE_THRESHOLD=70
```

### Command Line Options
- `--from, -f`: Start date (YYYY-MM-DD)
- `--to, -t`: End date (YYYY-MM-DD)
- `--dry-run, -d`: Show analysis without user interaction
- `--output, -o`: Save results to file
- `--auto-approve, -a`: Auto-approve recordings above confidence threshold
- `--confidence-threshold, -c`: Minimum confidence % for auto-approval

## Integration

### With Main Processing System
```javascript
// After preflight analysis, use approved recordings
const approvedRecordings = analyzer.getApprovedRecordings();

for (const item of approvedRecordings) {
    const { recording, analysis } = item;
    
    // Use analysis results for processing
    const processingConfig = {
        uuid: recording.uuid,
        standardizedName: analysis.standardizedName,
        weekNumber: analysis.weekNumber,
        predictedPath: analysis.predictedPath,
        confidence: analysis.confidence.overall
    };
    
    // Process recording with confidence
    await processRecording(processingConfig);
}
```

### With Monitoring System
```javascript
// The preflight analyzer emits events that can be monitored
analyzer.on('analysis-complete', (results) => {
    console.log(`Analysis complete: ${results.approved} approved, ${results.rejected} rejected`);
});

analyzer.on('recording-analyzed', (recording, analysis) => {
    console.log(`Analyzed: ${analysis.standardizedName} (${analysis.confidence.overall}%)`);
});
```

## Best Practices

### 1. Use Appropriate Date Ranges
- Start with small date ranges for testing
- Use weekly or monthly ranges for production
- Avoid very large date ranges (>3 months) to prevent timeouts

### 2. Review Low Confidence Results
- Always review recordings with <60% confidence
- Check warnings and data sources used
- Consider manual intervention for critical recordings

### 3. Monitor Analysis Quality
- Track approval rates over time
- Monitor confidence score distributions
- Review rejected recordings for patterns

### 4. Integrate with Monitoring
- Use the monitoring system during analysis
- Track processing time and success rates
- Monitor API rate limits and errors

## Troubleshooting

### Common Issues

1. **No recordings found**
   - Check date range and Zoom API credentials
   - Verify Zoom account has recordings in the date range

2. **Low confidence scores**
   - Check if transcripts are available
   - Review name standardization configuration
   - Verify week inference data sources

3. **Analysis failures**
   - Check Zoom API rate limits
   - Verify service dependencies are available
   - Review error logs for specific issues

### Debug Mode
```bash
# Enable debug logging
NODE_ENV=development node run-preflight-analyzer.js analyze

# Check service health
npm run test:container
```

## Future Enhancements

### Planned Features
- **AI-powered analysis**: Use AI to improve confidence scoring
- **Batch processing**: Process multiple date ranges
- **Integration APIs**: REST API for external integration
- **Advanced filtering**: Filter by host, recording type, etc.
- **Machine learning**: Learn from user approvals to improve accuracy

### Performance Optimizations
- **Parallel processing**: Analyze multiple recordings simultaneously
- **Caching**: Cache analysis results for repeated runs
- **Incremental analysis**: Only analyze new recordings
- **Streaming**: Process large datasets efficiently 