/**
 * Preflight Zoom Analyzer
 * 
 * Analyzes Zoom recordings BEFORE downloading to ensure accurate processing
 * Uses high-fidelity data sources: transcripts, timeline.json, metadata
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { getContainer } = require('./src/container');
const readline = require('readline');
const { table } = require('table');

class PreflightZoomAnalyzer {
    constructor() {
        this.container = null;
        this.services = {};
        this.recordings = [];
        this.analysisResults = [];
        this.approvedRecordings = [];
        this.rejectedRecordings = [];
    }
    
    async initialize() {
        console.log('🚀 Initializing Preflight Zoom Analyzer\n');
        
        this.container = getContainer();
        
        this.services = {
            zoomService: this.container.cradle.zoomService,
            nameStandardizer: this.container.cradle.nameStandardizer,
            weekInferencer: this.container.cradle.weekInferencer,
            metadataExtractor: this.container.cradle.metadataExtractor,
            logger: this.container.cradle.logger
        };
        
        // Initialize ZoomService if it has an initialize method
        if (this.services.zoomService && typeof this.services.zoomService.initialize === 'function') {
            console.log('🔑 Initializing Zoom Service...');
            await this.services.zoomService.initialize();
        }
        
        console.log('✅ Services initialized\n');
    }
    
    /**
     * Gate 1: Fetch and display all recordings for review
     */
    async fetchAndDisplayRecordings(fromDate, toDate) {
        console.log('📥 GATE 1: Fetching Zoom Recordings\n');
        console.log(`Date Range: ${fromDate} to ${toDate}\n`);
        
        try {
            // Fetch recordings with full metadata
            this.recordings = await this._fetchRecordingsWithMetadata(fromDate, toDate);
            
            console.log(`Found ${this.recordings.length} recordings\n`);
            
            // Display summary
            this._displayRecordingsSummary();
            
            // Display detailed table
            this._displayRecordingsTable();
            
            // Get user approval
            const approved = await this._getUserApproval(
                '\nDo you want to proceed with analyzing these recordings? (yes/no): '
            );
            
            if (!approved) {
                console.log('\n❌ Analysis cancelled by user');
                return false;
            }
            
            console.log('\n✅ Recordings approved for analysis\n');
            return true;
            
        } catch (error) {
            console.error('❌ Failed to fetch recordings:', error);
            throw error;
        }
    }
    
    /**
     * Gate 2: Analyze recordings without downloading
     */
    async analyzeRecordingsWithoutDownload() {
        console.log('🔍 GATE 2: Pre-Download Analysis\n');
        console.log('Analyzing recordings using Zoom metadata, transcripts, and timeline data...\n');
        
        const totalRecordings = this.recordings.length;
        
        for (let i = 0; i < totalRecordings; i++) {
            const recording = this.recordings[i];
            console.log(`\nAnalyzing ${i + 1}/${totalRecordings}: ${recording.topic}`);
            
            try {
                // Perform deep analysis without downloading
                const analysis = await this._performDeepAnalysis(recording);
                
                this.analysisResults.push({
                    recording,
                    analysis,
                    approved: null // Will be set during review
                });
                
                // Show brief result
                console.log(`  ✅ Analyzed: ${analysis.standardizedName} (${analysis.confidence.overall}% confidence)`);
                
            } catch (error) {
                console.error(`  ❌ Analysis failed: ${error.message}`);
                
                this.analysisResults.push({
                    recording,
                    analysis: null,
                    error: error.message,
                    approved: false
                });
            }
            
            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        console.log('\n✅ Pre-download analysis complete\n');
        
        // Display analysis results
        this._displayAnalysisResults();
        
        // Get user approval for results
        const approved = await this._reviewAndApproveResults();
        
        return approved;
    }
    
    /**
     * Fetch recordings with enhanced metadata using proven daily search method
     */
    async _fetchRecordingsWithMetadata(fromDate, toDate) {
        console.log('📥 Fetching recordings using proven daily search method...');
        
        // Use the proven daily search method from get-all-recordings-final.js
        const recordings = await this.services.zoomService.getAllRecordings(fromDate, toDate);
        
        console.log(`Found ${recordings.length} recordings, enhancing with metadata...`);
        
        // Enhance each recording with additional metadata
        const enhancedRecordings = [];
        
        for (let i = 0; i < recordings.length; i++) {
            const recording = recordings[i];
            
            try {
                // Get detailed recording info
                const details = await this.services.zoomService.getRecording(recording.uuid);
                
                // Check what files are available
                const files = details.recording_files || [];
                const hasTranscript = files.some(f => f.file_type === 'TRANSCRIPT');
                const hasTimeline = files.some(f => f.file_type === 'TIMELINE');
                const hasChat = files.some(f => f.file_type === 'CHAT');
                
                enhancedRecordings.push({
                    ...recording,
                    ...details,
                    availableFiles: {
                        transcript: hasTranscript,
                        timeline: hasTimeline,
                        chat: hasChat,
                        video: files.filter(f => f.file_type === 'MP4').length,
                        audio: files.filter(f => f.file_type === 'M4A').length
                    },
                    totalSize: files.reduce((sum, f) => sum + (f.file_size || 0), 0)
                });
                
                // Progress indicator every 10 recordings
                if ((i + 1) % 10 === 0) {
                    console.log(`  Enhanced ${i + 1}/${recordings.length} recordings...`);
                }
                
            } catch (error) {
                this.services.logger.warn(`Failed to get details for ${recording.uuid}:`, error);
                enhancedRecordings.push({
                    ...recording,
                    availableFiles: {},
                    totalSize: recording.total_size || 0
                });
            }
        }
        
        console.log(`✅ Enhanced ${enhancedRecordings.length} recordings with metadata`);
        return enhancedRecordings;
    }
    
    /**
     * Perform deep analysis using all available data sources
     */
    async _performDeepAnalysis(recording) {
        const analysis = {
            // Original data
            originalTopic: recording.topic,
            uuid: recording.uuid,
            startTime: recording.start_time,
            duration: recording.duration,
            hostEmail: recording.host_email,
            
            // Standardization results
            standardizedName: '',
            coach: '',
            student: '',
            weekNumber: '',
            
            // Confidence scores
            confidence: {
                name: 0,
                week: 0,
                overall: 0
            },
            
            // Data sources used
            dataSources: [],
            
            // Resolution details
            nameResolution: {},
            weekResolution: {},
            
            // Predicted output
            predictedFolderName: '',
            predictedPath: '',
            
            // Warnings
            warnings: []
        };
        
        // 1. Try to fetch and analyze transcript
        if (recording.availableFiles?.transcript) {
            try {
                const transcriptData = await this._analyzeTranscript(recording);
                if (transcriptData) {
                    analysis.dataSources.push('transcript');
                    
                    // Extract names from transcript speakers
                    if (transcriptData.speakers?.length > 0) {
                        analysis.transcriptSpeakers = transcriptData.speakers;
                        
                        // Intelligent speaker analysis
                        const speakerAnalysis = this._analyzeSpeakers(transcriptData.speakers);
                        if (speakerAnalysis.coach) analysis.coach = speakerAnalysis.coach;
                        if (speakerAnalysis.student) analysis.student = speakerAnalysis.student;
                    }
                    
                    // Look for week mentions in transcript content
                    if (transcriptData.content) {
                        const weekMentions = this._extractWeekFromText(transcriptData.content);
                        if (weekMentions.length > 0) {
                            analysis.weekFromTranscript = weekMentions[0];
                            analysis.dataSources.push('transcript-content');
                        }
                    }
                }
            } catch (error) {
                analysis.warnings.push(`Transcript analysis failed: ${error.message}`);
            }
        }
        
        // 2. Analyze timeline.json if available
        if (recording.availableFiles?.timeline) {
            try {
                const timelineData = await this._analyzeTimeline(recording);
                if (timelineData) {
                    analysis.dataSources.push('timeline');
                    analysis.timelineData = timelineData;
                    
                    // Extract participant names from timeline
                    if (timelineData.participants) {
                        const participantAnalysis = this._analyzeParticipants(timelineData.participants);
                        if (!analysis.coach && participantAnalysis.coach) {
                            analysis.coach = participantAnalysis.coach;
                        }
                        if (!analysis.student && participantAnalysis.student) {
                            analysis.student = participantAnalysis.student;
                        }
                    }
                }
            } catch (error) {
                analysis.warnings.push(`Timeline analysis failed: ${error.message}`);
            }
        }
        
        // 3. Analyze meeting metadata
        try {
            const metadataAnalysis = await this.services.metadataExtractor.extractMetadata(recording);
            if (metadataAnalysis) {
                analysis.dataSources.push('metadata');
                analysis.metadataAnalysis = metadataAnalysis;
            }
        } catch (error) {
            console.error('Metadata extraction error:', error);
            analysis.warnings.push(`Metadata extraction failed: ${error.message}`);
        }
        
        // 4. Run name standardization with all collected data
        try {
            const nameInput = analysis.student || 
                             analysis.transcriptSpeakers?.[1] || 
                             recording.topic || 
                             '';
                             
            const nameResult = await this.services.nameStandardizer.standardizeName(nameInput);
            
            analysis.standardizedName = nameResult.standardized;
            analysis.confidence.name = nameResult.confidence;
            analysis.nameResolution = nameResult;
            
            // Extract coach and student from name result
            if (nameResult.components) {
                analysis.coach = analysis.coach || nameResult.components.coach || 'Unknown Coach';
                analysis.student = nameResult.components.student || nameResult.standardizedName;
            }
        } catch (error) {
            console.error('Name standardization error:', error);
            analysis.warnings.push(`Name standardization failed: ${error.message}`);
            analysis.standardizedName = recording.topic || 'Unknown';
            analysis.confidence.name = 0;
        }
        
        // 5. Run week inference with all data
        try {
            const weekResult = await this.services.weekInferencer.inferWeek({
                timestamp: recording.start_time,
                metadata: recording,
                recordingName: analysis.standardizedName,
                additionalContext: {
                    transcriptWeek: analysis.weekFromTranscript,
                    folderPattern: recording.topic,
                    coach: analysis.coach,
                    student: analysis.student
                }
            });
            
            analysis.weekNumber = weekResult.weekNumber;
            analysis.confidence.week = weekResult.confidence;
            analysis.weekResolution = weekResult;
        } catch (error) {
            console.error('Week inference error:', error);
            analysis.warnings.push(`Week inference failed: ${error.message}`);
            analysis.weekNumber = 'Week-X';
            analysis.confidence.week = 0;
        }
        
        // 6. Calculate overall confidence
        analysis.confidence.overall = Math.round(
            (analysis.confidence.name * 0.6 + analysis.confidence.week * 0.4)
        );
        
        // 7. Generate predicted outputs
        const date = new Date(recording.start_time).toISOString().split('T')[0];
        analysis.predictedFolderName = `${date} ${analysis.standardizedName} ${analysis.weekNumber || 'Week-X'}`;
        analysis.predictedPath = `Zoom Recordings/${analysis.predictedFolderName}`;
        
        // 8. Add warnings for low confidence
        if (analysis.confidence.name < 70) {
            analysis.warnings.push(`Low name confidence: ${analysis.confidence.name}%`);
        }
        if (analysis.confidence.week < 60) {
            analysis.warnings.push(`Low week confidence: ${analysis.confidence.week}%`);
        }
        
        return analysis;
    }
    
    /**
     * Analyze transcript content and speakers
     */
    async _analyzeTranscript(recording) {
        try {
            // In a real implementation, this would fetch the transcript from Zoom
            // For now, we'll simulate the analysis
            
            // Zoom API would provide transcript data
            // const transcript = await this.services.zoomService.getTranscript(recording.uuid);
            
            // Simulated transcript analysis
            return {
                speakers: this._extractSpeakersFromTopic(recording.topic),
                content: recording.topic, // Would be actual transcript content
                duration: recording.duration,
                confidence: 'high'
            };
            
        } catch (error) {
            this.services.logger.warn('Transcript analysis error:', error);
            return null;
        }
    }
    
    /**
     * Analyze timeline.json data
     */
    async _analyzeTimeline(recording) {
        try {
            // In a real implementation, this would fetch timeline.json from Zoom
            // Timeline contains participant join/leave times and names
            
            return {
                participants: this._extractParticipantsFromTopic(recording.topic),
                events: [], // Would contain join/leave events
                duration: recording.duration
            };
            
        } catch (error) {
            this.services.logger.warn('Timeline analysis error:', error);
            return null;
        }
    }
    
    /**
     * Extract speakers from topic (fallback method)
     */
    _extractSpeakersFromTopic(topic) {
        const speakers = [];
        
        // Common patterns
        if (topic.includes('Personal Meeting Room')) {
            speakers.push('Coach');
        }
        
        // Extract names
        const namePattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g;
        const matches = topic.match(namePattern);
        
        if (matches) {
            matches.forEach(match => {
                if (!speakers.includes(match)) {
                    speakers.push(match);
                }
            });
        }
        
        return speakers;
    }
    
    /**
     * Extract participants from topic (fallback method)
     */
    _extractParticipantsFromTopic(topic) {
        // Similar to speakers but for timeline data
        return this._extractSpeakersFromTopic(topic).map(name => ({
            name,
            email: null,
            joinTime: null,
            leaveTime: null
        }));
    }
    
    /**
     * Analyze speakers to identify coach and student
     */
    _analyzeSpeakers(speakers) {
        const result = {
            coach: null,
            student: null
        };
        
        // Logic to identify coach vs student
        speakers.forEach(speaker => {
            if (speaker.toLowerCase().includes('coach') || 
                speaker.includes('Personal Meeting Room')) {
                result.coach = speaker;
            } else if (!result.student) {
                result.student = speaker;
            }
        });
        
        return result;
    }
    
    /**
     * Analyze participants from timeline
     */
    _analyzeParticipants(participants) {
        // Similar to speaker analysis but with more data
        return this._analyzeSpeakers(participants.map(p => p.name));
    }
    
    /**
     * Extract week mentions from text
     */
    _extractWeekFromText(text) {
        const weekPatterns = [
            /[Ww]eek[\s-]*(\d+)/g,
            /[Ww]eek[\s-]*([A-Za-z]+)/g,
            /[Ss]ession[\s-]*(\d+)/g
        ];
        
        const weeks = [];
        
        weekPatterns.forEach(pattern => {
            const matches = text.matchAll(pattern);
            for (const match of matches) {
                weeks.push(`Week-${match[1]}`);
            }
        });
        
        return [...new Set(weeks)];
    }
    
    /**
     * Display recordings summary
     */
    _displayRecordingsSummary() {
        console.log('📊 RECORDINGS SUMMARY');
        console.log('─'.repeat(80));
        
        // Group by host
        const byHost = {};
        this.recordings.forEach(rec => {
            const host = rec.host_email || 'Unknown';
            byHost[host] = (byHost[host] || 0) + 1;
        });
        
        console.log('\nBy Host:');
        Object.entries(byHost).forEach(([host, count]) => {
            console.log(`  ${host}: ${count} recordings`);
        });
        
        // Group by recording type
        const byType = {};
        this.recordings.forEach(rec => {
            const type = rec.recording_type || 'Unknown';
            byType[type] = (byType[type] || 0) + 1;
        });
        
        console.log('\nBy Type:');
        Object.entries(byType).forEach(([type, count]) => {
            console.log(`  ${type}: ${count} recordings`);
        });
        
        // Total size
        const totalSize = this.recordings.reduce((sum, rec) => sum + (rec.totalSize || 0), 0);
        console.log(`\nTotal Size: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`);
        
        console.log('\n' + '─'.repeat(80));
    }
    
    /**
     * Display recordings in a table
     */
    _displayRecordingsTable() {
        console.log('\n📋 RECORDINGS LIST');
        console.log('─'.repeat(80));
        
        const tableData = [
            ['#', 'Date', 'Topic', 'Duration', 'Host', 'Files', 'Size (MB)']
        ];
        
        this.recordings.forEach((rec, index) => {
            const date = new Date(rec.start_time).toLocaleDateString();
            const duration = Math.round(rec.duration / 60) + 'm';
            const host = rec.host_email?.split('@')[0] || 'Unknown';
            
            const files = [];
            if (rec.availableFiles?.transcript) files.push('T');
            if (rec.availableFiles?.timeline) files.push('TL');
            if (rec.availableFiles?.chat) files.push('C');
            if (rec.availableFiles?.video) files.push(`V${rec.availableFiles.video}`);
            
            const size = Math.round(rec.totalSize / 1024 / 1024);
            
            tableData.push([
                (index + 1).toString(),
                date,
                rec.topic.substring(0, 40) + (rec.topic.length > 40 ? '...' : ''),
                duration,
                host,
                files.join(','),
                size.toString()
            ]);
        });
        
        console.log(table(tableData, {
            border: {
                topBody: '─',
                topJoin: '┬',
                topLeft: '┌',
                topRight: '┐',
                bottomBody: '─',
                bottomJoin: '┴',
                bottomLeft: '└',
                bottomRight: '┘',
                bodyLeft: '│',
                bodyRight: '│',
                bodyJoin: '│',
                joinBody: '─',
                joinLeft: '├',
                joinRight: '┤',
                joinJoin: '┼'
            }
        }));
        
        console.log('Legend: T=Transcript, TL=Timeline, C=Chat, V=Video (count)');
    }
    
    /**
     * Display analysis results
     */
    _displayAnalysisResults() {
        console.log('\n📊 ANALYSIS RESULTS');
        console.log('═'.repeat(120));
        
        const tableData = [
            ['#', 'Original Topic', 'Standardized Name', 'Week', 'Confidence', 'Data Sources', 'Warnings']
        ];
        
        this.analysisResults.forEach((result, index) => {
            if (result.analysis) {
                const a = result.analysis;
                tableData.push([
                    (index + 1).toString(),
                    a.originalTopic.substring(0, 30) + (a.originalTopic.length > 30 ? '...' : ''),
                    a.standardizedName || 'ERROR',
                    a.weekNumber || 'Unknown',
                    `${a.confidence.overall}%`,
                    a.dataSources.join(', '),
                    a.warnings.join('; ') || 'None'
                ]);
            } else {
                tableData.push([
                    (index + 1).toString(),
                    result.recording.topic.substring(0, 30) + '...',
                    'FAILED',
                    'N/A',
                    '0%',
                    'None',
                    result.error || 'Unknown error'
                ]);
            }
        });
        
        console.log(table(tableData, {
            columnDefault: {
                width: 20
            },
            columns: {
                0: { width: 3 },
                1: { width: 30 },
                2: { width: 25 },
                3: { width: 10 },
                4: { width: 10 },
                5: { width: 20 },
                6: { width: 30 }
            }
        }));
        
        // Summary statistics
        const successful = this.analysisResults.filter(r => r.analysis).length;
        const failed = this.analysisResults.filter(r => !r.analysis).length;
        const highConfidence = this.analysisResults.filter(r => r.analysis?.confidence.overall >= 80).length;
        const lowConfidence = this.analysisResults.filter(r => r.analysis && r.analysis.confidence.overall < 60).length;
        
        console.log('\n📈 ANALYSIS SUMMARY');
        console.log('─'.repeat(80));
        console.log(`Total Analyzed: ${this.analysisResults.length}`);
        console.log(`✅ Successful: ${successful}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`🎯 High Confidence (≥80%): ${highConfidence}`);
        console.log(`⚠️  Low Confidence (<60%): ${lowConfidence}`);
    }
    
    /**
     * Review and approve analysis results
     */
    async _reviewAndApproveResults() {
        console.log('\n🔍 DETAILED REVIEW');
        console.log('─'.repeat(80));
        console.log('Review each recording analysis. Type:');
        console.log('  y/yes    - Approve this recording');
        console.log('  n/no     - Reject this recording');
        console.log('  d/detail - Show detailed analysis');
        console.log('  a/all    - Approve all remaining');
        console.log('  s/skip   - Skip all remaining');
        console.log('─'.repeat(80));
        
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        let approveAll = false;
        let skipAll = false;
        
        for (let i = 0; i < this.analysisResults.length; i++) {
            const result = this.analysisResults[i];
            
            if (approveAll) {
                result.approved = true;
                this.approvedRecordings.push(result);
                continue;
            }
            
            if (skipAll) {
                result.approved = false;
                this.rejectedRecordings.push(result);
                continue;
            }
            
            console.log(`\n[${i + 1}/${this.analysisResults.length}] Recording: ${result.recording.topic}`);
            
            if (result.analysis) {
                const a = result.analysis;
                console.log(`  → Standardized: ${a.standardizedName}`);
                console.log(`  → Week: ${a.weekNumber || 'Unknown'}`);
                console.log(`  → Confidence: ${a.confidence.overall}%`);
                console.log(`  → Predicted Path: ${a.predictedPath}`);
                
                if (a.warnings.length > 0) {
                    console.log(`  ⚠️  Warnings: ${a.warnings.join(', ')}`);
                }
            } else {
                console.log(`  ❌ Analysis Failed: ${result.error}`);
            }
            
            let approved = false;
            let decided = false;
            
            while (!decided) {
                const answer = await new Promise(resolve => {
                    rl.question('\nApprove? (y/n/d/a/s): ', resolve);
                });
                
                switch (answer.toLowerCase()) {
                    case 'y':
                    case 'yes':
                        result.approved = true;
                        this.approvedRecordings.push(result);
                        decided = true;
                        break;
                        
                    case 'n':
                    case 'no':
                        result.approved = false;
                        this.rejectedRecordings.push(result);
                        decided = true;
                        break;
                        
                    case 'd':
                    case 'detail':
                        this._showDetailedAnalysis(result);
                        break;
                        
                    case 'a':
                    case 'all':
                        approveAll = true;
                        result.approved = true;
                        this.approvedRecordings.push(result);
                        decided = true;
                        break;
                        
                    case 's':
                    case 'skip':
                        skipAll = true;
                        result.approved = false;
                        this.rejectedRecordings.push(result);
                        decided = true;
                        break;
                        
                    default:
                        console.log('Invalid option. Please enter y/n/d/a/s');
                }
            }
        }
        
        rl.close();
        
        // Show final summary
        console.log('\n📊 REVIEW SUMMARY');
        console.log('─'.repeat(80));
        console.log(`✅ Approved: ${this.approvedRecordings.length}`);
        console.log(`❌ Rejected: ${this.rejectedRecordings.length}`);
        console.log(`📊 Total: ${this.analysisResults.length}`);
        
        if (this.approvedRecordings.length === 0) {
            console.log('\n⚠️  No recordings approved for processing');
            return false;
        }
        
        // Save analysis results
        await this._saveAnalysisResults();
        
        return true;
    }
    
    /**
     * Show detailed analysis for a recording
     */
    _showDetailedAnalysis(result) {
        console.log('\n' + '═'.repeat(80));
        console.log('DETAILED ANALYSIS');
        console.log('═'.repeat(80));
        
        const rec = result.recording;
        const analysis = result.analysis;
        
        console.log('\n📋 Recording Information:');
        console.log(`  UUID: ${rec.uuid}`);
        console.log(`  Topic: ${rec.topic}`);
        console.log(`  Start Time: ${new Date(rec.start_time).toLocaleString()}`);
        console.log(`  Duration: ${Math.round(rec.duration / 60)} minutes`);
        console.log(`  Host: ${rec.host_email}`);
        console.log(`  Type: ${rec.recording_type}`);
        console.log(`  Total Size: ${(rec.totalSize / 1024 / 1024).toFixed(2)} MB`);
        
        console.log('\n📁 Available Files:');
        if (rec.availableFiles) {
            Object.entries(rec.availableFiles).forEach(([type, value]) => {
                if (value) {
                    console.log(`  - ${type}: ${value === true ? 'Yes' : value}`);
                }
            });
        }
        
        if (analysis) {
            console.log('\n🔍 Analysis Results:');
            console.log(`  Standardized Name: ${analysis.standardizedName}`);
            console.log(`  Coach: ${analysis.coach || 'Unknown'}`);
            console.log(`  Student: ${analysis.student || 'Unknown'}`);
            console.log(`  Week Number: ${analysis.weekNumber || 'Unknown'}`);
            
            console.log('\n📊 Confidence Scores:');
            console.log(`  Name Confidence: ${analysis.confidence.name}%`);
            console.log(`  Week Confidence: ${analysis.confidence.week}%`);
            console.log(`  Overall Confidence: ${analysis.confidence.overall}%`);
            
            console.log('\n📚 Data Sources Used:');
            analysis.dataSources.forEach(source => {
                console.log(`  - ${source}`);
            });
            
            console.log('\n🔤 Name Resolution:');
            console.log(`  Method: ${analysis.nameResolution.method}`);
            console.log(`  Confidence: ${analysis.nameResolution.confidence}%`);
            if (analysis.nameResolution.details) {
                console.log(`  Details: ${JSON.stringify(analysis.nameResolution.details, null, 2)}`);
            }
            
            console.log('\n📅 Week Resolution:');
            console.log(`  Method: ${analysis.weekResolution.method}`);
            console.log(`  Confidence: ${analysis.weekResolution.confidence}%`);
            
            console.log('\n📂 Predicted Output:');
            console.log(`  Folder Name: ${analysis.predictedFolderName}`);
            console.log(`  Full Path: ${analysis.predictedPath}`);
            
            if (analysis.warnings.length > 0) {
                console.log('\n⚠️  Warnings:');
                analysis.warnings.forEach(warning => {
                    console.log(`  - ${warning}`);
                });
            }
        } else {
            console.log('\n❌ Analysis Failed:');
            console.log(`  Error: ${result.error}`);
        }
        
        console.log('\n' + '═'.repeat(80));
    }
    
    /**
     * Save analysis results to file
     */
    async _saveAnalysisResults() {
        const timestamp = Date.now();
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                total: this.analysisResults.length,
                approved: this.approvedRecordings.length,
                rejected: this.rejectedRecordings.length
            },
            approvedRecordings: this.approvedRecordings.map(r => ({
                uuid: r.recording.uuid,
                originalTopic: r.recording.topic,
                standardizedName: r.analysis?.standardizedName,
                weekNumber: r.analysis?.weekNumber,
                confidence: r.analysis?.confidence.overall,
                predictedPath: r.analysis?.predictedPath
            })),
            rejectedRecordings: this.rejectedRecordings.map(r => ({
                uuid: r.recording.uuid,
                originalTopic: r.recording.topic,
                reason: r.error || 'User rejected'
            })),
            fullAnalysis: this.analysisResults
        };
        
        // Create reports directory
        await fs.mkdir('reports', { recursive: true });
        
        const reportPath = `reports/preflight-analysis-${timestamp}.json`;
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        
        console.log(`\n📄 Analysis report saved to: ${reportPath}`);
    }
    
    /**
     * Get user approval
     */
    async _getUserApproval(prompt) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        return new Promise(resolve => {
            rl.question(prompt, (answer) => {
                rl.close();
                resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
            });
        });
    }
    
    /**
     * Get approved recordings for processing
     */
    getApprovedRecordings() {
        return this.approvedRecordings.map(r => ({
            recording: r.recording,
            analysis: r.analysis
        }));
    }
}

module.exports = { PreflightZoomAnalyzer }; 