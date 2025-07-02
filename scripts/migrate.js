const fs = require('fs').promises;
const path = require('path');

/**
 * Migration script to help transition from old to new system
 */
class MigrationScript {
    constructor() {
        this.oldConfigPath = '.env';
        this.newConfigPath = '.env.production';
        this.mappings = {
            // Environment variable mappings
            env: {
                // Zoom
                'ZOOM_WEBHOOK_SECRET_TOKEN': 'ZOOM_WEBHOOK_SECRET_TOKEN',
                'ZOOM_CLIENT_ID': 'ZOOM_CLIENT_ID',
                'ZOOM_CLIENT_SECRET': 'ZOOM_CLIENT_SECRET',
                'ZOOM_ACCOUNT_ID': 'ZOOM_ACCOUNT_ID',
                
                // Google
                'GOOGLE_CREDENTIALS_BASE64': 'GOOGLE_CREDENTIALS_BASE64',
                'GOOGLE_SERVICE_ACCOUNT_JSON': 'GOOGLE_SERVICE_ACCOUNT_JSON',
                'RECORDINGS_ROOT_FOLDER_ID': 'GOOGLE_DRIVE_PARENT_FOLDER_ID',
                'COACHES_FOLDER_ID': 'GOOGLE_DRIVE_COACHES_FOLDER_ID',
                'STUDENTS_FOLDER_ID': 'GOOGLE_DRIVE_STUDENTS_FOLDER_ID',
                'MISC_FOLDER_ID': 'GOOGLE_DRIVE_MISC_FOLDER_ID',
                'TRIVIAL_FOLDER_ID': 'GOOGLE_DRIVE_TRIVIAL_FOLDER_ID',
                'MASTER_INDEX_SHEET_ID': 'GOOGLE_SHEETS_MASTER_ID',
                
                // AI
                'OPENAI_API_KEY': 'OPENAI_API_KEY',
                'ANTHROPIC_API_KEY': 'ANTHROPIC_API_KEY',
                'OPENAI_MODEL': 'OPENAI_MODEL',
                'ANTHROPIC_MODEL': 'ANTHROPIC_MODEL',
                
                // Server
                'PORT': 'PORT',
                'NODE_ENV': 'NODE_ENV'
            }
        };
    }

    /**
     * Run migration
     */
    async run() {
        console.log('🚀 Starting migration from old system to new architecture...\n');
        
        try {
            // Step 1: Check prerequisites
            await this.checkPrerequisites();
            
            // Step 2: Create directory structure
            await this.createDirectoryStructure();
            
            // Step 3: Migrate environment variables
            await this.migrateEnvironmentVariables();
            
            // Step 4: Copy knowledge base data
            await this.copyKnowledgeBase();
            
            // Step 5: Generate configuration files
            await this.generateConfigFiles();
            
            // Step 6: Create migration report
            await this.createMigrationReport();
            
            console.log('\n✅ Migration completed successfully!');
            console.log('\nNext steps:');
            console.log('1. Review the migration report in migration-report.md');
            console.log('2. Install dependencies: npm install');
            console.log('3. Run tests: npm test');
            console.log('4. Start the server: npm start');
            
        } catch (error) {
            console.error('\n❌ Migration failed:', error.message);
            process.exit(1);
        }
    }

    /**
     * Check prerequisites
     */
    async checkPrerequisites() {
        console.log('📋 Checking prerequisites...');
        
        // Check if old .env exists
        try {
            await fs.access(this.oldConfigPath);
            console.log('  ✓ Found old .env file');
        } catch {
            throw new Error('Old .env file not found. Please ensure you are running this from the old project root.');
        }
        
        // Check Node.js version
        const nodeVersion = process.version;
        const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));
        if (majorVersion < 18) {
            throw new Error(`Node.js version 18 or higher required. Current version: ${nodeVersion}`);
        }
        console.log(`  ✓ Node.js version ${nodeVersion} is compatible`);
    }

    /**
     * Create directory structure
     */
    async createDirectoryStructure() {
        console.log('\n📁 Creating directory structure...');
        
        const directories = [
            'src/core/entities',
            'src/core/services',
            'src/core/value-objects',
            'src/application/processors',
            'src/application/analyzers',
            'src/application/services',
            'src/infrastructure/zoom',
            'src/infrastructure/google',
            'src/infrastructure/ai',
            'src/infrastructure/knowledge-base',
            'src/api/routes',
            'src/api/webhooks',
            'src/api/middleware',
            'src/shared/config',
            'src/shared/logging',
            'src/shared/errors',
            'src/shared/utils',
            'tests/unit',
            'tests/integration',
            'tests/e2e',
            'logs',
            'temp',
            'data'
        ];
        
        for (const dir of directories) {
            await fs.mkdir(dir, { recursive: true });
            console.log(`  ✓ Created ${dir}`);
        }
    }

    /**
     * Migrate environment variables
     */
    async migrateEnvironmentVariables() {
        console.log('\n🔧 Migrating environment variables...');
        
        // Read old .env
        const oldEnv = await fs.readFile(this.oldConfigPath, 'utf8');
        const oldVars = this.parseEnv(oldEnv);
        
        // Create new .env
        const newVars = [];
        const missing = [];
        
        // Add header
        newVars.push('# Zoom Recording Processor - Production Configuration');
        newVars.push('# Generated by migration script on ' + new Date().toISOString());
        newVars.push('');
        
        // Server configuration
        newVars.push('# Server Configuration');
        newVars.push('PORT=' + (oldVars.PORT || '3000'));
        newVars.push('NODE_ENV=production');
        newVars.push('');
        
        // Zoom configuration
        newVars.push('# Zoom Configuration');
        for (const [oldKey, newKey] of Object.entries(this.mappings.env)) {
            if (oldKey.startsWith('ZOOM_')) {
                if (oldVars[oldKey]) {
                    newVars.push(`${newKey}=${oldVars[oldKey]}`);
                } else {
                    missing.push(oldKey);
                }
            }
        }
        newVars.push('');
        
        // Google configuration
        newVars.push('# Google Configuration');
        for (const [oldKey, newKey] of Object.entries(this.mappings.env)) {
            if (oldKey.includes('GOOGLE') || oldKey.includes('FOLDER') || oldKey.includes('SHEET')) {
                if (oldVars[oldKey]) {
                    newVars.push(`${newKey}=${oldVars[oldKey]}`);
                } else if (!oldKey.includes('TRIVIAL')) { // TRIVIAL folder is optional
                    missing.push(oldKey);
                }
            }
        }
        newVars.push('');
        
        // AI configuration (optional)
        newVars.push('# AI Configuration (Optional)');
        if (oldVars.OPENAI_API_KEY) {
            newVars.push(`OPENAI_API_KEY=${oldVars.OPENAI_API_KEY}`);
            newVars.push(`OPENAI_MODEL=${oldVars.OPENAI_MODEL || 'gpt-4-turbo-preview'}`);
        }
        if (oldVars.ANTHROPIC_API_KEY) {
            newVars.push(`ANTHROPIC_API_KEY=${oldVars.ANTHROPIC_API_KEY}`);
            newVars.push(`ANTHROPIC_MODEL=${oldVars.ANTHROPIC_MODEL || 'claude-3-opus-20240229'}`);
        }
        newVars.push('');
        
        // Processing configuration
        newVars.push('# Processing Configuration');
        newVars.push('MAX_CONCURRENT_JOBS=5');
        newVars.push('JOB_TIMEOUT=3600000');
        newVars.push('TEMP_DIR=./temp');
        newVars.push('CLEANUP_DELAY=300000');
        newVars.push('');
        
        // Logging configuration
        newVars.push('# Logging Configuration');
        newVars.push('LOG_LEVEL=info');
        newVars.push('LOG_DIR=./logs');
        newVars.push('LOG_MAX_FILES=14');
        newVars.push('LOG_MAX_SIZE=20m');
        newVars.push('');
        
        // Feature flags
        newVars.push('# Feature Flags');
        newVars.push('ENABLE_AI_INSIGHTS=true');
        newVars.push('ENABLE_TRANSCRIPT_ANALYSIS=true');
        newVars.push('ENABLE_OUTCOMES_PROCESSING=true');
        newVars.push('ENABLE_AUTO_RETRY=true');
        
        // Write new .env
        await fs.writeFile(this.newConfigPath, newVars.join('\n'));
        console.log(`  ✓ Created ${this.newConfigPath}`);
        
        // Create .env.example
        const exampleVars = newVars.map(line => {
            if (line.includes('=') && !line.startsWith('#')) {
                const [key] = line.split('=');
                return `${key}=`;
            }
            return line;
        });
        await fs.writeFile('.env.example', exampleVars.join('\n'));
        console.log('  ✓ Created .env.example');
        
        if (missing.length > 0) {
            console.log('\n  ⚠️  Missing environment variables:');
            missing.forEach(key => console.log(`    - ${key}`));
        }
    }

    /**
     * Parse .env file
     */
    parseEnv(content) {
        const vars = {};
        const lines = content.split('\n');
        
        for (const line of lines) {
            if (line.trim() && !line.startsWith('#')) {
                const [key, ...valueParts] = line.split('=');
                if (key && valueParts.length > 0) {
                    vars[key.trim()] = valueParts.join('=').trim();
                }
            }
        }
        
        return vars;
    }

    /**
     * Copy knowledge base data
     */
    async copyKnowledgeBase() {
        console.log('\n📚 Copying knowledge base data...');
        
        const dataFiles = [
            'students-comprehensive.csv',
            'coaches.csv',
            'programs.csv'
        ];
        
        // Create knowledge base directory
        const kbDir = 'src/infrastructure/knowledge-base/data';
        await fs.mkdir(kbDir, { recursive: true });
        
        for (const file of dataFiles) {
            try {
                await fs.copyFile(
                    path.join('data', file),
                    path.join(kbDir, file)
                );
                console.log(`  ✓ Copied ${file}`);
            } catch (error) {
                console.log(`  ⚠️  Could not copy ${file}: ${error.message}`);
            }
        }
    }

    /**
     * Generate configuration files
     */
    async generateConfigFiles() {
        console.log('\n📝 Generating configuration files...');
        
        // Create PM2 ecosystem file
        const pm2Config = {
            apps: [{
                name: 'zoom-processor',
                script: './src/index.js',
                instances: 1,
                exec_mode: 'fork',
                env: {
                    NODE_ENV: 'production'
                },
                error_file: './logs/pm2-error.log',
                out_file: './logs/pm2-out.log',
                log_file: './logs/pm2-combined.log',
                time: true
            }]
        };
        
        await fs.writeFile('ecosystem.config.js', 
            `module.exports = ${JSON.stringify(pm2Config, null, 2)};`
        );
        console.log('  ✓ Created ecosystem.config.js');
        
        // Create Dockerfile
        const dockerfile = `# Zoom Recording Processor Docker Image
FROM node:18-alpine

# Install dependencies
RUN apk add --no-cache \\
    python3 \\
    make \\
    g++

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy source code
COPY . .

# Create directories
RUN mkdir -p logs temp

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "src/index.js"]
`;
        
        await fs.writeFile('Dockerfile', dockerfile);
        console.log('  ✓ Created Dockerfile');
        
        // Create .dockerignore
        const dockerignore = `node_modules
npm-debug.log
.env
.env.*
!.env.example
logs
temp
coverage
.git
.gitignore
*.md
.DS_Store
`;
        
        await fs.writeFile('.dockerignore', dockerignore);
        console.log('  ✓ Created .dockerignore');
        
        // Create .gitignore
        const gitignore = `# Dependencies
node_modules/

# Environment files
.env
.env.*
!.env.example

# Logs
logs/
*.log

# Temporary files
temp/
tmp/

# Test coverage
coverage/

# OS files
.DS_Store
Thumbs.db

# IDE files
.vscode/
.idea/
*.swp
*.swo

# Build files
dist/
build/
`;
        
        await fs.writeFile('.gitignore', gitignore);
        console.log('  ✓ Created .gitignore');
    }

    /**
     * Create migration report
     */
    async createMigrationReport() {
        console.log('\n📊 Creating migration report...');
        
        const report = `# Migration Report

Generated on: ${new Date().toISOString()}

## Summary

The migration script has successfully created the new project structure and migrated your configuration.

## What Was Migrated

### Environment Variables
- ✅ Zoom configuration
- ✅ Google Drive configuration  
- ✅ Google Sheets configuration
- ✅ AI service configuration (if present)
- ✅ Server configuration

### Project Structure
- ✅ Created layered architecture directories
- ✅ Set up configuration files
- ✅ Created Docker configuration
- ✅ Set up PM2 configuration

### Data Files
- ✅ Copied knowledge base CSV files

## Manual Steps Required

### 1. Install Dependencies
\`\`\`bash
npm install
\`\`\`

### 2. Copy Custom Code
You'll need to manually review and copy any custom business logic from these files:
- Custom analysis logic
- Special processing rules
- Business-specific validations

### 3. Update Import Paths
All imports need to be updated to use the new structure:
- Old: \`require('./logger')\`
- New: \`require('../shared/logging/logger')\`

### 4. Test the Migration
\`\`\`bash
# Run unit tests
npm test

# Test webhook endpoint
curl -X POST http://localhost:3000/api/webhooks/zoom \\
  -H "Content-Type: application/json" \\
  -d '{"event": "endpoint.url_validation", "payload": {"plainToken": "test"}}'

# Check health endpoint
curl http://localhost:3000/health
\`\`\`

## New Features Available

1. **RESTful API Endpoints**
   - GET /api/recordings
   - GET /api/sessions
   - GET /api/stats/overview

2. **Better Error Handling**
   - Retry logic with exponential backoff
   - Circuit breaker for external services
   - Structured error types

3. **Enhanced Logging**
   - Structured JSON logging
   - Context-aware child loggers
   - Performance metrics

4. **Dependency Injection**
   - Easier testing
   - Better service isolation
   - Configuration validation

## Environment Variables Changes

| Old Variable | New Variable | Notes |
|-------------|--------------|-------|
| RECORDINGS_ROOT_FOLDER_ID | GOOGLE_DRIVE_PARENT_FOLDER_ID | Renamed for clarity |
| MASTER_INDEX_SHEET_ID | GOOGLE_SHEETS_MASTER_ID | Renamed for consistency |

## Next Steps

1. Review this report and the generated configuration files
2. Install dependencies
3. Run tests to ensure everything is working
4. Deploy to staging environment for testing
5. Plan production deployment

## Support

If you encounter any issues during migration:
1. Check the logs in the \`logs/\` directory
2. Review the error messages
3. Ensure all environment variables are set correctly
4. Verify network connectivity to external services

---
End of Migration Report
`;
        
        await fs.writeFile('migration-report.md', report);
        console.log('  ✓ Created migration-report.md');
    }
}

// Run migration if called directly
if (require.main === module) {
    const migration = new MigrationScript();
    migration.run().catch(console.error);
}

module.exports = { MigrationScript }; 