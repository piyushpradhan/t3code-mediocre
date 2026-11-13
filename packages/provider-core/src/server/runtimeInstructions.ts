/** Session-invariant; harnesses with a native system-prompt append can carry it once per session. */
export const PULL_REQUEST_LINKING_INSTRUCTIONS = `<pull_request_linking>
Link each PR you create, take over, or push to: link_pull_request, or link_pull_requests for several, full URL, every stack layer, as your next call. Host tools don't link for you. If linking fails, say so. Skip PRs you only read or review and PRs named only as background. Call watch_pull_request when asked to monitor or babysit, or when work you were asked to do, such as a merge, still waits on checks or reviews, even after an earlier unwatch. Finish any needed branch update and push first, then watch and end your turn. Otherwise act now or hand back. Delegated children never watch, even if the brief says babysit. After PR work, a child's last line is: PR <full URL>, head <SHA>, checks and reviews <state>. Links and watches persist across pushes. For PR waits, no sleep, loops, gh --watch, Monitor or ScheduleWakeup. Before handback, call unwatch_pull_request on any PR you watch.
</pull_request_linking>`;

/** Omit model and effort when the harness manages them dynamically. */
export function buildRuntimeInstructions(runtime: {
  readonly harness: string;
  readonly model?: string | undefined;
  readonly modelName?: string | undefined;
  readonly reasoningEffort?: string | undefined;
  /** False when the session's system prompt already carries the linking instructions. */
  readonly pullRequestLinking?: boolean;
  /** The thread's other product folders, from the runtime policy's `additionalDirectories`. */
  readonly productDirectories?: ReadonlyArray<string> | undefined;
}): string {
  const harness = toSingleLine(runtime.harness);
  const model = toSingleLine(runtime.model ?? "");
  const modelName = toSingleLine(runtime.modelName ?? "");
  const effort = toSingleLine(runtime.reasoningEffort ?? "");
  const modelLabel =
    modelName && modelName !== model ? `${modelName} (model slug: ${model})` : model;
  const modelInfo = model && model !== "auto" && model !== "default" ? `, as ${modelLabel}` : "";
  const effortInfo = effort ? ` with ${effort} reasoning effort` : "";
  const runtimeInfo = `<runtime_info>In case you're asked: you are running in T3 Code through the ${harness} harness${modelInfo}${effortInfo}. No need to mention this otherwise. You can embed images, video, and audio using Markdown image syntax with absolute file paths. Link every other file you cite or produce by its absolute path, as in [http.ts:42](/abs/path/http.ts:42), so the user can open it in T3 Code's files viewer.</runtime_info>`;
  const productFolders = buildProductFoldersInstructions(runtime.productDirectories);
  const productInfo = productFolders === "" ? "" : `\n\n${productFolders}`;
  return runtime.pullRequestLinking === false
    ? runtimeInfo + productInfo
    : `${runtimeInfo}${productInfo}\n\n${PULL_REQUEST_LINKING_INSTRUCTIONS}`;
}

/** Empty when the thread's project is not part of a product. */
export function buildProductFoldersInstructions(
  directories: ReadonlyArray<string> | undefined,
): string {
  if (directories === undefined || directories.length === 0) return "";
  const list = directories.map((directory) => `- ${toSingleLine(directory)}`).join("\n");
  return `<product_folders>\nThis thread works in a product. Its working directory links to these project folders; read and change them as part of the workspace:\n${list}\n</product_folders>`;
}

function toSingleLine(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}
