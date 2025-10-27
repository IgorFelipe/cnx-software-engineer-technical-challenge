import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    // Test environment
    environment: 'node',
    
    // Global setup and teardown
    globalSetup: './test/setup/global-setup.ts',
    setupFiles: ['./test/setup/test-setup.ts'],
    
    // Test patterns
    include: [
      'test/**/*.test.ts',
      'test/**/*.spec.ts'
    ],
    exclude: [
      'node_modules',
      'dist',
      'test/chaos/**' // Chaos tests run separately
    ],
    
    // Timeout configuration
    testTimeout: 30000, // 30s for integration tests
    hookTimeout: 10000,
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'dist/**',
        'test/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/scripts/**', // Scripts are tested manually
        'src/types/**',
        'src/config/**'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    },
    
    // Reporters
    reporters: ['verbose'],
    
    // Watch mode
    watch: false,
    
    // Logging
    logHeapUsage: true
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@test': path.resolve(__dirname, './test')
    }
  }
});
