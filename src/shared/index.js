//module.exports = {
  //  ...require('./EventBus'),
  //  ...require('./Logger'),
  //  ...require('./Cache'),
  //  ...require('./MetricsCollector')
//};

// src/shared/index.js

const winston = require('winston');
const { EventEmitter } = require('events');

// ============================================================================
// LOGGER
// ============================================================================

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ level, message, timestamp, ...metadata }) => {
                    let msg = `${timestamp} [${level}]: ${message}`;
                    if (Object.keys(metadata).length > 0) {
                        msg += ` ${JSON.stringify(metadata)}`;
                    }
                    return msg;
                })
            )
        })
    ]
});

// ============================================================================
// EVENT BUS
// ============================================================================

class EventBus extends EventEmitter {
    constructor() {
        super();
        this.history = [];
    }

    emit(event, data) {
        this.history.push({ event, data, timestamp: new Date() });
        super.emit(event, data);
    }

    getHistory() {
        return this.history;
    }

    clearHistory() {
        this.history = [];
    }
}

// ============================================================================
// CACHE
// ============================================================================

class Cache {
    constructor() {
        this.store = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0
        };
    }

    async get(key) {
        if (this.store.has(key)) {
            this.stats.hits++;
            const item = this.store.get(key);
            if (item.expiry && item.expiry < Date.now()) {
                this.store.delete(key);
                this.stats.misses++;
                return null;
            }
            return item.value;
        }
        this.stats.misses++;
        return null;
    }

    async set(key, value, ttl = 3600) {
        this.stats.sets++;
        const expiry = ttl > 0 ? Date.now() + (ttl * 1000) : null;
        this.store.set(key, { value, expiry });
    }

    async delete(key) {
        this.stats.deletes++;
        return this.store.delete(key);
    }

    async clear() {
        this.store.clear();
    }

    getStats() {
        return { ...this.stats };
    }
}

// ============================================================================
// METRICS COLLECTOR
// ============================================================================

class MetricsCollector {
    constructor() {
        this.metrics = {
            processedRecordings: 0,
            totalProcessingTime: 0,
            aiCalls: 0,
            cacheHits: 0,
            cacheMisses: 0,
            circuitBreakerTrips: 0,
            errors: []
        };
    }

    recordProcessing(duration) {
        this.metrics.processedRecordings++;
        this.metrics.totalProcessingTime += duration;
    }

    recordAICall() {
        this.metrics.aiCalls++;
    }

    recordCacheHit() {
        this.metrics.cacheHits++;
    }

    recordCacheMiss() {
        this.metrics.cacheMisses++;
    }

    recordCircuitBreakerTrip() {
        this.metrics.circuitBreakerTrips++;
    }

    recordError(error) {
        this.metrics.errors.push({
            message: error.message,
            timestamp: new Date(),
            stack: error.stack
        });
    }

    getMetrics() {
        return {
            ...this.metrics,
            averageProcessingTime: this.metrics.processedRecordings > 0 
                ? this.metrics.totalProcessingTime / this.metrics.processedRecordings 
                : 0,
            errorRate: this.metrics.processedRecordings > 0
                ? (this.metrics.errors.length / this.metrics.processedRecordings) * 100
                : 0
        };
    }

    reset() {
        this.metrics = {
            processedRecordings: 0,
            totalProcessingTime: 0,
            aiCalls: 0,
            cacheHits: 0,
            cacheMisses: 0,
            circuitBreakerTrips: 0,
            errors: []
        };
    }
}

// ============================================================================
// ERROR CLASSES
// ============================================================================

class BaseError extends Error {
    constructor(message, code, statusCode) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        this.timestamp = new Date();
        Error.captureStackTrace(this, this.constructor);
    }
}

class RecordingAnalysisError extends BaseError {
    constructor(message, details) {
        super(message, 'RECORDING_ANALYSIS_ERROR', 500);
        this.details = details;
    }
}

class RecordingProcessingError extends BaseError {
    constructor(message, details) {
        super(message, 'RECORDING_PROCESSING_ERROR', 500);
        this.details = details;
    }
}

class ValidationError extends BaseError {
    constructor(message, field) {
        super(message, 'VALIDATION_ERROR', 400);
        this.field = field;
    }
}

class NotFoundError extends BaseError {
    constructor(message, resource) {
        super(message, 'NOT_FOUND', 404);
        this.resource = resource;
    }
}

class ExternalServiceError extends BaseError {
    constructor(message, service, originalError) {
        super(message, 'EXTERNAL_SERVICE_ERROR', 503);
        this.service = service;
        this.originalError = originalError;
    }
}

const errors = {
    BaseError,
    RecordingAnalysisError,
    RecordingProcessingError,
    ValidationError,
    NotFoundError,
    ExternalServiceError
};

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Retry function with exponential backoff
 */
async function retryWithBackoff(fn, options = {}) {
    const {
        maxAttempts = 3,
        initialDelay = 1000,
        maxDelay = 30000,
        factor = 2,
        onRetry = () => {}
    } = options;

    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            
            if (attempt === maxAttempts) {
                throw error;
            }
            
            const delay = Math.min(
                initialDelay * Math.pow(factor, attempt - 1),
                maxDelay
            );
            
            onRetry(error, attempt, delay);
            
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw lastError;
}

/**
 * Sleep utility
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Chunk array into smaller arrays
 */
function chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format duration to human readable
 */
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    // Core utilities
    logger,
    EventBus,
    Cache,
    MetricsCollector,
    
    // Error classes
    errors,
    RecordingAnalysisError,
    RecordingProcessingError,
    ValidationError,
    NotFoundError,
    ExternalServiceError,
    
    // Utility functions
    retryWithBackoff,
    sleep,
    chunk,
    formatBytes,
    formatDuration
};
