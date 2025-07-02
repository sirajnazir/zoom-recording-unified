const express = require('express');
const { asyncHandler } = require('../../shared/errors');
const { createRateLimiter } = require('../middleware/rate-limiter');
const { createWebhookRoutes } = require('../webhooks/webhook-integration');

/**
 * Create API routes
 */
function createRoutes(container) {
    const router = express.Router();
    
    // Get services from container
    const recordingService = container.get('recordingService');
    
    // Apply rate limiting to all routes except webhooks
    const rateLimiter = createRateLimiter();
    
    // Mount webhook routes (no rate limiting)
    router.use('/webhooks', createWebhookRoutes(express, container));
    
    // Recording routes
    router.get('/recordings', 
        rateLimiter,
        asyncHandler(async (req, res) => {
            const { page = 1, limit = 20, status, coach, student } = req.query;
            
            const result = await recordingService.listRecordings({
                page: parseInt(page),
                limit: parseInt(limit),
                filters: { status, coach, student }
            });
            
            res.json(result);
        })
    );
    
    router.get('/recordings/:id', 
        rateLimiter,
        asyncHandler(async (req, res) => {
            const recording = await recordingService.getRecording(req.params.id);
            res.json(recording);
        })
    );
    
    router.post('/recordings/:id/reprocess', 
        rateLimiter,
        asyncHandler(async (req, res) => {
            const result = await recordingService.reprocessRecording(req.params.id);
            res.json(result);
        })
    );
    
    // Session routes
    router.get('/sessions', 
        rateLimiter,
        asyncHandler(async (req, res) => {
            const { page = 1, limit = 20, coach, student, weekNumber, sessionType } = req.query;
            
            const result = await recordingService.listSessions({
                page: parseInt(page),
                limit: parseInt(limit),
                filters: { coach, student, weekNumber, sessionType }
            });
            
            res.json(result);
        })
    );
    
    router.get('/sessions/:id', 
        rateLimiter,
        asyncHandler(async (req, res) => {
            const session = await recordingService.getSession(req.params.id);
            res.json(session);
        })
    );
    
    // Stats routes
    router.get('/stats/overview', 
        rateLimiter,
        asyncHandler(async (req, res) => {
            const stats = await recordingService.getOverviewStats();
            res.json(stats);
        })
    );
    
    router.get('/stats/processing', 
        rateLimiter,
        asyncHandler(async (req, res) => {
            const stats = await recordingService.getProcessingStats();
            res.json(stats);
        })
    );
    
    router.get('/stats/quality', 
        rateLimiter,
        asyncHandler(async (req, res) => {
            const stats = await recordingService.getQualityStats();
            res.json(stats);
        })
    );
    
    // Coach routes
    router.get('/coaches', 
        rateLimiter,
        asyncHandler(async (req, res) => {
            const coaches = await recordingService.listCoaches();
            res.json(coaches);
        })
    );
    
    router.get('/coaches/:name/students', 
        rateLimiter,
        asyncHandler(async (req, res) => {
            const students = await recordingService.getCoachStudents(req.params.name);
            res.json(students);
        })
    );
    
    // Student routes
    router.get('/students', 
        rateLimiter,
        asyncHandler(async (req, res) => {
            const students = await recordingService.listStudents();
            res.json(students);
        })
    );
    
    router.get('/students/:name/sessions', 
        rateLimiter,
        asyncHandler(async (req, res) => {
            const sessions = await recordingService.getStudentSessions(req.params.name);
            res.json(sessions);
        })
    );
    
    // Debug routes (only in development)
    if (process.env.NODE_ENV === 'development') {
        router.get('/debug/config', 
            rateLimiter,
            asyncHandler(async (req, res) => {
                res.json({
                    environment: process.env.NODE_ENV,
                    features: container.get('config').features,
                    services: {
                        zoom: !!container.get('zoomService'),
                        googleDrive: !!container.get('googleDriveService'),
                        ai: !!container.get('aiService')
                    }
                });
            })
        );
    }
    
    return router;
}

module.exports = { createRoutes }; 