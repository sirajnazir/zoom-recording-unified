const fs = require('fs').promises;

/**
 * Service for analyzing VTT transcripts
 */
class TranscriptAnalyzer {
    constructor() {
        // Common filler words to ignore in analysis
        this.fillerWords = new Set([
            'um', 'uh', 'like', 'you know', 'i mean', 'actually', 
            'basically', 'literally', 'right', 'so', 'well'
        ]);
        
        // Topic keywords for categorization
        this.topicKeywords = {
            'College Application': ['college', 'university', 'application', 'essay', 'admission'],
            'SAT/ACT Prep': ['sat', 'act', 'test', 'score', 'exam', 'practice'],
            'Extracurricular': ['activity', 'club', 'volunteer', 'leadership', 'project'],
            'Academic': ['grade', 'gpa', 'class', 'course', 'homework', 'study'],
            'Career': ['career', 'internship', 'job', 'profession', 'field'],
            'Personal Development': ['goal', 'growth', 'improve', 'develop', 'skill']
        };
    }

    /**
     * Analyze VTT transcript file
     */
    async analyze(transcriptPath) {
        try {
            const content = await fs.readFile(transcriptPath, 'utf8');
            return this.analyzeContent(content);
        } catch (error) {
            console.error('Error reading transcript:', error);
            return this._getEmptyAnalysis();
        }
    }

    /**
     * Analyze transcript content
     */
    analyzeContent(content) {
        const lines = content.split('\n');
        const speakers = new Map();
        const timestamps = [];
        let totalWords = 0;
        let currentTimestamp = null;
        
        // Parse VTT format
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Skip header and empty lines
            if (!line || line === 'WEBVTT') continue;
            
            // Timestamp line (00:00:00.000 --> 00:00:05.000)
            if (line.includes('-->')) {
                const [start, end] = line.split('-->').map(t => this._parseTimestamp(t.trim()));
                currentTimestamp = { start, end };
                timestamps.push(currentTimestamp);
            }
            // Speaker and text line
            else if (line.includes(':') && currentTimestamp) {
                const colonIndex = line.indexOf(':');
                const speaker = line.substring(0, colonIndex).trim();
                const text = line.substring(colonIndex + 1).trim();
                
                if (speaker && text) {
                    // Update speaker stats
                    if (!speakers.has(speaker)) {
                        speakers.set(speaker, {
                            name: speaker,
                            wordCount: 0,
                            speakingTime: 0,
                            utterances: []
                        });
                    }
                    
                    const speakerData = speakers.get(speaker);
                    const words = this._countWords(text);
                    
                    speakerData.wordCount += words;
                    speakerData.speakingTime += (currentTimestamp.end - currentTimestamp.start);
                    speakerData.utterances.push({
                        text,
                        timestamp: currentTimestamp,
                        wordCount: words
                    });
                    
                    totalWords += words;
                }
            }
        }
        
        // Calculate statistics
        const duration = timestamps.length > 0 
            ? timestamps[timestamps.length - 1].end 
            : 0;
        
        // Identify topics
        const topics = this._identifyTopics(speakers);
        
        // Calculate speaking ratios
        const speakingRatios = this._calculateSpeakingRatios(speakers, duration);
        
        // Extract key phrases
        const keyPhrases = this._extractKeyPhrases(speakers);
        
        return {
            duration,
            wordCount: totalWords,
            speakerCount: speakers.size,
            speakers: Array.from(speakers.values()),
            speakingRatios,
            topics,
            keyPhrases,
            averageWordsPerMinute: duration > 0 ? Math.round(totalWords / (duration / 60)) : 0,
            coachSpeakingRatio: speakingRatios.coach || 0,
            studentSpeakingRatio: speakingRatios.student || 0
        };
    }

    /**
     * Extract speakers from VTT content
     */
    extractSpeakers(content) {
        const speakers = new Set();
        const lines = content.split('\n');
        
        for (const line of lines) {
            if (line.includes(':') && !line.includes('-->')) {
                const speaker = line.split(':')[0].trim();
                if (speaker && speaker !== 'WEBVTT') {
                    speakers.add(speaker);
                }
            }
        }
        
        return Array.from(speakers);
    }

    /**
     * Parse timestamp string to seconds
     */
    _parseTimestamp(timestamp) {
        const parts = timestamp.split(':');
        if (parts.length === 3) {
            const hours = parseInt(parts[0]);
            const minutes = parseInt(parts[1]);
            const seconds = parseFloat(parts[2]);
            return hours * 3600 + minutes * 60 + seconds;
        }
        return 0;
    }

    /**
     * Count words in text, excluding filler words
     */
    _countWords(text) {
        const words = text.toLowerCase().split(/\s+/);
        return words.filter(word => !this.fillerWords.has(word)).length;
    }

    /**
     * Identify topics discussed in the transcript
     */
    _identifyTopics(speakers) {
        const topicCounts = {};
        const allText = Array.from(speakers.values())
            .map(speaker => speaker.utterances.map(u => u.text).join(' '))
            .join(' ')
            .toLowerCase();

        Object.entries(this.topicKeywords).forEach(([topic, keywords]) => {
            let count = 0;
            keywords.forEach(keyword => {
                const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
                const matches = allText.match(regex);
                if (matches) {
                    count += matches.length;
                }
            });
            
            if (count > 0) {
                topicCounts[topic] = count;
            }
        });

        return topicCounts;
    }

    /**
     * Calculate speaking ratios for each speaker
     */
    _calculateSpeakingRatios(speakers, totalDuration) {
        const ratios = {};
        
        if (totalDuration === 0) return ratios;

        speakers.forEach((speakerData, speakerName) => {
            const ratio = speakerData.speakingTime / totalDuration;
            ratios[speakerName.toLowerCase()] = ratio;
        });

        return ratios;
    }

    /**
     * Extract key phrases from the transcript
     */
    _extractKeyPhrases(speakers) {
        const phrases = [];
        const phraseCounts = new Map();
        
        // Collect all utterances
        const allUtterances = Array.from(speakers.values())
            .flatMap(speaker => speaker.utterances)
            .map(u => u.text);

        // Extract potential key phrases (3-5 word combinations)
        allUtterances.forEach(utterance => {
            const words = utterance.toLowerCase().split(/\s+/);
            
            // Generate 3-5 word phrases
            for (let length = 3; length <= 5; length++) {
                for (let i = 0; i <= words.length - length; i++) {
                    const phrase = words.slice(i, i + length).join(' ');
                    
                    // Skip phrases with filler words
                    if (!this._containsFillerWords(phrase)) {
                        const count = phraseCounts.get(phrase) || 0;
                        phraseCounts.set(phrase, count + 1);
                    }
                }
            }
        });

        // Get top phrases
        const sortedPhrases = Array.from(phraseCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        return sortedPhrases.map(([phrase, count]) => ({
            phrase,
            count,
            significance: this._calculatePhraseSignificance(phrase, count)
        }));
    }

    /**
     * Check if phrase contains filler words
     */
    _containsFillerWords(phrase) {
        const words = phrase.split(/\s+/);
        return words.some(word => this.fillerWords.has(word));
    }

    /**
     * Calculate phrase significance score
     */
    _calculatePhraseSignificance(phrase, count) {
        const words = phrase.split(/\s+/);
        const length = words.length;
        
        // Longer phrases and higher counts get higher significance
        return (count * length) / 10;
    }

    /**
     * Get speaking patterns for a specific speaker
     */
    getSpeakingPatterns(speakerName, speakers) {
        const speaker = speakers.get(speakerName);
        if (!speaker) return null;

        const patterns = {
            averageUtteranceLength: 0,
            longestUtterance: null,
            shortestUtterance: null,
            speakingPace: 0,
            pausePatterns: []
        };

        if (speaker.utterances.length > 0) {
            const lengths = speaker.utterances.map(u => u.wordCount);
            patterns.averageUtteranceLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
            patterns.longestUtterance = speaker.utterances.reduce((longest, current) => 
                current.wordCount > longest.wordCount ? current : longest
            );
            patterns.shortestUtterance = speaker.utterances.reduce((shortest, current) => 
                current.wordCount < shortest.wordCount ? current : shortest
            );
            patterns.speakingPace = speaker.wordCount / (speaker.speakingTime / 60);
        }

        return patterns;
    }

    /**
     * Find moments of high engagement
     */
    findHighEngagementMoments(speakers, threshold = 0.8) {
        const moments = [];
        const allUtterances = [];

        // Collect all utterances with timestamps
        speakers.forEach(speaker => {
            speaker.utterances.forEach(utterance => {
                allUtterances.push({
                    ...utterance,
                    speaker: speaker.name
                });
            });
        });

        // Sort by timestamp
        allUtterances.sort((a, b) => a.timestamp.start - b.timestamp.start);

        // Find rapid exchanges
        for (let i = 0; i < allUtterances.length - 1; i++) {
            const current = allUtterances[i];
            const next = allUtterances[i + 1];
            
            const gap = next.timestamp.start - current.timestamp.end;
            
            if (gap < 2 && current.speaker !== next.speaker) { // Less than 2 seconds between speakers
                moments.push({
                    start: current.timestamp.start,
                    end: next.timestamp.end,
                    speakers: [current.speaker, next.speaker],
                    gap: gap,
                    engagement: this._calculateEngagementScore(current, next)
                });
            }
        }

        return moments.filter(moment => moment.engagement > threshold);
    }

    /**
     * Calculate engagement score for a conversation moment
     */
    _calculateEngagementScore(utterance1, utterance2) {
        const wordCount1 = utterance1.wordCount;
        const wordCount2 = utterance2.wordCount;
        const gap = utterance2.timestamp.start - utterance1.timestamp.end;
        
        // Higher score for more words and smaller gaps
        return (wordCount1 + wordCount2) / (gap + 1);
    }

    /**
     * Generate empty analysis for error cases
     */
    _getEmptyAnalysis() {
        return {
            duration: 0,
            wordCount: 0,
            speakerCount: 0,
            speakers: [],
            speakingRatios: {},
            topics: {},
            keyPhrases: [],
            averageWordsPerMinute: 0,
            coachSpeakingRatio: 0,
            studentSpeakingRatio: 0,
            error: true
        };
    }

    /**
     * Validate VTT format
     */
    validateVTTFormat(content) {
        const lines = content.split('\n');
        let hasTimestamp = false;
        let hasSpeaker = false;
        
        for (const line of lines) {
            if (line.includes('-->')) {
                hasTimestamp = true;
            }
            if (line.includes(':') && !line.includes('-->')) {
                hasSpeaker = true;
            }
        }
        
        return hasTimestamp && hasSpeaker;
    }
}

module.exports = { TranscriptAnalyzer }; 