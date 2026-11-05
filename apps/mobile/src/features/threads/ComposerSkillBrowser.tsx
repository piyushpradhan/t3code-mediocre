import { useAtomValue } from "@effect/atom-react";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import type { EnvironmentId, ServerProviderSkill } from "@t3tools/contracts";
import {
  dedupeProviderSkillsByName,
  isProviderSkillUserInvocable,
  providerSkillCategory,
  shortlistProviderSkills,
} from "@t3tools/client-runtime/providerSkills";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import { matchInlineSkills, formatProviderSkillDisplayName } from "@t3tools/shared/inlineSkills";
import { appAtomRegistry } from "../../state/atom-registry";
import { serverEnvironment } from "../../state/server";
import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";

export function ComposerSkillBrowser({
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
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- debounce model RPCs and discard responses for obsolete drafts
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
        if (current)
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
          (s) => s.name === suggestion.name && [...matchInlineSkills(prompt, [s])].length === 0,
        )
      : undefined;
  const categories = ["All", "Relevant", ...new Set(available.map(providerSkillCategory).sort())];
  const results = (
    category === "Relevant" ? shortlistProviderSkills(available, prompt, 30) : available
  ).filter(
    (s) =>
      (category === "All" || category === "Relevant" || providerSkillCategory(s) === category) &&
      `${s.name} ${s.displayName ?? ""} ${s.description ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const apply = (skill: ServerProviderSkill) => {
    onApply(skill);
    setOpen(false);
  };
  if (available.length === 0) return null;
  return (
    <>
      <View className="flex-row items-center gap-2">
        <Button label="Skills" tone="text" size="compact" onPress={() => setOpen(true)} />
        {suggested && (
          <Button
            label={formatProviderSkillDisplayName(suggested)}
            accessibilityLabel={`Apply suggested skill ${suggested.name}`}
            tone="text"
            size="compact"
            onPress={() => apply(suggested)}
          />
        )}
      </View>
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View className="flex-1 gap-3 bg-screen px-5 pb-6 pt-16">
          <View className="flex-row items-center justify-between">
            <Text className="text-xl font-t3-medium text-foreground">Skills</Text>
            <Button label="Done" tone="text" onPress={() => setOpen(false)} />
          </View>
          <TextInput
            accessibilityLabel="Search skills"
            placeholder="Search skills…"
            value={query}
            onChangeText={setQuery}
            className="rounded-xl bg-secondary p-3 text-foreground"
          />
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {categories.map((item) => (
                <Button
                  key={item}
                  label={item}
                  size="compact"
                  tone={category === item ? "secondary" : "text"}
                  onPress={() => setCategory(item)}
                />
              ))}
            </ScrollView>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {results.slice(0, 100).map((skill) => (
              <Pressable
                key={skill.name}
                accessibilityRole="button"
                onPress={() => apply(skill)}
                className="gap-1 border-b border-subtle py-4"
              >
                <Text className="font-t3-medium text-foreground">
                  {formatProviderSkillDisplayName(skill)}
                </Text>
                <Text className="text-foreground-muted">
                  {skill.shortDescription ?? skill.description ?? skill.name}
                </Text>
              </Pressable>
            ))}
            {results.length === 0 && (
              <Text className="py-8 text-foreground-muted">
                No matching skills. Try another search or write a prompt for relevant skills.
              </Text>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
