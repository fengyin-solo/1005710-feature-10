/** 极简 ZIP（store 方式，不压缩）打包：纯前端把多册文件一次装成一个压缩包下载，不引第三方库。 */

type ZipEntry = {
  filename: string
  content: string
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const encoder = new TextEncoder()

/** 生成 ZIP 二进制；文件名、内容都按 UTF-8 写入（标志位置 0x0800），中文不乱码。 */
export function buildZip(entries: ZipEntry[]): Blob {
  const encoderChunk = new TextEncoder()
  const fileParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoderChunk.encode(entry.filename)
    // CSV 文本在调用处已带 BOM，这里直接整份转字节。
    const dataBytes = encoderChunk.encode(entry.content)
    const crc = crc32(dataBytes)

    // 本地文件头（30 字节定长 + 文件名）
    const local = new ArrayBuffer(30 + nameBytes.length)
    const localView = new DataView(local)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true) // 解压所需版本
    localView.setUint16(6, 0x0800, true) // UTF-8 文件名
    localView.setUint16(8, 0, true) // store，不压缩
    localView.setUint16(10, 0, true) // 修改时间
    localView.setUint16(12, 0x21, true) // 修改日期（1980-01-01）
    localView.setUint32(14, crc, true)
    localView.setUint32(18, dataBytes.length, true)
    localView.setUint32(22, dataBytes.length, true)
    localView.setUint16(26, nameBytes.length, true)
    localView.setUint16(28, 0, true)
    new Uint8Array(local, 30, nameBytes.length).set(nameBytes)

    fileParts.push(new Uint8Array(local), dataBytes)

    // 中央目录记录（46 字节定长 + 文件名）
    const central = new ArrayBuffer(46 + nameBytes.length)
    const centralView = new DataView(central)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0x0800, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint16(12, 0, true)
    centralView.setUint16(14, 0x21, true)
    centralView.setUint32(16, crc, true)
    centralView.setUint32(20, dataBytes.length, true)
    centralView.setUint32(24, dataBytes.length, true)
    centralView.setUint16(28, nameBytes.length, true)
    centralView.setUint32(42, offset, true)
    new Uint8Array(central, 46, nameBytes.length).set(nameBytes)
    centralParts.push(new Uint8Array(central))

    offset += 30 + nameBytes.length + dataBytes.length
  }

  let centralSize = 0
  for (const part of centralParts) centralSize += part.length

  const end = new ArrayBuffer(22)
  const endView = new DataView(end)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)

  const allParts: Uint8Array[] = [...fileParts, ...centralParts, new Uint8Array(end)]
  const totalLength = allParts.reduce((sum, part) => sum + part.length, 0)
  const merged = new Uint8Array(totalLength)
  let cursor = 0
  for (const part of allParts) {
    merged.set(part, cursor)
    cursor += part.length
  }
  return new Blob([merged.buffer], {
    type: 'application/zip',
  })
}
