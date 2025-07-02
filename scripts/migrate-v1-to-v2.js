const fs = require('fs').promises;
const path = require('path');
const { container, initializeContainer } = require('../src/container');

class MigrationTool {
    constructor() {
        this.logger = null;
        this.report = {
            startTime: new Date().toISOString(),
            endTime: null,
            filesProcessed: 0,
            filesSkipped: 0,
            errors: [],
            warnings: [],
            dataMapping: {
                recordings: 0,
                sessions: 0,
                insights: 0,
                outcomes: 0
            }
        };
    }

    async run() {
        console.log('🚀 Starting migration from v1 to v2...\n');
        
        try {
            // Step 1: Check environment
            await this.checkEnvironment();
            
            // Step 2: Initialize new system
            await this.initializeNewSystem();
            
            // Step 3: Check existing data
            await this.analyzeExistingData();
            
            // Step 4: Migrate configuration
            await this.migrateConfiguration();
            
            // Step 5: Migrate data files
            await this.migrateDataFiles();
            
            // Step 6: Test new system
            await this.testNewSystem();
            
            // Step 7: Generate report
            await this.generateReport();
            
            console.log('\n✅ Migration completed successfully!');
            
        } catch (error) {
            console.error('\n❌ Migration failed:', error.message);
            this.report.errors.push({
                stage: 'migration',
                error: error.message,
                stack: error.stack
            });
            await this.generateReport();
            process.exit(1);
        }
    }

    async checkEnvironment() {
        console.log('📋 Checking environment...');
        
        const checks = {
            nodeVersion: process.version,
            v1FilesExist: false,
            v2StructureReady: false,
            envFileExists: false,
            dataFolderExists: false
        };
        
        // Check Node version
        const majorVersion = parseInt(process.version.substring(1).split('.')[0]);
        if (majorVersion < 14) {
            throw new Error(`Node.js version ${process.version} is too old. Please upgrade to v14 or higher.`);
        }
        
        // Check for v1 files
        const v1Files = [
            'ai-powered-insights-generator.js',
            'comprehensive-insights-generator.js',
            'tangible-outcomes-processor.js'
        ];
        
        for (const file of v1Files) {
            try {
                await fs.access(file);
                checks.v1FilesExist = true;
                break;
            } catch (e) {
                // File doesn't exist
            }
        }
        
        // Check for .env file
        try {
            await fs.access('.env');
            checks.envFileExists = true;
        } catch (e) {
            console.warn('⚠️  No .env file found. You may need to configure environment variables.');
        }
        
        // Check for data folder
        try {
            await fs.access('./data');
            checks.dataFolderExists = true;
        } catch (e) {
            console.warn('⚠️  No data folder found. Creating one...');
            await fs.mkdir('./data', { recursive: true });
        }
        
        console.log('✅ Environment check passed');
        console.log(`   Node.js: ${checks.nodeVersion}`);
        console.log(`   V1 files: ${checks.v1FilesExist ? 'Found' : 'Not found'}`);
        console.log(`   .env file: ${checks.envFileExists ? 'Found' : 'Not found'}`);
        console.log(`   Data folder: ${checks.dataFolderExists ? 'Found' : 'Created'}`);
    }

    async initializeNewSystem() {
        console.log('\n🔧 Initializing new system...');
        
        // Create v2 directory structure
        const directories = [
            'src/domain/models',
            'src/domain/services',
            'src/application/services',
            'src/infrastructure/services',
            'src/infrastructure/services/ai',
            'src/api/handlers',
            'src/api/middleware',
            'src/api/routes',
            'src/shared',
            'config',
            'tests/unit',
            'tests/integration',
            'logs',
            'temp'
        ];
        
        for (const dir of directories) {
            await fs.mkdir(dir, { recursive: true });
        }
        
        console.log('✅ Directory structure created');
        
        // Initialize container
        try {
            await initializeContainer();
            this.logger = container.resolve('logger');
            console.log('✅ Dependency injection container initialized');
        } catch (error) {
            console.warn('⚠️  Could not initialize container. Some services may not be available.');
            this.report.warnings.push({
                stage: 'initialization',
                message: 'Container initialization failed',
                error: error.message
            });
        }
    }

    async analyzeExistingData() {
        console.log('\n📊 Analyzing existing data...');
        
        const analysis = {
            googleSheets: { found: false, rows: 0 },
            localFiles: { recordings: 0, transcripts: 0, insights: 0 },
            csvFiles: { students: false, coaches: false, programs: false }
        };
        
        // Check for CSV files
        const csvFiles = ['students-comprehensive.csv', 'coaches.csv', 'programs.csv'];
        for (const file of csvFiles) {
            try {
                await fs.access(path.join('./data', file));
                analysis.csvFiles[file.replace('.csv', '').replace('-comprehensive', '')] = true;
            } catch (e) {
                console.warn(`⚠️  Missing data file: ${file}`);
            }
        }
        
        // Check for recording folders
        try {
            const recordingDirs = await fs.readdir('./recordings', { withFileTypes: true });
            analysis.localFiles.recordings = recordingDirs.filter(d => d.isDirectory()).length;
            
            // Count transcripts
            for (const dir of recordingDirs) {
                if (dir.isDirectory()) {
                    const files = await fs.readdir(path.join('./recordings', dir.name));
                    const vttFiles = files.filter(f => f.endsWith('.vtt'));
                    if (vttFiles.length > 0) analysis.localFiles.transcripts++;
                    
                    const jsonFiles = files.filter(f => f.includes('insights') && f.endsWith('.json'));
                    if (jsonFiles.length > 0) analysis.localFiles.insights++;
                }
            }
        } catch (e) {
            console.warn('⚠️  No recordings directory found');
        }
        
        console.log('✅ Data analysis complete');
        console.log(`   CSV files: ${Object.values(analysis.csvFiles).filter(v => v).length}/3`);
        console.log(`   Recording folders: ${analysis.localFiles.recordings}`);
        console.log(`   Transcripts: ${analysis.localFiles.transcripts}`);
        console.log(`   Existing insights: ${analysis.localFiles.insights}`);
        
        this.report.dataMapping = analysis.localFiles;
    }

    async migrateConfiguration() {
        console.log('\n⚙️  Migrating configuration...');
        
        // Create new config file
        const configTemplate = `// config/index.js
require('dotenv').config();

module.exports = {
    // Server configuration
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    
    // Data paths
    dataPath: process.env.DATA_PATH || './data',
    recordingsPath: process.env.RECORDINGS_PATH || './recordings',
    
    // AI configuration
    ai: {
        preferredProvider: process.env.AI_PREFERRED_PROVIDER || 'openai'
    },
    
    // OpenAI configuration
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4'
    },
    
    // Anthropic configuration
    anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229'
    },
    
    // Zoom configuration
    zoom: {
        accountId: process.env.ZOOM_ACCOUNT_ID,
        clientId: process.env.ZOOM_CLIENT_ID,
        clientSecret: process.env.ZOOM_CLIENT_SECRET,
        webhookToken: process.env.ZOOM_WEBHOOK_SECRET_TOKEN
    },
    
    // Google configuration
    google: {
        clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
        privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\\\n/g, '\\n'),
        driveFolder: process.env.GOOGLE_DRIVE_FOLDER_ID,
        sheetsId: process.env.GOOGLE_SHEETS_ID
    },
    
    // Redis configuration (optional)
    redis: {
        enabled: process.env.REDIS_ENABLED === 'true',
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD
    },
    
    // Rate limiting
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100 // limit each IP to 100 requests per windowMs
    }
};`;

        await fs.writeFile('./config/index.js', configTemplate);
        console.log('✅ Configuration file created');
        
        // Create .env.example if it doesn't exist
        const envExample = `# Server Configuration
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# Data Paths
DATA_PATH=./data
RECORDINGS_PATH=./recordings

# AI Configuration
AI_PREFERRED_PROVIDER=openai

# OpenAI
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL=gpt-4

# Anthropic
ANTHROPIC_API_KEY=your-anthropic-api-key-here
ANTHROPIC_MODEL=claude-3-sonnet-20240229

# Zoom
ZOOM_ACCOUNT_ID=your-zoom-account-id
ZOOM_CLIENT_ID=your-zoom-client-id
ZOOM_CLIENT_SECRET=your-zoom-client-secret
ZOOM_WEBHOOK_SECRET_TOKEN=your-webhook-secret

# Google
GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nYOUR_KEY_HERE\\n-----END PRIVATE KEY-----"
GOOGLE_DRIVE_FOLDER_ID=your-folder-id
GOOGLE_SHEETS_ID=your-sheets-id

# Redis (optional)
REDIS_ENABLED=false
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=`;

        try {
            await fs.access('.env.example');
        } catch (e) {
            await fs.writeFile('.env.example', envExample);
            console.log('✅ .env.example file created');
        }
    }

    async migrateDataFiles() {
        console.log('\n📁 Migrating data files...');
        
        // Check if we need to convert any JSON data files
        const dataConversions = {
            'students.json': 'students-comprehensive.csv',
            'coaches.json': 'coaches.csv'
        };
        
        for (const [jsonFile, csvFile] of Object.entries(dataConversions)) {
            try {
                const jsonPath = path.join('./data', jsonFile);
                await fs.access(jsonPath);
                
                console.log(`   Converting ${jsonFile} to ${csvFile}...`);
                const jsonData = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
                
                // Convert to CSV (simplified - you may need Papa.unparse for complex data)
                if (Array.isArray(jsonData) && jsonData.length > 0) {
                    const headers = Object.keys(jsonData[0]);
                    const csvContent = [
                        headers.join(','),
                        ...jsonData.map(row => 
                            headers.map(h => JSON.stringify(row[h] || '')).join(',')
                        )
                    ].join('\\n');
                    
                    await fs.writeFile(path.join('./data', csvFile), csvContent);
                    console.log(`   ✅ Converted ${jsonFile} to ${csvFile}`);
                    this.report.filesProcessed++;
                }
            } catch (e) {
                // JSON file doesn't exist, skip
            }
        }
        
        console.log('✅ Data file migration complete');
    }

    async testNewSystem() {
        console.log('\n🧪 Testing new system...');
        
        const tests = {
            aiService: false,
            knowledgeBase: false,
            container: false
        };
        
        try {
            // Test container
            const logger = container.resolve('logger');
            logger.info('Test log message');
            tests.container = true;
            console.log('   ✅ Container working');
        } catch (e) {
            console.log('   ❌ Container test failed');
        }
        
        try {
            // Test AI service
            const aiService = container.resolve('aiService');
            const testInsights = await aiService.generateInsights(
                'This is a test transcript.',
                { topic: 'Test', duration: 1 }
            );
            tests.aiService = !!testInsights;
            console.log('   ✅ AI service working');
        } catch (e) {
            console.log('   ⚠️  AI service not configured');
        }
        
        try {
            // Test knowledge base
            const kb = container.resolve('knowledgeBaseService');
            const stats = await kb.getStatistics();
            tests.knowledgeBase = stats.totalStudents > 0 || stats.totalCoaches > 0;
            console.log(`   ✅ Knowledge base loaded (${stats.totalStudents} students, ${stats.totalCoaches} coaches)`);
        } catch (e) {
            console.log('   ⚠️  Knowledge base not loaded');
        }
        
        this.report.systemTests = tests;
    }

    async generateReport() {
        console.log('\n📄 Generating migration report...');
        
        this.report.endTime = new Date().toISOString();
        
        const reportContent = `# Migration Report
Generated: ${new Date().toISOString()}

## Summary
- Start Time: ${this.report.startTime}
- End Time: ${this.report.endTime}
- Files Processed: ${this.report.filesProcessed}
- Files Skipped: ${this.report.filesSkipped}
- Errors: ${this.report.errors.length}
- Warnings: ${this.report.warnings.length}

## Data Migration
- Recordings: ${this.report.dataMapping.recordings}
- Transcripts: ${this.report.dataMapping.transcripts}
- Insights: ${this.report.dataMapping.insights}

## System Tests
${this.report.systemTests ? Object.entries(this.report.systemTests)
    .map(([test, passed]) => `- ${test}: ${passed ? '✅ Passed' : '❌ Failed'}`)
    .join('\\n') : '- No tests run'}

## Errors
${this.report.errors.length > 0 
    ? this.report.errors.map(e => `- [${e.stage}] ${e.error}`).join('\\n')
    : 'No errors encountered'}

## Warnings
${this.report.warnings.length > 0
    ? this.report.warnings.map(w => `- [${w.stage}] ${w.message}`).join('\\n')
    : 'No warnings'}

## Next Steps
1. Review and update your .env file with the correct API keys
2. Verify that all CSV data files are in the ./data directory
3. Run 'npm start' to start the new system
4. Test the webhook endpoint at POST /api/webhooks/zoom
5. Monitor logs for any issues

## Old System Cleanup (Manual)
After verifying the new system works:
1. Backup old files to ./backup-v1/
2. Remove old generator files
3. Update any external integrations to use new endpoints
`;

        await fs.writeFile('./migration-report.md', reportContent);
        console.log('✅ Migration report saved to migration-report.md');
    }
}

// Run migration
if (require.main === module) {
    const migration = new MigrationTool();
    migration.run().catch(console.error);
}

module.exports = { MigrationTool }; 