// build-constellations.mjs - Constellation figures and names from d3-celestial into
// src/data/constellations.json
//
// Usage: node scripts/build-constellations.mjs path/to/constellations.lines.json path/to/constellations.json
// d3-celestial: https://github.com/ofrohn/d3-celestial (BSD 3-clause, Olaf Frohn), data/ folder
//
// Output: { constellations: [{ id, name, meaning, lines: [[raHours, dec, ...], ...] }] }
// Each line is a flat list of points (RA in hours, Dec in degrees, J2000), rounded to ~0.01°.

import { readFileSync, writeFileSync } from 'node:fs';

const [linesPath, namesPath] = process.argv.slice(2);
if (!linesPath || !namesPath) {
    console.error('Usage: node scripts/build-constellations.mjs constellations.lines.json constellations.json');
    process.exit(1);
}

const lines = JSON.parse(readFileSync(linesPath, 'utf8')).features;
const names = new Map(JSON.parse(readFileSync(namesPath, 'utf8')).features.map(feature => [feature.id, feature]));

// d3-celestial gives RA in degrees from -180 to 180
const raHours = degrees => +((((degrees % 360) + 360) % 360) / 15).toFixed(4);
const dec = degrees => +degrees.toFixed(2);

// Better-known English names where d3-celestial's differ, or where it has none
const MEANINGS = {
    And: 'the Chained Princess', Aqr: 'the Water Bearer', Cap: 'the Sea Goat', Cas: 'the Queen',
    Cep: 'the King', Com: "Berenice's Hair", Eri: 'the River', Hyi: 'the Little Water Snake',
    Men: 'the Table Mountain', Oph: 'the Serpent Bearer', Ori: 'the Hunter', Peg: 'the Winged Horse',
    Per: 'the Hero', Pup: 'the Stern', Ser: 'the Serpent', UMa: 'the Great Bear', UMi: 'the Little Bear'
};

// "Ram" -> "the Ram"; none when the English name is the Latin one (e.g. "Hercules")
const meaningOf = (id, latin, english) => {
    if (MEANINGS[id]) return MEANINGS[id];
    return !english || english === latin ? '' : `the ${english}`;
};

const constellations = lines.map(feature => {
    const info = names.get(feature.id);
    return {
        id: feature.id,
        name: feature.id === 'Ser' ? 'Serpens' : info.properties.name, // Its head and tail are two figures
        meaning: meaningOf(feature.id, info.properties.name, info.properties.en),
        lines: feature.geometry.coordinates.map(line => line.flatMap(([ra, d]) => [raHours(ra), dec(d)]))
    };
});

writeFileSync(new URL('../src/data/constellations.json', import.meta.url), JSON.stringify({ constellations }));
console.log(`${constellations.length} constellations, ${constellations.reduce((n, c) => n + c.lines.length, 0)} lines`);
