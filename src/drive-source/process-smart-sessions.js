const IntegratedDriveProcessor = require('./services/IntegratedDriveProcessor');
const config = require('../../config');
const fs = require('fs').promises;
const path = require('path');

class SmartSessionsProcessor {
  constructor(config, options = {}) {
    this.config = config;
    this.batchSize = options.batchSize || 3;
    this.delayBetweenBatches = options.delayBetweenBatches || 2000;
    this.startFromIndex = options.startFromIndex || 0;
    this.maxSessions = options.maxSessions || 50;
    this.smartSessionsFile = options.smartSessionsFile || 'scripts/drive-source/session-scan-report-2025-07-03T04-05-12-884Z.json';
  }

  async process() {
    console.log('=== Process Smart Sessions (Using Pattern Recognition) ===\n');
    
    try {
      // Load smart session data
      console.log(`📂 Loading smart sessions from ${this.smartSessionsFile}...`);
      const smartData = JSON.parse(await fs.readFile(this.smartSessionsFile, 'utf8'));
      const smartSessions = smartData.sampleSessions || [];
      
      console.log(`Found ${smartSessions.length} smart sessions`);
      console.log(`Scan date: ${smartData.scanDate}`);
      console.log(`Target folder: ${smartData.targetFolder}`);
      
      // Convert smart sessions to the format expected by IntegratedDriveProcessor
      const convertedSessions = this.convertSmartSessions(smartSessions);
      
      // Create processor (uses same services as Zoom batch processing)
      const processor = new IntegratedDriveProcessor(config);
      await processor.initialize();
      console.log('✅ Processor initialized (using Zoom-consistent services)');
      
      // Get sessions to process
      const sessionsToProcess = convertedSessions.slice(this.startFromIndex, this.startFromIndex + this.maxSessions);
      console.log(`🚀 Processing ${sessionsToProcess.length} smart sessions (${this.startFromIndex + 1}-${this.startFromIndex + sessionsToProcess.length} of ${convertedSessions.length})`);
      
      const results = {
        successful: [],
        failed: [],
        skipped: []
      };
      
      // Process in batches (same batching logic as Zoom processing)
      for (let i = 0; i < sessionsToProcess.length; i += this.batchSize) {
        const batch = sessionsToProcess.slice(i, i + this.batchSize);
        const batchNumber = Math.floor(i / this.batchSize) + 1;
        const totalBatches = Math.ceil(sessionsToProcess.length / this.batchSize);
        
        console.log(`\n📦 Processing batch ${batchNumber}/${totalBatches} (sessions ${i + 1}-${Math.min(i + this.batchSize, sessionsToProcess.length)})`);
        
        const batchPromises = batch.map(async (session, batchIndex) => {
          const sessionIndex = i + batchIndex + 1;
          const sessionName = session.folderName;
          
          console.log(`  [${sessionIndex}] Processing: ${sessionName}`);
          
          try {
            // Check if already processed (same duplicate check as Zoom processing)
            const fingerprint = processor.generateFingerprint(session);
            const isDuplicate = await processor.dualTabGoogleSheetsService?.checkDuplicate?.(fingerprint);
            
            if (isDuplicate) {
              console.log(`    ⊘ Skipped (duplicate)`);
              results.skipped.push({ session, reason: 'Already processed' });
              return;
            }
            
            // Process the session (uses same IntegratedDriveProcessor as Zoom)
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
        
        // Wait for batch to complete
        await Promise.all(batchPromises);
        
        // Delay between batches (same rate limiting as Zoom processing)
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
        console.log('\n✅ Check your Google Sheet for new rows!');
        console.log('   Look for rows with "Google Drive Import" in the dataSource column.');
        console.log('   These will be processed with proper session names and categorization.');
      }
      
      // Show next batch info
      const nextStartIndex = this.startFromIndex + this.maxSessions;
      if (nextStartIndex < convertedSessions.length) {
        console.log(`\n📋 To continue processing, run:`);
        console.log(`   node src/drive-source/process-smart-sessions.js --startFrom ${nextStartIndex} --maxSessions ${this.maxSessions}`);
        console.log(`   (${convertedSessions.length - nextStartIndex} sessions remaining)`);
      }
      
    } catch (error) {
      console.error('❌ Processing failed:', error.message);
      console.error('Stack:', error.stack);
    }
  }

  convertSmartSessions(smartSessions) {
    return smartSessions.map(smartSession => {
      // Extract meaningful information from folder name
      const folderName = smartSession.folderName;
      
      // Parse folder name to extract metadata for categorization
      const metadata = this.parseFolderName(folderName);
      
      // Convert files to the expected format
      const files = smartSession.files.map(file => ({
        id: file.id,
        name: file.name,
        mimeType: this.getMimeType(file.type),
        size: file.size,
        fileType: file.type,
        webViewLink: `https://drive.google.com/file/d/${file.id}/view`,
        createdTime: new Date().toISOString() // Default since not in smart data
      }));
      
      return {
        id: smartSession.folderId,
        folderName: folderName,
        folderId: smartSession.folderId,
        files: files,
        metadata: metadata,
        // Use the full standardized folder name as the session name
        rawName: folderName, // Keep the full standardized name
        sessionType: metadata.sessionType,
        participants: metadata.participants,
        date: metadata.date,
        week: metadata.week
      };
    });
  }

  parseFolderName(folderName) {
    // Parse the already standardized folder names to extract metadata for categorization
    const patterns = [
      // Coaching_Coach_Student_WkWeek_Date_ID
      /Coaching_([^_]+)_([^_]+)_Wk(\d+)_(\d{4}-\d{2}-\d{2})/,
      // GamePlan_Coach_Student_WkWeek_Date_ID  
      /GamePlan_([^_]+)_([^_]+)_Wk(\d+)_(\d{4}-\d{2}-\d{2})/,
      // MISC_Coach_Date_ID
      /MISC_([^_]+)_(\d{4}-\d{2}-\d{2})/,
      // Other patterns can be added here
    ];
    
    for (const pattern of patterns) {
      const match = folderName.match(pattern);
      if (match) {
        if (match[1] && match[2] && match[3] && match[4]) {
          // Coaching or GamePlan pattern
          const [, coach, student, week, date] = match;
          const sessionType = folderName.startsWith('Coaching_') ? 'Coaching' : 'GamePlan';
          return {
            participants: [coach, student],
            date: {
              raw: date,
              parsed: new Date(date)
            },
            week: week,
            sessionType: sessionType,
            confidence: 95
          };
        } else if (match[1] && match[2]) {
          // MISC pattern
          const [, coach, date] = match;
          return {
            participants: [coach],
            date: {
              raw: date,
              parsed: new Date(date)
            },
            week: 'N/A',
            sessionType: 'MISC',
            confidence: 80
          };
        }
      }
    }
    
    // Fallback for unmatched patterns - try to extract any meaningful parts
    const parts = folderName.split('_');
    if (parts.length >= 2) {
      const potentialCoach = parts[1];
      const potentialStudent = parts[2];
      return {
        participants: [potentialCoach, potentialStudent].filter(Boolean),
        date: {
          raw: new Date().toISOString().split('T')[0],
          parsed: new Date()
        },
        week: 'Unknown',
        sessionType: 'Unknown',
        confidence: 30
      };
    }
    
    // Last resort fallback
    return {
      participants: ['Unknown'],
      date: {
        raw: new Date().toISOString().split('T')[0],
        parsed: new Date()
      },
      week: 'Unknown',
      sessionType: 'Unknown',
      confidence: 10
    };
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

// Run the processor
const processor = new SmartSessionsProcessor(config, options);
processor.process(); 