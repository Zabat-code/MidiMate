const fs = require('fs');
const path = 'src/i18.js';
let src = fs.readFileSync(path, 'utf8');

const entryRe = /(\w+):\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*,?/g;

const enMatch = src.match(/  en: \{([\s\S]*?)\n  \}\n\};/);
if (!enMatch) { console.error('en block not found'); process.exit(1); }
const enContent = enMatch[1];
const enDict = {};
let m;
while ((m = entryRe.exec(enContent))) { enDict[m[1]] = m[2]; }

const esMatch = src.match(/  es: \{([\s\S]*?)\n  \},/);
if (!esMatch) { console.error('es block not found'); process.exit(1); }
const esContent = esMatch[1];

let missing = [];
const newEs = esContent.replace(/(\s*)(\w+):\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')(\s*,?)/g,
  (full, indent, key, val, comma) => {
    if (enDict[key] !== undefined) return `${indent}${key}: ${enDict[key]}${comma}`;
    missing.push(key);
    return full;
  });

let newSrc = src.slice(0, esMatch.index) + '  es: {' + newEs + '\n  },' + src.slice(esMatch.index + esMatch[0].length);

newSrc = newSrc.replace('// src/i18n.js - Idiomas y traducción', '// src/i18n.js - Languages and translation');
newSrc = newSrc.replace('  // Actualizar etiquetas que dependen de i18n', '  // Update labels that depend on i18n');

fs.writeFileSync(path, newSrc, 'utf8');

const c = esContent.match(/(\w+):\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g) || [];
console.log('en entries:', Object.keys(enDict).length);
console.log('es entries:', c.length);
console.log('missing (es keys not in en):', missing);
