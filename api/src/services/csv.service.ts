import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { detectEncoding } from './encoding.service.js';
import { emailValidationService } from './email-validation.service.js';
import { mailingEntryRepository } from '../repositories/mailing-entry.repository.js';
import { mailingProgressRepository } from '../repositories/mailing-progress.repository.js';
import { config } from '../config/config.js';
import type {
  CsvProcessingOptions,
  CsvProcessingResult,
  EmailRecord,
  BatchInsertResult,
} from '../types/csv.types.js';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_CHECKPOINT_INTERVAL = 1000;
const DEFAULT_EMAIL_COLUMN = 'email';

/**
 * Validates and normalizes email address with layered validation
 * @param email - Email to validate
 * @returns Object with normalized email and validation result
 */
export async function validateAndNormalizeEmail(
  email: string | undefined | null
): Promise<{
  email: string | null;
  isValid: boolean;
  invalidReason?: string;
  validationDetails?: string;
}> {
  if (!email || typeof email !== 'string') {
    return {
      email: null,
      isValid: false,
      invalidReason: 'syntax',
      validationDetails: 'Email is empty or not a string',
    };
  }

  // Normalize email first
  const normalized = emailValidationService.normalizeEmail(email);

  // Validate with configured options
  const validationResult = await emailValidationService.validateEmail(normalized, {
    enableMxCheck: config.emailValidation.enableMxCheck,
    enableDisposableCheck: config.emailValidation.enableDisposableCheck,
  });

  if (!validationResult.isValid) {
    return {
      email: normalized,
      isValid: false,
      invalidReason: validationResult.reason,
      validationDetails: validationResult.details,
    };
  }

  return {
    email: normalized,
    isValid: true,
  };
}

/**
 * Extracts email from CSV record based on options
 * @param record - CSV record (array or object)
 * @param options - Processing options
 * @returns Email string or null
 */
function extractEmail(record: any, options: CsvProcessingOptions): string | null {
  if (Array.isArray(record)) {
    // Array format - use column index
    const index = options.emailColumnIndex ?? 0;
    return record[index] ?? null;
  } else {
    // Object format - use column name
    const columnName = options.emailColumnName ?? DEFAULT_EMAIL_COLUMN;
    return record[columnName] ?? null;
  }
}

/**
 * Inserts a batch of email records into the database
 * @param mailingId - Mailing ID
 * @param records - Email records to insert
 * @returns Insert result statistics
 */
async function insertBatch(
  mailingId: string,
  records: EmailRecord[]
): Promise<BatchInsertResult> {
  const result: BatchInsertResult = {
    inserted: 0,
    duplicates: 0,
    errors: 0,
  };

  // Separate valid and invalid emails
  const validRecords = records.filter((r) => !r.invalidReason);
  const invalidRecords = records.filter((r) => r.invalidReason);

  // Insert valid emails
  if (validRecords.length > 0) {
    const data = validRecords.map((record) => ({
      id: randomUUID(),
      mailingId,
      email: record.email,
      token: randomUUID(), // Generate unique token for each email
      status: 'PENDING',
      attempts: 0,
    }));

    try {
      const count = await mailingEntryRepository.createMany(data, true);
      result.inserted = count;
      result.duplicates = validRecords.length - count;
    } catch (error) {
      console.error('Batch insert error:', error);
      result.errors = validRecords.length;
    }
  }

  // Insert invalid emails with INVALID status
  if (invalidRecords.length > 0) {
    const invalidData = invalidRecords.map((record) => ({
      id: randomUUID(),
      mailingId,
      email: record.email,
      token: randomUUID(),
      status: 'INVALID',
      attempts: 0,
      invalidReason: record.invalidReason,
      validationDetails: record.validationDetails,
    }));

    try {
      await mailingEntryRepository.createMany(invalidData, true);
    } catch (error) {
      console.error('Invalid emails batch insert error:', error);
    }
  }

  return result;
}

/**
 * Updates mailing progress in the database
 * @param mailingId - Mailing ID
 * @param processedRows - Number of processed rows
 * @param lastProcessedLine - Last processed line number
 * @param totalRows - Total number of rows (optional)
 */
async function updateProgress(
  mailingId: string,
  processedRows: number,
  lastProcessedLine: number,
  totalRows?: number
): Promise<void> {
  await mailingProgressRepository.updateProgress(
    mailingId,
    processedRows,
    lastProcessedLine,
    totalRows
  );
}

/**
 * Marks mailing as completed in the database
 * @param mailingId - Mailing ID
 * @param totalRows - Total number of rows
 * @param status - Final status
 */
async function completeProgress(
  mailingId: string,
  totalRows: number,
  status: 'COMPLETED' | 'FAILED'
): Promise<void> {
  await mailingProgressRepository.complete(mailingId, totalRows, status);
}

/**
 * Processes a CSV file with streaming and batch insertion
 * @param filePath - Path to CSV file
 * @param options - Processing options
 * @returns Processing result
 */
export async function processCsvFile(
  filePath: string,
  options: CsvProcessingOptions
): Promise<CsvProcessingResult> {
  // Check for existing progress to enable resume
  const existingProgress = await mailingProgressRepository.findByMailingId(options.mailingId);
  const skipLines = existingProgress?.lastProcessedLine ?? 0;
  
  if (skipLines > 0) {
    console.log(`♻️  Resuming from line ${skipLines + 1} (skipping ${skipLines} already processed lines)`);
  }

  const result: CsvProcessingResult = {
    mailingId: options.mailingId,
    totalRows: existingProgress?.totalRows ?? 0,
    processedRows: existingProgress?.processedRows ?? 0,
    duplicatesSkipped: 0,
    invalidEmails: 0,
    errors: [],
    status: 'COMPLETED',
  };

  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const checkpointInterval = options.checkpointInterval ?? DEFAULT_CHECKPOINT_INTERVAL;

  let currentBatch: EmailRecord[] = [];
  let lineNumber = 0;
  let validEmailCount = existingProgress?.processedRows ?? 0;

  try {
    // Read first chunk to detect encoding
    const firstChunk = await readFile(filePath, { encoding: null });
    const { encoding, hasBom } = detectEncoding(firstChunk.slice(0, 4096));

    console.log(`📊 Detected encoding: ${encoding}, BOM: ${hasBom}`);

    // Process file with detected encoding
    const fileStream = createReadStream(filePath, {
      encoding: encoding === 'iso-8859-1' ? 'latin1' : 'utf8',
    });

    const parser = parse({
      columns: options.hasHeader ?? true,
      skip_empty_lines: true,
      trim: true,
      delimiter: options.delimiter ?? ',',
      relax_column_count: true,
      cast: false,
      bom: true, // Automatically handle BOM
    });

    // Create processing pipeline
    await new Promise<void>((resolve, reject) => {
      fileStream
        .pipe(parser)
        .on('data', async (record: any) => {
          parser.pause();

          try {
            lineNumber++;
            
            // Skip already processed lines
            if (lineNumber <= skipLines) {
              parser.resume();
              return;
            }
            
            result.totalRows = lineNumber;

            // Extract and validate email
            const rawEmail = extractEmail(record, options);
            const validationResult = await validateAndNormalizeEmail(rawEmail);

            if (!validationResult.isValid) {
              result.invalidEmails++;
              
              // Store invalid emails with reason for auditing
              if (validationResult.email) {
                currentBatch.push({
                  email: validationResult.email,
                  lineNumber,
                  invalidReason: validationResult.invalidReason,
                  validationDetails: validationResult.validationDetails,
                });
              }
            } else if (validationResult.email) {
              // Add valid email to current batch
              currentBatch.push({
                email: validationResult.email,
                lineNumber,
              });
              validEmailCount++;
            }

            // Process batch when size is reached
            if (currentBatch.length >= batchSize) {
              try {
                const batchResult = await insertBatch(options.mailingId, currentBatch);
                result.processedRows += batchResult.inserted;
                result.duplicatesSkipped += batchResult.duplicates;

                currentBatch = [];

                // Update progress at checkpoint intervals
                if (lineNumber % checkpointInterval === 0 || lineNumber - skipLines <= checkpointInterval) {
                  await updateProgress(
                    options.mailingId,
                    result.processedRows,
                    lineNumber,
                    result.totalRows
                  );
                  console.log(
                    `✅ Checkpoint: ${result.processedRows} emails processed (line ${lineNumber}/${result.totalRows})`
                  );
                }
              } catch (error) {
                result.errors.push(`Batch insert failed at line ${lineNumber}: ${error}`);
              }
            }
          } catch (error) {
            result.errors.push(`Processing error at line ${lineNumber}: ${error}`);
          } finally {
            parser.resume();
          }
        })
        .on('error', (error: Error) => {
          result.status = 'FAILED';
          result.errors.push(`CSV parsing error: ${error.message}`);
          reject(error);
        })
        .on('end', async () => {
          // Process remaining records in batch
          if (currentBatch.length > 0) {
            try {
              const batchResult = await insertBatch(options.mailingId, currentBatch);
              result.processedRows += batchResult.inserted;
              result.duplicatesSkipped += batchResult.duplicates;
            } catch (error) {
              result.errors.push(`Final batch insert failed: ${error}`);
            }
          }

          // Update final progress
          await completeProgress(
            options.mailingId,
            result.totalRows,
            result.errors.length > 0 ? 'FAILED' : 'COMPLETED'
          );

          console.log(`🎉 CSV processing completed: ${result.processedRows} emails inserted`);
          resolve();
        });
    });
  } catch (error) {
    result.status = 'FAILED';
    result.errors.push(`Processing failed: ${error}`);
    
    await completeProgress(options.mailingId, result.totalRows, 'FAILED');
  }

  return result;
}

/**
 * Resumes processing from last checkpoint
 * This is now a convenience wrapper - processCsvFile automatically resumes from checkpoint
 * @param mailingId - Mailing ID to resume
 * @param filePath - Path to CSV file
 * @param options - Processing options
 * @returns Processing result
 */
export async function resumeCsvProcessing(
  mailingId: string,
  filePath: string,
  options: Omit<CsvProcessingOptions, 'mailingId'>
): Promise<CsvProcessingResult> {
  // Get last progress to verify it exists
  const progress = await mailingProgressRepository.findByMailingId(mailingId);

  if (!progress) {
    throw new Error(`No progress found for mailing ${mailingId}`);
  }

  if (progress.status === 'COMPLETED') {
    throw new Error(`Mailing ${mailingId} is already completed`);
  }

  console.log(`♻️  Resuming mailing ${mailingId} from line ${progress.lastProcessedLine + 1}`);

  // Process file - it will automatically skip already processed lines
  const resumeOptions: CsvProcessingOptions = {
    ...options,
    mailingId,
  };

  return processCsvFile(filePath, resumeOptions);
}
