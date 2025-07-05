const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class IntegratedDriveProcessor {
  constructor(config) {
    this.config = config;
    this.drive = google.drive({ version: 'v3', auth: this.getAuthClient() });
    
    // Services will be injected or created as needed
    this.dualTabGoogleSheetsService = null;
    this.completeSmartNameStandardizer = null;
    this.knowledgeBaseService = null;
    this.driveOrganizer = null;
    
    this.processedRecordings = new Map();
    this.logger = console; // Simple logger for now
    
    // Try to get services from container if available
    try {
      const { getContainer } = require('../../container');
      const container = getContainer();
      this.dualTabGoogleSheetsService = container.resolve('googleSheetsService');
      this.completeSmartNameStandardizer = container.resolve('completeSmartNameStandardizer');
      this.knowledgeBaseService = container.resolve('knowledgeBaseService');
    } catch (error) {
      // Container not available, will create services directly
      console.log('Container not available, will create services directly when needed');
    }
  }

  getAuthClient() {
    return new google.auth.JWT(
      this.config.google.clientEmail,
      null,
      this.config.google.privateKey,
      ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
    );
  }

  async initialize() {
    // Create services directly if not available from container
    if (!this.completeSmartNameStandardizer) {
      try {
        const { CompleteSmartNameStandardizer } = require('../../infrastructure/services/CompleteSmartNameStandardizer');
        this.completeSmartNameStandardizer = new CompleteSmartNameStandardizer();
        console.log('Created CompleteSmartNameStandardizer directly');
      } catch (error) {
        console.error('Failed to create CompleteSmartNameStandardizer:', error.message);
      }
    }
    
    if (!this.dualTabGoogleSheetsService) {
      try {
        const { DualTabGoogleSheetsService } = require('../../infrastructure/services/DualTabGoogleSheetsService');
        const { EventBus } = require('../../shared/EventBus');
        const { Logger } = require('../../shared/Logger');
        const { Cache } = require('../../shared/Cache');
        const { MetricsCollector } = require('../../shared/MetricsCollector');
        
        // Create additional services that might be needed
        let weekInferencer = null;
        let metadataExtractor = null;
        let transcriptionAnalyzer = null;
        
        try {
          const { SmartWeekInferencer } = require('../../infrastructure/services/SmartWeekInferencer');
          weekInferencer = new SmartWeekInferencer();
        } catch (error) {
          console.log('SmartWeekInferencer not available');
        }
        
        try {
          const { EnhancedMetadataExtractor } = require('../../infrastructure/services/EnhancedMetadataExtractor');
          metadataExtractor = new EnhancedMetadataExtractor();
        } catch (error) {
          console.log('EnhancedMetadataExtractor not available');
        }
        
        try {
          const { TranscriptionAnalyzer } = require('../../infrastructure/services/TranscriptionAnalyzer');
          transcriptionAnalyzer = new TranscriptionAnalyzer();
        } catch (error) {
          console.log('TranscriptionAnalyzer not available');
        }
        
        // Create the real DualTabGoogleSheetsService with all dependencies
        this.dualTabGoogleSheetsService = new DualTabGoogleSheetsService({
          config: this.config,
          eventBus: new EventBus(),
          logger: new Logger('DualTabGoogleSheetsService'),
          cache: new Cache(),
          metricsCollector: new MetricsCollector(),
          nameStandardizer: this.completeSmartNameStandardizer,
          weekInferencer: weekInferencer,
          metadataExtractor: metadataExtractor,
          transcriptionAnalyzer: transcriptionAnalyzer
        });
        
        console.log('Created real DualTabGoogleSheetsService');
      } catch (error) {
        console.error('Failed to create DualTabGoogleSheetsService:', error.message);
      }
    }
    
    // Initialize DriveOrganizer if available
    try {
      const DriveOrganizer = require('../../infrastructure/services/DriveOrganizer');
      const googleDriveService = this.container?.resolve('googleDriveService') || null;
      if (googleDriveService) {
        this.driveOrganizer = new DriveOrganizer({
          logger: this.logger,
          config: this.config,
          googleDriveService,
          knowledgeBaseService: this.knowledgeBaseService
        });
      }
    } catch (error) {
      this.logger.warn('DriveOrganizer not available, will skip drive organization');
    }
  }

  async processRecordingSessions(sessions) {
    console.log(`\nProcessing ${sessions.length} recording sessions with integrated services...`);
    
    const results = {
      successful: [],
      failed: [],
      skipped: []
    };

    // Initialize services
    await this.initialize();

    for (const [index, session] of sessions.entries()) {
      console.log(`\nProcessing session ${index + 1}/${sessions.length} (ID: ${session.id})`);
      
      try {
        // Check for duplicates using the fingerprint
        const fingerprint = this.generateFingerprint(session);
        
        // Check if recording already exists
        let isDuplicate = false;
        if (this.dualTabGoogleSheetsService && typeof this.dualTabGoogleSheetsService.checkRecordingExists === 'function') {
          const existingCheck = await this.dualTabGoogleSheetsService.checkRecordingExists(session.id);
          isDuplicate = existingCheck.exists;
        }
        
        if (isDuplicate) {
          console.log(`Skipping duplicate session: ${session.id}`);
          results.skipped.push({ session, reason: 'Duplicate' });
          continue;
        }

        const processedSession = await this.processSession(session);
        results.successful.push(processedSession);
        
        console.log(`✓ Successfully processed session ${session.id}`);
      } catch (error) {
        console.error(`✗ Failed to process session ${session.id}:`, error.message);
        results.failed.push({ session, error: error.message });
      }
    }

    this.generateProcessingReport(results);
    return results;
  }

  async processSession(session) {
    // Extract meaningful metadata from the session
    const extractedMetadata = this.extractSessionMetadata(session);
    
    // Build the original recording object (Zoom-compatible schema)
    const recording = {
      // Use session.id as is - don't try to convert it
      uuid: session.id,
      id: session.id,
      meeting_id: session.id, // Use same ID for meeting_id
      topic: extractedMetadata.topic,
      start_time: extractedMetadata.startTime,
      duration: extractedMetadata.duration, // In seconds
      end_time: extractedMetadata.endTime,
      host_email: extractedMetadata.hostEmail,
      host_name: extractedMetadata.hostName,
      participant_count: extractedMetadata.participantCount,
      recording_type: 'cloud_recording',
      file_size: session.files ? session.files.reduce((t, f) => t + (parseInt(f.size) || 0), 0) : 0,
      download_url: session.files && session.files[0] ? `https://drive.google.com/file/d/${session.files[0].id}/view` : '',
      created_at: session.files && session.files[0] ? session.files[0].createdTime : new Date().toISOString(),
      // Additional fields for compatibility
      recording_files: this.convertFilesToRecordingFiles(session, extractedMetadata.startTime)
    };

    // Build the processed recording object with enhanced metadata
    const processedRecording = {
      processed: {
        uuid: recording.uuid,
        fingerprint: this.generateFingerprint(session),
        recordingDate: recording.start_time.split('T')[0],
        rawName: recording.topic,
        standardizedName: '', // Will be filled by name standardizer
        nameConfidence: 0,
        nameResolutionMethod: '',
        familyAccount: 'No',
        weekNumber: extractedMetadata.weekNumber || '',
        weekConfidence: extractedMetadata.weekConfidence || 0,
        weekInferenceMethod: extractedMetadata.weekMethod || '',
        category: session.category || 'MISC',
        categoryReason: '',
        hostEmail: recording.host_email,
        hostName: recording.host_name,
        meetingTopic: recording.topic,
        participants: extractedMetadata.participants.join(', '),
        participantCount: recording.participant_count,
        meetingId: recording.meeting_id,
        duration: Math.round((recording.duration || 0) / 60), // Convert to minutes
        startTime: recording.start_time,
        endTime: recording.end_time,
        recordingType: recording.recording_type,
        fileSize: recording.file_size,
        hasTranscript: extractedMetadata.hasTranscript,
        transcriptQuality: '',
        speakerCount: '',
        primarySpeaker: '',
        speakingTimeDistribution: '{}',
        emotionalJourney: '[]',
        engagementScore: 0,
        keyMoments: '[]',
        coachingTopics: '',
        coachingStyle: '',
        studentResponsePattern: '',
        interactionQuality: '',
        keyThemes: '',
        actionItems: '[]',
        challengesIdentified: '',
        breakthroughs: '',
        goalsSet: '',
        progressTracked: '',
        nextSteps: '',
        followUpRequired: '',
        driveFolder: session.metadata?.folderName || '',
        driveFolderId: session.files?.[0]?.parentFolderId || '',
        driveLink: `https://drive.google.com/drive/folders/${session.files?.[0]?.parentFolderId || ''}`,
        videoFileId: session.files?.find(f => f.fileType === 'video')?.id || '',
        transcriptFileId: session.files?.find(f => f.fileType === 'transcript')?.id || '',
        processedDate: new Date().toISOString(),
        processingVersion: '2.0-smart',
        dataSource: 'Google Drive Import',
        lastUpdated: new Date().toISOString()
      },
      original: recording
    };

    // Run name standardization if available
    if (this.completeSmartNameStandardizer && typeof this.completeSmartNameStandardizer.standardizeName === 'function') {
      try {
        // Pass the topic with week info if available
        const topicWithWeek = extractedMetadata.weekNumber 
          ? `${recording.topic} Week ${extractedMetadata.weekNumber}`
          : recording.topic;
          
        const nameAnalysis = await this.completeSmartNameStandardizer.standardizeName(topicWithWeek, {
          participants: extractedMetadata.participants,
          date: recording.start_time,
          context: 'drive_import',
          weekNumber: extractedMetadata.weekNumber
        });
        
        // If standardization didn't include week, build it manually
        let standardizedName = nameAnalysis.standardized || nameAnalysis.standardizedName || recording.topic;
        
        // Ensure week number is in the standardized name
        if (extractedMetadata.weekNumber && !standardizedName.includes(`Wk${extractedMetadata.weekNumber}`)) {
          // Extract parts from standardized name
          const parts = standardizedName.match(/^(Coaching|GamePlan|SAT|MISC|TRIVIAL)_([^_]+)_([^_]+)(?:_Wk\w+)?_(.+)$/);
          if (parts) {
            const [, sessionType, coach, student, date] = parts;
            standardizedName = `${sessionType}_${coach}_${student}_Wk${extractedMetadata.weekNumber.padStart(2, '0')}_${date}`;
          }
        }
        
        processedRecording.processed.standardizedName = standardizedName;
        processedRecording.processed.nameConfidence = nameAnalysis.confidence || 0;
        processedRecording.processed.nameResolutionMethod = nameAnalysis.method || '';
      } catch (error) {
        console.error('Name standardization failed:', error.message);
        processedRecording.processed.standardizedName = recording.topic;
      }
    } else {
      // No standardizer available, use topic as is
      processedRecording.processed.standardizedName = recording.topic;
    }

    // Update both Raw and Standardized tabs using DualTabGoogleSheetsService
    await this.dualTabGoogleSheetsService.updateMasterSpreadsheet(
      processedRecording,
      'Google Drive Import'
    );

    return processedRecording.processed;
  }

  extractSessionMetadata(session) {
    const metadata = {
      topic: 'Unknown Session',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: 3600, // Default 1 hour in seconds
      hostEmail: 'drive-import@example.com',
      hostName: 'Drive Import',
      participants: [],
      participantCount: 0,
      weekNumber: '',
      weekConfidence: 0,
      weekMethod: '',
      hasTranscript: false
    };

    // Extract from folder name if available
    if (session.metadata?.folderName) {
      const folderName = session.metadata.folderName;
      
      // Pattern: Coaching_Andrew_Rayaan_Wk08_2024-06-19_[ID]
      // Also handle variations like "Coaching_Jenny Duan_Arshiya_Wk02_2024-09-29_..."
      const standardizedPattern = /^(Coaching|GamePlan|SAT|MISC|TRIVIAL)_([^_]+(?:\s+[^_]+)?)_([^_]+)_Wk(\d+)_(\d{4}-\d{2}-\d{2})/;
      const match = folderName.match(standardizedPattern);
      
      if (match) {
        const [, sessionType, coach, student, week, date] = match;
        metadata.topic = `${coach} & ${student}`;
        metadata.participants = [coach, student];
        metadata.hostName = coach;
        metadata.hostEmail = `${coach.toLowerCase().replace(/\s+/g, '')}@ivymentors.co`;
        metadata.weekNumber = week;
        metadata.weekConfidence = 100;
        metadata.weekMethod = 'folder_name_pattern';
        
        // Parse date
        try {
          const parsedDate = new Date(date);
          metadata.startTime = parsedDate.toISOString();
          const endDate = new Date(parsedDate.getTime() + metadata.duration * 1000);
          metadata.endTime = endDate.toISOString();
        } catch (e) {
          console.error('Failed to parse date from folder name:', e);
        }
      } else {
        // Try other patterns
        const ivylevelPattern = /S(\d+)-Ivylevel-([^-]+)-Session/i;
        const ivylevelMatch = folderName.match(ivylevelPattern);
        
        if (ivylevelMatch) {
          const [, studentId, coachName] = ivylevelMatch;
          metadata.topic = `${coachName} & Student${studentId}`;
          metadata.participants = [coachName, `Student${studentId}`];
          metadata.hostName = coachName;
          metadata.hostEmail = `${coachName.toLowerCase()}@ivymentors.co`;
        } else {
          // Use folder name as topic
          metadata.topic = folderName;
        }
      }
    }

    // Extract date from files if not found in folder name
    if (metadata.startTime === new Date().toISOString() && session.files?.length > 0) {
      // Try to extract from file names
      const datePattern = /(\d{4}[-_]?\d{1,2}[-_]?\d{1,2})/;
      for (const file of session.files) {
        const match = file.name.match(datePattern);
        if (match) {
          const dateStr = match[1].replace(/[_]/g, '-');
          try {
            const parsedDate = new Date(dateStr);
            metadata.startTime = parsedDate.toISOString();
            const endDate = new Date(parsedDate.getTime() + metadata.duration * 1000);
            metadata.endTime = endDate.toISOString();
            break;
          } catch (e) {
            continue;
          }
        }
      }
      
      // Use file creation time as fallback
      if (metadata.startTime === new Date().toISOString() && session.files[0].createdTime) {
        metadata.startTime = session.files[0].createdTime;
        const endDate = new Date(new Date(metadata.startTime).getTime() + metadata.duration * 1000);
        metadata.endTime = endDate.toISOString();
      }
    }

    // Extract participants from metadata if available
    if (session.metadata?.participants && Array.isArray(session.metadata.participants)) {
      // Filter out invalid participants (like folder ID parts)
      const validParticipants = session.metadata.participants.filter(p => 
        p && p.length > 2 && !/^[A-Z][a-z]$/.test(p) && !['Wk', 'It', 'Fk', 'Fg', 'Oi', 'Ww'].includes(p)
      );
      
      if (validParticipants.length > 0) {
        metadata.participants = validParticipants;
        metadata.participantCount = validParticipants.length;
        
        // Try to identify coach
        const coachPatterns = ['Coach', 'Andrew', 'Jenny', 'Alan', 'Juli'];
        const coach = validParticipants.find(p => 
          coachPatterns.some(pattern => p.toLowerCase().includes(pattern.toLowerCase()))
        );
        
        if (coach) {
          metadata.hostName = coach;
          metadata.hostEmail = `${coach.toLowerCase()}@ivymentors.co`;
        }
      }
    }

    // Set participant count
    metadata.participantCount = metadata.participants.length || 1;

    // Check for transcript
    metadata.hasTranscript = session.files?.some(f => 
      f.fileType === 'transcript' || f.name.toLowerCase().includes('.vtt') || f.name.toLowerCase().includes('.srt')
    ) || false;

    // Extract week from metadata if available (as fallback)
    if (session.metadata?.week && !metadata.weekNumber) {
      metadata.weekNumber = session.metadata.week.number?.toString() || '';
      metadata.weekConfidence = 80;
      metadata.weekMethod = 'metadata_extraction';
    }
    
    // Debug logging
    console.log(`Extracted metadata for ${folderName}:`, {
      weekNumber: metadata.weekNumber,
      weekMethod: metadata.weekMethod,
      participants: metadata.participants
    });

    // Extract duration if available
    if (session.metadata?.duration) {
      metadata.duration = session.metadata.duration * 60; // Convert minutes to seconds
    }

    return metadata;
  }

  convertSessionToRecording(session) {
    // Convert the drive session format to the standard recording format
    const recording = {
      uuid: session.id,
      id: parseInt(session.id.replace(/\D/g, '').slice(0, 10)) || Date.now(), // Extract numeric ID or use timestamp
      account_id: this.config.zoom?.accountId || 'drive-import',
      host_id: 'drive-import',
      topic: this.extractTopic(session),
      start_time: this.extractStartTime(session),
      duration: this.extractDuration(session),
      total_size: this.calculateTotalSize(session),
      type: 'cloud_recording',
      recording_count: session.files?.length || 0,
      host_email: this.extractHostEmail(session),
      
      // Additional fields for compatibility
      share_url: '',
      recording_files: this.convertFilesToRecordingFiles(session)
    };

    return recording;
  }

  extractTopic(session) {
    // Try to extract topic from folder name or file names
    if (session.folderName) {
      return session.folderName;
    }
    
    if (session.files && session.files.length > 0) {
      // Use the most common name pattern
      const names = session.files.map(f => f.name.replace(/\.[^.]+$/, ''));
      const commonName = this.findCommonPrefix(names);
      if (commonName) return commonName;
    }
    
    return 'Unknown Session';
  }

  extractStartTime(session) {
    if (session.metadata?.date?.raw) {
      try {
        return new Date(session.metadata.date.raw).toISOString();
      } catch (e) {
        // Fall through to other methods
      }
    }
    
    // Try to extract from file names
    const datePattern = /(\d{4}[-_]?\d{1,2}[-_]?\d{1,2})/;
    for (const file of (session.files || [])) {
      const match = file.name.match(datePattern);
      if (match) {
        const dateStr = match[1].replace(/[_]/g, '-');
        try {
          return new Date(dateStr).toISOString();
        } catch (e) {
          continue;
        }
      }
    }
    
    // Use file creation time as fallback
    if (session.files && session.files.length > 0 && session.files[0].createdTime) {
      return session.files[0].createdTime;
    }
    
    return new Date().toISOString();
  }

  extractDuration(session) {
    // Try to get duration from transcript analysis
    if (session.transcriptAnalysis?.duration) {
      return session.transcriptAnalysis.duration * 60; // Convert minutes to seconds
    }
    
    // Try to extract from file names (e.g., "60min")
    const durationPattern = /(\d+)\s*min/i;
    for (const file of (session.files || [])) {
      const match = file.name.match(durationPattern);
      if (match) {
        return parseInt(match[1]) * 60; // Convert to seconds
      }
    }
    
    // Default to 60 minutes
    return 3600;
  }

  calculateTotalSize(session) {
    if (!session.files) return 0;
    return session.files.reduce((total, file) => total + (parseInt(file.size) || 0), 0);
  }

  extractHostEmail(session) {
    // Try to extract from metadata
    if (session.metadata?.participants && session.metadata.participants.length > 0) {
      // Look for coach/host in participants
      for (const participant of session.metadata.participants) {
        if (this.isCoach(participant)) {
          return `${participant.toLowerCase().replace(/\s+/g, '.')}@example.com`;
        }
      }
    }
    
    return 'drive-import@example.com';
  }

  extractParticipantEmails(session) {
    const emails = [];
    if (session.metadata?.participants) {
      for (const participant of session.metadata.participants) {
        emails.push(`${participant.toLowerCase().replace(/\s+/g, '.')}@example.com`);
      }
    }
    return emails;
  }

  convertFilesToRecordingFiles(session, startTime) {
    if (!session.files) return [];
    
    const endTime = new Date(new Date(startTime).getTime() + 3600000).toISOString(); // Default 1 hour later
    
    return session.files.map(file => ({
      id: file.id,
      meeting_id: session.id,
      recording_start: startTime,
      recording_end: endTime,
      file_type: this.mapFileType(file.fileType || this.detectFileType(file.name)),
      file_size: parseInt(file.size) || 0,
      file_extension: path.extname(file.name).toLowerCase().replace('.', ''),
      download_url: `https://drive.google.com/file/d/${file.id}/view`,
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

  async mapSessionFiles(session) {
    const files = {};
    
    if (session.files) {
      for (const file of session.files) {
        const fileType = file.fileType || this.detectFileType(file.name);
        // Map to the expected file structure
        files[fileType] = {
          id: file.id,
          name: file.name,
          path: `https://drive.google.com/file/d/${file.id}/view`,
          size: file.size
        };
      }
    }
    
    return files;
  }

  findCommonPrefix(strings) {
    if (!strings || strings.length === 0) return '';
    if (strings.length === 1) return strings[0];
    
    let prefix = strings[0];
    for (let i = 1; i < strings.length; i++) {
      while (strings[i].indexOf(prefix) !== 0) {
        prefix = prefix.substring(0, prefix.length - 1);
        if (prefix === '') return '';
      }
    }
    return prefix.trim();
  }

  generateFingerprint(session) {
    const parts = [];
    
    // Use folder name as primary identifier
    if (session.metadata?.folderName) {
      parts.push(session.metadata.folderName);
    }
    
    // Add file sizes for uniqueness
    if (session.files && session.files.length > 0) {
      const fileSizes = session.files.map(f => f.size || '0').sort().join('-');
      parts.push(fileSizes);
    }
    
    // Add session ID
    parts.push(session.id);

    const hash = crypto.createHash('sha256');
    hash.update(parts.join('|'));
    return hash.digest('hex').substring(0, 16);
  }

  isCoach(name) {
    const coachPatterns = [
      /coach/i,
      /mentor/i,
      /instructor/i,
      /teacher/i,
      /jenny/i,
      /andrew/i,
      /alan/i,
      /juli/i
    ];
    
    return coachPatterns.some(pattern => pattern.test(name));
  }


  generateProcessingReport(results) {
    console.log('\n=== Processing Report ===\n');
    console.log(`Total sessions: ${results.successful.length + results.failed.length + results.skipped.length}`);
    console.log(`✓ Successful: ${results.successful.length}`);
    console.log(`✗ Failed: ${results.failed.length}`);
    console.log(`⊘ Skipped: ${results.skipped.length}`);

    if (results.failed.length > 0) {
      console.log('\nFailed sessions:');
      results.failed.forEach(({ session, error }) => {
        console.log(`- ${session.id}: ${error}`);
      });
    }

    if (results.skipped.length > 0) {
      console.log('\nSkipped sessions:');
      results.skipped.forEach(({ session, reason }) => {
        console.log(`- ${session.id}: ${reason}`);
      });
    }

    if (results.successful.length > 0) {
      console.log('\nSuccessfully processed sessions:');
      results.successful.forEach(processed => {
        if (!processed) {
          console.log('- (Invalid session data)');
          return;
        }
        const name = processed.standardizedName || processed.rawName || processed.topic || 'Unknown';
        const uuid = processed.uuid || 'No UUID';
        console.log(`- ${name} (UUID: ${uuid})`);
      });
    }
  }
}

module.exports = IntegratedDriveProcessor;