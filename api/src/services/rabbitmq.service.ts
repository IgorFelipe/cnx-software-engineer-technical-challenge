import * as amqp from 'amqplib';
import type { ConfirmChannel } from 'amqplib';
import { logger } from './logger.service.js';

/**
 * RabbitMQ Service
 * Manages connection and channel to RabbitMQ broker
 */
export class RabbitMQService {
  private connection: amqp.Connection | null = null;
  private channel: ConfirmChannel | null = null;
  private readonly url: string;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(url?: string) {
    this.url = url ?? process.env.RABBITMQ_URL ?? 'amqp://rabbitmq:rabbitmq@localhost:5672';
  }

  /**
   * Connects to RabbitMQ and creates a confirm channel
   */
  async connect(): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('🛑 RabbitMQ is shutting down, not reconnecting');
      return;
    }

    try {
      logger.info(`🐰 Connecting to RabbitMQ: ${this.url}`);
      
      // Create connection
      const conn = await amqp.connect(this.url);
      this.connection = conn as unknown as amqp.Connection;
      
      // Setup connection event handlers
      conn.on('error', (err: Error) => {
        logger.error(`❌ RabbitMQ connection error: ${err.message}`);
        this.scheduleReconnect();
      });

      conn.on('close', () => {
        logger.warn('⚠️  RabbitMQ connection closed');
        if (!this.isShuttingDown) {
          this.scheduleReconnect();
        }
      });

      // Create confirm channel
      this.channel = await conn.createConfirmChannel();
      
      // Setup channel event handlers
      this.channel.on('error', (err: Error) => {
        logger.error(`❌ RabbitMQ channel error: ${err.message}`);
      });

      this.channel.on('close', () => {
        logger.warn('⚠️  RabbitMQ channel closed');
      });

      logger.info('✅ Connected to RabbitMQ with confirm channel');
    } catch (error) {
      logger.error(`❌ Failed to connect to RabbitMQ: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.scheduleReconnect();
      throw error;
    }
  }

  /**
   * Schedules a reconnection attempt after a delay
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout || this.isShuttingDown) {
      return;
    }

    const RECONNECT_DELAY = 5000; // 5 seconds
    logger.info(`🔄 Scheduling RabbitMQ reconnect in ${RECONNECT_DELAY}ms`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect().catch((err) => {
        logger.error(`❌ Reconnection failed: ${err.message}`);
      });
    }, RECONNECT_DELAY);
  }

  /**
   * Ensures the exchange exists
   */
  async assertExchange(exchange: string, type: string = 'topic'): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    await this.channel.assertExchange(exchange, type, {
      durable: true,
    });

    logger.info(`✅ Exchange '${exchange}' asserted (type: ${type})`);
  }

  /**
   * Ensures the queue exists with custom arguments
   */
  async assertQueueWithArgs(
    queue: string, 
    args?: {
      'x-message-ttl'?: number;
      'x-dead-letter-exchange'?: string;
      'x-dead-letter-routing-key'?: string;
      [key: string]: any;
    }
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    await this.channel.assertQueue(queue, {
      durable: true,
      arguments: args,
    });

    logger.info(`✅ Queue '${queue}' asserted${args ? ' with arguments' : ''}`);
  }

  /**
   * Ensures the queue exists and is bound to the exchange
   */
  async assertQueue(queue: string, exchange: string, routingKey: string): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    // Assert queue
    await this.channel.assertQueue(queue, {
      durable: true,
    });

    // Bind queue to exchange
    await this.channel.bindQueue(queue, exchange, routingKey);

    logger.info(`✅ Queue '${queue}' asserted and bound to '${exchange}' with routing key '${routingKey}'`);
  }

  /**
   * Binds a queue to an exchange with a routing key
   */
  async bindQueue(queue: string, exchange: string, routingKey: string): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    await this.channel.bindQueue(queue, exchange, routingKey);
    logger.info(`✅ Queue '${queue}' bound to '${exchange}' with routing key '${routingKey}'`);
  }

  /**
   * Publishes a message to an exchange with publisher confirms
   * @returns Promise that resolves when message is confirmed by broker
   */
  async publishWithConfirm(
    exchange: string,
    routingKey: string,
    message: any,
    options?: {
      messageId?: string;
      persistent?: boolean;
    }
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    const content = Buffer.from(JSON.stringify(message));
    const publishOptions = {
      messageId: options?.messageId,
      persistent: options?.persistent ?? true,
      contentType: 'application/json',
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      if (!this.channel) {
        return reject(new Error('Channel not initialized'));
      }

      this.channel.publish(
        exchange,
        routingKey,
        content,
        publishOptions,
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Checks if connected to RabbitMQ
   */
  isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }

  /**
   * Closes the connection to RabbitMQ
   */
  async close(): Promise<void> {
    this.isShuttingDown = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }

      if (this.connection) {
        // Cast to any to access close method
        await (this.connection as any).close();
        this.connection = null;
      }

      logger.info('✅ RabbitMQ connection closed gracefully');
    } catch (error) {
      logger.error(`❌ Error closing RabbitMQ connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const rabbitmqService = new RabbitMQService();
