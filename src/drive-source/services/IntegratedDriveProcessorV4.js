/**
 * Integrated Drive Processor v4
 * Fully integrated with the main processing pipeline
 * Uses the exact same flow as complete-production-processor.js
 */

const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const ProgramCycleDetector = require('./ProgramCycleDetector');
const DriveFileHandler = require('./DriveFileHandler');

class IntegratedDriveProcessorV4 {
  constructor(config, services = {}) {
    this.config = config;
    this.drive = google.drive({ version: 'v3', auth: this.getAuthClient() });
    
    // All services from the main pipeline
    this.services = services;
    
    // Core services
    this.dualTabGoogleSheetsService = services.googleSheetsService;
    this.completeSmartNameStandardizer = services.completeSmartNameStandardizer || services.nameStandardizer;
    this.smartWeekInferencer = services.smartWeekInferencer || services.weekInferencer;
    this.logger = services.logger || console;
    
    // AI and processing services
    this.aiPoweredInsightsGenerator = services.aiPoweredInsightsGenerator || services.aiService;
    this.outcomeExtractor = services.outcomeExtractor || services.outcomesProcessor;
    this.driveOrganizer = services.driveOrganizer;
    this.enhancedMetadataExtractor = services.enhancedMetadataExtractor || services.metadataExtractor;
    this.recordingCategorizer = services.recordingCategorizer;
    
    // Optional services
    this.insightsGenerator = services.insightsGenerator;
    this.relationshipAnalyzer = services.relationshipAnalyzer;
    this.fileContentAnalyzer = services.fileContentAnalyzer;
    this.transcriptionAnalyzer = services.transcriptionAnalyzer;
    
    // Track processed sessions
    this.processedSessions = new Map();
    
    // Initialize program cycle detector
    this.programCycleDetector = new ProgramCycleDetector();
    
    console.log('🔧 IntegratedDriveProcessorV4 initialized');
    console.log('  Core Services:');
    console.log(`    - Google Sheets: ${!!this.dualTabGoogleSheetsService}`);
    console.log(`    - Name Standardizer: ${!!this.completeSmartNameStandardizer}`);
    console.log(`    - Week Inferencer: ${!!this.smartWeekInferencer}`);
    console.log('  AI Services:');
    console.log(`    - AI Insights Generator: ${!!this.aiPoweredInsightsGenerator}`);
    console.log(`    - Outcome Extractor: ${!!this.outcomeExtractor}`);
    console.log(`    - Drive Organizer: ${!!this.driveOrganizer}`);
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
    console.log(`\n🚀 Processing ${sessions.length} Drive recording sessions through FULL pipeline...`);
    
    const results = {
      successful: [],
      failed: [],
      skipped: []
    };

    // Group sessions by folder to handle duplicates
    const sessionsByFolder = this.groupSessionsByFolder(sessions);
    const totalFolders = sessionsByFolder.size;
    let folderIndex = 0;
    
    for (const [folderId, folderSessions] of sessionsByFolder.entries()) {
      folderIndex++;
      console.log(`\n📁 Processing folder ${folderIndex}/${totalFolders}: ${folderSessions[0].metadata?.folderName || folderId}`);
      
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
          }
        }

        // Process through the FULL pipeline (same as complete-production-processor.js)
        const processedSession = await this.processRecording(session);
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

  /**
   * Main processing function - mirrors complete-production-processor.js
   */
  async processRecording(session) {
    console.log(`\n🔄 Processing session ${session.id} through FULL pipeline...`);
    
    try {
      // Step 1: Extract metadata and build recording object
      const extractedMetadata = this.extractSessionMetadata(session);
      const recording = this.buildRecordingObject(session, extractedMetadata);
      
      // Store session files reference on recording for later use
      recording._sessionFiles = session.files || [];
      
      // Step 2: Download/prepare files
      const files = await this.prepareFiles(session, recording);
      const transcriptContent = files.transcript?.content || '';
      const chatContent = files.chat?.content || '';
      
      // Step 3: Smart Name Standardization (using main pipeline service)
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
          const standardizedResult = await this.completeSmartNameStandardizer.standardizeName(
            recording.topic,
            {
              participants: extractedMetadata.participants,
              date: recording.start_time,
              weekNumber: extractedMetadata.weekNumber,
              hostEmail: recording.host_email,
              duration: recording.duration,
              dataSource: recording.dataSource
            }
          );
          
          // Merge the results, preserving the session type from folder metadata
          nameAnalysis = {
            ...standardizedResult,
            components: {
              ...standardizedResult.components,
              sessionType: extractedMetadata.sessionType || standardizedResult.components?.sessionType || 'Coaching'
            }
          };
          
          // Log the preserved session type
          if (extractedMetadata.sessionType) {
            console.log(`📋 Preserved session type from folder: ${extractedMetadata.sessionType}`);
          }
        } catch (error) {
          console.error('Name standardization failed:', error.message);
        }
      }
      
      // Step 4: Smart Week Inference
      let weekAnalysis = {
        weekNumber: extractedMetadata.weekNumber || '1',
        confidence: extractedMetadata.weekConfidence / 100 || 0.5,
        method: extractedMetadata.weekMethod || 'fallback'
      };
      
      // Use folder week if available with high confidence
      if (extractedMetadata.weekNumber !== null && extractedMetadata.weekNumber !== '') {
        weekAnalysis.weekNumber = extractedMetadata.weekNumber;
        weekAnalysis.confidence = 1.0;
        weekAnalysis.method = 'folder_name_exact';
      } else if (this.smartWeekInferencer) {
        console.log('📅 Running smart week inference...');
        try {
          weekAnalysis = await this.smartWeekInferencer.inferWeek({
            timestamp: recording.start_time,
            metadata: recording,
            recordingName: nameAnalysis.standardizedName,
            additionalContext: {
              folderName: session.metadata?.folderName,
              existingWeek: extractedMetadata.weekNumber,
              studentName: nameAnalysis.components?.student || '',
              coach: nameAnalysis.components?.coach || '',
              topic: recording.topic
            }
          });
        } catch (error) {
          console.error('Week inference failed:', error.message);
        }
      }
      
      // Step 5: Enhanced Metadata Extraction
      let enhancedMetadata = extractedMetadata;
      if (this.enhancedMetadataExtractor) {
        console.log('🔍 Extracting enhanced metadata...');
        try {
          enhancedMetadata = await this.enhancedMetadataExtractor.extractMetadata(recording);
        } catch (error) {
          console.error('Enhanced metadata extraction failed:', error.message);
        }
      }
      
      // Step 6: Generate AI-Powered Insights
      let aiInsights = {};
      if (this.aiPoweredInsightsGenerator) {
        if (transcriptContent) {
          console.log('🤖 Generating AI-powered insights...');
          console.log(`📄 Transcript length: ${transcriptContent.length} characters`);
          try {
            aiInsights = await this.aiPoweredInsightsGenerator.generateAIInsights(
              transcriptContent,
              {
                topic: recording.topic,
                start_time: recording.start_time,
                duration: Math.round((recording.duration || 0) / 60),
                host_email: recording.host_email,
                host_name: recording.host_name,
                participantCount: enhancedMetadata.participantCount || 2,
                coach: nameAnalysis.components?.coach || enhancedMetadata.hostName,
                student: nameAnalysis.components?.student || 'Unknown',
                weekNumber: weekAnalysis.weekNumber,
                forceRuleBased: false,
                meetingId: recording.id,
                uuid: recording.uuid
              }
            );
            console.log('✅ AI insights generated successfully');
            
            // Validate AI insights
            if (!DriveFileHandler.validateAIInsights(aiInsights)) {
              console.warn('⚠️  AI insights appear to be empty, using fallback');
              console.log(`   Validation details:`);
              console.log(`   - Has combinedInsights: ${!!aiInsights.combinedInsights}`);
              if (aiInsights.combinedInsights) {
                console.log(`   - Has executive summary: ${!!aiInsights.combinedInsights.executiveSummary}`);
                console.log(`   - Has key themes: ${aiInsights.combinedInsights.keyThemes?.length || 0}`);
                console.log(`   - Has action items: ${aiInsights.combinedInsights.actionItems?.length || 0}`);
                console.log(`   - Has main points: ${aiInsights.combinedInsights.mainDiscussionPoints?.length || 0}`);
              }
              aiInsights = this.generateFallbackInsights(recording, enhancedMetadata, transcriptContent);
            }
          } catch (error) {
            console.error('AI insights generation failed:', error.message);
            console.log(`   Error context:`);
            console.log(`   - Transcript length: ${transcriptContent?.length || 0} chars`);
            console.log(`   - Week number: ${weekAnalysis.weekNumber}`);
            console.log(`   - Participants: ${nameAnalysis.components?.coach} & ${nameAnalysis.components?.student}`);
            console.log(`   - Session type: ${nameAnalysis.components?.sessionType}`);
            // Generate fallback insights
            aiInsights = this.generateFallbackInsights(recording, enhancedMetadata, transcriptContent);
          }
        } else {
          console.warn('⚠️  No transcript content available for AI insights');
          aiInsights = this.generateFallbackInsights(recording, enhancedMetadata, '');
        }
      }
      
      // Step 7: Extract Outcomes
      let outcomes = [];
      if (this.outcomeExtractor && transcriptContent) {
        console.log('🎯 Extracting tangible outcomes...');
        try {
          outcomes = await this.outcomeExtractor.extractOutcomes(transcriptContent);
          console.log(`✅ Extracted ${outcomes.length} outcomes`);
        } catch (error) {
          console.error('Outcomes extraction failed:', error.message);
        }
      }
      
      // Step 8: Categorize Recording
      let recordingCategory = nameAnalysis.components?.sessionType || 'Coaching';
      if (this.recordingCategorizer) {
        try {
          // Use the categorize method with proper parameters
          recordingCategory = this.recordingCategorizer.categorize(
            nameAnalysis.components || {},
            recording
          );
          console.log(`📂 Recording categorized as: ${recordingCategory}`);
        } catch (error) {
          console.error('Categorization failed:', error.message);
        }
      }
      
      // Step 9: Organize in Google Drive
      let driveResult = { folderId: '', driveLink: '', fileIds: {} };
      if (this.driveOrganizer) {
        console.log('📁 Organizing recording in Google Drive Knowledge Base...');
        try {
          // For Drive imports, pass file IDs instead of file objects
          const preparedFiles = DriveFileHandler.prepareFilesForOrganization(files);
          
          // Build the full standardized name here
          const fullStandardizedName = this.buildFullStandardizedName(
            nameAnalysis, 
            weekAnalysis, 
            recording,
            enhancedMetadata
          );
          
          // Pass standardized name in nameAnalysis
          const enhancedNameAnalysis = {
            ...nameAnalysis,
            standardizedName: fullStandardizedName
          };
          
          driveResult = await this.driveOrganizer.organizeRecording(recording, {
            files: preparedFiles,
            insights: aiInsights,
            metadata: enhancedMetadata,
            nameAnalysis: enhancedNameAnalysis,
            weekAnalysis: weekAnalysis,
            outcomes: outcomes,
            zoomInsights: aiInsights.zoomInsights,
            transcriptContent: transcriptContent,
            chatContent: chatContent,
            category: recordingCategory,
            isDriveImport: true  // Flag to indicate this is a Drive import
          });
          console.log('✅ Recording organized in Knowledge Base');
        } catch (error) {
          console.error('Drive organization failed:', error.message);
          // Still continue with basic drive info
          driveResult = {
            folderId: recording.drive_folder_id,
            driveLink: `https://drive.google.com/drive/folders/${recording.drive_folder_id}`,
            fileIds: {}
          };
        }
      }
      
      // Step 10: Build comprehensive processed data
      const processedData = this.buildComprehensiveProcessedData(
        recording,
        nameAnalysis,
        weekAnalysis,
        aiInsights,
        outcomes,
        files,
        driveResult,
        enhancedMetadata,
        recordingCategory
      );
      
      // Step 11: Update Google Sheets with comprehensive data
      if (this.dualTabGoogleSheetsService) {
        console.log('📊 Updating Google Sheets with comprehensive data...');
        try {
          await this.dualTabGoogleSheetsService.updateMasterSpreadsheet({
            processed: processedData,
            original: recording
          }, 'Google Drive Import - Full Pipeline');
          console.log('✅ Google Sheets updated successfully');
        } catch (error) {
          console.error('Sheet update failed:', error.message);
        }
      }
      
      return processedData;
      
    } catch (error) {
      console.error('Processing error:', error);
      throw error;
    }
  }

  /**
   * Prepare files for processing (download transcript if available)
   */
  async prepareFiles(session, recording) {
    const files = {};
    
    // Debug: Log all files in session
    console.log(`📋 Files in session ${session.id}:`, session.files?.map(f => ({
      name: f.name,
      type: f.fileType,
      id: f.id
    })));
    
    // Find all video files (regular and gallery)
    const videoFiles = session.files?.filter(f => f.fileType === 'video') || [];
    
    // Identify gallery video and regular video
    for (const videoFile of videoFiles) {
      if (videoFile.name.toLowerCase().includes('gallery')) {
        files.galleryVideo = {
          path: videoFile.webViewLink,
          id: videoFile.id,
          name: videoFile.name,
          size: videoFile.size
        };
      } else {
        // Regular video (or if we already have a regular video, this might be a secondary view)
        if (!files.video) {
          files.video = {
            path: videoFile.webViewLink,
            id: videoFile.id,
            name: videoFile.name,
            size: videoFile.size
          };
        }
      }
    }
    
    // If we only found gallery video, use it as the main video
    if (!files.video && files.galleryVideo) {
      files.video = files.galleryVideo;
      delete files.galleryVideo;
    }
    
    // Find audio file
    const audioFile = session.files?.find(f => f.fileType === 'audio');
    if (audioFile) {
      files.audio = {
        path: audioFile.webViewLink,
        id: audioFile.id,
        name: audioFile.name,
        size: audioFile.size
      };
    }
    
    // Find and download transcript - be more flexible with detection
    const transcriptFile = session.files?.find(f => 
      f.fileType === 'transcript' || 
      f.name.toLowerCase().includes('transcript') ||
      f.name.toLowerCase().endsWith('.vtt') ||
      f.name.toLowerCase().endsWith('.srt')
    );
    if (transcriptFile) {
      console.log('📄 Downloading transcript for AI processing...');
      console.log(`   File: ${transcriptFile.name} (${transcriptFile.id})`);
      try {
        const response = await this.drive.files.get({
          fileId: transcriptFile.id,
          alt: 'media'
        });
        
        files.transcript = {
          path: transcriptFile.webViewLink,
          id: transcriptFile.id,
          name: transcriptFile.name,
          content: response.data
        };
        
        // Log transcript quality metrics
        const wordCount = response.data ? response.data.toString().split(/\s+/).length : 0;
        const hasTimestamps = response.data ? (response.data.includes('-->') || response.data.includes('[')) : false;
        console.log(`✅ Transcript downloaded successfully`);
        console.log(`   Quality: ${wordCount} words, timestamps: ${hasTimestamps ? 'yes' : 'no'}`);
      } catch (error) {
        console.error('Failed to download transcript:', error.message);
        console.log(`   Context: file=${transcriptFile.name}, id=${transcriptFile.id}`);
      }
    } else {
      console.log('⚠️  No transcript file found in session');
    }
    
    // Find chat file - be more flexible with detection
    const chatFile = session.files?.find(f => 
      f.fileType === 'chat' || 
      f.name.toLowerCase().includes('chat')
    );
    if (chatFile) {
      console.log('📄 Downloading chat file...');
      try {
        const response = await this.drive.files.get({
          fileId: chatFile.id,
          alt: 'media'
        });
        
        files.chat = {
          path: chatFile.webViewLink,
          id: chatFile.id,
          name: chatFile.name,
          content: response.data
        };
      } catch (error) {
        console.error('Failed to download chat:', error.message);
      }
    } else {
      console.log('⚠️  No chat file found in session');
    }
    
    // Find ANY other files that weren't already processed
    const processedFileIds = new Set();
    
    // Collect IDs of already processed files
    if (files.video) processedFileIds.add(files.video.id);
    if (files.galleryVideo) processedFileIds.add(files.galleryVideo.id);
    if (files.audio) processedFileIds.add(files.audio.id);
    if (files.transcript) processedFileIds.add(files.transcript.id);
    if (files.chat) processedFileIds.add(files.chat.id);
    
    // Get all unprocessed files
    const otherFiles = session.files?.filter(f => !processedFileIds.has(f.id)) || [];
    
    // Log additional files being processed
    if (otherFiles.length > 0) {
      console.log(`📎 Processing ${otherFiles.length} additional files:`);
    }
    
    // Add ALL other files - no filtering!
    for (const otherFile of otherFiles) {
      // Use original filename as part of the key to preserve uniqueness
      const sanitizedName = otherFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileKey = `file_${sanitizedName}`;
      
      files[fileKey] = {
        path: otherFile.webViewLink,
        id: otherFile.id,
        name: otherFile.name,
        size: otherFile.size,
        type: otherFile.fileType,
        originalName: otherFile.name  // Preserve original name
      };
      console.log(`   - ${otherFile.name} (${otherFile.fileType || 'unknown'}, ${otherFile.size || '?'} bytes)`);
    }
    
    return files;
  }

  /**
   * Build comprehensive processed data matching the main pipeline structure
   */
  buildComprehensiveProcessedData(recording, nameAnalysis, weekAnalysis, aiInsights, outcomes, files, driveResult, enhancedMetadata, category) {
    // Use the buildFullStandardizedName method to get the name with data source indicator
    const fullStandardizedName = this.buildFullStandardizedName(
      nameAnalysis, 
      weekAnalysis, 
      recording,
      enhancedMetadata
    );
    
    const processedData = {
      // Core identifiers
      uuid: recording.uuid,
      fingerprint: this.generateFingerprint(recording),
      recordingDate: recording.start_time.split('T')[0],
      
      // Name and standardization
      rawName: recording.topic,
      standardizedName: fullStandardizedName,
      nameConfidence: nameAnalysis.confidence || 0,
      nameResolutionMethod: nameAnalysis.method || 'fallback',
      
      // Week information
      weekNumber: weekAnalysis.weekNumber,
      weekConfidence: weekAnalysis.confidence || 0,
      weekInferenceMethod: weekAnalysis.method || 'fallback',
      
      // Session details
      category: category,
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
      
      // AI Insights (comprehensive)
      ...(aiInsights.combinedInsights ? {
        // Executive summary
        executiveSummary: aiInsights.combinedInsights.executiveSummary || '',
        keyOutcomes: (aiInsights.combinedInsights.keyOutcomes || []).join(', '),
        
        // Key themes and topics
        keyThemes: (aiInsights.combinedInsights.keyThemes || []).join(', '),
        mainDiscussionPoints: (aiInsights.combinedInsights.mainDiscussionPoints || []).join(', '),
        topicsDiscussed: JSON.stringify(aiInsights.combinedInsights.topicsDiscussed || []),
        
        // Action items and next steps
        actionItems: JSON.stringify(aiInsights.combinedInsights.actionItems || []),
        nextSteps: (aiInsights.combinedInsights.recommendations?.immediate || []).join(', '),
        followUpRequired: aiInsights.combinedInsights.followUpRequired ? 'Yes' : 'No',
        
        // Challenges and breakthroughs
        challengesIdentified: (aiInsights.combinedInsights.challenges || []).join(', '),
        breakthroughs: (aiInsights.combinedInsights.breakthroughs || []).join(', '),
        
        // Coaching insights
        coachingTechniques: (aiInsights.combinedInsights.coachingTechniques || []).join(', '),
        studentEngagement: aiInsights.combinedInsights.studentEngagement || '',
        sessionEffectiveness: aiInsights.combinedInsights.sessionEffectiveness || '',
        
        // Sentiment and engagement
        overallSentiment: aiInsights.combinedInsights.sentiment?.overall || '',
        engagementLevel: aiInsights.combinedInsights.engagement?.level || '',
        emotionalJourney: JSON.stringify(aiInsights.combinedInsights.emotionalJourney || {}),
        
        // Quality metrics
        dataQuality: aiInsights.combinedInsights.qualityScore || 0,
        insightsConfidence: aiInsights.metadata?.confidence || 0
      } : {}),
      
      // Tangible Outcomes
      goalsSet: outcomes.filter(o => o.type === 'goal').map(o => o.description).join(', '),
      progressTracked: outcomes.filter(o => o.type === 'progress').map(o => o.description).join(', '),
      outcomesCount: outcomes.length,
      outcomesDetails: JSON.stringify(outcomes),
      
      // Drive organization
      driveFolder: fullStandardizedName,
      driveFolderId: driveResult.folderId || recording.drive_folder_id,
      driveLink: driveResult.folderUrl || driveResult.driveLink || `https://drive.google.com/drive/folders/${recording.drive_folder_id}`,
      videoFileId: driveResult.fileIds?.video || files.video?.id || '',
      transcriptFileId: driveResult.fileIds?.transcript || files.transcript?.id || '',
      insightsDocId: driveResult.insightsDoc?.id || '',
      
      // Processing metadata
      processedDate: new Date().toISOString(),
      processingVersion: '4.0-full-pipeline',
      dataSource: 'Google Drive Import',
      lastUpdated: new Date().toISOString(),
      
      // AI metadata
      aiProvider: aiInsights.metadata?.provider || 'none',
      aiModel: aiInsights.metadata?.model || 'none',
      aiProcessingTime: aiInsights.metadata?.processingTime || 0,
      
      // Additional metadata from enhanced extraction
      hostTimezone: enhancedMetadata.hostTimezone || '',
      recordingQuality: enhancedMetadata.recordingQuality || '',
      networkQuality: enhancedMetadata.networkQuality || '',
      
      // Files metadata
      filesUploaded: Object.keys(files).length,
      totalFileSize: Object.values(files).reduce((sum, f) => sum + (parseInt(f.size) || 0), 0),
      
      // Program cycle metadata (for renewal students)
      programCycle: recording._programCycle || enhancedMetadata.programCycle || null,
      isRenewalStudent: recording._isRenewalStudent || false
    };

    return processedData;
  }

  /**
   * Extract session metadata from folder name and files
   */
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
      sessionType: 'Coaching',
      programCycle: null,
      isRenewalStudent: false
    };

    // Extract from folder name
    if (session.metadata?.folderName) {
      const folderName = session.metadata.folderName;
      console.log(`🔍 Extracting metadata from folder: ${folderName}`);
      
      // Pattern: Coaching_Jenny Duan_Arshiya_Wk02_2024-09-29_[ID]
      const patterns = [
        // Standard format with optional ID suffix
        /^(Coaching|GamePlan|SAT|MISC|TRIVIAL)_([^_]+(?:\s+[^_]+)*)_([^_]+)_Wk(\d+[A-Z]?)_(\d{4}-\d{2}-\d{2})(?:_|$)/,
        // Test format: 2024-12-31_Huda-Jenny_Week1_UUID-0d8e4f11
        /^(\d{4}-\d{2}-\d{2})_([^-]+)-([^_]+)_Week(\d+)/
      ];
      
      for (let i = 0; i < patterns.length; i++) {
        const match = folderName.match(patterns[i]);
        if (match) {
          console.log(`✅ Pattern ${i} matched`);
          if (i === 0) {
            // Standard format
            const [, sessionType, coach, student, week, date] = match;
            console.log(`  Session type: ${sessionType}, Coach: ${coach}, Student: ${student}, Week: ${week}, Date: ${date}`);
            
            const coachFirstName = coach.trim().split(/\s+/)[0];
            const studentFirstName = student.trim().split(/\s+/)[0];
            
            metadata.sessionType = sessionType;
            metadata.topic = `${coachFirstName} & ${studentFirstName}`;
            metadata.participants = [coachFirstName, studentFirstName];
            metadata.hostName = coachFirstName;
            metadata.hostEmail = `${coachFirstName.toLowerCase()}@ivymentors.co`;
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
          } else if (i === 1) {
            // Test format
            const [, date, student, coach, week] = match;
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

    // Detect program cycle for renewal students
    if (metadata.participants.length >= 2 && metadata.weekNumber) {
      const studentName = metadata.participants[1]; // Student is typically second
      const dateStr = metadata.startTime.split('T')[0];
      
      const cycleInfo = this.programCycleDetector.detectProgramCycle(
        studentName,
        metadata.weekNumber,
        dateStr
      );
      
      metadata.programCycle = cycleInfo.programCycle;
      metadata.isRenewalStudent = cycleInfo.isRenewal;
      metadata.absoluteWeek = cycleInfo.absoluteWeek;
      
      if (cycleInfo.isRenewal) {
        console.log(`🔄 Renewal student detected: ${studentName} - Program Cycle ${cycleInfo.programCycle}, Week ${metadata.weekNumber}`);
      }
    }

    return metadata;
  }

  /**
   * Build recording object compatible with main pipeline
   */
  buildRecordingObject(session, metadata) {
    // Include session type in topic if it's GamePlan
    let topic = metadata.topic;
    if (metadata.sessionType === 'GamePlan' && !topic.toLowerCase().includes('gameplan') && !topic.toLowerCase().includes('game plan')) {
      topic = `GamePlan - ${topic}`;
    }
    
    return {
      uuid: session.id,
      id: session.id,
      meeting_id: session.id,
      topic: topic,
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
      drive_folder_name: session.metadata?.folderName || '',
      // Preserve metadata
      _sessionType: metadata.sessionType,
      _programCycle: metadata.programCycle,
      _isRenewalStudent: metadata.isRenewalStudent,
      // Data source for indicators
      dataSource: session.dataSource || 'google-drive'
    };
  }

  /**
   * Convert Drive files to recording files format
   */
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

  /**
   * Generate fallback insights when AI service fails
   */
  generateFallbackInsights(recording, metadata, transcriptContent) {
    const coach = metadata.participants[0] || metadata.hostName || 'Coach';
    const student = metadata.participants[1] || 'Student';
    const weekNumber = metadata.weekNumber || 'N/A';
    const sessionType = metadata.sessionType || 'Coaching';
    const duration = Math.round((recording.duration || 3600) / 60);
    
    return {
      combinedInsights: {
        executiveSummary: `${sessionType} session between ${coach} and ${student} for Week ${weekNumber}. Duration: ${duration} minutes. This is a fallback summary as transcript analysis was not available.`,
        keyThemes: [sessionType, 'Academic Progress', 'Goal Setting', 'Student Development'],
        mainDiscussionPoints: [
          'Weekly progress review',
          'Assignment completion status',
          'Upcoming goals and objectives',
          'Areas for improvement'
        ],
        challenges: ['Transcript not available for detailed analysis'],
        breakthroughs: [],
        actionItems: [
          'Review session recording for detailed insights',
          'Follow up on discussed topics',
          'Prepare for next session'
        ],
        recommendations: { 
          immediate: ['Review session materials', 'Complete assigned tasks'],
          longTerm: ['Track progress over time', 'Maintain consistent session schedule']
        },
        sentiment: { overall: 'neutral' },
        engagement: { level: 'medium' },
        qualityScore: 0.3,
        coachingTechniques: ['Progress Review', 'Goal Setting', 'Feedback'],
        studentEngagement: 'Unable to assess without transcript',
        sessionEffectiveness: 'Unable to assess without transcript'
      },
      metadata: {
        provider: 'fallback',
        model: 'rule-based',
        processingTime: 0,
        confidence: 0.3,
        reason: transcriptContent ? 'AI service unavailable' : 'No transcript available'
      }
    };
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
    // Prefer sessions with transcript files and highest resolution video
    return sessions.sort((a, b) => {
      const aHasTranscript = a.files?.some(f => f.fileType === 'transcript') || false;
      const bHasTranscript = b.files?.some(f => f.fileType === 'transcript') || false;
      
      if (aHasTranscript && !bHasTranscript) return -1;
      if (!aHasTranscript && bHasTranscript) return 1;
      
      const aVideoSize = Math.max(...(a.files?.filter(f => f.fileType === 'video').map(f => parseInt(f.size) || 0) || [0]));
      const bVideoSize = Math.max(...(b.files?.filter(f => f.fileType === 'video').map(f => parseInt(f.size) || 0) || [0]));
      
      return bVideoSize - aVideoSize;
    })[0];
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

  /**
   * Build full standardized name for folder creation
   */
  buildFullStandardizedName(nameAnalysis, weekAnalysis, recording, metadata) {
    // If we have the name standardizer, use its buildStandardizedFolderName method
    // which properly handles data source indicators
    if (this.completeSmartNameStandardizer) {
      return this.completeSmartNameStandardizer.buildStandardizedFolderName({
        coach: nameAnalysis.components?.coach || 'Unknown',
        student: nameAnalysis.components?.student || 'Unknown',
        weekNumber: weekAnalysis.weekNumber || '00',
        sessionType: nameAnalysis.components?.sessionType || 'Coaching',
        date: recording.start_time.split('T')[0],
        meetingId: recording.meeting_id,
        uuid: recording.uuid,
        topic: recording.topic,
        dataSource: recording.dataSource
      });
    }
    
    // Fallback if no standardizer available
    const sessionType = nameAnalysis.components?.sessionType || 'Coaching';
    const coach = nameAnalysis.components?.coach || 'Unknown';
    const student = nameAnalysis.components?.student || 'Unknown';
    const weekNumber = weekAnalysis.weekNumber || '00';
    const date = recording.start_time.split('T')[0];
    const programCycle = metadata.programCycle;
    
    let fullName;
    if (programCycle && programCycle > 1) {
      fullName = `${sessionType}_${coach}_${student}_PC${programCycle}_Wk${weekNumber.toString().padStart(2, '0')}_${date}`;
    } else {
      fullName = `${sessionType}_${coach}_${student}_Wk${weekNumber.toString().padStart(2, '0')}_${date}`;
    }
    
    return fullName;
  }

  generateProcessingReport(results) {
    console.log('\n' + '='.repeat(50));
    console.log('📊 DRIVE PROCESSING REPORT - FULL PIPELINE');
    console.log('='.repeat(50));
    console.log(`Total sessions: ${results.successful.length + results.failed.length + results.skipped.length}`);
    console.log(`✅ Successful: ${results.successful.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    console.log(`⏭️  Skipped: ${results.skipped.length}`);

    if (results.successful.length > 0) {
      console.log('\nSuccessfully processed with AI insights:');
      results.successful.forEach(session => {
        const sessionName = session.standardizedName || session.rawName || session.topic || 'Unknown';
        console.log(`  ✓ ${sessionName}`);
        console.log(`    - Week: ${session.weekNumber}`);
        console.log(`    - AI Insights: ${session.executiveSummary ? 'Yes' : 'No'}`);
        console.log(`    - Outcomes: ${session.outcomesCount || 0}`);
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

module.exports = IntegratedDriveProcessorV4;