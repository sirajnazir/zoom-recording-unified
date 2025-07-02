/**
 * Base application error class
 */
class AppError extends Error {
    constructor(message, code, statusCode = 500, details = {}) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.timestamp = new Date();
        Error.captureStackTrace(this, this.constructor);
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            statusCode: this.statusCode,
            details: this.details,
            timestamp: this.timestamp
        };
    }
}

/**
 * Validation error
 */
class ValidationError extends AppError {
    constructor(message, details = {}) {
        super(message, 'VALIDATION_ERROR', 400, details);
    }
}

/**
 * Not found error
 */
class NotFoundError extends AppError {
    constructor(resource, identifier) {
        super(`${resource} not found: ${identifier}`, 'NOT_FOUND', 404, {
            resource,
            identifier
        });
    }
}

/**
 * Authentication error
 */
class AuthenticationError extends AppError {
    constructor(message = 'Authentication failed') {
        super(message, 'AUTHENTICATION_ERROR', 401);
    }
}

/**
 * Authorization error
 */
class AuthorizationError extends AppError {
    constructor(message = 'Access denied') {
        super(message, 'AUTHORIZATION_ERROR', 403);
    }
}

/**
 * External service error
 */
class ExternalServiceError extends AppError {
    constructor(service, message, originalError = null) {
        super(`${service} error: ${message}`, 'EXTERNAL_SERVICE_ERROR', 503, {
            service,
            originalError: originalError?.message
        });
        this.service = service;
        this.originalError = originalError;
    }
}

/**
 * Rate limit error
 */
class RateLimitError extends AppError {
    constructor(retryAfter) {
        super('Rate limit exceeded', 'RATE_LIMIT_ERROR', 429, {
            retryAfter
        });
    }
}

/**
 * Google Sheets error
 */
class GoogleSheetsError extends AppError {
    constructor(message, originalError = null) {
        super(message, 'GOOGLE_SHEETS_ERROR', 500, {
            originalError: originalError?.message
        });
        this.originalError = originalError;
    }
}

/**
 * Processing error
 */
class ProcessingError extends AppError {
    constructor(step, message, details = {}) {
        super(`Processing error at ${step}: ${message}`, 'PROCESSING_ERROR', 500, {
            step,
            ...details
        });
    }
}

/**
 * Configuration error
 */
class ConfigurationError extends AppError {
    constructor(message, missingConfig = []) {
        super(message, 'CONFIGURATION_ERROR', 500, {
            missingConfig
        });
    }
}

/**
 * Error handler middleware for Express
 */
const errorHandler = (logger) => (err, req, res, next) => {
    // Log error
    logger.error('Request error', err, {
        method: req.method,
        url: req.url,
        ip: req.ip
    });

    // Determine status code
    const statusCode = err.statusCode || err.status || 500;
    
    // Prepare error response
    const response = {
        error: {
            message: err.message || 'Internal server error',
            code: err.code || 'INTERNAL_ERROR'
        }
    };

    // Add details in development
    if (process.env.NODE_ENV === 'development') {
        response.error.details = err.details || {};
        response.error.stack = err.stack;
    }

    // Send response
    res.status(statusCode).json(response);
};

/**
 * Async error wrapper for route handlers
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Retry with exponential backoff
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
                break;
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
 * Circuit breaker pattern implementation
 */
class CircuitBreaker {
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 60000;
        this.monitoringPeriod = options.monitoringPeriod || 10000;
        
        this.state = 'CLOSED';
        this.failures = 0;
        this.nextAttempt = Date.now();
        this.successCount = 0;
        this.failureCount = 0;
        this.lastFailureTime = null;
    }

    async execute(fn) {
        if (this.state === 'OPEN') {
            if (Date.now() < this.nextAttempt) {
                throw new Error('Circuit breaker is OPEN');
            }
            this.state = 'HALF_OPEN';
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    onSuccess() {
        this.failures = 0;
        this.successCount++;
        
        if (this.state === 'HALF_OPEN') {
            this.state = 'CLOSED';
        }
    }

    onFailure() {
        this.failures++;
        this.failureCount++;
        this.lastFailureTime = Date.now();
        
        if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
            this.nextAttempt = Date.now() + this.resetTimeout;
        }
    }

    getStatus() {
        return {
            state: this.state,
            failures: this.failures,
            successCount: this.successCount,
            failureCount: this.failureCount,
            lastFailureTime: this.lastFailureTime
        };
    }
}

module.exports = {
    AppError,
    ValidationError,
    NotFoundError,
    AuthenticationError,
    AuthorizationError,
    ExternalServiceError,
    RateLimitError,
    GoogleSheetsError,
    ProcessingError,
    ConfigurationError,
    errorHandler,
    asyncHandler,
    retryWithBackoff,
    CircuitBreaker
}; 