#!/usr/bin/env node

/**
 * CSS Validation Script
 * ======================
 * 
 * Enforces CSS architecture best practices:
 * - No hardcoded hex colors (except in tokens.css)
 * - No hardcoded px/rem spacing (except in tokens.css, theme.css)
 * - No numeric font-weight values (except in tokens.css)
 * 
 * Usage:
 *   node scripts/validate-css.js [--fix] [--verbose]
 * 
 * Exit codes:
 *   0 - No violations found
 *   1 - Violations found
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const ALLOWED_FILES = [
  'tokens.css',
  'theme.css',
  'reset.css',
  'base.css'
];

const SRC_DIR = path.join(__dirname, '../src');

// Regex patterns
const HEX_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b/g;
const PX_VALUE_REGEX = /:\s*(-?\d+\.?\d*)px/g;
const REM_VALUE_REGEX = /:\s*(-?\d+\.?\d*)rem/g;
const NUMERIC_FONT_WEIGHT_REGEX = /font-weight:\s*([1-9]00)\b/g;

// Results tracking
const violations = {
  hexColors: [],
  pxSpacing: [],
  remSpacing: [],
  numericFontWeight: []
};

let totalFiles = 0;
let scannedFiles = 0;

/**
 * Check if file should be excluded from validation
 */
function isExcludedFile(filePath) {
  const fileName = path.basename(filePath);
  return ALLOWED_FILES.includes(fileName) || 
         filePath.includes('node_modules') ||
         filePath.includes('dist');
}

/**
 * Scan a single CSS file for violations
 */
function scanFile(filePath) {
  if (isExcludedFile(filePath)) {
    return;
  }

  scannedFiles++;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  // Check for hex colors
  lines.forEach((line, index) => {
    const hexMatches = line.match(HEX_COLOR_REGEX);
    if (hexMatches) {
      violations.hexColors.push({
        file: path.relative(process.cwd(), filePath),
        line: index + 1,
        code: line.trim(),
        values: hexMatches
      });
    }
    
    // Check for px spacing values
    const pxMatches = line.match(PX_VALUE_REGEX);
    if (pxMatches && !line.includes('/* allow-px */')) {
      // Exclude certain properties that legitimately use px
      const excludedProps = ['border-width', 'stroke-width', 'outline-width'];
      const hasExcludedProp = excludedProps.some(prop => line.includes(prop));
      
      if (!hasExcludedProp) {
        violations.pxSpacing.push({
          file: path.relative(process.cwd(), filePath),
          line: index + 1,
          code: line.trim(),
          values: pxMatches
        });
      }
    }
    
    // Check for rem spacing values
    const remMatches = line.match(REM_VALUE_REGEX);
    if (remMatches && !line.includes('/* allow-rem */')) {
      violations.remSpacing.push({
        file: path.relative(process.cwd(), filePath),
        line: index + 1,
        code: line.trim(),
        values: remMatches
      });
    }
    
    // Check for numeric font-weight
    const fontWeightMatches = line.match(NUMERIC_FONT_WEIGHT_REGEX);
    if (fontWeightMatches && !line.includes('/* allow-numeric */')) {
      violations.numericFontWeight.push({
        file: path.relative(process.cwd(), filePath),
        line: index + 1,
        code: line.trim(),
        values: fontWeightMatches
      });
    }
  });
}

/**
 * Recursively scan directory for CSS files
 */
function scanDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.css') || entry.name.endsWith('.module.css'))) {
      totalFiles++;
      scanFile(fullPath);
    }
  }
}

/**
 * Print validation report
 */
function printReport(verbose = false) {
  const totalViolations = 
    violations.hexColors.length +
    violations.pxSpacing.length +
    violations.remSpacing.length +
    violations.numericFontWeight.length;
  
  console.log('\n📊 CSS Validation Report');
  console.log('========================\n');
  
  console.log(`Files scanned: ${scannedFiles}/${totalFiles}`);
  console.log(`Total violations: ${totalViolations}\n`);
  
  // Hex colors
  if (violations.hexColors.length > 0) {
    console.log(`\n❌ Hardcoded Hex Colors: ${violations.hexColors.length}`);
    console.log('─'.repeat(60));
    console.log('Use color tokens from theme.css instead of hex codes.\n');
    
    if (verbose) {
      violations.hexColors.forEach(v => {
        console.log(`  ${v.file}:${v.line}`);
        console.log(`    ${v.code}`);
        console.log(`    Found: ${v.values.join(', ')}`);
        console.log();
      });
    } else {
      // Group by file
      const byFile = {};
      violations.hexColors.forEach(v => {
        byFile[v.file] = (byFile[v.file] || 0) + 1;
      });
      Object.entries(byFile).forEach(([file, count]) => {
        console.log(`  ${file}: ${count} violations`);
      });
    }
  }
  
  // PX spacing
  if (violations.pxSpacing.length > 0) {
    console.log(`\n⚠️  Hardcoded px Spacing: ${violations.pxSpacing.length}`);
    console.log('─'.repeat(60));
    console.log('Use spacing tokens (--space-xs, --space-sm, etc.) instead.\n');
    
    if (verbose) {
      violations.pxSpacing.forEach(v => {
        console.log(`  ${v.file}:${v.line}`);
        console.log(`    ${v.code}`);
        console.log();
      });
    } else {
      const byFile = {};
      violations.pxSpacing.forEach(v => {
        byFile[v.file] = (byFile[v.file] || 0) + 1;
      });
      Object.entries(byFile).forEach(([file, count]) => {
        console.log(`  ${file}: ${count} violations`);
      });
    }
  }
  
  // REM spacing
  if (violations.remSpacing.length > 0) {
    console.log(`\n⚠️  Hardcoded rem Spacing: ${violations.remSpacing.length}`);
    console.log('─'.repeat(60));
    console.log('Use spacing tokens (--space-xs, --space-sm, etc.) instead.\n');
    
    if (verbose) {
      violations.remSpacing.forEach(v => {
        console.log(`  ${v.file}:${v.line}`);
        console.log(`    ${v.code}`);
        console.log();
      });
    } else {
      const byFile = {};
      violations.remSpacing.forEach(v => {
        byFile[v.file] = (byFile[v.file] || 0) + 1;
      });
      Object.entries(byFile).forEach(([file, count]) => {
        console.log(`  ${file}: ${count} violations`);
      });
    }
  }
  
  // Numeric font-weight
  if (violations.numericFontWeight.length > 0) {
    console.log(`\n⚠️  Numeric Font Weights: ${violations.numericFontWeight.length}`);
    console.log('─'.repeat(60));
    console.log('Use font-weight tokens (--font-normal, --font-medium, etc.).\n');
    
    if (verbose) {
      violations.numericFontWeight.forEach(v => {
        console.log(`  ${v.file}:${v.line}`);
        console.log(`    ${v.code}`);
        console.log();
      });
    } else {
      const byFile = {};
      violations.numericFontWeight.forEach(v => {
        byFile[v.file] = (byFile[v.file] || 0) + 1;
      });
      Object.entries(byFile).forEach(([file, count]) => {
        console.log(`  ${file}: ${count} violations`);
      });
    }
  }
  
  // Summary
  if (totalViolations === 0) {
    console.log('\n✅ No violations found! CSS architecture is clean.\n');
  } else {
    console.log(`\n💡 Run with --verbose flag to see detailed line-by-line violations.`);
    console.log(`\n❌ ${totalViolations} total violations found.\n`);
    console.log('Fix Guide:');
    console.log('  • Colors: Use var(--bg-primary), var(--text-secondary), etc.');
    console.log('  • Spacing: Use var(--space-xs), var(--space-sm), var(--space-md), etc.');
    console.log('  • Font weights: Use var(--font-normal), var(--font-medium), etc.\n');
  }
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  
  console.log('🔍 Scanning CSS files for violations...\n');
  
  scanDirectory(SRC_DIR);
  printReport(verbose);
  
  const totalViolations = 
    violations.hexColors.length +
    violations.pxSpacing.length +
    violations.remSpacing.length +
    violations.numericFontWeight.length;
  
  process.exit(totalViolations > 0 ? 1 : 0);
}

main();
