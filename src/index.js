const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const config = require('./shared/config');
const logger = require('./shared/logging/logger');
const { errorHandler } = require('./shared/errors');
const { createContainer } = require('./infrastructure/container');
const { createRoutes } = require('./api/routes');
const { setupGracefulShutdown } = require('./shared/utils/shutdown');

/**
 * Application class
 */
class Application {
    constructor() {
        this.app = express();
        this.container = null;
        this.server = null;
        this.logger = logger.child('Application');
    }

    /**
     * Initialize application
     */
    async initialize() {
        try {
            this.logger.info('Initializing application...');
            
            // Validate configuration
            config.validate();
            
            // Create dependency injection container
            this.container = await createContainer();
            
            // Setup middleware
            this.setupMiddleware();
            
            // Setup routes
            this.setupRoutes();
            
            // Setup error handling
            this.setupErrorHandling();
            
            this.logger.info('Application initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize application', error);
            throw error;
        }
    }

    /**
     * Setup Express middleware
     */
    setupMiddleware() {
        // Security
        this.app.use(helmet());
        
        // Compression
        this.app.use(compression());
        
        // CORS
        this.app.use(cors({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
            credentials: true
        }));
        
        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        
        // Trust proxy
        if (config.server.trustProxy) {
            this.app.set('trust proxy', true);
        }
        
        // Request logging
        this.app.use((req, res, next) => {
            const start = Date.now();
            
            res.on('finish', () => {
                const duration = Date.now() - start;
                this.logger.logRequest(req, res, duration);
            });
            
            next();
        });
        
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                version: process.env.npm_package_version || '1.0.0',
                environment: config.env
            });
        });
    }

    /**
     * Setup routes
     */
    setupRoutes() {
        const routes = createRoutes(this.container);
        this.app.use('/api', routes);
    }

    /**
     * Setup error handling
     */
    setupErrorHandling() {
        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                error: {
                    message: 'Resource not found',
                    code: 'NOT_FOUND'
                }
            });
        });
        
        // Error handler
        this.app.use(errorHandler(this.logger));
    }

    /**
     * Start the server
     */
    async start() {
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(config.server.port, config.server.host, (err) => {
                if (err) {
                    this.logger.error('Failed to start server', err);
                    reject(err);
                } else {
                    this.logger.info('Server started', {
                        host: config.server.host,
                        port: config.server.port,
                        environment: config.env
                    });
                    resolve();
                }
            });
        });
    }

    /**
     * Stop the server
     */
    async stop() {
        this.logger.info('Stopping server...');
        
        if (this.server) {
            await new Promise((resolve) => {
                this.server.close(resolve);
            });
        }
        
        // Cleanup container resources
        if (this.container) {
            await this.container.dispose();
        }
        
        this.logger.info('Server stopped');
    }
}

/**
 * Main entry point
 */
async function main() {
    const app = new Application();
    
    try {
        // Initialize application
        await app.initialize();
        
        // Start server
        await app.start();
        
        // Setup graceful shutdown
        setupGracefulShutdown(async () => {
            await app.stop();
        });
        
    } catch (error) {
        logger.error('Failed to start application', error);
        process.exit(1);
    }
}

// Run if this is the main module
if (require.main === module) {
    main();
}

module.exports = { Application }; 