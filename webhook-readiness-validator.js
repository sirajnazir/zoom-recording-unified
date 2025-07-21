#!/usr/bin/env node
require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class WebhookReadinessValidator {
    constructor() {
        this.rootFolderId = '1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg';
        this.sheets = null;
        this.drive = null;
        this.validationChecks = {
            folderStructure: { passed: false, issues: [] },
            namingConvention: { passed: false, issues: [] },
            sheetsIntegration: { passed: false, issues: [] },
            fileStandardization: { passed: false, issues: [] },
            webhookCompatibility: { passed: false, issues: [] },
            scalability: { passed: false, issues: [] }
        };
    }

    async initialize() {
        console.log('🚀 Initializing Webhook Readiness Validator...\n');
        
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
            scopes: [
                'https://www.googleapis.com/auth/drive',
                'https://www.googleapis.com/auth/spreadsheets'
            ],
        });

        const authClient = await auth.getClient();
        this.drive = google.drive({ version: 'v3', auth: authClient });
        this.sheets = google.sheets({ version: 'v4', auth: authClient });
    }

    async validateWebhookReadiness() {
        console.log('🔍 Validating Knowledge Base for Webhook Integration...\n');
        console.log('================================================================================\n');

        await this.checkFolderStructure();
        await this.checkNamingConvention();
        await this.checkSheetsIntegration();
        await this.checkFileStandardization();
        await this.checkWebhookCompatibility();
        await this.checkScalability();
        
        await this.generateReadinessReport();
    }

    async checkFolderStructure() {
        console.log('📁 Checking Folder Structure...');
        
        try {
            // Check if root folder exists and is accessible
            const rootFolder = await this.drive.files.get({
                fileId: this.rootFolderId,
                fields: 'id,name,mimeType'
            });

            // Check for year-based organization
            const response = await this.drive.files.list({
                q: `'${this.rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'files(id, name)',
                pageSize: 100
            });

            const yearFolders = response.data.files.filter(f => f.name.match(/^\d{4}$/));
            
            if (yearFolders.length > 0) {
                this.validationChecks.folderStructure.passed = true;
                console.log('   ✅ Year-based folder structure detected');
            } else {
                this.validationChecks.folderStructure.issues.push('No year-based folder structure found');
                console.log('   ❌ Year-based folder structure not found');
            }

            // Check for consistent subfolder structure
            for (const yearFolder of yearFolders.slice(0, 2)) {
                const subResponse = await this.drive.files.list({
                    q: `'${yearFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                    fields: 'files(name)',
                    pageSize: 10
                });

                const standardizedCount = subResponse.data.files.filter(f => 
                    f.name.match(/^\d{4}-\d{2}-\d{2}_/)
                ).length;

                if (standardizedCount < subResponse.data.files.length * 0.8) {
                    this.validationChecks.folderStructure.issues.push(
                        `Year ${yearFolder.name} has non-standard subfolder names`
                    );
                }
            }

        } catch (error) {
            this.validationChecks.folderStructure.issues.push(`Error accessing folder structure: ${error.message}`);
            console.log('   ❌ Error checking folder structure');
        }
    }

    async checkNamingConvention() {
        console.log('\n📝 Checking Naming Convention Compliance...');
        
        const namingPattern = /^(\d{4}-\d{2}-\d{2})_([^_]+)_([^_]+)(?:_(.+))?$/;
        let totalFolders = 0;
        let compliantFolders = 0;

        try {
            // Sample folders from different years
            const yearFolders = await this.drive.files.list({
                q: `'${this.rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name matches '^\\\\d{4}$' and trashed = false`,
                fields: 'files(id, name)',
                pageSize: 10
            });

            for (const yearFolder of yearFolders.data.files) {
                const subFolders = await this.drive.files.list({
                    q: `'${yearFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                    fields: 'files(name)',
                    pageSize: 100
                });

                totalFolders += subFolders.data.files.length;
                compliantFolders += subFolders.data.files.filter(f => namingPattern.test(f.name)).length;
            }

            const complianceRate = totalFolders > 0 ? (compliantFolders / totalFolders) * 100 : 0;
            
            if (complianceRate >= 90) {
                this.validationChecks.namingConvention.passed = true;
                console.log(`   ✅ Naming convention compliance: ${complianceRate.toFixed(1)}%`);
            } else {
                this.validationChecks.namingConvention.issues.push(
                    `Low naming convention compliance: ${complianceRate.toFixed(1)}%`
                );
                console.log(`   ⚠️  Naming convention compliance: ${complianceRate.toFixed(1)}%`);
            }

        } catch (error) {
            this.validationChecks.namingConvention.issues.push(`Error checking naming convention: ${error.message}`);
            console.log('   ❌ Error checking naming convention');
        }
    }

    async checkSheetsIntegration() {
        console.log('\n📊 Checking Google Sheets Integration...');
        
        try {
            // Check if master spreadsheet exists
            const sheetId = process.env.GOOGLE_SHEET_ID;
            if (!sheetId) {
                this.validationChecks.sheetsIntegration.issues.push('GOOGLE_SHEET_ID not configured');
                console.log('   ❌ Google Sheets ID not configured');
                return;
            }

            const sheet = await this.sheets.spreadsheets.get({
                spreadsheetId: sheetId,
                fields: 'sheets.properties.title'
            });

            const tabNames = sheet.data.sheets.map(s => s.properties.title);
            const requiredTabs = ['Zoom Recordings', 'Processed', 'Errors'];
            const missingTabs = requiredTabs.filter(tab => !tabNames.includes(tab));

            if (missingTabs.length === 0) {
                this.validationChecks.sheetsIntegration.passed = true;
                console.log('   ✅ All required sheet tabs found');
            } else {
                this.validationChecks.sheetsIntegration.issues.push(
                    `Missing required tabs: ${missingTabs.join(', ')}`
                );
                console.log(`   ⚠️  Missing tabs: ${missingTabs.join(', ')}`);
            }

            // Check for webhook logging structure
            const webhookTab = tabNames.find(tab => tab.includes('Webhook') || tab.includes('webhook'));
            if (webhookTab) {
                console.log(`   ✅ Webhook logging tab found: ${webhookTab}`);
            } else {
                this.validationChecks.sheetsIntegration.issues.push('No webhook logging tab found');
                console.log('   ⚠️  No webhook logging tab found');
            }

        } catch (error) {
            this.validationChecks.sheetsIntegration.issues.push(`Error accessing sheets: ${error.message}`);
            console.log('   ❌ Error checking sheets integration');
        }
    }

    async checkFileStandardization() {
        console.log('\n📄 Checking File Standardization...');
        
        const standardFileNames = ['video.mp4', 'audio.m4a', 'transcript.vtt', 'chat.txt'];
        let totalRecordings = 0;
        let compliantRecordings = 0;

        try {
            // Sample recent recordings
            const recentFolders = await this.drive.files.list({
                q: `'${this.rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '2024' and trashed = false`,
                fields: 'files(id)',
                pageSize: 1
            });

            if (recentFolders.data.files.length > 0) {
                const yearFolderId = recentFolders.data.files[0].id;
                const recordingFolders = await this.drive.files.list({
                    q: `'${yearFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                    fields: 'files(id, name)',
                    pageSize: 20
                });

                for (const folder of recordingFolders.data.files) {
                    totalRecordings++;
                    const files = await this.drive.files.list({
                        q: `'${folder.id}' in parents and trashed = false`,
                        fields: 'files(name)',
                        pageSize: 20
                    });

                    const fileNames = files.data.files.map(f => f.name.toLowerCase());
                    const hasStandardFiles = standardFileNames.every(std => 
                        fileNames.includes(std) || fileNames.some(name => name.includes(std.split('.')[0]))
                    );

                    if (hasStandardFiles) {
                        compliantRecordings++;
                    }
                }
            }

            const complianceRate = totalRecordings > 0 ? (compliantRecordings / totalRecordings) * 100 : 0;
            
            if (complianceRate >= 80) {
                this.validationChecks.fileStandardization.passed = true;
                console.log(`   ✅ File standardization compliance: ${complianceRate.toFixed(1)}%`);
            } else {
                this.validationChecks.fileStandardization.issues.push(
                    `Low file standardization: ${complianceRate.toFixed(1)}%`
                );
                console.log(`   ⚠️  File standardization compliance: ${complianceRate.toFixed(1)}%`);
            }

        } catch (error) {
            this.validationChecks.fileStandardization.issues.push(`Error checking files: ${error.message}`);
            console.log('   ❌ Error checking file standardization');
        }
    }

    async checkWebhookCompatibility() {
        console.log('\n🔗 Checking Webhook Compatibility...');
        
        const requirements = {
            envVars: ['ZOOM_WEBHOOK_SECRET', 'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_SHEET_ID'],
            folders: ['output', 'logs', 'validation-reports'],
            scripts: ['process-zoom-webhook.js', 'knowledge-base-validator.js']
        };

        let allRequirementsMet = true;

        // Check environment variables
        const missingEnvVars = requirements.envVars.filter(v => !process.env[v]);
        if (missingEnvVars.length > 0) {
            this.validationChecks.webhookCompatibility.issues.push(
                `Missing environment variables: ${missingEnvVars.join(', ')}`
            );
            allRequirementsMet = false;
            console.log(`   ❌ Missing env vars: ${missingEnvVars.join(', ')}`);
        } else {
            console.log('   ✅ All required environment variables configured');
        }

        // Check local folder structure
        for (const folder of requirements.folders) {
            try {
                await fs.access(path.join(__dirname, folder));
                console.log(`   ✅ ${folder} directory exists`);
            } catch {
                this.validationChecks.webhookCompatibility.issues.push(`Missing directory: ${folder}`);
                allRequirementsMet = false;
                console.log(`   ❌ ${folder} directory missing`);
            }
        }

        // Check for required scripts
        for (const script of requirements.scripts) {
            try {
                await fs.access(path.join(__dirname, script));
                console.log(`   ✅ ${script} exists`);
            } catch {
                this.validationChecks.webhookCompatibility.issues.push(`Missing script: ${script}`);
                allRequirementsMet = false;
                console.log(`   ❌ ${script} missing`);
            }
        }

        this.validationChecks.webhookCompatibility.passed = allRequirementsMet;
    }

    async checkScalability() {
        console.log('\n📈 Checking Scalability Readiness...');
        
        const scalabilityChecks = {
            folderLimit: { threshold: 500, current: 0 },
            monthlyGrowth: { threshold: 100, current: 0 },
            automationReady: true
        };

        try {
            // Count total recording folders
            let totalRecordingFolders = 0;
            const yearFolders = await this.drive.files.list({
                q: `'${this.rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name matches '^\\\\d{4}$' and trashed = false`,
                fields: 'files(id, name)'
            });

            for (const yearFolder of yearFolders.data.files) {
                const count = await this.drive.files.list({
                    q: `'${yearFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                    fields: 'files(id)',
                    pageSize: 1
                });
                totalRecordingFolders += parseInt(count.data.files.length);
            }

            scalabilityChecks.folderLimit.current = totalRecordingFolders;

            // Check if within scalability limits
            if (totalRecordingFolders < scalabilityChecks.folderLimit.threshold) {
                console.log(`   ✅ Recording count (${totalRecordingFolders}) within scalability limit`);
            } else {
                this.validationChecks.scalability.issues.push(
                    `High folder count (${totalRecordingFolders}) may require optimization`
                );
                console.log(`   ⚠️  High folder count: ${totalRecordingFolders}`);
            }

            // Check automation readiness
            if (this.validationChecks.namingConvention.passed && 
                this.validationChecks.fileStandardization.passed) {
                this.validationChecks.scalability.passed = true;
                console.log('   ✅ Knowledge base is automation-ready');
            } else {
                this.validationChecks.scalability.issues.push(
                    'Standardization issues may impact automation'
                );
                console.log('   ⚠️  Standardization improvements needed for full automation');
            }

        } catch (error) {
            this.validationChecks.scalability.issues.push(`Error checking scalability: ${error.message}`);
            console.log('   ❌ Error checking scalability');
        }
    }

    async generateReadinessReport() {
        console.log('\n================================================================================');
        console.log('📋 WEBHOOK READINESS REPORT');
        console.log('================================================================================\n');

        let overallScore = 0;
        let totalChecks = 0;

        Object.entries(this.validationChecks).forEach(([check, result]) => {
            totalChecks++;
            if (result.passed) overallScore++;
            
            const status = result.passed ? '✅' : '❌';
            const checkName = check.replace(/([A-Z])/g, ' $1').trim();
            console.log(`${status} ${checkName}`);
            
            if (result.issues.length > 0) {
                result.issues.forEach(issue => {
                    console.log(`   - ${issue}`);
                });
            }
        });

        const readinessPercentage = (overallScore / totalChecks) * 100;
        
        console.log('\n================================================================================');
        console.log(`OVERALL READINESS: ${readinessPercentage.toFixed(0)}%`);
        console.log('================================================================================\n');

        if (readinessPercentage === 100) {
            console.log('🎉 Your knowledge base is fully ready for webhook integration!');
        } else if (readinessPercentage >= 80) {
            console.log('👍 Your knowledge base is mostly ready. Address the remaining issues for optimal performance.');
        } else if (readinessPercentage >= 60) {
            console.log('⚠️  Several improvements needed before webhook integration.');
        } else {
            console.log('❌ Significant preparation required before webhook integration.');
        }

        // Save readiness report
        const reportPath = path.join(__dirname, 'validation-reports', `webhook-readiness-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
        await fs.mkdir(path.dirname(reportPath), { recursive: true });
        await fs.writeFile(reportPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            readinessScore: readinessPercentage,
            checks: this.validationChecks
        }, null, 2));
        
        console.log(`\n✅ Readiness report saved: ${reportPath}`);
    }
}

// Main execution
async function main() {
    const validator = new WebhookReadinessValidator();
    await validator.initialize();
    await validator.validateWebhookReadiness();
}

main().catch(console.error);