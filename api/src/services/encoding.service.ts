export type Encoding = 'utf-8' | 'utf-8-bom' | 'iso-8859-1';

export interface EncodingDetectionResult {
  encoding: Encoding;
  hasBom: boolean;
}

/**
 * Detects the encoding of a buffer by checking for BOM and validating UTF-8
 * @param buffer - First chunk of the file to analyze
 * @returns Detected encoding information
 */
export function detectEncoding(buffer: Buffer): EncodingDetectionResult {
  // Check for UTF-8 BOM (EF BB BF)
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return {
      encoding: 'utf-8-bom',
      hasBom: true,
    };
  }

  // Try to decode as UTF-8
  try {
    const decoded = buffer.toString('utf-8');
    // Check if the decoded string contains replacement characters
    // which would indicate invalid UTF-8 sequences
    if (!decoded.includes('\ufffd')) {
      return {
        encoding: 'utf-8',
        hasBom: false,
      };
    }
  } catch (error) {
    // UTF-8 decoding failed
  }

  // Fallback to ISO-8859-1 (Latin-1)
  return {
    encoding: 'iso-8859-1',
    hasBom: false,
  };
}

/**
 * Removes UTF-8 BOM from buffer if present
 * @param buffer - Buffer to process
 * @returns Buffer without BOM
 */
export function removeBom(buffer: Buffer): Buffer {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.slice(3);
  }
  return buffer;
}

/**
 * Converts buffer to string using the specified encoding
 * @param buffer - Buffer to convert
 * @param encoding - The encoding to use
 * @returns Decoded string
 */
export function decodeBuffer(buffer: Buffer, encoding: Encoding): string {
  if (encoding === 'iso-8859-1') {
    return buffer.toString('latin1');
  }
  return buffer.toString('utf-8');
}
