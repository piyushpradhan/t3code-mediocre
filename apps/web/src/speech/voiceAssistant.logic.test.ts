import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";

import { resolveVoiceAssistantProject } from "./voiceAssistant.logic";

const project = (title: string, environment = "local", archivedAt: string | null = null) => ({
  title,
  environmentId: EnvironmentId.make(environment),
  id: ProjectId.make(`${environment}-${title}`),
  archivedAt,
});

it("defaults to No project even when the request mentions a project", () => {
  expect(
    resolveVoiceAssistantProject("Remind me to review the Acme project", [project("Acme")]),
  ).toEqual({ kind: "scratch" });
});

it.each([
  "In project Acme, fix the tests",
  "for the project acme: fix the tests",
  "In project Acme",
])("routes an explicit spoken project: %s", (text) => {
  const acme = project("Acme");
  expect(resolveVoiceAssistantProject(text, [acme])).toEqual({ kind: "project", project: acme });
});

it("matches the longest whole project name and never a partial word", () => {
  const acmeApp = project("Acme App");
  expect(
    resolveVoiceAssistantProject("In project Acme App, fix the tests", [project("Acme"), acmeApp]),
  ).toEqual({ kind: "project", project: acmeApp });
  expect(
    resolveVoiceAssistantProject("In project AcmeTools, fix the tests", [project("Acme")]).kind,
  ).toBe("error");
});

it("keeps unknown, archived, or ambiguous destinations from silently using another project", () => {
  for (const projects of [
    [],
    [project("Acme", "local", "2026-01-01")],
    [project("Acme"), project("Acme", "remote")],
  ]) {
    expect(resolveVoiceAssistantProject("In project Acme, fix the tests", projects).kind).toBe(
      "error",
    );
  }
});
