"""Local mflux backend: folder inspection, discovery, worker state machine.

No weights are touched here. The worker needs mflux and a 22 GB checkpoint, so
what is tested is everything that has to be right *before* that: a folder is
rejected in milliseconds, a wrong family is named as such, and the manager
refuses to generate without a loaded model instead of spawning a child.
Run with: `.venv/bin/python -m unittest discover -s tests -t .`
"""

from __future__ import annotations

import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from server import image_store, image_test_local_api, mflux_local, mflux_models

QWEN_README = """---
base_model: Qwen/Qwen-Image-2512
library_name: mflux
---
Qwen-Image-2512-MLX
"""

QWEN21_README = """---
base_model: Qwen/Qwen-Image-2.1
library_name: mflux
---
Qwen-Image-2.1 mflux q4
"""


def parts_for(family: str) -> tuple[str, ...]:
    return mflux_models.CONTAINER_PARTS + (mflux_models.FAMILY_PARTS[family],)


def make_checkpoint(
    root: Path, name: str, readme: str = QWEN_README, family: str = "qwen-image"
) -> Path:
    """A folder shaped like a Qwen-Image checkpoint, with one file inside each tree."""
    path = root / name
    for part in parts_for(family):
        (path / part).mkdir(parents=True)
        (path / part / "weights.safetensors").write_bytes(b"\x00" * 32)
    (path / "README.md").write_text(readme, encoding="utf-8")
    return path


class InspectTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def test_compatible_checkpoint(self):
        path = make_checkpoint(self.root, "Qwen-Image-2512-3bit")
        info = mflux_models.inspect_model(str(path))
        self.assertTrue(info["compatible"], info["reason"])
        self.assertEqual(info["reason"], "")
        self.assertEqual(info["family"], "qwen-image")
        self.assertEqual(info["name"], "Qwen-Image-2512-3bit")
        self.assertEqual(
            info["size_bytes"],
            32 * len(parts_for("qwen-image")) + len(QWEN_README.encode()),
        )

    def test_missing_weight_tree_is_named(self):
        path = make_checkpoint(self.root, "Qwen-Image-2512-4bit")
        for name in os.listdir(path / "vae"):
            os.unlink(path / "vae" / name)
        (path / "vae").rmdir()
        info = mflux_models.inspect_model(str(path))
        self.assertFalse(info["compatible"])
        self.assertIn("vae/", info["reason"])

    def test_two_one_layout_uses_the_processor_not_the_tokenizer(self):
        path = make_checkpoint(
            self.root, "Qwen-Image-2.1-mflux-q4", readme=QWEN21_README, family="qwen-image-2.1"
        )
        info = mflux_models.inspect_model(str(path))
        self.assertTrue(info["compatible"], info["reason"])
        self.assertEqual(info["family"], "qwen-image-2.1")

    def test_a_2_1_folder_missing_its_processor_is_named(self):
        path = make_checkpoint(
            self.root, "Qwen-Image-2.1-broken", readme=QWEN21_README, family="qwen-image-2.1"
        )
        (path / "processor" / "weights.safetensors").unlink()
        (path / "processor").rmdir()
        info = mflux_models.inspect_model(str(path))
        self.assertFalse(info["compatible"])
        self.assertIn("processor/", info["reason"])
        self.assertEqual(info["family"], "qwen-image-2.1")

    def test_chat_model_is_rejected_by_family(self):
        path = self.root / "Qwen3-Coder-30B"
        (path / "transformer").mkdir(parents=True)
        (path / "vae").mkdir()
        (path / "text_encoder").mkdir()
        (path / "tokenizer").mkdir()
        (path / "README.md").write_text("Qwen3-Coder", encoding="utf-8")
        info = mflux_models.inspect_model(str(path))
        self.assertFalse(info["compatible"])
        self.assertIn("not a Qwen-Image checkpoint", info["reason"])

    def test_empty_and_missing_paths_raise(self):
        with self.assertRaises(ValueError):
            mflux_models.inspect_model("")
        with self.assertRaises(ValueError):
            mflux_models.inspect_model(str(self.root / "nope"))


class DiscoveryTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        make_checkpoint(self.root, "Qwen-Image-2512-3bit")
        make_checkpoint(self.root, "Qwen-Image-2512-4bit")
        make_checkpoint(
            self.root, "Qwen-Image-2.1-mflux-q4", readme=QWEN21_README, family="qwen-image-2.1"
        )
        (self.root / "gemma-4-e2b-it-4bit").mkdir()
        self.env = mock.patch.dict(
            os.environ,
            {
                "ROZ_IMAGE_TEST_MODELS_DIR": str(self.root),
                "ROZ_IMAGE_TEST_LOCAL_MODEL": str(self.root / "Qwen-Image-2512-3bit"),
            },
        )
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self._tmp.cleanup()

    def test_root_and_default_come_from_env(self):
        self.assertEqual(mflux_models.models_root(), self.root)
        self.assertEqual(
            mflux_models.default_model_path(), str(self.root / "Qwen-Image-2512-3bit")
        )

    def test_compatible_models_come_first_and_default_is_flagged(self):
        models = mflux_models.list_models()
        self.assertEqual(len(models), 4)
        default = next(model for model in models if model["default"])
        self.assertEqual(default["name"], "Qwen-Image-2512-3bit")
        self.assertTrue(all(model["compatible"] for model in models[:3]))
        self.assertEqual(
            sorted(model["family"] for model in models[:3]),
            ["qwen-image", "qwen-image", "qwen-image-2.1"],
        )
        self.assertFalse(models[3]["compatible"])

    def test_missing_models_root_lists_nothing(self):
        with mock.patch.dict(os.environ, {"ROZ_IMAGE_TEST_MODELS_DIR": str(self.root / "gone")}):
            self.assertEqual(mflux_models.list_models(), [])

    def test_python_resolution_and_availability(self):
        with mock.patch.dict(os.environ, {"ROZ_MFLUX_PYTHON": str(self.root / "nope")}):
            self.assertEqual(mflux_models.python_for_mflux(), str(self.root / "nope"))
            self.assertFalse(mflux_models.mflux_available())
        self.assertTrue(mflux_models.mflux_available())


class ManagerTest(unittest.TestCase):
    def setUp(self):
        mflux_local.shutdown()
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)

    def tearDown(self):
        mflux_local.shutdown()
        self._tmp.cleanup()

    def test_initial_state_is_idle(self):
        status = mflux_local.status()
        self.assertEqual(status["state"], "idle")
        self.assertFalse(status["loaded"])
        self.assertIsNone(status["pid"])

    def test_generate_without_a_model_is_refused(self):
        with self.assertRaises(mflux_local.NotReady):
            mflux_local.generate({"user_prompt": "un gato", "orientation": "1:1"})

    def test_incompatible_folder_does_not_spawn_a_worker(self):
        (self.root / "chat").mkdir()
        with self.assertRaises(ValueError):
            mflux_local.load(str(self.root / "chat"))
        self.assertEqual(mflux_local.status()["state"], "idle")

    def test_missing_interpreter_is_reported_before_spawning(self):
        path = make_checkpoint(self.root, "Qwen-Image-2512-3bit")
        with mock.patch.dict(os.environ, {"ROZ_MFLUX_PYTHON": str(self.root / "no-python")}):
            with self.assertRaises(ValueError) as caught:
                mflux_local.load(str(path))
        self.assertIn("no mflux interpreter", str(caught.exception))
        self.assertEqual(mflux_local.status()["state"], "idle")


class RouteTest(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(image_test_local_api.router)
        self.client = TestClient(app)
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        make_checkpoint(self.root, "Qwen-Image-2512-3bit")
        self.env = mock.patch.dict(
            os.environ,
            {
                "ROZ_IMAGE_TEST_MODELS_DIR": str(self.root),
                "ROZ_IMAGE_TEST_OUT": str(self.root / "out"),
            },
        )
        self.env.start()
        mflux_local.shutdown()

    def tearDown(self):
        self.env.stop()
        mflux_local.shutdown()
        self._tmp.cleanup()

    def test_models_endpoint_describes_the_machine(self):
        body = self.client.get("/api/image-test/local/models").json()
        self.assertEqual(body["root"], str(self.root))
        self.assertEqual(len(body["models"]), 1)
        self.assertIn("available", body)
        self.assertIn("python", body)

    def test_status_endpoint(self):
        body = self.client.get("/api/image-test/local/status").json()
        self.assertEqual(body["state"], "idle")
        self.assertTrue(body["default_path"].endswith("Qwen-Image-2512-3bit"))

    def test_load_with_a_bad_path_is_a_400(self):
        response = self.client.post("/api/image-test/local/load", json={"path": "/nope/nada"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("not a directory", response.json()["detail"])

    def test_generate_without_a_model_is_a_409(self):
        response = self.client.post(
            "/api/image-test/local/generate",
            json={"user_prompt": "un gato", "orientation": "1:1", "model_path": ""},
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("load a checkpoint", response.json()["detail"])

    def test_status_carries_the_running_clock_and_the_last_run(self):
        """A reload drops the HTTP response, not the generation: the status has
        to say how long it has been going and hand back the finished image."""
        mflux_local.shutdown()
        last = {
            "image_name": "20261024-004000-un-gato.png",
            "image_bytes": 1843,
            "meta": {"backend": "local", "model": "Qwen-Image-2.1-mflux-q4", "seed": 7},
            "latency_ms": 90000,
            "request": {"url": "mflux:/tmp/x", "payload": {"prompt": "un gato"}},
            "raw": {},
            "finished_at": "2026-10-24T00:41:30+02:00",
        }
        with mflux_local._lock:  # noqa: SLF001 - the state is the contract under test
            mflux_local._state.update(state="generating", started_at="2026-10-24T00:40:00+02:00")
            mflux_local._generation_started = time.time() - 5
            mflux_local._last_run = last
        try:
            body = self.client.get("/api/image-test/local/status").json()
            self.assertEqual(body["state"], "generating")
            self.assertGreaterEqual(body["elapsed_ms"], 5000)
            self.assertEqual(body["started_at"], "2026-10-24T00:40:00+02:00")
            self.assertEqual(body["last_run"]["image_name"], last["image_name"])
            self.assertNotIn("image_b64", body["last_run"])
            self.assertTrue(body["out_dir"].endswith("out"))
        finally:
            mflux_local.shutdown()

    def test_unload_while_idle_is_harmless(self):
        response = self.client.post("/api/image-test/local/unload")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["state"], "idle")

    def test_out_dir_override_is_absolute(self):
        self.assertTrue(image_store.out_dir().is_absolute())


if __name__ == "__main__":
    unittest.main()
