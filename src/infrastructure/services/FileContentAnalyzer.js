/**
 * FileContentAnalyzer.js
 * 
 * Analyzes recording files (transcript, timeline, metadata, chat) to extract
 * coach, student, and week information from actual content
 */

const fs = require('fs').promises;
const path = require('path');

class FileContentAnalyzer {
    constructor({ logger = console } = {}) {
        this.logger = logger;
        
        // Patterns for content extraction
        this.patterns = {
            // Coach introduction patterns
            coachIntro: [
                /(?:i'm|i am|this is|my name is)\s+(?:coach\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
                /(?:hi|hello),?\s+(?:i'm|i am)\s+([A-Za-z]+)(?:\s+[A-Za-z]+)?,?\s+(?:your|the)\s+coach/i,
                /coach\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i
            ],
            
            // Student greeting patterns
            studentGreeting: [
                /(?:hi|hello|hey|good morning|good afternoon)\s+([A-Za-z]+)(?:\s+[A-Za-z]+)?[,!]?/i,
                /([A-Za-z]+),?\s+(?:how are you|how's it going|ready for)/i,
                /(?:great to see you|nice to see you),?\s+([A-Za-z]+)/i
            ],
            
            // Week mention patterns
            weekMention: [
                /[Ww]eek\s+(\d+)/,
                /[Ww]k\s*#?\s*(\d+)/,
                /[Ss]ession\s*#?\s*(\d+)/,
                /[Ll]esson\s+(\d+)/,
                /[Mm]odule\s+(\d+)/,
                /[Uu]nit\s+(\d+)/,
                /(\d+)(?:st|nd|rd|th)\s+(?:week|session|meeting)/i
            ],
            
            // Role indicators in conversation
            coachIndicators: [
                /let's|we should|you need to|your assignment|homework|practice/i,
                /good job|well done|excellent|that's right|correct|great work/i,
                /today we'll|in this session|our goal|objective/i,
                /remember to|make sure|don't forget/i,
                /any questions|do you understand|is that clear/i
            ],
            
            studentIndicators: [
                /i don't understand|can you explain|could you clarify/i,
                /is this right|did i do this correctly|am i on track/i,
                /i think|i believe|in my opinion|i feel/i,
                /i completed|i finished|i worked on|i practiced/i,
                /i'm confused|i'm stuck|i need help/i
            ]
        };
    }
    
    /**
     * Main analysis method - analyzes all available files
     */
    async analyzeRecordingFiles(recordingFiles, recording) {
        const result = {
            coach: 'unknown',
            student: 'Unknown',
            week: null,
            coachSources: [],
            studentSources: [],
            weekSources: [],
            coachDetails: {},
            studentDetails: {},
            weekDetails: {},
            warnings: []
        };
        
        try {
            // Priority 1: Analyze transcript (highest fidelity)
            if (recordingFiles.transcript || recordingFiles.transcriptPath) {
                const transcriptAnalysis = await this.analyzeTranscript(
                    recordingFiles.transcript, 
                    recordingFiles.transcriptPath
                );
                this.mergeResults(result, transcriptAnalysis, 'transcript');
            }
            
            // Priority 2: Analyze timeline (structured data)
            if (recordingFiles.timeline || recordingFiles.timelinePath) {
                const timelineAnalysis = await this.analyzeTimeline(
                    recordingFiles.timeline,
                    recordingFiles.timelinePath
                );
                this.mergeResults(result, timelineAnalysis, 'timeline');
            }
            
            // Priority 3: Analyze metadata
            if (recordingFiles.metadata || recordingFiles.metadataPath) {
                const metadataAnalysis = await this.analyzeMetadata(
                    recordingFiles.metadata,
                    recordingFiles.metadataPath
                );
                this.mergeResults(result, metadataAnalysis, 'metadata');
            }
            
            // Priority 4: Analyze chat messages
            if (recordingFiles.chat || recordingFiles.chatPath) {
                const chatAnalysis = await this.analyzeChatMessages(
                    recordingFiles.chat,
                    recordingFiles.chatPath
                );
                this.mergeResults(result, chatAnalysis, 'chat');
            }
            
            // Validate extracted names
            result.extractionQuality = this.assessExtractionQuality(result);
            
        } catch (error) {
            this.logger.error('File analysis error:', error);
            result.warnings.push(`Analysis error: ${error.message}`);
        }
        
        return result;
    }
    
    /**
     * Analyze transcript file (VTT format)
     */
    async analyzeTranscript(transcriptContent, transcriptPath) {
        const result = {
            coach: 'unknown',
            student: 'Unknown',
            week: null,
            confidence: {},
            context: {
                speakers: new Map(),
                utterances: [],
                weekMentions: [],
                nameReferences: []
            }
        };
        
        try {
            // Load content if path provided
            if (!transcriptContent && transcriptPath) {
                transcriptContent = await fs.readFile(transcriptPath, 'utf8');
            }
            
            if (!transcriptContent) {
                return result;
            }
            
            // Parse VTT format
            const utterances = this.parseVTTContent(transcriptContent);
            result.context.utterances = utterances;
            
            // Analyze each utterance
            for (const utterance of utterances) {
                // Track speakers
                if (!result.context.speakers.has(utterance.speaker)) {
                    result.context.speakers.set(utterance.speaker, {
                        name: utterance.speaker,
                        utteranceCount: 0,
                        roleIndicators: { coach: 0, student: 0 },
                        timestamps: []
                    });
                }
                
                const speakerData = result.context.speakers.get(utterance.speaker);
                speakerData.utteranceCount++;
                speakerData.timestamps.push(utterance.timestamp);
                
                // Extract names and roles
                await this.extractNamesFromUtterance(utterance, result, speakerData);
                
                // Extract week references
                this.extractWeekFromUtterance(utterance, result);
            }
            
            // Analyze speaker patterns to identify roles
            if (result.coach === 'unknown' || result.student === 'Unknown') {
                const roleAnalysis = this.analyzeSpeakerRoles(result.context.speakers);
                
                if (result.coach === 'unknown' && roleAnalysis.likelyCoach) {
                    result.coach = roleAnalysis.likelyCoach;
                    result.confidence.coach = 'speaker-pattern';
                }
                
                if (result.student === 'Unknown' && roleAnalysis.likelyStudent) {
                    result.student = roleAnalysis.likelyStudent;
                    result.confidence.student = 'speaker-pattern';
                }
            }
            
        } catch (error) {
            this.logger.error('Transcript analysis error:', error);
        }
        
        return result;
    }
    
    /**
     * Parse VTT content into structured utterances
     */
    parseVTTContent(vttContent) {
        const utterances = [];
        const lines = vttContent.split('\n');
        
        let currentTimestamp = null;
        let i = 0;
        
        while (i < lines.length) {
            const line = lines[i].trim();
            
            // Skip WEBVTT header and empty lines
            if (!line || line === 'WEBVTT' || line.startsWith('NOTE')) {
                i++;
                continue;
            }
            
            // Timestamp line
            if (line.includes('-->')) {
                currentTimestamp = line;
                i++;
                continue;
            }
            
            // Text line after timestamp
            if (currentTimestamp && line) {
                // Try to extract speaker from formats like "Speaker: text" or "[Speaker] text"
                let speaker = 'Unknown Speaker';
                let text = line;
                
                const speakerMatch = line.match(/^([^:]+):\s*(.+)$/) || 
                                   line.match(/^\[([^\]]+)\]\s*(.+)$/);
                
                if (speakerMatch) {
                    speaker = speakerMatch[1].trim();
                    text = speakerMatch[2].trim();
                } else {
                    // Try to infer speaker from previous utterances
                    if (utterances.length > 0) {
                        const lastSpeaker = utterances[utterances.length - 1].speaker;
                        if (lastSpeaker !== 'Unknown Speaker') {
                            // Simple heuristic: alternate speakers in conversation
                            const speakers = [...new Set(utterances.map(u => u.speaker))];
                            if (speakers.length === 2) {
                                speaker = speakers.find(s => s !== lastSpeaker) || 'Unknown Speaker';
                            }
                        }
                    }
                }
                
                utterances.push({
                    timestamp: currentTimestamp,
                    speaker: speaker,
                    text: text,
                    originalLine: line
                });
                
                currentTimestamp = null;
            }
            
            i++;
        }
        
        return utterances;
    }
    
    /**
     * Extract names from utterance
     */
    async extractNamesFromUtterance(utterance, result, speakerData) {
        const text = utterance.text;
        const textLower = text.toLowerCase();
        
        // Check for coach introduction
        for (const pattern of this.patterns.coachIntro) {
            const match = text.match(pattern);
            if (match && match[1]) {
                const potentialCoach = match[1].trim();
                if (result.coach === 'unknown') {
                    result.coach = potentialCoach;
                    result.confidence.coach = 'self-introduction';
                    result.context.nameReferences.push({
                        type: 'coach',
                        name: potentialCoach,
                        context: utterance.text,
                        speaker: utterance.speaker
                    });
                }
            }
        }
        
        // Check for student greeting
        for (const pattern of this.patterns.studentGreeting) {
            const match = text.match(pattern);
            if (match && match[1]) {
                const potentialStudent = match[1].trim();
                // Avoid common false positives
                if (!['there', 'everyone', 'class', 'all', 'guys'].includes(potentialStudent.toLowerCase())) {
                    if (result.student === 'Unknown') {
                        result.student = potentialStudent;
                        result.confidence.student = 'greeting';
                        result.context.nameReferences.push({
                            type: 'student',
                            name: potentialStudent,
                            context: utterance.text,
                            speaker: utterance.speaker
                        });
                    }
                }
            }
        }
        
        // Check role indicators
        for (const pattern of this.patterns.coachIndicators) {
            if (pattern.test(textLower)) {
                speakerData.roleIndicators.coach++;
            }
        }
        
        for (const pattern of this.patterns.studentIndicators) {
            if (pattern.test(textLower)) {
                speakerData.roleIndicators.student++;
            }
        }
    }
    
    /**
     * Extract week references from utterance
     */
    extractWeekFromUtterance(utterance, result) {
        const text = utterance.text;
        
        for (const pattern of this.patterns.weekMention) {
            const match = text.match(pattern);
            if (match) {
                const weekNum = parseInt(match[1]);
                if (weekNum > 0 && weekNum <= 52) {
                    if (!result.week || result.context.weekMentions.length === 0) {
                        result.week = weekNum;
                    }
                    
                    result.context.weekMentions.push({
                        week: weekNum,
                        context: utterance.text,
                        speaker: utterance.speaker,
                        timestamp: utterance.timestamp
                    });
                    
                    // Higher confidence if mentioned multiple times
                    if (result.context.weekMentions.filter(w => w.week === weekNum).length >= 2) {
                        result.confidence.week = 'multiple-mentions';
                    } else {
                        result.confidence.week = 'single-mention';
                    }
                    
                    break;
                }
            }
        }
    }
    
    /**
     * Analyze speaker patterns to identify roles
     */
    analyzeSpeakerRoles(speakers) {
        const result = {
            likelyCoach: null,
            likelyStudent: null,
            confidence: {}
        };
        
        let maxCoachScore = 0;
        let maxStudentScore = 0;
        
        // Calculate role scores for each speaker
        for (const [speakerName, data] of speakers) {
            const coachScore = data.roleIndicators.coach;
            const studentScore = data.roleIndicators.student;
            const utteranceCount = data.utteranceCount;
            
            // Coaches typically speak more and use more directive language
            const adjustedCoachScore = coachScore + (utteranceCount * 0.2);
            
            if (adjustedCoachScore > maxCoachScore) {
                maxCoachScore = adjustedCoachScore;
                result.likelyCoach = speakerName;
            }
            
            if (studentScore > maxStudentScore) {
                maxStudentScore = studentScore;
                result.likelyStudent = speakerName;
            }
        }
        
        // If we have a clear coach but no student, the other main speaker is likely the student
        if (result.likelyCoach && !result.likelyStudent && speakers.size === 2) {
            for (const [speakerName] of speakers) {
                if (speakerName !== result.likelyCoach) {
                    result.likelyStudent = speakerName;
                    break;
                }
            }
        }
        
        return result;
    }
    
    /**
     * Analyze timeline.json file
     */
    async analyzeTimeline(timelineContent, timelinePath) {
        const result = {
            coach: 'unknown',
            student: 'Unknown',
            week: null,
            confidence: {}
        };
        
        try {
            // If timelineContent looks like a file path, treat it as such
            if (typeof timelineContent === 'string' && timelineContent.includes('/') && timelineContent.endsWith('.json')) {
                timelinePath = timelineContent;
                timelineContent = null;
            }
            
            // Load content if path provided
            if (!timelineContent && timelinePath) {
                timelineContent = await fs.readFile(timelinePath, 'utf8');
            }
            
            if (!timelineContent) return result;
            
            const timeline = typeof timelineContent === 'string' ? 
                JSON.parse(timelineContent) : timelineContent;
            
            // Extract from participants
            if (timeline.participants && Array.isArray(timeline.participants)) {
                for (const participant of timeline.participants) {
                    if (participant.role === 'host' || participant.isHost || participant.host) {
                        if (participant.name && result.coach === 'unknown') {
                            result.coach = participant.name;
                            result.confidence.coach = 'timeline-host';
                        }
                    } else if (participant.name && result.student === 'Unknown') {
                        // Only set as student if there are just 2 participants
                        if (timeline.participants.length === 2) {
                            result.student = participant.name;
                            result.confidence.student = 'timeline-participant';
                        }
                    }
                }
            }
            
            // Look for week in events or topics
            if (timeline.events && Array.isArray(timeline.events)) {
                for (const event of timeline.events) {
                    const eventText = event.value || event.description || event.topic || '';
                    
                    for (const pattern of this.patterns.weekMention) {
                        const match = eventText.match(pattern);
                        if (match) {
                            const weekNum = parseInt(match[1]);
                            if (weekNum > 0 && weekNum <= 52) {
                                result.week = weekNum;
                                result.confidence.week = 'timeline-event';
                                break;
                            }
                        }
                    }
                    
                    if (result.week) break;
                }
            }
            
        } catch (error) {
            this.logger.error('Timeline analysis error:', error);
        }
        
        return result;
    }
    
    /**
     * Analyze metadata.json file
     */
    async analyzeMetadata(metadataContent, metadataPath) {
        const result = {
            coach: 'unknown',
            student: 'Unknown',
            week: null,
            confidence: {}
        };
        
        try {
            // Load content if path provided
            if (!metadataContent && metadataPath) {
                metadataContent = await fs.readFile(metadataPath, 'utf8');
            }
            
            if (!metadataContent) return result;
            
            const metadata = typeof metadataContent === 'string' ? 
                JSON.parse(metadataContent) : metadataContent;
            
            // Extract host as potential coach
            if (metadata.host) {
                if (metadata.host.name && result.coach === 'unknown') {
                    result.coach = metadata.host.name;
                    result.confidence.coach = 'metadata-host';
                }
            }
            
            // Look for participants
            if (metadata.participants && Array.isArray(metadata.participants)) {
                // If only 2 people and we have a host, the other is likely student
                if (metadata.participants.length === 2 && result.coach !== 'unknown') {
                    const nonHost = metadata.participants.find(p => 
                        p.name && p.name !== result.coach
                    );
                    if (nonHost && result.student === 'Unknown') {
                        result.student = nonHost.name;
                        result.confidence.student = 'metadata-participant';
                    }
                }
            }
            
            // Check topic for week
            if (metadata.topic) {
                for (const pattern of this.patterns.weekMention) {
                    const match = metadata.topic.match(pattern);
                    if (match) {
                        const weekNum = parseInt(match[1]);
                        if (weekNum > 0 && weekNum <= 52) {
                            result.week = weekNum;
                            result.confidence.week = 'metadata-topic';
                            break;
                        }
                    }
                }
            }
            
        } catch (error) {
            this.logger.error('Metadata analysis error:', error);
        }
        
        return result;
    }
    
    /**
     * Analyze chat messages
     */
    async analyzeChatMessages(chatContent, chatPath) {
        const result = {
            coach: 'unknown',
            student: 'Unknown',
            week: null,
            confidence: {}
        };
        
        try {
            // Load content if path provided
            if (!chatContent && chatPath) {
                try {
                    // Try to read as text first
                    chatContent = await fs.readFile(chatPath, 'utf8');
                } catch (readError) {
                    this.logger.error('Failed to read chat file:', readError);
                    return result;
                }
            }
            
            if (!chatContent) return result;
            
            let chat;
            let messages = [];
            
            // Try to parse as JSON first
            try {
                chat = typeof chatContent === 'string' ? 
                    JSON.parse(chatContent) : chatContent;
                
                // Extract messages from JSON structure
                messages = chat.messages || chat || [];
                if (!Array.isArray(messages)) {
                    messages = [messages];
                }
            } catch (jsonError) {
                // If JSON parsing fails, treat as plain text
                this.logger.debug('Chat file is not JSON, treating as plain text');
                messages = [{
                    text: chatContent,
                    content: chatContent,
                    message: chatContent
                }];
            }
            
            // Analyze messages
            if (Array.isArray(messages)) {
                for (const message of messages) {
                    const text = message.text || message.content || message.message || '';
                    
                    if (!text || typeof text !== 'string') continue;
                    
                    // Look for week mentions in chat
                    for (const pattern of this.patterns.weekMention) {
                        const match = text.match(pattern);
                        if (match) {
                            const weekNum = parseInt(match[1]);
                            if (weekNum > 0 && weekNum <= 52 && !result.week) {
                                result.week = weekNum;
                                result.confidence.week = 'chat-message';
                            }
                        }
                    }
                    
                    // Look for file names that might contain info
                    if (message.files || message.attachments) {
                        const files = message.files || message.attachments;
                        for (const file of files) {
                            const filename = file.name || file.filename || '';
                            // Extract student name from filename like "Kavya_Week28_Essay.docx"
                            const fileMatch = filename.match(/^([A-Za-z]+)_Week(\d+)/i);
                            if (fileMatch) {
                                if (result.student === 'Unknown') {
                                    result.student = fileMatch[1];
                                    result.confidence.student = 'chat-filename';
                                }
                                if (!result.week) {
                                    result.week = parseInt(fileMatch[2]);
                                    result.confidence.week = 'chat-filename';
                                }
                            }
                        }
                    }
                }
            }
            
        } catch (error) {
            this.logger.error('Chat analysis error:', {
                errorMessage: error.message,
                errorStack: error.stack
            });
        }
        
        return result;
    }
    
    /**
     * Merge results from different analyses
     */
    mergeResults(target, source, sourceType) {
        // Merge coach if not found yet
        if (target.coach === 'unknown' && source.coach !== 'unknown') {
            target.coach = source.coach;
            target.coachSources.push(sourceType);
            if (source.confidence?.coach) {
                target.coachDetails[sourceType] = source.confidence.coach;
            }
        }
        
        // Merge student if not found yet
        if (target.student === 'Unknown' && source.student !== 'Unknown') {
            target.student = source.student;
            target.studentSources.push(sourceType);
            if (source.confidence?.student) {
                target.studentDetails[sourceType] = source.confidence.student;
            }
        }
        
        // Merge week if not found yet
        if (!target.week && source.week) {
            target.week = source.week;
            target.weekSources.push(sourceType);
            if (source.confidence?.week) {
                target.weekDetails[sourceType] = source.confidence.week;
            }
        }
        
        // Merge context if available
        if (source.context) {
            if (!target.context) target.context = {};
            Object.assign(target.context, source.context);
        }
    }
    
    /**
     * Assess extraction quality
     */
    assessExtractionQuality(result) {
        const quality = {
            coach: 'none',
            student: 'none',
            week: 'none',
            overall: 'low'
        };
        
        // Coach quality
        if (result.coachSources.includes('transcript')) {
            quality.coach = 'high';
        } else if (result.coachSources.includes('timeline') || result.coachSources.includes('metadata')) {
            quality.coach = 'medium';
        } else if (result.coachSources.length > 0) {
            quality.coach = 'low';
        }
        
        // Student quality
        if (result.studentSources.includes('transcript')) {
            quality.student = 'high';
        } else if (result.studentSources.includes('timeline') || result.studentSources.includes('metadata')) {
            quality.student = 'medium';
        } else if (result.studentSources.length > 0) {
            quality.student = 'low';
        }
        
        // Week quality
        if (result.weekSources.includes('transcript') || result.weekSources.includes('chat')) {
            quality.week = 'high';
        } else if (result.weekSources.length > 0) {
            quality.week = 'medium';
        }
        
        // Overall quality
        const highCount = Object.values(quality).filter(q => q === 'high').length;
        const mediumCount = Object.values(quality).filter(q => q === 'medium').length;
        
        if (highCount >= 2) {
            quality.overall = 'high';
        } else if (highCount >= 1 || mediumCount >= 2) {
            quality.overall = 'medium';
        }
        
        return quality;
    }

    analyzeFile(filePath) {
        // Dummy implementation: just return file path
        return {
            filePath,
            analyzed: true,
            type: 'unknown',
            metadata: {}
        };
    }
}

module.exports = { FileContentAnalyzer };