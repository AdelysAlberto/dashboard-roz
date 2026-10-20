"""Closed taxonomy for the Skills tab: category keys, labels and the classifier.

Separated from ``skills_scan.py`` so the keyword table (long, data-only) does not
inflate the scanner module.
"""

from __future__ import annotations

# (key, label, keywords). Ordered: earlier wins a score tie.
CATEGORIES: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("design", "Design", (
        "design", "visual", "aesthetic", "taste", "typography", "palette", "brand",
        "logo", "illustration", "isometric", "art direction", "antislop", "anti-slop",
        "ui craft", "ui-craft", "landing page", "figma", "slop", "ui ",
    )),
    ("ux", "UX & Accessibility", (
        "ux", "user experience", "usability", "accessib", "wcag", "journey",
        "wireframe", "interaction", "persona", "user research",
    )),
    ("frontend", "Frontend & Mobile", (
        "react", "component", "css", "tailwind", "next.js", "vue", "svelte", "zustand",
        "state management", "i18n", "react native", "expo", "mobile", "frontend",
        "browser", "html",
    )),
    ("backend", "Backend & Data", (
        "backend", "api", "database", "sql", "postgres", "drizzle", "redis", "server",
        "fastapi", "graphql", "migration", "architecture",
    )),
    ("quality", "Quality & Testing", (
        "test", "review", "refactor", "clean code", "lint", "coverage", "audit",
        "debug", "qa", "comment",
    )),
    ("security", "Security", (
        "security", "owasp", "vulnerab", "hardening", "secret", "threat",
    )),
    ("writing", "Writing & Docs", (
        "writing", "copy", "readme", "documentation", "prose", "tone", "linkedin",
        "article", "email",
    )),
    ("product", "Product & Planning", (
        "product", "prd", "requirement", "roadmap", "scrum", "story", "market",
        "pricing", "plan", "planning", "strategy",
    )),
    ("legal", "Legal & Compliance", (
        "legal", "compliance", "gdpr", "rgpd", "licen", "trademark", "copyright",
        "contract", "ai act",
    )),
    ("finance", "Finance & Tax", (
        "tax", "invoice", "vat", "irpf", "accounting", "fiscal", "finance",
    )),
    ("media", "Video & Media", (
        "video", "audio", "voice", "tts", "music", "caption", "subtitle", "motion",
        "hyperframes", "shader", "image", "photo", "render", "slideshow", "remotion",
        "animation",
    )),
    ("meta", "Agents & Tooling", (
        "mcp server", "mcp", "memory", "cogni", "knowledge graph", "notifier",
        "telegram", "opencode", "reverse engineer", "foundry", "agent monitor", "cli",
    )),
)

CATEGORY_KEYS = tuple(key for key, _label, _kw in CATEGORIES) + ("other",)
LABELS = {key: label for key, label, _kw in CATEGORIES}
LABELS["other"] = "Other"

# The keyword heuristic is only a starting point: these are the calls it gets
# wrong by construction (a video skill whose prose is about design, a tooling
# skill whose prose mentions images). One click in the UI or the LLM analysis
# overrides them anyway; keeping them here only saves that click.
CATEGORY_OVERRIDES = {
    "anatomy": "design",
    "antislop-code": "quality",
    "docs-index": "meta",
    "faceless-explainer": "media",
    "full-output-enforcement": "meta",
    "graphify": "meta",
    "herdr": "meta",
    "higgsfield-marketplace-cards": "media",
    "image-to-code": "design",
    "product-launch-video": "media",
    "reverse-engineer-anything": "meta",
    "ui-craft-editorial": "design",
}

CATEGORY_KEYS = tuple(key for key, _label, _kw in CATEGORIES) + ("other",)
LABELS = {key: label for key, label, _kw in CATEGORIES}
LABELS["other"] = "Other"


def classify(name: str, description: str, dir_name: str = "") -> str:
    """Keyword score: a hit in the directory name weighs more than the prose."""
    override = CATEGORY_OVERRIDES.get(dir_name)
    if override:
        return override
    haystack_name = name.lower()
    haystack_desc = description.lower()
    best, best_score = "other", 0
    for key, _label, keywords in CATEGORIES:
        score = 0
        for kw in keywords:
            if kw in haystack_name:
                score += 5
            if kw in haystack_desc:
                score += 1
        if score > best_score:
            best, best_score = key, score
    return best
