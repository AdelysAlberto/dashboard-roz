"""Prompt-lab tests: envelope building, URL resolution and response extraction.

Pure logic only, no network. Run with:
``.venv/bin/python -m unittest discover -s tests -t .``
"""

from __future__ import annotations

import os
import unittest
from unittest import mock

from server import llm_test
from server.llm_test_prompt import VIARA_MASTER_PROMPT

SPEC = {
    "api_url": "http://192.168.1.128:8030/v1",
    "model": "Qwen3-4B-Instruct-2507-4bit",
    "temperature": 0.2,
    "master_prompt": "Eres Viara.",
    "user_prompt": "Llevame a Herrera oria 248",
    "context": {
        "latitude": "40.4618",
        "longitude": "-3.7055",
        "vehicle": "moto",
        "avoid_highways": False,
        "avoid_tolls": False,
        "prefer_curves": True,
    },
}


class BuildPayloadTest(unittest.TestCase):
    def test_system_turn_is_wrapped_in_system_instructions(self):
        payload = llm_test.build_payload(SPEC)
        self.assertEqual(payload["messages"][0]["role"], "system")
        self.assertEqual(
            payload["messages"][0]["content"],
            "<system_instructions>\nEres Viara.\n</system_instructions>",
        )

    def test_user_turn_is_wrapped_in_user_input_and_carries_context(self):
        content = llm_test.build_payload(SPEC)["messages"][1]["content"]
        self.assertTrue(content.startswith("<user_input>Llevame a Herrera oria 248</user_input>\n"))
        self.assertIn('Solicitud del usuario: "Llevame a Herrera oria 248".', content)
        self.assertIn("Latitude 40.4618, Longitude -3.7055.", content)
        self.assertIn("Vehículo seleccionado por el usuario: moto.", content)
        self.assertIn("Evitar Autopistas=false, Evitar Peajes=false, Preferir Curvas=true.", content)

    def test_payload_keeps_only_the_fields_the_curl_uses(self):
        payload = llm_test.build_payload(SPEC)
        self.assertEqual(
            sorted(payload), ["messages", "model", "temperature"]
        )
        self.assertNotIn("api_key", payload)

    def test_max_tokens_is_sent_only_when_set(self):
        self.assertNotIn("max_tokens", llm_test.build_payload({**SPEC, "max_tokens": None}))
        self.assertEqual(llm_test.build_payload({**SPEC, "max_tokens": 256})["max_tokens"], 256)

    def test_temperature_is_clamped_and_survives_garbage(self):
        self.assertEqual(llm_test.clamp_temperature(9), 2.0)
        self.assertEqual(llm_test.clamp_temperature(-3), 0.0)
        self.assertEqual(llm_test.clamp_temperature("0.7"), 0.7)
        self.assertEqual(llm_test.clamp_temperature("hot"), 0.2)

    def test_thinking_default_is_omitted_so_the_server_keeps_its_setting(self):
        payload = llm_test.build_payload({**SPEC, "thinking": "default"})
        self.assertNotIn("enable_thinking", payload)
        self.assertNotIn("enable_thinking", llm_test.build_payload(SPEC))

    def test_thinking_on_and_off_are_sent_as_a_boolean(self):
        self.assertIs(
            llm_test.build_payload({**SPEC, "thinking": "on"})["enable_thinking"], True
        )
        self.assertIs(
            llm_test.build_payload({**SPEC, "thinking": "off"})["enable_thinking"], False
        )

    def test_effort_keeps_numbers_as_numbers(self):
        # Qwen3.8 validates low|medium|xhigh; other templates take a float.
        self.assertEqual(
            llm_test.build_payload({**SPEC, "reasoning_effort": "low"})["reasoning_effort"],
            "low",
        )
        self.assertEqual(
            llm_test.build_payload({**SPEC, "reasoning_effort": "0.4"})["reasoning_effort"], 0.4
        )
        self.assertEqual(
            llm_test.build_payload({**SPEC, "reasoning_effort": "1"})["reasoning_effort"], 1
        )
        self.assertNotIn("reasoning_effort", llm_test.build_payload(SPEC))

    def test_thinking_budget_is_sent_only_when_numeric(self):
        self.assertEqual(
            llm_test.build_payload({**SPEC, "thinking_budget": "512"})["thinking_budget"], 512
        )
        self.assertNotIn("thinking_budget", llm_test.build_payload({**SPEC, "thinking_budget": ""}))
        self.assertNotIn("thinking_budget", llm_test.build_payload({**SPEC, "thinking_budget": "lots"}))

    def test_default_master_prompt_is_the_production_one(self):
        self.assertIn("Eres Viara, la copilota inteligente oficial de Viasera", VIARA_MASTER_PROMPT)
        self.assertNotIn("<system_instructions>", VIARA_MASTER_PROMPT)


class ResolveUrlTest(unittest.TestCase):
    def test_bare_base_url_gets_the_completions_path(self):
        self.assertEqual(
            llm_test.resolve_url("http://host:8030/v1/"),
            "http://host:8030/v1/chat/completions",
        )

    def test_full_endpoint_is_kept(self):
        url = "http://host:8030/v1/chat/completions"
        self.assertEqual(llm_test.resolve_url(url), url)

    def test_missing_scheme_is_rejected_before_the_call(self):
        with self.assertRaises(ValueError):
            llm_test.resolve_url("192.168.1.128:8030/v1")
        with self.assertRaises(ValueError):
            llm_test.resolve_url("")


class ExtractTest(unittest.TestCase):
    def body(self):
        return {
            "id": "chatcmpl-1",
            "model": "Qwen3-4B-Instruct-2507-4bit",
            "created": 1792665975,
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {"role": "assistant", "content": '{\n  "intent": "plan_route"\n}'},
                }
            ],
            "usage": {
                "prompt_tokens": 1459,
                "completion_tokens": 140,
                "total_tokens": 1599,
                "time_to_first_token": 0.68,
                "total_time": 2.44,
                "prompt_tokens_per_second": 263.44,
                "generation_tokens_per_second": 79.6,
                "prompt_tokens_details": {"cached_tokens": 1280},
            },
        }

    def test_content_and_metadata_are_split(self):
        out = llm_test.extract(self.body(), 2500, "http://host/v1/chat/completions", {"model": "m"})
        self.assertEqual(out["parsed"], {"intent": "plan_route"})
        self.assertIsNone(out["parse_error"])
        self.assertEqual(out["meta"]["finish_reason"], "stop")
        self.assertEqual(out["meta"]["usage"]["cached_tokens"], 1280)
        self.assertEqual(out["meta"]["timings"]["time_to_first_token"], 0.68)
        self.assertEqual(out["latency_ms"], 2500)
        self.assertEqual(out["raw"]["id"], "chatcmpl-1")

    def test_reasoning_content_is_kept_apart_from_content(self):
        body = self.body()
        body["choices"][0]["message"]["reasoning_content"] = "17*23 = 391, compruebo..."
        out = llm_test.extract(body, 1, "http://host", {})
        self.assertEqual(out["reasoning"], "17*23 = 391, compruebo...")
        self.assertNotIn("compruebo", out["content"])

    def test_missing_reasoning_content_is_none_not_empty_string(self):
        out = llm_test.extract(self.body(), 1, "http://host", {})
        self.assertIsNone(out["reasoning"])

    def test_fenced_json_is_parsed(self):
        body = self.body()
        body["choices"][0]["message"]["content"] = '```json\n{"intent": "search_poi"}\n```'
        out = llm_test.extract(body, 1, "http://host", {})
        self.assertEqual(out["parsed"], {"intent": "search_poi"})

    def test_prose_answer_reports_the_parse_error_instead_of_failing(self):
        body = self.body()
        body["choices"][0]["message"]["content"] = "Claro, te llevo a Toledo."
        out = llm_test.extract(body, 1, "http://host", {})
        self.assertIsNone(out["parsed"])
        self.assertIn("line 1", out["parse_error"] or "")
        self.assertEqual(out["content"], "Claro, te llevo a Toledo.")

    def test_empty_choices_do_not_crash(self):
        out = llm_test.extract({"choices": []}, 1, "http://host", {})
        self.assertEqual(out["content"], "")
        self.assertIsNone(out["meta"]["finish_reason"])


class DefaultsTest(unittest.TestCase):
    def test_environment_seeds_the_form(self):
        env = {
            "ROZ_LLM_TEST_URL": "http://192.168.1.128:8030/v1",
            "ROZ_LLM_TEST_MODEL": "Qwen3-4B-Instruct-2507-4bit",
            "ROZ_LLM_TEST_KEY": "sk-test",
        }
        with mock.patch.dict(os.environ, env, clear=False):
            seed = llm_test.defaults()
        self.assertEqual(seed["model"], "Qwen3-4B-Instruct-2507-4bit")
        self.assertTrue(seed["has_key"])
        self.assertEqual(seed["master_prompt"], VIARA_MASTER_PROMPT)
        self.assertNotIn("sk-test", str({k: v for k, v in seed.items() if k != "has_key"}))


if __name__ == "__main__":
    unittest.main()
