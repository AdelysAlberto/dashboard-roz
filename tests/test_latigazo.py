"""Latigazo decision tests: pure logic, no processes touched.

Run with: .venv/bin/python -m unittest discover -s tests -t .
"""

from __future__ import annotations

import os
import signal
import subprocess
import time
import unittest
from pathlib import Path
from unittest import mock

from server import latigazo, pilot
from server.providers import pi_provider
from server.providers.opencode_provider import _SERVICE_RE


class DecideTest(unittest.TestCase):
    def test_stalled_past_threshold_cuts_tool(self):
        cut = latigazo.decide("stalled", 301, 300, cooled=True)
        self.assertIsNotNone(cut)
        assert cut is not None
        self.assertEqual(cut.level, "tool")

    def test_active_session_is_never_cut(self):
        self.assertIsNone(latigazo.decide("active", 9999, 300, cooled=True))

    def test_quiet_session_is_never_cut(self):
        # quiet means the agent settled; nothing is holding the turn.
        self.assertIsNone(latigazo.decide("quiet", 9999, 300, cooled=True))

    def test_under_threshold_is_left_alone(self):
        self.assertIsNone(latigazo.decide("stalled", 120, 300, cooled=True))

    def test_cooldown_blocks_a_second_cut(self):
        self.assertIsNone(latigazo.decide("stalled", 900, 300, cooled=False))

    def test_provider_without_tool_level_is_skipped(self):
        self.assertIsNone(
            latigazo.decide("stalled", 900, 300, cooled=True, levels=("kill",))
        )


class RunTest(unittest.TestCase):
    def setUp(self):
        latigazo.reset()

    def test_only_stalled_sessions_reach_the_executor(self):
        calls: list[tuple[str, str]] = []

        def interrupt(path: str, level: str) -> dict:
            calls.append((path, level))
            return {"ok": True, "detail": "done"}

        sessions = [
            {"path": "a", "state": "stalled", "idle_seconds": 400, "interrupt_levels": ["tool"]},
            {"path": "b", "state": "active", "idle_seconds": 400, "interrupt_levels": ["tool"]},
            {"path": "c", "state": "quiet", "idle_seconds": 400, "interrupt_levels": ["tool"]},
        ]
        actions = latigazo.run(sessions, interrupt, threshold=300, now=1000.0)
        self.assertEqual(calls, [("a", "tool")])
        self.assertEqual(len(actions), 1)
        self.assertTrue(actions[0]["ok"])

    def test_second_pass_inside_cooldown_is_a_no_op(self):
        calls: list[str] = []

        def interrupt(path: str, level: str) -> dict:
            calls.append(path)
            return {"ok": True, "detail": "done"}

        sessions = [
            {"path": "a", "state": "stalled", "idle_seconds": 400, "interrupt_levels": ["tool"]}
        ]
        latigazo.run(sessions, interrupt, threshold=300, cooldown=120, now=1000.0)
        latigazo.run(sessions, interrupt, threshold=300, cooldown=120, now=1060.0)
        self.assertEqual(calls, ["a"])
        latigazo.run(sessions, interrupt, threshold=300, cooldown=120, now=1200.0)
        self.assertEqual(calls, ["a", "a"])

    def test_executor_failure_is_recorded_not_raised(self):
        def boom(path: str, level: str) -> dict:
            raise RuntimeError("provider down")

        sessions = [
            {"path": "a", "state": "stalled", "idle_seconds": 400, "interrupt_levels": ["tool"]}
        ]
        actions = latigazo.run(sessions, boom, threshold=300, now=1000.0)
        self.assertEqual(len(actions), 1)
        self.assertFalse(actions[0]["ok"])
        self.assertIn("provider down", actions[0]["detail"])


class PiToolDetectionTest(unittest.TestCase):
    def test_bash_tool_wrapper_matches(self):
        self.assertIsNotNone(
            pi_provider._SHELL_TOOL_RE.search(
                "/bin/bash -c cd /Volumes/Datos/Projects/viasera && grep -rn x ."
            )
        )

    def test_mcp_servers_are_not_tools(self):
        for cmd in (
            "/Users/x/.local/bin/cogni mcp",
            "npm exec @modelcontextprotocol/server-postgres postgresql://x",
            "bun run /Volumes/Datos/Projects/viasera/mcp/el-pregonero/src/index.ts",
            "npm exec firecrawl-mcp",
        ):
            self.assertIsNone(pi_provider._SHELL_TOOL_RE.search(cmd), cmd)

    def test_kill_group_refuses_self_and_init(self):
        self.assertIn("refused", pi_provider._kill_group(1))
        self.assertIn("refused", pi_provider._kill_group(os.getpgid(0)))


class OpenCodeServiceTest(unittest.TestCase):
    def test_background_service_is_recognised(self):
        self.assertIsNotNone(_SERVICE_RE.search("/Users/x/.opencode/bin/opencode serve --service"))
        self.assertIsNone(_SERVICE_RE.search("/Users/x/.opencode/bin/opencode"))


class ProcessTreeTest(unittest.TestCase):
    """Real processes: the cut must kill the tool group and spare the agent.

    `set -m` gives the inner shell its own process group, which is exactly how
    pi spawns a bash tool (`pgid` of the child equals its own pid).
    """

    def setUp(self):
        # The agent must outlive its tool, exactly like pi does when a bash call
        # dies: the turn continues. Hence the trailing sleep after `wait`.
        self.agent = subprocess.Popen(
            [
                "/bin/bash",
                "-c",
                'set -m; /bin/bash -c "sleep 60; echo hi" & wait %1; exec sleep 30',
            ],
            start_new_session=True,
        )
        deadline = time.time() + 5
        while time.time() < deadline and not pi_provider._tool_processes(self.agent.pid):
            time.sleep(0.05)

    def tearDown(self):
        try:
            os.killpg(self.agent.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
        try:
            self.agent.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.fail("fixture agent would not die")

    def test_tool_process_is_detected_as_shell(self):
        tools = pi_provider._tool_processes(self.agent.pid)
        self.assertEqual(len(tools), 1)
        self.assertIn("sleep 60", tools[0]["cmd"])
        self.assertEqual(tools[0]["pgid"], tools[0]["pid"])

    def test_cutting_the_group_leaves_the_agent_alive(self):
        tool = pi_provider._tool_processes(self.agent.pid)[0]
        self.assertEqual(pi_provider._kill_group(tool["pgid"]), "terminated")
        self.assertIsNone(self.agent.poll(), "the agent must survive a tool cut")
        self.assertEqual(pi_provider._tool_processes(self.agent.pid), [])


if __name__ == "__main__":
    unittest.main()


class PilotTurnTest(unittest.TestCase):
    """`turn` on pi exists only for transcripts this process drives over RPC."""

    def _run(self, session_file: str, *, exited: bool = False):
        run = pilot.AnalysisRun("run-test", "prompt", None, "/doc")
        run.session_file = session_file
        run.exited = exited
        return run

    def test_registry_matches_the_transcript_it_owns(self):
        registry = pilot.RunRegistry()
        run = self._run("/tmp/fake-session.jsonl")
        registry.runs[run.run_id] = run
        self.assertIs(registry.run_for_session("/tmp/../tmp/fake-session.jsonl"), run)

    def test_exited_run_owns_nothing(self):
        registry = pilot.RunRegistry()
        run = self._run("/tmp/fake-session.jsonl", exited=True)
        registry.runs[run.run_id] = run
        self.assertIsNone(registry.run_for_session("/tmp/fake-session.jsonl"))

    def test_run_without_transcript_yet_owns_nothing(self):
        registry = pilot.RunRegistry()
        run = self._run("")
        registry.runs[run.run_id] = run
        self.assertIsNone(registry.run_for_session("/tmp/fake-session.jsonl"))

    def test_unknown_path_returns_none(self):
        self.assertIsNone(pilot.RunRegistry().run_for_session("/tmp/other.jsonl"))

    def test_tui_session_advertises_two_rungs(self):
        with mock.patch.object(pilot.registry, "run_for_session", return_value=None):
            levels = pi_provider._interrupt_levels(Path("/tmp/x.jsonl"))
        self.assertEqual(levels, ("tool", "kill"))

    def test_owned_session_advertises_three_rungs(self):
        with mock.patch.object(pilot.registry, "run_for_session", return_value=object()):
            levels = pi_provider._interrupt_levels(Path("/tmp/x.jsonl"))
        self.assertEqual(levels, ("tool", "turn", "kill"))

    def test_turn_on_foreign_transcript_reports_why(self):
        with mock.patch.object(pilot.registry, "run_for_session", return_value=None):
            outcome = pi_provider.PiAgentProvider().interrupt("/tmp/x.jsonl", "turn")
        self.assertFalse(outcome.ok)
        self.assertIn("not driven by roz", outcome.detail)

    def test_turn_on_owned_transcript_aborts(self):
        run = mock.MagicMock()
        run.abort_turn_blocking = mock.MagicMock()
        run.run_id = "run-1"
        run.proc = None
        with mock.patch.object(pilot.registry, "run_for_session", return_value=run):
            outcome = pi_provider.PiAgentProvider().interrupt("/tmp/x.jsonl", "turn")
        run.abort_turn_blocking.assert_called_once()
        self.assertTrue(outcome.ok)
        self.assertIn("run-1", outcome.detail)
