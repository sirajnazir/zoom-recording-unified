# Ivylevel Knowledge Base Documentation
## Data Organization, Schema & AI Integration Guide

### Version 1.0 - July 2025

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Knowledge Base Architecture](#knowledge-base-architecture)
3. [Data Organization Structure](#data-organization-structure)
4. [Recording Schema & Metadata](#recording-schema--metadata)
5. [Google Sheets Integration](#google-sheets-integration)
6. [Data Access Patterns](#data-access-patterns)
7. [AI Enhancement Opportunities](#ai-enhancement-opportunities)
8. [API Integration Points](#api-integration-points)
9. [Future Scalability](#future-scalability)

---

## Executive Summary

The Ivylevel Knowledge Base is a comprehensive repository of coaching session recordings, auxiliary documents, and structured metadata designed to support:
- **Student Success**: Access to coaching sessions, game plans, and execution strategies
- **Coach Training**: Learning from experienced coaches' sessions and methodologies
- **AI-Powered Insights**: Extracting patterns, recommendations, and personalized guidance
- **Organizational Learning**: Building institutional knowledge from successful outcomes

### Key Statistics
- **Total Recordings**: 316+ coaching sessions
- **Data Sources**: 3 primary sources (A, B, C)
- **File Completeness**: 96.1% (excluding chat files)
- **Organization**: By Students, Coaches, Miscellaneous, and Trivial categories
- **New Additions**: 
  - **Execution Doc** folder at root level - Student progress tracking and implementation documents
  - **Game Plan Report** folder at root level - Strategic planning and game plan documents

---

## Knowledge Base Architecture

### 1. Root Structure
```
Ivylevel Knowledge Base (ID: 1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg)
│
├── Students/                    # Student-centric organization
│   └── [Student Name]/         # Individual student folders
│       └── [Recording Folders] # Coaching session recordings
│
├── Coaches/                    # Coach-centric organization
│   └── [Coach Name]/          # Individual coach folders
│       └── [Recording Folders] # Their coaching recordings
│
├── Miscellaneous/             # Non-standard sessions
│   └── [Recording Folders]    # Interviews, Reviews, Special Sessions
│
├── Trivial/                   # Incomplete/test recordings
│   └── [Recording Folders]    # Test or cancelled sessions
│
├── Execution Doc/             # NEW: Student execution documents
│   └── [Student Documents]    # Progress tracking, implementation docs
│
└── Game Plan Report/          # NEW: Strategic planning documents
    └── [Student Reports]      # Game plans, strategy documents
```

### 2. Recording Folder Naming Convention
```
[Category]_[Source]_[Coach]_[Student]_[Week/Type]_[Date]_M_[MeetingID]U_[UUID]

Example:
Coaching_A_Jenny_Anoushka_Wk14_2025-03-06_M_85325894179U_dTXmwxPSTKm0rq9wdRG5pg==
```

**Components:**
- **Category**: Coaching, GamePlan, MISC, Trivial
- **Source**: A, B, or C (data origin)
- **Coach**: Primary coach name
- **Student**: Student name
- **Week/Type**: Week number or session type
- **Date**: YYYY-MM-DD format
- **MeetingID**: Zoom meeting ID
- **UUID**: Base64 encoded unique identifier

### 3. Auxiliary Document Folders

#### Execution Doc Folder
- **Purpose**: Track student progress and implementation of coaching advice
- **Location**: `/Execution Doc/` (root level)
- **Contents**: 
  - Progress tracking spreadsheets
  - Task completion logs
  - Weekly execution summaries
  - Action item tracking
- **Naming Convention**: `[Student]_[Type]_[Date].[ext]`
- **Integration**: Links to specific coaching sessions via student name and date

#### Game Plan Report Folder  
- **Purpose**: Strategic planning documents for each student's journey
- **Location**: `/Game Plan Report/` (root level)
- **Contents**:
  - Initial assessment reports
  - Strategic roadmaps
  - Milestone planning documents
  - Program customization plans
- **Naming Convention**: `[Student]_GamePlan_[Version]_[Date].[ext]`
- **Integration**: Referenced in Week 0/1 coaching sessions

---

## Recording Schema & Metadata

### 1. File Types per Recording
Each recording folder contains:

| File Type | Extension | Description | Availability |
|-----------|-----------|-------------|--------------|
| Video | .mp4 | Screen recording with audio | 80.9% |
| Audio | .m4a | Audio-only track | 78.1% |
| Transcript | .vtt | Auto-generated transcript | 55.6% |
| AI Insights | .md | AI-processed summary & analysis | 100% |
| Timeline | .json | Meeting timeline & segments | Variable |
| Chat | .txt | In-meeting chat (if any) | 0% |
| Summary | .json | Quick summary & next steps | Variable |

### 2. Metadata Structure (JSON)
```json
{
  "recording": {
    "uuid": "dTXmwxPSTKm0rq9wdRG5pg==",
    "meetingId": "85325894179",
    "topic": "Ivylevel Jenny & Arshiya: Week 14",
    "date": "2025-03-06",
    "duration": 3600,
    "source": "A",
    "participants": {
      "coach": "Jenny",
      "student": "Arshiya",
      "others": []
    },
    "program": {
      "type": "24-Week Comprehensive",
      "week": 14,
      "phase": "Mid-Program"
    },
    "files": {
      "video": true,
      "audio": true,
      "transcript": true,
      "insights": true
    }
  }
}
```

---

## Google Sheets Integration

### 1. Master Tracking Sheets
The knowledge base is indexed across multiple Google Sheets:

#### a) **Multi-Tab Master Sheet**
- **Tab: Zoom API - Raw**: Unprocessed recording data
- **Tab: Zoom API - Standardized**: Cleaned & standardized records
- **Tab: A Recordings**: Source A coaching sessions
- **Tab: B Recordings**: Source B coaching sessions  
- **Tab: C Recordings**: Source C coaching sessions

#### b) **Smart Validation Results**
Location: `validation-reports/smart-fuzzy-validation-*.json`
- Maps all recordings between Sheets and Drive
- 98.8% match rate achieved
- Handles UUID format variations

### 2. Schema Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| uuid | string | Unique recording identifier | "dTXmwxPSTKm0rq9wdRG5pg==" |
| meetingId | string | Zoom meeting ID | "85325894179" |
| topic | string | Session title | "Week 14 Coaching" |
| date | date | Session date | "2025-03-06" |
| coach | string | Primary coach | "Jenny" |
| student | string | Primary student | "Arshiya" |
| duration | number | Minutes | 60 |
| source | string | Data source | "A" |
| driveFolder | string | Folder name in Drive | "Coaching_A_Jenny..." |
| fileCount | number | Number of files | 5 |
| hasVideo | boolean | Video availability | true |
| hasAudio | boolean | Audio availability | true |
| hasTranscript | boolean | Transcript availability | true |

---

## Data Access Patterns

### 1. By Student Journey
```
For a complete student view, combine:
├── /Students/[Name]/         → All coaching sessions
├── /Game Plan Report/        → Strategic planning docs for [Name]
└── /Execution Doc/           → Progress tracking for [Name]
```

### 2. By Coach Methodology
```
/Coaches/[Name]/ → All sessions by a coach
├── Teaching patterns
├── Success strategies
└── Student outcomes
```

### 3. By Document Type
```
Recording Data:
├── /Students/[Name]/[Recording]  → Video, Audio, Transcript, Insights
├── /Coaches/[Name]/[Recording]   → Alternative organization

Auxiliary Data:
├── /Game Plan Report/            → Strategic documents
└── /Execution Doc/               → Implementation tracking
```

### 4. By Program Type
- 48-Week Ultimate Prep
- 24-Week Comprehensive
- 10-Week Essay Elevator
- 3-Week Intensive

### 5. By Session Type
- Game Plan (Week 0/1) - Often has corresponding doc in /Game Plan Report/
- Regular Coaching (Week 2+) - May reference /Execution Doc/ items
- Reviews & Assessments
- Special Topics

---

## AI Enhancement Opportunities

### 1. Content Analysis
- **Transcript Mining**: Extract key topics, questions, advice
- **Pattern Recognition**: Identify successful coaching patterns
- **Progress Tracking**: Measure student improvement over time
- **Coach Comparison**: Analyze different coaching styles

### 2. Intelligent Recommendations
```python
# Example AI Integration Points
{
    "student_profile": {
        "current_week": 14,
        "coach": "Jenny",
        "program": "24-Week",
        "similar_students": ["Beya", "Hiba", "Anoushka"]
    },
    "recommendations": {
        "next_topics": ["Essay brainstorming", "Activity planning"],
        "similar_sessions": ["uuid1", "uuid2", "uuid3"],
        "coach_insights": "Focus on personal narrative"
    }
}
```

### 3. Automated Insights Generation
- Session summaries with key takeaways
- Action items extraction
- Progress reports
- Success pattern identification

### 4. Search & Discovery
- Natural language search across transcripts
- Semantic similarity matching
- Topic clustering
- Q&A extraction

---

## API Integration Points

### 1. Google Drive API
```javascript
// Access recording files
GET /files/{folderId}/children
Response: {
    "files": [
        {"name": "video.mp4", "size": 524288000},
        {"name": "transcript.vtt", "content": "..."},
        {"name": "insights.md", "content": "..."}
    ]
}
```

### 2. Google Sheets API
```javascript
// Query recording metadata
GET /spreadsheets/{sheetId}/values/A:Z
Response: Recording metadata array
```

### 3. Proposed Knowledge Base API
```javascript
// Endpoints for AI agent integration
GET /api/recordings/{uuid}           // Single recording details
GET /api/students/{name}/sessions    // Student's all sessions
GET /api/coaches/{name}/sessions     // Coach's all sessions
GET /api/search?q={query}           // Full-text search
GET /api/similar/{uuid}             // Find similar sessions
POST /api/insights/generate         // Generate AI insights
```

### 4. Webhook Integration
Real-time updates when new recordings are added:
```javascript
POST /webhook/recording-added
{
    "uuid": "...",
    "type": "coaching_session",
    "participants": {...},
    "files": [...]
}
```

---

## Future Scalability

### 1. Data Growth Projections
- Current: 316 recordings (~500GB)
- Monthly addition: ~40-50 new sessions
- Projected Year 1: 1,000+ recordings
- Storage needs: 2-3TB by end of year

### 2. Performance Optimization
- Implement caching layer for frequently accessed data
- Create indexed search database (Elasticsearch)
- CDN for video delivery
- Thumbnail generation for quick previews

### 3. Enhanced Features Roadmap
1. **Real-time Collaboration**: Live note-taking during playback
2. **AI Coach Assistant**: Suggested responses based on historical data
3. **Student Dashboard**: Personalized learning paths
4. **Coach Analytics**: Performance metrics and improvement areas
5. **Automated Tagging**: Topic and concept extraction
6. **Cross-Reference System**: Link related sessions automatically

### 4. Data Privacy & Security
- Role-based access control (Students see only their sessions)
- Audit logging for compliance
- Encryption at rest and in transit
- GDPR/FERPA compliance considerations

---

## Integration Guide for AI Agents

### Quick Start
1. **Authentication**: Use Google Service Account credentials
2. **Base Folder ID**: `1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg`
3. **Primary Data Source**: `smart-fuzzy-validation-*.json` for indexed data
4. **File Access Pattern**: Drive API → Folder → Files → Content

### Sample Code for AI Agent
```python
# Initialize Knowledge Base connection
from ivylevel_kb import KnowledgeBase

kb = KnowledgeBase(
    drive_folder_id="1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg",
    sheets_id="your-sheets-id",
    service_account_path="credentials.json"
)

# Get complete student data including auxiliary docs
student_data = kb.get_student_complete_data(
    student="Anoushka",
    include_game_plans=True,
    include_execution_docs=True
)

# Search for similar coaching sessions
similar_sessions = kb.find_similar(
    student="Anoushka",
    week=14,
    topic="essay writing"
)

# Link auxiliary documents to recordings
kb.link_auxiliary_docs(
    recording_uuid="dTXmwxPSTKm0rq9wdRG5pg==",
    game_plan_doc="/Game Plan Report/Anoushka_GamePlan_v2_2025-03-01.pdf",
    execution_doc="/Execution Doc/Anoushka_Week14_Progress.xlsx"
)

# Generate insights from transcript with auxiliary context
insights = kb.generate_insights(
    recording_uuid="dTXmwxPSTKm0rq9wdRG5pg==",
    focus_areas=["progress", "challenges", "next_steps"],
    include_auxiliary_context=True
)

# Get coach's successful patterns
patterns = kb.analyze_coach_patterns(
    coach="Jenny",
    outcome_metric="student_satisfaction"
)
```

---

## Appendix: File Naming After Standardization

All files within recording folders will follow this pattern:
```
[FolderName]_[FileType].[extension]

Examples:
Coaching_A_Jenny_Anoushka_Wk14_2025-03-06_M_85325894179U_dTXmwxPSTKm0rq9wdRG5pg==_video.mp4
Coaching_A_Jenny_Anoushka_Wk14_2025-03-06_M_85325894179U_dTXmwxPSTKm0rq9wdRG5pg==_transcript.vtt
Coaching_A_Jenny_Anoushka_Wk14_2025-03-06_M_85325894179U_dTXmwxPSTKm0rq9wdRG5pg==_insights.md
```

This standardization enables:
- Consistent file identification
- Easy parsing and categorization
- Improved searchability
- Automated processing pipelines

---

*Document prepared for AI agent integration and knowledge base enhancement*
*Last updated: July 2025*