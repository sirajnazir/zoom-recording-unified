const crypto = require('crypto');

class RecordingMatcherV2 {
  constructor() {
    // Increase threshold to 0.8 to prevent false matches
    this.similarityThreshold = 0.8;
    this.fileAssociationRules = [
      {
        name: 'same_timestamp_prefix',
        weight: 0.5,  // Most important - files from same recording have same timestamp
        matcher: (file1, file2) => {
          // Match files with same GMT timestamp prefix
          const timestamp1 = file1.name.match(/GMT\d{8}-\d{6}/);
          const timestamp2 = file2.name.match(/GMT\d{8}-\d{6}/);
          return timestamp1 && timestamp2 && timestamp1[0] === timestamp2[0];
        }
      },
      {
        name: 'same_base_name',
        weight: 0.3,
        matcher: (file1, file2) => {
          const base1 = this.getBaseName(file1.name);
          const base2 = this.getBaseName(file2.name);
          return this.calculateStringSimilarity(base1, base2) > 0.9;  // Increase similarity requirement
        }
      },
      {
        name: 'same_date',
        weight: 0.2,
        matcher: (file1, file2) => {
          if (!file1.possibleDate || !file2.possibleDate) return false;
          return file1.possibleDate.raw === file2.possibleDate.raw;
        }
      },
      {
        name: 'same_participants',
        weight: 0.1,
        matcher: (file1, file2) => {
          if (!file1.possibleParticipants || !file2.possibleParticipants) return false;
          const set1 = new Set(file1.possibleParticipants);
          const set2 = new Set(file2.possibleParticipants);
          const intersection = [...set1].filter(x => set2.has(x));
          // Require all participants to match
          return intersection.length === set1.size && intersection.length === set2.size;
        }
      },
      {
        name: 'same_folder',
        weight: 0.3,  // Increased weight - files in same folder are very likely related
        matcher: (file1, file2) => file1.parentFolderId === file2.parentFolderId
      }
    ];
  }

  getBaseName(fileName) {
    return fileName
      // Remove file extensions
      .replace(/\.(mp4|m4a|txt|vtt|srt|json)$/i, '')
      // Remove resolution suffixes
      .replace(/_\d+x\d+$/i, '')
      .replace(/_gallery/i, '')
      // Remove type suffixes
      .replace(/[-_](video|audio|transcript|chat|caption)/gi, '')
      // Remove duplicate numbering
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
    if (file1.id === file2.id) return { score: 0, appliedRules: [], isMatch: false };
    
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

  mergeMetadata(existing, additional) {
    const merged = { ...existing };
    
    if (additional.date && !merged.date) merged.date = additional.date;
    if (additional.week && !merged.week) merged.week = additional.week;
    if (additional.folderName && !merged.folderName) merged.folderName = additional.folderName;
    
    merged.hasVideo = merged.hasVideo || additional.hasVideo;
    merged.hasAudio = merged.hasAudio || additional.hasAudio;
    merged.hasTranscript = merged.hasTranscript || additional.hasTranscript;
    merged.hasChat = merged.hasChat || additional.hasChat;
    
    const allParticipants = new Set([...merged.participants, ...additional.participants]);
    merged.participants = Array.from(allParticipants);
    
    return merged;
  }

  generateSessionId() {
    return crypto.randomBytes(8).toString('hex');
  }

  validateSessions(sessions) {
    const validSessions = [];
    const invalidSessions = [];
    
    for (const session of sessions) {
      const reasons = [];
      
      if (!session.files || session.files.length === 0) {
        reasons.push('No files');
      } else if (!session.metadata.hasVideo && !session.metadata.hasAudio) {
        reasons.push('No video or audio file');
      }
      
      if (session.confidence < 30) {
        reasons.push('Very low confidence');
      }
      
      if (reasons.length === 0) {
        validSessions.push(session);
      } else {
        invalidSessions.push({ ...session, reasons, reason: reasons.join(', ') });
      }
    }
    
    console.log(`\nValidation Results:`);
    console.log(`- Valid sessions: ${validSessions.length}`);
    console.log(`- Invalid sessions: ${invalidSessions.length}`);
    
    if (invalidSessions.length > 0) {
      console.log('\nInvalid sessions:');
      invalidSessions.forEach(session => {
        console.log(`- Session ${session.id}: ${session.reason}`);
      });
    }
    
    return { validSessions, invalidSessions };
  }
}

module.exports = RecordingMatcherV2;