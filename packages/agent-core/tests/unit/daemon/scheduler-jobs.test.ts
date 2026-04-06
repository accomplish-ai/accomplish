import { describe, it, expect } from 'vitest';
import { parseCronField } from '../../../src/daemon/scheduler-jobs.js';

describe('scheduler-jobs cron parsing', () => {
  describe('parseCronField', () => {
    it('should parse wildcard', () => {
      const result = parseCronField('*', 0, 5);
      expect(result).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('should parse single value', () => {
      const result = parseCronField('3', 0, 5);
      expect(result).toEqual([3]);
    });

    it('should parse range', () => {
      const result = parseCronField('1-3', 0, 5);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should parse multiple values', () => {
      const result = parseCronField('1,3,5', 0, 10);
      expect(result).toEqual([1, 3, 5]);
    });

    it('should parse combined tokens', () => {
      const result = parseCronField('1,3-5', 0, 10);
      expect(result).toEqual([1, 3, 4, 5]);
    });

    it('should reject invalid values (out of range)', () => {
      const result = parseCronField('11', 0, 10);
      expect(result).toEqual([]);
    });

    it('should reject invalid range', () => {
      const result = parseCronField('5-3', 0, 10);
      expect(result).toEqual([]);
    });

    it('should reject malformed tokens with characters', () => {
      const result = parseCronField('1a', 0, 10);
      expect(result).toEqual([]);
    });

    it('should reject malformed tokens with decimals', () => {
      const result = parseCronField('1.5', 0, 10);
      expect(result).toEqual([]);
    });

    it('should reject malformed ranges', () => {
      const result = parseCronField('1-2-3', 0, 10);
      expect(result).toEqual([]);
    });

    it('should reject empty parts', () => {
      const result = parseCronField('1,,3', 0, 10);
      expect(result).toEqual([]);
    });
  });
});
