/** Header Content-Disposition cho API-13 (RFC 6266 + RFC 5987), ví dụ ở ARCHITECTURE §A7.7. */
export function asciiFallbackFilename(filename: string): string {
  return filename
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '');
}

export function rfc5987Encode(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function attachmentDisposition(filename: string): string {
  return `attachment; filename="${asciiFallbackFilename(filename)}"; filename*=UTF-8''${rfc5987Encode(filename)}`;
}
