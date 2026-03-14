import process from 'node:process';

import { importContentPack } from './importer.ts';

function getOptionValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return argv[index + 1];
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  node --experimental-strip-types packages/content-import/src/cli.ts import \\',
      '    --input "./Jet Lag The Game.xlsx" \\',
      '    --output "./samples/generated/jet-lag-the-game.content-pack.json" \\',
      '    --report "./samples/generated/jet-lag-the-game.import-report.json"',
      ''
    ].join('\n')
  );
}

function main(): void {
  const [, , command, ...rest] = process.argv;

  if (command !== 'import') {
    printUsage();
    process.exit(command ? 1 : 0);
  }

  const inputPath = getOptionValue(rest, '--input');
  const outputPath = getOptionValue(rest, '--output');
  const reportPath = getOptionValue(rest, '--report');

  if (!inputPath) {
    printUsage();
    process.exit(1);
  }

  const result = importContentPack({
    inputPath,
    outputPath,
    reportPath
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        packId: result.pack.packId,
        status: result.report.status,
        issueCount: result.report.issues.length,
        outputPath: result.outputPath,
        reportPath: result.reportPath
      },
      null,
      2
    )}\n`
  );
}

main();
