"""Default master prompt shipped with the Test Imagen tab.

Diffusion models do not take a system role: the whole instruction set is the
prompt. So this text is prepended to whatever the operator types and it has to
earn its tokens by describing *how* to render, never *what* — the operator owns
the subject.

The resolution and step defaults come from the Qwen-Image model card
(1328x1328 / 1664x928 / 928x1664, 50 steps, true CFG 4.0). The closing quality
suffix is the card's own `positive_magic`.
"""

IMAGE_MASTER_PROMPT = """You are generating a single still image from the text below. Render it as a photograph or illustration, never as a document: no UI, no page layout, no explanation, no captions.

Reading order for the description: subject and action, then setting and time of day, then lighting, then framing and lens, then palette and finish.

Rules:
- Honour every concrete detail in the description (counts, colours, materials, brands, text). Never invent a different brand name or a different number of objects.
- If the description asks for legible text, render that exact text, correctly spelled, as part of the scene.
- Compose for the requested aspect ratio: keep the subject out of the extreme edges, and keep the horizon level unless the description says otherwise.
- Prefer physically plausible light and materials: one main light source, consistent shadows, no floating objects.
- No watermark, no signature, no logo, no accidental lettering, no border, no frame.
- Single frame. No collage, no grid, no split screen."""

# One line per orientation, appended after the subject. Qwen-Image follows
# natural-language framing instructions better than bare ratio tokens.
ORIENTATION_LINES = {
    "1:1": (
        "Framing: square 1:1 composition at 1328x1328. Centre the subject, "
        "balanced negative space around it."
    ),
    "16:9": (
        "Framing: landscape 16:9 composition at 1664x928. Horizontal staging, "
        "clear subject placement, room for the background to read."
    ),
    "9:16": (
        "Framing: vertical portrait 9:16 composition at 928x1664. Full-height "
        "staging, subject in the vertical thirds, headroom at the top."
    ),
}
