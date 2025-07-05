const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class StandaloneDriveProcessor {
  constructor(config) {
    this.config = config;
    this.drive = google.drive({ version: 'v3', auth: this.getAuthClient() });
    this.sheets = google.sheets({ version: 'v4', auth: this.getAuthClient() });
    this.processedRecordings = new Map();
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
    console.log(`\nProcessing ${sessions.length} recording sessions...`);
    
    const results = {
      successful: [],
      failed: [],
      skipped: []
    };

    for (const [index, session] of sessions.entries()) {
      console.log(`\nProcessing session ${index + 1}/${sessions.length} (ID: ${session.id})`);
      
      try {
        const isDuplicate = await this.checkDuplicate(session);
        if (isDuplicate) {
          console.log(`Skipping duplicate session: ${session.id}`);
          results.skipped.push({ session, reason: 'Duplicate' });
          continue;
        }

        const processedSession = await this.processSession(session);
        results.successful.push(processedSession);
        
        await this.updateGoogleSheet(processedSession);
        
        console.log(`✓ Successfully processed session ${session.id}`);
      } catch (error) {
        console.error(`✗ Failed to process session ${session.id}:`, error.message);
        results.failed.push({ session, error: error.message });
      }
    }

    this.generateProcessingReport(results);
    return results;
  }

  async checkDuplicate(session) {
    // Use test sheet if configured, otherwise use main sheet
    const sheetId = this.config.driveSource && this.config.driveSource.useTestFolders && this.config.driveSource.testSheetId
      ? this.config.driveSource.testSheetId
      : this.config.google.sheets.masterIndexSheetId;
    
    if (!sheetId) {
      return false;
    }

    try {
      // First check if the sheet exists and get the range
      let range = 'Sheet1!A:Z';
      try {
        const spreadsheet = await this.sheets.spreadsheets.get({
          spreadsheetId: sheetId
        });
        // Use the first sheet if Sheet1 doesn't exist
        if (spreadsheet.data.sheets && spreadsheet.data.sheets.length > 0) {
          const sheetName = spreadsheet.data.sheets[0].properties.title;
          range = `${sheetName}!A:Z`;
        }
      } catch (err) {
        console.log('Using default sheet range');
      }

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: range
      });

      const rows = response.data.values || [];
      if (rows.length <= 1) return false;

      for (const row of rows.slice(1)) {
        const existingDate = row[2];
        const existingParticipants = row[8];
        
        if (session.metadata && session.metadata.date && existingDate === session.metadata.date.raw) {
          const participants = session.metadata.participants || [];
          if (participants.length > 0 && existingParticipants) {
            const participantMatch = participants.some(p => 
              existingParticipants.includes(p)
            );
            if (participantMatch) return true;
          }
        }
      }
    } catch (error) {
      console.warn('Error checking duplicates:', error.message);
    }

    return false;
  }

  async processSession(session) {
    const processedSession = {
      id: session.id,
      originalFiles: session.files,
      metadata: { ...session.metadata },
      processing: {
        startTime: new Date().toISOString(),
        source: 'drive-import'
      }
    };

    // Generate fingerprint first
    processedSession.metadata.fingerprint = this.generateFingerprint(session);
    
    const standardizedName = await this.generateStandardizedName(processedSession);
    processedSession.metadata.standardizedName = standardizedName;
    
    const targetFolder = await this.determineTargetFolder(session);
    processedSession.targetFolder = targetFolder;
    
    const movedFiles = await this.reorganizeFiles(session, targetFolder, standardizedName);
    processedSession.reorganizedFiles = movedFiles;
    
    if (session.metadata && session.metadata.hasTranscript) {
      const transcriptAnalysis = await this.analyzeTranscript(session);
      processedSession.transcriptAnalysis = transcriptAnalysis;
    }
    
    processedSession.processing.endTime = new Date().toISOString();
    processedSession.processing.duration = 
      (new Date(processedSession.processing.endTime) - new Date(processedSession.processing.startTime)) / 1000;

    return processedSession;
  }

  generateFingerprint(session) {
    const parts = [];
    
    if (session.metadata && session.metadata.date && session.metadata.date.raw) {
      parts.push(session.metadata.date.raw);
    }
    
    if (session.metadata && session.metadata.participants && session.metadata.participants.length > 0) {
      parts.push(...session.metadata.participants.sort());
    }
    
    if (session.files && session.files.length > 0) {
      const primaryFile = session.files.find(f => f.fileType === 'video') || session.files[0];
      parts.push(primaryFile.size || '0');
    }

    const hash = crypto.createHash('sha256');
    hash.update(parts.join('|'));
    return hash.digest('hex').substring(0, 16);
  }

  async generateStandardizedName(session) {
    const parts = [];
    
    if (session.metadata && session.metadata.date && session.metadata.date.raw) {
      const dateStr = this.standardizeDate(session.metadata.date.raw);
      parts.push(dateStr);
    } else {
      parts.push('UNKNOWN-DATE');
    }
    
    const participants = (session.metadata && session.metadata.participants) || [];
    if (participants.length === 2) {
      parts.push(participants.sort().join('-'));
    } else if (participants.length === 1) {
      parts.push(participants[0]);
      parts.push('Unknown');
    } else if (participants.length > 2) {
      parts.push(participants[0]);
      parts.push(`${participants.length - 1}-Others`);
    } else {
      parts.push('Unknown-Participants');
    }
    
    if (session.metadata && session.metadata.week && session.metadata.week.number) {
      parts.push(`Week${session.metadata.week.number}`);
    }
    
    // Use the fingerprint we already generated
    const fingerprint = session.metadata.fingerprint || crypto.randomBytes(8).toString('hex');
    parts.push(`UUID-${fingerprint.substring(0, 8)}`);
    
    return parts.join('_');
  }

  standardizeDate(dateStr) {
    try {
      const datePatterns = [
        { regex: /(\d{4})-(\d{1,2})-(\d{1,2})/, format: 'yyyy-mm-dd' },
        { regex: /(\d{1,2})-(\d{1,2})-(\d{4})/, format: 'mm-dd-yyyy' },
        { regex: /(\d{1,2})\/(\d{1,2})\/(\d{4})/, format: 'mm/dd/yyyy' },
        { regex: /(\d{4})(\d{2})(\d{2})/, format: 'yyyymmdd' }
      ];

      for (const pattern of datePatterns) {
        const match = dateStr.match(pattern.regex);
        if (match) {
          let year, month, day;
          
          if (pattern.format === 'yyyy-mm-dd' || pattern.format === 'yyyymmdd') {
            [, year, month, day] = match;
          } else {
            [, month, day, year] = match;
          }
          
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
      }
    } catch (error) {
      console.error('Error parsing date:', error);
    }
    
    return dateStr.replace(/[^0-9-]/g, '');
  }

  async determineTargetFolder(session) {
    // Use test folders if configured, otherwise use main folders
    const driveConfig = this.config.driveSource && this.config.driveSource.useTestFolders 
      ? this.config.driveSource.testFolders 
      : this.config.google.drive;
    
    const rootFolderId = driveConfig.recordingsRootFolderId;
    
    if (!rootFolderId) {
      throw new Error('Root folder ID not configured');
    }

    let categoryFolder;
    const participants = (session.metadata && session.metadata.participants) || [];
    
    if (participants.length >= 2) {
      const [person1, person2] = participants;
      if (this.isCoach(person1) || this.isCoach(person2)) {
        categoryFolder = driveConfig.coachesFolderId;
      } else {
        categoryFolder = driveConfig.studentsFolderId;
      }
    } else if (session.metadata && session.metadata.confidence < 40) {
      categoryFolder = driveConfig.trivialFolderId;
    } else {
      categoryFolder = driveConfig.miscFolderId;
    }

    return categoryFolder;
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

  async reorganizeFiles(session, targetFolderId, standardizedName) {
    const reorganizedFiles = [];
    
    const sessionFolder = await this.createOrGetFolder(standardizedName, targetFolderId);
    
    for (const file of session.files) {
      try {
        const fileExtension = path.extname(file.name);
        const newFileName = `${standardizedName}_${file.fileType}${fileExtension}`;
        
        await this.drive.files.update({
          fileId: file.id,
          addParents: sessionFolder.id,
          removeParents: file.parents ? file.parents.join(',') : '',
          requestBody: {
            name: newFileName
          }
        });
        
        reorganizedFiles.push({
          originalName: file.name,
          newName: newFileName,
          fileId: file.id,
          folderId: sessionFolder.id,
          fileType: file.fileType
        });
        
        console.log(`  Moved: ${file.name} -> ${newFileName}`);
      } catch (error) {
        console.error(`  Failed to move ${file.name}:`, error.message);
      }
    }
    
    return {
      folderId: sessionFolder.id,
      folderName: sessionFolder.name,
      files: reorganizedFiles
    };
  }

  async createOrGetFolder(folderName, parentFolderId) {
    try {
      const response = await this.drive.files.list({
        q: `name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)'
      });

      if (response.data.files && response.data.files.length > 0) {
        return response.data.files[0];
      }

      const folderMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId]
      };

      const folder = await this.drive.files.create({
        requestBody: folderMetadata,
        fields: 'id, name'
      });

      return folder.data;
    } catch (error) {
      console.error('Error creating folder:', error);
      throw error;
    }
  }

  async analyzeTranscript(session) {
    const transcriptFile = session.files.find(f => f.fileType === 'transcript');
    if (!transcriptFile) return null;

    try {
      const response = await this.drive.files.get({
        fileId: transcriptFile.id,
        alt: 'media'
      });

      const content = response.data;
      
      const analysis = {
        wordCount: content.split(/\s+/).length,
        duration: this.estimateDuration(content),
        speakers: this.extractSpeakers(content),
        topics: this.extractTopics(content)
      };

      return analysis;
    } catch (error) {
      console.error('Error analyzing transcript:', error);
      return null;
    }
  }

  estimateDuration(content) {
    const words = content.split(/\s+/).length;
    const avgWordsPerMinute = 150;
    return Math.round(words / avgWordsPerMinute);
  }

  extractSpeakers(content) {
    const speakerPattern = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*:/gm;
    const speakers = new Set();
    
    let match;
    while ((match = speakerPattern.exec(content)) !== null) {
      speakers.add(match[1]);
    }
    
    return Array.from(speakers);
  }

  extractTopics(content) {
    const words = content.toLowerCase().split(/\s+/);
    const commonWords = new Set(['the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'as', 'are', 'been', 'by', 'for', 'from', 'has', 'had', 'have', 'in', 'of', 'that', 'to', 'was', 'will', 'with']);
    
    const wordFreq = {};
    
    for (const word of words) {
      const cleaned = word.replace(/[^a-z]/g, '');
      if (cleaned.length > 4 && !commonWords.has(cleaned)) {
        wordFreq[cleaned] = (wordFreq[cleaned] || 0) + 1;
      }
    }
    
    return Object.entries(wordFreq)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);
  }

  async updateGoogleSheet(processedSession) {
    // Use test sheet if configured, otherwise use main sheet
    const sheetId = this.config.driveSource && this.config.driveSource.useTestFolders && this.config.driveSource.testSheetId
      ? this.config.driveSource.testSheetId
      : this.config.google.sheets.masterIndexSheetId;
    
    if (!sheetId) {
      console.log('No Google Sheet configured, skipping update');
      return;
    }

    try {
      const values = [[
        processedSession.metadata.fingerprint,
        processedSession.metadata.standardizedName,
        processedSession.metadata.date ? processedSession.metadata.date.raw : '',
        processedSession.metadata.participants ? processedSession.metadata.participants.join(', ') : '',
        processedSession.metadata.week ? processedSession.metadata.week.number : '',
        processedSession.reorganizedFiles.folderName,
        processedSession.reorganizedFiles.folderId,
        processedSession.reorganizedFiles.files.map(f => f.fileId).join(', '),
        'Google Drive Import',  // Data source - more descriptive than 'drive-import'
        processedSession.processing.startTime,
        processedSession.metadata.confidence || 0,
        processedSession.transcriptAnalysis ? processedSession.transcriptAnalysis.wordCount : '',
        processedSession.transcriptAnalysis ? processedSession.transcriptAnalysis.duration : '',
        processedSession.transcriptAnalysis ? processedSession.transcriptAnalysis.speakers.join(', ') : '',
        processedSession.transcriptAnalysis ? processedSession.transcriptAnalysis.topics.join(', ') : ''
      ]];

      // Get the sheet name dynamically
      let range = 'Sheet1!A:O';
      try {
        const spreadsheet = await this.sheets.spreadsheets.get({
          spreadsheetId: sheetId
        });
        if (spreadsheet.data.sheets && spreadsheet.data.sheets.length > 0) {
          const sheetName = spreadsheet.data.sheets[0].properties.title;
          range = `${sheetName}!A:O`;
        }
      } catch (err) {
        console.log('Using default sheet range for append');
      }

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: range,
        valueInputOption: 'RAW',
        requestBody: { values }
      });

      console.log(`  Updated Google Sheet for session ${processedSession.id}`);
    } catch (error) {
      console.error('Error updating Google Sheet:', error);
    }
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

    const totalFiles = results.successful.reduce((sum, s) => 
      sum + s.reorganizedFiles.files.length, 0
    );
    console.log(`\nTotal files reorganized: ${totalFiles}`);
  }
}

module.exports = StandaloneDriveProcessor;