/**
 * Enhanced Drive Processor V5
 * Improves metadata extraction with:
 * 1. High-fidelity extraction from transcript/chat content
 * 2. Folder hierarchy analysis
 * 3. Smart pattern matching for non-standard folder names
 * 4. Proper integration with CompleteSmartNameStandardizer
 */

const IntegratedDriveProcessorV4 = require('./IntegratedDriveProcessorV4');

class EnhancedDriveProcessorV5 extends IntegratedDriveProcessorV4 {
  constructor(config, services) {
    super(config, services);
    this.driveService = services.googleDriveService;
  }

  /**
   * Enhanced metadata extraction with multiple strategies
   */
  extractSessionMetadata(session) {
    // Start with base metadata
    const metadata = super.extractSessionMetadata(session);
    
    // If we already extracted good metadata, return it
    if (metadata.topic !== 'Unknown Session' && metadata.participants.length > 0) {
      return metadata;
    }
    
    // Otherwise, try enhanced extraction
    console.log('🔍 Attempting enhanced metadata extraction...');
    
    // Strategy 1: Extract from folder hierarchy context
    if (session.folderPath) {
      const hierarchyMetadata = this.extractFromFolderHierarchy(session.folderPath);
      if (hierarchyMetadata.coach || hierarchyMetadata.student) {
        console.log(`✅ Extracted from hierarchy - Coach: ${hierarchyMetadata.coach}, Student: ${hierarchyMetadata.student}`);
        
        if (hierarchyMetadata.coach) {
          metadata.hostName = hierarchyMetadata.coach;
          metadata.hostEmail = `${hierarchyMetadata.coach.toLowerCase()}@ivymentors.co`;
        }
        
        if (hierarchyMetadata.coach && hierarchyMetadata.student) {
          metadata.topic = `${hierarchyMetadata.coach} & ${hierarchyMetadata.student}`;
          metadata.participants = [hierarchyMetadata.coach, hierarchyMetadata.student];
        }
      }
    }
    
    // Strategy 2: Smart pattern extraction for non-standard folder names
    if (metadata.topic === 'Unknown Session' && session.metadata?.folderName) {
      const smartMetadata = this.extractFromNonStandardName(session.metadata.folderName);
      if (smartMetadata.coach || smartMetadata.student) {
        console.log(`✅ Extracted from smart patterns - Coach: ${smartMetadata.coach}, Student: ${smartMetadata.student}`);
        
        if (smartMetadata.coach) {
          metadata.hostName = smartMetadata.coach;
          metadata.hostEmail = `${smartMetadata.coach.toLowerCase()}@ivymentors.co`;
        }
        
        if (smartMetadata.student) {
          metadata.participants = [smartMetadata.coach || metadata.hostName, smartMetadata.student];
          metadata.topic = `${smartMetadata.coach || metadata.hostName} & ${smartMetadata.student}`;
        }
        
        if (smartMetadata.date) {
          try {
            const parsedDate = new Date(smartMetadata.date);
            metadata.startTime = parsedDate.toISOString();
            metadata.endTime = new Date(parsedDate.getTime() + metadata.duration * 1000).toISOString();
          } catch (e) {
            console.error('Failed to parse date:', e);
          }
        }
        
        if (smartMetadata.week) {
          metadata.weekNumber = smartMetadata.week;
          metadata.weekConfidence = 80;
          metadata.weekMethod = 'folder_name_smart';
        }
      }
    }
    
    // Strategy 3: If still unknown, prepare for high-fidelity extraction
    // The CompleteSmartNameStandardizer will handle transcript/chat extraction
    if (metadata.topic === 'Unknown Session') {
      // Set a more descriptive topic that includes any available info
      const folderName = session.metadata?.folderName || '';
      if (folderName) {
        metadata.topic = folderName;
        console.log(`📝 Using folder name as topic for high-fidelity extraction: ${folderName}`);
      }
    }
    
    return metadata;
  }

  /**
   * Extract metadata from folder hierarchy
   */
  extractFromFolderHierarchy(folderPath) {
    const result = { coach: null, student: null };
    
    if (!folderPath || !Array.isArray(folderPath)) return result;
    
    // Known coach names
    const knownCoaches = ['jenny', 'alan', 'andrew', 'rishi', 'katie', 'marissa', 'juli', 'erin', 'aditi'];
    
    for (let i = 0; i < folderPath.length; i++) {
      const folder = folderPath[i];
      const folderLower = folder.toLowerCase();
      
      // Check for coach folder
      if (folderLower.includes('coach ')) {
        const coachMatch = folder.match(/Coach\s+([A-Za-z]+)/i);
        if (coachMatch) {
          result.coach = coachMatch[1];
        }
      }
      
      // Check if folder name is a known coach
      for (const coach of knownCoaches) {
        if (folderLower.includes(coach)) {
          result.coach = coach.charAt(0).toUpperCase() + coach.slice(1);
          break;
        }
      }
      
      // Check if previous folder was a coach folder
      if (i > 0 && result.coach) {
        // This might be a student folder
        if (!folder.includes('OLD_') && /^[A-Z][a-z]+/.test(folder)) {
          result.student = folder.split(/\s+/)[0]; // Take first name
        }
      }
    }
    
    return result;
  }

  /**
   * Extract metadata from non-standard folder names
   */
  extractFromNonStandardName(folderName) {
    const result = { coach: null, student: null, date: null, week: null };
    
    // Known coach names for reference
    const knownCoaches = ['jenny', 'alan', 'andrew', 'rishi', 'katie', 'marissa', 'juli', 'erin', 'aditi'];
    
    // Pattern strategies
    const patterns = [
      // Email subject format: "Re: Student/ Parent: Program - Time with Coach - Date"
      {
        regex: /Re:\s*([A-Za-z]+)(?:\/[^:]*)?:.*?(?:with|w\/)\s+([A-Za-z]+)(?:\s*-\s*(.+))?/i,
        extract: (match) => ({ 
          student: match[1], 
          coach: match[2],
          date: match[3] 
        })
      },
      // Format: "Student - Coach Meeting"
      {
        regex: /^([A-Za-z]+)\s*-\s*([A-Za-z]+)\s+Meeting/i,
        extract: (match) => ({ student: match[1], coach: match[2] })
      },
      // Format: "Meeting with Student and Coach"
      {
        regex: /Meeting\s+with\s+([A-Za-z]+)\s+and\s+([A-Za-z]+)/i,
        extract: (match) => ({ student: match[1], coach: match[2] })
      },
      // Format: "Coach Name - Student Name" or vice versa
      {
        regex: /^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*[-–]\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/,
        extract: (match) => {
          const name1 = match[1].trim();
          const name2 = match[2].trim();
          
          // Determine which is coach based on known coaches
          const name1Lower = name1.toLowerCase();
          const name2Lower = name2.toLowerCase();
          
          for (const coach of knownCoaches) {
            if (name1Lower.includes(coach)) {
              return { coach: name1.split(/\s+/)[0], student: name2.split(/\s+/)[0] };
            } else if (name2Lower.includes(coach)) {
              return { coach: name2.split(/\s+/)[0], student: name1.split(/\s+/)[0] };
            }
          }
          
          // If no known coach found, assume first is coach
          return { coach: name1.split(/\s+/)[0], student: name2.split(/\s+/)[0] };
        }
      },
      // Format with date: "Something - Month Day, Year"
      {
        regex: /([A-Za-z]+\s+\d{1,2},\s+\d{4})/,
        extract: (match) => ({ date: match[1] })
      }
    ];
    
    // Try each pattern
    for (const pattern of patterns) {
      const match = folderName.match(pattern.regex);
      if (match) {
        const extracted = pattern.extract(match);
        if (extracted) {
          Object.assign(result, extracted);
          if (result.coach && result.student) break; // Found both, stop looking
        }
      }
    }
    
    // Extract week if present
    const weekMatch = folderName.match(/[Ww]eek\s*(\d+)|[Ww]k\s*(\d+)|#(\d+)/);
    if (weekMatch) {
      result.week = weekMatch[1] || weekMatch[2] || weekMatch[3];
    }
    
    // Extract date if not already found
    if (!result.date) {
      const dateMatch = folderName.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        result.date = dateMatch[1];
      }
    }
    
    return result;
  }

  /**
   * Override processRecording to add folder path context
   */
  async processRecording(session) {
    // Add folder path context if available
    if (session.folderId && this.driveService) {
      try {
        session.folderPath = await this.getFolderPath(session.folderId);
        console.log(`📁 Folder context: ${session.folderPath.join(' / ')}`);
      } catch (error) {
        console.log('Could not get folder path:', error.message);
      }
    }
    
    // Call parent processRecording with enhanced session data
    return super.processRecording(session);
  }

  /**
   * Get folder path hierarchy
   */
  async getFolderPath(folderId) {
    const path = [];
    let currentId = folderId;
    const maxDepth = 10;
    
    for (let depth = 0; depth < maxDepth && currentId; depth++) {
      try {
        const folder = await this.driveService.getFile(currentId);
        if (!folder) break;
        
        path.unshift(folder.name);
        
        if (folder.parents && folder.parents.length > 0) {
          currentId = folder.parents[0];
        } else {
          break;
        }
      } catch (error) {
        console.error('Error getting folder:', error.message);
        break;
      }
    }
    
    return path;
  }

  /**
   * Build recording object with enhanced metadata
   */
  buildRecordingObject(session, extractedMetadata) {
    const recording = super.buildRecordingObject(session, extractedMetadata);
    
    // Ensure proper data flow for high-fidelity extraction
    if (session.transcriptContent) {
      recording.transcriptContent = session.transcriptContent;
    }
    
    if (session.chatContent) {
      recording.chatContent = session.chatContent;
    }
    
    // Add folder context for better extraction
    if (session.folderPath) {
      recording.folderContext = session.folderPath.join(' / ');
    }
    
    return recording;
  }
}

module.exports = EnhancedDriveProcessorV5;