/**
 * Graceful shutdown handler
 */
function setupGracefulShutdown(shutdownHandler) {
    let isShuttingDown = false;

    const shutdown = async (signal) => {
        if (isShuttingDown) {
            console.log('Shutdown already in progress...');
            return;
        }

        isShuttingDown = true;
        console.log(`\n${signal} received. Starting graceful shutdown...`);

        try {
            // Set a timeout for shutdown
            const shutdownTimeout = setTimeout(() => {
                console.error('Shutdown timeout exceeded, forcing exit');
                process.exit(1);
            }, 30000); // 30 seconds timeout

            // Call the shutdown handler
            await shutdownHandler();

            clearTimeout(shutdownTimeout);
            console.log('Graceful shutdown completed');
            process.exit(0);

        } catch (error) {
            console.error('Error during shutdown:', error);
            process.exit(1);
        }
    };

    // Handle different termination signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGHUP', () => shutdown('SIGHUP'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
        shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        shutdown('unhandledRejection');
    });
}

/**
 * Shutdown manager for coordinating multiple services
 */
class ShutdownManager {
    constructor() {
        this.handlers = [];
        this.isShuttingDown = false;
    }

    /**
     * Register a shutdown handler
     */
    register(name, handler) {
        this.handlers.push({ name, handler });
    }

    /**
     * Execute all shutdown handlers
     */
    async shutdown() {
        if (this.isShuttingDown) {
            return;
        }

        this.isShuttingDown = true;
        console.log(`Executing ${this.handlers.length} shutdown handlers...`);

        // Execute handlers in parallel with timeout
        const shutdownPromises = this.handlers.map(({ name, handler }) => {
            return Promise.race([
                handler().catch(error => {
                    console.error(`Shutdown handler '${name}' failed:`, error);
                }),
                new Promise((resolve) => {
                    setTimeout(() => {
                        console.warn(`Shutdown handler '${name}' timed out`);
                        resolve();
                    }, 10000); // 10 seconds per handler
                })
            ]);
        });

        await Promise.all(shutdownPromises);
        console.log('All shutdown handlers completed');
    }

    /**
     * Register shutdown handlers with priority
     */
    registerWithPriority(name, handler, priority = 0) {
        this.handlers.push({ name, handler, priority });
        // Sort by priority (higher priority first)
        this.handlers.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }

    /**
     * Execute shutdown handlers in priority order
     */
    async shutdownWithPriority() {
        if (this.isShuttingDown) {
            return;
        }

        this.isShuttingDown = true;
        console.log(`Executing ${this.handlers.length} shutdown handlers in priority order...`);

        // Execute handlers sequentially in priority order
        for (const { name, handler } of this.handlers) {
            try {
                console.log(`Executing shutdown handler: ${name}`);
                await Promise.race([
                    handler(),
                    new Promise((resolve) => {
                        setTimeout(() => {
                            console.warn(`Shutdown handler '${name}' timed out`);
                            resolve();
                        }, 10000); // 10 seconds per handler
                    })
                ]);
                console.log(`Completed shutdown handler: ${name}`);
            } catch (error) {
                console.error(`Shutdown handler '${name}' failed:`, error);
            }
        }

        console.log('All shutdown handlers completed');
    }

    /**
     * Remove a shutdown handler
     */
    unregister(name) {
        this.handlers = this.handlers.filter(handler => handler.name !== name);
    }

    /**
     * Get registered handlers
     */
    getHandlers() {
        return this.handlers.map(({ name, priority }) => ({ name, priority }));
    }

    /**
     * Clear all handlers
     */
    clear() {
        this.handlers = [];
    }

    /**
     * Check if shutdown is in progress
     */
    isShuttingDown() {
        return this.isShuttingDown;
    }
}

/**
 * Create a simple shutdown handler for common services
 */
function createServiceShutdownHandler(services) {
    return async () => {
        const shutdownPromises = [];

        // Database connections
        if (services.database) {
            shutdownPromises.push(
                services.database.close().catch(error => {
                    console.error('Database shutdown error:', error);
                })
            );
        }

        // HTTP server
        if (services.server) {
            shutdownPromises.push(
                new Promise((resolve) => {
                    services.server.close(() => {
                        console.log('HTTP server closed');
                        resolve();
                    });
                })
            );
        }

        // File watchers
        if (services.watchers) {
            services.watchers.forEach(watcher => {
                watcher.close();
            });
        }

        // Clear intervals
        if (services.intervals) {
            services.intervals.forEach(interval => {
                clearInterval(interval);
            });
        }

        // Clear timeouts
        if (services.timeouts) {
            services.timeouts.forEach(timeout => {
                clearTimeout(timeout);
            });
        }

        await Promise.all(shutdownPromises);
    };
}

/**
 * Setup default shutdown handlers
 */
function setupDefaultShutdown(services = {}) {
    const shutdownManager = new ShutdownManager();
    
    // Register service shutdown handler
    shutdownManager.register('services', createServiceShutdownHandler(services));
    
    // Setup graceful shutdown
    setupGracefulShutdown(() => shutdownManager.shutdown());
    
    return shutdownManager;
}

module.exports = {
    setupGracefulShutdown,
    ShutdownManager,
    createServiceShutdownHandler,
    setupDefaultShutdown
}; 