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
            this.logger.info(`🔍 [DEBUG] processedData keys: ${Object.keys(processedData).join(', ')}`);
            this.logger.info(`🔍 [DEBUG] processedData.insights exists: ${!!processedData.insights}`);
            if (processedData.insights) {
                this.logger.info(`🔍 [DEBUG] processedData.insights keys: ${Object.keys(processedData.insights).join(', ')}`);
            }

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
                // Check if this is a Drive import (use shortcuts instead of uploads)
                if (processedData.isDriveImport) {
                    uploadedFiles = await this.createRecordingShortcuts(
                        recording,
                        processedData.files,
                        primarySessionFolder
                    );
                } else {
                    uploadedFiles = await this.uploadRecordingFiles(
                        recording,
                        processedData.files,
                        primarySessionFolder
                    );
                }
            }

            // Create and upload insights document
            let insightsDoc = null;
            if (processedData.insights) {
                // DEBUG: Log the AI insights object before creating document
                this.logger.info(`🔍 [AI INSIGHTS DEBUG] Recording: ${recording.id}`);
                this.logger.info(`🔍 [AI INSIGHTS DEBUG] Insights object keys: [${Object.keys(processedData.insights).join(', ')}]`);
                // Removed large object logging to prevent numbered array output
                
                insightsDoc = await this.createInsightsDocument(
                    recording,
                    processedData.insights,
                    primarySessionFolder
                );
            } else {
                this.logger.warn(`⚠️ [AI INSIGHTS DEBUG] No insights object found for recording: ${recording.id}`);
                this.logger.info(`🔍 [AI INSIGHTS DEBUG] processedData keys: ${Object.keys(processedData).join(', ')}`);
            }

            // Update folder metadata - disabled as updateFolderMetadata doesn't exist in GoogleDriveService
            // await this.updateFolderMetadata(primarySessionFolder, recording, processedData);

            // Prepare result with folder paths
            const result = {
                success: true,
                folders,
                uploadedFiles,
                insightsDoc,
                folderUrl: primarySessionFolder.webViewLink,
                folderId: primarySessionFolder.id,
                folderLink: primarySessionFolder.webViewLink,
                fileIds: uploadedFiles,
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

        // Use category from processedData if available, otherwise determine it
        const category = processedData.category || recording._category || 
                        await this.determineParticipantType(recording, processedData);
        
        this.logger.info(`📁 Drive: Using category: ${category}`);
        
        switch (category) {
            case 'TRIVIAL':
                structure.root = this.config.google.drive.trivialFolderId;
                break;
            case 'MISC':
                structure.root = this.config.google.drive.miscFolderId;
                break;
            case 'Coaching':
            case 'GamePlan':
            case 'Coaching_GamePlan':
                // Determine if student or coach folder based on participants
                const participantType = await this.determineParticipantType(recording, processedData);
                if (participantType === 'student') {
                    structure.root = this.config.google.drive.studentsFolderId;
                } else if (participantType === 'coach') {
                    structure.root = this.config.google.drive.coachesFolderId;
                } else {
                    structure.root = this.config.google.drive.miscFolderId;
                }
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

        // Set up dual access paths for Coaching and GamePlan sessions
        if ((category === 'Coaching' || category === 'GamePlan' || category === 'Coaching_GamePlan') && 
            processedData.nameAnalysis?.components) {
            const { student, coach } = processedData.nameAnalysis.components;
            
            // Student path: Root → Students → Student → Session
            if (student && student !== 'Unknown' && student !== 'unknown' && student !== 'Duan') {
                // Ensure we use first name only for consistent folder naming
                const studentFirstName = student.split(' ')[0];
                structure.studentPath = {
                    root: this.config.google.drive.studentsFolderId,
                    participant: this.sanitizeFolderName(studentFirstName),
                    session: sessionName
                };
            }
            
            // Coach path: Root → Coaches → Coach → Student → Session
            if (coach && coach !== 'Unknown' && coach !== 'unknown' && 
                student && student !== 'Unknown' && student !== 'unknown' && student !== 'Duan') {
                // Ensure we use first names only for consistent folder naming
                const coachFirstName = coach.split(' ')[0];
                const studentFirstName = student.split(' ')[0];
                structure.coachPath = {
                    root: this.config.google.drive.coachesFolderId,
                    participant: this.sanitizeFolderName(coachFirstName),
                    subfolder: this.sanitizeFolderName(studentFirstName),
                    session: sessionName
                };
            }
        }

        this.logger.info(`📁 Drive: Folder structure determined: category=${category}, root=${structure.root ? 'configured' : 'not configured'}, program=${structure.program || 'none'}, participant=${structure.participant || 'none'}, session=${structure.session}, hasStudentPath=${!!structure.studentPath}, hasCoachPath=${!!structure.coachPath}`);

        return structure;
    }

    /**
     * Determine participant type (student, coach, or misc)
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
     * Create folder hierarchy in Google Drive
     */
    async createFolderHierarchy(structure) {
        this.logger.info(`📁 Drive: ===== STARTING FOLDER HIERARCHY CREATION =====`);
        this.logger.info(`📁 Drive: Structure has studentPath: ${!!structure.studentPath}`);
        this.logger.info(`📁 Drive: Structure has coachPath: ${!!structure.coachPath}`);
        
        const folders = {};

        // Create only ONE primary folder with the actual files
        this.logger.info(`📁 Drive: Creating primary path...`);
        let primaryPath = await this.createPrimaryPath(structure);
        folders.primaryPath = primaryPath;
        this.logger.info(`📁 Drive: Primary path created with session folder: ${primaryPath.sessionFolder?.id}`);

        // Create shortcuts to the primary folder instead of duplicate folders
        if (structure.studentPath && structure.coachPath) {
            this.logger.info(`📁 Drive: Both studentPath and coachPath exist - creating shortcuts for dual access`);
                    this.logger.info(`📁 Drive: Student path: ${JSON.stringify(structure.studentPath)}`);
        this.logger.info(`📁 Drive: Coach path: ${JSON.stringify(structure.coachPath)}`);
            
            // Create coach path structure and add shortcut to primary folder
            this.logger.info(`📁 Drive: Calling createCoachShortcut...`);
            const coachShortcut = await this.createCoachShortcut(structure.coachPath, primaryPath.sessionFolder);
            folders.coachShortcut = coachShortcut;
            this.logger.info(`📁 Drive: Coach shortcut creation completed`);
        } else {
            this.logger.info(`📁 Drive: Skipping shortcut creation - missing studentPath or coachPath`);
            this.logger.info(`📁 Drive: studentPath: ${structure.studentPath ? 'exists' : 'missing'}`);
            this.logger.info(`📁 Drive: coachPath: ${structure.coachPath ? 'exists' : 'missing'}`);
        }

        this.logger.info(`📁 Drive: ===== FOLDER HIERARCHY CREATION COMPLETED =====`);
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

        // Get the standardized folder name to use as base for file names
        const folderName = sessionFolder.name;
        this.logger.info(`[DEBUG] Using folder name as base for file naming: ${folderName}`);

        // Manual upload process - use the session folder from hierarchy
        for (const [type, filePath] of Object.entries(files)) {
            if (!filePath) continue;
            if (uploadedTypes.has(type)) {
                this.logger.warn(`Duplicate upload attempt for file type: ${type} in recording: ${recording.id}`);
                continue;
            }
            uploadedTypes.add(type);

            try {
                // Generate standardized file name based on folder name and file type
                const standardizedFileName = this.generateStandardizedFileName(folderName, type);
                const mimeType = this.getMimeType(standardizedFileName);

                this.logger.info(`[DEBUG] Uploading ${type} with standardized name: ${standardizedFileName}`);

                const uploadedFile = await this.googleDriveService.uploadFile(filePath, {
                    name: standardizedFileName,
                    parents: [sessionFolder.id],
                    mimeType,
                    description: `${type} for ${recording.topic}`
                });

                uploadedFiles[type] = uploadedFile;
                this.logger.info(`File uploaded successfully: fileId=${uploadedFile.id}, fileName=${standardizedFileName}, uploadTime=${Date.now()}, fileSize=${uploadedFile.size || 'unknown'}`);
            } catch (error) {
                this.logger.error(`Failed to upload ${type}: ${error.message}`);
            }
        }

        return uploadedFiles;
    }

    /**
     * Generate standardized file name based on folder name and file type
     */
    generateStandardizedFileName(folderName, fileType) {
        const fileTypeSuffixes = {
            video: 'mp4',
            galleryVideo: 'gallery.mp4',
            audio: 'm4a',
            transcript: 'vtt',
            timeline: 'json',
            chat: 'txt',
            insights: 'md',
            outcomes: 'json',
            summary: 'txt',
            highlights: 'json',
            actionItems: 'json',
            coachingNotes: 'json',
            // Add more known types
            text: 'txt',
            metadata: 'json',
            other: 'txt'
        };

        const suffix = fileTypeSuffixes[fileType] || 'txt';
        if (fileType === 'galleryVideo') {
            return `${folderName}_${suffix}`;
        }
        return `${folderName}.${suffix}`;
    }

    /**
     * Create insights document in Google Drive
     */
    async createInsightsDocument(recording, insights, sessionFolder) {
        try {
            // Use the standardized folder name for the insights document
            const folderName = sessionFolder.name;
            const docName = `${folderName}.md`;
            const docContent = this.formatInsightsForDocument(recording, insights);

            this.logger.info(`[DEBUG] Creating insights document with standardized name: ${docName}`);

            // Create a temporary file with the insights
            const tempPath = path.join(process.env.OUTPUT_DIR || './output', docName);
            await require('fs').promises.writeFile(tempPath, docContent);

            // Upload to Drive
            const uploadedDoc = await this.googleDriveService.uploadFile(tempPath, {
                name: docName,
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
        content += `**Duration:** ${Math.round((recording.duration || 0) / 60)} minutes\n\n`;

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
        }

        return content;
    }

    /**
     * Update folder metadata
     */
    async updateFolderMetadata(folder, recording, processedData) {
        try {
            const metadata = {
                recordingId: recording.id,
                topic: recording.topic,
                startTime: recording.start_time,
                duration: recording.duration,
                category: processedData.category,
                week: processedData.metadata?.week,
                participants: processedData.participants?.map(p => p.name).join(', '),
                aiInsights: processedData.aiInsights ? 'Generated' : 'None',
                outcomes: processedData.outcomes?.length || 0
            };

            await this.googleDriveService.updateFolderMetadata(folder.id, metadata);
            this.logger.info(`📁 Drive: Updated folder metadata for ${folder.id}`);
        } catch (error) {
            this.logger.warn(`📁 Drive: Failed to update folder metadata: ${error.message}`);
        }
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
        this.logger.info(`📁 Drive: ===== STARTING COACH SHORTCUT CREATION =====`);
        this.logger.info(`📁 Drive: Coach path structure: root=${coachPath.root}, participant=${coachPath.participant}, subfolder=${coachPath.subfolder}, session=${coachPath.session}`);
        this.logger.info(`📁 Drive: Primary session folder: id=${primarySessionFolder.id}, name=${primarySessionFolder.name}`);
        
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
        this.logger.info(`📁 Drive: Coach folder created/found: ${coachFolder.id}`);

        // Create student subfolder
        this.logger.info(`📁 Drive: Creating student subfolder: ${coachPath.subfolder}`);
        const studentSubfolder = await this.googleDriveService.getOrCreateFolder(
            coachPath.subfolder,
            parentId
        );
        folders.studentSubfolder = studentSubfolder;
        parentId = studentSubfolder.id;
        this.logger.info(`📁 Drive: Student subfolder created/found: ${studentSubfolder.id}`);

        // Create a shortcut to the primary session folder instead of a duplicate folder
        this.logger.info(`📁 Drive: Creating shortcut to primary session folder: ${coachPath.session}`);
        this.logger.info(`📁 Drive: Shortcut parameters: targetFolderId=${primarySessionFolder.id}, parentFolderId=${parentId}, shortcutName=${coachPath.session}`);
        
        const shortcut = await this.createGoogleDriveShortcut(
            primarySessionFolder.id,
            parentId,
            coachPath.session
        );
        folders.shortcut = shortcut;
        
        this.logger.info(`📁 Drive: ===== COACH SHORTCUT CREATION COMPLETED =====`);
        this.logger.info(`📁 Drive: Final folder structure: coachFolder=${folders.coachFolder?.id}, studentSubfolder=${folders.studentSubfolder?.id}, shortcut=${folders.shortcut?.id}`);

        return folders;
    }

    /**
     * Create an actual Google Drive shortcut
     */
    async createGoogleDriveShortcut(targetFolderId, parentFolderId, shortcutName) {
        try {
            this.logger.info(`📁 Drive: Creating Google Drive shortcut: ${shortcutName} -> ${targetFolderId}`);
            this.logger.info(`📁 Drive: Parent folder ID: ${parentFolderId}`);
            
            // Check if GoogleDriveService has createShortcut method
            if (this.googleDriveService.createShortcut) {
                this.logger.info(`📁 Drive: GoogleDriveService.createShortcut method found, attempting to create shortcut`);
                
                const shortcut = await this.googleDriveService.createShortcut(
                    targetFolderId,
                    parentFolderId,
                    shortcutName
                );
                
                this.logger.info(`📁 Drive: Google Drive shortcut created successfully: ${shortcut.id}`);
                this.logger.info(`📁 Drive: Shortcut details: id=${shortcut.id}, name=${shortcut.name}, webViewLink=${shortcut.webViewLink}, targetId=${shortcut.shortcutDetails?.targetId}`);
                return shortcut;
            } else {
                this.logger.warn(`📁 Drive: GoogleDriveService doesn't have createShortcut method, using fallback`);
                return await this.createShortcutFile(parentFolderId, targetFolderId, shortcutName);
            }
        } catch (error) {
            this.logger.error(`📁 Drive: Failed to create Google Drive shortcut: ${error.message}`);
            this.logger.error(`📁 Drive: Error details: message=${error.message}, targetFolderId=${targetFolderId}, parentFolderId=${parentFolderId}, shortcutName=${shortcutName}`);
            
            // Fallback: create a markdown file with the folder link
            this.logger.info(`📁 Drive: Falling back to file shortcut creation`);
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

            // Clean up temporary file
            await require('fs').promises.unlink(tempPath);

            this.logger.info(`📁 Drive: Created shortcut file: ${uploadedFile.id}`);
            return uploadedFile;
        } catch (error) {
            this.logger.error(`📁 Drive: Failed to create shortcut file: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create shortcuts for Drive import files instead of uploading
     */
    async createRecordingShortcuts(recording, files, sessionFolder) {
        const uploadedFiles = {};
        const uploadedTypes = new Set();

        this.logger.info(`[DEBUG] Creating shortcuts for Drive import recording: ${recording.id}`);
        
        // Get the standardized folder name to use as base for file names
        const folderName = sessionFolder.name;
        this.logger.info(`[DEBUG] Using folder name as base for file naming: ${folderName}`);

        // Create shortcuts for each file type
        for (const [type, fileId] of Object.entries(files)) {
            if (!fileId || typeof fileId !== 'string') continue;
            if (uploadedTypes.has(type)) {
                this.logger.warn(`Duplicate shortcut attempt for file type: ${type} in recording: ${recording.id}`);
                continue;
            }
            uploadedTypes.add(type);

            try {
                // Find the original file info
                let originalFileName;
                if (recording.recording_files) {
                    const originalFile = recording.recording_files.find(f => 
                        f.file_type && f.file_type.toLowerCase().includes(type.toLowerCase())
                    );
                    originalFileName = originalFile?.file_name;
                }
                
                // If we can't find the original name, try to get it from session files
                if (!originalFileName && recording._sessionFiles) {
                    const sessionFile = recording._sessionFiles.find(f => f.id === fileId);
                    originalFileName = sessionFile?.name;
                }
                
                // Generate standardized file name
                let standardizedFileName;
                if (type.startsWith('file_')) {
                    // For unknown/other files, preserve original name with folder prefix
                    if (originalFileName) {
                        // Extract just the extension and any meaningful suffix
                        const lastDot = originalFileName.lastIndexOf('.');
                        const ext = lastDot > -1 ? originalFileName.substring(lastDot) : '';
                        
                        // Check if there's a meaningful suffix before the extension
                        const baseName = lastDot > -1 ? originalFileName.substring(0, lastDot) : originalFileName;
                        const lowerBase = baseName.toLowerCase();
                        
                        // Preserve meaningful suffixes like 'newChat', 'transcript', etc.
                        if (lowerBase.includes('chat') || lowerBase.includes('transcript') || 
                            lowerBase.includes('caption') || lowerBase.includes('note')) {
                            // Extract the suffix part after GMT timestamp if present
                            const gmtMatch = baseName.match(/GMT\d{8}-\d{6}_(.*)/i);
                            if (gmtMatch && gmtMatch[1]) {
                                standardizedFileName = `${folderName}_${gmtMatch[1]}${ext}`;
                            } else {
                                // Use original name if it has meaningful content
                                standardizedFileName = originalFileName;
                            }
                        } else {
                            standardizedFileName = `${folderName}${ext}`;
                        }
                    } else {
                        standardizedFileName = `${folderName}_${type.replace('file_', '')}`;
                    }
                } else {
                    standardizedFileName = this.generateStandardizedFileName(folderName, type);
                }

                this.logger.info(`[DEBUG] Creating shortcut for ${type}:`);
                this.logger.info(`   Original: ${originalFileName || 'unknown'} -> Standardized: ${standardizedFileName}`);
                
                try {
                    // Create a shortcut to the original file
                    const shortcut = await this.googleDriveService.createShortcut(
                        fileId,
                        sessionFolder.id,
                        standardizedFileName
                    );
                    
                    uploadedFiles[type] = {
                        id: shortcut.id,
                        name: standardizedFileName,
                        webViewLink: shortcut.webViewLink,
                        originalName: originalFileName
                    };
                    
                    this.logger.info(`✅ Shortcut created successfully: ${standardizedFileName}`);
                } catch (shortcutError) {
                    this.logger.error(`❌ Shortcut creation failed for ${type}: ${shortcutError.message}`);
                    this.logger.error(`   Context: fileId=${fileId}, standardizedName=${standardizedFileName}`);
                    // Continue without shortcut for this file
                }
            } catch (error) {
                this.logger.error(`Failed to process file ${type}: ${error.message}`);
                this.logger.error(`   Context: fileId=${fileId}, type=${type}`);
            }
        }

        // Log shortcut creation summary
        const successCount = Object.keys(uploadedFiles).length;
        const totalCount = Object.keys(files).length;
        this.logger.info(`📊 Shortcut creation summary: ${successCount}/${totalCount} successful`);
        if (successCount < totalCount) {
            this.logger.warn(`   Failed types: ${Object.keys(files).filter(k => !uploadedFiles[k]).join(', ')}`);
        }
        
        return uploadedFiles;
    }

    /**
     * Get file extension based on type
     */
    getFileExtension(type) {
        const extensions = {
            video: 'mp4',
            galleryVideo: 'mp4',
            audio: 'm4a',
            transcript: 'vtt',
            chat: 'txt',
            metadata: 'json',
            text: 'txt',
            json: 'json'
        };
        return extensions[type] || 'bin';
    }
}

module.exports = DriveOrganizer;
