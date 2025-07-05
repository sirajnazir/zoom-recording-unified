const OpenAI = require('openai');
const { AIServiceError } = require('../../shared/errors');

class OpenAIService {
    constructor(dependencies = {}) {
        // Handle both destructured and config object patterns
        if (dependencies.config) {
            // If config object is passed
            this.config = dependencies.config.openai || dependencies.config;
            this.apiKey = this.config.apiKey;
            this.model = this.config.model || 'gpt-4-turbo-preview';
            this.maxTokens = this.config.maxTokens || 4000;
            this.temperature = this.config.temperature || 0.7;
        } else {
            // If individual properties are passed
            this.apiKey = dependencies.apiKey;
            this.model = dependencies.model || 'gpt-4-turbo-preview';
            this.maxTokens = dependencies.maxTokens || 4000;
            this.temperature = dependencies.temperature || 0.7;
        }
        
        this.logger = dependencies.logger || console;
        this.eventBus = dependencies.eventBus || { emit: () => {} };
        this.metricsCollector = dependencies.metricsCollector || { 
            increment: () => {}, 
            histogram: () => {} 
        };
        
        this.openai = null;
        this.isInitialized = false;
    }

    async initialize() {
        try {
            if (!this.apiKey) {
                throw new Error('OpenAI API key is required');
            }

            this.openai = new OpenAI({
                apiKey: this.apiKey,
            });
            
            // Test the connection
            await this.testConnection();
            
            this.isInitialized = true;
            this.logger.info('OpenAI service initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize OpenAI service', { error: error.message });
            throw new AIServiceError('Failed to initialize OpenAI service', error);
        }
    }

    async testConnection() {
        try {
            const response = await this.openai.models.list();
            this.logger.info(`OpenAI connection test successful: modelsAvailable=${response.data.length}`);
            return true;
        } catch (error) {
            throw new AIServiceError('Failed to connect to OpenAI', error);
        }
    }

    async generateTranscription(audioFilePath) {
        if (!this.isInitialized) await this.initialize();
        
        const startTime = Date.now();
        
        try {
            const response = await this.openai.audio.transcriptions.create({
                file: fs.createReadStream(audioFilePath),
                model: 'whisper-1',
                language: 'en'
            });

            const duration = Date.now() - startTime;
            
            this.metricsCollector.histogram('openai.transcription.duration', duration);
            this.metricsCollector.increment('openai.transcription.success');
            
            this.logger.info(`Transcription generated successfully: audioFile=${audioFilePath}, duration=${duration}, transcriptionLength=${response.text.length}`);

            return response.text;
        } catch (error) {
            this.metricsCollector.increment('openai.transcription.error');
            this.logger.error(`Failed to generate transcription: audioFile=${audioFilePath}, error=${error.message}`);
            throw new AIServiceError('Failed to generate transcription', error);
        }
    }

    async generateInsights(transcript, metadata = {}) {
        if (!this.isInitialized) await this.initialize();
        
        const startTime = Date.now();
        
        const systemPrompt = `You are an AI assistant analyzing a Zoom recording transcript. 
        Extract key insights, action items, important topics discussed, and create a concise summary.
        Format your response as JSON with the following structure:
        {
            "summary": "Brief summary of the meeting",
            "keyTopics": ["topic1", "topic2"],
            "actionItems": ["action1", "action2"],
            "decisions": ["decision1", "decision2"],
            "nextSteps": ["step1", "step2"],
            "participants": ["participant1", "participant2"]
        }`;

        const userPrompt = `Analyze this transcript and extract insights:
        
        Meeting Topic: ${metadata.topic || 'Unknown'}
        Date: ${metadata.date || 'Unknown'}
        Duration: ${metadata.duration || 'Unknown'} minutes
        
        Transcript:
        ${transcript}`;

        try {
            const response = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: this.maxTokens,
                temperature: this.temperature,
                response_format: { type: "json_object" }
            });

            const insights = JSON.parse(response.choices[0].message.content);
            const duration = Date.now() - startTime;
            
            this.metricsCollector.histogram('openai.insights.duration', duration);
            this.metricsCollector.increment('openai.insights.success');
            
            this.logger.info(`Insights generated successfully: meetingTopic=${metadata.topic}, duration=${duration}, keyTopics=${insights.keyTopics?.length || 0}, actionItems=${insights.actionItems?.length || 0}`);

            this.eventBus.emit('insights.generated', {
                recordingId: metadata.recordingId,
                insights
            });

            return insights;
        } catch (error) {
            this.metricsCollector.increment('openai.insights.error');
            this.logger.error(`Failed to generate insights: error=${error.message}, metadata=${JSON.stringify(metadata)}`);
            throw new AIServiceError('Failed to generate insights', error);
        }
    }

    async generateSummary(text, maxLength = 500) {
        if (!this.isInitialized) await this.initialize();
        
        try {
            const response = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: 'Create a concise summary of the provided text.'
                    },
                    {
                        role: 'user',
                        content: `Summarize this in ${maxLength} characters or less:\n\n${text}`
                    }
                ],
                max_tokens: Math.min(this.maxTokens, maxLength),
                temperature: 0.5
            });

            return response.choices[0].message.content.trim();
        } catch (error) {
            this.logger.error(`Failed to generate summary: ${error.message}`);
            throw new AIServiceError('Failed to generate summary', error);
        }
    }

    async extractActionItems(transcript) {
        if (!this.isInitialized) await this.initialize();
        
        try {
            const response = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: 'Extract action items from the meeting transcript. Return as a JSON array of strings.'
                    },
                    {
                        role: 'user',
                        content: transcript
                    }
                ],
                max_tokens: 1000,
                temperature: 0.3,
                response_format: { type: "json_object" }
            });

            const result = JSON.parse(response.choices[0].message.content);
            return result.actionItems || [];
        } catch (error) {
            this.logger.error(`Failed to extract action items: ${error.message}`);
            throw new AIServiceError('Failed to extract action items', error);
        }
    }

    async getHealthStatus() {
        if (!this.isInitialized) {
            return { healthy: false, message: 'Not initialized' };
        }
        
        try {
            await this.openai.models.list();
            return { healthy: true, message: 'Connected to OpenAI API' };
        } catch (error) {
            return { 
                healthy: false, 
                message: `OpenAI API error: ${error.message}` 
            };
        }
    }

    async getUsage() {
        // Note: OpenAI doesn't provide a direct usage API in the client library
        // You would need to track this separately or use the OpenAI dashboard
        return {
            message: 'Usage tracking not implemented. Check OpenAI dashboard for usage details.'
        };
    }
}

module.exports = { OpenAIService }; 