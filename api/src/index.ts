import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config/env.js';
import { prisma } from './config/database.js';
import { mailingRoutes } from './routes/mailing.routes.js';
import { initializeTokenManager } from './services/token-manager.service.js';
import { initializeRateLimiter } from './services/rate-limiter.service.js';
import { crashRecoveryService } from './services/crash-recovery.service.js';
import { createGracefulShutdown } from './services/graceful-shutdown.service.js';
import { metrics } from './services/metrics.service.js';
import { logger } from './services/logger.service.js';
import { outboxPublisher } from './services/outbox-publisher.service.js';
import { workerConsumerService } from './services/worker-consumer.service.js';

// Track server state
let isAcceptingNewWork = true;

const fastify = Fastify({
  logger: config.nodeEnv === 'development' ? {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    }
  } : true
});

// Start server
const start = async () => {
  try {
    const isWorker = config.enableWorkerConsumer && !config.enableOutboxPublisher;
    const isApi = !config.enableWorkerConsumer && config.enableOutboxPublisher;
    
    console.log('⚙️  Starting application...');
    console.log(`   enableWorkerConsumer: ${config.enableWorkerConsumer}`);
    console.log(`   enableOutboxPublisher: ${config.enableOutboxPublisher}`);
    console.log(`   isWorker: ${isWorker}`);
    console.log(`   isApi: ${isApi}`);
    console.log(`   Mode: ${isWorker ? 'WORKER' : isApi ? 'API' : 'HYBRID'}`);
    console.log('');
    
    // Register plugins and routes only for API mode
    if (!isWorker) {
      console.log('⚙️  Configuring Fastify...\n');
      
      // 1. Register multipart plugin FIRST (needed by routes)
      console.log('📦 Registering multipart plugin...');
      await fastify.register(multipart, {
        limits: {
          fileSize: 100 * 1024 * 1024, // 100MB max file size
        },
      });
      console.log('✅ Multipart plugin registered\n');

      // 2. Register application routes BEFORE Swagger (so Swagger can document them)
      console.log('🛣️  Registering application routes...');
      await fastify.register(mailingRoutes);
      console.log('✅ Mailing routes registered\n');
    } else {
      // Worker mode: minimal Fastify setup (health check only)
      console.log('⚙️  Worker mode - minimal Fastify (health check only)...\n');
    }
    
    // 3. Register hooks and endpoints
    console.log('🔧 Registering hooks and endpoints...');
    
    // Metrics tracking middleware
    fastify.addHook('onRequest', async (request) => {
      (request as any).startTime = Date.now();
    });

    fastify.addHook('onResponse', async (request, reply) => {
      const duration = ((Date.now() - (request as any).startTime) / 1000);
      const route = request.routeOptions.url || request.url;
      
      metrics.recordApiRequest(
        request.method,
        route,
        reply.statusCode,
        duration
      );
    });

    // Add hook to reject new mailing requests during shutdown
    fastify.addHook('onRequest', async (request, reply) => {
      if (!isAcceptingNewWork && request.url.startsWith('/mailings') && request.method === 'POST') {
        reply.code(503).send({
          error: 'Service Unavailable',
          message: 'Server is shutting down. Not accepting new mailing requests.',
          statusCode: 503,
        });
      }
    });

    // Health check endpoint
    fastify.get('/health', {
      schema: {
        description: 'Health check endpoint - verifies database and token manager status',
        tags: ['Health'],
        response: {
          200: {
            description: 'Service is healthy',
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string', format: 'date-time' },
              database: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                  responseTime: { type: 'number' }
                }
              },
              tokenManager: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                  hasToken: { type: 'boolean' },
                  expiresAt: { type: 'string', format: 'date-time', nullable: true }
                }
              }
            }
          },
          503: {
            description: 'Service is degraded',
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string', format: 'date-time' },
              database: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                  responseTime: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }, async (_request, reply) => {
      const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: {
          status: 'unknown',
          responseTime: 0
        },
        tokenManager: {
          status: 'unknown',
          hasToken: false,
          expiresAt: null as string | null,
        }
      };

      try {
        const start = Date.now();
        // Simple query to test database connection
        await prisma.$queryRaw`SELECT 1`;
        const end = Date.now();
        
        health.database.status = 'connected';
        health.database.responseTime = end - start;
      } catch (error) {
        health.status = 'degraded';
        health.database.status = 'disconnected';
        fastify.log.error({ error }, 'Database health check failed');
      }

      // Check TokenManager status (only in Worker mode)
      if (isWorker) {
        try {
          const { getTokenManager } = await import('./services/token-manager.service.js');
          const manager = getTokenManager();
          const metricsData = manager.getMetrics();
          
          health.tokenManager.status = 'initialized';
          health.tokenManager.hasToken = metricsData.currentTokenExpiresAt !== null;
          health.tokenManager.expiresAt = metricsData.currentTokenExpiresAt 
            ? new Date(metricsData.currentTokenExpiresAt).toISOString() 
            : null;
        } catch (error) {
          health.status = 'degraded';
          health.tokenManager.status = 'not_initialized';
          fastify.log.error({ error }, 'TokenManager health check failed');
        }
      } else {
        // API mode doesn't need TokenManager
        health.tokenManager.status = 'not_applicable';
      }

      const statusCode = health.status === 'ok' ? 200 : 503;
      reply.code(statusCode);
      return health;
    });

    // Metrics endpoint
    fastify.get('/metrics', {
      schema: {
        description: 'Prometheus metrics endpoint - returns metrics in Prometheus text format',
        tags: ['Health'],
        response: {
          200: {
            description: 'Prometheus metrics',
            type: 'string'
          },
          500: {
            description: 'Failed to generate metrics',
            type: 'object',
            properties: {
              error: { type: 'string' }
            }
          }
        }
      }
    }, async (_request, reply) => {
      try {
        const metricsOutput = await metrics.getMetrics();
        reply.type('text/plain');
        return metricsOutput;
      } catch (error) {
        logger.error('Failed to generate metrics', { error });
        reply.code(500);
        return { error: 'Failed to generate metrics' };
      }
    });
    
    console.log('✅ Hooks and endpoints registered\n');

    // 4. NOW register Swagger/SwaggerUI LAST (after routes are registered) - API only
    if (!isWorker) {
      console.log('📘 Registering Swagger documentation...');
      await fastify.register(swagger, {
      openapi: {
        info: {
          title: 'Email Mailing Service API',
          description: 'REST API for batch email sending with rate limiting, retry logic, and crash recovery',
          version: '1.0.0',
          contact: {
            name: 'API Support',
            email: 'support@example.com'
          },
          license: {
            name: 'ISC',
            url: 'https://opensource.org/licenses/ISC'
          }
        },
        servers: [
          {
            url: 'http://localhost:3000',
            description: 'Development server'
          }
        ],
        tags: [
          { name: 'Mailing', description: 'Email mailing operations' },
          { name: 'Health', description: 'Health and monitoring endpoints' }
        ],
        components: {
          schemas: {
            Error: {
              type: 'object',
              properties: {
                error: { type: 'string' },
                message: { type: 'string' }
              }
            },
            MailingUploadResponse: {
              type: 'object',
              properties: {
                mailingId: { type: 'string', format: 'uuid' },
                message: { type: 'string' },
                status: { type: 'string', enum: ['RUNNING'] }
              }
            },
            MailingStatus: {
              type: 'object',
              properties: {
                mailingId: { type: 'string', format: 'uuid' },
                status: { type: 'string', enum: ['RUNNING', 'COMPLETED', 'FAILED', 'PAUSED'] },
                progress: {
                  type: 'object',
                  properties: {
                    totalRows: { type: 'number' },
                    processedRows: { type: 'number' },
                    percentage: { type: 'string' },
                    lastProcessedLine: { type: 'number' }
                  }
                },
                counts: {
                  type: 'object',
                  properties: {
                    total: { type: 'number' },
                    valid: { type: 'number' },
                    invalid: { type: 'number' },
                    pending: { type: 'number' },
                    sending: { type: 'number' },
                    sent: { type: 'number' },
                    failed: { type: 'number' }
                  }
                },
                timestamps: {
                  type: 'object',
                  properties: {
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' }
                  }
                }
              }
            },
            MailingEntry: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                email: { type: 'string', format: 'email' },
                status: { type: 'string', enum: ['PENDING', 'SENDING', 'SENT', 'FAILED', 'INVALID'] },
                attempts: { type: 'number' },
                lastAttempt: { type: 'string', format: 'date-time', nullable: true },
                externalId: { type: 'string', nullable: true },
                invalidReason: { type: 'string', nullable: true },
                validationDetails: { type: 'object', nullable: true },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' }
              }
            },
            MailingEntriesResponse: {
              type: 'object',
              properties: {
                mailingId: { type: 'string', format: 'uuid' },
                filters: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', nullable: true }
                  }
                },
                pagination: {
                  type: 'object',
                  properties: {
                    limit: { type: 'number' },
                    offset: { type: 'number' },
                    total: { type: 'number' },
                    hasMore: { type: 'boolean' }
                  }
                },
                entries: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/MailingEntry' }
                }
              }
            }
          }
        }
      }
    });
    
    // Register Swagger UI
    await fastify.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
        displayRequestDuration: true,
        filter: true
      },
      staticCSP: true,
      transformStaticCSP: (header: string) => header,
      transformSpecification: (swaggerObject: any) => {
        return swaggerObject;
      },
      transformSpecificationClone: true
    });
    console.log('✅ Swagger documentation registered\n');
    } else {
      console.log('⏭️  Skipping Swagger (Worker mode)\n');
    }
    
    // Log all registered routes for debugging
    if (!isWorker) {
      console.log('📋 Registered routes:');
      console.log(fastify.printRoutes({ commonPrefix: false }));
      console.log('');
    }

    // Run crash recovery on boot (Worker only - API doesn't process jobs)
    if (isWorker) {
      console.log('🔄 Running crash recovery check...');
      await crashRecoveryService.recoverOnBoot();
      console.log('✅ Crash recovery complete\n');
    }

    // Initialize TokenManager (Worker only - required for email sending)
    if (isWorker) {
      console.log('🔐 Initializing TokenManager...');
      initializeTokenManager({
        authUrl: config.authApiUrl,
        username: config.authUsername,
        password: config.authPassword,
        renewalWindowMs: 5 * 60 * 1000, // 5 minutes before expiry
      });
      console.log('✅ TokenManager initialized');
    }

    // Initialize RateLimiter (Worker only - required for email rate limiting)
    let rateLimiter: any = null;
    if (isWorker) {
      console.log('⏱️  Initializing RateLimiter...');
      initializeRateLimiter({
        rateLimitPerMinute: config.rateLimitPerMinute,
        workerConcurrency: config.workerConcurrency,
      });
      const { getRateLimiter } = await import('./services/rate-limiter.service.js');
      rateLimiter = getRateLimiter();
      console.log('✅ RateLimiter initialized\n');
    }

    // Start Outbox Publisher (background service for reliable message publishing)
    if (config.enableOutboxPublisher) {
      console.log('📬 Starting Outbox Publisher...');
      await outboxPublisher.start();
      console.log('✅ Outbox Publisher started\n');
    } else {
      console.log('⏭️  Outbox Publisher DISABLED by feature flag\n');
    }

    // Start Worker Consumer (processes mailing jobs from RabbitMQ)
    if (config.enableWorkerConsumer) {
      console.log('👷 Starting Worker Consumer...');
      await workerConsumerService.start();
      console.log('✅ Worker Consumer started\n');
    } else {
      console.log('⏭️  Worker Consumer DISABLED by feature flag\n');
    }

    // Setup graceful shutdown
    const gracefulShutdown = createGracefulShutdown({
      timeout: config.shutdownTimeoutMs,
      forceTimeout: config.forceShutdownTimeoutMs,
      
      onShutdownStart: async () => {
        console.log('🛑 Stopping acceptance of new mailing requests...');
        isAcceptingNewWork = false;

        // Stop Worker Consumer first (stop consuming new jobs)
        if (config.enableWorkerConsumer) {
          console.log('👷 Stopping Worker Consumer...');
          await workerConsumerService.stop();
        }

        // Stop Outbox Publisher
        if (config.enableOutboxPublisher) {
          console.log('📪 Stopping Outbox Publisher...');
          await outboxPublisher.stop();
        }
        
        // Stop Fastify from accepting new connections
        await fastify.close();
      },
      
      onWaitForQueue: async () => {
        if (rateLimiter) {
          console.log('⏳ Waiting for rate limiter queue to drain...');
          await rateLimiter.waitForIdle();
          console.log('✅ Rate limiter queue is idle');
        }
      },
      
      onPersistState: async () => {
        console.log('💾 Persisting checkpoint state...');
        // Note: Checkpoints are automatically saved during processing
        // No additional action needed here
        console.log('✅ All checkpoints persisted');
      },
      
      onBeforeExit: async () => {
        console.log('🧹 Final cleanup...');
        // Any additional cleanup logic
      },
    });

    // Register signal handlers
    gracefulShutdown.registerHandlers();
    
    // Force shutdown timeout is now setup ONLY when shutdown is triggered
    // gracefulShutdown.setupForceShutdownTimeout(config.forceShutdownTimeoutMs);

    // Ensure all plugins are ready before listening
    console.log('⏳ Waiting for Fastify to be ready...');
    await fastify.ready();
    console.log('✅ Fastify is ready\n');

    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`✅ Server running on port ${config.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

export default fastify;
