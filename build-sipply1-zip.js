const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC-32 table
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0, 0); return b; }

const EXCLUDED_DIRS = new Set(['.git', 'node_modules', '.DS_Store']);

function walkDir(dir, base) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = base ? base + '/' + entry.name : entry.name;
    if (entry.isDirectory()) {
      results.push(...walkDir(full, rel));
    } else {
      results.push({ full, rel });
    }
  }
  return results;
}

const srcDir = path.join(__dirname, 'Sipply1-extracted');
const outFile = path.join(__dirname, 'sipply1-blind-box-theme.zip');

const files = walkDir(srcDir, '');
const localHeaders = [];
const centralDirs = [];
let offset = 0;

for (const { full, rel } of files) {
  const raw = fs.readFileSync(full);
  const compressed = zlib.deflateRawSync(raw, { level: 6 });
  const useDef = compressed.length < raw.length;
  const data = useDef ? compressed : raw;
  const crc = crc32(raw);
  const nameBytes = Buffer.from(rel, 'utf8'); // forward slashes from rel

  const localHeader = Buffer.concat([
    Buffer.from([0x50, 0x4B, 0x03, 0x04]), // sig
    u16(20),           // version needed
    u16(0),            // flags
    u16(useDef ? 8 : 0), // compression
    u16(0), u16(0),    // mod time, date
    u32(crc),
    u32(data.length),
    u32(raw.length),
    u16(nameBytes.length),
    u16(0),            // extra
    nameBytes,
    data,
  ]);

  localHeaders.push(localHeader);

  const centralDir = Buffer.concat([
    Buffer.from([0x50, 0x4B, 0x01, 0x02]), // sig
    u16(20), u16(20),  // version made, needed
    u16(0),            // flags
    u16(useDef ? 8 : 0),
    u16(0), u16(0),
    u32(crc),
    u32(data.length),
    u32(raw.length),
    u16(nameBytes.length),
    u16(0), u16(0),    // extra, comment
    u16(0),            // disk start
    u16(0),            // int attr
    u32(0),            // ext attr
    u32(offset),       // local header offset
    nameBytes,
  ]);

  centralDirs.push(centralDir);
  offset += localHeader.length;
}

const centralDirBuf = Buffer.concat(centralDirs);
const eocd = Buffer.concat([
  Buffer.from([0x50, 0x4B, 0x05, 0x06]),
  u16(0), u16(0),
  u16(files.length),
  u16(files.length),
  u32(centralDirBuf.length),
  u32(offset),
  u16(0),
]);

fs.writeFileSync(outFile, Buffer.concat([...localHeaders, centralDirBuf, eocd]));
console.log(`Built ${outFile} with ${files.length} files`);
