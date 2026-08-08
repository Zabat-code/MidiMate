const fs = require('fs');
const [target, jsonPath] = process.argv.slice(2);
if (!target || !jsonPath) { console.error('usage: node translate_runner.cjs <file> <reps.json>'); process.exit(1); }
const reps = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const raw = fs.readFileSync(target, 'utf8');
const hadCRLF = raw.includes('\r\n');
let s = raw.replace(/\r\n/g, '\n');
const missed = [];
let applied = 0;
for (const r of reps) {
  let old, neu, all = false;
  if (Array.isArray(r)) { [old, neu] = r; }
  else { old = r.old; neu = r.new; all = !!r.all; }
  const cnt = s.split(old).length - 1;
  if (cnt === 0) { missed.push('NOT FOUND: ' + old.slice(0, 90)); continue; }
  if (!all && cnt > 1) { missed.push('MULTIPLE(' + cnt + '): ' + old.slice(0, 90)); continue; }
  s = s.split(old).join(neu);
  applied++;
}
if (hadCRLF) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(target, s, 'utf8');
const lines = s.split('\n');
let leftover = [];
lines.forEach((ln, i) => {
  if (/[áéíóúñÁÉÍÓÚÑ¿¡]/.test(ln)) leftover.push((i + 1) + ': ' + ln.trim().slice(0, 120));
});
console.log('FILE:', target, '(CRLF=' + hadCRLF + ')');
console.log('  applied:', applied, '/', reps.length, '| missed:', missed.length);
if (missed.length) console.log('  MISSED:\n   ' + missed.join('\n   '));
console.log('  leftover accented lines:', leftover.length);
if (leftover.length) console.log('   ' + leftover.join('\n   '));
