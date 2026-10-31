/** Tiền tố đường dẫn → module chẩn đoán (ARCHITECTURE §A12.7). */
export function moduleOf(path: string): string {
  const pathname = path.split('?')[0] ?? '';
  for (const [prefix, module] of [
    ['/api/auth', 'auth'],
    ['/api/documents', 'documents'],
    ['/api/me', 'users'],
    ['/api/users', 'users'],
    ['/api/friends', 'friends'],
    ['/api/health', 'health'],
  ] as const) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return module;
  }
  return 'http';
}
