"""Generates the crew's voice lines with Piper. Nothing here runs in the game: only the WAV files ship.

    npx vite-node tools/voices/export-lines.ts > lines.json
    python generate.py lines.json path/to/models public/assets

Needs `pip install piper-tts`, and these voices from huggingface.co/rhasspy/piper-voices in the
models folder: fr_FR-siwis-medium, fr_FR-upmc-medium and fr_FR-gilles-low.
"""

import json
import subprocess
import sys
from pathlib import Path

# The file each voice comes from, and its speaker inside that file.
VOICES = {
    "siwis": ("fr_FR-siwis-medium.onnx", 0),
    "jessica": ("fr_FR-upmc-medium.onnx", 0),
    "pierre": ("fr_FR-upmc-medium.onnx", 1),
    "gilles": ("fr_FR-gilles-low.onnx", 0),
}


def main() -> None:
    lines_path, models, assets = sys.argv[1:4]
    lines = json.loads(Path(lines_path).read_text(encoding="utf-8-sig"))
    for line in lines:
        target = Path(assets) / line["file"]
        target.parent.mkdir(parents=True, exist_ok=True)
        model, speaker = VOICES[line["voice"]]
        subprocess.run(
            [
                sys.executable,
                "-m",
                "piper",
                "--model",
                str(Path(models) / model),
                "--speaker",
                str(speaker),
                "--output-file",
                str(target),
                "--length-scale",
                f"{line['lengthScale']:.3f}",
                # A little less variation than the default: steadier, clearer speech.
                "--noise-scale",
                "0.55",
                "--noise-w-scale",
                "0.65",
            ],
            input=line["text"].encode("utf-8"),
            check=True,
            capture_output=True,
        )


if __name__ == "__main__":
    main()
