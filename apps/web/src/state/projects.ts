import { createEnvironmentProjectAtoms } from "@t3tools/client-runtime/state/projects";
import { createProjectEnvironmentAtoms } from "@t3tools/client-runtime/state/projects";
import { createEnvironmentRpcQueryAtomFamily } from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";

import { environmentCatalog } from "../connection/catalog";
import { connectionAtomRuntime } from "../connection/runtime";
import { environmentShell, environmentSnapshotAtom, expectsPrimaryEnvironment } from "./shell";
import { parseScopedProjectKey } from "@t3tools/client-runtime/environment";
import { AVAILABLE_CONNECTION_STATE } from "@t3tools/client-runtime/connection";
import { AsyncResult, Atom } from "effect/reactivity";
import { serverEnvironment } from "./server";

export const environmentProjects = createEnvironmentProjectAtoms({
  catalogValueAtom: environmentCatalog.catalogValueAtom,
  snapshotAtom: environmentSnapshotAtom,
  serverConfigValueAtom: serverEnvironment.configValueAtom,
});
export const projectEnvironment = createProjectEnvironmentAtoms(connectionAtomRuntime, {
  projectAtom: environmentProjects.projectAtom,
});
export const projectContentSearch = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:projects:search-contents",
  tag: WS_METHODS.projectsSearchContents,
  staleTimeMs: 5_000,
  idleTtlMs: 60_000,
});
/**
 * Web-only: windows of px0-highlighted lines for the read-only Files surface.
 * Keyed by line window, so scrolling a large file fetches only what is shown.
 */
export const px0File = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:px0:file",
  tag: WS_METHODS.px0File,
  staleTimeMs: 30_000,
  idleTtlMs: 60_000,
});
export const px0Table = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:px0:table",
  tag: WS_METHODS.px0Table,
  staleTimeMs: 30_000,
  idleTtlMs: 60_000,
});

export const defaultProjectFallbackReadyAtom = Atom.family((projectKey: string | null) =>
  Atom.make((get) => {
    const remembered = projectKey === null ? null : parseScopedProjectKey(projectKey);
    if (!remembered) return true;
    const catalog = get(environmentCatalog.catalogValueAtom);
    if (!catalog.isReady) return false;
    if (
      expectsPrimaryEnvironment() &&
      !Array.from(catalog.entries.values()).some(
        (entry) => entry.target._tag === "PrimaryConnectionTarget",
      )
    )
      return false;
    const entry = catalog.entries.get(remembered.environmentId);
    if (!entry?.enabled || entry.unsupportedReason !== undefined) return true;
    if (get(environmentShell.statusAtom(remembered.environmentId)) === "live") return true;
    const connection = AsyncResult.getOrElse(
      get(environmentCatalog.stateAtom(remembered.environmentId)),
      () => AVAILABLE_CONNECTION_STATE,
    );
    return (
      connection.phase === "offline" ||
      connection.phase === "blocked" ||
      (connection.phase === "backoff" && connection.attempt > 2)
    );
  }).pipe(Atom.withLabel(`web-default-project-fallback-ready:${projectKey}`)),
);
