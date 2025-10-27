/**
 * Simple test to verify test setup works
 */

import { describe, it, expect } from 'vitest';

describe('Test Setup Verification', () => {
  it('should run basic test', () => {
    expect(1 + 1).toBe(2);
  });
  
  it('should have access to environment variables', () => {
    expect(process.env.NODE_ENV).toBeDefined();
  });
  
  it('should support async tests', async () => {
    const result = await Promise.resolve(42);
    expect(result).toBe(42);
  });
});
