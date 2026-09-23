const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
})();

const ZIP_VERSION_ZIP64 = 45;
const GENERAL_PURPOSE_FLAGS = 0x0808;
const STORED_COMPRESSION_METHOD = 0;
const ZIP64_MAGIC_32 = 0xffffffff;
const ZIP64_MAGIC_16 = 0xffff;
const ZIP64_FIELD_LIMIT = 0xfffffffen;
const ZIP64_ENTRY_LIMIT = 0xfffe;

export type StoredZipEntry = {
  name: string;
  lastModified?: Date;
  stream: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
};

export type StoredZipCallbacks = {
  onEntryWritten?: (info: { name: string; bytes: bigint; offset: bigint }) => void;
  onCancel?: () => void;
  onError?: (error: unknown) => void;
  onComplete?: (info: { totalBytes: bigint; entryCount: number; usedZip64: boolean }) => void;
};

type CentralDirectoryRecord = {
  compressedSize: bigint;
  crc32: number;
  localHeaderOffset: bigint;
  nameBytes: Uint8Array;
  uncompressedSize: bigint;
  dosDate: number;
  dosTime: number;
};

function updateCrc32(current: number, chunk: Uint8Array) {
  let crc = current ^ 0xffffffff;

  for (let index = 0; index < chunk.length; index += 1) {
    crc = CRC32_TABLE[(crc ^ chunk[index]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(value: Date) {
  const year = Math.max(1980, value.getFullYear());
  const month = value.getMonth() + 1;
  const day = value.getDate();
  const hours = value.getHours();
  const minutes = value.getMinutes();
  const seconds = Math.floor(value.getSeconds() / 2);

  return {
    dosDate: ((year - 1980) << 9) | (month << 5) | day,
    dosTime: (hours << 11) | (minutes << 5) | seconds
  };
}

function writeUint64LE(buffer: Uint8Array, offset: number, value: bigint) {
  const view = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  view.writeBigUInt64LE(value, offset);
}

function createZip64ExtraField(values: bigint[]) {
  const buffer = new Uint8Array(4 + values.length * 8);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  view.setUint16(0, 0x0001, true);
  view.setUint16(2, values.length * 8, true);

  values.forEach((value, index) => {
    writeUint64LE(buffer, 4 + index * 8, value);
  });

  return buffer;
}

function createLocalFileHeader(nameBytes: Uint8Array, dosTime: number, dosDate: number) {
  // ZIP64 extra is present so the data descriptor following compressed data
  // can use 8-byte sizes (covers files > 4GB).
  const extraField = createZip64ExtraField([0n, 0n]);
  const buffer = new Uint8Array(30 + nameBytes.length + extraField.length);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, ZIP_VERSION_ZIP64, true);
  view.setUint16(6, GENERAL_PURPOSE_FLAGS, true);
  view.setUint16(8, STORED_COMPRESSION_METHOD, true);
  view.setUint16(10, dosTime, true);
  view.setUint16(12, dosDate, true);
  // APPNOTE 4.3.9.1: when bit 3 of the general-purpose flag is set, CRC and
  // both size fields MUST be zero in the local header. Real values go in the
  // trailing data descriptor.
  view.setUint32(14, 0, true);
  view.setUint32(18, 0, true);
  view.setUint32(22, 0, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, extraField.length, true);
  buffer.set(nameBytes, 30);
  buffer.set(extraField, 30 + nameBytes.length);

  return buffer;
}

function createDataDescriptor(crc32: number, size: bigint) {
  const buffer = new Uint8Array(24);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  view.setUint32(0, 0x08074b50, true);
  view.setUint32(4, crc32 >>> 0, true);
  writeUint64LE(buffer, 8, size);
  writeUint64LE(buffer, 16, size);

  return buffer;
}

function recordNeedsZip64(record: CentralDirectoryRecord) {
  return (
    record.uncompressedSize > ZIP64_FIELD_LIMIT ||
    record.compressedSize > ZIP64_FIELD_LIMIT ||
    record.localHeaderOffset > ZIP64_FIELD_LIMIT
  );
}

function createCentralDirectoryHeader(record: CentralDirectoryRecord) {
  const useZip64 = recordNeedsZip64(record);
  // Local header always uses ZIP64 streaming form (bit 3 + 8-byte data
  // descriptor + ZIP64 extra), so the version-needed-to-extract is 45 for
  // every entry regardless of whether the CD itself stores ZIP64 sizes.
  const versionNeeded = ZIP_VERSION_ZIP64;
  const extraField = useZip64
    ? createZip64ExtraField([
        record.uncompressedSize,
        record.compressedSize,
        record.localHeaderOffset
      ])
    : new Uint8Array(0);
  const buffer = new Uint8Array(46 + record.nameBytes.length + extraField.length);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, ZIP_VERSION_ZIP64, true);
  view.setUint16(6, versionNeeded, true);
  view.setUint16(8, GENERAL_PURPOSE_FLAGS, true);
  view.setUint16(10, STORED_COMPRESSION_METHOD, true);
  view.setUint16(12, record.dosTime, true);
  view.setUint16(14, record.dosDate, true);
  view.setUint32(16, record.crc32 >>> 0, true);
  view.setUint32(20, useZip64 ? ZIP64_MAGIC_32 : Number(record.compressedSize), true);
  view.setUint32(24, useZip64 ? ZIP64_MAGIC_32 : Number(record.uncompressedSize), true);
  view.setUint16(28, record.nameBytes.length, true);
  view.setUint16(30, extraField.length, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, useZip64 ? ZIP64_MAGIC_32 : Number(record.localHeaderOffset), true);
  buffer.set(record.nameBytes, 46);
  buffer.set(extraField, 46 + record.nameBytes.length);

  return buffer;
}

function createZip64EndOfCentralDirectory(
  entryCount: bigint,
  centralDirectorySize: bigint,
  centralDirectoryOffset: bigint
) {
  const buffer = new Uint8Array(56);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  view.setUint32(0, 0x06064b50, true);
  writeUint64LE(buffer, 4, 44n);
  view.setUint16(12, ZIP_VERSION_ZIP64, true);
  view.setUint16(14, ZIP_VERSION_ZIP64, true);
  view.setUint32(16, 0, true);
  view.setUint32(20, 0, true);
  writeUint64LE(buffer, 24, entryCount);
  writeUint64LE(buffer, 32, entryCount);
  writeUint64LE(buffer, 40, centralDirectorySize);
  writeUint64LE(buffer, 48, centralDirectoryOffset);

  return buffer;
}

function createZip64EndOfCentralDirectoryLocator(zip64EndOffset: bigint) {
  const buffer = new Uint8Array(20);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  view.setUint32(0, 0x07064b50, true);
  view.setUint32(4, 0, true);
  writeUint64LE(buffer, 8, zip64EndOffset);
  view.setUint32(16, 1, true);

  return buffer;
}

function createEndOfCentralDirectory(
  entryCount: number,
  centralDirectorySize: bigint,
  centralDirectoryOffset: bigint,
  useZip64: boolean
) {
  const buffer = new Uint8Array(22);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, useZip64 ? ZIP64_MAGIC_16 : entryCount, true);
  view.setUint16(10, useZip64 ? ZIP64_MAGIC_16 : entryCount, true);
  view.setUint32(
    12,
    useZip64 ? ZIP64_MAGIC_32 : Number(centralDirectorySize),
    true
  );
  view.setUint32(
    16,
    useZip64 ? ZIP64_MAGIC_32 : Number(centralDirectoryOffset),
    true
  );
  view.setUint16(20, 0, true);

  return buffer;
}

async function* asAsyncIterable(
  source: StoredZipEntry["stream"]
): AsyncGenerator<Uint8Array, void, undefined> {
  if (typeof (source as ReadableStream<Uint8Array>).getReader === "function") {
    const reader = (source as ReadableStream<Uint8Array>).getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          return;
        }

        if (value && value.byteLength > 0) {
          yield value;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  for await (const chunk of source as AsyncIterable<Uint8Array>) {
    if (chunk.byteLength > 0) {
      yield chunk;
    }
  }
}

export function createStoredZipStream(
  entries: AsyncIterable<StoredZipEntry> | Iterable<StoredZipEntry>,
  callbacks?: StoredZipCallbacks
) {
  const encoder = new TextEncoder();
  let cancelled = false;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        const records: CentralDirectoryRecord[] = [];
        let offset = 0n;

        try {
          for await (const entry of entries) {
            if (cancelled) {
              return;
            }

            const normalizedName = entry.name.replace(/^\/+/, "").replace(/\\/g, "/");
            if (!normalizedName) {
              continue;
            }

            const nameBytes = encoder.encode(normalizedName);
            const { dosDate, dosTime } = toDosDateTime(entry.lastModified ?? new Date());
            const localHeaderOffset = offset;
            const localHeader = createLocalFileHeader(nameBytes, dosTime, dosDate);
            controller.enqueue(localHeader);
            offset += BigInt(localHeader.byteLength);

            let crc32 = 0;
            let size = 0n;

            for await (const chunk of asAsyncIterable(entry.stream)) {
              if (cancelled) {
                return;
              }

              const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
              crc32 = updateCrc32(crc32, bytes);
              size += BigInt(bytes.byteLength);
              controller.enqueue(bytes);
              offset += BigInt(bytes.byteLength);
            }

            const descriptor = createDataDescriptor(crc32, size);
            controller.enqueue(descriptor);
            offset += BigInt(descriptor.byteLength);

            records.push({
              compressedSize: size,
              crc32,
              localHeaderOffset,
              nameBytes,
              uncompressedSize: size,
              dosDate,
              dosTime
            });

            callbacks?.onEntryWritten?.({ name: normalizedName, bytes: size, offset });
          }

          const centralDirectoryOffset = offset;

          for (const record of records) {
            const header = createCentralDirectoryHeader(record);
            controller.enqueue(header);
            offset += BigInt(header.byteLength);
          }

          const centralDirectorySize = offset - centralDirectoryOffset;
          const archiveNeedsZip64 =
            records.length > ZIP64_ENTRY_LIMIT ||
            centralDirectoryOffset > ZIP64_FIELD_LIMIT ||
            centralDirectorySize > ZIP64_FIELD_LIMIT ||
            records.some(recordNeedsZip64);

          if (archiveNeedsZip64) {
            const zip64EndOffset = offset;
            const zip64End = createZip64EndOfCentralDirectory(
              BigInt(records.length),
              centralDirectorySize,
              centralDirectoryOffset
            );
            controller.enqueue(zip64End);
            offset += BigInt(zip64End.byteLength);

            const zip64Locator = createZip64EndOfCentralDirectoryLocator(zip64EndOffset);
            controller.enqueue(zip64Locator);
            offset += BigInt(zip64Locator.byteLength);
          }

          const endOfCentralDirectory = createEndOfCentralDirectory(
            records.length,
            centralDirectorySize,
            centralDirectoryOffset,
            archiveNeedsZip64
          );
          controller.enqueue(endOfCentralDirectory);
          offset += BigInt(endOfCentralDirectory.byteLength);

          controller.close();
          callbacks?.onComplete?.({
            totalBytes: offset,
            entryCount: records.length,
            usedZip64: archiveNeedsZip64
          });
        } catch (error) {
          callbacks?.onError?.(error);
          controller.error(error);
        }
      })();
    },
    cancel() {
      cancelled = true;
      callbacks?.onCancel?.();
    }
  });
}
