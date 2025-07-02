const { logger } = require('../../shared');

class SmartWeekInferencer {
    constructor({ cache, recordingRepository = null }) {
        this.cache = cache;
        this.recordingRepository = recordingRepository || {
            findByStudentAndCoach: async () => []
        };
        
        // Confidence levels for different methods
        this.confidenceLevels = {
            TIMESTAMP_BASED: 100,      // Recording timestamps (highest fidelity)
            MEETING_METADATA: 110,     // Zoom API meeting data (higher than timestamp for explicit references)
            FOLDER_NAME: 80,           // Existing folder structures
            MANUAL_DOCUMENTS: 60,      // Weekly planning docs
            PATTERN_MATCHING: 40,      // Regex patterns (lowest fidelity)
            INTERPOLATION: 90,         // Between known weeks
            EXTRAPOLATION: 85,         // From known weeks
            SEQUENTIAL: 75,            // No anchors, sequential assignment
            PROGRAM_BASED: 70          // Based on program type
        };
        
        // Data source tiers
        this.dataTiers = {
            TIER_1_TIMESTAMPS: 'recording_timestamps',
            TIER_2_MEETING_DATA: 'meeting_metadata',
            TIER_3_FOLDER_NAMES: 'folder_names',
            TIER_4_MANUAL_DOCS: 'manual_documents',
            TIER_5_PATTERNS: 'pattern_matching'
        };
        
        // Week patterns in priority order
        this.weekPatterns = [
            // High Priority Patterns (Explicit Week References)
            { regex: /[Ww]k\s*#?\s*(\d+[A-Z]?)/,    pattern: 'Wk #X', priority: 1 },
            { regex: /[Ww]eek\s*#?\s*(\d+[A-Z]?)/,  pattern: 'Week #X', priority: 1 },
            { regex: /Session\s*#?\s*(\d+[A-Z]?)/,  pattern: 'Session #X', priority: 1 },
            { regex: /Class\s*#?\s*(\d+[A-Z]?)/,    pattern: 'Class #X', priority: 1 },
            { regex: /Lesson\s*#?\s*(\d+[A-Z]?)/,   pattern: 'Lesson #X', priority: 1 },
            
            // NEW: Flexible patterns for actual coach formats (highest priority)
            { regex: /[Ww]eek\s+(\d+)/,             pattern: 'Week X', priority: 1 },
            { regex: /Session\s+(\d+)/,             pattern: 'Session X', priority: 1 },
            { regex: /Class\s+(\d+)/,               pattern: 'Class X', priority: 1 },
            { regex: /Lesson\s+(\d+)/,              pattern: 'Lesson X', priority: 1 },
            
            // NEW: Combined patterns for "Week X | Session Y" format
            { regex: /[Ww]eek\s+(\d+)\s*[|]\s*Session\s+(\d+)/, pattern: 'Week X | Session Y', priority: 1 },
            { regex: /Session\s+(\d+)\s*[|]\s*[Ww]eek\s+(\d+)/, pattern: 'Session X | Week Y', priority: 1 },
            
            // Medium Priority Patterns (Embedded Week References)
            { regex: /_W(\d+[A-Z]?)_/,              pattern: '_WX_', priority: 2 },
            { regex: /\bW(\d+[A-Z]?)\b/,            pattern: 'WX', priority: 2 },
            { regex: /Week(\d+[A-Z]?)/i,            pattern: 'WeekX', priority: 2 },
            { regex: /Session(\d+[A-Z]?)/i,         pattern: 'SessionX', priority: 2 },
            { regex: /Class(\d+[A-Z]?)/i,           pattern: 'ClassX', priority: 2 },
            { regex: /Lesson(\d+[A-Z]?)/i,          pattern: 'LessonX', priority: 2 },
            
            // Lower Priority Patterns (Contextual Week References)
            { regex: /Class\s*(\d+[A-Z]?)/i,        pattern: 'Class X', priority: 3 },
            { regex: /(\d+[A-Z]?)\s*[Ww]k/i,       pattern: 'X Wk', priority: 3 },
            { regex: /(\d+[A-Z]?)\s*[Ww]eek/i,     pattern: 'X Week', priority: 3 },
            { regex: /(\d+[A-Z]?)\s*Session/i,     pattern: 'X Session', priority: 3 },
            { regex: /(\d+[A-Z]?)\s*Class/i,       pattern: 'X Class', priority: 3 },
            { regex: /(\d+[A-Z]?)\s*Lesson/i,      pattern: 'X Lesson', priority: 3 },
            
            // Advanced Patterns (Complex Week References)
            { regex: /Week\s*of\s*(\d+)/i,         pattern: 'Week of X', priority: 4 },
            { regex: /(\d+)\s*st\s*[Ww]eek/i,      pattern: 'Xst Week', priority: 4 },
            { regex: /(\d+)\s*nd\s*[Ww]eek/i,      pattern: 'Xnd Week', priority: 4 },
            { regex: /(\d+)\s*rd\s*[Ww]eek/i,      pattern: 'Xrd Week', priority: 4 },
            { regex: /(\d+)\s*th\s*[Ww]eek/i,      pattern: 'Xth Week', priority: 4 },
            { regex: /(\d+)\s*week\s*program/i,    pattern: 'X week program', priority: 4, exclude: true },
            { regex: /(\d+)-week\s*program/i,      pattern: 'X-week program', priority: 4, exclude: true },
            
            // Fallback Patterns (Generic Number References)
            { regex: /\b(\d{1,2})\b/,              pattern: 'Generic Number', priority: 5, exclude: true }
        ];
        
        this.stats = {
            totalProcessed: 0,
            timestampBased: 0,
            meetingMetadataBased: 0,
            folderNameBased: 0,
            manualDocBased: 0,
            patternBased: 0,
            interpolated: 0,
            extrapolated: 0,
            sequential: 0,
            errors: 0
        };
    }

    /**
     * Main entry point for week inference
     */
    async inferWeekNumber(recording, context = {}) {
        try {
            this.stats.totalProcessed++;
            
            logger.info(`Inferring week number for recording: ${recording.id}`, {
                topic: recording.topic,
                startTime: recording.start_time
            });

            // Try each tier in order of confidence
            const results = await Promise.all([
                this.analyzeByTimestamp(recording, context),
                this.analyzeByMeetingMetadata(recording, context),
                this.analyzeByFolderName(recording, context),
                this.analyzeByPatternMatching(recording, context)
            ]);

            // Find the best result
            const bestResult = results
                .filter(r => r.weekNumber !== null)
                .sort((a, b) => b.confidence - a.confidence)[0];

            if (bestResult) {
                this.updateStats(bestResult.method);
                
                logger.info(`Week inferred successfully`, {
                    weekNumber: bestResult.weekNumber,
                    confidence: bestResult.confidence,
                    method: bestResult.method,
                    tier: bestResult.tier
                });

                return {
                    weekNumber: bestResult.weekNumber,
                    confidence: bestResult.confidence / 100, // Convert to 0-1 scale
                    method: bestResult.method,
                    tier: bestResult.tier,
                    evidence: bestResult.evidence
                };
            }

            // Try relative positioning if no direct match
            const relativeResult = await this.analyzeByRelativePositioning(recording, context);
            if (relativeResult.weekNumber) {
                this.updateStats(relativeResult.method);
                
                return {
                    weekNumber: relativeResult.weekNumber,
                    confidence: relativeResult.confidence / 100,
                    method: relativeResult.method,
                    evidence: relativeResult.evidence
                };
            }

            // Default fallback
            this.stats.sequential++;
            return {
                weekNumber: 1,
                confidence: 0.1,
                method: 'default_fallback',
                evidence: ['No week information found, defaulting to week 1']
            };

        } catch (error) {
            this.stats.errors++;
            logger.error('Error in week inference:', error);
            
            return {
                weekNumber: 1,
                confidence: 0,
                method: 'error_fallback',
                error: error.message
            };
        }
    }

    /**
     * Compatibility wrapper for inferWeek method
     */
    async inferWeek(options) {
        const { timestamp, metadata, recordingName, additionalContext = {} } = options;
        
        // Create recording object from options
        const recording = {
            id: metadata?.uuid || 'unknown',
            topic: metadata?.topic || recordingName || '',
            start_time: timestamp,
            ...metadata
        };
        
        // Create context from additionalContext
        const context = {
            studentName: recordingName,
            coachName: additionalContext.coach,
            programStartDate: additionalContext.programStartDate,
            ...additionalContext
        };
        
        return this.inferWeekNumber(recording, context);
    }

    /**
     * TIER 1: Analyze by recording timestamps
     */
    async analyzeByTimestamp(recording, context) {
        const result = {
            weekNumber: null,
            confidence: 0,
            method: 'timestamp_analysis',
            tier: this.dataTiers.TIER_1_TIMESTAMPS,
            evidence: []
        };

        try {
            if (!recording.start_time) return result;

            const recordingTime = new Date(recording.start_time);
            
            // If we have program start date in context
            if (context.programStartDate) {
                const startDate = new Date(context.programStartDate);
                const weeksSinceStart = Math.floor((recordingTime - startDate) / (1000 * 60 * 60 * 24 * 7));
                
                if (weeksSinceStart >= 0 && weeksSinceStart <= 52) {
                    result.weekNumber = weeksSinceStart + 1;
                    result.confidence = this.confidenceLevels.TIMESTAMP_BASED;
                    result.evidence.push(`Calculated from program start: ${context.programStartDate}`);
                    result.evidence.push(`Weeks since start: ${weeksSinceStart}`);
                }
            }

            // Check cache for historical mappings
            const cacheKey = `week:${context.studentName}:${context.coachName}:${recordingTime.toISOString().split('T')[0]}`;
            const cachedWeek = await this.cache.get(cacheKey);
            
            if (cachedWeek) {
                result.weekNumber = cachedWeek;
                result.confidence = this.confidenceLevels.TIMESTAMP_BASED;
                result.evidence.push('Found in historical week mapping cache');
            }

        } catch (error) {
            result.evidence.push(`Timestamp analysis error: ${error.message}`);
        }

        return result;
    }

    /**
     * TIER 2: Analyze by meeting metadata
     */
    async analyzeByMeetingMetadata(recording, context) {
        const result = {
            weekNumber: null,
            confidence: 0,
            method: 'meeting_metadata',
            tier: this.dataTiers.TIER_2_MEETING_DATA,
            evidence: []
        };

        try {
            const topic = recording.topic || recording.meeting_topic || '';
            if (!topic) return result;

            // Try patterns in priority order
            for (const { regex, pattern, priority } of this.weekPatterns) {
                const match = topic.match(regex);
                if (match) {
                    const weekStr = match[1];
                    const weekNum = parseInt(weekStr);
                    
                    if (weekNum > 0 && weekNum <= 52) {
                        result.weekNumber = weekNum;
                        result.confidence = this.confidenceLevels.MEETING_METADATA - (priority * 5);
                        result.evidence.push(`Extracted from topic: "${topic}"`);
                        result.evidence.push(`Pattern: ${pattern}`);
                        break;
                    }
                }
            }

        } catch (error) {
            result.evidence.push(`Meeting metadata analysis error: ${error.message}`);
        }

        return result;
    }

    /**
     * TIER 3: Analyze by folder name
     */
    async analyzeByFolderName(recording, context) {
        const result = {
            weekNumber: null,
            confidence: 0,
            method: 'folder_name',
            tier: this.dataTiers.TIER_3_FOLDER_NAMES,
            evidence: []
        };

        try {
            const folderName = recording.folder_name || recording.file_path || '';
            if (!folderName) return result;

            // Folder-specific patterns
            const folderPatterns = [
                { regex: /_Wk(\d+)_/, pattern: '_WkX_' },
                { regex: /_Week(\d+)_/, pattern: '_WeekX_' },
                { regex: /_W(\d+)_/, pattern: '_WX_' },
                { regex: /Wk(\d+)/, pattern: 'WkX' },
                { regex: /Week(\d+)/, pattern: 'WeekX' }
            ];

            for (const { regex, pattern } of folderPatterns) {
                const match = folderName.match(regex);
                if (match) {
                    const weekNum = parseInt(match[1]);
                    if (weekNum > 0 && weekNum <= 52) {
                        result.weekNumber = weekNum;
                        result.confidence = this.confidenceLevels.FOLDER_NAME;
                        result.evidence.push(`Extracted from folder: "${folderName}"`);
                        result.evidence.push(`Pattern: ${pattern}`);
                        break;
                    }
                }
            }

        } catch (error) {
            result.evidence.push(`Folder name analysis error: ${error.message}`);
        }

        return result;
    }

    /**
     * TIER 5: Pattern matching fallback
     */
    async analyzeByPatternMatching(recording, context) {
        const result = {
            weekNumber: null,
            confidence: 0,
            method: 'pattern_matching',
            tier: this.dataTiers.TIER_5_PATTERNS,
            evidence: []
        };

        try {
            const allText = [
                recording.topic,
                recording.description,
                recording.folder_name
            ].filter(Boolean).join(' ');

            // Enhanced pattern matching with priority order
            for (const pattern of this.weekPatterns) {
                const match = allText.match(pattern.regex);
                if (match) {
                    // Exclude if 'program' follows the match (e.g., '12 week program')
                    const afterMatch = allText.slice(match.index + match[0].length).trim();
                    if (/^program\b/i.test(afterMatch)) {
                        result.evidence.push(`Excluded pattern due to 'program' context: ${pattern.pattern} (${match[0]})`);
                        continue;
                    }
                    // Skip explicit exclusion patterns
                    if (pattern.exclude) {
                        result.evidence.push(`Excluded pattern: ${pattern.pattern} (${match[0]})`);
                        continue;
                    }
                    
                    // Handle combined patterns with multiple capture groups (e.g., "Week X | Session Y")
                    let weekNum = null;
                    if (match.length > 2) {
                        // Multiple capture groups - week and session are synonymous
                        const weekMatch = parseInt(match[1]);
                        const sessionMatch = parseInt(match[2]);
                        
                        // Use the first valid number (they should be the same anyway)
                        if (weekMatch > 0 && weekMatch <= 52) {
                            weekNum = weekMatch;
                            result.evidence.push(`Using week/session number ${weekNum} from combined pattern`);
                        } else if (sessionMatch > 0 && sessionMatch <= 52) {
                            weekNum = sessionMatch;
                            result.evidence.push(`Using session/week number ${weekNum} from combined pattern`);
                        }
                    } else {
                        // Single capture group
                        weekNum = parseInt(match[1]);
                    }
                    
                    if (weekNum && weekNum > 0 && weekNum <= 52) {
                        result.weekNumber = weekNum;
                        result.confidence = this.confidenceLevels.PATTERN_MATCHING + (6 - pattern.priority) * 5; // Higher priority = higher confidence
                        result.evidence.push(`Pattern match: ${pattern.pattern} (${match[0]})`);
                        result.evidence.push(`Priority: ${pattern.priority}`);
                        break;
                    }
                }
            }

            // Fallback to low priority patterns if no high-priority match found
            if (!result.weekNumber) {
                const lowPriorityPatterns = [
                    { regex: /(\d+)\s*week\s*program/i, exclude: true }, // Exclude program duration
                    { regex: /(\d+)\s*week(?!\s*program)/i, pattern: 'X week' },
                    { regex: /(\d+)-week(?!\s*program)/i, pattern: 'X-week' }
                ];

                for (const { regex, pattern, exclude } of lowPriorityPatterns) {
                    const match = allText.match(regex);
                    if (match && !exclude) {
                        // Exclude if 'program' follows the match
                        const afterMatch = allText.slice(match.index + match[0].length).trim();
                        if (/^program\b/i.test(afterMatch)) {
                            result.evidence.push(`Excluded fallback pattern due to 'program' context: ${pattern} (${match[0]})`);
                            continue;
                        }
                        const num = parseInt(match[1]);
                        if (num > 0 && num <= 52) {
                            result.weekNumber = num;
                            result.confidence = this.confidenceLevels.PATTERN_MATCHING;
                            result.evidence.push(`Fallback pattern match: ${pattern}`);
                            break;
                        }
                    }
                }
            }

        } catch (error) {
            result.evidence.push(`Pattern matching error: ${error.message}`);
        }

        return result;
    }

    /**
     * Analyze by relative positioning
     */
    async analyzeByRelativePositioning(recording, context) {
        const result = {
            weekNumber: null,
            confidence: 0,
            method: 'relative_positioning',
            evidence: []
        };

        try {
            if (!context.studentName || !context.coachName) return result;

            // Get all recordings for this student-coach pair
            const allRecordings = await this.recordingRepository.findByStudentAndCoach(
                context.studentName,
                context.coachName
            );

            if (!allRecordings || allRecordings.length < 2) return result;

            // Sort by date
            const sorted = allRecordings.sort((a, b) => 
                new Date(a.start_time) - new Date(b.start_time)
            );

            // Find current recording position
            const currentIndex = sorted.findIndex(r => r.id === recording.id);
            if (currentIndex === -1) return result;

            // Find anchors (recordings with known weeks)
            const anchors = sorted
                .map((r, idx) => ({ recording: r, index: idx }))
                .filter(item => item.recording.weekNumber && item.recording.weekNumber > 0);

            if (anchors.length > 0) {
                const inference = this.interpolateFromAnchors(currentIndex, anchors);
                if (inference) {
                    result.weekNumber = inference.week;
                    result.confidence = inference.confidence;
                    result.method = inference.method;
                    result.evidence = inference.evidence;
                }
            } else {
                // Sequential assignment
                result.weekNumber = currentIndex + 1;
                result.confidence = this.confidenceLevels.SEQUENTIAL;
                result.method = 'sequential';
                result.evidence.push(`Sequential position: ${currentIndex + 1} of ${sorted.length}`);
            }

        } catch (error) {
            result.evidence.push(`Relative positioning error: ${error.message}`);
        }

        return result;
    }

    /**
     * Interpolate week from known anchor points
     */
    interpolateFromAnchors(position, anchors) {
        const before = anchors.filter(a => a.index < position).slice(-1)[0];
        const after = anchors.filter(a => a.index > position)[0];

        if (before && after) {
            // Interpolation between two known points
            const weekDiff = after.recording.weekNumber - before.recording.weekNumber;
            const indexDiff = after.index - before.index;
            const relativePos = position - before.index;
            
            const inferredWeek = before.recording.weekNumber + 
                Math.round((weekDiff / indexDiff) * relativePos);

            return {
                week: inferredWeek,
                confidence: this.confidenceLevels.INTERPOLATION,
                method: 'interpolation',
                evidence: [
                    `Interpolated between week ${before.recording.weekNumber} and ${after.recording.weekNumber}`,
                    `Position ${relativePos} of ${indexDiff} sessions`
                ]
            };
        } else if (before) {
            // Extrapolation forward
            const weeksSince = position - before.index;
            const inferredWeek = before.recording.weekNumber + weeksSince;

            return {
                week: inferredWeek,
                confidence: this.confidenceLevels.EXTRAPOLATION,
                method: 'extrapolation_forward',
                evidence: [
                    `Extrapolated from week ${before.recording.weekNumber}`,
                    `${weeksSince} sessions later`
                ]
            };
        } else if (after) {
            // Extrapolation backward
            const weeksBefore = after.index - position;
            const inferredWeek = Math.max(1, after.recording.weekNumber - weeksBefore);

            return {
                week: inferredWeek,
                confidence: this.confidenceLevels.EXTRAPOLATION,
                method: 'extrapolation_backward',
                evidence: [
                    `Extrapolated from week ${after.recording.weekNumber}`,
                    `${weeksBefore} sessions before`
                ]
            };
        }

        return null;
    }

    /**
     * Update statistics
     */
    updateStats(method) {
        switch (method) {
            case 'timestamp_analysis':
                this.stats.timestampBased++;
                break;
            case 'meeting_metadata':
                this.stats.meetingMetadataBased++;
                break;
            case 'folder_name':
                this.stats.folderNameBased++;
                break;
            case 'pattern_matching':
                this.stats.patternBased++;
                break;
            case 'interpolation':
                this.stats.interpolated++;
                break;
            case 'extrapolation_forward':
            case 'extrapolation_backward':
                this.stats.extrapolated++;
                break;
            case 'sequential':
                this.stats.sequential++;
                break;
        }
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalProcessed > 0 
                ? ((this.stats.totalProcessed - this.stats.errors) / this.stats.totalProcessed * 100).toFixed(1)
                : 0,
            methodBreakdown: {
                timestamp: this.stats.timestampBased,
                metadata: this.stats.meetingMetadataBased,
                folderName: this.stats.folderNameBased,
                pattern: this.stats.patternBased,
                interpolated: this.stats.interpolated,
                extrapolated: this.stats.extrapolated,
                sequential: this.stats.sequential
            }
        };
    }
}

module.exports = { SmartWeekInferencer }; 