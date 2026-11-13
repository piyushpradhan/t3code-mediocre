/**
 * Two consumers derive from this list, and they must never disagree:
 *
 * - apps/server/vite.config.ts decides what stays external to the bundle.
 * - scripts/build-desktop-artifact.ts selects the runtime dependency roots for
 *   the Windows server sidecar.
 *
 */
/**
 * An external package is loaded from the real filesystem, so its own `require`
 * also resolves from the real filesystem; a dependency that was bundled away
 * exists only inside the emitted bundle and is unreachable there.
 */
export declare const CLI_RUNTIME_EXTERNAL_PREFIXES: readonly [
  "@cursor/sdk",
  "playwright-core",
  "node-pty",
  "ffi-rs",
  "@yuuang/",
  "@ff-labs/",
  "@napi-rs/keyring",
  "@clerk/electron-passkeys",
  "node-gyp-build",
  "node-addon-api",
  "bufferutil",
  "utf-8-validate",
];
export declare function isRuntimeExternalCliDependency(id: string): boolean;
/**
 * This has to be wired to the bundler's `neverBundle`, not just to
 * `alwaysBundle`. `alwaysBundle` only forces packages IN — returning false from
 * it means "no opinion", and the default then applies: a declared dependency
 * stays external, but a transitive one gets bundled.
 */
export declare function isExternalCliDependency(id: string): boolean;
export declare function shouldBundleCliDependency(id: string): boolean;
export declare function selectCliRuntimeExternalDependencies(
  dependencies: Readonly<Record<string, string>>,
): Record<string, string>;
/**
 * `regionCount` is reported so the caller can tell "nothing was inlined" apart
 * from "the marker format changed and this scan no longer sees anything".
 */
export declare function findInlinedExternalPackages(source: string): {
  readonly regionCount: number;
  readonly inlined: ReadonlyArray<string>;
  readonly inlinedPackages: ReadonlyArray<string>;
};
