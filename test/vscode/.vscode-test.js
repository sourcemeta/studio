const { defineConfig } = require('@vscode/test-cli');
const fs = require('fs');
const path = require('path');

const cacheDir = path.resolve(__dirname, '.vscode-test');
fs.mkdirSync(cacheDir, { recursive: true });

const config = {
  files: 'extension.test.js',
  cachePath: cacheDir,
  launchArgs: [
    '--user-data-dir', path.join(cacheDir, 'user-data'),
    '--extensions-dir', path.join(cacheDir, 'extensions')
  ],
  mocha: {
    ui: 'tdd',
    timeout: 20000,
    color: true
  }
};

if (!process.env.VSIX) {
  config.extensionDevelopmentPath = '../../vscode';
  config.launchArgs.push('--disable-extensions');
}

module.exports = defineConfig(config);
