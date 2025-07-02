const rateLimit = require('express-rate-limit');
const config = require('../../shared/config');

/**
 * Create rate limiter middleware
 */
function createRateLimiter(options = {}) {
    const defaultOptions = {
        windowMs: config.rateLimit.windowMs,
        max: config.rateLimit.max,
        standardHeaders: config.rateLimit.standardHeaders,
        legacyHeaders: config.rateLimit.legacyHeaders,
        skipSuccessfulRequests: config.rateLimit.skipSuccessfulRequests,
        
        // Custom key generator for proper IP detection
        keyGenerator: (req) => {
            // Use x-forwarded-for if available (behind proxy)
            const forwarded = req.headers['x-forwarded-for'];
            if (forwarded) {
                // Take first IP from comma-separated list
                return forwarded.split(',')[0].trim();
            }
            // Fallback to req.ip
            return req.ip;
        },
        
        // Custom handler for rate limit exceeded
        handler: (req, res) => {
            res.status(429).json({
                error: {
                    message: 'Too many requests, please try again later',
                    code: 'RATE_LIMIT_EXCEEDED',
                    retryAfter: Math.round(req.rateLimit.resetTime / 1000)
                }
            });
        },
        
        // Skip rate limiting for certain conditions
        skip: (req) => {
            // Skip for health checks
            if (req.path === '/health') return true;
            
            // Skip for webhook endpoints (they have their own validation)
            if (req.path.includes('/webhooks/')) return true;
            
            // Skip based on custom options
            if (options.skip) {
                return options.skip(req);
            }
            
            return false;
        }
    };
    
    // Merge with custom options
    const finalOptions = { ...defaultOptions, ...options };
    
    return rateLimit(finalOptions);
}

/**
 * Create strict rate limiter for sensitive endpoints
 */
function createStrictRateLimiter(options = {}) {
    return createRateLimiter({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5, // Only 5 requests per window
        skipSuccessfulRequests: false,
        ...options
    });
}

/**
 * Create API-specific rate limiters
 */
const rateLimiters = {
    // General API rate limit
    general: createRateLimiter(),
    
    // Strict limit for reprocessing endpoints
    reprocess: createStrictRateLimiter({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 10, // 10 reprocess requests per hour
        message: 'Too many reprocess requests'
    }),
    
    // Lenient limit for read-only endpoints
    readonly: createRateLimiter({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 500, // 500 requests per window
        skipSuccessfulRequests: true
    }),
    
    // Auth endpoints (if added later)
    auth: createStrictRateLimiter({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5, // 5 auth attempts per window
        skipFailedRequests: true
    })
};

/**
 * Create dynamic rate limiter based on user role
 */
function createDynamicRateLimiter(userRoleResolver) {
    return (req, res, next) => {
        const userRole = userRoleResolver(req);
        
        let limiterOptions = {
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100 // Default limit
        };
        
        // Adjust limits based on user role
        switch (userRole) {
            case 'admin':
                limiterOptions.max = 1000;
                break;
            case 'premium':
                limiterOptions.max = 500;
                break;
            case 'basic':
                limiterOptions.max = 100;
                break;
            default:
                limiterOptions.max = 50;
        }
        
        const limiter = createRateLimiter(limiterOptions);
        return limiter(req, res, next);
    };
}

/**
 * Create burst rate limiter for handling traffic spikes
 */
function createBurstRateLimiter(options = {}) {
    return createRateLimiter({
        windowMs: 60 * 1000, // 1 minute
        max: 30, // 30 requests per minute
        skipSuccessfulRequests: false,
        standardHeaders: true,
        legacyHeaders: false,
        ...options
    });
}

/**
 * Create sliding window rate limiter
 */
function createSlidingWindowRateLimiter(options = {}) {
    return createRateLimiter({
        windowMs: 60 * 1000, // 1 minute sliding window
        max: 60, // 60 requests per minute
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests: true,
        ...options
    });
}

/**
 * Rate limiter for file uploads
 */
function createUploadRateLimiter(options = {}) {
    return createRateLimiter({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 10, // 10 uploads per hour
        skipSuccessfulRequests: false,
        message: 'Too many file uploads',
        ...options
    });
}

/**
 * Rate limiter for analysis endpoints
 */
function createAnalysisRateLimiter(options = {}) {
    return createRateLimiter({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 20, // 20 analysis requests per 15 minutes
        skipSuccessfulRequests: false,
        message: 'Too many analysis requests',
        ...options
    });
}

/**
 * Get rate limit info for a request
 */
function getRateLimitInfo(req) {
    if (!req.rateLimit) {
        return null;
    }
    
    return {
        limit: req.rateLimit.limit,
        current: req.rateLimit.current,
        remaining: req.rateLimit.remaining,
        resetTime: req.rateLimit.resetTime,
        resetTimeMs: req.rateLimit.resetTimeMs
    };
}

/**
 * Check if request is rate limited
 */
function isRateLimited(req) {
    return req.rateLimit && req.rateLimit.remaining <= 0;
}

/**
 * Add rate limit headers to response
 */
function addRateLimitHeaders(res, req) {
    if (req.rateLimit) {
        res.set({
            'X-RateLimit-Limit': req.rateLimit.limit,
            'X-RateLimit-Remaining': req.rateLimit.remaining,
            'X-RateLimit-Reset': req.rateLimit.resetTime
        });
    }
}

module.exports = {
    createRateLimiter,
    createStrictRateLimiter,
    createDynamicRateLimiter,
    createBurstRateLimiter,
    createSlidingWindowRateLimiter,
    createUploadRateLimiter,
    createAnalysisRateLimiter,
    rateLimiters,
    getRateLimitInfo,
    isRateLimited,
    addRateLimitHeaders
}; 