const winston = require('winston');
const path = require('path');

/**
 * Enhanced logger with structured logging and context support
 */
class Logger {
    constructor() {
        this.winston = this._createWinstonLogger();
        this.contextStack = [];
    }

    _createWinstonLogger() {
        const { combine, timestamp, errors, json, colorize, printf } = winston.format;

        // Custom format for development
        const devFormat = printf(({ level, message, timestamp, context, ...metadata }) => {
            let msg = `${timestamp} [${level}]`;
            if (context) {
                msg += ` [${context}]`;
            }
            msg += `: ${message}`;
            if (Object.keys(metadata).length > 0) {
                msg += ` ${JSON.stringify(metadata)}`;
            }
            return msg;
        });

        // Base formats
        const baseFormats = [
            errors({ stack: true }),
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' })
        ];

        // Environment checks
        const isDevelopment = process.env.NODE_ENV === 'development';
        const isProduction = process.env.NODE_ENV === 'production';
        const logDir = process.env.LOG_DIR || './logs';
        const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');
        const logMaxFiles = parseInt(process.env.LOG_MAX_FILES || '14', 10);
        const logMaxSize = process.env.LOG_MAX_SIZE || '20m';

        // Development format
        const devFormatters = [
            ...baseFormats,
            colorize(),
            devFormat
        ];

        // Production format
        const prodFormatters = [
            ...baseFormats,
            json()
        ];

        // Create transports
        const transports = [
            new winston.transports.Console({
                format: combine(...(isDevelopment ? devFormatters : prodFormatters))
            })
        ];

        // Add file transport in production
        if (isProduction) {
            transports.push(
                new winston.transports.File({
                    filename: path.join(logDir, 'error.log'),
                    level: 'error',
                    maxsize: logMaxSize,
                    maxFiles: logMaxFiles
                }),
                new winston.transports.File({
                    filename: path.join(logDir, 'combined.log'),
                    maxsize: logMaxSize,
                    maxFiles: logMaxFiles
                })
            );
        }

        return winston.createLogger({
            level: logLevel,
            transports,
            exitOnError: false
        });
    }

    /**
     * Push a context onto the stack
     */
    pushContext(context) {
        this.contextStack.push(context);
        return this;
    }

    /**
     * Pop a context from the stack
     */
    popContext() {
        return this.contextStack.pop();
    }

    /**
     * Get current context
     */
    getContext() {
        return this.contextStack.join(':');
    }

    /**
     * Create a child logger with a specific context
     */
    child(context) {
        const childLogger = Object.create(this);
        childLogger.contextStack = [...this.contextStack, context];
        return childLogger;
    }

    /**
     * Log with metadata
     */
    _log(level, message, metadata = {}) {
        const context = this.getContext();
        this.winston.log({
            level,
            message,
            context: context || undefined,
            ...metadata
        });
    }

    // Log level methods
    error(message, error, metadata = {}) {
        const errorMeta = error instanceof Error ? {
            errorMessage: error.message,
            errorStack: error.stack,
            errorCode: error.code
        } : {};
        
        this._log('error', message, { ...errorMeta, ...metadata });
    }

    warn(message, metadata = {}) {
        this._log('warn', message, metadata);
    }

    info(message, metadata = {}) {
        this._log('info', message, metadata);
    }

    debug(message, metadata = {}) {
        this._log('debug', message, metadata);
    }

    verbose(message, metadata = {}) {
        this._log('verbose', message, metadata);
    }

    /**
     * Log method execution time
     */
    async time(label, fn, metadata = {}) {
        const start = Date.now();
        const childLogger = this.child(label);
        
        try {
            childLogger.debug(`Starting ${label}`, metadata);
            const result = await fn();
            const duration = Date.now() - start;
            childLogger.info(`Completed ${label}`, { duration, ...metadata });
            return result;
        } catch (error) {
            const duration = Date.now() - start;
            childLogger.error(`Failed ${label}`, error, { duration, ...metadata });
            throw error;
        }
    }

    /**
     * Log HTTP request
     */
    logRequest(req, res, responseTime) {
        const metadata = {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            responseTime,
            ip: req.ip,
            userAgent: req.get('user-agent')
        };

        if (res.statusCode >= 400) {
            this.warn(`HTTP ${req.method} ${req.url} - ${res.statusCode}`, metadata);
        } else {
            this.info(`HTTP ${req.method} ${req.url} - ${res.statusCode}`, metadata);
        }
    }

    /**
     * Create metrics logger
     */
    metrics(name, value, metadata = {}) {
        this._log('info', `METRIC: ${name}`, {
            metricName: name,
            metricValue: value,
            ...metadata
        });
    }
}

module.exports = { Logger }; 