#!/usr/bin/env node
/**
 * Update Google Sheets Headers Script
 * 
 * This script updates the header rows of both tabs in the master index spreadsheet
 * with the proper column names based on the DualTabGoogleSheetsService definitions.
 */

require('dotenv').config();
const { google } = require('googleapis');

// Configuration
const config = {
    google: {
        clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
        privateKey: process.env.GOOGLE_PRIVATE_KEY,
        sheets: {
            masterIndexSheetId: process.env.MASTER_INDEX_SHEET_ID
        }
    }
};

// Column definitions for Raw Master Index (Tab 1)
const rawHeaders = [
    'uuid',                    // Original Zoom UUID (primary identifier)
    'meetingId',               // Zoom meeting ID
    'topic',                   // Meeting topic/title
    'startTime',               // Start time (ISO format)
    'endTime',                 // Calculated end time
    'duration',                // Duration in seconds (from Zoom API)
    'hostEmail',               // Host email address
    'hostName',                // Host name (extracted from email)
    'participantCount',        // Number of participants
    'recordingType',           // Type of recording (cloud_recording)
    'fileSize',                // Total file size in bytes
    'downloadUrl',             // Download URL (if available)
    'status',                  // Processing status
    'createdAt',               // Original creation time
    'lastModified'             // Last modification time
];

// Column definitions for Standardized Master Index (Tab 2)
const standardizedHeaders = [
    // A-H: Core Identity & Name Resolution
    'uuid',                    // Original Zoom UUID
    'fingerprint',              // Unique fingerprint
    'recordingDate',            // Recording date (YYYY-MM-DD)
    'rawName',                  // Original meeting topic
    'standardizedName',         // Standardized name (Coach_Student_WkXX_Date)
    'nameConfidence',           // Name resolution confidence (0-100)
    'nameResolutionMethod',     // Method used for name resolution
    'familyAccount',            // Is this a family account? (Yes/No)
    
    // I-K: Smart Week Inference
    'weekNumber',               // Week number extracted/inferred
    'weekConfidence',           // Week inference confidence (0-100)
    'weekInferenceMethod',      // Method used for week inference
    
    // L-Q: Meeting Metadata
    'hostEmail',                // Host email address
    'hostName',                 // Host name (coach name)
    'meetingTopic',             // Meeting topic/title
    'participants',             // List of participants
    'participantCount',         // Number of participants
    'meetingId',                // Zoom meeting ID
    
    // R-V: Recording Details
    'duration',                 // Duration in minutes
    'startTime',                // Start time (ISO format)
    'endTime',                  // End time (ISO format)
    'recordingType',            // Type of recording
    'fileSize',                 // Total file size in MB
    
    // W-AD: Transcript Analysis
    'hasTranscript',            // Has transcript? (Yes/No)
    'transcriptQuality',        // Transcript quality (Good/Fair/Poor)
    'speakerCount',             // Number of speakers
    'primarySpeaker',           // Primary speaker name
    'speakingTimeDistribution', // JSON: speaking time distribution
    'emotionalJourney',         // JSON: emotional journey data
    'engagementScore',          // Engagement score (0-100)
    'keyMoments',               // JSON: key moments array
    
    // AE-AH: Coaching Insights
    'coachingTopics',           // List of coaching topics
    'coachingStyle',            // Coaching style identified
    'studentResponsePattern',   // Student response pattern
    'interactionQuality',       // Interaction quality score
    
    // AI-AL: AI-Generated Insights
    'keyThemes',                // List of key themes
    'actionItems',              // List of action items
    'challengesIdentified',     // List of challenges
    'breakthroughs',            // List of breakthroughs
    
    // AM-AP: Tangible Outcomes
    'goalsSet',                 // List of goals set
    'progressTracked',          // Progress tracking info
    'nextSteps',                // List of next steps
    'followUpRequired',         // Follow-up required? (Yes/No)
    
    // AQ-AT: File Management
    'driveFolder',              // Google Drive folder name
    'driveFolderId',            // Google Drive folder ID
    'videoFileId',              // Video file ID in Drive
    'transcriptFileId',         // Transcript file ID in Drive
    
    // AU-AX: Processing Metadata
    'processedDate',            // Processing date
    'processingVersion',        // Processing version
    'dataSource',               // Data source
    'lastUpdated'               // Last updated timestamp
];

class HeaderUpdater {
    constructor() {
        this.auth = null;
        this.sheets = null;
        this.spreadsheetId = config.google.sheets.masterIndexSheetId;
    }

    async initialize() {
        try {
            console.log('🔧 Initializing Google Sheets API...');
            
            if (!config.google.clientEmail || !config.google.privateKey) {
                throw new Error('Missing Google credentials in environment variables');
            }

            this.auth = new google.auth.GoogleAuth({
                credentials: {
                    client_email: config.google.clientEmail,
                    private_key: config.google.privateKey,
                    type: 'service_account'
                },
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });
            
            const authClient = await this.auth.getClient();
            this.sheets = google.sheets({ version: 'v4', auth: authClient });
            
            console.log('✅ Google Sheets API initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize Google Sheets API:', error.message);
            throw error;
        }
    }

    async updateHeaders() {
        try {
            console.log('\n📊 Updating headers for both tabs...');
            
            // Update Raw Master Index headers
            console.log('\n🔄 Updating Raw Master Index headers...');
            await this.updateRawHeaders();
            
            // Update Standardized Master Index headers
            console.log('\n🔄 Updating Standardized Master Index headers...');
            await this.updateStandardizedHeaders();
            
            console.log('\n✅ All headers updated successfully!');
            
        } catch (error) {
            console.error('❌ Failed to update headers:', error.message);
            throw error;
        }
    }

    async updateRawHeaders() {
        try {
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: 'Raw Master Index!A1:O1',
                valueInputOption: 'RAW',
                requestBody: {
                    values: [rawHeaders]
                }
            });
            
            console.log(`✅ Updated Raw Master Index headers (${rawHeaders.length} columns)`);
            console.log('   Headers:', rawHeaders.join(', '));
            
        } catch (error) {
            console.error('❌ Failed to update Raw Master Index headers:', error.message);
            throw error;
        }
    }

    async updateStandardizedHeaders() {
        try {
            // Calculate the range based on the number of headers
            const lastColumn = this.getColumnLetter(standardizedHeaders.length);
            const range = `Standardized Master Index!A1:${lastColumn}1`;
            
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: range,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [standardizedHeaders]
                }
            });
            
            console.log(`✅ Updated Standardized Master Index headers (${standardizedHeaders.length} columns)`);
            console.log(`   Range: ${range}`);
            console.log('   Headers:', standardizedHeaders.join(', '));
            
        } catch (error) {
            console.error('❌ Failed to update Standardized Master Index headers:', error.message);
            throw error;
        }
    }

    getColumnLetter(columnNumber) {
        let result = '';
        while (columnNumber > 0) {
            columnNumber--;
            result = String.fromCharCode(65 + (columnNumber % 26)) + result;
            columnNumber = Math.floor(columnNumber / 26);
        }
        return result;
    }

    async verifyHeaders() {
        try {
            console.log('\n🔍 Verifying updated headers...');
            
            // Verify Raw Master Index headers
            const rawResponse = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Raw Master Index!A1:O1'
            });
            
            const actualRawHeaders = rawResponse.data.values?.[0] || [];
            console.log('\n📋 Raw Master Index Headers:');
            console.log('   Expected:', rawHeaders.length, 'columns');
            console.log('   Actual:', actualRawHeaders.length, 'columns');
            
            if (actualRawHeaders.length === rawHeaders.length) {
                console.log('   ✅ Raw headers match expected count');
            } else {
                console.log('   ⚠️ Raw headers count mismatch');
            }
            
            // Verify Standardized Master Index headers
            const lastColumn = this.getColumnLetter(standardizedHeaders.length);
            const standardizedResponse = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `Standardized Master Index!A1:${lastColumn}1`
            });
            
            const actualStandardizedHeaders = standardizedResponse.data.values?.[0] || [];
            console.log('\n📋 Standardized Master Index Headers:');
            console.log('   Expected:', standardizedHeaders.length, 'columns');
            console.log('   Actual:', actualStandardizedHeaders.length, 'columns');
            
            if (actualStandardizedHeaders.length === standardizedHeaders.length) {
                console.log('   ✅ Standardized headers match expected count');
            } else {
                console.log('   ⚠️ Standardized headers count mismatch');
            }
            
        } catch (error) {
            console.error('❌ Failed to verify headers:', error.message);
        }
    }
}

async function main() {
    const updater = new HeaderUpdater();
    
    try {
        console.log('🚀 Starting Google Sheets Header Update...\n');
        
        await updater.initialize();
        await updater.updateHeaders();
        await updater.verifyHeaders();
        
        console.log('\n🎉 Header update completed successfully!');
        console.log('\n📝 Summary:');
        console.log(`   Raw Master Index: ${rawHeaders.length} columns`);
        console.log(`   Standardized Master Index: ${standardizedHeaders.length} columns`);
        
    } catch (error) {
        console.error('\n❌ Header update failed:', error.message);
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    main();
}

module.exports = { HeaderUpdater, rawHeaders, standardizedHeaders }; 