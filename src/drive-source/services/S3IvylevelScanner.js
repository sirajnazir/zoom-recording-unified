const { google } = require('googleapis');
const DriveScanner = require('./DriveScanner');
const path = require('path');

class S3IvylevelScanner extends DriveScanner {
  constructor(config) {
    super(config);
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
    
    // Ivylevel specific patterns
    this.ivylevelPatterns = {
      studentPatterns: [
        /S\d+[-_]?Ivylevel/i,
        /Ivylevel[-_]?S\d+/i,
        /Student[-_]?\d+/i,
        /S\d+[-_]?Session/i,
        /Session[-_]?S\d+/i
      ],
      sessionTypePatterns: [
        /coaching/i,
        /mentoring/i,
        /tutoring/i,
        /consultation/i,
        /review/i,
        /feedback/i,
        /assessment/i,
        /evaluation/i
      ],
      programPatterns: [
        /data[-_]?science/i,
        /machine[-_]?learning/i,
        /web[-_]?dev/i,
        /full[-_]?stack/i,
        /frontend/i,
        /backend/i,
        /python/i,
        /javascript/i,
        /react/i,
        /node/i,
        /sql/i,
        /statistics/i,
        /algorithm/i
      ]
    };
    
    // Learned patterns storage
    this.learnedPatterns = {
      folderStructures: new Map(),
      namingConventions: new Set(),
      participantNames: new Set(),
      dateFormats: new Map()
    };
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
      () => super.getFolderInfo(folderId),
      `Get folder info for ${folderId}`
    );
    
    this.cache.set(cacheKey, {
      data: folderInfo,
      timestamp: Date.now()
    });
    
    return folderInfo;
  }

  async scanFolder(folderId, options = {}) {
    const enhancedOptions = {
      ...options,
      maxDepth: options.maxDepth || 7, // Deeper scan for S3-Ivylevel
      excludeFolders: [
        'Processed', 
        'Archive', 
        'Trash', 
        'Old', 
        'Backup',
        'Test',
        'temp',
        'tmp',
        ...(options.excludeFolders || [])
      ]
    };

    // First, analyze the folder structure to learn patterns (with reduced depth)
    console.log('\n🔍 Analyzing S3-Ivylevel folder structure...');
    await this.analyzeFolderStructure(folderId, 0, 2); // Reduced from 3 to 2
    
    console.log('\n📊 Learned patterns:');
    console.log(`- Folder structures: ${this.learnedPatterns.folderStructures.size}`);
    console.log(`- Naming conventions: ${this.learnedPatterns.namingConventions.size}`);
    console.log(`- Participant names: ${this.learnedPatterns.participantNames.size}`);
    
    // Then scan with enhanced patterns
    return super.scanFolder(folderId, enhancedOptions);
  }

  async analyzeFolderStructure(folderId, currentDepth = 0, maxAnalysisDepth = 2) {
    if (currentDepth > maxAnalysisDepth) return;
    
    try {
      const folderInfo = await this.getCachedFolderInfo(folderId);
      const folderPath = folderInfo.name;
      
      // Learn from folder name
      this.learnFromName(folderPath, 'folder');
      
      // Analyze folder hierarchy pattern
      const hierarchyKey = `depth_${currentDepth}`;
      if (!this.learnedPatterns.folderStructures.has(hierarchyKey)) {
        this.learnedPatterns.folderStructures.set(hierarchyKey, new Set());
      }
      this.learnedPatterns.folderStructures.get(hierarchyKey).add(folderPath);
      
      // Get subfolders for pattern analysis (with smart retry)
      const response = await this.withSmartRetry(
        () => this.drive.files.list({
          q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
          fields: 'files(id, name)',
          pageSize: 50 // Reduced from 100 to 50
        }),
        `List subfolders for ${folderId}`
      );
      
      // Analyze subfolder patterns
      if (response.data.files && response.data.files.length > 0) {
        const subfolderNames = response.data.files.map(f => f.name);
        this.analyzeNamingPattern(subfolderNames);
        
        // Recursively analyze a smaller sample of subfolders
        const sampleSize = Math.min(3, response.data.files.length); // Reduced from 5 to 3
        for (let i = 0; i < sampleSize; i++) {
          await this.analyzeFolderStructure(
            response.data.files[i].id, 
            currentDepth + 1, 
            maxAnalysisDepth
          );
        }
      }
    } catch (error) {
      console.error(`Error analyzing folder structure: ${error.message}`);
    }
  }

  learnFromName(name, type = 'file') {
    // Extract potential participant names
    const nameMatches = name.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g);
    if (nameMatches) {
      nameMatches.forEach(match => {
        // Filter out common words
        const commonWords = ['Zoom', 'Recording', 'Meeting', 'Session', 'Week', 'Module', 'Ivylevel'];
        if (!commonWords.includes(match)) {
          this.learnedPatterns.participantNames.add(match);
        }
      });
    }
    
    // Learn naming conventions
    const conventions = [
      { pattern: /^\d{4}-\d{2}-\d{2}/, convention: 'date-first' },
      { pattern: /^Week\s*\d+/i, convention: 'week-first' },
      { pattern: /^Session\s*\d+/i, convention: 'session-first' },
      { pattern: /^S\d+[-_]?Ivylevel/i, convention: 's3-ivylevel' },
      { pattern: /_recording_/i, convention: 'underscore-separator' },
      { pattern: /-recording-/i, convention: 'dash-separator' }
    ];
    
    conventions.forEach(({ pattern, convention }) => {
      if (pattern.test(name)) {
        this.learnedPatterns.namingConventions.add(convention);
      }
    });
  }

  analyzeNamingPattern(names) {
    // Detect common prefixes/suffixes
    if (names.length < 2) return;
    
    // Find common patterns
    const patterns = {
      hasWeekNumbers: names.filter(n => /week\s*\d+/i.test(n)).length / names.length,
      hasSessionNumbers: names.filter(n => /session\s*\d+/i.test(n)).length / names.length,
      hasDates: names.filter(n => /\d{4}[-_]\d{2}[-_]\d{2}/.test(n)).length / names.length,
      hasStudentIds: names.filter(n => /S\d+/i.test(n)).length / names.length
    };
    
    console.log(`  Folder pattern analysis: Week(${(patterns.hasWeekNumbers * 100).toFixed(0)}%) Session(${(patterns.hasSessionNumbers * 100).toFixed(0)}%) Date(${(patterns.hasDates * 100).toFixed(0)}%) StudentID(${(patterns.hasStudentIds * 100).toFixed(0)}%)`);
  }

  isPotentialRecording(file, includePatterns = [], minFileSize = 0) {
    // First check with parent method
    const isBasicRecording = super.isPotentialRecording(file, includePatterns, minFileSize);
    
    // Then apply S3-Ivylevel specific checks
    if (!isBasicRecording) {
      const fileName = file.name.toLowerCase();
      
      // Check against Ivylevel patterns
      const isIvylevelRecording = 
        this.ivylevelPatterns.studentPatterns.some(p => p.test(file.name)) ||
        this.ivylevelPatterns.sessionTypePatterns.some(p => p.test(file.name)) ||
        this.ivylevelPatterns.programPatterns.some(p => p.test(file.name));
      
      if (isIvylevelRecording) {
        const hasMediaFile = this.fileTypeMap.video.some(ext => fileName.endsWith(ext)) ||
                            this.fileTypeMap.audio.some(ext => fileName.endsWith(ext));
        return hasMediaFile;
      }
    }
    
    return isBasicRecording;
  }

  enrichFileMetadata(file, parentFolderId, parentFolderName) {
    const baseMetadata = super.enrichFileMetadata(file, parentFolderId, parentFolderName);
    
    // Add S3-Ivylevel specific metadata
    const ivylevelMetadata = {
      studentId: this.extractStudentId(file.name) || this.extractStudentId(parentFolderName),
      sessionType: this.extractSessionType(file.name) || this.extractSessionType(parentFolderName),
      program: this.extractProgram(file.name) || this.extractProgram(parentFolderName),
      cohort: this.extractCohort(file.name) || this.extractCohort(parentFolderName),
      coach: this.extractCoach(file.name) || this.extractCoach(parentFolderName)
    };
    
    // Enhance participant detection with learned names
    const enhancedParticipants = this.enhanceParticipantDetection(
      baseMetadata.possibleParticipants || [],
      file.name,
      parentFolderName
    );
    
    return {
      ...baseMetadata,
      ...ivylevelMetadata,
      possibleParticipants: enhancedParticipants,
      confidence: this.calculateIvylevelConfidence(file.name, parentFolderName, ivylevelMetadata)
    };
  }

  extractStudentId(text) {
    const patterns = [
      /S(\d+)[-_]?Ivylevel/i,
      /Ivylevel[-_]?S(\d+)/i,
      /Student[-_]?(\d+)/i,
      /ID[-_]?(\d+)/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return `S${match[1]}`;
      }
    }
    return null;
  }

  extractSessionType(text) {
    for (const pattern of this.ivylevelPatterns.sessionTypePatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0].replace(/[-_]/g, ' ').trim();
      }
    }
    return null;
  }

  extractProgram(text) {
    for (const pattern of this.ivylevelPatterns.programPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0].replace(/[-_]/g, ' ').trim();
      }
    }
    return null;
  }

  extractCohort(text) {
    const patterns = [
      /Cohort[-_]?(\d+)/i,
      /Batch[-_]?(\d+)/i,
      /(\d{4})[-_]?(Spring|Summer|Fall|Winter)/i,
      /C(\d+)/
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0];
      }
    }
    return null;
  }

  extractCoach(text) {
    for (const pattern of this.ivylevelPatterns.studentPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    // Check learned participant names
    for (const name of this.learnedPatterns.participantNames) {
      if (text.includes(name) && this.isLikelyCoachName(name, text)) {
        return name;
      }
    }
    
    return null;
  }

  isLikelyCoachName(name, context) {
    const coachIndicators = ['coach', 'mentor', 'instructor', 'with', 'by'];
    const contextLower = context.toLowerCase();
    const nameLower = name.toLowerCase();
    
    return coachIndicators.some(indicator => {
      const pattern = new RegExp(`${indicator}\\s*${nameLower}|${nameLower}\\s*${indicator}`, 'i');
      return pattern.test(context);
    });
  }

  enhanceParticipantDetection(baseParticipants, fileName, folderName) {
    const allParticipants = new Set(baseParticipants);
    
    // Add participants from learned patterns
    for (const learnedName of this.learnedPatterns.participantNames) {
      if (fileName.includes(learnedName) || folderName.includes(learnedName)) {
        allParticipants.add(learnedName);
      }
    }
    
    // Extract from S3-Ivylevel specific patterns
    const coach = this.extractCoach(`${fileName} ${folderName}`);
    if (coach) allParticipants.add(coach);
    
    // Try to identify student names from context
    const studentNamePattern = /(?:with|and|&)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi;
    const matches = [...`${fileName} ${folderName}`.matchAll(studentNamePattern)];
    matches.forEach(match => {
      if (match[1] && !['Zoom', 'Recording', 'Meeting'].includes(match[1])) {
        allParticipants.add(match[1]);
      }
    });
    
    return Array.from(allParticipants);
  }

  calculateIvylevelConfidence(fileName, folderName, ivylevelMetadata) {
    let score = super.calculateConfidence(fileName, folderName);
    
    // Add S3-Ivylevel specific scoring
    if (ivylevelMetadata.studentId) score += 15;
    if (ivylevelMetadata.sessionType) score += 10;
    if (ivylevelMetadata.program) score += 5;
    if (ivylevelMetadata.cohort) score += 5;
    if (ivylevelMetadata.coach) score += 10;
    
    // Bonus for matching learned patterns
    if (Array.from(this.learnedPatterns.namingConventions).some(conv => 
      this.matchesConvention(fileName, conv))) {
      score += 10;
    }
    
    return Math.min(score, 100);
  }

  matchesConvention(fileName, convention) {
    const conventionPatterns = {
      'date-first': /^\d{4}-\d{2}-\d{2}/,
      'week-first': /^Week\s*\d+/i,
      'session-first': /^Session\s*\d+/i,
      's3-ivylevel': /^S\d+[-_]?Ivylevel/i,
      'underscore-separator': /_/,
      'dash-separator': /-/
    };
    
    return conventionPatterns[convention] && conventionPatterns[convention].test(fileName);
  }

  generateGroupKey(file) {
    const parts = [];
    
    // Include S3-Ivylevel specific identifiers
    if (file.studentId) parts.push(file.studentId);
    if (file.coach) parts.push(file.coach);
    if (file.possibleDate) parts.push(file.possibleDate.raw);
    if (file.possibleWeek) parts.push(`week${file.possibleWeek.number}`);
    if (file.sessionType) parts.push(file.sessionType.replace(/\s+/g, ''));
    
    // Fallback to parent method if no specific identifiers
    if (parts.length === 0) {
      return super.generateGroupKey(file);
    }
    
    return parts.join('_').toLowerCase().replace(/[^a-z0-9_]/g, '');
  }

  /**
   * Get all coach folders from the main S3-Ivylevel folder
   */
  async getCoachFolders(mainFolderId = null) {
    console.log('  🔍 Discovering coach folders in main folder...');
    
    const folderId = mainFolderId || this.config.driveSource?.s3IvylevelFolderId;
    console.log(`  🔍 Using folder ID: ${folderId}`);
    
    if (!folderId) {
      console.error('  ❌ No folder ID provided or configured');
      return [];
    }
    
    try {
      const response = await this.withSmartRetry(
        () => this.drive.files.list({
          q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
          fields: 'files(id,name,createdTime,modifiedTime)',
          pageSize: 100
        }),
        `List coach folders in ${folderId}`
      );
      
      const folders = response.data.files || [];
      
      // Filter for coach folders (those with "Coach" in the name or likely coach names)
      const coachFolders = folders.filter(folder => {
        const name = folder.name.toLowerCase();
        return name.includes('coach') || 
               name.includes('mentor') || 
               name.includes('instructor') ||
               this.isLikelyCoachName(folder.name, folder.name);
      });
      
      console.log(`  ✓ Found ${coachFolders.length} coach folders out of ${folders.length} total folders`);
      
      return coachFolders.map(folder => ({
        name: folder.name,
        id: folder.id,
        createdTime: folder.createdTime,
        modifiedTime: folder.modifiedTime
      }));
      
    } catch (error) {
      console.error(`  ✗ Failed to get coach folders:`, error.message);
      return [];
    }
  }

  generateReport(groups) {
    super.generateReport(groups);
    
    // Add S3-Ivylevel specific report
    console.log('\n=== S3-Ivylevel Specific Analysis ===\n');
    
    const ivylevelStats = {
      withStudentId: groups.filter(g => g.files.some(f => f.studentId)).length,
      withCoach: groups.filter(g => g.files.some(f => f.coach)).length,
      bySessionType: {},
      byProgram: {}
    };
    
    groups.forEach(group => {
      group.files.forEach(file => {
        if (file.sessionType) {
          ivylevelStats.bySessionType[file.sessionType] = 
            (ivylevelStats.bySessionType[file.sessionType] || 0) + 1;
        }
        if (file.program) {
          ivylevelStats.byProgram[file.program] = 
            (ivylevelStats.byProgram[file.program] || 0) + 1;
        }
      });
    });
    
    console.log('S3-Ivylevel Identifiers:');
    console.log(`- Groups with Student ID: ${ivylevelStats.withStudentId}`);
    console.log(`- Groups with identified Coach: ${ivylevelStats.withCoach}`);
    
    console.log('\nSession Types:');
    Object.entries(ivylevelStats.bySessionType)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .forEach(([type, count]) => {
        console.log(`- ${type}: ${count}`);
      });
    
    console.log('\nPrograms:');
    Object.entries(ivylevelStats.byProgram)
      .sort(([,a], [,b]) => b - a)
      .forEach(([program, count]) => {
        console.log(`- ${program}: ${count}`);
      });
  }
}

module.exports = S3IvylevelScanner;