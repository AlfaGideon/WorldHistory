/**
 * Minimal, dependency-free ZIP reader/writer with APK alignment.
 *
 * Android requires every uncompressed entry in an APK (resources.arsc, assets,
 * PNGs) to start at an offset that is a multiple of 4, otherwise the resources
 * cannot be memory-mapped. `zipalign` from the Android build-tools does this;
 * here it is reimplemented so the APK build works without the full SDK.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

const UTF8_NAME_FLAG = 0x0800;

export function readZip(filePath) {
  const buffer = fs.readFileSync(filePath);
  const eocd = findEocd(buffer);
  let offset = eocd.offset;

  const entryCount = buffer.readUInt16LE(offset + 10);
  let pointer = buffer.readUInt32LE(offset + 16);
  const entries = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(pointer) !== SIG_CENTRAL) throw new Error('Повреждён ZIP: не найдена запись центрального каталога');
    const flags = buffer.readUInt16LE(pointer + 8);
    const method = buffer.readUInt16LE(pointer + 10);
    const crc32 = buffer.readUInt32LE(pointer + 16);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const uncompressedSize = buffer.readUInt32LE(pointer + 24);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const externalAttrs = buffer.readUInt32LE(pointer + 38);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString('utf8', pointer + 46, pointer + 46 + nameLength);

    // Read the raw (still compressed) payload straight from the local record.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);

    entries.push({
      name,
      method,
      flags: flags & ~0x08, // Drop the data-descriptor bit: sizes are known.
      crc32,
      uncompressedSize,
      externalAttrs,
      data: Buffer.from(data),
      // Payload is kept exactly as stored in the source archive (already
      // compressed for DEFLATE entries), so it is copied byte for byte.
      raw: { method, payload: Buffer.from(data), crc32, size: uncompressedSize },
    });

    pointer += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function findEocd(buffer) {
  const max = Math.min(buffer.length, 66_000);
  for (let size = 22; size <= max; size += 1) {
    const offset = buffer.length - size;
    if (offset >= 0 && buffer.readUInt32LE(offset) === SIG_EOCD) return { offset };
  }
  throw new Error('Повреждён ZIP: не найден EOCD');
}

const toBuffer = (value) => (Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8'));

/** Deflates the payload for the given entry when compression is requested. */
function pack(entry) {
  const raw = toBuffer(entry.data ?? '');
  if (!entry.compress) {
    return { method: 0, payload: raw, crc32: crc32Of(raw), size: raw.length };
  }
  const deflated = zlib.deflateRawSync(raw, { level: 9 });
  if (deflated.length >= raw.length) {
    return { method: 0, payload: raw, crc32: crc32Of(raw), size: raw.length };
  }
  return { method: 8, payload: deflated, crc32: crc32Of(raw), size: raw.length };
}

let crcTable = null;
function crc32Of(buffer) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) crc = (crc >>> 8) ^ crcTable[(crc ^ buffer[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

/**
 * Writes a ZIP archive, 4-byte aligning every uncompressed entry.
 * `entries` items: { name, data, compress? }
 */
export function writeZipAligned(filePath, entries, alignment = 4) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const { method, payload, crc32, size } = entry.raw || pack(entry);
    const flags = (entry.flags ?? 0) | UTF8_NAME_FLAG;

    // Pad the local extra field until the payload starts on an aligned offset.
    let extraLength = 0;
    if (method === 0) {
      const headerSize = 30 + nameBuffer.length;
      let dataOffset = offset + headerSize;
      while (dataOffset % alignment !== 0) {
        extraLength += 1;
        dataOffset += 1;
      }
    }

    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4); // version needed to extract (2.0)
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0x21, 12); // mod date (a stable, valid DOS date)
    local.writeUInt32LE(crc32, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(extraLength, 28);

    chunks.push(local, nameBuffer);
    if (extraLength > 0) chunks.push(Buffer.alloc(extraLength));
    chunks.push(payload);

    const centralRecord = Buffer.alloc(46);
    centralRecord.writeUInt32LE(SIG_CENTRAL, 0);
    centralRecord.writeUInt16LE(20, 4); // version made by
    centralRecord.writeUInt16LE(20, 6); // version needed
    centralRecord.writeUInt16LE(flags, 8);
    centralRecord.writeUInt16LE(method, 10);
    centralRecord.writeUInt16LE(0, 12);
    centralRecord.writeUInt16LE(0x21, 14);
    centralRecord.writeUInt32LE(crc32, 16);
    centralRecord.writeUInt32LE(payload.length, 20);
    centralRecord.writeUInt32LE(size, 24);
    centralRecord.writeUInt16LE(nameBuffer.length, 28);
    centralRecord.writeUInt16LE(0, 30); // extra
    centralRecord.writeUInt16LE(0, 32); // comment
    centralRecord.writeUInt16LE(0, 34); // disk number
    centralRecord.writeUInt16LE(0, 36); // internal attrs
    centralRecord.writeUInt32LE(entry.externalAttrs ?? 0, 38);
    centralRecord.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([centralRecord, nameBuffer]));

    offset += local.length + nameBuffer.length + extraLength + payload.length;
  }

  const centralSize = central.reduce((sum, record) => sum + record.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.concat([...chunks, ...central, eocd]));
  return filePath;
}

const COMPRESSED_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.html', '.htm', '.json', '.svg', '.webmanifest', '.xml', '.txt', '.map']);

/** Adds every file under `dir` into the entry list under `prefix`. */
export function collectFiles(entries, dir, prefix = '', { compressAll = null } = {}) {
  const walk = (current, relative) => {
    for (const item of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, item.name);
      const rel = relative ? `${relative}/${item.name}` : item.name;
      if (item.isDirectory()) {
        walk(full, rel);
        continue;
      }
      const entry = {
        name: prefix ? `${prefix}/${rel}` : rel,
        data: fs.readFileSync(full),
      };
      const ext = path.extname(item.name).toLowerCase();
      entry.compress = compressAll === null ? COMPRESSED_EXTENSIONS.has(ext) : compressAll;
      entries.push(entry);
    }
  };
  walk(dir, '');
  return entries;
}
