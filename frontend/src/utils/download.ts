/** 浏览器端文件下载：把文本或二进制对象落成一个可直接保存的文件。 */

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function downloadText(filename: string, content: string, mime = 'text/csv;charset=utf-8'): void {
  triggerDownload(new Blob([content], { type: mime }), filename)
}

export function downloadBlob(filename: string, blob: Blob): void {
  triggerDownload(blob, filename)
}

/** 文件名里不允许出现的字符统一换成下划线。 */
export function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_')
}
