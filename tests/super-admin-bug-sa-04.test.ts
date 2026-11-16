import { describe, it, expect } from 'vitest';
import { formatINR } from '@/lib/utils/formatters';
import * as fs from 'fs';
import * as path from 'path';

describe('BUG-SA-04: Currency Symbol Formatting Verification', () => {
  it('formatINR produces single currency symbol and standard en-IN format', () => {
    expect(formatINR(0)).toBe('₹0');
    expect(formatINR(39000)).toBe('₹39,000');
    expect(formatINR(1250000)).toBe('₹12,50,000');
    expect(formatINR(null)).toBe('₹0');
    expect(formatINR(undefined)).toBe('₹0');
    expect(formatINR(NaN)).toBe('₹0');
  });

  it('guarantees no double rupee (₹₹) symbols in app/(dashboard)/placement/enrollments/page.tsx', () => {
    const filePath = path.resolve(process.cwd(), 'app/(dashboard)/placement/enrollments/page.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Verify there are no duplicate currency symbols like ₹₹ or ₹${formatINR
    expect(content).not.toMatch(/₹\s*₹/);
    expect(content).not.toMatch(/₹\s*\$?\{?formatINR/);
    expect(content).not.toContain('₹₹');
  });

  it('guarantees no double rupee (₹₹) symbols in components/portal/student-placement-hub.tsx', () => {
    const filePath = path.resolve(process.cwd(), 'components/portal/student-placement-hub.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).not.toMatch(/₹\s*₹/);
    expect(content).not.toMatch(/₹\s*\$?\{?formatINR/);
    expect(content).not.toContain('₹₹');
  });

  it('guarantees all formatINR calls in JSX/templates do not have a redundant preceding ₹ symbol', () => {
    const dashboardDir = path.resolve(process.cwd(), 'app/(dashboard)');
    const files: string[] = [];

    function findTsxFiles(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          findTsxFiles(full);
        } else if (entry.name.endsWith('.tsx')) {
          files.push(full);
        }
      }
    }
    findTsxFiles(dashboardDir);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const matches = content.match(/₹\s*\$\{formatINR\([^)]+\)\}/g);
      expect(matches, `Redundant currency symbol found in ${file}: ${matches?.join(', ')}`).toBeNull();
    }
  });
});
