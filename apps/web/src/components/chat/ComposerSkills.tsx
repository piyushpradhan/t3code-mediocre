import { useAtomValue } from "@effect/atom-react";
import { useEffect, useState } from "react";
import type { EnvironmentId, ServerProviderSkill } from "@t3tools/contracts";
import {
  dedupeProviderSkillsByName,
  isProviderSkillUserInvocable,
  providerSkillCategory,
  shortlistProviderSkills,
} from "@t3tools/client-runtime/providerSkills";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import { matchInlineSkills, formatProviderSkillDisplayName } from "@t3tools/shared/inlineSkills";
import { BookOpenIcon, SparklesIcon } from "lucide-react";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { serverEnvironment } from "../../state/server";
import { searchProviderSkills } from "../../providerSkillSearch";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { skillPopoverDescription } from "./SkillInlineText";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
} from "../ui/dialog";

export function ComposerSkills({
  skills,
  prompt,
  environmentId,
  onApply,
}: {
  skills: ReadonlyArray<ServerProviderSkill>;
  prompt: string;
  environmentId: EnvironmentId;
  onApply: (skill: ServerProviderSkill) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [suggestion, setSuggestion] = useState<{
    prompt: string;
    environmentId: EnvironmentId;
    name: string;
  } | null>(null);
  const available = dedupeProviderSkillsByName(skills.filter(isProviderSkillUserInvocable));
  const candidates = shortlistProviderSkills(available, prompt);
  const canSuggest = useAtomValue(serverEnvironment.suggestSkills.permissionAtom(environmentId));
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- debounce model RPCs and ignore replies for obsolete drafts or environments
  useEffect(() => {
    if (!canSuggest || prompt.trim().length < 12 || candidates.length === 0) return;
    let current = true;
    const timer = setTimeout(() => {
      void runAtomCommand(
        appAtomRegistry,
        serverEnvironment.suggestSkills,
        {
          environmentId,
          input: {
            prompt: prompt.slice(0, 8000),
            candidates: candidates.map((skill) => ({
              name: skill.name,
              description: (skill.shortDescription ?? skill.description ?? "").slice(0, 300),
            })),
          },
        },
        { reportFailure: false },
      ).then((result) => {
        if (!current) return;
        setSuggestion(
          result._tag === "Success" && result.value.name
            ? { prompt, environmentId, name: result.value.name }
            : null,
        );
      });
    }, 450);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [prompt, candidates, environmentId, canSuggest]);
  const suggested =
    suggestion?.prompt === prompt && suggestion.environmentId === environmentId
      ? available.find(
          (skill) =>
            skill.name === suggestion.name && [...matchInlineSkills(prompt, [skill])].length === 0,
        )
      : undefined;
  const categories = ["All", "Relevant", ...new Set(available.map(providerSkillCategory).sort())];
  const results = (
    category === "Relevant"
      ? shortlistProviderSkills(available, prompt, 30)
      : searchProviderSkills(available, query)
  ).filter(
    (skill) =>
      (category === "All" ||
        category === "Relevant" ||
        providerSkillCategory(skill) === category) &&
      (category !== "Relevant" || !query || searchProviderSkills([skill], query).length > 0),
  );
  const apply = (skill: ServerProviderSkill) => {
    onApply(skill);
    setOpen(false);
  };
  if (available.length === 0) return null;
  return (
    <>
      <div className="flex min-w-0 items-center gap-1 -mx-1 pb-1 text-xs text-muted-foreground">
        <Button variant="ghost-muted" size="micro" onClick={() => setOpen(true)}>
          <BookOpenIcon />
          Skills
        </Button>
        {suggested && (
          <div className="min-w-0 truncate">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button variant="ghost-muted" size="micro" onClick={() => apply(suggested)} />
                }
              >
                <SparklesIcon />
                {formatProviderSkillDisplayName(suggested)}
              </TooltipTrigger>
              <TooltipPopup side="top" align="start">
                {skillPopoverDescription(suggested) ||
                  "No description is available for this skill."}
              </TooltipPopup>
            </Tooltip>
          </div>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Skills</DialogTitle>
            <DialogDescription>
              Find a skill for your prompt, or explore your library. Select one to add it.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <Input
              aria-label="Search skills"
              placeholder="Search skills…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="my-3 flex flex-wrap gap-1" aria-label="Skill categories">
              {categories.map((item) => (
                <Button
                  key={item}
                  size="compact"
                  variant={category === item ? "secondary" : "ghost-muted"}
                  aria-pressed={category === item}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </Button>
              ))}
            </div>
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {results.slice(0, 100).map((skill) => (
                <button
                  type="button"
                  key={skill.name}
                  onClick={() => apply(skill)}
                  className="flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="text-sm font-medium">
                    {formatProviderSkillDisplayName(skill)}
                  </span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {skill.shortDescription ?? skill.description ?? skill.name}
                  </span>
                </button>
              ))}
              {results.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {category === "Relevant" && !prompt.trim()
                    ? "Write a prompt to find relevant skills."
                    : "No matching skills. Try another search or category."}
                </p>
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {results.length} skills
              {results.length > 100 ? " · Showing the first 100. Search to narrow the list." : ""}
            </p>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </>
  );
}
