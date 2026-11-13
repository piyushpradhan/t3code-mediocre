import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("sync-upstream-auth.sh").resolve()
SEED = '{"tokens":{"refresh_token":"seed"}}'
ROTATED = '{"tokens":{"refresh_token":"rotated"}}'


class SyncUpstreamAuthTests(unittest.TestCase):
    def test_rotated_credentials_reach_the_next_run(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            tools = root / "bin"
            tools.mkdir()
            gh = tools / "gh"
            gh.write_text('''#!/bin/bash
set -eu
test "$*" = 'secret set CODEX_AUTH_JSON --repo acme/app'
cat > "$SECRET_FILE"
exit "${GH_EXIT:-0}"
''')
            gh.chmod(0o755)
            env = dict(os.environ, PATH=f"{tools}:{os.environ['PATH']}",
                       CODEX_HOME=str(root / "codex"), CODEX_AUTH_JSON=SEED,
                       GITHUB_REPOSITORY="acme/app", GH_TOKEN="fixture",
                       SECRET_FILE=str(root / "secret"))

            def run(mode, **overrides):
                return subprocess.run(["bash", str(SCRIPT), mode],
                                      env=dict(env, **overrides), text=True,
                                      capture_output=True, check=False)

            result = run("prepare")
            self.assertEqual(result.returncode, 0, result.stderr)
            auth = root / "codex" / "auth.json"
            self.assertEqual(auth.read_text(), SEED)
            self.assertEqual(stat.S_IMODE(auth.stat().st_mode), 0o600)

            result = run("save")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse((root / "secret").exists())

            auth.write_text(ROTATED)
            result = run("save")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((root / "secret").read_text(), ROTATED)
            self.assertNotIn(ROTATED, result.stdout + result.stderr)

            result = run("prepare", CODEX_HOME=str(root / "next-run"),
                         CODEX_AUTH_JSON=(root / "secret").read_text())
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((root / "next-run" / "auth.json").read_text(), ROTATED)

            result = run("save", GH_EXIT="1")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Secrets", result.stdout + result.stderr)

            auth.write_text("")
            result = run("save")
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual((root / "secret").read_text(), ROTATED)

    def test_missing_credentials_stop_before_codex_can_rotate_tokens(self):
        with tempfile.TemporaryDirectory() as directory:
            for missing in ("CODEX_AUTH_JSON", "GH_TOKEN"):
                with self.subTest(missing=missing):
                    env = dict(os.environ, CODEX_HOME=str(Path(directory) / "codex"),
                               CODEX_AUTH_JSON=SEED, GH_TOKEN="fixture")
                    env[missing] = ""
                    result = subprocess.run(["bash", str(SCRIPT), "prepare"],
                                            env=env, text=True, capture_output=True)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertFalse((Path(directory) / "codex" / "auth.json").exists())


if __name__ == "__main__":
    unittest.main()
