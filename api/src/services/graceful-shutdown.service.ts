/**
 * Graceful Shutdown Service
 * 
 * Handles application shutdown gracefully:
 * - Captures SIGTERM and SIGINT signals
 * - Stops accepting new work
 * - Waits for queue to drain with timeout
 * - Persists current state
 * - Closes database connections
 */

import { prisma } from '../config/database.js';

export interface ShutdownConfig {
  /** Timeout in milliseconds to wait for queue to drain */
  timeout: number;
  /** Force shutdown timeout in milliseconds (safety net) */
  forceTimeout: number;
  /** Callback to stop accepting new work */
  onShutdownStart?: () => void | Promise<void>;
  /** Callback to wait for queue to drain */
  onWaitForQueue?: () => Promise<void>;
  /** Callback to persist current state */
  onPersistState?: () => Promise<void>;
  /** Callback before final exit */
  onBeforeExit?: () => void | Promise<void>;
}

export class GracefulShutdownService {
  private isShuttingDown = false;
  private shutdownConfig: ShutdownConfig;
  private shutdownTimeout?: NodeJS.Timeout;
  private forceShutdownTimeout?: NodeJS.Timeout;

  constructor(config: ShutdownConfig) {
    this.shutdownConfig = config;
  }

  /**
   * Registers signal handlers for graceful shutdown
   */
  registerHandlers(): void {
    console.log('📡 Registering graceful shutdown handlers...');
    
    // Handle SIGTERM (e.g., Kubernetes pod termination, docker stop)
    process.on('SIGTERM', () => {
      console.log('\n🛑 SIGTERM received');
      this.handleShutdown('SIGTERM');
    });

    // Handle SIGINT (e.g., Ctrl+C in terminal)
    process.on('SIGINT', () => {
      console.log('\n🛑 SIGINT received');
      this.handleShutdown('SIGINT');
    });

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      this.handleShutdown('UNCAUGHT_EXCEPTION', 1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      this.handleShutdown('UNHANDLED_REJECTION', 1);
    });

    console.log('✅ Shutdown handlers registered');
  }

  /**
   * Handles graceful shutdown process
   */
  private async handleShutdown(signal: string, exitCode = 0): Promise<void> {
    // Prevent multiple shutdown attempts
    if (this.isShuttingDown) {
      console.log('⚠️  Shutdown already in progress...');
      return;
    }

    this.isShuttingDown = true;

    // NOW setup force shutdown timeout as safety net
    this.setupForceShutdownTimeout(this.shutdownConfig.forceTimeout);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🛑 Graceful Shutdown Initiated (${signal})`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const startTime = Date.now();

    try {
      // Step 1: Stop accepting new work
      console.log('📥 Step 1: Stopping acceptance of new work...');
      if (this.shutdownConfig.onShutdownStart) {
        await this.shutdownConfig.onShutdownStart();
      }
      console.log('✅ No longer accepting new work\n');

      // Step 2: Wait for queue to drain with timeout
      console.log(`⏳ Step 2: Waiting for queue to drain (timeout: ${this.formatDuration(this.shutdownConfig.timeout)})...`);
      
      const queueDrained = await this.waitWithTimeout(
        this.shutdownConfig.onWaitForQueue,
        this.shutdownConfig.timeout
      );

      if (queueDrained) {
        console.log('✅ Queue drained successfully\n');
      } else {
        console.log(`⚠️  Queue drain timeout (${this.formatDuration(this.shutdownConfig.timeout)}) expired`);
        console.log('⚠️  Proceeding with shutdown (some work may be interrupted)\n');
      }

      // Step 3: Persist current state
      console.log('💾 Step 3: Persisting current state...');
      if (this.shutdownConfig.onPersistState) {
        await this.shutdownConfig.onPersistState();
      }
      console.log('✅ State persisted\n');

      // Step 4: Close database connections
      console.log('🔌 Step 4: Closing database connections...');
      await prisma.$disconnect();
      console.log('✅ Database disconnected\n');

      // Step 5: Final cleanup
      console.log('🧹 Step 5: Final cleanup...');
      if (this.shutdownConfig.onBeforeExit) {
        await this.shutdownConfig.onBeforeExit();
      }
      console.log('✅ Cleanup complete\n');

      // Calculate shutdown duration
      const duration = Date.now() - startTime;
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`✅ Graceful shutdown complete (${this.formatDuration(duration)})`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      // Clear any pending timeouts
      if (this.shutdownTimeout) {
        clearTimeout(this.shutdownTimeout);
      }
      if (this.forceShutdownTimeout) {
        clearTimeout(this.forceShutdownTimeout);
      }

      // Exit process
      process.exit(exitCode);

    } catch (error) {
      console.error('\n❌ Error during graceful shutdown:', error);
      console.error('⚠️  Forcing shutdown...\n');

      // Attempt to close database even on error
      try {
        await prisma.$disconnect();
      } catch (dbError) {
        console.error('❌ Failed to disconnect database:', dbError);
      }

      process.exit(1);
    }
  }

  /**
   * Waits for a promise with timeout
   */
  private async waitWithTimeout(
    callback?: () => Promise<void>,
    timeoutMs: number = 30000
  ): Promise<boolean> {
    if (!callback) {
      return true;
    }

    return new Promise((resolve) => {
      let completed = false;

      // Set timeout
      this.shutdownTimeout = setTimeout(() => {
        if (!completed) {
          completed = true;
          resolve(false); // Timeout expired
        }
      }, timeoutMs);

      // Execute callback
      callback()
        .then(() => {
          if (!completed) {
            completed = true;
            if (this.shutdownTimeout) {
              clearTimeout(this.shutdownTimeout);
            }
            resolve(true); // Completed successfully
          }
        })
        .catch((error) => {
          console.error('❌ Error waiting for queue:', error);
          if (!completed) {
            completed = true;
            if (this.shutdownTimeout) {
              clearTimeout(this.shutdownTimeout);
            }
            resolve(false); // Error occurred
          }
        });
    });
  }

  /**
   * Sets up force shutdown timeout
   * If graceful shutdown takes too long, force exit
   */
  setupForceShutdownTimeout(timeoutMs: number = 60000): void {
    console.log(`⚠️  Force shutdown timeout set: ${this.formatDuration(timeoutMs)}`);
    
    this.forceShutdownTimeout = setTimeout(() => {
      console.error('\n❌ Force shutdown timeout expired');
      console.error('⚠️  Forcing immediate exit...\n');
      process.exit(1);
    }, timeoutMs);
  }

  /**
   * Checks if shutdown is in progress
   */
  isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Formats duration in milliseconds to human-readable string
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);

    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

/**
 * Creates a graceful shutdown service with default configuration
 */
export function createGracefulShutdown(customConfig?: Partial<ShutdownConfig>): GracefulShutdownService {
  const defaultConfig: ShutdownConfig = {
    timeout: 30000, // 30 seconds default
    forceTimeout: 60000, // 60 seconds default
    ...customConfig,
  };

  return new GracefulShutdownService(defaultConfig);
}
