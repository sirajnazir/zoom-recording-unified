const IntegratedDriveProcessor = require('./services/IntegratedDriveProcessor');
const config = require('../../config');
const fs = require('fs').promises;
const path = require('path');

class UnifiedDriveProcessor {
  constructor(config, options = {}) {
    this.config = config;
    this.batchSize = options.batchSize || 3;
    this.delayBetweenBatches = options.delayBetweenBatches || 2000;
    this.startFromIndex = options.startFromIndex || 0;
    this.maxSessions = options.maxSessions || 50;
    this.smartSessionsFile = options.smartSessionsFile || 'src/drive-source/discovered-sessions.json';
  }

  async process() {
    console.log('=== Unified Drive Processor (Using Existing Zoom Pipeline) ===\n');
    
    try {
      // Step 1: Load discovered session data (your existing pattern recognition)
      console.log(`📂 Loading discovered sessions from ${this.smartSessionsFile}...`);
      const discoveredData = JSON.parse(await fs.readFile(this.smartSessionsFile, 'utf8'));
      const smartSessions = discoveredData.sessions || [];
      
      console.log(`Found ${smartSessions.length} discovered sessions`);
      console.log(`Scan date: ${discoveredData.discoveredAt}`);
      console.log(`Total files: ${discoveredData.totalFiles}`);
      
      // Step 2: Convert to standard format (same as Zoom recordings)
      console.log('\n🔄 Converting to standard format...');
      const standardSessions = this.convertToStandardFormat(smartSessions);
      
      // Step 3: Use existing Zoom processing pipeline
      console.log('🚀 Initializing existing Zoom processing pipeline...');
      const processor = new IntegratedDriveProcessor(config);
      await processor.initialize();
      console.log('✅ Using same services as Zoom processing (standardization, sheets, GDrive)');
      console.log('🤖 AI processing enabled: High fidelity name extraction from transcripts & files');
      console.log('🧠 AI insights generation: Coaching topics, key moments, sentiment analysis');
      
      // Step 4: Process through existing pipeline
      const sessionsToProcess = standardSessions.slice(this.startFromIndex, this.startFromIndex + this.maxSessions);
      console.log(`📦 Processing ${sessionsToProcess.length} sessions through unified pipeline`);
      
      const results = {
        successful: [],
        failed: [],
        skipped: []
      };
      
      // Use same batching logic as Zoom processing
      for (let i = 0; i < sessionsToProcess.length; i += this.batchSize) {
        const batch = sessionsToProcess.slice(i, i + this.batchSize);
        const batchNumber = Math.floor(i / this.batchSize) + 1;
        const totalBatches = Math.ceil(sessionsToProcess.length / this.batchSize);
        
        console.log(`\n📦 Batch ${batchNumber}/${totalBatches} (sessions ${i + 1}-${Math.min(i + this.batchSize, sessionsToProcess.length)})`);
        
        const batchPromises = batch.map(async (session, batchIndex) => {
          const sessionIndex = i + batchIndex + 1;
          const sessionName = session.rawName || session.folderName;
          
          console.log(`  [${sessionIndex}] Processing: ${sessionName}`);
          
          try {
            // Use existing duplicate check
            const fingerprint = processor.generateFingerprint(session);
            const isDuplicate = await processor.dualTabGoogleSheetsService?.checkDuplicate?.(fingerprint);
            
            if (isDuplicate) {
              console.log(`    ⊘ Skipped (duplicate)`);
              results.skipped.push({ session, reason: 'Already processed' });
              return;
            }
            
            // Use existing processing pipeline (same as Zoom)
            const processedSession = await processor.processSession(session);
            console.log(`    ✅ Success: ${processedSession.rawName}`);
            console.log(`       Standardized: ${processedSession.nameAnalysis?.standardizedName || 'N/A'}`);
            console.log(`       Category: ${processedSession.category || 'N/A'}`);
            results.successful.push(processedSession);
            
          } catch (error) {
            console.error(`    ❌ Failed: ${error.message}`);
            results.failed.push({ session, error: error.message });
          }
        });
        
        await Promise.all(batchPromises);
        
        if (i + this.batchSize < sessionsToProcess.length) {
          console.log(`\n⏳ Waiting ${this.delayBetweenBatches/1000} seconds before next batch...`);
          await new Promise(resolve => setTimeout(resolve, this.delayBetweenBatches));
        }
      }
      
      // Summary
      console.log('\n=== Summary ===');
      console.log(`✓ Successful: ${results.successful.length}`);
      console.log(`✗ Failed: ${results.failed.length}`);
      console.log(`⊘ Skipped: ${results.skipped.length}`);
      
      if (results.successful.length > 0) {
        console.log('\n✅ Google Drive recordings processed through unified pipeline!');
        console.log('   - Same standardization as Zoom recordings');
        console.log('   - Same Google Sheets updates');
        console.log('   - Same GDrive organization');
        console.log('   - Same categorization and metadata');
      }
      
      // Show next batch info
      const nextStartIndex = this.startFromIndex + this.maxSessions;
      if (nextStartIndex < standardSessions.length) {
        console.log(`\n📋 To continue processing, run:`);
        console.log(`   node src/drive-source/unified-drive-processor.js --startFrom ${nextStartIndex} --maxSessions ${this.maxSessions}`);
        console.log(`   (${standardSessions.length - nextStartIndex} sessions remaining)`);
      }
      
    } catch (error) {
      console.error('❌ Processing failed:', error.message);
      console.error('Stack:', error.stack);
    }
  }

  convertToStandardFormat(smartSessions) {
    return smartSessions.map(smartSession => {
      // Convert discovered session format to the exact format that IntegratedDriveProcessor expects
      // (same format as Zoom recordings)
      
      const files = smartSession.files.map(file => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        fileType: file.fileType,
        webViewLink: file.webViewLink,
        createdTime: file.createdTime
      }));
      
      // Extract metadata from the discovered session
      const folderName = smartSession.metadata?.folderName || 'Unknown Session';
      const metadata = this.extractMetadata(folderName);
      
      return {
        // Use the full standardized folder name as the session name
        id: smartSession.id,
        rawName: folderName, // Keep the full standardized name
        folderName: folderName,
        folderId: smartSession.files[0]?.parentFolderId || smartSession.id,
        files: files,
        
        // Add metadata for initial categorization (will be enhanced by AI processing)
        metadata: metadata,
        
        // Mark as Google Drive source
        dataSource: 'Google Drive Import',
        
        // Standard fields expected by the processor (fallback values)
        sessionType: this.getSessionType(folderName),
        participants: this.getParticipants(folderName),
        date: this.getDate(folderName),
        week: this.getWeek(folderName),
        
        // Add file information for AI processing
        transcriptFiles: files.filter(f => f.fileType === 'transcript'),
        videoFiles: files.filter(f => f.fileType === 'video'),
        audioFiles: files.filter(f => f.fileType === 'audio'),
        chatFiles: files.filter(f => f.fileType === 'chat'),
        
        // Enable AI processing flags
        enableAIProcessing: true,
        enableTranscriptAnalysis: true,
        enableHighFidelityNameExtraction: true,
        enableInsightsGeneration: true
      };
    });
  }

  extractMetadata(folderName) {
    // Extract metadata from the already standardized folder name
    const patterns = [
      /Coaching_([^_]+)_([^_]+)_Wk(\d+)_(\d{4}-\d{2}-\d{2})/,
      /GamePlan_([^_]+)_([^_]+)_Wk(\d+)_(\d{4}-\d{2}-\d{2})/,
      /MISC_([^_]+)_(\d{4}-\d{2}-\d{2})/
    ];
    
    for (const pattern of patterns) {
      const match = folderName.match(pattern);
      if (match) {
        if (match[1] && match[2] && match[3] && match[4]) {
          const [, coach, student, week, date] = match;
          return {
            participants: [coach, student],
            date: { raw: date, parsed: new Date(date) },
            week: week,
            sessionType: folderName.startsWith('Coaching_') ? 'Coaching' : 'GamePlan',
            confidence: 95
          };
        } else if (match[1] && match[2]) {
          const [, coach, date] = match;
          return {
            participants: [coach],
            date: { raw: date, parsed: new Date(date) },
            week: 'N/A',
            sessionType: 'MISC',
            confidence: 80
          };
        }
      }
    }
    
    // Fallback
    return {
      participants: ['Unknown'],
      date: { raw: new Date().toISOString().split('T')[0], parsed: new Date() },
      week: 'Unknown',
      sessionType: 'Unknown',
      confidence: 10
    };
  }

  getSessionType(folderName) {
    if (folderName.startsWith('Coaching_')) return 'Coaching';
    if (folderName.startsWith('GamePlan_')) return 'GamePlan';
    if (folderName.startsWith('MISC_')) return 'MISC';
    return 'Unknown';
  }

  getParticipants(folderName) {
    const metadata = this.extractMetadata(folderName);
    return metadata.participants;
  }

  getDate(folderName) {
    const metadata = this.extractMetadata(folderName);
    return metadata.date;
  }

  getWeek(folderName) {
    const metadata = this.extractMetadata(folderName);
    return metadata.week;
  }

  getMimeType(fileType) {
    const mimeMap = {
      'video': 'video/mp4',
      'audio': 'audio/mp4',
      'transcript': 'text/vtt',
      'chat': 'text/plain',
      'document': 'application/pdf',
      'image': 'image/jpeg',
      'other': 'application/octet-stream'
    };
    return mimeMap[fileType] || 'application/octet-stream';
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i += 2) {
  const key = args[i];
  const value = args[i + 1];
  
  if (key === '--startFrom') {
    options.startFromIndex = parseInt(value);
  } else if (key === '--batchSize') {
    options.batchSize = parseInt(value);
  } else if (key === '--maxSessions') {
    options.maxSessions = parseInt(value);
  } else if (key === '--delay') {
    options.delayBetweenBatches = parseInt(value);
  } else if (key === '--file') {
    options.smartSessionsFile = value;
  }
}

// Run the unified processor
const processor = new UnifiedDriveProcessor(config, options);
processor.process(); 