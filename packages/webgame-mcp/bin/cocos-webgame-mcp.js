#!/usr/bin/env node
import { runCli } from '../dist/cli.js';

runCli(process.argv.slice(2)).catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
