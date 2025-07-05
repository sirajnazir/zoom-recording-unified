#!/usr/bin/env node

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs').promises;

// Load configuration
const config = require('../../config');
const s3IvylevelConfig = require('../../src/drive-source/config/s3-ivylevel-config');

class SessionFolderScanner {
  constructor(config) {
    this.config = config;
    this.drive = google.drive({ version: 'v3', auth: this.getAuthClient() });
    this.sessionFolders = [];
    this.recordingFiles = [];
  }

  getAuthClient() {
    return new google.auth.JWT(
      this.config.google.clientEmail,
      null,
      this.config.google.privateKey,
      ['https://www.googleapis.com/auth/drive']
    );
  }

  async findSessionFolders(rootFolderId, maxDepth = 4) {
    console.log('🔍 Searching for session folders...\n');
    await this.scanForSessionFolders(rootFolderId, 0, maxDepth, '');
    return this.sessionFolders;
  }

  async scanForSessionFolders(folderId, depth, maxDepth, path) {
    if (depth > maxDepth) return;

    try {
      const response = await this.drive.files.list({
        q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 1000
      });

      if (response.data.files) {
        for (const folder of response.data.files) {
          const folderPath = path ? `${path}/${folder.name}` : folder.name;
          
          // Check if this looks like a session folder
          if (this.isSessionFolder(folder.name)) {
            this.sessionFolders.push({
              id: folder.id,
              name: folder.name,
              path: folderPath,
              depth: depth
            });
            console.log(`📁 Found session folder: ${folder.name}`);
          }
          
          // Continue scanning deeper
          await this.scanForSessionFolders(folder.id, depth + 1, maxDepth, folderPath);
        }
      }
    } catch (error) {
      console.error(`Error scanning folder at depth ${depth}:`, error.message);
    }
  }

  isSessionFolder(name) {
    const patterns = [
      /Coaching_/i,
      /GamePlan_/i,
      /Week\d+/i,
      /Wk\d+/i,
      /\d{4}-\d{2}-\d{2}/,
      /_\d{4}-/,
      /Session/i,
      /Meeting/i
    ];
    
    return patterns.some(pattern => pattern.test(name));
  }

  async scanSessionFolders(folders, sampleSize = 10) {
    console.log(`\n📊 Scanning ${Math.min(sampleSize, folders.length)} session folders for files...\n`);
    
    const sampled = folders.slice(0, sampleSize);
    
    for (const folder of sampled) {
      console.log(`\nScanning: ${folder.name}`);
      
      try {
        const files = await this.getFilesInFolder(folder.id);
        
        if (files.length > 0) {
          console.log(`  ✅ Found ${files.length} files:`);
          
          for (const file of files) {
            const fileInfo = {
              ...file,
              sessionFolder: folder.name,
              sessionFolderId: folder.id,
              folderPath: folder.path
            };
            
            this.recordingFiles.push(fileInfo);
            
            console.log(`     - ${file.name} (${this.formatFileSize(file.size)}, ${this.getFileType(file)})`);
          }
        } else {
          console.log(`  ⚠️  No files found`);
        }
      } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
      }
    }
    
    return this.recordingFiles;
  }

  async getFilesInFolder(folderId) {
    const files = [];
    let pageToken = null;
    
    do {
      const response = await this.drive.files.list({
        q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink)',
        pageSize: 100,
        pageToken
      });
      
      if (response.data.files) {
        files.push(...response.data.files);
      }
      
      pageToken = response.data.nextPageToken;
    } while (pageToken);
    
    return files;
  }

  getFileType(file) {
    const ext = path.extname(file.name).toLowerCase();
    const mimeType = file.mimeType || '';
    
    if (['.mp4', '.mov', '.avi'].includes(ext) || mimeType.includes('video')) return 'video';
    if (['.m4a', '.mp3', '.wav'].includes(ext) || mimeType.includes('audio')) return 'audio';
    if (['.txt', '.vtt', '.srt'].includes(ext) && file.name.toLowerCase().includes('transcript')) return 'transcript';
    if (file.name.toLowerCase().includes('chat')) return 'chat';
    if (['.pdf', '.doc', '.docx'].includes(ext)) return 'document';
    if (['.jpg', '.png', '.jpeg'].includes(ext)) return 'image';
    
    return 'other';
  }

  formatFileSize(bytes) {
    if (!bytes) return 'Unknown';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  async analyzeFiles(files) {
    console.log('\n\n📊 File Analysis Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const stats = {
      byType: {},
      byExtension: {},
      largeFiles: [],
      sessions: new Map()
    };
    
    for (const file of files) {
      // Type analysis
      const type = this.getFileType(file);
      stats.byType[type] = (stats.byType[type] || 0) + 1;
      
      // Extension analysis
      const ext = path.extname(file.name).toLowerCase();
      if (ext) {
        stats.byExtension[ext] = (stats.byExtension[ext] || 0) + 1;
      }
      
      // Large files
      if (parseInt(file.size) > 100 * 1024 * 1024) {
        stats.largeFiles.push(file);
      }
      
      // Group by session
      if (!stats.sessions.has(file.sessionFolderId)) {
        stats.sessions.set(file.sessionFolderId, {
          folder: file.sessionFolder,
          files: []
        });
      }
      stats.sessions.get(file.sessionFolderId).files.push(file);
    }
    
    console.log('File Types:');
    Object.entries(stats.byType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
    
    console.log('\nFile Extensions:');
    Object.entries(stats.byExtension)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .forEach(([ext, count]) => {
        console.log(`  ${ext}: ${count}`);
      });
    
    console.log(`\nLarge Files (>100MB): ${stats.largeFiles.length}`);
    stats.largeFiles.slice(0, 5).forEach(file => {
      console.log(`  - ${file.name} (${this.formatFileSize(file.size)})`);
    });
    
    console.log(`\nSessions with Files: ${stats.sessions.size}`);
    
    // Show sample complete sessions
    console.log('\nSample Complete Sessions (with video + other files):');
    let shown = 0;
    for (const [folderId, session] of stats.sessions) {
      const hasVideo = session.files.some(f => this.getFileType(f) === 'video');
      const hasOther = session.files.some(f => ['audio', 'transcript', 'chat'].includes(this.getFileType(f)));
      
      if (hasVideo && hasOther && shown < 3) {
        console.log(`\n  ${session.folder}:`);
        session.files.forEach(f => {
          console.log(`    - ${f.name} (${this.getFileType(f)})`);
        });
        shown++;
      }
    }
    
    return stats;
  }

  async generateReport(sessionFolders, files, stats) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(__dirname, `session-scan-report-${timestamp}.json`);
    
    const report = {
      scanDate: new Date().toISOString(),
      targetFolder: s3IvylevelConfig.rootFolderId,
      sessionFoldersFound: sessionFolders.length,
      filesScanned: files.length,
      statistics: {
        fileTypes: stats.byType,
        extensions: stats.byExtension,
        largeFiles: stats.largeFiles.length,
        sessionsWithFiles: stats.sessions.size
      },
      sampleSessions: Array.from(stats.sessions.entries()).slice(0, 10).map(([id, session]) => ({
        folderId: id,
        folderName: session.folder,
        fileCount: session.files.length,
        files: session.files.map(f => ({
          name: f.name,
          type: this.getFileType(f),
          size: f.size,
          id: f.id
        }))
      }))
    };
    
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    
    return reportPath;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║        S3-Ivylevel Session Folder Scanner                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  const scanner = new SessionFolderScanner(config);
  const sampleSize = parseInt(process.argv[2]) || 20;
  
  console.log(`📍 Target: ${s3IvylevelConfig.rootFolderId}`);
  console.log(`🎯 Sample size: ${sampleSize} session folders\n`);
  
  try {
    // Step 1: Find session folders
    const sessionFolders = await scanner.findSessionFolders(s3IvylevelConfig.rootFolderId);
    console.log(`\n✅ Found ${sessionFolders.length} session folders total`);
    
    if (sessionFolders.length === 0) {
      console.log('❌ No session folders found');
      return;
    }
    
    // Step 2: Scan session folders for files
    const files = await scanner.scanSessionFolders(sessionFolders, sampleSize);
    
    // Step 3: Analyze files
    const stats = await scanner.analyzeFiles(files);
    
    // Step 4: Generate report
    const reportPath = await scanner.generateReport(sessionFolders, files, stats);
    
    // Show next steps
    console.log('\n💡 Next Steps:');
    console.log('1. Review the report to understand file organization');
    console.log('2. Run the full S3-Ivylevel processor to reorganize these files');
    console.log('3. Use specific session folder IDs for targeted processing');
    
    // Provide sample command
    if (sessionFolders.length > 0) {
      console.log(`\nExample command to process a specific coach folder:`);
      console.log(`node scripts/drive-source/process-s3-ivylevel.js ${sessionFolders[0].id}`);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error);
  }
}

main().catch(console.error);