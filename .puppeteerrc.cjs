const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Configures Puppeteer to store downloaded browsers inside project directory
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
