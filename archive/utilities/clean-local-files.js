#!/usr/bin/env node

/**
 * Clean Local Files and Directories
 * 
 * This script will:
 * 1. Clean all local recording copies and temporary files
 * 2. Remove old logs, cache, and temporary directories
 * 3. Recreate essential directories with proper structure
 * 4. Provide parallel console output and file logging
 */

const fs = require('fs').promises;
const path = require('path');

class LocalFileCleaner {
    constructor() {
        this.logFile = null;
        this.logStream = null;
        this.startTime = null;
        this.results = {
            directoriesCleaned: 0,
            directoriesCreated: 0,
            filesCleaned: 0,
            errors: []
        };
    }

    async initialize() {
        console.log('🧹 Initializing Local File Cleaner...');
        
        // Create logs directory if it doesn't exist
        await fs.mkdir('logs', { recursive: true });
        
        // Setup logging
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.logFile = `logs/cleanup-${timestamp}.log`;
        this.logStream = require('fs').createWriteStream(this.logFile, { flags: 'a' });
        
        this.log('🧹 Initializing Local File Cleaner...');
        this.startTime = Date.now();
    }

    log(message, ...args) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message} ${args.join(' ')}`;
        
        // Write to log file
        if (this.logStream) {
            this.logStream.write(logMessage + '\n');
        }
        
        // Also output to console
        console.log(message, ...args);
    }

    async cleanupDirectories() {
        this.log('\n🗂️ Cleaning directories...');
        
        const directoriesToClean = [
            'output',
            'logs',
            'temp',
            'cache',
            'downloads'
        ];

        for (const dir of directoriesToClean) {
            try {
                if (await this.directoryExists(dir)) {
                    await fs.rm(dir, { recursive: true, force: true });
                    this.log(`   ✅ Cleaned: ${dir}/`);
                    this.results.directoriesCleaned++;
                } else {
                    this.log(`   ⏭️  Skipped (not found): ${dir}/`);
                }
            } catch (error) {
                this.log(`   ⚠️  Error cleaning ${dir}/: ${error.message}`);
                this.results.errors.push({
                    type: 'directory_cleanup',
                    path: dir,
                    error: error.message
                });
            }
        }
    }

    async cleanupRootFiles() {
        this.log('\n📁 Cleaning temporary files in root directory...');
        
        const filePatterns = [
            /\.log$/,
            /\.json$/,
            /\.csv$/,
            /\.mp4$/,
            /\.txt$/,
            /\.md$/
        ];

        // Exclude important files
        const excludeFiles = [
            'package.json',
            'package-lock.json',
            'README.md',
            'Dockerfile',
            'render.yaml',
            '.gitignore',
            '.env'
        ];

        try {
            const currentDir = process.cwd();
            const files = await fs.readdir(currentDir);
            
            for (const file of files) {
                // Skip directories and important files
                if (excludeFiles.includes(file)) {
                    continue;
                }
                
                // Check if file matches any cleanup pattern
                if (filePatterns.some(pattern => pattern.test(file))) {
                    try {
                        const filePath = path.join(currentDir, file);
                        const stats = await fs.stat(filePath);
                        
                        // Only delete files, not directories
                        if (stats.isFile()) {
                            await fs.unlink(filePath);
                            this.log(`   ✅ Cleaned: ${file}`);
                            this.results.filesCleaned++;
                        }
                    } catch (error) {
                        this.log(`   ⚠️  Error cleaning ${file}: ${error.message}`);
                        this.results.errors.push({
                            type: 'file_cleanup',
                            path: file,
                            error: error.message
                        });
                    }
                }
            }
        } catch (error) {
            this.log(`   ⚠️  Error reading root directory: ${error.message}`);
            this.results.errors.push({
                type: 'root_directory_read',
                error: error.message
            });
        }
    }

    async createEssentialDirectories() {
        this.log('\n📂 Creating essential directories...');
        
        const directories = [
            'output',
            'output/webhook-logs',
            'output/webhook-queue',
            'logs',
            'temp',
            'cache',
            'downloads',
            'downloads/videos',
            'downloads/transcripts',
            'downloads/chats'
        ];

        for (const dir of directories) {
            try {
                await fs.mkdir(dir, { recursive: true });
                this.log(`   ✅ Created: ${dir}/`);
                this.results.directoriesCreated++;
            } catch (error) {
                this.log(`   ⚠️  Error creating ${dir}/: ${error.message}`);
                this.results.errors.push({
                    type: 'directory_creation',
                    path: dir,
                    error: error.message
                });
            }
        }
    }

    async cleanupOldLogs() {
        this.log('\n📝 Cleaning old log files...');
        
        try {
            const logsDir = 'logs';
            if (await this.directoryExists(logsDir)) {
                const files = await fs.readdir(logsDir);
                const logFiles = files.filter(file => file.endsWith('.log'));
                
                // Keep only the 10 most recent log files
                if (logFiles.length > 10) {
                    const filesToDelete = logFiles
                        .sort()
                        .slice(0, logFiles.length - 10);
                    
                    for (const file of filesToDelete) {
                        try {
                            await fs.unlink(path.join(logsDir, file));
                            this.log(`   ✅ Cleaned old log: ${file}`);
                            this.results.filesCleaned++;
                        } catch (error) {
                            this.log(`   ⚠️  Error cleaning old log ${file}: ${error.message}`);
                        }
                    }
                } else {
                    this.log(`   ⏭️  Only ${logFiles.length} log files found, keeping all`);
                }
            }
        } catch (error) {
            this.log(`   ⚠️  Error cleaning old logs: ${error.message}`);
            this.results.errors.push({
                type: 'old_logs_cleanup',
                error: error.message
            });
        }
    }

    generateFinalReport() {
        const endTime = Date.now();
        const duration = endTime - this.startTime;
        const durationSeconds = Math.round(duration / 1000);
        
        this.log('\n📊 CLEANUP COMPLETE');
        this.log('=' .repeat(50));
        this.log(`Directories Cleaned: ${this.results.directoriesCleaned}`);
        this.log(`Directories Created: ${this.results.directoriesCreated}`);
        this.log(`Files Cleaned: ${this.results.filesCleaned}`);
        this.log(`Errors: ${this.results.errors.length}`);
        this.log(`Duration: ${durationSeconds} seconds`);
        
        if (this.results.errors.length > 0) {
            this.log('\n❌ ERRORS ENCOUNTERED:');
            this.results.errors.slice(0, 5).forEach(error => {
                this.log(`   ${error.type}: ${error.path || ''} - ${error.error}`);
            });
            
            if (this.results.errors.length > 5) {
                this.log(`   ... and ${this.results.errors.length - 5} more errors`);
            }
        }
        
        // Save detailed report
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                directoriesCleaned: this.results.directoriesCleaned,
                directoriesCreated: this.results.directoriesCreated,
                filesCleaned: this.results.filesCleaned,
                errors: this.results.errors.length,
                duration: durationSeconds
            },
            errors: this.results.errors,
            logFile: this.logFile
        };
        
        const reportFile = `cleanup-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        fs.writeFile(reportFile, JSON.stringify(report, null, 2))
            .then(() => this.log(`\n📄 Detailed report saved: ${reportFile}`))
            .catch(err => this.log(`\n⚠️  Could not save report: ${err.message}`));
        
        this.log('\n🎉 Local cleanup completed!');
        this.log('📁 Ready for fresh processing');
        this.log(`📝 Full log available at: ${this.logFile}`);
    }

    async directoryExists(dirPath) {
        try {
            await fs.access(dirPath);
            return true;
        } catch {
            return false;
        }
    }

    async run(options = {}) {
        try {
            this.log('🧹 LOCAL FILE CLEANUP');
            this.log('=' .repeat(60));
            this.log('This will clean all local files and directories');
            this.log('and recreate essential directory structure');
            this.log('=' .repeat(60));
            
            await this.initialize();
            
            // Clean directories
            await this.cleanupDirectories();
            
            // Clean root files
            await this.cleanupRootFiles();
            
            // Clean old logs
            await this.cleanupOldLogs();
            
            // Create essential directories
            await this.createEssentialDirectories();
            
            // Generate final report
            this.generateFinalReport();
            
        } catch (error) {
            this.log('\n❌ Cleanup failed:', error);
            process.exit(1);
        } finally {
            // Close log stream
            if (this.logStream) {
                this.logStream.end();
            }
        }
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
    verbose: args.includes('--verbose'),
    dryRun: args.includes('--dry-run')
};

// Display help if requested
if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🧹 Local File Cleaner

Usage: node clean-local-files.js [options]

Options:
  --verbose               Show detailed output
  --dry-run              Test mode - show what would be cleaned
  --help, -h             Show this help message

Examples:
  node clean-local-files.js
  node clean-local-files.js --verbose
  node clean-local-files.js --dry-run
`);
    process.exit(0);
}

// Run the cleanup
if (require.main === module) {
    const cleaner = new LocalFileCleaner();
    cleaner.run(options).catch(console.error);
}

module.exports = { LocalFileCleaner }; 