import { rabbitmqService } from './rabbitmq.service.js';
import { logger } from './logger.service.js';

/**
 * RabbitMQ Topology Configuration
 * 
 * This service sets up the complete RabbitMQ topology for the email mailing system:
 * 
 * - Exchange: 'mailings' (direct) - Main exchange for routing mailing jobs
 * - Queue: 'mailing.jobs.process' - Main processing queue
 * - Queue: 'mailing.jobs.retry.1' - First retry queue (60s TTL)
 * - Queue: 'mailing.jobs.retry.2' - Second retry queue (5min TTL)
 * - Queue: 'mailing.jobs.dlq' - Dead Letter Queue for failed jobs
 * 
 * Flow:
 * 1. Jobs are published to 'mailings' exchange with routing key 'mailing.jobs.process'
 * 2. If job fails, it's sent to 'mailing.jobs.retry.1' (60s delay)
 * 3. After TTL expires, message returns to 'mailing.jobs.process' via DLX
 * 4. If fails again, goes to 'mailing.jobs.retry.2' (5min delay)
 * 5. If still failing, goes to 'mailing.jobs.dlq' for manual inspection
 */
export class RabbitMQTopologyService {
  private readonly EXCHANGE = 'mailings';
  private readonly MAIN_QUEUE = 'mailing.jobs.process';
  private readonly RETRY_1_QUEUE = 'mailing.jobs.retry.1';
  private readonly RETRY_2_QUEUE = 'mailing.jobs.retry.2';
  private readonly DLQ = 'mailing.jobs.dlq';

  /**
   * Sets up the complete RabbitMQ topology
   */
  async setupTopology(): Promise<void> {
    try {
      logger.info('🔧 Setting up RabbitMQ topology...');

      // 1. Assert main exchange (direct type for specific routing)
      await rabbitmqService.assertExchange(this.EXCHANGE, 'direct');

      // 2. Assert Dead Letter Queue (no special args, final destination)
      await rabbitmqService.assertQueueWithArgs(this.DLQ);
      logger.info(`   ✅ DLQ '${this.DLQ}' created`);

      // 3. Assert Retry Queue 2 (5 minutes TTL)
      //    After TTL, messages return to main processing queue
      await rabbitmqService.assertQueueWithArgs(this.RETRY_2_QUEUE, {
        'x-message-ttl': 300000, // 5 minutes
        'x-dead-letter-exchange': this.EXCHANGE,
        'x-dead-letter-routing-key': this.MAIN_QUEUE,
      });
      logger.info(`   ✅ Retry queue 2 '${this.RETRY_2_QUEUE}' created (TTL: 5min)`);

      // 4. Assert Retry Queue 1 (60 seconds TTL)
      //    After TTL, messages return to main processing queue
      await rabbitmqService.assertQueueWithArgs(this.RETRY_1_QUEUE, {
        'x-message-ttl': 60000, // 60 seconds
        'x-dead-letter-exchange': this.EXCHANGE,
        'x-dead-letter-routing-key': this.MAIN_QUEUE,
      });
      logger.info(`   ✅ Retry queue 1 '${this.RETRY_1_QUEUE}' created (TTL: 60s)`);

      // 5. Assert Main Processing Queue (no TTL, durable)
      await rabbitmqService.assertQueueWithArgs(this.MAIN_QUEUE);
      
      // 6. Bind main queue to exchange
      await rabbitmqService.bindQueue(
        this.MAIN_QUEUE,
        this.EXCHANGE,
        this.MAIN_QUEUE
      );
      logger.info(`   ✅ Main queue '${this.MAIN_QUEUE}' created and bound`);

      logger.info('✅ RabbitMQ topology setup complete!');
      logger.info('');
      logger.info('📋 Topology Summary:');
      logger.info(`   Exchange: ${this.EXCHANGE} (direct)`);
      logger.info(`   ├─ ${this.MAIN_QUEUE} (main processing queue)`);
      logger.info(`   ├─ ${this.RETRY_1_QUEUE} (retry with 60s delay)`);
      logger.info(`   ├─ ${this.RETRY_2_QUEUE} (retry with 5min delay)`);
      logger.info(`   └─ ${this.DLQ} (dead letter queue)`);
      logger.info('');
    } catch (error) {
      logger.error(`❌ Failed to setup RabbitMQ topology: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Returns the queue names for use by other services
   */
  getQueueNames() {
    return {
      exchange: this.EXCHANGE,
      mainQueue: this.MAIN_QUEUE,
      retry1Queue: this.RETRY_1_QUEUE,
      retry2Queue: this.RETRY_2_QUEUE,
      dlq: this.DLQ,
    };
  }
}

// Export singleton instance
export const rabbitmqTopologyService = new RabbitMQTopologyService();
