/**
 * Test-only replacement for the `server-only` marker package.
 *
 * `server-only` is a build-time marker: its default entry throws so a Client
 * Component cannot import server code. Resolved under the `react-server`
 * condition it is an empty module, which is how Next.js uses it.
 *
 * Integration tests need the *real* service module (`gate.ts`), and in a bare
 * Node process there is no bundler to apply that condition — so the import
 * throws and the service becomes untestable. Aliasing the marker to this empty
 * module restores the react-server semantics for tests only.
 *
 * This does NOT weaken the boundary: the alias lives solely in
 * `vitest.integration.config.ts`, and the Next.js build still resolves the real
 * package.
 */
export {};
