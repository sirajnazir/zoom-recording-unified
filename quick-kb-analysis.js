#!/usr/bin/env node
require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

async function analyzeKnowledgeBase() {
    console.log('🔍 Quick Knowledge Base Analysis\n');
    
    const auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'google-credentials.json',
        scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const authClient = await auth.getClient();
    const drive = google.drive({ version: 'v3', auth: authClient });
    
    const rootFolderId = '1dgx7k3J_z0PO7cOVMqKuFOajl_x_Dulg';
    
    // Get top-level structure
    console.log('📁 TOP-LEVEL STRUCTURE:');
    console.log('================================================================================');
    
    const topLevel = await drive.files.list({
        q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 100
    });
    
    const stats = {
        yearFolders: [],
        coachFolders: [],
        studentFolders: [],
        otherFolders: [],
        totalRecordings: 0,
        sampleNaming: []
    };
    
    for (const folder of topLevel.data.files) {
        console.log(`\n📁 ${folder.name}`);
        
        // Categorize folders
        if (folder.name.match(/^\d{4}$/)) {
            stats.yearFolders.push(folder.name);
        } else if (folder.name.includes('Coaches') || folder.name.includes('Coach')) {
            stats.coachFolders.push(folder.name);
        } else if (folder.name.includes('Students') || folder.name.includes('Student')) {
            stats.studentFolders.push(folder.name);
        } else {
            stats.otherFolders.push(folder.name);
        }
        
        // Sample subfolders
        const subFolders = await drive.files.list({
            q: `'${folder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(name)',
            pageSize: 5
        });
        
        if (subFolders.data.files.length > 0) {
            console.log('   Sample subfolders:');
            subFolders.data.files.forEach(sub => {
                console.log(`   - ${sub.name}`);
                stats.sampleNaming.push(sub.name);
            });
        }
    }
    
    // Analyze naming patterns
    console.log('\n\n📊 NAMING PATTERN ANALYSIS:');
    console.log('================================================================================');
    
    const patterns = {
        dateFirst: /^\d{4}-\d{2}-\d{2}_/,
        coachingPrefix: /^Coaching_[ABC]_/,
        miscPrefix: /^MISC_[ABC]_/,
        trivialPrefix: /^TRIVIAL_[ABC]_/,
        underscoreSeparated: /_/g
    };
    
    const patternCounts = {
        dateFirst: 0,
        coachingPrefix: 0,
        miscPrefix: 0,
        trivialPrefix: 0,
        other: 0
    };
    
    stats.sampleNaming.forEach(name => {
        if (patterns.dateFirst.test(name)) patternCounts.dateFirst++;
        else if (patterns.coachingPrefix.test(name)) patternCounts.coachingPrefix++;
        else if (patterns.miscPrefix.test(name)) patternCounts.miscPrefix++;
        else if (patterns.trivialPrefix.test(name)) patternCounts.trivialPrefix++;
        else patternCounts.other++;
    });
    
    console.log('Naming patterns found:');
    console.log(`- Date-first format (YYYY-MM-DD_): ${patternCounts.dateFirst}`);
    console.log(`- Coaching prefix format: ${patternCounts.coachingPrefix}`);
    console.log(`- MISC prefix format: ${patternCounts.miscPrefix}`);
    console.log(`- TRIVIAL prefix format: ${patternCounts.trivialPrefix}`);
    console.log(`- Other formats: ${patternCounts.other}`);
    
    // Summary
    console.log('\n\n📈 SUMMARY:');
    console.log('================================================================================');
    console.log(`Year-based folders: ${stats.yearFolders.join(', ') || 'None found'}`);
    console.log(`Coach folders: ${stats.coachFolders.join(', ') || 'None found'}`);
    console.log(`Student folders: ${stats.studentFolders.join(', ') || 'None found'}`);
    console.log(`Other folders: ${stats.otherFolders.slice(0, 5).join(', ')}${stats.otherFolders.length > 5 ? '...' : ''}`);
    
    // Recommendations
    console.log('\n\n💡 RECOMMENDATIONS FOR WEBHOOK INTEGRATION:');
    console.log('================================================================================');
    
    if (stats.yearFolders.length === 0) {
        console.log('1. ❌ Create year-based folders (2023, 2024, 2025) for better organization');
    } else {
        console.log('1. ✅ Year-based folder structure detected');
    }
    
    if (patternCounts.dateFirst < stats.sampleNaming.length * 0.5) {
        console.log('2. ⚠️  Standardize naming to YYYY-MM-DD_Coach_Student format');
    } else {
        console.log('2. ✅ Good adoption of date-first naming convention');
    }
    
    console.log('3. 📋 Create standardized file names within recordings:');
    console.log('   - video.mp4 (main recording)');
    console.log('   - audio.m4a (audio track)');
    console.log('   - transcript.vtt (transcription)');
    console.log('   - chat.txt (meeting chat)');
    console.log('   - summary.json (AI summary)');
    
    console.log('\n4. 🔧 Set up Google Sheets tabs:');
    console.log('   - "Zoom Recordings" (main tracking)');
    console.log('   - "Processed" (completed recordings)');
    console.log('   - "Errors" (failed processing)');
    console.log('   - "Webhook - Raw" (webhook logs)');
    
    // Save analysis
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = `validation-reports/kb-analysis-${timestamp}.json`;
    await fs.writeFile(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        stats,
        patternCounts,
        sampleNaming: stats.sampleNaming.slice(0, 20)
    }, null, 2));
    
    console.log(`\n✅ Analysis saved to: ${reportPath}`);
}

analyzeKnowledgeBase().catch(console.error);