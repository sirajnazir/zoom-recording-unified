// src/shared/errors.js

/**
 * Base error class for all custom errors
 */
class BaseError extends Error {
    constructor(message, code, statusCode) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        this.timestamp = new Date();
        Error.captureStackTrace(this, this.constructor);
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            statusCode: this.statusCode,
            timestamp: this.timestamp,
            stack: this.stack
        };
    }
}

/**
 * Recording analysis specific errors
 */
class RecordingAnalysisError extends BaseError {
    constructor(message, details) {
        super(message, 'RECORDING_ANALYSIS_ERROR', 500);
        this.details = details;
    }
}

/**
 * Recording processing errors
 */
class RecordingProcessingError extends BaseError {
    constructor(message, details) {
        super(message, 'RECORDING_PROCESSING_ERROR', 500);
        this.details = details;
    }
}

/**
 * Validation errors
 */
class ValidationError extends BaseError {
    constructor(message, field, value) {
        super(message, 'VALIDATION_ERROR', 400);
        this.field = field;
        this.value = value;
    }
}

/**
 * Not found errors
 */
class NotFoundError extends BaseError {
    constructor(message, resource, id) {
        super(message, 'NOT_FOUND', 404);
        this.resource = resource;
        this.id = id;
    }
}

/**
 * External service errors
 */
class ExternalServiceError extends BaseError {
    constructor(message, service, originalError) {
        super(message, 'EXTERNAL_SERVICE_ERROR', 503);
        this.service = service;
        this.originalError = originalError;
    }
}

class DriveIntegrationError extends ExternalServiceError {
    constructor(message, originalError) {
        super('Google Drive', message, originalError);
        this.name = 'DriveIntegrationError';
    }
}

/**
 * Authentication errors
 */
class AuthenticationError extends BaseError {
    constructor(message, reason) {
        super(message, 'AUTHENTICATION_ERROR', 401);
        this.reason = reason;
    }
}

/**
 * Authorization errors
 */
class AuthorizationError extends BaseError {
    constructor(message, resource, action) {
        super(message, 'AUTHORIZATION_ERROR', 403);
        this.resource = resource;
        this.action = action;
    }
}

/**
 * Rate limit errors
 */
class RateLimitError extends BaseError {
    constructor(message, limit, window, retryAfter) {
        super(message, 'RATE_LIMIT_ERROR', 429);
        this.limit = limit;
        this.window = window;
        this.retryAfter = retryAfter;
    }
}

/**
 * Configuration errors
 */
class ConfigurationError extends BaseError {
    constructor(message, missingConfig) {
        super(message, 'CONFIGURATION_ERROR', 500);
        this.missingConfig = missingConfig;
    }
}

/**
 * File processing errors
 */
class FileProcessingError extends BaseError {
    constructor(message, filename, operation) {
        super(message, 'FILE_PROCESSING_ERROR', 500);
        this.filename = filename;
        this.operation = operation;
    }
}

/**
 * AI service errors
 */
class AIServiceError extends BaseError {
    constructor(message, provider, model, originalError) {
        super(message, 'AI_SERVICE_ERROR', 503);
        this.provider = provider;
        this.model = model;
        this.originalError = originalError;
    }
}

/**
 * Google service errors
 */
class GoogleServiceError extends BaseError {
    constructor(message, service, operation, originalError) {
        super(message, 'GOOGLE_SERVICE_ERROR', 503);
        this.service = service;
        this.operation = operation;
        this.originalError = originalError;
    }
}

/**
 * Zoom service errors
 */
class ZoomServiceError extends BaseError {
    constructor(message, endpoint, statusCode, originalError) {
        super(message, 'ZOOM_SERVICE_ERROR', statusCode || 503);
        this.endpoint = endpoint;
        this.originalError = originalError;
    }
}

/**
 * Circuit breaker errors
 */
class CircuitBreakerError extends BaseError {
    constructor(message, service, state) {
        super(message, 'CIRCUIT_BREAKER_ERROR', 503);
        this.service = service;
        this.state = state;
    }
}

/**
 * Timeout errors
 */
class TimeoutError extends BaseError {
    constructor(message, operation, timeout) {
        super(message, 'TIMEOUT_ERROR', 504);
        this.operation = operation;
        this.timeout = timeout;
    }
}

module.exports = {
    BaseError,
    RecordingAnalysisError,
    RecordingProcessingError,
    ValidationError,
    NotFoundError,
    ExternalServiceError,
    DriveIntegrationError,
    AuthenticationError,
    AuthorizationError,
    RateLimitError,
    ConfigurationError,
    FileProcessingError,
    AIServiceError,
    GoogleServiceError,
    ZoomServiceError,
    CircuitBreakerError,
    TimeoutError
};