/**
 * Next.js Instrumentation file.
 * This runs once when the Next.js server starts.
 *
 * Polyfills `localStorage` for Node.js v22+ where the global exists
 * but methods like getItem/setItem are undefined without --localstorage-file.
 * This prevents "localStorage.getItem is not a function" errors from
 * third-party packages (e.g., Firebase, Genkit) that check for localStorage.
 */
export async function register() {
  if (typeof globalThis.localStorage !== 'undefined') {
    const storage = globalThis.localStorage;

    // Check if getItem is missing (broken Node.js localStorage)
    if (typeof storage.getItem !== 'function') {
      const store = new Map<string, string>();

      // Polyfill localStorage with an in-memory implementation
      const polyfill = {
        getItem(key: string): string | null {
          return store.get(key) ?? null;
        },
        setItem(key: string, value: string): void {
          store.set(key, String(value));
        },
        removeItem(key: string): void {
          store.delete(key);
        },
        clear(): void {
          store.clear();
        },
        get length(): number {
          return store.size;
        },
        key(index: number): string | null {
          const keys = Array.from(store.keys());
          return keys[index] ?? null;
        },
      };

      Object.defineProperty(globalThis, 'localStorage', {
        value: polyfill,
        writable: true,
        configurable: true,
      });
    }
  }
}
