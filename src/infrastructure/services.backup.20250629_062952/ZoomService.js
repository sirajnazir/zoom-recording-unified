/**
 * Zoom Service
 * 
 * Handles all Zoom API interactions including authentication,
 * webhook validation, recording downloads, and participant data.
 */

const crypto = require('crypto');
const axios = require('axios');
const { Readable } = require('stream');

class ZoomService {
    constructor({ config, logger }) {
        this.config = config;
        this.logger = logger;
        this.ZOOM_API_URL = 'https://api.zoom.us/v2';
        this.accessToken = null;
        this.tokenExpiry = null;
        
        this.logger.info('ZoomService initialized');
    }

    /**
     * Validate Zoom webhook signature
     */
    validateWebhook(req, res, next) {
        this.logger.info('Webhook request received:', {
            event: req.body?.event,
            headers: {
                'x-zm-signature': req.headers['x-zm-signature'],
                'x-zm-request-timestamp': req.headers['x-zm-request-timestamp']
            }
        });
        
        // Handle Zoom validation request BEFORE any signature checking
        if (req.body && req.body.event === 'endpoint.url_validation') {
            this.logger.info('Processing validation request for token:', req.body.payload?.plainToken);
            
            const secretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
            if (!secretToken) {
                this.logger.error('ZOOM_WEBHOOK_SECRET_TOKEN environment variable not set!');
                return res.status(500).json({ error: 'Server configuration error' });
            }
            
            const plainToken = req.body.payload.plainToken;
            const encryptedToken = crypto
                .createHmac('sha256', secretToken)
                .update(plainToken)
                .digest('hex');
                
            const response = {
                plainToken: plainToken,
                encryptedToken: encryptedToken
            };
            
            this.logger.info('Sending validation response');
            return res.status(200).json(response);
        }
        
        // For other events, validate the webhook signature
        if (!req.headers['x-zm-signature']) {
            this.logger.error('No signature header found');
            return res.status(401).send('Unauthorized');
        }
        
        const message = `v0:${req.headers['x-zm-request-timestamp']}:${JSON.stringify(req.body)}`;
        const hashForVerify = crypto
            .createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN)
            .update(message)
            .digest('hex');
        
        const signature = `v0=${hashForVerify}`;
        
        if (req.headers['x-zm-signature'] !== signature) {
            this.logger.error('Invalid webhook signature');
            return res.status(401).send('Unauthorized');
        }
        
        // Signature valid, proceed
        next();
    }

    /**
     * Get Zoom access token with caching
     */
    async getZoomToken(forceRefresh = false) {
        // Return existing token if still valid (unless force refresh)
        if (!forceRefresh && this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }
        
        try {
            const response = await axios.post('https://zoom.us/oauth/token', null, {
                params: {
                    grant_type: 'account_credentials',
                    account_id: process.env.ZOOM_ACCOUNT_ID
                },
                headers: {
                    'Authorization': `Basic ${Buffer.from(
                        `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
                    ).toString('base64')}`
                }
            });
            
            this.accessToken = response.data.access_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
            
            this.logger.info('New Zoom access token obtained');
            return this.accessToken;
            
        } catch (error) {
            this.logger.error('Error getting Zoom token:', error);
            throw error;
        }
    }

    /**
     * Get Zoom client with authentication
     */
    async getZoomClient() {
        const token = await this.getZoomToken();
        return axios.create({
            baseURL: this.ZOOM_API_URL,
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
    }

    /**
     * Get all recordings using the proven comprehensive strategy
     * This implements the same logic as the successful script
     */
    async getAllRecordings(from, to) {
        try {
            this.logger.info('🚀 Starting comprehensive recording fetch using proven methods...');
            
            const RECORDINGS = new Map();
            
            // 1. Get by date range (Account-level)
            this.logger.info('🎯 METHOD 1: Daily search across the account...');
            const dates = this.generateDateRange(from, to);
            this.logger.info(`  Searching ${dates.length} days...`);
            let foundInDateRange = 0;
            
            for (let i = 0; i < dates.length; i++) {
                const date = dates[i];
                if (i % 10 === 0) this.logger.info(`  Processing date ${i + 1}/${dates.length}: ${date}`);
                const dayRecordings = await this.getRecordingsByDate(date);
                dayRecordings.forEach(r => {
                    const key = `${r.topic}_${r.start_time}`;
                    if (!RECORDINGS.has(key)) {
                        RECORDINGS.set(key, r);
                        foundInDateRange++;
                    }
                });
            }
            this.logProgress('Date Range Search', foundInDateRange, RECORDINGS.size);

            // 2. Get by user
            this.logger.info('🎯 METHOD 2: Searching recordings for each user...');
            const users = await this.getAllUsers();
            let foundByUser = 0;
            
            for (let i = 0; i < users.length; i++) {
                const user = users[i];
                this.logger.info(`  Processing user ${i + 1}/${users.length}: ${user.email}`);
                const userRecordings = await this.getUserRecordings(user.id, from, to);
                userRecordings.forEach(r => {
                    const key = `${r.topic}_${r.start_time}`;
                    if (!RECORDINGS.has(key)) {
                        r.host_email = user.email; // Add host email for context
                        RECORDINGS.set(key, r);
                        foundByUser++;
                    }
                });
            }
            this.logProgress('User-based Search', foundByUser, RECORDINGS.size);

            // 3. Get by specific recurring meeting IDs
            this.logger.info('🎯 METHOD 3: Searching specific recurring Meeting IDs...');
            const meetingIds = [
                '491979388', // Aditi's Personal Meeting Room
                '662343975', // Ivylevel's Personal Meeting Room
                '324252713', // Noor's meetings
                '466611574', // Rishi's Personal Meeting Room
                '847983509', // Juli's meeting room
                '828959640', // Rishi's Zoom Meeting
                '580225485'  // Jenny's room
            ];
            let foundByMeetingId = 0;
            
            for (const id of meetingIds) {
                this.logger.info(`  Checking meeting ID: ${id}`);
                const instances = await this.getMeetingInstances(id);
                for (const instance of instances) {
                    const recording = await this.getRecordingByUUID(instance.uuid);
                    if (recording) {
                        const key = `${recording.topic}_${recording.start_time}`;
                        if (!RECORDINGS.has(key)) {
                            RECORDINGS.set(key, recording);
                            foundByMeetingId++;
                        }
                    }
                }
            }
            this.logProgress('Meeting ID Search', foundByMeetingId, RECORDINGS.size);

            const finalRecordings = Array.from(RECORDINGS.values());
            this.logger.info(`✅ FINAL RESULT: ${finalRecordings.length} unique recordings found.`);
            
            return finalRecordings;
            
        } catch (error) {
            this.logger.error('Error getting all recordings:', error);
            throw error;
        }
    }

    /**
     * Get recordings with options (for the processor)
     */
    async getRecordings(options = {}) {
        const { from, to, limit = 50 } = options;
        
        if (!from || !to) {
            throw new Error('from and to dates are required');
        }
        
        const allRecordings = await this.getAllRecordings(from, to);
        
        // Sort by start_time descending to get the most recent ones
        const sortedRecordings = allRecordings.sort((a, b) => 
            new Date(b.start_time) - new Date(a.start_time)
        );
        
        // Return only the requested limit
        return sortedRecordings.slice(0, limit);
    }

    /**
     * Get a single recording by ID
     */
    async getRecording(recordingId) {
        try {
            const token = await this.getZoomToken();
            const response = await axios.get(`${this.ZOOM_API_URL}/meetings/${recordingId}/recordings`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            return response.data;
        } catch (error) {
            this.logger.error(`Error getting recording ${recordingId}:`, error);
            throw error;
        }
    }

    // Helper methods for the comprehensive recording fetch
    generateDateRange(startDateStr, endDateStr) {
        const dates = [];
        const currentDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        
        while (currentDate <= endDate) {
            dates.push(currentDate.toISOString().split('T')[0]);
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return dates;
    }

    logProgress(method, foundCount, totalSoFar) {
        this.logger.info(`  > ${method}: Found ${foundCount} new recordings. Total unique: ${totalSoFar}`);
    }

    async makeRequest(url, params = {}) {
        try {
            const token = await this.getZoomToken();
            const response = await axios.get(url, { 
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }, 
                params,
                timeout: 10000 // 10 second timeout
            });
            return response.data;
        } catch (error) {
            if (error.response?.status !== 404) {
                this.logger.error(`  Error fetching ${url}: ${error.response?.status || error.message}`);
            }
            return null;
        }
    }

    async getAllUsers() {
        this.logger.info('  Fetching users...');
        const data = await this.makeRequest(`${this.ZOOM_API_URL}/users`, { status: 'active', page_size: 300 });
        const users = data?.users || [];
        this.logger.info(`  Found ${users.length} users`);
        return users;
    }

    async getRecordingsByDate(date) {
        const data = await this.makeRequest(`${this.ZOOM_API_URL}/accounts/me/recordings`, {
            from: date,
            to: date,
            page_size: 300
        });
        return data?.meetings || [];
    }

    async getUserRecordings(userId, from, to) {
        const data = await this.makeRequest(`${this.ZOOM_API_URL}/users/${userId}/recordings`, {
            from: from,
            to: to,
            page_size: 300
        });
        return data?.meetings || [];
    }

    async getMeetingInstances(meetingId) {
        const data = await this.makeRequest(`${this.ZOOM_API_URL}/past_meetings/${meetingId}/instances`);
        return data?.meetings || [];
    }

    async getRecordingByUUID(uuid) {
        if (!uuid) return null;
        const encodedUuid = encodeURIComponent(encodeURIComponent(uuid));
        
        // Try the primary recordings endpoint first
        let recording = await this.makeRequest(`${this.ZOOM_API_URL}/meetings/${encodedUuid}/recordings`);
        
        // Fallback to the past_meetings endpoint if the first one fails
        if (!recording) {
            recording = await this.makeRequest(`${this.ZOOM_API_URL}/past_meetings/${encodedUuid}/recordings`);
        }
        
        return recording;
    }

    /**
     * Download a file from Zoom with improved error handling and size tracking
     */
    async downloadFile(url, downloadToken = null, fileType = 'unknown', passcode = null) {
        try {
            this.logger.info(`Downloading ${fileType} file...`);
            
            // Build the download URL with token if needed
            let finalUrl = url;
            
            // Check if this is a webhook download URL but force API method instead
            if (url.includes('/webhook_download/')) {
                this.logger.info('Webhook URL detected, but using API download for cross-account access');
                // Convert webhook URL to API URL
                // webhook_download URLs need to be accessed with Bearer token for cross-account access
                // Don't add passcode, use Bearer token authentication instead
            }
            
            // Always use Bearer token for authentication (works across accounts)
            this.logger.info('Using bearer token for download');
            
            const downloadOptions = {
                method: 'GET',
                url: finalUrl,
                responseType: 'stream',
                timeout: 60000, // 60 second timeout
                maxRedirects: 5,
                headers: {
                    'User-Agent': 'Zoom-Webhook-Handler/2.0',
                    'Accept': '*/*'
                }
            };
            
            // Always add Authorization header with Bearer token
            const token = await this.getZoomToken();
            downloadOptions.headers['Authorization'] = `Bearer ${token}`;
            
            const response = await axios(downloadOptions);
            
            // Check content type
            const contentType = response.headers['content-type'] || '';
            this.logger.info(`Response content-type for ${fileType}:`, contentType);
            
            // For timeline files, check if we got HTML instead of JSON
            if (fileType === 'timeline' && contentType.includes('text/html')) {
                this.logger.error('Timeline download returned HTML - authentication failed');
                
                // Read a bit of the response to see what went wrong
                const chunks = [];
                let chunkCount = 0;
                
                return new Promise((resolve) => {
                    response.data.on('data', (chunk) => {
                        chunks.push(chunk);
                        chunkCount++;
                        if (chunkCount >= 5) {
                            response.data.destroy(); // Stop reading
                            const preview = Buffer.concat(chunks).toString('utf8').substring(0, 200);
                            this.logger.error('HTML response preview:', preview);
                            resolve(null);
                        }
                    });
                    
                    response.data.on('end', () => {
                        const preview = Buffer.concat(chunks).toString('utf8').substring(0, 200);
                        this.logger.error('HTML response preview:', preview);
                        resolve(null);
                    });
                    
                    response.data.on('error', () => {
                        resolve(null);
                    });
                });
            }
            
            // For JSON files (timeline), validate it's actually JSON
            if (fileType === 'timeline' || contentType.includes('json')) {
                const chunks = [];
                let size = 0;
                
                return new Promise((resolve, reject) => {
                    response.data.on('data', (chunk) => {
                        chunks.push(chunk);
                        size += chunk.length;
                    });
                    
                    response.data.on('end', () => {
                        const buffer = Buffer.concat(chunks);
                        const content = buffer.toString('utf8');
                        
                        try {
                            // Check if it's HTML
                            if (content.trim().startsWith('<!') || content.trim().startsWith('<html')) {
                                this.logger.error('File content is HTML, not JSON');
                                resolve(null);
                                return;
                            }
                            
                            // Validate JSON
                            JSON.parse(content);
                            this.logger.info(`Valid JSON ${fileType} downloaded, size: ${size} bytes`);
                            
                            // Create a reusable stream from the buffer
                            const stream = new Readable({
                                read() {
                                    this.push(buffer);
                                    this.push(null);
                                }
                            });
                            
                            // Add size and buffer info
                            stream.fileSize = size;
                            stream.buffer = buffer;
                            
                            resolve(stream);
                        } catch (error) {
                            this.logger.error(`Invalid JSON in ${fileType}:`, error.message);
                            this.logger.info('Content preview:', content.substring(0, 100));
                            resolve(null);
                        }
                    });
                    
                    response.data.on('error', reject);
                });
            }
            
            // For binary files (video, audio, transcript), collect data to track size
            const chunks = [];
            let downloadedSize = 0;
            
            return new Promise((resolve, reject) => {
                response.data.on('data', (chunk) => {
                    chunks.push(chunk);
                    downloadedSize += chunk.length;
                });
                
                response.data.on('end', () => {
                    this.logger.info(`${fileType} download complete: ${downloadedSize} bytes`);
                    const buffer = Buffer.concat(chunks);
                    
                    // Create a reusable stream
                    const stream = new Readable({
                        read() {
                            this.push(buffer);
                            this.push(null);
                        }
                    });
                    
                    stream.fileSize = downloadedSize;
                    stream.buffer = buffer;
                    
                    resolve(stream);
                });
                
                response.data.on('error', (error) => {
                    this.logger.error(`Stream error for ${fileType}:`, error);
                    reject(error);
                });
            });
            
        } catch (error) {
            this.logger.error(`Error downloading ${fileType}:`, error.message);
            if (error.response) {
                this.logger.error('Response status:', error.response.status);
                this.logger.error('Response headers:', error.response.headers);
            }
            throw error;
        }
    }

    /**
     * Get meeting participants with fixed implementation
     */
    async getMeetingParticipants(meetingUuid) {
        try {
            const token = await this.getZoomToken();
            
            // IMPORTANT: Double URL encode the UUID for Zoom API
            // Zoom requires double encoding for UUIDs with special characters
            const encodedUuid = encodeURIComponent(encodeURIComponent(meetingUuid));
            
            this.logger.info('Fetching participants for UUID:', meetingUuid);
            this.logger.info('Encoded UUID:', encodedUuid);
            
            try {
                // Try past_meetings endpoint first (for completed meetings)
                const response = await axios.get(
                    `${this.ZOOM_API_URL}/past_meetings/${encodedUuid}/participants`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        },
                        params: {
                            page_size: 300,
                            page_number: 1
                        }
                    }
                );
                
                if (response.data && response.data.participants) {
                    this.logger.info(`Found ${response.data.participants.length} participants from past_meetings API`);
                    return response.data.participants || [];
                }
            } catch (error) {
                if (error.response?.status === 404) {
                    this.logger.info('Meeting not found in past_meetings, trying meetings endpoint...');
                    
                    // Try meetings endpoint without '/participants' first to check if meeting exists
                    try {
                        const meetingCheck = await axios.get(
                            `${this.ZOOM_API_URL}/meetings/${encodedUuid}`,
                            {
                                headers: {
                                    'Authorization': `Bearer ${token}`
                                }
                            }
                        );
                        this.logger.info('Meeting found:', meetingCheck.data.id);
                        
                        // Now try to get participants
                        const response = await axios.get(
                            `${this.ZOOM_API_URL}/meetings/${encodedUuid}/participants`,
                            {
                                headers: {
                                    'Authorization': `Bearer ${token}`
                                }
                            }
                        );
                        
                        if (response.data && response.data.participants) {
                            this.logger.info(`Found ${response.data.participants.length} participants from meetings API`);
                            return response.data.participants || [];
                        }
                    } catch (altError) {
                        this.logger.error('Meetings endpoint also failed:', altError.response?.data || altError.message);
                    }
                } else if (error.response?.status === 401) {
                    this.logger.error('Authentication error - token might be expired');
                    // Try to refresh token
                    await this.getZoomToken(true); // Force refresh
                    // Don't retry here, let the caller handle retry
                } else {
                    this.logger.error('API Error:', error.response?.data || error.message);
                }
            }
            
            // If all else fails, return empty array
            this.logger.info('No participants found for meeting');
            return [];
            
        } catch (error) {
            this.logger.error('Error getting meeting participants:', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            return [];
        }
    }

    /**
     * Get all users in the account
     */
    async getAllZoomUsers() {
        const token = await this.getZoomToken();
        const users = [];
        let pageToken = '';
        
        do {
            const response = await axios.get(`${this.ZOOM_API_URL}/users`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                params: {
                    page_size: 300,
                    page_token: pageToken
                }
            });
            
            users.push(...response.data.users);
            pageToken = response.data.next_page_token || '';
        } while (pageToken);
        
        return users;
    }

    /**
     * Get recording details by meeting ID
     */
    async getRecordingDetails(meetingId) {
        try {
            const token = await this.getZoomToken();
            const response = await axios.get(`${this.ZOOM_API_URL}/meetings/${meetingId}/recordings`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            return response.data;
        } catch (error) {
            this.logger.error('Error getting recording details:', error);
            throw error;
        }
    }

    /**
     * Get meeting details
     */
    async getMeetingDetails(meetingId) {
        try {
            const token = await this.getZoomToken();
            const response = await axios.get(`${this.ZOOM_API_URL}/meetings/${meetingId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            return response.data;
        } catch (error) {
            this.logger.error('Error getting meeting details:', error);
            throw error;
        }
    }

    /**
     * Dispose of resources
     */
    async dispose() {
        this.accessToken = null;
        this.tokenExpiry = null;
        this.logger.info('ZoomService disposed');
    }
}

module.exports = { ZoomService }; 