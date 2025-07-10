#!/usr/bin/env node

/**
 * Fix for Unknown Drive Recordings
 * Enhances metadata extraction to properly handle non-standard folder names
 * and ensures high-fidelity extraction from transcript/chat content
 */

require('dotenv').config();
const { createContainer } = require('../src/container');
const { google } = require('googleapis');
const config = require('../config');

// The 20 unknown recordings' folder IDs from the sheet data
const unknownRecordingFolderIds = [
    '1KJ8mFzMpT-mpd9FAMUhtC_TVa93L4l8t',
    '1o0-Ve3_jUvq0Xv9N1k3e0zMl86kcZJhr',
    '1Bhmv97nHdZIuoZoT99dr0H3AhfCTe4oh',
    '1IaDGQ-WJcqQiAZ0DC40rmHmPch-wQlvK',
    '1mczuxWupqkYn7sWCcSmWfZ4xTseB86w9',
    '1d43qU2fNiLFxcG1_V9zbUerJJ7AoUan7',
    '1Iv3KwElUoXcZKfN5mPI7qtLtIm02FRBp',
    '1qCjIbSejfaaH3AAvbyXcFk7iHo_dbq2c',
    '1JTxIdMOAzo76CRdp-oDhBPJxr2mYUK5M',
    '1bDNb4rHhBWJgIqdQ1loFdRZlQ56cQ-x9',
    '1lDAL4fx6e0BVzXKENLvd3KAomoMg4fQA',
    '1ZkXxeJPisUr-GF-1RNKH5NBvBxF9aANI',
    '1SSD0ie4Oqa9_gJu46SGZZePx6u6VK7aL',
    '1SvoqrgpUGFB2Fv9h9o4rhFGeJ5m2c0xF',
    '1reve35GEsOStZ4itNIvTX1qr33ylqU_d',
    '1-tTDHE-Z8MErrc7aFDiB2r40ABlYrx6k',
    '1JNbbheIrQH_ZP3dPHos8kgTlS96N5mAz',
    '162ArNE03QTI9d4kFfuxZ93IgNzmh_fH5',
    '1udz0TwG-itMOgqbqzjOdCPMvqQGMW1FA'
];

async function initializeGoogleDrive() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: config.google.clientEmail,
            private_key: config.google.privateKey
        },
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });
    
    return google.drive({ version: 'v3', auth });
}

/**
 * Get parent folder path to understand context
 */
async function getFolderPath(drive, folderId) {
    const path = [];
    let currentId = folderId;
    
    try {
        while (currentId) {
            const response = await drive.files.get({
                fileId: currentId,
                fields: 'id,name,parents'
            });
            
            path.unshift(response.data.name);
            
            // Get parent
            if (response.data.parents && response.data.parents.length > 0) {
                currentId = response.data.parents[0];
            } else {
                break;
            }
            
            // Limit depth to prevent infinite loops
            if (path.length > 10) break;
        }
    } catch (error) {
        console.error('Error getting folder path:', error.message);
    }
    
    return path;
}

/**
 * Enhanced metadata extraction with multiple fallback strategies
 */
async function extractEnhancedMetadata(drive, folderId, folderName) {
    const metadata = {
        folderName: folderName,
        folderId: folderId,
        extractionMethod: 'unknown',
        confidence: 0
    };
    
    try {
        // Get full folder path for context
        const folderPath = await getFolderPath(drive, folderId);
        console.log(`📁 Folder path: ${folderPath.join(' / ')}`);
        
        // Strategy 1: Extract from folder hierarchy
        // Look for coach folder in path (e.g., "Coach Jenny", "Coach Alan")
        let coachFromPath = null;
        let studentFromPath = null;
        
        for (let i = 0; i < folderPath.length; i++) {
            const folder = folderPath[i];
            
            // Check for coach folder
            if (folder.toLowerCase().includes('coach ')) {
                const coachMatch = folder.match(/Coach\s+([A-Za-z]+)/i);
                if (coachMatch) {
                    coachFromPath = coachMatch[1];
                }
            }
            
            // Check if previous folder was a coach folder
            if (i > 0 && folderPath[i-1].toLowerCase().includes('coach ')) {
                // This might be a student folder
                if (!folder.includes('OLD_') && /^[A-Z][a-z]+/.test(folder)) {
                    studentFromPath = folder;
                }
            }
        }
        
        if (coachFromPath || studentFromPath) {
            metadata.coach = coachFromPath || 'Unknown';
            metadata.student = studentFromPath || 'Unknown';
            metadata.extractionMethod = 'folder_hierarchy';
            metadata.confidence = 0.8;
            console.log(`✅ Extracted from hierarchy - Coach: ${metadata.coach}, Student: ${metadata.student}`);
        }
        
        // Strategy 2: Smart pattern extraction from folder name
        // Handle various non-standard formats
        const patterns = [
            // Email subject format: "Re: Student/ Parent: Program - Time with Coach"
            {
                regex: /Re:\s*([A-Za-z]+)\/?\s*[^:]*:.*with\s+([A-Za-z]+)/i,
                extract: (match) => ({ student: match[1], coach: match[2] })
            },
            // Format: "Student - Coach Meeting"
            {
                regex: /^([A-Za-z]+)\s*-\s*([A-Za-z]+)\s+Meeting/i,
                extract: (match) => ({ student: match[1], coach: match[2] })
            },
            // Format: "Meeting with Student and Coach"
            {
                regex: /Meeting\s+with\s+([A-Za-z]+)\s+and\s+([A-Za-z]+)/i,
                extract: (match) => ({ student: match[1], coach: match[2] })
            },
            // Format: "Coach Name - Student Name"
            {
                regex: /^([A-Za-z]+)\s*-\s*([A-Za-z]+)$/,
                extract: (match) => {
                    // Determine which is coach based on known coaches
                    const knownCoaches = ['jenny', 'alan', 'andrew', 'rishi', 'katie', 'marissa', 'juli', 'erin', 'aditi'];
                    if (knownCoaches.includes(match[1].toLowerCase())) {
                        return { coach: match[1], student: match[2] };
                    } else if (knownCoaches.includes(match[2].toLowerCase())) {
                        return { coach: match[2], student: match[1] };
                    }
                    return null;
                }
            }
        ];
        
        if (!metadata.coach || metadata.coach === 'Unknown') {
            for (const pattern of patterns) {
                const match = folderName.match(pattern.regex);
                if (match) {
                    const extracted = pattern.extract(match);
                    if (extracted) {
                        metadata.coach = extracted.coach || metadata.coach || 'Unknown';
                        metadata.student = extracted.student || metadata.student || 'Unknown';
                        metadata.extractionMethod = 'smart_pattern';
                        metadata.confidence = 0.7;
                        console.log(`✅ Extracted from pattern - Coach: ${metadata.coach}, Student: ${metadata.student}`);
                        break;
                    }
                }
            }
        }
        
        // Strategy 3: Extract date from folder name
        const dateMatch = folderName.match(/(\d{4}-\d{2}-\d{2})|([A-Za-z]+\s+\d{1,2},\s+\d{4})/);
        if (dateMatch) {
            metadata.date = dateMatch[0];
            console.log(`📅 Extracted date: ${metadata.date}`);
        }
        
        // Strategy 4: Week extraction
        const weekMatch = folderName.match(/[Ww]eek\s*(\d+)|[Ww]k\s*(\d+)|#(\d+)/);
        if (weekMatch) {
            metadata.week = weekMatch[1] || weekMatch[2] || weekMatch[3];
            console.log(`📅 Extracted week: ${metadata.week}`);
        }
        
    } catch (error) {
        console.error('Error in enhanced extraction:', error);
    }
    
    return metadata;
}

async function analyzeUnknownRecordings() {
    console.log('🔍 Analyzing Unknown Drive Recordings');
    console.log('=' .repeat(60));
    
    try {
        const container = createContainer();
        const drive = await initializeGoogleDrive();
        
        console.log(`\n📊 Analyzing ${unknownRecordingFolderIds.length} unknown recordings...\n`);
        
        const results = [];
        
        for (let i = 0; i < unknownRecordingFolderIds.length; i++) {
            const folderId = unknownRecordingFolderIds[i];
            console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`[${i + 1}/${unknownRecordingFolderIds.length}] Analyzing folder: ${folderId}`);
            
            try {
                // Get folder info
                const folderResponse = await drive.files.get({
                    fileId: folderId,
                    fields: 'id,name,parents,createdTime'
                });
                
                const folderName = folderResponse.data.name;
                console.log(`📁 Folder name: ${folderName}`);
                
                // Get enhanced metadata
                const metadata = await extractEnhancedMetadata(drive, folderId, folderName);
                
                // Get files in folder to check for transcript/chat
                const filesResponse = await drive.files.list({
                    q: `'${folderId}' in parents and trashed = false`,
                    fields: 'files(id,name,mimeType)',
                    pageSize: 100
                });
                
                const files = filesResponse.data.files || [];
                const hasTranscript = files.some(f => f.name.toLowerCase().includes('.vtt') || f.name.toLowerCase().includes('transcript'));
                const hasChat = files.some(f => f.name.toLowerCase().includes('chat') && f.name.toLowerCase().includes('.txt'));
                
                console.log(`📄 Files: ${files.length} total`);
                console.log(`   - Transcript: ${hasTranscript ? 'YES' : 'NO'}`);
                console.log(`   - Chat: ${hasChat ? 'YES' : 'NO'}`);
                
                results.push({
                    folderId,
                    folderName,
                    ...metadata,
                    hasTranscript,
                    hasChat,
                    fileCount: files.length
                });
                
                // Small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                console.error(`❌ Error analyzing folder ${folderId}:`, error.message);
                results.push({
                    folderId,
                    error: error.message
                });
            }
        }
        
        // Summary
        console.log('\n' + '═'.repeat(60));
        console.log('📊 ANALYSIS SUMMARY');
        console.log('═'.repeat(60));
        
        const successfulExtractions = results.filter(r => r.coach && r.coach !== 'Unknown');
        console.log(`✅ Successfully identified: ${successfulExtractions.length}/${results.length}`);
        
        console.log('\n📋 Extraction Methods Used:');
        const methodCounts = {};
        results.forEach(r => {
            if (r.extractionMethod) {
                methodCounts[r.extractionMethod] = (methodCounts[r.extractionMethod] || 0) + 1;
            }
        });
        Object.entries(methodCounts).forEach(([method, count]) => {
            console.log(`   - ${method}: ${count}`);
        });
        
        console.log('\n🔧 Recommendations:');
        console.log('1. Re-process these recordings with enhanced metadata extraction');
        console.log('2. For recordings with transcripts/chat, use high-fidelity extraction');
        console.log('3. Update folder names to follow standard pattern when possible');
        
        // Save results
        const fs = require('fs').promises;
        await fs.writeFile(
            'unknown-recordings-analysis.json',
            JSON.stringify(results, null, 2)
        );
        console.log('\n💾 Full analysis saved to: unknown-recordings-analysis.json');
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
    }
}

console.log('🚀 Starting unknown recordings analysis...\n');

analyzeUnknownRecordings()
    .then(() => {
        console.log('\n✅ Analysis completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });