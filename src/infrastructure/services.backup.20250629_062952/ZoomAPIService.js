require('dotenv').config();

class ZoomAPIService {
    constructor({ logger = console, config = {} } = {}) {
        this.logger = logger;
        this.config = config;
        
        // Zoom OAuth Configuration (Server-to-Server)
        this.zoomClientId = process.env.ZOOM_CLIENT_ID || config?.zoom?.clientId;
        this.zoomClientSecret = process.env.ZOOM_CLIENT_SECRET || config?.zoom?.clientSecret;
        this.zoomAccountId = process.env.ZOOM_ACCOUNT_ID || config?.zoom?.accountId;
        this.zoomBaseUrl = 'https://api.zoom.us/v2';
        this.zoomTokenUrl = 'https://zoom.us/oauth/token';
        
        this.isConfigured = !!(this.zoomClientId && this.zoomClientSecret && this.zoomAccountId);
        this.accessToken = null;
        this.tokenExpiry = null;
        
        this.logger.info(`📡 Zoom API Service initialized (OAuth Server-to-Server):`);
        this.logger.info(`  Client ID: ${this.zoomClientId ? '✅ Available' : '❌ Not available'}`);
        this.logger.info(`  Client Secret: ${this.zoomClientSecret ? '✅ Available' : '❌ Not available'}`);
        this.logger.info(`  Account ID: ${this.zoomAccountId ? '✅ Available' : '❌ Not available'}`);
        
        if (!this.isConfigured) {
            this.logger.warn('⚠️ Zoom OAuth not configured. Set ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, and ZOOM_ACCOUNT_ID in local.env');
        }
    }

    /**
     * Get OAuth access token for server-to-server authentication
     */
    async getAccessToken() {
        if (!this.isConfigured) {
            throw new Error('Zoom OAuth credentials not configured');
        }

        // Check if we have a valid token
        if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }

        const axios = require('axios');
        
        try {
            this.logger.debug('🔄 Getting new Zoom OAuth access token...');
            
            const response = await axios.post(this.zoomTokenUrl, 
                'grant_type=account_credentials&account_id=' + this.zoomAccountId,
                {
                    headers: {
                        'Authorization': 'Basic ' + Buffer.from(this.zoomClientId + ':' + this.zoomClientSecret).toString('base64'),
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            this.accessToken = response.data.access_token;
            // Set expiry to 50 minutes (tokens typically last 1 hour, refresh 10 minutes early)
            this.tokenExpiry = Date.now() + (50 * 60 * 1000);
            
            this.logger.debug('✅ Zoom OAuth access token obtained');
            return this.accessToken;
            
        } catch (error) {
            this.logger.error(`❌ Failed to get Zoom OAuth token: ${error.response?.data?.message || error.message}`);
            throw error;
        }
    }

    /**
     * Make authenticated request to Zoom API using OAuth
     */
    async makeZoomRequest(endpoint, method = 'GET', data = null) {
        if (!this.isConfigured) {
            throw new Error('Zoom OAuth not configured');
        }

        const axios = require('axios');
        const token = await this.getAccessToken();
        
        const config = {
            method,
            url: `${this.zoomBaseUrl}${endpoint}`,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };

        if (data) {
            config.data = data;
        }

        try {
            this.logger.debug(`📡 Zoom API Request: ${method} ${endpoint}`);
            const response = await axios(config);
            return response.data;
        } catch (error) {
            this.logger.error(`❌ Zoom API Error: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
            
            // If token expired, try to refresh and retry once
            if (error.response?.status === 401 && this.accessToken) {
                this.logger.debug('🔄 Token expired, refreshing and retrying...');
                this.accessToken = null; // Force token refresh
                const newToken = await this.getAccessToken();
                
                config.headers.Authorization = `Bearer ${newToken}`;
                const retryResponse = await axios(config);
                return retryResponse.data;
            }
            
            throw error;
        }
    }

    /**
     * Extract comprehensive meeting data from Zoom API
     */
    async extractMeetingData(meetingId) {
        if (!this.isConfigured) {
            this.logger.warn('⚠️ Zoom OAuth not configured, returning mock data');
            return this.generateMockZoomData(meetingId);
        }

        try {
            this.logger.info(`📡 Extracting Zoom data for meeting: ${meetingId}`);
            
            const [
                meetingDetails,
                recordings,
                participants,
                aiSummary,
                insights,
                analytics
            ] = await Promise.allSettled([
                this.getMeetingDetails(meetingId),
                this.getRecordings(meetingId),
                this.getParticipants(meetingId),
                this.getAISummary(meetingId),
                this.getMeetingInsights(meetingId),
                this.getRecordingAnalytics(meetingId)
            ]);

            const zoomData = {
                meetingDetails: meetingDetails.status === 'fulfilled' ? meetingDetails.value : null,
                recordings: recordings.status === 'fulfilled' ? recordings.value : null,
                participants: participants.status === 'fulfilled' ? participants.value : null,
                aiSummary: aiSummary.status === 'fulfilled' ? aiSummary.value : null,
                insights: insights.status === 'fulfilled' ? insights.value : null,
                analytics: analytics.status === 'fulfilled' ? analytics.value : null,
                metadata: {
                    extracted: true,
                    timestamp: new Date().toISOString(),
                    meetingId: meetingId,
                    authMethod: 'oauth_server_to_server'
                }
            };

            this.logger.info('✅ Zoom data extraction completed');
            return zoomData;

        } catch (error) {
            this.logger.error(`❌ Zoom data extraction failed: ${error.message}`);
            return this.generateMockZoomData(meetingId);
        }
    }

    /**
     * Get basic meeting details
     */
    async getMeetingDetails(meetingId) {
        const data = await this.makeZoomRequest(`/meetings/${meetingId}`);
        
        return {
            id: data.id,
            topic: data.topic,
            start_time: data.start_time,
            duration: data.duration,
            host_email: data.host_email,
            host_name: data.host_name,
            meeting_type: data.type,
            password: data.password,
            settings: data.settings
        };
    }

    /**
     * Get meeting recordings
     */
    async getRecordings(meetingId) {
        const data = await this.makeZoomRequest(`/meetings/${meetingId}/recordings`);
        
        return {
            total_size: data.total_size,
            recording_count: data.recording_count,
            recording_files: data.recording_files?.map(file => ({
                id: file.id,
                meeting_id: file.meeting_id,
                recording_start: file.recording_start,
                recording_end: file.recording_end,
                file_type: file.file_type,
                file_size: file.file_size,
                download_url: file.download_url,
                status: file.status,
                file_extension: file.file_extension
            })) || [],
            share_url: data.share_url,
            password: data.password
        };
    }

    /**
     * Get meeting participants
     */
    async getParticipants(meetingId) {
        const data = await this.makeZoomRequest(`/meetings/${meetingId}/participants`);
        
        return {
            participants: data.participants?.map(p => ({
                name: p.name,
                email: p.user_email,
                join_time: p.join_time,
                leave_time: p.leave_time,
                duration: p.duration,
                participant_id: p.id,
                user_id: p.user_id
            })) || [],
            total_records: data.total_records,
            page_count: data.page_count
        };
    }

    /**
     * Get AI summary (if available)
     */
    async getAISummary(meetingId) {
        try {
            const data = await this.makeZoomRequest(`/meetings/${meetingId}/ai_summary`);
            
            return {
                summary: data.summary,
                key_points: data.key_points || [],
                action_items: data.action_items || [],
                next_steps: data.next_steps || [],
                topics: data.topics || [],
                sentiment: data.sentiment || 'neutral',
                confidence: data.confidence || 0.8
            };
        } catch (error) {
            this.logger.warn(`⚠️ AI summary not available for meeting ${meetingId}: ${error.message}`);
            return null;
        }
    }

    /**
     * Get meeting insights and analytics
     */
    async getMeetingInsights(meetingId) {
        try {
            const data = await this.makeZoomRequest(`/meetings/${meetingId}/insights`);
            
            return {
                engagement_score: data.engagement_score || 0.8,
                participation_rate: data.participation_rate || 0.9,
                speaking_time_distribution: data.speaking_time_distribution || {},
                interaction_patterns: {
                    questions_asked: data.interaction_patterns?.questions_asked || 0,
                    responses_given: data.interaction_patterns?.responses_given || 0,
                    interruptions: data.interaction_patterns?.interruptions || 0
                },
                highlights: data.highlights || [],
                key_moments: data.key_moments || []
            };
        } catch (error) {
            this.logger.warn(`⚠️ Meeting insights not available for meeting ${meetingId}: ${error.message}`);
            return null;
        }
    }

    /**
     * Get recording analytics
     */
    async getRecordingAnalytics(meetingId) {
        try {
            const data = await this.makeZoomRequest(`/meetings/${meetingId}/recording_analytics`);
            
            return {
                view_count: data.view_count || 0,
                download_count: data.download_count || 0,
                share_count: data.share_count || 0,
                engagement_metrics: {
                    average_watch_time: data.engagement_metrics?.average_watch_time || 0,
                    completion_rate: data.engagement_metrics?.completion_rate || 0,
                    replay_count: data.engagement_metrics?.replay_count || 0
                }
            };
        } catch (error) {
            this.logger.warn(`⚠️ Recording analytics not available for meeting ${meetingId}: ${error.message}`);
            return null;
        }
    }

    /**
     * Generate mock Zoom data for testing when API is not configured
     */
    generateMockZoomData(meetingId) {
        this.logger.info('🔄 Generating mock Zoom data for testing');
        
        return {
            meetingDetails: {
                id: meetingId,
                topic: "Coaching Session - Time Management",
                start_time: "2025-01-27T10:00:00Z",
                duration: 45,
                host_email: "coach@example.com",
                host_name: "Sarah Johnson",
                meeting_type: 2,
                settings: {
                    host_video: true,
                    participant_video: true,
                    join_before_host: false
                }
            },
            recordings: {
                total_size: 157286400,
                recording_count: 1,
                recording_files: [
                    {
                        id: "recording_file_id",
                        meeting_id: meetingId,
                        recording_start: "2025-01-27T10:00:00Z",
                        recording_end: "2025-01-27T10:45:00Z",
                        file_type: "MP4",
                        file_size: 157286400,
                        download_url: "https://zoom.us/rec/download/...",
                        status: "completed"
                    }
                ],
                share_url: "https://zoom.us/rec/share/..."
            },
            participants: {
                participants: [
                    {
                        name: "Sarah Johnson",
                        email: "coach@example.com",
                        join_time: "2025-01-27T10:00:00Z",
                        leave_time: "2025-01-27T10:45:00Z",
                        duration: 45,
                        participant_id: "participant_1"
                    },
                    {
                        name: "Alex Chen",
                        email: "student@example.com",
                        join_time: "2025-01-27T10:00:00Z",
                        leave_time: "2025-01-27T10:45:00Z",
                        duration: 45,
                        participant_id: "participant_2"
                    }
                ],
                total_records: 2
            },
            aiSummary: {
                summary: "Coaching session focused on time management strategies. Student identified key challenges and developed actionable plan with three daily priorities.",
                key_points: [
                    "Time management challenges identified",
                    "Three-priority system developed",
                    "Action plan created with specific strategies"
                ],
                action_items: [
                    "Block 2 hours daily for project proposal",
                    "Turn off notifications during focus time",
                    "Inform team about focus blocks"
                ],
                next_steps: [
                    "Implement new time management system",
                    "Track progress for one week",
                    "Schedule follow-up session"
                ],
                topics: [
                    "Time Management",
                    "Goal Setting",
                    "Productivity Strategies"
                ],
                sentiment: "positive",
                confidence: 0.85
            },
            insights: {
                engagement_score: 0.85,
                participation_rate: 0.9,
                speaking_time_distribution: {
                    "Sarah Johnson": 0.6,
                    "Alex Chen": 0.4
                },
                interaction_patterns: {
                    questions_asked: 15,
                    responses_given: 20,
                    interruptions: 2
                },
                highlights: [
                    {
                        timestamp: "00:15:30",
                        description: "Breakthrough moment - student realizes three-priority system",
                        importance: "high",
                        participants: ["coach", "student"]
                    }
                ],
                key_moments: [
                    {
                        time: "00:10:00",
                        event: "Goal setting discussion",
                        impact: "medium"
                    },
                    {
                        time: "00:25:00",
                        event: "Action plan development",
                        impact: "high"
                    }
                ]
            },
            analytics: {
                view_count: 3,
                download_count: 1,
                share_count: 0,
                engagement_metrics: {
                    average_watch_time: 42,
                    completion_rate: 0.93,
                    replay_count: 2
                }
            },
            metadata: {
                extracted: true,
                timestamp: new Date().toISOString(),
                meetingId: meetingId,
                isMockData: true,
                authMethod: 'mock'
            }
        };
    }

    /**
     * Extract meeting ID from various formats
     */
    extractMeetingId(input) {
        // Handle different input formats
        if (typeof input === 'string') {
            // Extract from URL
            const urlMatch = input.match(/\/j\/(\d+)/);
            if (urlMatch) return urlMatch[1];
            
            // Extract from meeting ID format
            const idMatch = input.match(/^(\d{9,11})$/);
            if (idMatch) return idMatch[1];
            
            // Try to parse as meeting ID directly
            if (/^\d+$/.test(input)) return input;
        }
        
        return input;
    }
}

module.exports = ZoomAPIService; 