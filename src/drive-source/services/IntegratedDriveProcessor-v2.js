/**
 * Integrated Drive Processor v2
 * Processes Drive recordings through the complete smart pipeline
 * Includes AI insights, outcomes processing, and drive organization
 */

const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class IntegratedDriveProcessorV2 {
  constructor(config) {
    this.config = config;
    this.drive = google.drive({ version: 'v3', auth: this.getAuthClient() });
    
    // Services will be injected from container
    this.container = null;
    this.logger = console;
    
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

  async initialize() {
    try {
      // Get container with all services
      const { getContainer } = require('../../container');
      this.container = getContainer();
      
      // Get all required services
      this.dualTabGoogleSheetsService = this.container.resolve('googleSheetsService');
      this.completeSmartNameStandardizer = this.container.resolve('completeSmartNameStandardizer');
      this.smartWeekInferencer = this.container.resolve('smartWeekInferencer');
      this.insightsGenerator = this.container.resolve('insightsGenerator');
      this.outcomesProcessor = this.container.resolve('outcomesProcessor');
      this.driveOrganizer = this.container.resolve('driveOrganizer');
      this.googleDriveService = this.container.resolve('googleDriveService');
      this.aiPoweredInsightsGenerator = this.container.resolve('aiPoweredInsightsGenerator');
      
      console.log('✅ IntegratedDriveProcessorV2 initialized with all smart services');
    } catch (error) {
      console.error('Failed to initialize services:', error.message);
      throw error;
    }
  }

  async processRecordingSessions(sessions) {
    console.log(`\n🚀 Processing ${sessions.length} Drive recording sessions through SMART pipeline...`);
    
    const results = {
      successful: [],
      failed: [],
      skipped: []
    };

    // Initialize services
    await this.initialize();

    // Group sessions by folder to handle duplicates
    const sessionsByFolder = this.groupSessionsByFolder(sessions);
    
    for (const [folderId, folderSessions] of sessionsByFolder.entries()) {
      console.log(`\n📁 Processing folder: ${folderSessions[0].metadata?.folderName || folderId}`);
      
      // Pick the best quality video from the folder
      const session = this.selectBestSession(folderSessions);
      
      try {
        // Check for duplicates
        const existingCheck = await this.dualTabGoogleSheetsService.checkRecordingExists(session.id);
        if (existingCheck.exists) {
          console.log(`⏭️  Skipping duplicate: ${session.id}`);
          results.skipped.push({ session, reason: 'Already processed' });
          continue;
        }

        // Process through full smart pipeline
        const processedSession = await this.processSessionThroughSmartPipeline(session);
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

  async processSessionThroughSmartPipeline(session) {
    console.log(`\n🔄 Processing session ${session.id} through smart pipeline...`);
    
    // Step 1: Extract metadata and build recording object
    const extractedMetadata = this.extractSessionMetadata(session);
    const recording = this.buildRecordingObject(session, extractedMetadata);
    
    // Step 2: Smart Name Standardization
    console.log('📝 Running smart name standardization...');
    const nameAnalysis = await this.completeSmartNameStandardizer.standardizeName(
      extractedMetadata.topic,
      {
        participants: extractedMetadata.participants,
        date: recording.start_time,
        weekNumber: extractedMetadata.weekNumber
      }
    );
    
    // Step 3: Smart Week Inference
    console.log('📅 Running smart week inference...');
    const weekAnalysis = await this.smartWeekInferencer.inferWeek(recording, {
      folderName: session.metadata?.folderName,
      existingWeek: extractedMetadata.weekNumber
    });
    
    // Step 4: Download/prepare files for processing
    console.log('📥 Preparing files for processing...');
    const files = await this.prepareFilesForProcessing(session);
    
    // Step 5: Generate AI Insights
    console.log('🤖 Generating AI insights...');
    const aiInsights = await this.generateAIInsights(recording, files, nameAnalysis, weekAnalysis);
    
    // Step 6: Process Tangible Outcomes
    console.log('🎯 Processing tangible outcomes...');
    const outcomes = await this.outcomesProcessor.processOutcomes({
      recording,
      insights: aiInsights,
      transcript: files.transcript
    });
    
    // Step 7: Generate Additional Files
    console.log('📄 Generating additional files...');
    await this.generateAdditionalFiles(files, aiInsights, outcomes, nameAnalysis);
    
    // Step 8: Organize in Google Drive
    console.log('📁 Organizing in Google Drive...');
    const driveResult = await this.organizeInDrive(recording, files, nameAnalysis, weekAnalysis);
    
    // Step 9: Update Google Sheets
    console.log('📊 Updating Google Sheets...');
    const processedData = this.buildProcessedData(
      recording, 
      nameAnalysis, 
      weekAnalysis, 
      aiInsights, 
      outcomes, 
      files, 
      driveResult
    );
    
    await this.dualTabGoogleSheetsService.updateMasterSpreadsheet({
      processed: processedData,
      original: recording
    }, 'Google Drive Import');
    
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
      
      // Pattern: Coaching_Jenny Duan_Arshiya_Wk02_2024-09-29_[ID]
      const patterns = [
        // With spaces in coach name
        /^(Coaching|GamePlan|SAT|MISC|TRIVIAL)_([^_]+(?:\s+[^_]+)*)_([^_]+)_Wk(\d+)_(\d{4}-\d{2}-\d{2})/,
        // Without spaces
        /^(Coaching|GamePlan|SAT|MISC|TRIVIAL)_([^_]+)_([^_]+)_Wk(\d+)_(\d{4}-\d{2}-\d{2})/
      ];
      
      for (const pattern of patterns) {
        const match = folderName.match(pattern);
        if (match) {
          const [, sessionType, coach, student, week, date] = match;
          metadata.sessionType = sessionType;
          metadata.topic = `${coach} & ${student}`;
          metadata.participants = [coach.trim(), student.trim()];
          metadata.hostName = coach.trim();
          metadata.hostEmail = `${coach.trim().toLowerCase().replace(/\s+/g, '')}@ivymentors.co`;
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

  async prepareFilesForProcessing(session) {
    const files = {
      video: null,
      audio: null,
      transcript: null,
      chat: null
    };

    // Map session files to processing files
    for (const file of (session.files || [])) {
      const fileType = file.fileType || this.detectFileType(file.name);
      if (files[fileType] === null || parseInt(file.size) > parseInt(files[fileType]?.size || 0)) {
        files[fileType] = {
          id: file.id,
          path: file.webViewLink,
          name: file.name,
          size: file.size
        };
      }
    }

    return files;
  }

  async generateAIInsights(recording, files, nameAnalysis, weekAnalysis) {
    try {
      if (!this.aiPoweredInsightsGenerator) {
        console.log('⚠️  AI insights generator not available');
        return null;
      }

      const insights = await this.aiPoweredInsightsGenerator.generateInsights(
        recording,
        {
          ...files,
          nameAnalysis,
          weekAnalysis
        }
      );

      return insights;
    } catch (error) {
      console.error('Failed to generate AI insights:', error.message);
      return null;
    }
  }

  async generateAdditionalFiles(files, aiInsights, outcomes, nameAnalysis) {
    // Add insights summary
    if (aiInsights) {
      files.insights = {
        content: JSON.stringify(aiInsights, null, 2),
        name: 'insights.json'
      };

      // Generate markdown summary
      files.summary = {
        content: this.generateMarkdownSummary(aiInsights, outcomes, nameAnalysis),
        name: 'summary.md'
      };
    }

    // Add outcomes
    if (outcomes && outcomes.length > 0) {
      files.outcomes = {
        content: JSON.stringify(outcomes, null, 2),
        name: 'outcomes.json'
      };

      // Generate action items
      const actionItems = outcomes.filter(o => o.type === 'action_item');
      if (actionItems.length > 0) {
        files.action_items = {
          content: this.generateActionItemsMarkdown(actionItems),
          name: 'action_items.md'
        };
      }
    }

    return files;
  }

  generateMarkdownSummary(insights, outcomes, nameAnalysis) {
    const lines = [
      `# ${nameAnalysis.standardizedName}`,
      '',
      `**Date:** ${new Date().toLocaleDateString()}`,
      `**Participants:** ${nameAnalysis.components?.coach || 'Unknown'} & ${nameAnalysis.components?.student || 'Unknown'}`,
      `**Week:** ${nameAnalysis.components?.week || 'Unknown'}`,
      '',
      '## Session Overview',
      insights?.combinedInsights?.overview?.summary || 'No summary available',
      '',
      '## Key Insights',
      ...(insights?.combinedInsights?.keyInsights || ['No insights available']).map(i => `- ${i}`),
      '',
      '## Action Items',
      ...(outcomes?.filter(o => o.type === 'action_item').map(o => `- ${o.description}`) || ['No action items']),
      '',
      '## Next Steps',
      ...(insights?.combinedInsights?.recommendations?.immediate || ['No recommendations']).map(r => `- ${r}`)
    ];

    return lines.join('\n');
  }

  generateActionItemsMarkdown(actionItems) {
    const lines = [
      '# Action Items',
      '',
      ...actionItems.map((item, i) => [
        `## ${i + 1}. ${item.description}`,
        `**Priority:** ${item.priority || 'Medium'}`,
        `**Deadline:** ${item.deadline || 'Not specified'}`,
        `**Status:** ${item.status || 'Pending'}`,
        ''
      ]).flat()
    ];

    return lines.join('\n');
  }

  async organizeInDrive(recording, files, nameAnalysis, weekAnalysis) {
    try {
      if (!this.driveOrganizer) {
        console.log('⚠️  Drive organizer not available');
        return { folderId: '', driveLink: '' };
      }

      // Organize recording with all files
      const result = await this.driveOrganizer.organizeRecording(
        recording,
        files,
        {
          nameAnalysis,
          weekAnalysis,
          category: nameAnalysis.components?.sessionType || 'MISC'
        }
      );

      return result;
    } catch (error) {
      console.error('Failed to organize in Drive:', error.message);
      return { folderId: '', driveLink: '' };
    }
  }

  buildProcessedData(recording, nameAnalysis, weekAnalysis, aiInsights, outcomes, files, driveResult) {
    const processedData = {
      // Core identifiers
      uuid: recording.uuid,
      fingerprint: this.generateFingerprint(recording),
      recordingDate: recording.start_time.split('T')[0],
      
      // Name and standardization
      rawName: recording.topic,
      standardizedName: nameAnalysis.standardizedName,
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
      processingVersion: '2.0-smart',
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
        console.log(`  ✓ ${session.standardizedName}`);
        console.log(`    - Week: ${session.weekNumber}`);
        console.log(`    - AI Insights: ${session.keyThemes ? 'Yes' : 'No'}`);
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

module.exports = IntegratedDriveProcessorV2;