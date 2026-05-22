// ══════════════════════════════════════════════════════
// Application Health Monitoring
// ══════════════════════════════════════════════════════

import { getDb, checkDbHealth } from '../db/connection.js';
import { logger } from './logger.js';

class HealthMonitor {
  constructor() {
    this.checks = new Map();
    this.status = 'healthy';
    this.lastCheck = null;
  }

  register(name, checkFn) {
    this.checks.set(name, checkFn);
  }

  async runChecks() {
    const results = {};
    let allHealthy = true;

    for (const [name, checkFn] of this.checks) {
      try {
        const startTime = Date.now();
        const result = await Promise.race([
          checkFn(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), 5000)
          ),
        ]);
        
        results[name] = {
          status: result ? 'healthy' : 'unhealthy',
          responseTime: Date.now() - startTime,
        };
        
        if (!result) allHealthy = false;
      } catch (err) {
        results[name] = {
          status: 'unhealthy',
          error: err.message,
        };
        allHealthy = false;
      }
    }

    this.status = allHealthy ? 'healthy' : 'degraded';
    this.lastCheck = new Date().toISOString();

    return {
      status: this.status,
      timestamp: this.lastCheck,
      checks: results,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  }

  getStatus() {
    return this.status;
  }
}

export const healthMonitor = new HealthMonitor();

// Register default health checks
healthMonitor.register('database', () => checkDbHealth());

healthMonitor.register('memory', () => {
  const usage = process.memoryUsage();
  const maxHeap = 512 * 1024 * 1024; // 512MB threshold
  return usage.heapUsed < maxHeap;
});

// ══════════════════════════════════════════════════════
// Graceful Shutdown Manager
// ══════════════════════════════════════════════════════

class ShutdownManager {
  constructor() {
    this.handlers = [];
    this.isShuttingDown = false;
    this.shutdownTimeout = 30000; // 30 seconds
  }

  register(name, handler) {
    this.handlers.push({ name, handler });
  }

  async shutdown(signal) {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info({ signal }, 'Graceful shutdown initiated');

    const timeout = setTimeout(() => {
      logger.error('Shutdown timeout - forcing exit');
      process.exit(1);
    }, this.shutdownTimeout);

    try {
      for (const { name, handler } of this.handlers) {
        try {
          logger.info({ component: name }, 'Shutting down component');
          await handler();
        } catch (err) {
          logger.error({ component: name, err: err.message }, 'Shutdown error');
        }
      }

      clearTimeout(timeout);
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      clearTimeout(timeout);
      logger.error({ err: err.message }, 'Shutdown failed');
      process.exit(1);
    }
  }
}

export const shutdownManager = new ShutdownManager();

// ══════════════════════════════════════════════════════
// Process Monitoring
// ══════════════════════════════════════════════════════

export function setupProcessMonitoring() {
  // Unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error({
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined,
    }, 'Unhandled promise rejection');
  });

  // Uncaught exceptions
  process.on('uncaughtException', (err) => {
    logger.fatal({
      err: err.message,
      stack: err.stack,
    }, 'Uncaught exception - shutting down');
    
    shutdownManager.shutdown('UNCAUGHT_EXCEPTION');
  });

  // Memory warnings
  let lastMemoryWarning = 0;
  setInterval(() => {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    
    if (heapUsedMB > 400 && Date.now() - lastMemoryWarning > 60000) {
      logger.warn({
        heapUsed: `${heapUsedMB}MB`,
        heapTotal: `${heapTotalMB}MB`,
      }, 'High memory usage');
      lastMemoryWarning = Date.now();
    }
  }, 30000); // Check every 30 seconds

  // Graceful shutdown signals
  process.on('SIGTERM', () => shutdownManager.shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdownManager.shutdown('SIGINT'));
}
