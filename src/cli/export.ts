#!/usr/bin/env node
/**
 * CLI for exporting/importing watch history with annotations
 *
 * Usage:
 *   pnpm cli:export [output.jsonl]     Export to JSONL file
 *   pnpm cli:export --import input.jsonl   Import from JSONL file
 *   pnpm cli:export --stats            Show export stats without writing
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { initDatabase, closeDatabase } from '../storage/database.js';
import { ExportService } from '../storage/export-service.js';

const args = process.argv.slice(2);

async function main() {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const db = initDatabase();
  const exportService = new ExportService(db);

  try {
    if (args.includes('--stats')) {
      await showStats(exportService);
      return;
    }

    if (args.includes('--import')) {
      const importIndex = args.indexOf('--import');
      const inputFile = args[importIndex + 1];
      if (!inputFile) {
        console.error('Error: --import requires a file path');
        process.exit(1);
      }
      await importFromFile(exportService, inputFile);
      return;
    }

    // Default: export
    const outputFile = args[0] || 'watch-history-export.jsonl';
    await exportToFile(exportService, outputFile);
  } finally {
    closeDatabase(db);
  }
}

function printHelp() {
  console.log(`
YouTube Watch History Export/Import CLI

Usage:
  pnpm cli:export [output.jsonl]      Export to JSONL file (default: watch-history-export.jsonl)
  pnpm cli:export --import <file>     Import from JSONL file
  pnpm cli:export --stats             Show export statistics

Options:
  -h, --help    Show this help message

Examples:
  pnpm cli:export                     Export to watch-history-export.jsonl
  pnpm cli:export backup.jsonl        Export to backup.jsonl
  pnpm cli:export --import backup.jsonl   Import from backup.jsonl
  pnpm cli:export --stats             Show stats without exporting
`);
}

async function showStats(exportService: ExportService) {
  console.log('Gathering statistics...\n');

  const result = await exportService.exportAll();

  console.log('Export Statistics:');
  console.log('─'.repeat(40));
  console.log(`Total entries:        ${result.stats.totalEntries}`);
  console.log(`Entries with notes:   ${result.stats.entriesWithNotes}`);
  console.log(`Entries with tags:    ${result.stats.entriesWithTags}`);
  console.log(`Total notes:          ${result.stats.totalNotes}`);
  console.log(`Total tags:           ${result.stats.totalTags}`);
}

async function exportToFile(exportService: ExportService, outputPath: string) {
  const resolvedPath = resolve(outputPath);

  console.log('Exporting watch history...\n');

  const startTime = Date.now();
  const jsonl = await exportService.exportToJsonl();
  const duration = Date.now() - startTime;

  writeFileSync(resolvedPath, jsonl, 'utf-8');

  const result = await exportService.exportAll();
  const fileSizeKb = (Buffer.byteLength(jsonl, 'utf-8') / 1024).toFixed(2);

  console.log('Export complete!');
  console.log('─'.repeat(40));
  console.log(`Output file:          ${resolvedPath}`);
  console.log(`File size:            ${fileSizeKb} KB`);
  console.log(`Total entries:        ${result.stats.totalEntries}`);
  console.log(`Entries with notes:   ${result.stats.entriesWithNotes}`);
  console.log(`Entries with tags:    ${result.stats.entriesWithTags}`);
  console.log(`Duration:             ${duration}ms`);
}

async function importFromFile(exportService: ExportService, inputPath: string) {
  const resolvedPath = resolve(inputPath);

  if (!existsSync(resolvedPath)) {
    console.error(`Error: File not found: ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`Importing from ${resolvedPath}...\n`);

  const startTime = Date.now();
  const content = readFileSync(resolvedPath, 'utf-8');
  const result = await exportService.importFromJsonl(content);
  const duration = Date.now() - startTime;

  console.log('Import complete!');
  console.log('─'.repeat(40));
  console.log(`Entries imported:     ${result.imported}`);
  console.log(`Duplicates skipped:   ${result.duplicates}`);
  console.log(`Notes created:        ${result.notesCreated}`);
  console.log(`Tag assignments:      ${result.tagAssignments}`);
  console.log(`Errors:               ${result.errors.length}`);
  console.log(`Duration:             ${duration}ms`);

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    for (const err of result.errors.slice(0, 10)) {
      console.log(`  Line ${err.index + 1}: ${err.message}`);
    }
    if (result.errors.length > 10) {
      console.log(`  ... and ${result.errors.length - 10} more`);
    }
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
