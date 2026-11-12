import {
  type EnvironmentId,
  type ProjectId,
  resolveEnvironmentMachineKind,
  SourceControlProviderKind,
} from "@t3tools/contracts";
import {
  getAddProjectInitialQuery,
  getCloneDestinationPath,
  getCloneDirectoryName,
  getCloneDirectoryPath,
} from "@t3tools/client-runtime/operations/projects";
import { inferProjectTitleFromPath } from "@t3tools/client-runtime/state/projects";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { resolvePastedPath } from "@t3tools/shared/path";
import { FolderGit2Icon, FolderPlusIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { create } from "zustand";

import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { readLocalApi } from "../localApi";
import { newProjectId } from "../lib/utils";
import { useProjects } from "../state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import { projectEnvironment } from "../state/projects";
import { sourceControlEnvironment } from "../state/sourceControl";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { useAtomCommand } from "../state/use-atom-command";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { EnvironmentMachineIcon } from "./EnvironmentMachineIcon";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { MiddleTruncate } from "./ui/middle-truncate";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./ui/select";

const useRequest = create<{ open: boolean; environmentId: EnvironmentId | null; session: number }>(
  () => ({ open: false, environmentId: null, session: 0 }),
);

/** Opens the dialog that groups projects into a product, on `environmentId` when given. */
export function openAddProductDialog(environmentId: EnvironmentId | null = null): void {
  useRequest.setState((state) => ({ open: true, environmentId, session: state.session + 1 }));
}

function close() {
  useRequest.setState({ open: false });
}

export function AddProductDialogHost() {
  const open = useRequest((state) => state.open);
  const session = useRequest((state) => state.session);
  const environmentId = useRequest((state) => state.environmentId);
  return open ? <AddProductDialog key={session} requestedEnvironmentId={environmentId} /> : null;
}

const nowIso = () => new Date().toISOString();

type Adding = { kind: "folder"; path: string } | { kind: "clone"; repository: string };

function AddProductDialog({
  requestedEnvironmentId,
}: {
  requestedEnvironmentId: EnvironmentId | null;
}) {
  const id = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const handleNewThread = useNewThreadHandler();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  // Older servers cannot create products.
  const machines = useEnvironments().environments.filter(
    (environment) => environment.serverConfig?.environment.capabilities.projectProducts === true,
  );
  const [machineId, setMachineId] = useState(requestedEnvironmentId ?? primaryEnvironmentId);
  const machine =
    machines.find((environment) => environment.environmentId === machineId) ?? machines[0] ?? null;
  const environmentId = machine?.environmentId ?? null;
  const settings = machine?.serverConfig?.settings;

  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<ProjectId>>(new Set());
  const [adding, setAdding] = useState<Adding | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createProduct = useOrchestrationCommand(projectEnvironment.createProduct, {
    reportFailure: false,
  });
  const createProject = useOrchestrationCommand(projectEnvironment.create, {
    reportFailure: false,
  });
  const startClone = useAtomCommand(sourceControlEnvironment.startProjectClone, {
    reportFailure: false,
  });

  const projects = useProjects().filter(
    (project) =>
      project.environmentId === environmentId &&
      project.isScratch !== true &&
      project.productProjectIds == null &&
      (project.archivedAt == null || selected.has(project.id)),
  );
  const toggle = (projectId: ProjectId, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(projectId);
      else next.delete(projectId);
      return next;
    });
  const select = (projectId: ProjectId) => toggle(projectId, true);

  const failureText = (
    result: Parameters<typeof squashAtomCommandFailure>[0],
    fallback: string,
  ) => {
    const failure = squashAtomCommandFailure(result);
    return failure instanceof Error ? failure.message : fallback;
  };

  const cloneDestination = (repository: string) =>
    getCloneDestinationPath(
      getAddProjectInitialQuery(settings?.addProjectBaseDirectory),
      getCloneDirectoryPath(repository, settings?.ghqCloneLayout === true),
    );

  const addFolder = async (path: string) => {
    if (environmentId === null) return;
    const workspaceRoot = path.trim();
    // An already added folder is just picked.
    const existing = projects.find((project) => project.workspaceRoot === workspaceRoot);
    if (existing) {
      select(existing.id);
      setAdding(null);
      return;
    }
    const projectId = newProjectId();
    const result = await createProject({
      environmentId,
      input: { projectId, title: inferProjectTitleFromPath(workspaceRoot), workspaceRoot },
    });
    if (result._tag === "Failure") {
      setError(failureText(result, "Could not add the folder."));
      return;
    }
    select(projectId);
    setAdding(null);
  };

  const cloneRepository = async (repository: string) => {
    if (environmentId === null) return;
    const trimmed = repository.trim();
    // `owner/repo` goes through the configured GitHub account, like Add project.
    const shorthand = /^[\w.-]+\/[\w.-]+$/.test(trimmed);
    const projectId = newProjectId();
    const result = await startClone({
      environmentId,
      input: {
        projectId,
        title: getCloneDirectoryName(trimmed) || trimmed,
        createdAt: nowIso(),
        ...(shorthand
          ? { provider: SourceControlProviderKind.make("github"), repository: trimmed }
          : { remoteUrl: trimmed }),
        destinationPath: cloneDestination(trimmed),
      },
    });
    if (result._tag === "Failure") {
      setError(failureText(result, "Could not start the clone."));
      return;
    }
    select(projectId);
    setAdding(null);
  };

  const pickFolder =
    environmentId !== null && environmentId === primaryEnvironmentId && window.desktopBridge
      ? async () => {
          const picked = await readLocalApi()?.dialogs.pickFolder();
          if (picked) setAdding({ kind: "folder", path: picked });
        }
      : undefined;

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    await work();
    setBusy(false);
  };

  const submitAdding = () =>
    adding?.kind === "folder"
      ? run(() => addFolder(adding.path))
      : adding?.kind === "clone"
        ? run(() => cloneRepository(adding.repository))
        : Promise.resolve();

  const submit = () =>
    run(async () => {
      if (environmentId === null) return;
      const projectId = newProjectId();
      const result = await createProduct({
        environmentId,
        input: { projectId, title: title.trim(), productProjectIds: [...selected] },
      });
      if (result._tag === "Failure") {
        setError(failureText(result, "Could not create the product."));
        return;
      }
      close();
      void handleNewThread(scopeProjectRef(environmentId, projectId));
    });

  const addingValue = adding?.kind === "folder" ? adding.path : (adding?.repository ?? "");
  const canSubmit = !busy && environmentId !== null && title.trim().length > 0 && selected.size > 0;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogPopup className="sm:max-w-xl" initialFocus={nameRef}>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (adding) void submitAdding();
            else if (canSubmit) void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Add product</DialogTitle>
            <DialogDescription>
              Group projects so one thread works across all of them. Threads start in a folder that
              holds every project; worktree threads get a worktree of each Git project on one
              branch.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-name`}>Name</Label>
              <Input
                id={`${id}-name`}
                ref={nameRef}
                value={title}
                placeholder="Acme"
                autoComplete="off"
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            {machines.length > 1 ? (
              <div className="flex flex-col gap-1.5">
                <Label>Machine</Label>
                <Select
                  value={environmentId}
                  onValueChange={(value) => {
                    if (!value || value === environmentId) return;
                    setMachineId(value);
                    setSelected(new Set());
                    setAdding(null);
                  }}
                  items={machines.map((m) => ({ value: m.environmentId, label: m.label }))}
                >
                  <SelectTrigger size="sm" aria-label="Machine for the product">
                    {machine ? (
                      <EnvironmentMachineIcon
                        kind={resolveEnvironmentMachineKind(machine.serverConfig ?? null)}
                        className="size-3.5"
                      />
                    ) : null}
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {machines.map((m) => (
                      <SelectItem key={m.environmentId} value={m.environmentId}>
                        <span className="inline-flex items-center gap-1.5">
                          <EnvironmentMachineIcon
                            kind={resolveEnvironmentMachineKind(m.serverConfig ?? null)}
                            className="size-3"
                          />
                          {m.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Label className="flex-1">Projects</Label>
                {selected.size > 0 ? (
                  <span className="text-muted-foreground text-xs">{selected.size} selected</span>
                ) : null}
              </div>
              {projects.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  No projects on this machine yet. Add a folder or clone a repository.
                </p>
              ) : (
                <div className="max-h-52 overflow-y-auto rounded-md border">
                  {projects.map((project) => (
                    <label
                      key={project.id}
                      className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm not-last:border-b"
                    >
                      <Checkbox
                        checked={selected.has(project.id)}
                        onCheckedChange={(checked) => toggle(project.id, checked)}
                      />
                      <span className="shrink-0 truncate">{project.title}</span>
                      <span className="flex min-w-0 flex-1 justify-end font-mono text-muted-foreground text-xs">
                        <MiddleTruncate value={project.workspaceRoot} />
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {adding ? (
                <div className="flex flex-col gap-1.5 pt-1">
                  <Label htmlFor={`${id}-adding`}>
                    {adding.kind === "folder" ? "Folder" : "Git repository"}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`${id}-adding`}
                      autoFocus
                      size="sm"
                      value={addingValue}
                      placeholder={
                        adding.kind === "folder"
                          ? getAddProjectInitialQuery(settings?.addProjectBaseDirectory)
                          : "https://github.com/owner/repo.git or owner/repo"
                      }
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(event) =>
                        setAdding(
                          adding.kind === "folder"
                            ? {
                                kind: "folder",
                                path: resolvePastedPath(adding.path, event.target.value),
                              }
                            : { kind: "clone", repository: event.target.value },
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.stopPropagation();
                          setAdding(null);
                        }
                      }}
                    />
                    {adding.kind === "folder" && pickFolder ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void pickFolder()}
                      >
                        Browse…
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => setAdding(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy || addingValue.trim().length === 0}
                      onClick={() => void submitAdding()}
                    >
                      {adding.kind === "folder" ? "Add" : "Clone"}
                    </Button>
                  </div>
                  {adding.kind === "clone" && addingValue.trim().length > 0 ? (
                    <span className="flex min-w-0 font-mono text-muted-foreground text-xs">
                      <MiddleTruncate value={cloneDestination(addingValue.trim())} />
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={environmentId === null}
                    onClick={() => setAdding({ kind: "folder", path: "" })}
                  >
                    <FolderPlusIcon aria-hidden />
                    Add folder
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={environmentId === null}
                    onClick={() => setAdding({ kind: "clone", repository: "" })}
                  >
                    <FolderGit2Icon aria-hidden />
                    Clone repository
                  </Button>
                </div>
              )}
            </div>

            {error ? <p className="text-destructive-foreground text-sm">{error}</p> : null}
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || adding !== null}>
              {busy && adding === null ? "Creating…" : "Create product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
