/**
 * Prometheus Metrics Service
 * 
 * Exposes application metrics for monitoring and alerting.
 * 
 * Metrics:
 * - mailing_emails_total{status}: Total emails by status
 * - mailing_api_requests_total{status_code}: Total API requests by status code
 * - mailing_retries_total: Total retry attempts
 * - mailing_duration_seconds: Email sending duration histogram
 * - token_renewals_total: Total token renewals
 * - mailing_queue_size: Current queue size
 * - mailing_active_workers: Active workers
 */

import { Registry, Counter, Histogram, Gauge } from 'prom-client';

/**
 * Prometheus Metrics Registry
 */
export class MetricsService {
  private registry: Registry;

  // Counters
  public emailsTotal: Counter<'status'>;
  public apiRequestsTotal: Counter<'status_code' | 'method' | 'route'>;
  public retriesTotal: Counter<'reason'>;
  public tokenRenewalsTotal: Counter<'status'>;
  public crashRecoveriesTotal: Counter<'type'>;

  // Histograms
  public emailDuration: Histogram<'status'>;
  public apiDuration: Histogram<'method' | 'route' | 'status_code'>;
  public csvProcessingDuration: Histogram<'status'>;

  // Gauges
  public queueSize: Gauge<'status'>;
  public activeWorkers: Gauge;
  public mailingProgress: Gauge<'mailingId'>;

  constructor() {
    this.registry = new Registry();

    // Set default labels
    this.registry.setDefaultLabels({
      app: 'email-mailing-api',
    });

    // Counter: Total emails by status
    this.emailsTotal = new Counter({
      name: 'mailing_emails_total',
      help: 'Total number of emails processed by status',
      labelNames: ['status'] as const,
      registers: [this.registry],
    });

    // Counter: Total API requests by status code
    this.apiRequestsTotal = new Counter({
      name: 'mailing_api_requests_total',
      help: 'Total number of API requests by status code',
      labelNames: ['status_code', 'method', 'route'] as const,
      registers: [this.registry],
    });

    // Counter: Total retries
    this.retriesTotal = new Counter({
      name: 'mailing_retries_total',
      help: 'Total number of retry attempts',
      labelNames: ['reason'] as const,
      registers: [this.registry],
    });

    // Counter: Total token renewals
    this.tokenRenewalsTotal = new Counter({
      name: 'token_renewals_total',
      help: 'Total number of token renewals',
      labelNames: ['status'] as const,
      registers: [this.registry],
    });

    // Counter: Total crash recoveries
    this.crashRecoveriesTotal = new Counter({
      name: 'mailing_crash_recoveries_total',
      help: 'Total number of crash recoveries',
      labelNames: ['type'] as const,
      registers: [this.registry],
    });

    // Histogram: Email sending duration
    this.emailDuration = new Histogram({
      name: 'mailing_duration_seconds',
      help: 'Email sending duration in seconds',
      labelNames: ['status'] as const,
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60], // seconds
      registers: [this.registry],
    });

    // Histogram: API request duration
    this.apiDuration = new Histogram({
      name: 'mailing_api_duration_seconds',
      help: 'API request duration in seconds',
      labelNames: ['method', 'route', 'status_code'] as const,
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5], // seconds
      registers: [this.registry],
    });

    // Histogram: CSV processing duration
    this.csvProcessingDuration = new Histogram({
      name: 'mailing_csv_processing_duration_seconds',
      help: 'CSV processing duration in seconds',
      labelNames: ['status'] as const,
      buckets: [1, 5, 10, 30, 60, 120, 300, 600], // seconds
      registers: [this.registry],
    });

    // Gauge: Current queue size
    this.queueSize = new Gauge({
      name: 'mailing_queue_size',
      help: 'Current number of emails in queue by status',
      labelNames: ['status'] as const,
      registers: [this.registry],
    });

    // Gauge: Active workers
    this.activeWorkers = new Gauge({
      name: 'mailing_active_workers',
      help: 'Number of active workers',
      registers: [this.registry],
    });

    // Gauge: Mailing progress
    this.mailingProgress = new Gauge({
      name: 'mailing_progress_percentage',
      help: 'Progress percentage of ongoing mailings',
      labelNames: ['mailingId'] as const,
      registers: [this.registry],
    });
  }

  /**
   * Records email validation
   */
  recordEmailValidation(valid: boolean) {
    this.emailsTotal.inc({ status: valid ? 'VALID' : 'INVALID' });
  }

  /**
   * Records email sending attempt
   */
  recordEmailSending() {
    this.emailsTotal.inc({ status: 'SENDING' });
  }

  /**
   * Records successful email send
   */
  recordEmailSent(durationSeconds: number) {
    this.emailsTotal.inc({ status: 'SENT' });
    this.emailDuration.observe({ status: 'SENT' }, durationSeconds);
  }

  /**
   * Records failed email (will retry)
   */
  recordEmailFailed(reason: string, durationSeconds: number) {
    this.emailsTotal.inc({ status: 'FAILED' });
    this.emailDuration.observe({ status: 'FAILED' }, durationSeconds);
    this.retriesTotal.inc({ reason });
  }

  /**
   * Records dead letter (permanent failure)
   */
  recordEmailDeadLetter() {
    this.emailsTotal.inc({ status: 'DEAD_LETTER' });
  }

  /**
   * Records API request
   */
  recordApiRequest(method: string, route: string, statusCode: number, durationSeconds: number) {
    this.apiRequestsTotal.inc({ 
      method, 
      route, 
      status_code: statusCode.toString() 
    });
    this.apiDuration.observe({ 
      method, 
      route, 
      status_code: statusCode.toString() 
    }, durationSeconds);
  }

  /**
   * Records token renewal
   */
  recordTokenRenewal(success: boolean) {
    this.tokenRenewalsTotal.inc({ status: success ? 'SUCCESS' : 'FAILED' });
  }

  /**
   * Records crash recovery
   */
  recordCrashRecovery(type: 'job' | 'mailing', count: number) {
    this.crashRecoveriesTotal.inc({ type }, count);
  }

  /**
   * Updates queue size gauge
   */
  updateQueueSize(status: string, size: number) {
    this.queueSize.set({ status }, size);
  }

  /**
   * Updates active workers gauge
   */
  updateActiveWorkers(count: number) {
    this.activeWorkers.set(count);
  }

  /**
   * Updates mailing progress
   */
  updateMailingProgress(mailingId: string, percentage: number) {
    this.mailingProgress.set({ mailingId }, percentage);
  }

  /**
   * Records CSV processing duration
   */
  recordCsvProcessing(status: string, durationSeconds: number) {
    this.csvProcessingDuration.observe({ status }, durationSeconds);
  }

  /**
   * Gets metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Gets registry for custom metrics
   */
  getRegistry(): Registry {
    return this.registry;
  }

  /**
   * Resets all metrics (for testing)
   */
  reset() {
    this.registry.resetMetrics();
  }
}

/**
 * Global metrics instance
 */
export const metrics = new MetricsService();
