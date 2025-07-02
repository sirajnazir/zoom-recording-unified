const express = require('express');
const router = express.Router();

function createHealthRoutes(container) {
    // Comprehensive health check
    router.get('/health', async (req, res) => {
        const startTime = Date.now();
        
        // Initialize checks object
        const checks = {
            container: false,
            knowledgeBase: false,
            cache: false,
            ai: false,
            zoom: false,
            googleDrive: false,
            googleSheets: false
        };
        
        let healthy = true;
        let critical = false;
        const errors = {};
        
        try {
            // Check container exists
            checks.container = !!container;
            
            // Service health checks with proper initialization
            const serviceChecks = [
                { 
                    name: 'knowledgeBase', 
                    serviceName: 'knowledgeBaseService',
                    critical: true 
                },
                { 
                    name: 'cache', 
                    serviceName: 'cache',
                    critical: false 
                },
                { 
                    name: 'ai', 
                    serviceName: 'openAIService',
                    critical: false 
                },
                { 
                    name: 'zoom', 
                    serviceName: 'zoomService',
                    critical: true 
                },
                { 
                    name: 'googleDrive', 
                    serviceName: 'googleDriveService',
                    critical: false 
                },
                { 
                    name: 'googleSheets', 
                    serviceName: 'googleSheetsService',
                    critical: false 
                }
            ];
            
            // Check each service
            for (const { name, serviceName, critical: isCritical } of serviceChecks) {
                try {
                    // Resolve service from container
                    let service;
                    try {
                        service = container.resolve(serviceName);
                    } catch (resolveError) {
                        checks[name] = false;
                        errors[name] = `Failed to resolve service: ${resolveError.message}`;
                        healthy = false;
                        if (isCritical) critical = true;
                        continue;
                    }
                    
                    if (!service) {
                        checks[name] = false;
                        errors[name] = 'Service not found in container';
                        healthy = false;
                        if (isCritical) critical = true;
                        continue;
                    }
                    
                    // Initialize service if needed
                    if (typeof service.initialize === 'function' && 
                        service.isInitialized === false) {
                        try {
                            await service.initialize();
                        } catch (initError) {
                            checks[name] = false;
                            errors[name] = `Initialization failed: ${initError.message}`;
                            healthy = false;
                            if (isCritical) critical = true;
                            continue;
                        }
                    }
                    
                    // Check service health
                    if (typeof service.getHealthStatus === 'function') {
                        const healthStatus = await service.getHealthStatus();
                        checks[name] = healthStatus.healthy === true;
                        if (!healthStatus.healthy) {
                            errors[name] = healthStatus.message || 'Service unhealthy';
                            healthy = false;
                            if (isCritical) critical = true;
                        }
                    } else if (service.isInitialized !== undefined) {
                        checks[name] = service.isInitialized === true;
                        if (!service.isInitialized) {
                            errors[name] = 'Service not initialized';
                            healthy = false;
                            if (isCritical) critical = true;
                        }
                    } else {
                        // No health check available, assume healthy if service exists
                        checks[name] = true;
                    }
                } catch (error) {
                    checks[name] = false;
                    errors[name] = error.message;
                    healthy = false;
                    if (isCritical) critical = true;
                }
            }
            
        } catch (error) {
            healthy = false;
            critical = true;
            errors.general = error.message;
        }
        
        const response = {
            healthy,
            critical,
            checks,
            timestamp: new Date().toISOString(),
            responseTime: Date.now() - startTime,
            version: process.env.npm_package_version || '2.0.0',
            environment: process.env.NODE_ENV || 'development'
        };
        
        // Add errors if any exist
        if (Object.keys(errors).length > 0) {
            response.errors = errors;
        }
        
        // Set appropriate status code
        const statusCode = healthy ? 200 : (critical ? 503 : 200);
        
        res.status(statusCode).json(response);
    });
    
    // Detailed health check for debugging
    router.get('/health/detailed', async (req, res) => {
        const details = {
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            services: {}
        };
        
        const services = [
            { name: 'knowledgeBase', serviceName: 'knowledgeBaseService' },
            { name: 'cache', serviceName: 'cache' },
            { name: 'openAI', serviceName: 'openAIService' },
            { name: 'zoom', serviceName: 'zoomService' },
            { name: 'googleDrive', serviceName: 'googleDriveService' },
            { name: 'googleSheets', serviceName: 'googleSheetsService' },
            { name: 'recordingProcessor', serviceName: 'recordingProcessor' },
            { name: 'transcriptionAnalyzer', serviceName: 'transcriptionAnalyzer' },
            { name: 'insightsGenerator', serviceName: 'insightsGenerator' }
        ];
        
        for (const { name, serviceName } of services) {
            try {
                let service;
                try {
                    service = container.resolve(serviceName);
                } catch (resolveError) {
                    details.services[name] = { 
                        status: 'resolve_error',
                        exists: false,
                        error: resolveError.message
                    };
                    continue;
                }
                
                if (!service) {
                    details.services[name] = { 
                        status: 'not_found',
                        exists: false 
                    };
                    continue;
                }
                
                const serviceInfo = {
                    status: 'unknown',
                    exists: true,
                    type: service.constructor.name,
                    hasInitialize: typeof service.initialize === 'function',
                    hasHealthCheck: typeof service.getHealthStatus === 'function'
                };
                
                // Check initialization status
                if (service.isInitialized !== undefined) {
                    serviceInfo.initialized = service.isInitialized;
                }
                
                // Get health status if available
                if (typeof service.getHealthStatus === 'function') {
                    try {
                        const health = await service.getHealthStatus();
                        serviceInfo.health = health;
                        serviceInfo.status = health.healthy ? 'healthy' : 'unhealthy';
                    } catch (error) {
                        serviceInfo.status = 'error';
                        serviceInfo.healthError = error.message;
                    }
                }
                
                details.services[name] = serviceInfo;
            } catch (error) {
                details.services[name] = {
                    status: 'error',
                    error: error.message
                };
            }
        }
        
        res.json(details);
    });
    
    // Liveness probe (simple check that server is running)
    router.get('/health/live', (req, res) => {
        res.json({ 
            status: 'alive',
            timestamp: new Date().toISOString()
        });
    });
    
    // Readiness probe (check if server is ready to handle requests)
    router.get('/health/ready', async (req, res) => {
        try {
            // Check only critical services
            const criticalServices = ['knowledgeBaseService', 'zoomService'];
            let ready = true;
            
            for (const serviceName of criticalServices) {
                try {
                    const service = container.resolve(serviceName);
                    if (!service || (service.isInitialized === false)) {
                        ready = false;
                        break;
                    }
                } catch (resolveError) {
                    ready = false;
                    break;
                }
            }
            
            res.status(ready ? 200 : 503).json({
                ready,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(503).json({
                ready: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    return router;
}

module.exports = createHealthRoutes; 