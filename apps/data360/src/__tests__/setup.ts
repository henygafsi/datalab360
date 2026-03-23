/**
 * Data360 Pro — Frontend Test Setup
 * =====================================
 * Configure: vitest / jest globals, mock providers, API client mock
 *
 * Referenced by: vitest.config.ts or jest.config.ts setupFilesAfterFramework
 */

// ---------------------------------------------------------------------------
// Global mocks for Data360 frontend
// ---------------------------------------------------------------------------

// Mock Next.js router
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    children,
}));

// Mock Next.js Image
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => null,
}));

// ---------------------------------------------------------------------------
// Mock apiClient (axios instance) — never hit real backend in unit tests
// ---------------------------------------------------------------------------
vi.mock('@/config/database.config', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { data: [], execution_time_ms: 10 } }),
    post: vi.fn().mockResolvedValue({ data: { status: 'ok' } }),
    put: vi.fn().mockResolvedValue({ data: { status: 'updated' } }),
    delete: vi.fn().mockResolvedValue({ data: { status: 'deleted' } }),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock localStorage (auth token)
// ---------------------------------------------------------------------------
const localStorageMock = (() => {
  let store: Record<string, string> = {
    auth_token: 'data360-mock-test-token',
    data360_theme: 'light',
  };
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// ---------------------------------------------------------------------------
// Mock ResizeObserver (needed for Recharts/responsive containers)
// ---------------------------------------------------------------------------
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock matchMedia (dark mode detection)
// ---------------------------------------------------------------------------
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ---------------------------------------------------------------------------
// Suppress console.error for expected test warnings
// ---------------------------------------------------------------------------
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = (...args: unknown[]) => {
    const msg = String(args[0]);
    // Suppress known React/Next.js test noise
    if (
      msg.includes('Warning: ReactDOM.render') ||
      msg.includes('act(...)') ||
      msg.includes('Warning: An update to')
    ) return;
    originalConsoleError(...args);
  };
});

afterEach(() => {
  console.error = originalConsoleError;
  vi.clearAllMocks();
});
