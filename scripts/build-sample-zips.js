#!/usr/bin/env node
/**
 * Zips each sample-data customer folder into sample-data/zips/<folder>.zip,
 * ready to upload on the Customer Info tab.
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const SAMPLE_DATA = path.join(__dirname, '..', 'sample-data');
const OUT_DIR = path.join(SAMPLE_DATA, 'zips');

const folders = fs.readdirSync(SAMPLE_DATA, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name !== 'zips')
  .map(d => d.name);

if (folders.length === 0) {
  console.error(`No customer folders found in ${SAMPLE_DATA}`);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const folder of folders) {
  const zip = new AdmZip();
  zip.addLocalFolder(path.join(SAMPLE_DATA, folder), folder);
  const outPath = path.join(OUT_DIR, `${folder}.zip`);
  zip.writeZip(outPath);
  console.log(`Wrote ${path.relative(process.cwd(), outPath)}`);
}
