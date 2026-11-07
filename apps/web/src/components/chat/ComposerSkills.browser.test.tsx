import { EnvironmentId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { act, fakeTimers, render } from "../../../test/render";
import { ComposerSkills } from "./ComposerSkills";

const state = vi.hoisted(() => ({ suggest: vi.fn() }));
vi.mock("@effect/atom-react", async (original) => ({
  ...(await original<typeof import("@effect/atom-react")>()),
  useAtomValue: () => true,
}));
vi.mock("@t3tools/client-runtime/state/runtime", async (original) => ({
  ...(await original<typeof import("@t3tools/client-runtime/state/runtime")>()),
  runAtomCommand: (...args: unknown[]) => state.suggest(...args),
}));

function setup() {
  state.suggest.mockReset();
  type Reply = { _tag: "Success"; value: { name: string; available: boolean } };
  let resolve!: (value: Reply) => void;
  const promise = new Promise<Reply>((fulfill) => {
    resolve = fulfill;
  });
  state.suggest.mockReturnValue(promise);
  return { promise, resolve };
}

it("keeps a pending recommendation across composer rerenders without requesting it again", async () => {
  const reply = setup();
  using _timers = fakeTimers();
  const onApply = vi.fn();
  const skill = {
    name: "review",
    path: "/skills/review/SKILL.md",
    enabled: true,
    description: "Review code for bugs",
  };
  const skills = [skill];
  const view = () => (
    <ComposerSkills
      skills={skills}
      prompt="Please review this code for bugs"
      environmentId={EnvironmentId.make("test")}
      onApply={onApply}
    />
  );
  await using screen = await render(view());
  await act(() => vi.advanceTimersByTimeAsync(450));
  expect(state.suggest).toHaveBeenCalledTimes(1);
  await screen.rerender(view());
  await act(async () => {
    reply.resolve({ _tag: "Success", value: { name: "review", available: true } });
    await reply.promise;
  });
  await expect.element(screen.getByRole("button", { name: "review", exact: true })).toBeVisible();
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(state.suggest).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
  await userEvent.click(screen.getByRole("button", { name: "review", exact: true }));
  expect(onApply).toHaveBeenCalledExactlyOnceWith(skill);
});
