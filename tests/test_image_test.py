"""Image lab tests: prompt envelope, backend shapes, response normalisation.

Pure logic plus one route-level check of the download guard. No network: the
upstream is never called, the payloads are built and normalised directly.
Run with: `.venv/bin/python -m unittest discover -s tests -t .`
"""

from __future__ import annotations

import base64
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from server import image_store, image_test, image_test_api

PNG = base64.b64encode(b"\x89PNG\r\n\x1a\nfake-bytes").decode()

SPEC = {
    "api_url": "http://127.0.0.1:8039",
    "model": "mlx-community/Qwen-Image-2512-6bit",
    "backend": "auto",
    "steps": 30,
    "guidance": 4.0,
    "seed": "42",
    "orientation": "9:16",
    "negative_prompt": "blurry",
    "master_prompt": "Render the image.",
    "user_prompt": "Una moto scrambler al atardecer",
}


class SizeTest(unittest.TestCase):
    def test_model_card_buckets(self):
        self.assertEqual(image_test.size_for("1:1"), (1328, 1328))
        self.assertEqual(image_test.size_for("16:9"), (1664, 928))
        self.assertEqual(image_test.size_for("9:16"), (928, 1664))

    def test_unknown_orientation_is_rejected(self):
        with self.assertRaises(ValueError):
            image_test.size_for("21:9")


class BackendTest(unittest.TestCase):
    def test_auto_reads_a_bare_host_as_a1111(self):
        self.assertEqual(image_test.resolve_backend("auto", "http://127.0.0.1:8039"), "a1111")

    def test_auto_reads_sdapi_as_a1111(self):
        url = "http://127.0.0.1:7860/sdapi/v1/txt2img"
        self.assertEqual(image_test.resolve_backend("auto", url), "a1111")

    def test_auto_reads_v1_images_as_openai(self):
        url = "http://127.0.0.1:1/v1/images/generations"
        self.assertEqual(image_test.resolve_backend("auto", url), "openai")

    def test_explicit_choice_wins(self):
        self.assertEqual(image_test.resolve_backend("openai", "http://x:1"), "openai")

    def test_unknown_backend_is_rejected(self):
        with self.assertRaises(ValueError):
            image_test.resolve_backend("diffusers", "http://x:1")

    def test_url_gets_the_route_appended_once(self):
        self.assertEqual(
            image_test.resolve_url("http://x:7860/", "a1111"), "http://x:7860/sdapi/v1/txt2img"
        )
        self.assertEqual(
            image_test.resolve_url("http://x:7860/sdapi/v1/txt2img", "a1111"),
            "http://x:7860/sdapi/v1/txt2img",
        )
        self.assertEqual(
            image_test.resolve_url("http://x:1/v1", "openai"), "http://x:1/v1/images/generations"
        )

    def test_url_requires_a_scheme(self):
        with self.assertRaises(ValueError):
            image_test.resolve_url("127.0.0.1:8039", "a1111")


class PromptTest(unittest.TestCase):
    def test_envelope_order_is_master_subject_framing(self):
        prompt = image_test.build_prompt(SPEC)
        master, subject, framing = prompt.split("\n\n")
        self.assertEqual(master, "Render the image.")
        self.assertEqual(subject, "Una moto scrambler al atardecer")
        self.assertIn("9:16", framing)
        self.assertIn("928x1664", framing)

    def test_empty_subject_is_rejected(self):
        with self.assertRaises(ValueError):
            image_test.build_prompt({**SPEC, "user_prompt": "   "})

    def test_missing_master_prompt_still_yields_subject_and_framing(self):
        prompt = image_test.build_prompt({**SPEC, "master_prompt": ""})
        self.assertFalse(prompt.startswith("\n"))
        self.assertIn("Una moto", prompt)


class PayloadTest(unittest.TestCase):
    def test_a1111_shape(self):
        payload = image_test.build_payload(SPEC, "a1111")
        self.assertEqual(payload["width"], 928)
        self.assertEqual(payload["height"], 1664)
        self.assertEqual(payload["steps"], 30)
        self.assertEqual(payload["cfg_scale"], 4.0)
        self.assertEqual(payload["seed"], 42)
        self.assertEqual(payload["negative_prompt"], "blurry")
        self.assertNotIn("size", payload)

    def test_openai_shape(self):
        payload = image_test.build_payload(SPEC, "openai")
        self.assertEqual(payload["size"], "928x1664")
        self.assertEqual(payload["model"], "mlx-community/Qwen-Image-2512-6bit")
        self.assertEqual(payload["response_format"], "b64_json")
        self.assertEqual(payload["steps"], 30)

    def test_steps_and_guidance_are_clamped(self):
        payload = image_test.build_payload({**SPEC, "steps": "5000", "guidance": "99"}, "a1111")
        self.assertEqual(payload["steps"], 100)
        self.assertEqual(payload["cfg_scale"], 20.0)

    def test_bad_numbers_fall_back_to_the_model_card_defaults(self):
        payload = image_test.build_payload({**SPEC, "steps": "abc", "guidance": ""}, "a1111")
        self.assertEqual(payload["steps"], image_test.DEFAULT_STEPS)
        self.assertEqual(payload["cfg_scale"], image_test.DEFAULT_GUIDANCE)

    def test_empty_seed_means_random(self):
        self.assertEqual(image_test.build_payload({**SPEC, "seed": ""}, "a1111")["seed"], -1)

    def test_preview_reports_backend_url_and_size(self):
        preview = image_test.preview(SPEC)
        self.assertEqual(preview["backend"], "a1111")
        self.assertEqual(preview["url"], "http://127.0.0.1:8039/sdapi/v1/txt2img")
        self.assertEqual(preview["size"], [928, 1664])


class TempOut:
    """Point the output directory at a throwaway folder for the duration of a test."""

    def __enter__(self) -> Path:
        self._tmp = tempfile.TemporaryDirectory()
        self._patch = mock.patch.dict(os.environ, {"ROZ_IMAGE_TEST_OUT": self._tmp.name})
        self._patch.start()
        return Path(self._tmp.name)

    def __exit__(self, *_exc) -> None:
        self._patch.stop()
        self._tmp.cleanup()


class NormaliseTest(unittest.TestCase):
    def test_a1111_body_saves_a_png_and_keeps_the_metadata(self):
        body = {"images": [PNG], "info": json.dumps({"seed": 42, "steps": 30})}
        payload = image_test.build_payload(SPEC, "a1111")
        with TempOut() as out:
            run = image_test.normalise(body, "a1111", 1234, "http://x", payload, "Una moto")
            files = list(out.iterdir())
        self.assertEqual(len(files), 1)
        self.assertTrue(files[0].name.endswith("-una-moto.png"))
        self.assertEqual(run["image_bytes"], len(base64.b64decode(PNG)))
        self.assertEqual(run["meta"]["seed"], 42)
        self.assertEqual(run["latency_ms"], 1234)
        self.assertNotIn("images", run["raw"])
        self.assertEqual(base64.b64decode(run["image_b64"]), base64.b64decode(PNG))

    def test_openai_body_is_normalised(self):
        body = {"data": [{"b64_json": PNG}], "model": "qwen-image"}
        payload = image_test.build_payload(SPEC, "openai")
        with TempOut():
            run = image_test.normalise(body, "openai", 5, "http://x", payload, "")
        self.assertEqual(run["meta"]["model"], "qwen-image")
        self.assertEqual(run["meta"]["backend"], "openai")

    def test_url_only_reply_is_an_error_not_a_silent_blank(self):
        with TempOut(), self.assertRaises(image_test.UpstreamError):
            image_test.normalise({"data": [{"url": "http://x/a.png"}]}, "openai", 1, "u", {}, "")

    def test_empty_image_list_is_an_error(self):
        with TempOut(), self.assertRaises(image_test.UpstreamError):
            image_test.normalise({"images": []}, "a1111", 1, "u", {}, "")

    def test_slug_survives_non_ascii_and_slashes(self):
        self.assertEqual(image_store._slug("Moto / Ñandú: atardecer"), "moto-nandu-atardecer")


class DownloadGuardTest(unittest.TestCase):
    """The download route must not walk out of the output directory."""

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(image_test_api.router)
        self.client = TestClient(self.app)

    def test_traversal_is_refused(self):
        with TempOut():
            for name in ("../etc/passwd", "..%2Fpasswd", "a/b.png"):
                response = self.client.get(f"/api/image-test/file/{name}")
                self.assertIn(response.status_code, (400, 404), name)

    def test_missing_file_is_404(self):
        with TempOut():
            self.assertEqual(self.client.get("/api/image-test/file/nope.png").status_code, 404)

    def test_saved_file_is_served_as_png(self):
        with TempOut():
            image_test.save_image(b"\x89PNG\r\n\x1a\nxx", "prueba")
            name = next(image_test.out_dir().iterdir()).name
            response = self.client.get(f"/api/image-test/file/{name}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "image/png")


if __name__ == "__main__":
    unittest.main()
