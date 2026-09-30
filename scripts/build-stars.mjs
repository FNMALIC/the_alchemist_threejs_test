// build-stars.mjs - Extract naked-eye stars from the HYG database into src/data/stars.json
//
// Usage: node scripts/build-stars.mjs path/to/hyg_v38.csv.gz
// HYG database: https://github.com/astronexus/HYG-Database (CC BY-SA 4.0, David Nash)

import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const MAGNITUDE_LIMIT = 6.0; // Roughly what the eye can see under a dark desert sky

const input = process.argv[2];
if (!input) {
    console.error('Usage: node scripts/build-stars.mjs hyg_v38.csv.gz');
    process.exit(1);
}

let text = readFileSync(input);
if (input.endsWith('.gz')) text = gunzipSync(text);
const lines = text.toString('utf8').split('\n').filter(Boolean);

// Minimal CSV parsing (fields may be quoted)
const parse = line => {
    const fields = [];
    let current = '';
    let quoted = false;
    for (const char of line) {
        if (char === '"') quoted = !quoted;
        else if (char === ',' && !quoted) {
            fields.push(current);
            current = '';
        } else current += char;
    }
    fields.push(current);
    return fields;
};

const header = parse(lines[0]);
const column = name => header.indexOf(name);
const [RA, DEC, MAG, CI, PROPER] = ['ra', 'dec', 'mag', 'ci', 'proper'].map(column);

const stars = [];
for (const line of lines.slice(1)) {
    const fields = parse(line);
    const mag = Number(fields[MAG]);
    if (fields[PROPER] === 'Sol' || !(mag <= MAGNITUDE_LIMIT)) continue;

    const ci = fields[CI] === '' ? 0.6 : Number(fields[CI]); // Missing colour: assume sun-like
    stars.push([Number(fields[RA]), Number(fields[DEC]), mag, ci]);
}

// Brightest first, flattened as [raHours, decDegrees, magnitude, colorIndex, ...]
stars.sort((a, b) => a[2] - b[2]);
const round = (value, digits) => Number(value.toFixed(digits));
const data = stars.flatMap(([ra, dec, mag, ci]) => [round(ra, 4), round(dec, 3), round(mag, 2), round(ci, 2)]);

writeFileSync('src/data/stars.json', JSON.stringify({
    source: 'HYG database v3.8 (https://github.com/astronexus/HYG-Database), CC BY-SA 4.0',
    format: 'flat array of [raHours, decDegrees, magnitude, colorIndex], brightest first',
    stars: data
}));
console.log(`Wrote ${stars.length} stars (magnitude <= ${MAGNITUDE_LIMIT})`);
