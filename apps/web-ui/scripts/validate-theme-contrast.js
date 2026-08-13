#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const stylesDir = path.join(scriptDir, '../src/shared/styles');
const tokensCss = fs.readFileSync(path.join(stylesDir, 'tokens.css'), 'utf8');
const themeCss = fs.readFileSync(path.join(stylesDir, 'theme.css'), 'utf8');

const THEMES = ['dark', 'light', 'high-contrast', 'cyberpunk', 'forest'];
const COLOR_SCHEMES = ['blue', 'purple', 'green', 'red', 'orange'];
const TEXT_PAIRS = [
  ['--text-primary', '--bg-primary'],
  ['--text-secondary', '--bg-primary'],
  ['--text-muted', '--bg-primary'],
  ['--text-primary', '--bg-secondary'],
  ['--text-secondary', '--bg-secondary'],
  ['--text-muted', '--bg-secondary'],
  ['--text-primary', '--bg-elevated'],
  ['--text-secondary', '--bg-elevated'],
  ['--text-muted', '--bg-elevated'],
  ['--text-accent', '--bg-primary'],
  ['--text-accent', '--bg-secondary'],
  ['--text-accent', '--bg-elevated'],
  ['--text-accent-hover', '--bg-primary'],
  ['--text-accent-hover', '--bg-secondary'],
  ['--text-accent-hover', '--bg-elevated'],
];
const BUTTON_PAIRS = [
  ['--button-primary-text', '--button-primary-bg'],
  ['--button-primary-text', '--button-primary-hover'],
  ['--button-primary-text', '--button-primary-active'],
  ['--button-success-text', '--button-success-bg'],
  ['--button-success-text', '--button-success-hover'],
  ['--button-success-text', '--button-success-active'],
  ['--button-danger-text', '--button-danger-bg'],
  ['--button-danger-text', '--button-danger-hover'],
  ['--button-danger-text', '--button-danger-active'],
  ['--button-info-text', '--button-info-bg'],
  ['--button-info-text', '--button-info-hover'],
  ['--button-info-text', '--button-info-active'],
  ['--button-warning-text', '--button-warning-bg'],
  ['--button-warning-text', '--button-warning-hover'],
  ['--button-warning-text', '--button-warning-active'],
];

function extractDeclarations(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';
  return new Map(
    [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
      .map((match) => [match[1], match[2].trim()]),
  );
}

function mergeDeclarations(...maps) {
  return new Map(maps.flatMap((map) => [...map]));
}

function parseColor(value) {
  const hex = value.match(/^#([\da-f]{6})$/i)?.[1];
  if (hex) {
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }

  const rgb = value.match(/^rgb\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\s*\)$/i);
  return rgb ? rgb.slice(1).map(Number) : null;
}

function mixColors(first, second, firstPercent) {
  return first.map((channel, index) => channel * firstPercent + second[index] * (1 - firstPercent));
}

function resolveValue(token, declarations, seen = new Set()) {
  if (seen.has(token)) return null;
  const value = declarations.get(token);
  if (!value) return null;
  seen.add(token);

  let resolved = value.replace(/var\((--[\w-]+)(?:,\s*([^)]+))?\)/g, (_, referenced, fallback) => (
    resolveValue(referenced, declarations, new Set(seen)) ?? fallback ?? ''
  ));

  const colorMix = resolved.match(/^color-mix\(in srgb,\s*(#[\da-f]{6})\s+([\d.]+)%,\s*(#[\da-f]{6})\)$/i);
  if (colorMix) {
    const first = parseColor(colorMix[1]);
    const second = parseColor(colorMix[3]);
    if (!first || !second) return null;
    return `rgb(${mixColors(first, second, Number(colorMix[2]) / 100).join(' ')})`;
  }

  return resolved.trim();
}

function luminance(color) {
  const channels = color.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first, second) {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05)
    / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

const baseDeclarations = mergeDeclarations(
  extractDeclarations(tokensCss, ':root'),
  extractDeclarations(themeCss, ':root'),
);
const failures = [];

for (const theme of THEMES) {
  for (const colorScheme of COLOR_SCHEMES) {
    const declarations = mergeDeclarations(
      baseDeclarations,
      theme === 'dark' ? new Map() : extractDeclarations(themeCss, `[data-theme="${theme}"]`),
      extractDeclarations(themeCss, `[data-color-scheme="${colorScheme}"]`),
    );

    for (const [foregroundToken, backgroundToken] of [...TEXT_PAIRS, ...BUTTON_PAIRS]) {
      const foreground = parseColor(resolveValue(foregroundToken, declarations) ?? '');
      const background = parseColor(resolveValue(backgroundToken, declarations) ?? '');
      if (!foreground || !background) {
        failures.push(`${theme}/${colorScheme}: could not resolve ${foregroundToken} on ${backgroundToken}`);
        continue;
      }

      const ratio = contrastRatio(foreground, background);
      if (ratio < 4.5) {
        failures.push(
          `${theme}/${colorScheme}: ${foregroundToken} on ${backgroundToken} is ${ratio.toFixed(2)}:1`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error('Theme contrast validation failed:\n');
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

console.log(`Theme contrast validation passed for ${THEMES.length * COLOR_SCHEMES.length} theme combinations.`);
