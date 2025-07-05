#!/usr/bin/env node

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs').promises;

// Load configuration
const config = require('../../config');
const s3IvylevelConfig = require('../../src/drive-source/config/s3-ivylevel-config');

// Simple scanner focused on finding files quickly
class QuickScanner {
  constructor(config) {
    this.config = config;
    this.drive = google.drive({ version: 'v3', auth: this.getAuthClient() });
    this.stats = {
      foldersScanned: 0,
      filesFound: 0,
      videoFiles: 0,
      audioFiles: 0,
      transcriptFiles: 0,
      folderDepths: {}
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

  async findRecordingFiles(folderId, maxResults = 100) {
    console.log('🔍 Quick scan for recording files in S3-Ivylevel folder...\n');
    
    const recordingFiles = [];
    const fileExtensions = ['.mp4', '.m4a', '.mov', '.mp3', '.wav', '.txt', '.vtt', '.srt'];
    
    // Build query to find files directly
    const queries = fileExtensions.map(ext => 
      `(name contains '${ext}' and mimeType != 'application/vnd.google-apps.folder')`
    ).join(' or ');
    
    const fullQuery = `(${queries}) and '${folderId}' in parents and trashed = false`;
    
    console.log('📋 Searching for files with extensions:', fileExtensions.join(', '));
    
    let pageToken = null;
    let totalScanned = 0;
    
    try {
      do {
        const response = await this.drive.files.list({
          q: fullQuery,
          fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink)',
          pageSize: Math.min(100, maxResults - totalScanned),
          pageToken
        });
        
        if (response.data.files && response.data.files.length > 0) {
          recordingFiles.push(...response.data.files);
          totalScanned += response.data.files.length;
          
          console.log(`Found ${response.data.files.length} files (total: ${totalScanned})`);
          
          // Show sample files
          response.data.files.slice(0, 3).forEach(file => {
            console.log(`  - ${file.name} (${this.formatFileSize(file.size)})`);
          });
        }
        
        pageToken = response.data.nextPageToken;
        
        if (totalScanned >= maxResults) {
          console.log(`\n⚠️  Reached maximum results limit (${maxResults})`);
          break;
        }
      } while (pageToken);
      
    } catch (error) {
      console.error('Error during quick scan:', error.message);
    }
    
    return recordingFiles;
  }

  async analyzeFileDistribution(files) {
    console.log('\n📊 File Analysis:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const stats = {
      byExtension: {},
      bySize: { small: 0, medium: 0, large: 0, huge: 0 },
      byYear: {},
      potentialRecordings: []
    };
    
    for (const file of files) {
      // Extension analysis
      const ext = path.extname(file.name).toLowerCase();
      stats.byExtension[ext] = (stats.byExtension[ext] || 0) + 1;
      
      // Size analysis
      const size = parseInt(file.size || 0);
      if (size < 10 * 1024 * 1024) stats.bySize.small++;
      else if (size < 100 * 1024 * 1024) stats.bySize.medium++;
      else if (size < 1024 * 1024 * 1024) stats.bySize.large++;
      else stats.bySize.huge++;
      
      // Year analysis
      const year = new Date(file.createdTime).getFullYear();
      stats.byYear[year] = (stats.byYear[year] || 0) + 1;
      
      // Identify potential recordings
      if (this.isPotentialRecording(file)) {
        stats.potentialRecordings.push(file);
      }
    }
    
    // Display statistics
    console.log('\nBy Extension:');
    Object.entries(stats.byExtension)
      .sort(([,a], [,b]) => b - a)
      .forEach(([ext, count]) => {
        console.log(`  ${ext}: ${count} files`);
      });
    
    console.log('\nBy Size:');
    console.log(`  Small (<10MB): ${stats.bySize.small}`);
    console.log(`  Medium (10-100MB): ${stats.bySize.medium}`);
    console.log(`  Large (100MB-1GB): ${stats.bySize.large}`);
    console.log(`  Huge (>1GB): ${stats.bySize.huge}`);
    
    console.log('\nBy Year:');
    Object.entries(stats.byYear)
      .sort(([a], [b]) => b - a)
      .forEach(([year, count]) => {
        console.log(`  ${year}: ${count} files`);
      });
    
    console.log(`\n🎯 Potential Recordings: ${stats.potentialRecordings.length}`);
    
    return stats;
  }

  isPotentialRecording(file) {
    const name = file.name.toLowerCase();
    const size = parseInt(file.size || 0);
    
    // Check file size (recordings are typically > 1MB)
    if (size < 1024 * 1024) return false;
    
    // Check for recording indicators
    const recordingKeywords = ['zoom', 'recording', 'meeting', 'session', 'coaching', 'call'];
    const hasKeyword = recordingKeywords.some(keyword => name.includes(keyword));
    
    // Check for video/audio extensions
    const mediaExtensions = ['.mp4', '.m4a', '.mov', '.mp3', '.wav'];
    const hasMediaExt = mediaExtensions.some(ext => name.endsWith(ext));
    
    return hasKeyword || hasMediaExt;
  }

  async sampleFolderStructure(folderId, depth = 2) {
    console.log('\n🗂️  Sampling Folder Structure:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    await this.exploreFolders(folderId, 0, depth, '');
  }

  async exploreFolders(folderId, currentDepth, maxDepth, prefix) {
    if (currentDepth > maxDepth) return;
    
    try {
      const response = await this.drive.files.list({
        q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 10 // Sample only
      });
      
      if (response.data.files) {
        for (const folder of response.data.files) {
          console.log(`${prefix}📁 ${folder.name}`);
          
          // Check for files in this folder
          const fileCount = await this.countFilesInFolder(folder.id);
          if (fileCount > 0) {
            console.log(`${prefix}   └─ Contains ${fileCount} files`);
          }
          
          // Explore one level deeper
          if (currentDepth < maxDepth) {
            await this.exploreFolders(folder.id, currentDepth + 1, maxDepth, prefix + '  ');
          }
        }
      }
    } catch (error) {
      console.error(`${prefix}❌ Error exploring folder:`, error.message);
    }
  }

  async countFilesInFolder(folderId) {
    try {
      const response = await this.drive.files.list({
        q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id)',
        pageSize: 1
      });
      
      return response.data.files ? response.data.files.length : 0;
    } catch (error) {
      return 0;
    }
  }

  formatFileSize(bytes) {
    if (!bytes) return 'Unknown';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  async generateReport(files, stats) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(__dirname, `quick-scan-report-${timestamp}.json`);
    
    const report = {
      scanDate: new Date().toISOString(),
      targetFolder: s3IvylevelConfig.rootFolderId,
      totalFiles: files.length,
      statistics: stats,
      sampleFiles: files.slice(0, 20).map(f => ({
        name: f.name,
        size: f.size,
        createdTime: f.createdTime,
        id: f.id
      }))
    };
    
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Report saved to: ${reportPath}`);
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║          S3-Ivylevel Quick File Scanner                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  const scanner = new QuickScanner(config);
  const maxResults = parseInt(process.argv[2]) || 500;
  
  console.log(`📍 Target: ${s3IvylevelConfig.rootFolderId}`);
  console.log(`🎯 Max results: ${maxResults}\n`);
  
  try {
    // Step 1: Find recording files
    const files = await scanner.findRecordingFiles(s3IvylevelConfig.rootFolderId, maxResults);
    
    if (files.length === 0) {
      console.log('\n❌ No recording files found.');
      
      // Sample folder structure to understand organization
      await scanner.sampleFolderStructure(s3IvylevelConfig.rootFolderId);
      
      return;
    }
    
    console.log(`\n✅ Found ${files.length} potential recording files`);
    
    // Step 2: Analyze files
    const stats = await scanner.analyzeFileDistribution(files);
    
    // Step 3: Sample folder structure
    await scanner.sampleFolderStructure(s3IvylevelConfig.rootFolderId);
    
    // Step 4: Generate report
    await scanner.generateReport(files, stats);
    
    // Show next steps
    console.log('\n💡 Next Steps:');
    console.log('1. Review the generated report');
    console.log('2. Run the full processor on folders with actual recordings');
    console.log('3. Use specific folder IDs for targeted processing');
    
  } catch (error) {
    console.error('\n❌ Error:', error);
  }
}

main().catch(console.error);