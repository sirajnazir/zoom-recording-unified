const { google } = require('googleapis');
const path = require('path');
const crypto = require('crypto');

class DriveScanner {
  constructor(config) {
    this.config = config;
    this.drive = google.drive({ version: 'v3', auth: this.getAuthClient() });
    this.logger = console;
    
    // Add caching to reduce API calls
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    
    // Smart retry configuration for overload errors
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000, // Start with 1 second
      maxDelay: 10000, // Max 10 seconds
      backoffMultiplier: 1.5,
      overloadErrorCodes: [429, 500, 502, 503, 504, 529] // Include 529 overload
    };

    this.knownPatterns = [
      /zoom.*recording/i,
      /\d{4}-\d{2}-\d{2}/,
      /week\s*\d+/i,
      /session\s*\d+/i,
      /coaching.*session/i,
      /call.*with/i,
      /meeting.*recording/i,
      /\.mp4$/i,
      /\.m4a$/i,
      /\.txt$/i,
      /\.vtt$/i,
      /\.srt$/i,
      /transcript/i,
      /chat/i,
      /audio.*only/i,
      /GMT\d{8}-\d{6}/i,  // GMT timestamp pattern
      /Recording/i        // Generic recording pattern
    ];
    this.fileTypeMap = {
      video: ['.mp4', '.mov', '.avi', '.mkv', '.webm'],
      audio: ['.m4a', '.mp3', '.wav', '.aac'],
      transcript: ['.txt', '.vtt', '.srt', '.json'],
      chat: ['chat.txt', 'chat.json']
    };
  }

  getAuthClient() {
    return new google.auth.JWT(
      this.config.google.clientEmail,
      null,
      this.config.google.privateKey,
      ['https://www.googleapis.com/auth/drive']
    );
  }

  /**
   * Smart retry wrapper for Google API calls
   */
  async withSmartRetry(apiCall, context = 'API call') {
    let lastError;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        lastError = error;
        
        // Check if it's an overload error
        const isOverloadError = this.retryConfig.overloadErrorCodes.includes(error.code) ||
                               (error.message && error.message.includes('overloaded'));
        
        if (isOverloadError && attempt < this.retryConfig.maxRetries) {
          const delay = Math.min(
            this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
            this.retryConfig.maxDelay
          );
          
          console.log(`⚠️  ${context} failed (attempt ${attempt}/${this.retryConfig.maxRetries}): ${error.message}`);
          console.log(`   Retrying in ${delay}ms...`);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // For non-overload errors or final attempt, throw immediately
        throw error;
      }
    }
    
    throw lastError;
  }

  /**
   * Cached folder info to reduce API calls
   */
  async getCachedFolderInfo(folderId) {
    const cacheKey = `folder_${folderId}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }
    
    const folderInfo = await this.withSmartRetry(
      () => this.getFolderInfo(folderId),
      `Get folder info for ${folderId}`
    );
    
    this.cache.set(cacheKey, {
      data: folderInfo,
      timestamp: Date.now()
    });
    
    return folderInfo;
  }

  async scanFolder(folderId, options = {}) {
    const { 
      maxDepth = 5, 
      currentDepth = 0,
      excludeFolders = [],
      includePatterns = [],
      minFileSize = 1024 * 1024, // 1MB minimum
      processedFolders = new Set()
    } = options;

    if (processedFolders.has(folderId)) {
      console.log(`Folder ${folderId} already processed, skipping`);
      return [];
    }
    processedFolders.add(folderId);

    if (currentDepth > maxDepth) {
      console.warn(`Max depth ${maxDepth} reached, skipping deeper folders`);
      return [];
    }

    const recordings = [];
    let pageToken = null;

    try {
      const folderInfo = await this.getCachedFolderInfo(folderId);
      console.log(`Scanning folder: ${folderInfo.name} (${folderId}) at depth ${currentDepth}`);

      do {
        const query = [
          `'${folderId}' in parents`,
          "trashed = false"
        ].join(' and ');

        const response = await this.withSmartRetry(
          () => this.drive.files.list({
            q: query,
            fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink, webContentLink)',
            pageSize: 100, // Reduced from 1000 to 100
            pageToken
          }),
          `List files in folder ${folderId}`
        );

        for (const file of response.data.files) {
          if (file.mimeType === 'application/vnd.google-apps.folder') {
            if (!excludeFolders.includes(file.name) && !excludeFolders.includes(file.id)) {
              console.log(`Found subfolder: ${file.name}`);
              const subRecordings = await this.scanFolder(file.id, {
                ...options,
                currentDepth: currentDepth + 1,
                processedFolders
              });
              recordings.push(...subRecordings);
            }
          } else if (this.isPotentialRecording(file, includePatterns, minFileSize)) {
            const enrichedFile = this.enrichFileMetadata(file, folderId, folderInfo.name);
            recordings.push(enrichedFile);
            console.log(`Found potential recording: ${file.name} (type: ${enrichedFile.fileType}, confidence: ${enrichedFile.confidence}%)`);
          }
        }

        pageToken = response.data.nextPageToken;
        
        // Add small delay between pages to avoid rate limiting
        if (pageToken) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } while (pageToken);

      console.log(`Completed scanning folder: ${folderInfo.name}, found ${recordings.length} recordings`);

    } catch (error) {
      console.error('Error scanning folder:', error);
      console.log(`   Context: folder=${folderInfo.name}, id=${folderId}, depth=${currentDepth}`);
    }

    return recordings;
  }

  async getFolderInfo(folderId) {
    try {
      const response = await this.drive.files.get({
        fileId: folderId,
        fields: 'id, name, parents'
      });
      return response.data;
    } catch (error) {
      console.error('Error getting folder info:', error);
      return { id: folderId, name: 'Unknown Folder' };
    }
  }

  isPotentialRecording(file, includePatterns = [], minFileSize = 0) {
    // Skip size check for certain file types that might be small (like chat files)
    const fileName = file.name.toLowerCase();
    const isSmallFileType = fileName.endsWith('.txt') || fileName.endsWith('.json') || 
                           fileName.endsWith('.vtt') || fileName.endsWith('.srt');
    
    if (!isSmallFileType && file.size && parseInt(file.size) < minFileSize) {
      console.log(`⚠️  Excluded by size filter: ${file.name} (${file.size} bytes < ${minFileSize} bytes minimum)`);
      return false;
    }

    // INCLUSIVE APPROACH: Include ALL files that might be part of a recording
    // We'll let the matching algorithm group them properly
    
    // Exclude only system files and clearly non-recording files
    const excludePatterns = [
      /^\./, // Hidden files starting with .
      /\.tmp$/i, // Temporary files
      /\.log$/i, // Log files
      /desktop\.ini$/i, // Windows system files
      /\.ds_store$/i, // Mac system files
      /thumbs\.db$/i // Windows thumbnail files
    ];
    
    if (excludePatterns.some(pattern => pattern.test(file.name))) {
      const matchedPattern = excludePatterns.find(pattern => pattern.test(file.name));
      console.log(`⚠️  Excluded by pattern: ${file.name} matches ${matchedPattern}`);
      return false;
    }

    // If include patterns are specified, use them
    if (includePatterns.length > 0) {
      return includePatterns.some(pattern => {
        if (pattern instanceof RegExp) {
          return pattern.test(file.name);
        }
        return file.name.toLowerCase().includes(pattern.toLowerCase());
      });
    }

    // Otherwise, include any file that might be related to recordings
    // This includes: videos, audio, transcripts, chat, json, or anything with GMT timestamp
    return true; // Include everything by default!
  }

  enrichFileMetadata(file, parentFolderId, parentFolderName) {
    const fileType = this.detectFileType(file.name);
    const possibleDate = this.extractDateFromName(file.name) || this.extractDateFromName(parentFolderName);
    const possibleParticipants = this.extractParticipantsFromName(file.name) || this.extractParticipantsFromName(parentFolderName);
    const possibleWeek = this.extractWeekFromName(file.name) || this.extractWeekFromName(parentFolderName);

    return {
      ...file,
      parentFolderId,
      parentFolderName,
      fileType,
      possibleDate,
      possibleParticipants,
      possibleWeek,
      needsGrouping: true,
      confidence: this.calculateConfidence(file.name, parentFolderName)
    };
  }

  detectFileType(fileName) {
    const lowerName = fileName.toLowerCase();
    
    // Video files - check extensions (case insensitive)
    if (lowerName.match(/\.(mp4|mov|avi|mkv|webm|m4v)$/i)) {
      return 'video';
    }
    
    // Audio files
    if (lowerName.match(/\.(m4a|mp3|wav|aac|ogg|wma)$/i)) {
      return 'audio';
    }
    
    // Transcript files - .vtt and .srt are ALWAYS transcripts
    if (lowerName.match(/\.vtt$/i) || lowerName.match(/\.srt$/i)) {
      return 'transcript';
    }
    
    // Chat files - anything with 'chat' in the name
    if (lowerName.includes('chat')) {
      return 'chat';
    }
    
    // Transcript by name pattern
    if (lowerName.includes('transcript') || lowerName.includes('caption')) {
      return 'transcript';
    }
    
    // JSON files might be metadata or settings
    if (lowerName.endsWith('.json')) {
      return 'metadata';
    }
    
    // Text files - could be chat, notes, or other
    if (lowerName.endsWith('.txt')) {
      // If it has GMT timestamp, likely a chat file
      if (lowerName.match(/gmt\d{8}-\d{6}/i)) {
        return 'chat';
      }
      return 'text';
    }
    
    // Any other file type - don't exclude it!
    return 'other';
  }

  extractDateFromName(name) {
    if (!name) return null;
    
    const patterns = [
      /\b(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\b/,
      /\b(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})\b/,
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})\b/i,
      /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/i,
      /\b(\d{8})\b/,
      /\b(\d{4})(\d{2})(\d{2})\b/
    ];

    for (const pattern of patterns) {
      const match = name.match(pattern);
      if (match) {
        return { raw: match[0], pattern: pattern.source };
      }
    }
    return null;
  }

  extractParticipantsFromName(name) {
    if (!name) return null;
    
    const participants = [];
    const patterns = [
      /with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*[-&]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
      /coaching.*?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
      /call.*?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
      /\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\s+(?:call|session|meeting|coaching)\b/gi
    ];

    const excludeWords = ['Zoom', 'Recording', 'Meeting', 'Call', 'Session', 'Coaching', 'With', 'And'];

    for (const pattern of patterns) {
      const matches = [...name.matchAll(pattern)];
      for (const match of matches) {
        for (let i = 1; i < match.length; i++) {
          if (match[i] && !excludeWords.includes(match[i]) && !participants.includes(match[i])) {
            participants.push(match[i]);
          }
        }
      }
    }

    return participants.length > 0 ? participants : null;
  }

  extractWeekFromName(name) {
    if (!name) return null;
    
    const patterns = [
      /week\s*(\d+)/i,
      /w(\d+)\b/i,
      /session\s*(\d+)/i,
      /module\s*(\d+)/i,
      /wk\s*(\d+)/i
    ];

    for (const pattern of patterns) {
      const match = name.match(pattern);
      if (match) {
        return { 
          number: parseInt(match[1]), 
          pattern: pattern.source,
          raw: match[0]
        };
      }
    }
    return null;
  }

  calculateConfidence(fileName, folderName = '') {
    let score = 0;
    const combinedName = `${fileName} ${folderName}`.toLowerCase();

    if (this.extractDateFromName(combinedName)) score += 20;
    if (this.extractParticipantsFromName(combinedName)) score += 20;
    if (this.extractWeekFromName(combinedName)) score += 15;
    if (combinedName.includes('zoom')) score += 15;
    if (combinedName.includes('recording')) score += 10;
    if (combinedName.includes('coaching') || combinedName.includes('session')) score += 10;
    if (combinedName.includes('call') || combinedName.includes('meeting')) score += 10;

    return Math.min(score, 100);
  }

  async discoverRecordingGroups(files) {
    const groups = new Map();
    
    for (const file of files) {
      const groupKey = this.generateGroupKey(file);
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          id: this.generateGroupId(groupKey),
          files: [],
          metadata: {
            date: file.possibleDate,
            participants: file.possibleParticipants,
            week: file.possibleWeek,
            folderName: file.parentFolderName,
            confidence: 0
          }
        });
      }
      
      const group = groups.get(groupKey);
      group.files.push(file);
      group.metadata.confidence = Math.max(group.metadata.confidence, file.confidence);
    }

    const validGroups = Array.from(groups.values()).filter(group => 
      this.isValidRecordingGroup(group)
    );

    console.log(`\nDiscovered ${validGroups.length} recording groups from ${files.length} files`);
    
    return validGroups;
  }

  generateGroupKey(file) {
    const parts = [];
    
    if (file.possibleDate) {
      parts.push(file.possibleDate.raw);
    }
    
    if (file.possibleParticipants && file.possibleParticipants.length > 0) {
      parts.push(...file.possibleParticipants.sort());
    }
    
    if (file.possibleWeek) {
      parts.push(`week${file.possibleWeek.number}`);
    }
    
    if (parts.length === 0) {
      parts.push(file.parentFolderId);
      const baseName = path.basename(file.name, path.extname(file.name)).toLowerCase();
      parts.push(baseName);
    }
    
    return parts.join('_').toLowerCase().replace(/[^a-z0-9_]/g, '');
  }

  generateGroupId(groupKey) {
    const hash = crypto.createHash('sha256');
    hash.update(groupKey);
    return hash.digest('hex').substring(0, 16);
  }

  isValidRecordingGroup(group) {
    const hasVideo = group.files.some(f => f.fileType === 'video');
    const hasAudio = group.files.some(f => f.fileType === 'audio');
    const hasTranscript = group.files.some(f => f.fileType === 'transcript');
    
    return (hasVideo || hasAudio) && group.files.length >= 1;
  }

  generateReport(groups) {
    console.log('\n=== Drive Scanner Report ===\n');
    
    const stats = {
      totalGroups: groups.length,
      withVideo: groups.filter(g => g.files.some(f => f.fileType === 'video')).length,
      withAudio: groups.filter(g => g.files.some(f => f.fileType === 'audio')).length,
      withTranscript: groups.filter(g => g.files.some(f => f.fileType === 'transcript')).length,
      highConfidence: groups.filter(g => g.metadata.confidence >= 70).length,
      mediumConfidence: groups.filter(g => g.metadata.confidence >= 40 && g.metadata.confidence < 70).length,
      lowConfidence: groups.filter(g => g.metadata.confidence < 40).length
    };

    console.log('Summary:');
    console.log(`- Total recording groups: ${stats.totalGroups}`);
    console.log(`- Groups with video: ${stats.withVideo}`);
    console.log(`- Groups with audio: ${stats.withAudio}`);
    console.log(`- Groups with transcript: ${stats.withTranscript}`);
    console.log(`\nConfidence Distribution:`);
    console.log(`- High (≥70%): ${stats.highConfidence}`);
    console.log(`- Medium (40-69%): ${stats.mediumConfidence}`);
    console.log(`- Low (<40%): ${stats.lowConfidence}`);

    console.log('\n=== Sample Groups ===\n');
    groups.slice(0, 5).forEach((group, index) => {
      console.log(`Group ${index + 1} (ID: ${group.id}):`);
      console.log(`- Confidence: ${group.metadata.confidence}%`);
      console.log(`- Date: ${group.metadata.date ? group.metadata.date.raw : 'Unknown'}`);
      console.log(`- Participants: ${group.metadata.participants ? group.metadata.participants.join(', ') : 'Unknown'}`);
      console.log(`- Week: ${group.metadata.week ? group.metadata.week.raw : 'Unknown'}`);
      console.log(`- Files (${group.files.length}):`);
      group.files.forEach(file => {
        console.log(`  - ${file.name} (${file.fileType})`);
      });
      console.log('');
    });
  }
}

module.exports = DriveScanner;