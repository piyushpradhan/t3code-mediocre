/**
 * Both `apps/desktop/vite.config.ts` and the artifact stage in
 * scripts/build-desktop-artifact.ts derive from this list, so a package that is
 * external is also the only kind of package the staged production install
 * carries.
 */
export declare const DESKTOP_RUNTIME_EXTERNAL_PREFIXES: readonly [
  "@napi-rs/keyring",
  "@crowecawcaw/xa11y",
  "@clerk/electron-passkeys",
  "electron-webauthn",
  "ffi-rs",
  "@yuuang/",
  "playwright-core",
];
export declare function isDesktopRuntimeExternalDependency(id: string): boolean;
export declare function selectDesktopRuntimeExternalDependencies(
  dependencies: Readonly<Record<string, string>>,
): Record<string, string>;
