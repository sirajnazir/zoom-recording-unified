const path = require('path');

class DriveOrganizer {
    constructor({ logger, config, googleDriveService, knowledgeBaseService }) {
        this.logger = logger;
        this.config = config;
        this.googleDriveService = googleDriveService;
        this.knowledgeBaseService = knowledgeBaseService;
    }

    /**
     * Organize recording files in Google Drive
     */
    async organizeRecording(recording, processedData) {
        try {
            this.logger.info(`🗂️ Organizing recording in Google Drive: ${recording.topic}`);

            // Determine the appropriate folder structure
            const folderStructure = await this.determineFolderStructure(recording, processedData);
            
            // Create folder hierarchy (with shortcuts instead of duplicates)
            const folders = await this.createFolderHierarchy(folderStructure);
            
            // Use the primary session folder for file uploads
            const primarySessionFolder = folders.primaryPath?.sessionFolder;
            if (!primarySessionFolder) {
                throw new Error('No session folder available for file uploads');
            }
            
            // Upload files if available
            let uploadedFiles = {};
            if (processedData.files) {
                uploadedFiles = await this.uploadRecordingFiles(
                    recording,
                    processedData.files,
                    primarySessionFolder
                );
            }

            // Create and upload insights document
            let insightsDoc = null;
            if (processedData.insights) {
                // DEBUG: Log the AI insights object before creating document
                this.logger.info(`🔍 [AI INSIGHTS DEBUG] Recording: ${recording.id}`);
                this.logger.info(`🔍 [AI INSIGHTS DEBUG] Insights object keys: [${Object.keys(processedData.insights).join(', ')}]`);
                // DO NOT log the full insights object or JSON.stringify(processedData.insights)!
                // This causes numbered array output in logs and is not allowed.
                
                insightsDoc = await this.createInsightsDocument(
                    recording,
                    processedData.insights,
                    primarySessionFolder
                );
            } else {
                this.logger.warn(`⚠️ [AI INSIGHTS DEBUG] No insights object found for recording: ${recording.id}`);
            }

            // Update folder metadata
            await this.updateFolderMetadata(primarySessionFolder, recording, processedData);

            // Prepare result with folder paths
            const result = {
                success: true,
                folders,
                uploadedFiles,
                insightsDoc,
                folderUrl: primarySessionFolder.webViewLink,
                // Add folder paths for reference
                folderPaths: {
                    primary: folders.primaryPath?.sessionFolder?.id,
                    coachShortcut: folders.coachShortcut?.shortcut?.id
                }
            };

            this.logger.info(`📁 Drive: Recording organized successfully with shortcut-based dual access`);
            this.logger.info(`📁 Drive: Primary folder: ${folders.primaryPath?.sessionFolder?.id}`);
            if (folders.coachShortcut) {
                this.logger.info(`📁 Drive: Coach shortcut: ${folders.coachShortcut.shortcut?.id}`);
            }

            return result;

        } catch (error) {
            this.logger.error('Failed to organize recording in Drive:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Determine folder structure based on recording and participants
     */
    async determineFolderStructure(recording, processedData) {
        const structure = {
            root: null,
            program: null,
            participant: null,
            session: null,
            // Add dual access paths
            studentPath: null,
            coachPath: null
        };

        // Determine root folder based on participant type
        const participantType = await this.determineParticipantType(recording, processedData);
        this.logger.info(`📁 Drive: Participant type determined: ${participantType}`);
        
        switch (participantType) {
            case 'student':
                structure.root = this.config.google.drive.studentsFolderId;
                break;
            case 'coach':
                structure.root = this.config.google.drive.coachesFolderId;
                break;
            case 'trivial':
                structure.root = this.config.google.drive.trivialFolderId;
                break;
            default:
                structure.root = this.config.google.drive.miscFolderId;
        }

        // Determine program folder (if applicable)
        if (processedData.metadata?.program) {
            structure.program = this.sanitizeFolderName(processedData.metadata.program);
        }

        // Determine participant folder
        const mainParticipant = await this.determineMainParticipant(recording, processedData);
        if (mainParticipant) {
            structure.participant = this.sanitizeFolderName(mainParticipant);
            this.logger.info(`📁 Drive: Main participant determined: ${mainParticipant}`);
        }

        // Determine session folder name using standardized name if available
        let sessionName;
        if (processedData.nameAnalysis?.standardizedName) {
            // Use the standardized name for the session folder
            sessionName = this.sanitizeFolderName(processedData.nameAnalysis.standardizedName);
            this.logger.info(`📁 Drive: Using standardized name for session folder: ${sessionName}`);
        } else {
            // Fallback to topic-based name
            const sessionDate = new Date(recording.start_time).toISOString().split('T')[0];
            sessionName = `${this.sanitizeFolderName(recording.topic)}_${sessionDate}`;
            this.logger.info(`📁 Drive: Using fallback topic-based name for session folder: ${sessionName}`);
        }
        structure.session = sessionName;

        // Set up dual access paths
        if (processedData.nameAnalysis?.components) {
            const { student, coach } = processedData.nameAnalysis.components;
            
            // Student path: Root → Students → Student → Session
            if (student && student !== 'Unknown' && student !== 'unknown') {
                structure.studentPath = {
                    root: this.config.google.drive.studentsFolderId,
                    participant: this.sanitizeFolderName(student),
                    session: sessionName
                };
            }
            
            // Coach path: Root → Coaches → Coach → Student → Session
            if (coach && coach !== 'Unknown' && coach !== 'unknown' && student && student !== 'Unknown' && student !== 'unknown') {
                structure.coachPath = {
                    root: this.config.google.drive.coachesFolderId,
                    participant: this.sanitizeFolderName(coach),
                    subfolder: this.sanitizeFolderName(student),
                    session: sessionName
                };
            }
        }

        this.logger.info(`📁 Drive: Folder structure determined:`, {
            root: structure.root ? 'configured' : 'not configured',
            program: structure.program || 'none',
            participant: structure.participant || 'none',
            session: structure.session,
            hasStudentPath: !!structure.studentPath,
            hasCoachPath: !!structure.coachPath
        });

        return structure;
    }

    /**
     * Create folder hierarchy in Google Drive
     */
    async createFolderHierarchy(structure) {
        const folders = {};

        // Create only ONE primary folder with the actual files
        let primaryPath = await this.createPrimaryPath(structure);
        folders.primaryPath = primaryPath;

        // Create shortcuts to the primary folder instead of duplicate folders
        if (structure.studentPath && structure.coachPath) {
            this.logger.info(`📁 Drive: Creating shortcuts to primary folder for dual access`);
            
            // Create coach path structure and add shortcut to primary folder
            const coachShortcut = await this.createCoachShortcut(structure.coachPath, primaryPath.sessionFolder);
            folders.coachShortcut = coachShortcut;
        }

        return folders;
    }

    /**
     * Create primary folder path
     */
    async createPrimaryPath(structure) {
        const folders = {};

        // Start with root folder
        let parentId = structure.root;
        this.logger.info(`📁 Drive: Starting primary path creation from root: ${parentId}`);

        // Create program folder if needed
        if (structure.program) {
            this.logger.info(`📁 Drive: Creating program folder: ${structure.program}`);
            const programFolder = await this.googleDriveService.getOrCreateFolder(
                structure.program,
                parentId
            );
            folders.programFolder = programFolder;
            parentId = programFolder.id;
            this.logger.info(`📁 Drive: Program folder created: ${programFolder.id}`);
        }

        // Create participant folder if needed
        if (structure.participant) {
            this.logger.info(`📁 Drive: Creating participant folder: ${structure.participant}`);
            const participantFolder = await this.googleDriveService.getOrCreateFolder(
                structure.participant,
                parentId
            );
            folders.participantFolder = participantFolder;
            parentId = participantFolder.id;
            this.logger.info(`📁 Drive: Participant folder created: ${participantFolder.id}`);
        }

        // Create session folder
        this.logger.info(`📁 Drive: Creating session folder: ${structure.session}`);
        const sessionFolder = await this.googleDriveService.createFolder(
            structure.session,
            parentId
        );
        folders.sessionFolder = sessionFolder;
        this.logger.info(`📁 Drive: Session folder created: ${sessionFolder.id}`);

        return folders;
    }

    /**
     * Upload recording files to Drive
     */
    async uploadRecordingFiles(recording, files, sessionFolder) {
        const uploadedFiles = {};
        const uploadedTypes = new Set();

        // DEBUG: Log all file types and paths being uploaded
        this.logger.info(`[DEBUG] Uploading files for recording: ${recording.id}`);
        Object.entries(files).forEach(([type, filePath]) => {
            this.logger.info(`[DEBUG] File type: ${type}, path: ${filePath}`);
        });

        // Manual upload process - use the session folder from hierarchy
        for (const [type, filePath] of Object.entries(files)) {
            if (!filePath) continue;
            if (uploadedTypes.has(type)) {
                this.logger.warn(`Duplicate upload attempt for file type: ${type} in recording: ${recording.id}`);
                continue;
            }
            uploadedTypes.add(type);

            try {
                const fileName = path.basename(filePath);
                const mimeType = this.getMimeType(fileName);

                const uploadedFile = await this.googleDriveService.uploadFile(filePath, {
                    name: fileName,
                    parents: [sessionFolder.id],
                    mimeType,
                    description: `${type} for ${recording.topic}`
                });

                uploadedFiles[type] = uploadedFile;
                this.logger.info(`File uploaded successfully`, {
                    fileId: uploadedFile.id,
                    fileName: fileName,
                    uploadTime: Date.now(),
                    fileSize: uploadedFile.size || 'unknown'
                });
            } catch (error) {
                this.logger.error(`Failed to upload ${type}:`, error);
            }
        }

        return uploadedFiles;
    }

    /**
     * Create insights document in Google Drive
     */
    async createInsightsDocument(recording, insights, sessionFolder) {
        try {
            const docName = `Insights_${recording.topic}_${new Date(recording.start_time).toISOString().split('T')[0]}`;
            const docContent = this.formatInsightsForDocument(recording, insights);

            // Create a temporary file with the insights
            const tempPath = path.join(process.env.OUTPUT_DIR || './output', `${docName}.md`);
            await require('fs').promises.writeFile(tempPath, docContent);

            // Upload to Drive
            const uploadedDoc = await this.googleDriveService.uploadFile(tempPath, {
                name: `${docName}.md`,
                parents: [sessionFolder.id],
                mimeType: 'text/markdown',
                description: `AI-generated insights for ${recording.topic}`
            });

            // Clean up temp file
            await require('fs').promises.unlink(tempPath);

            return uploadedDoc;
        } catch (error) {
            this.logger.error(`Failed to create insights document: ${error.message}`);
            return null;
        }
    }

    /**
     * Format insights for document
     */
    formatInsightsForDocument(recording, insights) {
        let content = `# Session Insights: ${recording.topic}\n\n`;
        content += `**Date:** ${new Date(recording.start_time).toLocaleDateString()}\n`;
        content += `**Duration:** ${recording.duration} minutes\n\n`;

        // ===== ENHANCED AI INSIGHTS STRUCTURE =====
        
        // AI Summary
        if (insights.aiSummary?.executiveSummary) {
            content += `## Executive Summary\n${insights.aiSummary.executiveSummary}\n\n`;
        } else if (insights.sessionOverview?.summary) {
            content += `## Executive Summary\n${insights.sessionOverview.summary}\n\n`;
        }

        // AI Highlights
        if (insights.aiHighlights?.breakthroughMoments && insights.aiHighlights.breakthroughMoments.length > 0) {
            content += `## Key Breakthrough Moments\n`;
            insights.aiHighlights.breakthroughMoments.forEach(moment => {
                const description = typeof moment === 'string' ? moment : moment.description || moment.moment || JSON.stringify(moment);
                const timestamp = moment.timestamp ? ` (${moment.timestamp})` : '';
                content += `- ${description}${timestamp}\n`;
            });
            content += '\n';
        }

        // AI Topics
        if (insights.aiTopics && insights.aiTopics.length > 0) {
            content += `## Coaching Topics\n`;
            insights.aiTopics.forEach(topic => {
                const topicName = typeof topic === 'string' ? topic : topic.topic || JSON.stringify(topic);
                const timeSpent = topic.timeSpent ? ` (${topic.timeSpent})` : '';
                const importance = topic.importance ? ` [${topic.importance}]` : '';
                content += `- ${topicName}${timeSpent}${importance}\n`;
            });
            content += '\n';
        }

        // AI Action Items
        if (insights.aiActionItems?.highPriority && insights.aiActionItems.highPriority.length > 0) {
            content += `## High Priority Action Items\n`;
            insights.aiActionItems.highPriority.forEach(item => {
                const description = typeof item === 'string' ? item : item.item || item.text || JSON.stringify(item);
                const assignee = item.assignee ? ` (${item.assignee})` : '';
                const deadline = item.deadline ? ` - Due: ${item.deadline}` : '';
                content += `- ${description}${assignee}${deadline}\n`;
            });
            content += '\n';
        }

        if (insights.aiActionItems?.mediumPriority && insights.aiActionItems.mediumPriority.length > 0) {
            content += `## Medium Priority Action Items\n`;
            insights.aiActionItems.mediumPriority.forEach(item => {
                const description = typeof item === 'string' ? item : item.item || item.text || JSON.stringify(item);
                content += `- ${description}\n`;
            });
            content += '\n';
        }

        // AI Coaching Insights
        if (insights.aiCoachingInsights?.effectiveness?.strengths && insights.aiCoachingInsights.effectiveness.strengths.length > 0) {
            content += `## Coaching Strengths\n`;
            insights.aiCoachingInsights.effectiveness.strengths.forEach(strength => {
                content += `- ${strength}\n`;
            });
            content += '\n';
        }

        if (insights.aiCoachingInsights?.effectiveness?.areasForImprovement && insights.aiCoachingInsights.effectiveness.areasForImprovement.length > 0) {
            content += `## Areas for Improvement\n`;
            insights.aiCoachingInsights.effectiveness.areasForImprovement.forEach(area => {
                content += `- ${area}\n`;
            });
            content += '\n';
        }

        // AI Student Progress
        if (insights.aiCoachingInsights?.studentProgress?.visibleGrowth && insights.aiCoachingInsights.studentProgress.visibleGrowth.length > 0) {
            content += `## Student Progress Indicators\n`;
            insights.aiCoachingInsights.studentProgress.visibleGrowth.forEach(indicator => {
                content += `- ${indicator}\n`;
            });
            content += '\n';
        }

        // AI Sentiment & Engagement
        if (insights.aiSentiment?.overall) {
            content += `## Session Sentiment\n`;
            content += `- **Overall:** ${insights.aiSentiment.overall}\n`;
            if (insights.aiSentiment.confidence) {
                content += `- **Confidence:** ${insights.aiSentiment.confidence}\n`;
            }
            content += '\n';
        }

        if (insights.aiEngagement?.overallScore) {
            content += `## Engagement Analysis\n`;
            content += `- **Overall Score:** ${insights.aiEngagement.overallScore}\n`;
            if (insights.aiEngagement.participationRate) {
                content += `- **Participation Rate:** ${insights.aiEngagement.participationRate}\n`;
            }
            content += '\n';
        }

        // ===== TANGIBLE OUTCOMES =====
        if (insights.tangibleOutcomes?.outcomes && insights.tangibleOutcomes.outcomes.length > 0) {
            content += `## Tangible Outcomes\n`;
            insights.tangibleOutcomes.outcomes.forEach((outcome, index) => {
                content += `### ${index + 1}. ${outcome.outcomeType}: ${outcome.outcomeName}\n`;
                content += `- **Category:** ${outcome.outcomeCategory}\n`;
                content += `- **Status:** ${outcome.outcomeStatus}\n`;
                if (outcome.strategy?.effectiveness) {
                    content += `- **Effectiveness:** ${outcome.strategy.effectiveness}\n`;
                }
                if (outcome.results?.impact) {
                    content += `- **Impact:** ${outcome.results.impact}\n`;
                }
                content += '\n';
            });
        }

        if (insights.tangibleOutcomes?.summary) {
            content += `## Outcomes Summary\n`;
            content += `- **Total Outcomes:** ${insights.tangibleOutcomes.summary.totalOutcomes}\n`;
            content += `- **Effectiveness Score:** ${insights.tangibleOutcomes.summary.effectivenessScore}\n`;
            content += `- **Status Breakdown:** ${JSON.stringify(insights.tangibleOutcomes.summary.statusBreakdown)}\n\n`;
        }

        // ===== ZOOM INSIGHTS =====
        if (insights.zoomInsights?.zoomSummary?.executiveSummary) {
            content += `## Zoom AI Summary\n`;
            content += `${insights.zoomInsights.zoomSummary.executiveSummary}\n\n`;
        }

        if (insights.zoomInsights?.zoomHighlights?.keyMoments && insights.zoomInsights.zoomHighlights.keyMoments.length > 0) {
            content += `## Zoom Key Moments\n`;
            insights.zoomInsights.zoomHighlights.keyMoments.forEach(moment => {
                const event = moment.event || moment.description || JSON.stringify(moment);
                const timestamp = moment.timestamp || moment.time || '';
                const impact = moment.impact ? ` [${moment.impact}]` : '';
                content += `- ${event}${timestamp ? ` (${timestamp})` : ''}${impact}\n`;
            });
            content += '\n';
        }

        // ===== COMBINED INSIGHTS =====
        if (insights.combinedInsights?.summary) {
            content += `## Combined Analysis Summary\n`;
            content += `${insights.combinedInsights.summary.executiveSummary}\n\n`;
        }

        if (insights.combinedInsights?.recommendations && insights.combinedInsights.recommendations.length > 0) {
            content += `## AI Recommendations\n`;
            insights.combinedInsights.recommendations.forEach(rec => {
                const recommendation = rec.recommendation || rec || JSON.stringify(rec);
                const type = rec.type ? ` [${rec.type}]` : '';
                const priority = rec.priority ? ` (${rec.priority})` : '';
                content += `- ${recommendation}${type}${priority}\n`;
            });
            content += '\n';
        }

        // ===== ENHANCED AI QUESTIONS =====
        if (insights.aiQuestions?.coachingQuestions && insights.aiQuestions.coachingQuestions.length > 0) {
            content += `## Key Coaching Questions\n`;
            insights.aiQuestions.coachingQuestions.forEach(q => {
                const question = typeof q === 'string' ? q : q.question || JSON.stringify(q);
                const type = q.type ? ` [${q.type}]` : '';
                const effectiveness = q.effectiveness ? ` (${q.effectiveness})` : '';
                content += `- ${question}${type}${effectiveness}\n`;
            });
            content += '\n';
        }

        if (insights.aiQuestions?.studentQuestions && insights.aiQuestions.studentQuestions.length > 0) {
            content += `## Student Questions\n`;
            insights.aiQuestions.studentQuestions.forEach(q => {
                const question = typeof q === 'string' ? q : q.question || JSON.stringify(q);
                const category = q.category ? ` [${q.category}]` : '';
                content += `- ${question}${category}\n`;
            });
            content += '\n';
        }

        // ===== ENHANCED SESSION ANALYSIS =====
        if (insights.aiSessionAnalysis?.sessionStructure?.phases && insights.aiSessionAnalysis.sessionStructure.phases.length > 0) {
            content += `## Session Structure\n`;
            insights.aiSessionAnalysis.sessionStructure.phases.forEach(phase => {
                const name = phase.name || 'Unknown Phase';
                const description = phase.description || phase.details || '';
                content += `### ${name}\n${description}\n\n`;
            });
        }

        // ===== ENHANCED PARTICIPANT INSIGHTS =====
        if (insights.aiParticipantInsights?.studentProgress?.goals && insights.aiParticipantInsights.studentProgress.goals.length > 0) {
            content += `## Student Goals\n`;
            insights.aiParticipantInsights.studentProgress.goals.forEach(goal => {
                const goalText = typeof goal === 'string' ? goal : goal.goal || goal.text || JSON.stringify(goal);
                const status = goal.status ? ` [${goal.status}]` : '';
                content += `- ${goalText}${status}\n`;
            });
            content += '\n';
        }

        // ===== ENHANCED METADATA =====
        if (insights.metadata) {
            content += `## Analysis Metadata\n`;
            content += `- **AI Generated:** ${insights.metadata.aiGenerated ? 'Yes' : 'No'}\n`;
            content += `- **Model:** ${insights.metadata.model}\n`;
            content += `- **Provider:** ${insights.metadata.provider}\n`;
            content += `- **Processing Time:** ${insights.metadata.processingTime}ms\n`;
            if (insights.metadata.outcomesGenerated) {
                content += `- **Outcomes Generated:** Yes\n`;
            }
            if (insights.metadata.zoomGenerated) {
                content += `- **Zoom Insights:** Yes\n`;
            }
            if (insights.metadata.dataSources && insights.metadata.dataSources.length > 0) {
                content += `- **Data Sources:** ${insights.metadata.dataSources.join(', ')}\n`;
            }
            content += '\n';
        }

        // Handle legacy coaching analysis structure
        // NOTE: Commented out to avoid [object Object] placeholders - enhanced structure above provides better content
        /*
        if (insights.coachingAnalysis?.topics && insights.coachingAnalysis.topics.length > 0) {
            content += `## Additional Coaching Topics\n`;
            insights.coachingAnalysis.topics.forEach(topic => {
                const topicText = typeof topic === 'string' ? topic : topic.topic || topic.name || topic.description || JSON.stringify(topic);
                const timeSpent = topic.timeSpent ? ` (${topic.timeSpent})` : '';
                const importance = topic.importance ? ` [${topic.importance}]` : '';
                content += `- ${topicText}${timeSpent}${importance}\n`;
            });
            content += '\n';
        }
        */

        return content;
    }

    /**
     * Update folder metadata
     */
    async updateFolderMetadata(folder, recording, processedData) {
        try {
            // Add description with metadata
            const metadata = {
                recordingId: recording.id,
                meetingId: recording.meeting_id,
                startTime: recording.start_time,
                duration: recording.duration,
                participants: processedData.participants?.map(p => p.name).join(', '),
                program: processedData.metadata?.program,
                week: processedData.metadata?.week
            };

            const description = JSON.stringify(metadata, null, 2);

            // Note: Google Drive API doesn't support updating folder descriptions directly
            // This would need to be implemented as a custom property or in a metadata file
            this.logger.info('Folder metadata prepared (not updated due to API limitations)');
        } catch (error) {
            this.logger.warn(`Failed to update folder metadata: ${error.message}`);
        }
    }

    /**
     * Determine participant type
     */
    async determineParticipantType(recording, processedData) {
        const topic = recording.topic.toLowerCase();
        
        // Check if trivial
        if (topic.includes('test') || topic.includes('trivial') || recording.duration < 5) {
            return 'trivial';
        }

        // Check nameAnalysis first (most reliable)
        if (processedData.nameAnalysis?.components) {
            const { student, coach, sessionType } = processedData.nameAnalysis.components;
            
            // If we have a clear session type, use it
            if (sessionType) {
                if (sessionType.toLowerCase().includes('coaching')) return 'student';
                if (sessionType.toLowerCase().includes('coach')) return 'coach';
            }
            
            // If we have a student identified, it's a student session
            if (student && student !== 'Unknown' && student !== 'unknown') {
                return 'student';
            }
            
            // If we have a coach identified but no student, it's a coach session
            if (coach && coach !== 'Unknown' && coach !== 'unknown') {
                return 'coach';
            }
        }

        // Check participants
        if (processedData.participants) {
            const hasStudent = processedData.participants.some(p => 
                this.knowledgeBaseService?.isStudent(p.name)
            );
            const hasCoach = processedData.participants.some(p => 
                this.knowledgeBaseService?.isCoach(p.name)
            );

            if (hasStudent) return 'student';
            if (hasCoach) return 'coach';
        }

        // Check topic keywords
        if (topic.includes('coach') || topic.includes('mentor')) return 'coach';
        if (topic.includes('student') || topic.includes('ivylevel')) return 'student';

        return 'misc';
    }

    /**
     * Determine main participant
     */
    async determineMainParticipant(recording, processedData) {
        // First, try to get participant from nameAnalysis (most reliable)
        if (processedData.nameAnalysis?.components) {
            const { student, coach } = processedData.nameAnalysis.components;
            
            // Prioritize student over coach
            if (student && student !== 'Unknown' && student !== 'unknown') {
                return student;
            }
            
            if (coach && coach !== 'Unknown' && coach !== 'unknown') {
                return coach;
            }
        }

        // Fallback to participants array
        if (processedData.participants && processedData.participants.length > 0) {
            // Sort by speaking time or importance
            const sorted = [...processedData.participants].sort((a, b) => {
                // Prioritize students
                if (this.knowledgeBaseService?.isStudent(a.name)) return -1;
                if (this.knowledgeBaseService?.isStudent(b.name)) return 1;
                
                // Then by speaking time
                return (b.speakingTime || 0) - (a.speakingTime || 0);
            });

            return sorted[0].name;
        }

        // Fallback to topic parsing
        const topic = recording.topic;
        const match = topic.match(/^(.*?)'s/);
        return match ? match[1] : null;
    }

    /**
     * Sanitize folder name
     */
    sanitizeFolderName(name) {
        if (!name) return 'Unknown';
        return name.replace(/[<>:"/\\|?*]/g, '_').trim();
    }

    /**
     * Get MIME type for file
     */
    getMimeType(fileName) {
        const ext = path.extname(fileName).toLowerCase();
        const mimeTypes = {
            '.mp4': 'video/mp4',
            '.m4a': 'audio/mp4',
            '.txt': 'text/plain',
            '.json': 'application/json',
            '.vtt': 'text/vtt',
            '.md': 'text/markdown',
            '.pdf': 'application/pdf'
        };
        
        return mimeTypes[ext] || 'application/octet-stream';
    }

    /**
     * Create coach shortcut path
     */
    async createCoachShortcut(coachPath, primarySessionFolder) {
        const folders = {};

        let parentId = coachPath.root;
        this.logger.info(`📁 Drive: Creating coach shortcut path from root: ${parentId}`);

        // Create coach folder
        this.logger.info(`📁 Drive: Creating coach folder: ${coachPath.participant}`);
        const coachFolder = await this.googleDriveService.getOrCreateFolder(
            coachPath.participant,
            parentId
        );
        folders.coachFolder = coachFolder;
        parentId = coachFolder.id;

        // Create student subfolder
        this.logger.info(`📁 Drive: Creating student subfolder: ${coachPath.subfolder}`);
        const studentSubfolder = await this.googleDriveService.getOrCreateFolder(
            coachPath.subfolder,
            parentId
        );
        folders.studentSubfolder = studentSubfolder;
        parentId = studentSubfolder.id;

        // Create a shortcut to the primary session folder instead of a duplicate folder
        this.logger.info(`📁 Drive: Creating shortcut to primary session folder: ${coachPath.session}`);
        const shortcut = await this.createGoogleDriveShortcut(
            primarySessionFolder.id,
            parentId,
            coachPath.session
        );
        folders.shortcut = shortcut;

        return folders;
    }

    /**
     * Create an actual Google Drive shortcut
     */
    async createGoogleDriveShortcut(targetFolderId, parentFolderId, shortcutName) {
        try {
            this.logger.info(`📁 Drive: Creating Google Drive shortcut: ${shortcutName} -> ${targetFolderId}`);
            
            // Check if GoogleDriveService has createShortcut method
            if (this.googleDriveService.createShortcut) {
                const shortcut = await this.googleDriveService.createShortcut(
                    targetFolderId,
                    parentFolderId,
                    shortcutName
                );
                
                this.logger.info(`📁 Drive: Google Drive shortcut created: ${shortcut.id}`);
                return shortcut;
            } else {
                this.logger.warn(`📁 Drive: GoogleDriveService doesn't have createShortcut method, using fallback`);
                return await this.createShortcutFile(parentFolderId, targetFolderId, shortcutName);
            }
        } catch (error) {
            this.logger.warn(`📁 Drive: Failed to create Google Drive shortcut, falling back to file shortcut:`, error.message);
            
            // Fallback: create a markdown file with the folder link
            return await this.createShortcutFile(parentFolderId, targetFolderId, shortcutName);
        }
    }

    /**
     * Create a shortcut file as fallback
     */
    async createShortcutFile(parentFolderId, targetFolderId, shortcutName) {
        try {
            const shortcutContent = `# ${shortcutName}\n\nThis is a shortcut to the main recording folder.\n\n**Main Folder ID:** ${targetFolderId}\n\n**Direct Link:** https://drive.google.com/drive/folders/${targetFolderId}\n\n---\n*This shortcut was created because Google Drive API shortcut creation failed.*`;
            
            // Create a temporary file
            const tempPath = require('path').join(process.env.OUTPUT_DIR || './output', `${shortcutName}_shortcut.md`);
            await require('fs').promises.writeFile(tempPath, shortcutContent);

            // Upload as a shortcut file
            const uploadedFile = await this.googleDriveService.uploadFile(tempPath, {
                name: `${shortcutName}.md`,
                parents: [parentFolderId],
                mimeType: 'text/markdown',
                description: `Shortcut to ${shortcutName}`
            });

            // Clean up temp file
            await require('fs').promises.unlink(tempPath);

            this.logger.info(`📁 Drive: Created fallback shortcut file: ${shortcutName}.md`);
            return uploadedFile;
        } catch (error) {
            this.logger.warn(`📁 Drive: Failed to create fallback shortcut file:`, error.message);
            return null;
        }
    }
}

module.exports = DriveOrganizer; 