// ══════════════════════════════════════════════════════
// Circuit Breaker Pattern for External Services
// ══════════════════════════════════════════════════════

import { logger } from './logger.js';

const CIRCUIT_STATE = {
  CLOSED: 'CLOSED',       // Normal operation
  OPEN: 'OPEN',           // Failing, reject immediately
  HALF_OPEN: 'HALF_OPEN', // Testing if service recovered
};

export class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds
    this.name = options.name || 'service';
    
    this.state = CIRCUIT_STATE.CLOSED;
    this.failureCount = 0;
    this.nextAttempt = Date.now();
    this.successCount = 0;
  }

  async execute(fn) {
    // Circuit is OPEN - fail fast
    if (this.state === CIRCUIT_STATE.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error(`Circuit breaker OPEN for ${this.name}`);
      }
      // Try transitioning to HALF_OPEN
      this.state = CIRCUIT_STATE.HALF_OPEN;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    
    if (this.state === CIRCUIT_STATE.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= 2) {
        this.state = CIRCUIT_STATE.CLOSED;
        this.successCount = 0;
        logger.info({ service: this.name }, 'Circuit breaker CLOSED');
      }
    }
  }

  onFailure() {
    this.failureCount++;
    
    if (this.state === CIRCUIT_STATE.HALF_OPEN) {
      this.state = CIRCUIT_STATE.OPEN;
      this.nextAttempt = Date.now() + this.resetTimeout;
      logger.warn({ service: this.name }, 'Circuit breaker reopened');
      return;
    }

    if (this.failureCount >= this.failureThreshold) {
      this.state = CIRCUIT_STATE.OPEN;
      this.nextAttempt = Date.now() + this.resetTimeout;
      logger.error({ 
        service: this.name, 
        failures: this.failureCount 
      }, 'Circuit breaker OPENED');
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      nextAttempt: this.nextAttempt,
    };
  }
}

// ══════════════════════════════════════════════════════
// Retry Logic with Exponential Backoff
// ══════════════════════════════════════════════════════

export async function retry(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    factor = 2,
    shouldRetry = () => true,
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      
      if (attempt === maxRetries || !shouldRetry(err)) {
        throw err;
      }
      
      const delay = Math.min(initialDelay * Math.pow(factor, attempt), maxDelay);
      const jitter = Math.random() * 0.3 * delay; // 30% jitter
      
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
  }
  
  throw lastError;
}

// ══════════════════════════════════════════════════════
// Timeout Wrapper
// ══════════════════════════════════════════════════════

export function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
    ),
  ]);
}

// ══════════════════════════════════════════════════════
// Rate Limiter (Token Bucket)
// ══════════════════════════════════════════════════════

export class RateLimiter {
  constructor(maxTokens, refillRate) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate; // tokens per second
    this.lastRefill = Date.now();
  }

  async acquire() {
    this.refill();
    
    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }
    
    // Wait for next token
    const waitTime = (1 / this.refillRate) * 1000;
    await new Promise(resolve => setTimeout(resolve, waitTime));
    return this.acquire();
  }

  refill() {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000;
    const tokensToAdd = timePassed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}
