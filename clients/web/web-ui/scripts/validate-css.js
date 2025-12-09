#!/usr/bin/env node

/**
 * CSS Validation Script
 * ======================
 * 
 * Enforces CSS architecture best practices:
 * - No hardcoded hex colors (except in tokens.css and comments)
 * - No hardcoded px/rem spacing for actionable properties (excludes functional values)
 * - No numeric font-weight values (except in tokens.css)
 * 
 * EXCLUDES (functional CSS that should use px):
 * - Grid minmax() values: minmax(200px, 1fr)
 * - Media query breakpoints: @media (max-width: 768px)
 * - Viewport calculations: calc(100vh - 140px)
 * - Container max/min dimensions
 * - Box-shadow spread values
 * - Border-width (should use design tokens)
 * 
 * Usage:
 *   node scripts/validate-css.js [--verbose]
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

// Regex patterns for violations
const HEX_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b/g;

// Functional CSS patterns to EXCLUDE from violations
const FUNCTIONAL_PX_PATTERNS = [
  /minmax\([^)]*px[^)]*\)/,           // Grid minmax(200px, 1fr)
  /@media[^{]*\d+px/,                  // Media queries
  /calc\([^)]*vh[^)]*px[^)]*\)/,       // Viewport calculations: calc(100vh - 140px)
  /calc\([^)]*vw[^)]*px[^)]*\)/,       // Viewport calculations: calc(100vw - 40px)
  /max-width:\s*\d+px/,                // Container constraints
  /min-width:\s*\d+px/,                // Container constraints  
  /max-height:\s*\d+px/,               // Container constraints
  /min-height:\s*\d+px/,               // Container constraints
  /width:\s*\d+px\s*$/,                // Fixed widths (usually container constraints)
  /height:\s*\d+px\s*$/,               // Fixed heights (usually container constraints)
  /box-shadow:[^;]*\d+px/,             // Box shadow spread values
  /text-shadow:[^;]*\d+px/,            // Text shadow spread values
  /filter:[^;]*blur\(\d+px\)/,         // Blur filters
  /backdrop-filter:[^;]*blur\(\d+px\)/, // Backdrop blur filters
];

// Properties that should use design tokens
const ACTIONABLE_PX_PROPERTIES = [
  'padding',
  'padding-top',
  'padding-right', 
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'gap',
  'row-gap',
  'column-gap',
  'border-radius',
  'font-size',
  'line-height',
  'letter-spacing',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'outline',
  'top',
  'right',
  'bottom',
  'left',
];

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
 * Check if a line contains functional CSS that should use px
 */
function isFunctionalPxUsage(line) {
  return FUNCTIONAL_PX_PATTERNS.some(pattern => pattern.test(line));
}

/**
 * Check if a line is a comment
 */
function isComment(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || 
         trimmed.startsWith('/*') || 
         trimmed.startsWith('*') ||
         trimmed.includes('/* ') ||
         trimmed.endsWith('*/');
}

/**
 * Check if line contains actionable px/rem property
 */
function hasActionableProperty(line) {
  return ACTIONABLE_PX_PROPERTIES.some(prop => {
    const regex = new RegExp(`\\b${prop}\\s*:`);
    return regex.test(line);
  });
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
  
  lines.forEach((line, index) => {
    // Skip comments
    if (isComment(line)) {
      return;
    }

    // Check for hex colors (not in comments)
    const hexMatches = line.match(HEX_COLOR_REGEX);
    if (hexMatches) {
      violations.hexColors.push({
        file: path.relative(process.cwd(), filePath),
        line: index + 1,
        code: line.trim(),
        values: hexMatches
      });
    }
    
    // Check for actionable px spacing values
    if (line.includes('px') && !isFunctionalPxUsage(line)) {
      if (hasActionableProperty(line)) {
        const pxMatch = line.match(/:\s*[^;]*(\d+\.?\d*)px/);
        if (pxMatch) {
          violations.pxSpacing.push({
            file: path.relative(process.cwd(), filePath),
            line: index + 1,
            code: line.trim(),
            value: pxMatch[1] + 'px'
          });
        }
      }
    }
    
    // Check for rem spacing values on actionable properties
    if (line.includes('rem')) {
      if (hasActionableProperty(line)) {
        const remMatch = line.match(/:\s*[^;]*(\d+\.?\d*)rem/);
        if (remMatch) {
          violations.remSpacing.push({
            file: path.relative(process.cwd(), filePath),
            line: index + 1,
            code: line.trim(),
            value: remMatch[1] + 'rem'
          });
        }
      }
    }
    
    // Check for numeric font-weight
    const fontWeightMatches = line.match(NUMERIC_FONT_WEIGHT_REGEX);
    if (fontWeightMatches) {
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
    console.log(`\n⚠️  Hardcoded px Values: ${violations.pxSpacing.length}`);
    console.log('─'.repeat(60));
    console.log('Use design tokens for spacing/sizing (--space-xs, --space-md, etc.).\n');
    
    if (verbose) {
      violations.pxSpacing.forEach(v => {
        console.log(`  ${v.file}:${v.line}`);
        console.log(`    ${v.code}`);
        console.log(`    Value: ${v.value}`);
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
    console.log(`\n⚠️  Hardcoded rem Values: ${violations.remSpacing.length}`);
    console.log('─'.repeat(60));
    console.log('Use design tokens for spacing/sizing (--space-xs, --text-lg, etc.).\n');
    
    if (verbose) {
      violations.remSpacing.forEach(v => {
        console.log(`  ${v.file}:${v.line}`);
        console.log(`    ${v.code}`);
        console.log(`    Value: ${v.value}`);
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
    console.log(`\n❌ ${totalViolations} actionable violations found.\n`);
    console.log('Fix Guide:');
    console.log('  • Colors: Use var(--bg-primary), var(--text-secondary), etc.');
    console.log('  • Spacing: Use var(--space-xs), var(--space-sm), var(--space-md), etc.');
    console.log('  • Typography: Use var(--text-xs), var(--text-lg), etc.');
    console.log('  • Font weights: Use var(--font-normal), var(--font-medium), etc.');
    console.log('\nNote: Functional values are excluded (grid minmax, media queries, etc.)\n');
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
