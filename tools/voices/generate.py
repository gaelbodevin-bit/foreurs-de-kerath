"""Generates the crew's voice lines with Piper. Nothing here runs in the game: only the WAV files ship.

    npx vite-node tools/voices/export-lines.ts > lines.json
    python generate.py lines.json path/to/fr_FR-siwis-medium.onnx public/assets

Needs `pip install piper-tts`, and the voice from huggingface.co/rhasspy/piper-voices.
"""

import json
import subprocess
import sys
from pathlib import Path


def main() -> None:
    lines_path, model, assets = sys.argv[1:4]
    lines = json.loads(Path(lines_path).read_text(encoding="utf-8-sig"))
    for line in lines:
        target = Path(assets) / line["file"]
        target.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [
                sys.executable,
                "-m",
                "piper",
                "--model",
                model,
                "--output-file",
                str(target),
                "--length-scale",
                f"{line['lengthScale']:.3f}",
            ],
            input=line["text"].encode("utf-8"),
            check=True,
            capture_output=True,
        )
        print(target.name, line["text"])


if __name__ == "__main__":
    main()
