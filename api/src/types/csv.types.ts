export interface CsvProcessingOptions {
  mailingId: string;
  hasHeader?: boolean;
  emailColumnName?: string;
  emailColumnIndex?: number;
  batchSize?: number;
  checkpointInterval?: number;
  delimiter?: string;
}

export interface CsvProcessingResult {
  mailingId: string;
  totalRows: number;
  processedRows: number;
  duplicatesSkipped: number;
  invalidEmails: number;
  errors: string[];
  status: 'COMPLETED' | 'FAILED' | 'PARTIAL';
}

export interface EmailRecord {
  email: string;
  lineNumber: number;
  invalidReason?: string;
  validationDetails?: string;
}

export interface BatchInsertResult {
  inserted: number;
  duplicates: number;
  errors: number;
}
