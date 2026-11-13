import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

// ponytail: two members whose folders share a name share one entry; suffix them if that shows up.
export function productMemberFolderName(path: Path.Path, memberWorkspaceRoot: string): string {
  return path.basename(path.resolve(memberWorkspaceRoot));
}

/**
 * The real folders a product thread reaches through links in its working directory. Sandboxes
 * check real paths, so providers must be given these too; member worktrees are real subfolders.
 */
export const productLinkedDirectories = Effect.fn("productLinkedDirectories")(function* (
  cwd: string,
  memberWorkspaceRoots: ReadonlyArray<string>,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const linked: Array<string> = [];
  for (const root of memberWorkspaceRoots) {
    const entry = path.join(cwd, productMemberFolderName(path, root));
    const isLink = yield* fileSystem.readLink(entry).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false),
    );
    // Not yet created counts as linked, so the member stays reachable either way.
    const exists = yield* fileSystem.exists(entry).pipe(Effect.orElseSucceed(() => false));
    if (isLink || !exists) linked.push(root);
  }
  return linked;
});
