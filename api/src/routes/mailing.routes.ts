import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { mailingProgressRepository } from '../repositories/mailing-progress.repository.js';
import { mailingEntryRepository } from '../repositories/mailing-entry.repository.js';
import { logger } from '../services/logger.service.js';
import { metrics } from '../services/metrics.service.js';
import { storageService } from '../services/storage.service.js';
import { outboxService } from '../services/outbox.service.js';

export async function mailingRoutes(fastify: FastifyInstance) {
  // POST /mailings - Upload and process CSV file
  fastify.post('/mailings', {
    schema: {
      description: 'Upload a CSV file to start a new mailing job',
      tags: ['Mailing'],
      consumes: ['multipart/form-data'],
      response: {
        202: {
          description: 'CSV file accepted for processing',
          type: 'object',
          properties: {
            mailingId: { type: 'string', format: 'uuid' },
            message: { type: 'string' },
            status: { type: 'string' }
          }
        },
        400: {
          description: 'Bad request - no file or invalid file type',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        500: {
          description: 'Internal server error',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      // Get uploaded file
      const data = await request.file();

      if (!data) {
        return reply.code(400).send({
          error: 'No file uploaded',
          message: 'Please upload a CSV file',
        });
      }

      // Validate file type
      const filename = data.filename.toLowerCase();
      if (!filename.endsWith('.csv')) {
        return reply.code(400).send({
          error: 'Invalid file type',
          message: 'Only CSV files are allowed',
        });
      }

      // Check if mailing with this filename already exists
      const exists = await outboxService.mailingExists(data.filename);
      if (exists) {
        return reply.code(400).send({
          error: 'Duplicate file',
          message: `A mailing with filename "${data.filename}" already exists`,
        });
      }

      // Generate mailing ID
      const mailingId = randomUUID();

      // Get file buffer
      const buffer = await data.toBuffer();

      fastify.log.info(`📤 File uploaded: ${data.filename} (${buffer.length} bytes)`);
      fastify.log.info(`📨 Creating mailing: ${mailingId}`);

      // Save CSV to storage (local filesystem for now)
      const storageUrl = await storageService.saveCsvFile(
        mailingId,
        buffer,
        data.filename
      );

      fastify.log.info(`💾 File saved to storage: ${storageUrl}`);

      // Create mailing + outbox message in a transaction
      // This ensures atomicity - either both succeed or both fail
      const result = await outboxService.createMailingWithOutbox({
        mailingId,
        filename: data.filename,
        storageUrl,
        totalLines: undefined, // Will be calculated during processing
        targetQueue: 'mailing.jobs.process', // Target queue for processing
      });

      fastify.log.info(`✅ Mailing created with outbox: ${result.mailingId}`);
      fastify.log.info(`📬 Outbox message created: ${result.outboxMessageId} (unpublished)`);

      // Log structured event
      logger.mailingUploaded({
        mailingId: result.mailingId,
        filename: data.filename,
        totalRows: 0, // Will be updated during processing
      });

      // Record metrics
      const duration = (Date.now() - startTime) / 1000;
      metrics.recordCsvProcessing('ACCEPTED', duration);

      // Return 202 Accepted with mailing ID
      // The file is saved and queued, but not yet processed
      return reply.code(202).send({
        mailingId: result.mailingId,
        message: 'CSV file accepted and queued for processing',
        status: 'PENDING',
      });
    } catch (error) {
      fastify.log.error({ error }, '❌ Upload error');
      
      const duration = (Date.now() - startTime) / 1000;
      metrics.recordCsvProcessing('FAILED', duration);

      return reply.code(500).send({
        error: 'Upload failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /mailings/:id/status - Get mailing status and progress
  fastify.get<{ Params: { id: string } }>(
    '/mailings/:id/status',
    {
      schema: {
        description: 'Get the status and progress of a mailing job',
        tags: ['Mailing'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Mailing ID' }
          },
          required: ['id']
        },
        response: {
          200: {
            description: 'Mailing status retrieved successfully',
            type: 'object',
            properties: {
              mailingId: { type: 'string' },
              status: { type: 'string' },
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
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' }
                }
              }
            }
          },
          404: {
            description: 'Mailing not found',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' }
            }
          },
          500: {
            description: 'Internal server error',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params;

        const progress = await mailingProgressRepository.findByMailingId(id);

        if (!progress) {
          return reply.code(404).send({
            error: 'Mailing not found',
            message: `No mailing found with ID: ${id}`,
          });
        }

        // Get entry counts by status
        const statusCounts = await mailingEntryRepository.countByStatus(id);

        // Calculate progress percentage
        const progressPercentage = progress.totalRows > 0
          ? ((progress.processedRows / progress.totalRows) * 100).toFixed(2)
          : '0.00';

        // Calculate totals
        const totalValid = (statusCounts.PENDING || 0) + 
                          (statusCounts.SENDING || 0) + 
                          (statusCounts.SENT || 0) + 
                          (statusCounts.FAILED || 0);
        const totalInvalid = statusCounts.INVALID || 0;
        const total = totalValid + totalInvalid;

        return {
          mailingId: progress.mailingId,
          status: progress.status,
          progress: {
            totalRows: progress.totalRows,
            processedRows: progress.processedRows,
            percentage: progressPercentage,
            lastProcessedLine: progress.lastProcessedLine,
          },
          counts: {
            total,
            valid: totalValid,
            invalid: totalInvalid,
            pending: statusCounts.PENDING || 0,
            sending: statusCounts.SENDING || 0,
            sent: statusCounts.SENT || 0,
            failed: statusCounts.FAILED || 0,
          },
          timestamps: {
            createdAt: progress.createdAt,
            updatedAt: progress.updatedAt,
          },
        };
      } catch (error) {
        fastify.log.error({ error }, 'Get mailing status error');
        return reply.code(500).send({
          error: 'Failed to get mailing status',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // GET /mailings/:id - Get mailing progress (deprecated, use /mailings/:id/status)
  fastify.get<{ Params: { mailingId: string } }>(
    '/mailing/:mailingId',
    async (request, reply) => {
      try {
        const { mailingId } = request.params;

        const progress = await mailingProgressRepository.findByMailingId(mailingId);

        if (!progress) {
          return reply.code(404).send({
            error: 'Mailing not found',
            message: `No mailing found with ID: ${mailingId}`,
          });
        }

        // Get entry counts
        const statusCounts = await mailingEntryRepository.countByStatus(mailingId);

        return {
          mailingId: progress.mailingId,
          status: progress.status,
          totalRows: progress.totalRows,
          processedRows: progress.processedRows,
          lastProcessedLine: progress.lastProcessedLine,
          entryCounts: statusCounts,
        };
      } catch (error) {
        fastify.log.error({ error }, 'Get mailing error');
        return reply.code(500).send({
          error: 'Failed to get mailing',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // GET /mailings/:id/entries - Get mailing entries (optionally filtered by status)
  fastify.get<{ 
    Params: { id: string };
    Querystring: { status?: string; limit?: string; offset?: string };
  }>(
    '/mailings/:id/entries',
    {
      schema: {
        description: 'Get individual email entries for a mailing, optionally filtered by status',
        tags: ['Mailing'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Mailing ID' }
          },
          required: ['id']
        },
        querystring: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['PENDING', 'SENDING', 'SENT', 'FAILED', 'INVALID'],
              description: 'Filter by email status'
            },
            limit: {
              type: 'number',
              minimum: 1,
              maximum: 1000,
              default: 100,
              description: 'Number of entries to return'
            },
            offset: {
              type: 'number',
              minimum: 0,
              default: 0,
              description: 'Number of entries to skip'
            }
          }
        },
        response: {
          200: {
            description: 'Mailing entries retrieved successfully',
            type: 'object',
            properties: {
              mailingId: { type: 'string' },
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
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    email: { type: 'string' },
                    status: { type: 'string' },
                    attempts: { type: 'number' },
                    lastAttempt: { type: 'string', nullable: true },
                    externalId: { type: 'string', nullable: true },
                    invalidReason: { type: 'string', nullable: true },
                    validationDetails: { type: 'object', nullable: true },
                    createdAt: { type: 'string' },
                    updatedAt: { type: 'string' }
                  }
                }
              }
            }
          },
          400: {
            description: 'Bad request - invalid status or pagination parameters',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' }
            }
          },
          404: {
            description: 'Mailing not found',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' }
            }
          },
          500: {
            description: 'Internal server error',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { status, limit, offset } = request.query;

        // Validate mailing exists
        const progress = await mailingProgressRepository.findByMailingId(id);
        if (!progress) {
          return reply.code(404).send({
            error: 'Mailing not found',
            message: `No mailing found with ID: ${id}`,
          });
        }

        // Validate status filter
        const validStatuses = ['PENDING', 'SENDING', 'SENT', 'FAILED', 'INVALID'];
        if (status && !validStatuses.includes(status.toUpperCase())) {
          return reply.code(400).send({
            error: 'Invalid status',
            message: `Status must be one of: ${validStatuses.join(', ')}`,
          });
        }

        // Parse pagination
        const parsedLimit = limit ? parseInt(limit, 10) : 100;
        const parsedOffset = offset ? parseInt(offset, 10) : 0;

        if (parsedLimit < 1 || parsedLimit > 1000) {
          return reply.code(400).send({
            error: 'Invalid limit',
            message: 'Limit must be between 1 and 1000',
          });
        }

        if (parsedOffset < 0) {
          return reply.code(400).send({
            error: 'Invalid offset',
            message: 'Offset must be >= 0',
          });
        }

        // Get entries
        const entries = status
          ? await mailingEntryRepository.findByStatus(id, status.toUpperCase(), parsedLimit, parsedOffset)
          : await mailingEntryRepository.findByMailingId(id, parsedLimit, parsedOffset);

        // Get total count
        const statusCounts = await mailingEntryRepository.countByStatus(id);
        const totalCount = status
          ? statusCounts[status.toUpperCase()] || 0
          : await mailingEntryRepository.count(id);

        return {
          mailingId: id,
          filters: {
            status: status?.toUpperCase() || null,
          },
          pagination: {
            limit: parsedLimit,
            offset: parsedOffset,
            total: totalCount,
            hasMore: parsedOffset + entries.length < totalCount,
          },
          entries: entries.map((entry: any) => ({
            id: entry.id,
            email: entry.email,
            status: entry.status,
            attempts: entry.attempts,
            lastAttempt: entry.lastAttempt,
            externalId: entry.externalId,
            invalidReason: entry.invalidReason,
            validationDetails: entry.validationDetails,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
          })),
        };
      } catch (error) {
        fastify.log.error({ error }, 'Get mailing entries error');
        return reply.code(500).send({
          error: 'Failed to get mailing entries',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // POST /mailing/:mailingId/resume - Resume failed mailing
  fastify.post<{ Params: { mailingId: string } }>(
    '/mailing/:mailingId/resume',
    async (_request, reply) => {
      return reply.code(501).send({
        error: 'Not implemented',
        message: 'Resume functionality requires original CSV file storage',
      });
    }
  );
}
