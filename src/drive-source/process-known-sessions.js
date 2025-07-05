const IntegratedDriveProcessor = require('./services/IntegratedDriveProcessor');
const config = require('../../config');

// Known sessions from previous scans - we can add more as we discover them
const KNOWN_SESSIONS = [
  // Coach Alan sessions
  {
    id: 'session-alan-wk08',
    folderName: 'Coaching_Andrew_Rayaan_Wk08_2024-06-19',
    recordings: [
      {
        id: 'GMT20240620-015624_Recording_gallery_1280x720.mp4',
        name: 'GMT20240620-015624_Recording_gallery_1280x720.mp4',
        mimeType: 'video/mp4',
        size: 50000000,
        webViewLink: 'https://drive.google.com/file/d/11X8L_FWZHDFJL-zvvR9S0lRfiMC2zjQr/view'
      },
      {
        id: 'GMT20240620-015624_Recording_640x360.mp4',
        name: 'GMT20240620-015624_Recording_640x360.mp4',
        mimeType: 'video/mp4',
        size: 30000000,
        webViewLink: 'https://drive.google.com/file/d/1n7hx4ViqQSarZuj8mHsxvzI3CxlzrOfC/view'
      },
      {
        id: 'GMT20240620-015624_Recording.m4a',
        name: 'GMT20240620-015624_Recording.m4a',
        mimeType: 'audio/mp4',
        size: 10000000,
        webViewLink: 'https://drive.google.com/file/d/1aaP6FAMrjeYLR0sQXHH0QXAQ3A4WtpXb/view'
      }
    ],
    folderId: '1C4F34xykOiRWwFkDIFg5vR9zn4XHV4It'
  },
  {
    id: 'session-alan-wk09',
    folderName: 'Coaching_Andrew_Rayaan_Wk09_2024-07-27',
    recordings: [
      {
        id: 'GMT20240728-135524_Recording_1920x1032.mp4',
        name: 'GMT20240728-135524_Recording_1920x1032.mp4',
        mimeType: 'video/mp4',
        size: 60000000,
        webViewLink: 'https://drive.google.com/file/d/1n7hx4ViqQSarZuj8mHsxvzI3CxlzrOfC/view'
      },
      {
        id: 'GMT20240728-135524_Recording_gallery_1920x1032.mp4',
        name: 'GMT20240728-135524_Recording_gallery_1920x1032.mp4',
        mimeType: 'video/mp4',
        size: 55000000,
        webViewLink: 'https://drive.google.com/file/d/1aaP6FAMrjeYLR0sQXHH0QXAQ3A4WtpXb/view'
      },
      {
        id: 'GMT20240728-135524_Recording.m4a',
        name: 'GMT20240728-135524_Recording.m4a',
        mimeType: 'audio/mp4',
        size: 12000000,
        webViewLink: 'https://drive.google.com/file/d/11X8L_FWZHDFJL-zvvR9S0lRfiMC2zjQr/view'
      }
    ],
    folderId: '1VQdg3EGnudE9oMiyPZ93m24nh522-vfr'
  },
  {
    id: 'session-alan-wk10',
    folderName: 'Coaching_Andrew_Rayaan_Wk10_2024-10-02',
    recordings: [
      {
        id: 'GMT20241003-022657_Recording_gallery_1280x720.mp4',
        name: 'GMT20241003-022657_Recording_gallery_1280x720.mp4',
        mimeType: 'video/mp4',
        size: 45000000,
        webViewLink: 'https://drive.google.com/file/d/1aaP6FAMrjeYLR0sQXHH0QXAQ3A4WtpXb/view'
      },
      {
        id: 'GMT20241003-022657_Recording_640x360.mp4',
        name: 'GMT20241003-022657_Recording_640x360.mp4',
        mimeType: 'video/mp4',
        size: 25000000,
        webViewLink: 'https://drive.google.com/file/d/11X8L_FWZHDFJL-zvvR9S0lRfiMC2zjQr/view'
      },
      {
        id: 'GMT20241003-022657_Recording.m4a',
        name: 'GMT20241003-022657_Recording.m4a',
        mimeType: 'audio/mp4',
        size: 8000000,
        webViewLink: 'https://drive.google.com/file/d/1n7hx4ViqQSarZuj8mHsxvzI3CxlzrOfC/view'
      }
    ],
    folderId: '1bC52BvSoFiEiwQdo18sMJO94NETBybAt'
  }
];

class KnownSessionsProcessor {
  constructor(config, options = {}) {
    this.config = config;
    this.batchSize = options.batchSize || 3;
    this.delayBetweenBatches = options.delayBetweenBatches || 2000;
    this.startFromIndex = options.startFromIndex || 0;
    this.maxSessions = options.maxSessions || KNOWN_SESSIONS.length;
  }

  async process() {
    console.log('=== Known Sessions Processor ===\n');
    
    try {
      // Create processor
      const processor = new IntegratedDriveProcessor(config);
      await processor.initialize();
      console.log('✅ Processor initialized');
      
      // Get sessions to process
      const sessionsToProcess = KNOWN_SESSIONS.slice(this.startFromIndex, this.startFromIndex + this.maxSessions);
      console.log(`🚀 Processing ${sessionsToProcess.length} known sessions (${this.startFromIndex + 1}-${this.startFromIndex + sessionsToProcess.length} of ${KNOWN_SESSIONS.length})`);
      
      const results = {
        successful: [],
        failed: [],
        skipped: []
      };
      
      // Process in batches
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
            // Check if already processed
            const fingerprint = processor.generateFingerprint(session);
            const isDuplicate = await processor.dualTabGoogleSheetsService?.checkDuplicate?.(fingerprint);
            
            if (isDuplicate) {
              console.log(`    ⊘ Skipped (duplicate)`);
              results.skipped.push({ session, reason: 'Already processed' });
              return;
            }
            
            // Process the session
            const processedSession = await processor.processSession(session);
            console.log(`    ✅ Success: ${processedSession.rawName}`);
            results.successful.push(processedSession);
            
          } catch (error) {
            console.error(`    ❌ Failed: ${error.message}`);
            results.failed.push({ session, error: error.message });
          }
        });
        
        // Wait for batch to complete
        await Promise.all(batchPromises);
        
        // Delay between batches
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
      }
      
    } catch (error) {
      console.error('❌ Processing failed:', error.message);
      console.error('Stack:', error.stack);
    }
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
  }
}

// Run the processor
const processor = new KnownSessionsProcessor(config, options);
processor.process(); 