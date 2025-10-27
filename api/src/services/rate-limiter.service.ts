import Bottleneck from 'bottleneck';

/**
 * Rate Limiter Configuration
 */
export interface RateLimiterConfig {
  rateLimitPerMinute: number;  // Maximum requests per minute
  workerConcurrency: number;   // Number of parallel workers
  reservoir?: number;          // Initial number of jobs that can be executed
  reservoirRefreshInterval?: number; // Interval to refresh reservoir (ms)
}

/**
 * Rate Limiter Metrics
 */
export interface RateLimiterMetrics {
  totalRequests: number;
  queued: number;
  running: number;
  done: number;
  failed: number;
  minTime: number;              // Minimum time between requests (ms)
  maxConcurrent: number;        // Maximum concurrent requests
  lastRequestAt: number | null;
}

/**
 * Rate Limiter Service
 * 
 * Manages API rate limiting using Bottleneck to prevent 429 errors.
 * 
 * Features:
 * - Global rate limiting (requests per minute)
 * - Concurrency control (parallel workers)
 * - Automatic queue management
 * - Metrics tracking
 * - Thread-safe operation
 * 
 * SINGLETON PATTERN:
 * - Constructor is private
 * - Must use initializeRateLimiter() once at startup
 * - Use getRateLimiter() to get the singleton instance
 */
class RateLimiter {
  private limiter: Bottleneck;
  private metrics: RateLimiterMetrics;

  /**
   * Private constructor - prevents direct instantiation
   */
  private constructor(config: RateLimiterConfig) {
    // Calculate minimum time between requests
    // If limit is 6 req/min, minTime = 60000 / 6 = 10000ms
    // Add 1000ms (1 second) buffer to account for:
    // - Token fetching overhead (happens inside rate-limited jobs)
    // - Network latency and variations
    // - Processing time before actual API call
    // - API measurement precision
    const minTime = Math.ceil(60000 / config.rateLimitPerMinute) + 1000;

    // Initialize metrics
    this.metrics = {
      totalRequests: 0,
      queued: 0,
      running: 0,
      done: 0,
      failed: 0,
      minTime,
      maxConcurrent: config.workerConcurrency,
      lastRequestAt: null,
    };

    // Create Bottleneck limiter
    this.limiter = new Bottleneck({
      // Concurrency: max number of jobs running at the same time
      maxConcurrent: config.workerConcurrency,

      // Min time between launches (in ms)
      // This ensures at least minTime between the START of each job
      minTime,

      // Track done jobs
      trackDoneStatus: true,
    });

    // Event listeners for metrics
    this.limiter.on('queued', () => {
      this.metrics.queued++;
    });

    this.limiter.on('scheduled', () => {
      this.metrics.running++;
      this.metrics.totalRequests++;
      this.metrics.lastRequestAt = Date.now();
    });

    this.limiter.on('done', () => {
      this.metrics.done++;
      this.metrics.running = Math.max(0, this.metrics.running - 1);
      this.metrics.queued = Math.max(0, this.metrics.queued - 1);
    });

    this.limiter.on('failed', () => {
      this.metrics.failed++;
      this.metrics.running = Math.max(0, this.metrics.running - 1);
      this.metrics.queued = Math.max(0, this.metrics.queued - 1);
    });

    console.log(`✅ RateLimiter initialized:`);
    console.log(`   Rate Limit: ${config.rateLimitPerMinute} requests/minute`);
    console.log(`   Min Time: ${minTime}ms between requests (includes 1000ms safety buffer)`);
    console.log(`   Concurrency: ${config.workerConcurrency} parallel workers`);
  }

  /**
   * Schedules a job to be executed respecting rate limits
   * 
   * @param job - Async function to execute
   * @param priority - Job priority (0-9, higher = more important)
   * @returns Promise with the job result
   */
  async schedule<T>(
    job: () => Promise<T>,
    priority: number = 5
  ): Promise<T> {
    return this.limiter.schedule({ priority }, job);
  }

  /**
   * Wraps a function to be rate-limited
   * 
   * @param fn - Function to wrap
   * @returns Wrapped function that respects rate limits
   */
  wrap<T extends (...args: any[]) => Promise<any>>(fn: T): T {
    return this.limiter.wrap(fn) as unknown as T;
  }

  /**
   * Gets current metrics
   */
  getMetrics(): RateLimiterMetrics {
    return {
      ...this.metrics,
      queued: this.limiter.counts().QUEUED || 0,
      running: this.limiter.counts().RUNNING || 0,
      done: this.limiter.counts().DONE || 0,
    };
  }

  /**
   * Gets queue information
   */
  getQueueInfo() {
    return {
      counts: this.limiter.counts(),
      emptied: this.limiter.empty(),
      queueSize: this.limiter.counts().QUEUED || 0,
      isRunning: (this.limiter.counts().RUNNING || 0) > 0,
    };
  }

  /**
   * Checks if rate limiter is currently processing jobs
   */
  isRunning(): boolean {
    return (this.limiter.counts().RUNNING || 0) > 0;
  }

  /**
   * Checks if queue is empty
   */
  isEmpty(): boolean {
    return this.limiter.empty();
  }

  /**
   * Waits for all jobs to complete
   */
  async waitForAll(): Promise<void> {
    await this.limiter.stop({ dropWaitingJobs: false });
  }

  /**
   * Waits for queue to become idle (no running or queued jobs)
   * Used during graceful shutdown to ensure all work is complete
   */
  async waitForIdle(): Promise<void> {
    // If already idle, return immediately
    if (this.isEmpty() && !this.isRunning()) {
      return;
    }

    // Wait for all current jobs to complete
    return new Promise((resolve) => {
      const checkIdle = () => {
        if (this.isEmpty() && !this.isRunning()) {
          resolve();
        } else {
          // Check again in 100ms
          setTimeout(checkIdle, 100);
        }
      };
      checkIdle();
    });
  }

  /**
   * Clears the queue (cancels waiting jobs)
   */
  async clearQueue(): Promise<void> {
    await this.limiter.stop({ dropWaitingJobs: true });
  }

  /**
   * Updates rate limit configuration
   */
  updateConfig(newConfig: Partial<RateLimiterConfig>): void {
    if (newConfig.rateLimitPerMinute) {
      const minTime = Math.ceil(60000 / newConfig.rateLimitPerMinute) + 1000;
      this.limiter.updateSettings({
        minTime,
      });
      this.metrics.minTime = minTime;
    }

    if (newConfig.workerConcurrency) {
      this.limiter.updateSettings({
        maxConcurrent: newConfig.workerConcurrency,
      });
      this.metrics.maxConcurrent = newConfig.workerConcurrency;
    }

    console.log(`🔄 RateLimiter configuration updated`);
  }

  /**
   * Static factory method - used internally
   * @internal
   */
  static createInstance(config: RateLimiterConfig): RateLimiter {
    return new RateLimiter(config);
  }
}

// Singleton instance
let rateLimiterInstance: RateLimiter | null = null;

/**
 * Initializes the global rate limiter instance
 * 
 * ⚠️  IMPORTANT: This should only be called ONCE at application startup
 * 
 * @param config - Rate limiter configuration
 */
export function initializeRateLimiter(config: RateLimiterConfig): void {
  if (rateLimiterInstance) {
    console.warn('⚠️  RateLimiter already initialized. Replacing existing instance.');
  }
  rateLimiterInstance = RateLimiter.createInstance(config);
}

/**
 * Gets the global rate limiter instance
 * Throws if not initialized
 */
export function getRateLimiter(): RateLimiter {
  if (!rateLimiterInstance) {
    throw new Error(
      'RateLimiter not initialized. Call initializeRateLimiter() first.'
    );
  }
  return rateLimiterInstance;
}

/**
 * Checks if rate limiter is initialized
 */
export function isRateLimiterInitialized(): boolean {
  return rateLimiterInstance !== null;
}
