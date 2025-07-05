// Recording Source Manager - Manages multiple recording sources
// This is NEW and doesn't modify any existing code

const DriveScanner = require('../drive-source/services/DriveScanner');
const S3IvylevelScanner = require('../drive-source/services/S3IvylevelScanner');
const RecordingMatcher = require('../drive-source/services/RecordingMatcherV2');
const IntegratedDriveProcessorV4 = require('../drive-source/services/IntegratedDriveProcessorV4');

class RecordingSourceManager {
  constructor(config, services = {}) {
    this.config = config;
    this.services = services;
    this.sources = new Map();
    
    // Initialize available sources
    this.initializeSources();
  }

  initializeSources() {
    // Source 1 & 2: Existing Zoom webhook processing - DO NOT MODIFY
    // This is handled by existing code
    
    // Source 3: Drive source (NEW)
    if (this.config.driveSource && this.config.driveSource.enabled) {
      this.sources.set('drive', {
        name: 'Google Drive Historical Recordings',
        scanner: new S3IvylevelScanner(this.config),
        matcher: new RecordingMatcher(),
        processor: new IntegratedDriveProcessorV4(this.config, this.services),
        enabled: true
      });
    }
  }

  // Get available sources
  getAvailableSources() {
    const sources = [];
    
    // Always include existing sources (they're handled elsewhere)
    sources.push({
      id: 'zoom-webhook',
      name: 'Zoom Cloud Recordings (Real-time)',
      type: 'webhook',
      enabled: true,
      description: 'Processes recordings from Zoom webhooks'
    });
    
    sources.push({
      id: 'zoom-batch',
      name: 'Zoom Cloud Recordings (Batch)',
      type: 'batch',
      enabled: true,
      description: 'Batch processes recordings from Zoom API'
    });
    
    // Add drive source if enabled
    if (this.sources.has('drive')) {
      sources.push({
        id: 'drive',
        name: 'Google Drive Historical Recordings',
        type: 'scan',
        enabled: true,
        description: 'Scans and processes recordings from Google Drive'
      });
    }
    
    return sources;
  }

  // Process recordings from drive source ONLY
  async processDriveSource(options = {}) {
    const driveSource = this.sources.get('drive');
    if (!driveSource || !driveSource.enabled) {
      throw new Error('Drive source is not enabled');
    }

    const results = {
      scanned: 0,
      processed: 0,
      failed: 0,
      skipped: 0
    };

    try {
      // Step 1: Scan for recordings
      console.log('🔍 Scanning Google Drive for recordings...');
      const { folderId, coachName, maxSessions = 10 } = options;
      
      let targetFolderId = folderId;
      if (!targetFolderId && coachName && this.config.driveSource.coachFolders[coachName]) {
        targetFolderId = this.config.driveSource.coachFolders[coachName];
      }
      
      if (!targetFolderId) {
        targetFolderId = this.config.driveSource.s3IvylevelFolderId;
      }

      const files = await driveSource.scanner.scanFolder(targetFolderId, {
        maxDepth: this.config.driveSource.scanOptions.maxDepth || 5,
        minFileSize: this.config.driveSource.scanOptions.minFileSize || 100 * 1024
      });

      results.scanned = files.length;
      console.log(`✅ Found ${files.length} files`);

      // Step 2: Group into sessions
      console.log('\n📊 Grouping files into sessions...');
      const sessions = await driveSource.matcher.matchRecordings(files);
      const { validSessions } = driveSource.matcher.validateSessions(sessions);
      
      console.log(`✅ Identified ${validSessions.length} valid sessions`);

      // Step 3: Process sessions
      const sessionsToProcess = validSessions.slice(0, maxSessions);
      console.log(`\n🚀 Processing ${sessionsToProcess.length} sessions...`);
      
      const processingResults = await driveSource.processor.processRecordingSessions(sessionsToProcess);
      
      results.processed = processingResults.successful.length;
      results.failed = processingResults.failed.length;
      results.skipped = processingResults.skipped.length;

      return {
        success: true,
        results,
        details: processingResults
      };

    } catch (error) {
      console.error('Error processing drive source:', error);
      return {
        success: false,
        error: error.message,
        results
      };
    }
  }

  // Get processing statistics
  async getStatistics() {
    const stats = {
      sources: {}
    };

    // Get existing source stats (would be implemented by existing code)
    stats.sources['zoom-webhook'] = {
      processed: 'Handled by existing system',
      active: true
    };

    stats.sources['zoom-batch'] = {
      processed: 'Handled by existing system',
      active: true
    };

    // Get drive source stats if enabled
    if (this.sources.has('drive')) {
      stats.sources['drive'] = {
        available: true,
        lastRun: null,
        totalProcessed: 0
      };
    }

    return stats;
  }

  // Scan specific coach folder
  async scanCoachFolder(coachName) {
    const driveSource = this.sources.get('drive');
    if (!driveSource) {
      throw new Error('Drive source not available');
    }

    const coachFolderId = this.config.driveSource.coachFolders[coachName];
    if (!coachFolderId) {
      throw new Error(`Unknown coach: ${coachName}`);
    }

    console.log(`📁 Scanning ${coachName}'s folder...`);
    const files = await driveSource.scanner.scanFolder(coachFolderId, {
      maxDepth: 3,
      minFileSize: 100 * 1024
    });

    const sessions = await driveSource.matcher.matchRecordings(files);
    const { validSessions } = driveSource.matcher.validateSessions(sessions);

    return {
      coach: coachName,
      folderId: coachFolderId,
      filesFound: files.length,
      sessionsFound: validSessions.length,
      sessions: validSessions.map(s => ({
        id: s.id,
        fileCount: s.files.length,
        metadata: s.metadata
      }))
    };
  }
}

module.exports = RecordingSourceManager;