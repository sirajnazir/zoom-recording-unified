const crypto = require('crypto');

class RecordingMatcher {
  constructor() {
    this.similarityThreshold = 0.7;
    this.fileAssociationRules = [
      {
        name: 'same_base_name',
        weight: 0.4,
        matcher: (file1, file2) => {
          const base1 = this.getBaseName(file1.name);
          const base2 = this.getBaseName(file2.name);
          return this.calculateStringSimilarity(base1, base2) > 0.8;
        }
      },
      {
        name: 'same_date',
        weight: 0.3,
        matcher: (file1, file2) => {
          if (!file1.possibleDate || !file2.possibleDate) return false;
          return file1.possibleDate.raw === file2.possibleDate.raw;
        }
      },
      {
        name: 'same_participants',
        weight: 0.2,
        matcher: (file1, file2) => {
          if (!file1.possibleParticipants || !file2.possibleParticipants) return false;
          const set1 = new Set(file1.possibleParticipants);
          const set2 = new Set(file2.possibleParticipants);
          const intersection = [...set1].filter(x => set2.has(x));
          return intersection.length > 0;
        }
      },
      {
        name: 'same_folder',
        weight: 0.1,
        matcher: (file1, file2) => file1.parentFolderId === file2.parentFolderId
      }
    ];
  }

  getBaseName(fileName) {
    return fileName
      .replace(/\.(mp4|m4a|txt|vtt|srt|json)$/i, '')
      .replace(/[-_](video|audio|transcript|chat|caption)/gi, '')
      .replace(/\s*\(\d+\)$/, '')
      .trim();
  }

  calculateStringSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  calculateFileSimilarity(file1, file2) {
    if (file1.id === file2.id) return 0;
    
    let totalScore = 0;
    const appliedRules = [];
    
    for (const rule of this.fileAssociationRules) {
      if (rule.matcher(file1, file2)) {
        totalScore += rule.weight;
        appliedRules.push(rule.name);
      }
    }
    
    return {
      score: totalScore,
      appliedRules,
      isMatch: totalScore >= this.similarityThreshold
    };
  }

  async matchRecordings(files) {
    console.log(`\nMatching ${files.length} files into recording sessions...`);
    
    const sessions = [];
    const processed = new Set();
    
    for (let i = 0; i < files.length; i++) {
      if (processed.has(files[i].id)) continue;
      
      const session = {
        id: this.generateSessionId(),
        files: [files[i]],
        metadata: this.extractSessionMetadata([files[i]]),
        confidence: files[i].confidence || 0
      };
      
      processed.add(files[i].id);
      
      for (let j = i + 1; j < files.length; j++) {
        if (processed.has(files[j].id)) continue;
        
        const similarity = this.calculateFileSimilarity(files[i], files[j]);
        
        if (similarity.isMatch) {
          session.files.push(files[j]);
          processed.add(files[j].id);
          session.metadata = this.mergeMetadata(session.metadata, this.extractSessionMetadata([files[j]]));
          session.confidence = Math.max(session.confidence, files[j].confidence || 0);
          
          console.log(`Matched: ${files[i].name} <-> ${files[j].name} (score: ${similarity.score.toFixed(2)})`);
        }
      }
      
      sessions.push(session);
    }
    
    console.log(`Created ${sessions.length} recording sessions from ${files.length} files`);
    
    return sessions;
  }

  extractSessionMetadata(files) {
    const metadata = {
      date: null,
      participants: new Set(),
      week: null,
      hasVideo: false,
      hasAudio: false,
      hasTranscript: false,
      hasChat: false,
      duration: null,
      folderName: null
    };
    
    for (const file of files) {
      if (file.possibleDate && !metadata.date) {
        metadata.date = file.possibleDate;
      }
      
      if (file.possibleParticipants) {
        file.possibleParticipants.forEach(p => metadata.participants.add(p));
      }
      
      if (file.possibleWeek && !metadata.week) {
        metadata.week = file.possibleWeek;
      }
      
      metadata.hasVideo = metadata.hasVideo || file.fileType === 'video';
      metadata.hasAudio = metadata.hasAudio || file.fileType === 'audio';
      metadata.hasTranscript = metadata.hasTranscript || file.fileType === 'transcript';
      metadata.hasChat = metadata.hasChat || file.fileType === 'chat';
      
      if (!metadata.folderName && file.parentFolderName) {
        metadata.folderName = file.parentFolderName;
      }
    }
    
    metadata.participants = Array.from(metadata.participants);
    return metadata;
  }

  mergeMetadata(meta1, meta2) {
    const merged = {
      date: meta1.date || meta2.date,
      participants: Array.from(new Set([...meta1.participants, ...meta2.participants])),
      week: meta1.week || meta2.week,
      hasVideo: meta1.hasVideo || meta2.hasVideo,
      hasAudio: meta1.hasAudio || meta2.hasAudio,
      hasTranscript: meta1.hasTranscript || meta2.hasTranscript,
      hasChat: meta1.hasChat || meta2.hasChat,
      duration: meta1.duration || meta2.duration,
      folderName: meta1.folderName || meta2.folderName
    };
    
    return merged;
  }

  generateSessionId() {
    return crypto.randomBytes(8).toString('hex');
  }

  validateSessions(sessions) {
    const validSessions = [];
    const invalidSessions = [];
    
    for (const session of sessions) {
      const validation = this.validateSession(session);
      
      if (validation.isValid) {
        validSessions.push(session);
      } else {
        invalidSessions.push({
          session,
          reasons: validation.reasons
        });
      }
    }
    
    console.log(`\nValidation Results:`);
    console.log(`- Valid sessions: ${validSessions.length}`);
    console.log(`- Invalid sessions: ${invalidSessions.length}`);
    
    if (invalidSessions.length > 0) {
      console.log('\nInvalid sessions:');
      invalidSessions.slice(0, 5).forEach(({ session, reasons }) => {
        console.log(`- Session ${session.id}: ${reasons.join(', ')}`);
      });
    }
    
    return { validSessions, invalidSessions };
  }

  validateSession(session) {
    const reasons = [];
    
    if (!session.metadata.hasVideo && !session.metadata.hasAudio) {
      reasons.push('No video or audio file');
    }
    
    if (session.files.length === 0) {
      reasons.push('No files in session');
    }
    
    if (session.confidence < 20) {
      reasons.push('Very low confidence');
    }
    
    // Don't reject sessions with duplicate file types - they might have multiple quality versions
    // The processor will select the best quality version
    
    return {
      isValid: reasons.length === 0,
      reasons
    };
  }

  checkDuplicateFileTypes(files) {
    const typeCounts = {};
    const duplicates = [];
    
    for (const file of files) {
      typeCounts[file.fileType] = (typeCounts[file.fileType] || 0) + 1;
    }
    
    for (const [type, count] of Object.entries(typeCounts)) {
      if (count > 1 && type !== 'unknown') {
        duplicates.push(type);
      }
    }
    
    return duplicates;
  }

  generateMatchingReport(sessions) {
    console.log('\n=== Recording Matching Report ===\n');
    
    const stats = {
      totalSessions: sessions.length,
      completeRecordings: sessions.filter(s => 
        s.metadata.hasVideo && s.metadata.hasTranscript
      ).length,
      videoOnly: sessions.filter(s => 
        s.metadata.hasVideo && !s.metadata.hasAudio && !s.metadata.hasTranscript
      ).length,
      audioOnly: sessions.filter(s => 
        !s.metadata.hasVideo && s.metadata.hasAudio && !s.metadata.hasTranscript
      ).length,
      withTranscript: sessions.filter(s => s.metadata.hasTranscript).length,
      withChat: sessions.filter(s => s.metadata.hasChat).length,
      averageFilesPerSession: sessions.reduce((sum, s) => sum + s.files.length, 0) / sessions.length
    };

    console.log('Session Statistics:');
    console.log(`- Total sessions: ${stats.totalSessions}`);
    console.log(`- Complete recordings (video + transcript): ${stats.completeRecordings}`);
    console.log(`- Video only: ${stats.videoOnly}`);
    console.log(`- Audio only: ${stats.audioOnly}`);
    console.log(`- Sessions with transcript: ${stats.withTranscript}`);
    console.log(`- Sessions with chat: ${stats.withChat}`);
    console.log(`- Average files per session: ${stats.averageFilesPerSession.toFixed(1)}`);

    console.log('\n=== Sample Sessions ===\n');
    sessions.slice(0, 3).forEach((session, index) => {
      console.log(`Session ${index + 1} (ID: ${session.id}):`);
      console.log(`- Confidence: ${session.confidence}%`);
      console.log(`- Date: ${session.metadata.date ? session.metadata.date.raw : 'Unknown'}`);
      console.log(`- Participants: ${session.metadata.participants.join(', ') || 'Unknown'}`);
      console.log(`- Week: ${session.metadata.week ? session.metadata.week.raw : 'Unknown'}`);
      console.log(`- File types: ${this.getFileTypeSummary(session)}`);
      console.log(`- Files:`);
      session.files.forEach(file => {
        console.log(`  - ${file.name}`);
      });
      console.log('');
    });
  }

  getFileTypeSummary(session) {
    const types = [];
    if (session.metadata.hasVideo) types.push('video');
    if (session.metadata.hasAudio) types.push('audio');
    if (session.metadata.hasTranscript) types.push('transcript');
    if (session.metadata.hasChat) types.push('chat');
    return types.join(', ') || 'none';
  }
}

module.exports = RecordingMatcher;