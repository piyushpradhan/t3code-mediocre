import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { ChevronDownIcon } from "lucide-react";

import type { SidebarProjectGroupMember } from "../../sidebarProjectGrouping";
import { useProjects, useServerConfigs } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { Button } from "../ui/button";
import { Menu, MenuCheckboxItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { SettingsRow, SettingsSection } from "./settingsLayout";

/** A product's members are projects on its own machine, so each checkout lists its own. */
export function ProjectProductSettings({
  members,
  editableIds,
}: {
  members: ReadonlyArray<SidebarProjectGroupMember>;
  editableIds: ReadonlySet<EnvironmentId>;
}) {
  const projects = useProjects();
  const serverConfigs = useServerConfigs();
  const updateProject = useOrchestrationCommand(projectEnvironment.update);
  const supported = members.filter(
    (member) =>
      member.productProjectIds != null &&
      serverConfigs.get(member.environmentId)?.environment.capabilities.projectProducts === true,
  );
  if (supported.length === 0) return null;

  return (
    <SettingsSection title="Product">
      <p className="px-3 py-2.5 text-xs text-muted-foreground sm:px-4">
        Threads start in the product's folder, which holds every project below. Threads in a
        worktree get a worktree of each Git project, on the same branch.
      </p>
      {supported.map((member) => {
        const selected = new Set(member.productProjectIds ?? []);
        const candidates = projects.filter(
          (project) =>
            project.environmentId === member.environmentId &&
            project.id !== member.id &&
            project.isScratch !== true &&
            project.productProjectIds == null &&
            (project.archivedAt == null || selected.has(project.id)),
        );
        const titles = candidates
          .filter((project) => selected.has(project.id))
          .map((project) => project.title);
        const toggle = (projectId: ProjectId, checked: boolean) => {
          const next = checked
            ? [...selected, projectId]
            : [...selected].filter((id) => id !== projectId);
          void updateProject({
            environmentId: member.environmentId,
            input: { projectId: member.id, productProjectIds: next },
          });
        };
        return (
          <SettingsRow
            key={member.physicalProjectKey}
            title={supported.length > 1 ? (member.environmentLabel ?? "Projects") : "Projects"}
            description={titles.join(", ")}
            control={
              <Menu>
                <MenuTrigger
                  render={
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!editableIds.has(member.environmentId) || candidates.length === 0}
                    />
                  }
                >
                  Choose projects
                  <ChevronDownIcon />
                </MenuTrigger>
                <MenuPopup align="end">
                  {candidates.map((project) => (
                    <MenuCheckboxItem
                      key={project.id}
                      checked={selected.has(project.id)}
                      // A product keeps at least one project.
                      disabled={selected.size === 1 && selected.has(project.id)}
                      onCheckedChange={(checked) => toggle(project.id, checked)}
                    >
                      {project.title}
                    </MenuCheckboxItem>
                  ))}
                </MenuPopup>
              </Menu>
            }
          />
        );
      })}
    </SettingsSection>
  );
}
