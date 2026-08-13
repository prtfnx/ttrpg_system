#!/usr/bin/env node

/**
 * CSS Validation Script
 * ======================
 * 
 * Enforces CSS architecture best practices:
 * - No hardcoded hex colors (except in tokens.css and comments)
 * - No hardcoded RGB colors outside the token/theme layer
 * - No hardcoded px/rem spacing for actionable properties (excludes functional values)
 * - No numeric font-weight values (except in tokens.css)
 * - No literal component font stacks
 * - No references to undefined custom properties, including references with fallbacks
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
const RGB_COLOR_REGEX = /\brgba?\s*\(/g;

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
  /\b(?:top|right|bottom|left):\s*-\d{4,}px/, // Off-screen accessibility positioning
];
const ALLOWED_GLOBAL_STYLES = new Set([...ALLOWED_FILES, 'index.css']);

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
  rgbColors: [],
  pxSpacing: [],
  remSpacing: [],
  numericFontWeight: [],
  literalFontFamilies: [],
  undefinedCustomProperties: [],
  deprecatedTokens: [],
  transitionAll: [],
  numericZIndex: [],
  semanticTokenMisuse: [],
  motionLiterals: [],
  globalComponentStyles: []
};

const definedCustomProperties = new Set();
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
  const fileName = path.basename(filePath);
  if (!fileName.endsWith('.module.css') && !ALLOWED_GLOBAL_STYLES.has(fileName)) {
    violations.globalComponentStyles.push({
      file: path.relative(process.cwd(), filePath),
      line: 1,
      code: 'Component styles must use a colocated *.module.css file.'
    });
  }

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

    const architectureChecks = [
      {
        pattern: /--(?:spacing-|font-size-|font-family\b|line-tight\b|transition-base\b)/,
        target: violations.deprecatedTokens,
      },
      {
        pattern: /transition\s*:\s*all\b/,
        target: violations.transitionAll,
      },
      {
        pattern: /z-index\s*:\s*-?\d+\b/,
        target: violations.numericZIndex,
      },
      {
        pattern: /(?:font-size|border-radius)\s*:\s*var\(--(?:space|spacing)-/,
        target: violations.semanticTokenMisuse,
      },
      {
        pattern: /(?:padding|margin|gap)\s*:[^;]*var\(--(?:text|font-size)-/,
        target: violations.semanticTokenMisuse,
      },
      {
        pattern: /(?:transition|animation)(?:-duration)?\s*:[^;]*(?<![\d.])(?:\d+(?:\.\d+)?(?:ms|s))\b/,
        target: violations.motionLiterals,
        allow: /0\.01ms/,
      },
    ];

    for (const check of architectureChecks) {
      if (check.pattern.test(line) && !check.allow?.test(line)) {
        check.target.push({
          file: path.relative(process.cwd(), filePath),
          line: index + 1,
          code: line.trim(),
        });
      }
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

    const rgbMatches = line.match(RGB_COLOR_REGEX);
    if (rgbMatches) {
      violations.rgbColors.push({
        file: path.relative(process.cwd(), filePath),
        line: index + 1,
        code: line.trim(),
        values: rgbMatches,
      });
    }
    
    // Check for actionable px spacing values
    if (line.includes('px') && !isFunctionalPxUsage(line)) {
      if (hasActionableProperty(line)) {
        const pxValues = [...line.matchAll(/-?(?:\d*\.)?\d+px\b/g)]
          .map(match => match[0]);
        if (pxValues.length > 0) {
          violations.pxSpacing.push({
            file: path.relative(process.cwd(), filePath),
            line: index + 1,
            code: line.trim(),
            values: pxValues
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

    const fontFamily = line.match(/font-family\s*:\s*([^;]+)/)?.[1].trim();
    if (fontFamily && fontFamily !== 'inherit' && !fontFamily.includes('var(')) {
      violations.literalFontFamilies.push({
        file: path.relative(process.cwd(), filePath),
        line: index + 1,
        code: line.trim(),
      });
    }

    const customPropertyReferences = line.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)\b/g);
    for (const match of customPropertyReferences) {
      const token = match[1];
      if (!definedCustomProperties.has(token)) {
        violations.undefinedCustomProperties.push({
          file: path.relative(process.cwd(), filePath),
          line: index + 1,
          code: line.trim(),
          token
        });
      }
    }
  });
}

/**
 * Collect custom-property definitions before validating references.
 */
function collectCustomPropertyDefinitions(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectCustomPropertyDefinitions(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const definitions = content.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g);
      for (const match of definitions) {
        definedCustomProperties.add(match[1]);
      }
    }
  }
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
    violations.rgbColors.length +
    violations.pxSpacing.length +
    violations.remSpacing.length +
    violations.numericFontWeight.length +
    violations.literalFontFamilies.length +
    violations.undefinedCustomProperties.length +
    violations.deprecatedTokens.length +
    violations.transitionAll.length +
    violations.numericZIndex.length +
    violations.semanticTokenMisuse.length +
    violations.motionLiterals.length +
    violations.globalComponentStyles.length;
  
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

  if (violations.rgbColors.length > 0) {
    console.log(`\nHardcoded RGB Colors: ${violations.rgbColors.length}`);
    console.log('-'.repeat(60));
    console.log('Define raw RGB/RGBA values in theme.css and consume semantic tokens here.\n');
    for (const violation of violations.rgbColors) {
      console.log(`  ${violation.file}:${violation.line}`);
      if (verbose) console.log(`    ${violation.code}`);
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
        console.log(`    Values: ${v.values.join(', ')}`);
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

  if (violations.literalFontFamilies.length > 0) {
    console.log(`\nLiteral Font Families: ${violations.literalFontFamilies.length}`);
    console.log('-'.repeat(60));
    console.log('Use --font-sans, --font-mono, or intentional inheritance.\n');
    for (const violation of violations.literalFontFamilies) {
      console.log(`  ${violation.file}:${violation.line}`);
      if (verbose) console.log(`    ${violation.code}`);
    }
  }

  if (violations.undefinedCustomProperties.length > 0) {
    console.log(`\n❌ Undefined Custom Properties: ${violations.undefinedCustomProperties.length}`);
    console.log('─'.repeat(60));
    console.log('Define each token in the shared token/theme layer before use.\n');

    if (verbose) {
      violations.undefinedCustomProperties.forEach(v => {
        console.log(`  ${v.file}:${v.line}`);
        console.log(`    ${v.code}`);
        console.log(`    Undefined: ${v.token}`);
        console.log();
      });
    } else {
      const byToken = {};
      violations.undefinedCustomProperties.forEach(v => {
        byToken[v.token] = (byToken[v.token] || 0) + 1;
      });
      Object.entries(byToken).forEach(([token, count]) => {
        console.log(`  ${token}: ${count} references`);
      });
    }
  }

  const architectureReports = [
    ['Deprecated theme tokens', violations.deprecatedTokens, 'Use canonical --space-*, --text-*, and motion tokens.'],
    ['Broad transitions', violations.transitionAll, 'List intended properties or use a shared interactive transition token.'],
    ['Numeric z-index values', violations.numericZIndex, 'Use the shared semantic z-index scale.'],
    ['Semantic token misuse', violations.semanticTokenMisuse, 'Match typography, radius, and spacing properties to their token families.'],
    ['Literal motion durations', violations.motionLiterals, 'Use shared duration or transition tokens.'],
    ['Global component stylesheets', violations.globalComponentStyles, 'Use colocated CSS Modules for component styles.'],
  ];

  for (const [label, items, guidance] of architectureReports) {
    if (items.length === 0) continue;
    console.log(`\nCSS architecture - ${label}: ${items.length}`);
    console.log('-'.repeat(60));
    console.log(`${guidance}\n`);
    for (const violation of items) {
      console.log(`  ${violation.file}:${violation.line}`);
      if (verbose) console.log(`    ${violation.code}`);
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
  
  collectCustomPropertyDefinitions(SRC_DIR);
  scanDirectory(SRC_DIR);
  printReport(verbose);
  
  const totalViolations = 
    violations.hexColors.length +
    violations.rgbColors.length +
    violations.pxSpacing.length +
    violations.remSpacing.length +
    violations.numericFontWeight.length +
    violations.literalFontFamilies.length +
    violations.undefinedCustomProperties.length +
    violations.deprecatedTokens.length +
    violations.transitionAll.length +
    violations.numericZIndex.length +
    violations.semanticTokenMisuse.length +
    violations.motionLiterals.length +
    violations.globalComponentStyles.length;
  
  process.exit(totalViolations > 0 ? 1 : 0);
}

main();
