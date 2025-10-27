import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

/**
 * Storage service for managing CSV file storage
 * Supports local filesystem storage (can be extended for S3 in the future)
 */
export class StorageService {
  private readonly storageBasePath: string;

  constructor(basePath?: string) {
    // Default to 'storage/mailings' directory in the project root
    this.storageBasePath = basePath ?? join(process.cwd(), 'storage', 'mailings');
  }

  /**
   * Initializes storage directory
   */
  async initialize(): Promise<void> {
    if (!existsSync(this.storageBasePath)) {
      await mkdir(this.storageBasePath, { recursive: true });
    }
  }

  /**
   * Saves a CSV file to storage
   * @param mailingId - Mailing ID (used as filename)
   * @param buffer - File buffer
   * @param originalFilename - Original filename for reference
   * @returns Storage URL/path
   */
  async saveCsvFile(
    mailingId: string,
    buffer: Buffer,
    originalFilename: string
  ): Promise<string> {
    await this.initialize();

    // Generate filename: {mailingId}_{originalFilename}
    const filename = `${mailingId}_${originalFilename}`;
    const filePath = join(this.storageBasePath, filename);

    // Save file
    await writeFile(filePath, buffer);

    // Return storage URL (local path for now)
    // In production, this could be an S3 URL
    return filePath;
  }

  /**
   * Gets the full path for a stored file
   * @param mailingId - Mailing ID
   * @param originalFilename - Original filename
   * @returns Full file path
   */
  getFilePath(mailingId: string, originalFilename: string): string {
    const filename = `${mailingId}_${originalFilename}`;
    return join(this.storageBasePath, filename);
  }

  /**
   * Checks if a file exists in storage
   * @param storageUrl - Storage URL/path
   * @returns True if file exists
   */
  fileExists(storageUrl: string): boolean {
    return existsSync(storageUrl);
  }
}

// Export singleton instance
export const storageService = new StorageService();
