/**
 * Integrated Drive Processor v3
 * A simplified version that takes services as dependencies in constructor
 * instead of resolving from container
 */

const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class IntegratedDriveProcessorV3 {
  constructor(config, services = {}) {
    this.config = config;
    this.drive = google.drive({ version: 'v3', auth: this.getAuthClient() });
    
    // Services passed in constructor
    this.dualTabGoogleSheetsService = services.googleSheetsService;
    this.completeSmartNameStandardizer = services.completeSmartNameStandardizer;
    this.smartWeekInferencer = services.smartWeekInferencer;
    this.logger = services.logger || console;
    
    // Debug service initialization
    console.log('🔍 IntegratedDriveProcessorV3 initialized with:');
    console.log('  - Config sheet ID:', config?.google?.sheets?.masterIndexSheetId);
    console.log('  - GoogleSheetsService:', !!this.dualTabGoogleSheetsService);
    console.log('  - NameStandardizer:', !!this.completeSmartNameStandardizer);
    console.log('  - WeekInferencer:', !!this.smartWeekInferencer);
    
    // Optional services - will work without them
    this.insightsGenerator = services.insightsGenerator;
    this.outcomesProcessor = services.outcomesProcessor;
    this.driveOrganizer = services.driveOrganizer;
    this.aiPoweredInsightsGenerator = services.aiPoweredInsightsGenerator;
    
    // Track processed sessions
    this.processedSessions = new Map();
  }

  getAuthClient() {
    return new google.auth.JWT(
      this.config.google.clientEmail,
      null,
      this.config.google.privateKey,
      ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
    );
  }

  async processRecordingSessions(sessions) {
    console.log(`\n🚀 Processing ${sessions.length} Drive recording sessions...`);
    
    const results = {
      successful: [],
      failed: [],
      skipped: []
    };

    // Group sessions by folder to handle duplicates
    const sessionsByFolder = this.groupSessionsByFolder(sessions);
    
    for (const [folderId, folderSessions] of sessionsByFolder.entries()) {
      console.log(`\n📁 Processing folder: ${folderSessions[0].metadata?.folderName || folderId}`);
      
      // Pick the best quality video from the folder
      const session = this.selectBestSession(folderSessions);
      
      try {
        // Check for duplicates
        if (this.dualTabGoogleSheetsService) {
          try {
            const existingCheck = await this.dualTabGoogleSheetsService.checkRecordingExists(session.id);
            if (existingCheck && existingCheck.exists) {
              console.log(`⏭️  Skipping duplicate: ${session.id}`);
              results.skipped.push({ session, reason: 'Already processed' });
              continue;
            }
          } catch (checkError) {
            console.log(`⚠️  Could not check for duplicates: ${checkError.message}`);
            // Continue processing if duplicate check fails
          }
        }

        // Process through available services
        const processedSession = await this.processSession(session);
        results.successful.push(processedSession);
        
        console.log(`✅ Successfully processed: ${processedSession.standardizedName}`);
      } catch (error) {
        console.error(`❌ Failed to process session ${session.id}:`, error.message);
        results.failed.push({ session, error: error.message });
      }
    }

    this.generateProcessingReport(results);
    return results;
  }

  groupSessionsByFolder(sessions) {
    const grouped = new Map();
    
    for (const session of sessions) {
      const folderId = session.files?.[0]?.parentFolderId || session.id;
      if (!grouped.has(folderId)) {
        grouped.set(folderId, []);
      }
      grouped.get(folderId).push(session);
    }
    
    return grouped;
  }

  selectBestSession(sessions) {
    // Prefer sessions with:
    // 1. Transcript files
    // 2. Highest resolution video
    // 3. Most files
    
    return sessions.sort((a, b) => {
      const aHasTranscript = a.files?.some(f => f.fileType === 'transcript') || false;
      const bHasTranscript = b.files?.some(f => f.fileType === 'transcript') || false;
      
      if (aHasTranscript && !bHasTranscript) return -1;
      if (!aHasTranscript && bHasTranscript) return 1;
      
      // Compare video resolutions
      const aVideoSize = Math.max(...(a.files?.filter(f => f.fileType === 'video').map(f => parseInt(f.size) || 0) || [0]));
      const bVideoSize = Math.max(...(b.files?.filter(f => f.fileType === 'video').map(f => parseInt(f.size) || 0) || [0]));
      
      if (aVideoSize !== bVideoSize) return bVideoSize - aVideoSize;
      
      // Compare file count
      return (b.files?.length || 0) - (a.files?.length || 0);
    })[0];
  }

  async processSession(session) {
    console.log(`\n🔄 Processing session ${session.id}...`);
    
    // Step 1: Extract metadata and build recording object
    const extractedMetadata = this.extractSessionMetadata(session);
    const recording = this.buildRecordingObject(session, extractedMetadata);
    
    // Step 2: Smart Name Standardization (if available)
    let nameAnalysis = {
      standardizedName: recording.topic,
      confidence: 0.5,
      method: 'fallback',
      components: {
        sessionType: extractedMetadata.sessionType,
        coach: extractedMetadata.hostName,
        student: extractedMetadata.participants[1] || 'Unknown',
        week: extractedMetadata.weekNumber
      }
    };
    
    if (this.completeSmartNameStandardizer) {
      console.log('📝 Running smart name standardization...');
      try {
        nameAnalysis = await this.completeSmartNameStandardizer.standardizeName(
          extractedMetadata.topic,
          {
            participants: extractedMetadata.participants,
            date: recording.start_time,
            weekNumber: extractedMetadata.weekNumber
          }
        );
      } catch (error) {
        console.error('Name standardization failed:', error.message);
      }
    }
    
    // Step 3: Smart Week Inference (if available)
    let weekAnalysis = {
      weekNumber: extractedMetadata.weekNumber || '1',
      confidence: extractedMetadata.weekConfidence / 100 || 0.5,
      method: extractedMetadata.weekMethod || 'fallback'
    };
    
    // If we have a week number from folder name, use it with high confidence
    if (extractedMetadata.weekNumber !== null && extractedMetadata.weekNumber !== '') {
      weekAnalysis.weekNumber = extractedMetadata.weekNumber;
      weekAnalysis.confidence = 1.0;
      weekAnalysis.method = 'folder_name_exact';
      console.log(`📅 Using week ${extractedMetadata.weekNumber} from folder name`);
    }
    
    // Only run smart week inference if we don't have a confident week from folder
    if (this.smartWeekInferencer && weekAnalysis.confidence < 1.0) {
      console.log('📅 Running smart week inference...');
      try {
        const inferredWeek = await this.smartWeekInferencer.inferWeek({
          timestamp: recording.start_time,
          metadata: recording,
          recordingName: recording.topic,
          additionalContext: {
            folderName: session.metadata?.folderName,
            existingWeek: extractedMetadata.weekNumber
          }
        });
        // Only use inferred week if we don't have one from folder
        if (!extractedMetadata.weekNumber) {
          weekAnalysis = inferredWeek;
        }
      } catch (error) {
        console.error('Week inference failed:', error.message);
      }
    }
    
    // Step 4: Prepare basic processed data
    const processedData = this.buildProcessedData(
      recording, 
      nameAnalysis, 
      weekAnalysis, 
      null, // AI insights
      [], // outcomes
      {}, // files
      { folderId: recording.drive_folder_id, driveLink: `https://drive.google.com/drive/folders/${recording.drive_folder_id}` }
    );
    
    // Step 5: Update Google Sheets (if available)
    if (this.dualTabGoogleSheetsService) {
      console.log('📊 Updating Google Sheets...');
      console.log('  - Service exists:', !!this.dualTabGoogleSheetsService);
      console.log('  - Method exists:', typeof this.dualTabGoogleSheetsService.updateMasterSpreadsheet);
      
      try {
        const updateResult = await this.dualTabGoogleSheetsService.updateMasterSpreadsheet({
          processed: processedData,
          original: recording
        }, 'Google Drive Import');
        
        console.log('✅ Sheet update result:', updateResult ? 'Success' : 'Failed');
        if (updateResult && updateResult.rowNumber) {
          console.log('  - Added at row:', updateResult.rowNumber);
        }
      } catch (error) {
        console.error('❌ Sheet update error:', error.message);
        console.error('  - Error details:', error);
        // Don't throw - continue processing other sessions
      }
    } else {
      console.log('⚠️  No Google Sheets service available - skipping sheet update');
    }
    
    return processedData;
  }

  extractSessionMetadata(session) {
    const metadata = {
      topic: 'Unknown Session',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: 3600,
      hostEmail: 'drive-import@example.com',
      hostName: 'Drive Import',
      participants: [],
      participantCount: 0,
      weekNumber: '',
      weekConfidence: 0,
      weekMethod: '',
      hasTranscript: false,
      sessionType: 'Coaching'
    };

    // Extract from folder name - handle spaces in coach names
    if (session.metadata?.folderName) {
      const folderName = session.metadata.folderName;
      console.log(`🔍 Extracting metadata from folder: ${folderName}`);
      
      // Pattern: Coaching_Jenny Duan_Arshiya_Wk02_2024-09-29_[ID]
      const patterns = [
        // Standard format with optional ID suffix: Coaching_Jenny Duan_Arshiya_Wk00_2024-09-21_[ID]
        /^(Coaching|GamePlan|SAT|MISC|TRIVIAL)_([^_]+(?:\s+[^_]+)*)_([^_]+)_Wk(\d+[A-Z]?)_(\d{4}-\d{2}-\d{2})(?:_|$)/,
        // Standard format without spaces
        /^(Coaching|GamePlan|SAT|MISC|TRIVIAL)_([^_]+)_([^_]+)_Wk(\d+[A-Z]?)_(\d{4}-\d{2}-\d{2})(?:_|$)/,
        // Test format: 2024-12-31_Huda-Jenny_Week1_UUID-0d8e4f11
        /^(\d{4}-\d{2}-\d{2})_([^-]+)-([^_]+)_Week(\d+)/
      ];
      
      for (let i = 0; i < patterns.length; i++) {
        const match = folderName.match(patterns[i]);
        if (match) {
          console.log(`✅ Pattern ${i} matched`);
          if (i < 2) {
            // Standard format with Wk00A pattern
            const [, sessionType, coach, student, week, date] = match;
            console.log(`  Session type: ${sessionType}, Coach: ${coach}, Student: ${student}, Week: ${week}, Date: ${date}`);
            // Extract only first name for flexibility
            const coachFirstName = coach.trim().split(/\s+/)[0];
            const studentFirstName = student.trim().split(/\s+/)[0];
            
            metadata.sessionType = sessionType;
            metadata.topic = `${coachFirstName} & ${studentFirstName}`;
            metadata.participants = [coachFirstName, studentFirstName];
            metadata.hostName = coachFirstName;
            metadata.hostEmail = `${coachFirstName.toLowerCase()}@ivymentors.co`;
            // Extract just the numeric part of week (e.g., "00" from "00A")
            metadata.weekNumber = week.match(/\d+/)?.[0] || week;
            metadata.weekConfidence = 100;
            metadata.weekMethod = 'folder_name_exact';
            
            try {
              const parsedDate = new Date(date);
              metadata.startTime = parsedDate.toISOString();
              metadata.endTime = new Date(parsedDate.getTime() + metadata.duration * 1000).toISOString();
            } catch (e) {
              console.error('Failed to parse date:', e);
            }
          } else if (i === 2) {
            // Test format: 2024-12-31_Huda-Jenny_Week1_UUID-0d8e4f11
            const [, date, student, coach, week] = match;
            // Extract only first name for flexibility
            const coachFirstName = coach.trim().split(/\s+/)[0];
            const studentFirstName = student.trim().split(/\s+/)[0];
            
            metadata.sessionType = 'Coaching';
            metadata.topic = `${coachFirstName} & ${studentFirstName}`;
            metadata.participants = [coachFirstName, studentFirstName];
            metadata.hostName = coachFirstName;
            metadata.hostEmail = `${coachFirstName.toLowerCase()}@ivymentors.co`;
            metadata.weekNumber = week;
            metadata.weekConfidence = 100;
            metadata.weekMethod = 'folder_name_exact';
            
            try {
              const parsedDate = new Date(date);
              metadata.startTime = parsedDate.toISOString();
              metadata.endTime = new Date(parsedDate.getTime() + metadata.duration * 1000).toISOString();
            } catch (e) {
              console.error('Failed to parse date:', e);
            }
          }
          break;
        }
      }
    }

    // Set participant count
    metadata.participantCount = metadata.participants.length || 1;

    // Check for transcript
    metadata.hasTranscript = session.files?.some(f => 
      f.fileType === 'transcript' || 
      f.name.toLowerCase().includes('.vtt') || 
      f.name.toLowerCase().includes('.srt')
    ) || false;

    return metadata;
  }

  buildRecordingObject(session, metadata) {
    return {
      uuid: session.id,
      id: session.id,
      meeting_id: session.id,
      topic: metadata.topic,
      start_time: metadata.startTime,
      duration: metadata.duration,
      end_time: metadata.endTime,
      host_email: metadata.hostEmail,
      host_name: metadata.hostName,
      participant_count: metadata.participantCount,
      recording_type: 'cloud_recording',
      file_size: session.files?.reduce((t, f) => t + (parseInt(f.size) || 0), 0) || 0,
      download_url: session.files?.find(f => f.fileType === 'video')?.webViewLink || '',
      created_at: session.files?.[0]?.createdTime || metadata.startTime,
      recording_files: this.convertFilesToRecordingFiles(session, metadata.startTime),
      // Drive-specific fields
      drive_folder_id: session.files?.[0]?.parentFolderId || '',
      drive_folder_name: session.metadata?.folderName || ''
    };
  }

  convertFilesToRecordingFiles(session, startTime) {
    if (!session.files) return [];
    
    const endTime = new Date(new Date(startTime).getTime() + 3600000).toISOString();
    
    return session.files.map(file => ({
      id: file.id,
      meeting_id: session.id,
      recording_start: startTime,
      recording_end: endTime,
      file_type: this.mapFileType(file.fileType || this.detectFileType(file.name)),
      file_size: parseInt(file.size) || 0,
      file_extension: path.extname(file.name).toLowerCase().replace('.', ''),
      download_url: file.webViewLink || '',
      status: 'completed',
      recording_type: file.fileType || this.detectFileType(file.name)
    }));
  }

  mapFileType(fileType) {
    const typeMap = {
      'video': 'MP4',
      'audio': 'M4A',
      'transcript': 'VTT',
      'chat': 'TXT'
    };
    return typeMap[fileType] || fileType.toUpperCase();
  }

  detectFileType(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    const extTypeMap = {
      '.mp4': 'video',
      '.m4a': 'audio',
      '.vtt': 'transcript',
      '.txt': 'chat',
      '.srt': 'transcript'
    };
    return extTypeMap[ext] || 'other';
  }

  buildProcessedData(recording, nameAnalysis, weekAnalysis, aiInsights, outcomes, files, driveResult) {
    // Build the full standardized name with all components
    const sessionType = nameAnalysis.components?.sessionType || 'Coaching';
    const coach = nameAnalysis.components?.coach || 'Unknown';
    const student = nameAnalysis.components?.student || 'Unknown';
    const weekNumber = weekAnalysis.weekNumber || '00';
    const date = recording.start_time.split('T')[0];
    
    // Format: SessionType_Coach_Student_WkXX_YYYY-MM-DD
    const fullStandardizedName = `${sessionType}_${coach}_${student}_Wk${weekNumber.toString().padStart(2, '0')}_${date}`;
    
    const processedData = {
      // Core identifiers
      uuid: recording.uuid,
      fingerprint: this.generateFingerprint(recording),
      recordingDate: date,
      
      // Name and standardization
      rawName: recording.topic,
      standardizedName: fullStandardizedName,
      nameConfidence: nameAnalysis.confidence,
      nameResolutionMethod: nameAnalysis.method,
      
      // Week information
      weekNumber: weekAnalysis.weekNumber,
      weekConfidence: weekAnalysis.confidence,
      weekInferenceMethod: weekAnalysis.method,
      
      // Session details
      category: nameAnalysis.components?.sessionType || 'MISC',
      hostEmail: recording.host_email,
      hostName: recording.host_name,
      participants: nameAnalysis.components ? 
        `${nameAnalysis.components.coach}, ${nameAnalysis.components.student}` : '',
      participantCount: recording.participant_count,
      meetingId: recording.meeting_id,
      duration: Math.round(recording.duration / 60),
      startTime: recording.start_time,
      endTime: recording.end_time,
      
      // File information
      recordingType: recording.recording_type,
      fileSize: recording.file_size,
      hasTranscript: !!files.transcript,
      
      // AI Insights (if available)
      ...(aiInsights ? {
        keyThemes: (aiInsights.combinedInsights?.keyThemes || []).join(', '),
        actionItems: JSON.stringify(aiInsights.combinedInsights?.actionItems || []),
        challengesIdentified: (aiInsights.combinedInsights?.challenges || []).join(', '),
        breakthroughs: (aiInsights.combinedInsights?.breakthroughs || []).join(', '),
        nextSteps: (aiInsights.combinedInsights?.recommendations?.immediate || []).join(', ')
      } : {}),
      
      // Outcomes
      goalsSet: outcomes.filter(o => o.type === 'goal').map(o => o.description).join(', '),
      progressTracked: outcomes.filter(o => o.type === 'progress').map(o => o.description).join(', '),
      
      // Drive organization
      driveFolder: nameAnalysis.standardizedName,
      driveFolderId: driveResult.folderId || recording.drive_folder_id,
      driveLink: driveResult.driveLink || `https://drive.google.com/drive/folders/${recording.drive_folder_id}`,
      
      // Processing metadata
      processedDate: new Date().toISOString(),
      processingVersion: '3.0-simplified',
      dataSource: 'Google Drive Import',
      lastUpdated: new Date().toISOString()
    };

    return processedData;
  }

  generateFingerprint(recording) {
    const parts = [
      recording.drive_folder_name || '',
      recording.start_time,
      recording.file_size
    ];

    const hash = crypto.createHash('sha256');
    hash.update(parts.join('|'));
    return hash.digest('hex').substring(0, 16);
  }

  generateProcessingReport(results) {
    console.log('\n' + '='.repeat(50));
    console.log('📊 DRIVE PROCESSING REPORT');
    console.log('='.repeat(50));
    console.log(`Total sessions: ${results.successful.length + results.failed.length + results.skipped.length}`);
    console.log(`✅ Successful: ${results.successful.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    console.log(`⏭️  Skipped: ${results.skipped.length}`);

    if (results.successful.length > 0) {
      console.log('\nSuccessfully processed:');
      results.successful.forEach(session => {
        const sessionName = session.standardizedName || session.rawName || session.topic || 'Unknown';
        console.log(`  ✓ ${sessionName}`);
        console.log(`    - Week: ${session.weekNumber}`);
        console.log(`    - Drive: ${session.driveLink || 'Not organized'}`);
      });
    }

    if (results.failed.length > 0) {
      console.log('\nFailed sessions:');
      results.failed.forEach(({ session, error }) => {
        console.log(`  ✗ ${session.metadata?.folderName || session.id}: ${error}`);
      });
    }
  }
}

module.exports = IntegratedDriveProcessorV3;