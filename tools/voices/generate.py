"""Generates the crew's voice lines with Piper. Nothing here runs in the game: only the WAV files ship.

    npx vite-node tools/voices/export-lines.ts > lines.json
    python generate.py lines.json path/to/models public/assets

Needs `pip install piper-tts`, and these voices from huggingface.co/rhasspy/piper-voices in the
models folder: fr_FR-siwis-medium, fr_FR-upmc-medium and fr_FR-gilles-low.
"""

import array
import json
import subprocess
import sys
import wave
from pathlib import Path

# The file each voice comes from, and its speaker inside that file.
VOICES = {
    "siwis": ("fr_FR-siwis-medium.onnx", 0),
    "jessica": ("fr_FR-upmc-medium.onnx", 0),
    "pierre": ("fr_FR-upmc-medium.onnx", 1),
    "gilles": ("fr_FR-gilles-low.onnx", 0),
}

SILENCE = 700
KEEP_BEFORE = 0.03
KEEP_AFTER = 0.1


def trim(path: Path) -> None:
    """Cuts the silence around a line, so that the subtitle and the voice start together."""
    with wave.open(str(path)) as source:
        params = source.getparams()
        samples = array.array("h", source.readframes(source.getnframes()))
    loud = [i for i, sample in enumerate(samples) if abs(sample) > SILENCE]
    start = max(0, loud[0] - int(KEEP_BEFORE * params.framerate))
    end = min(len(samples), loud[-1] + int(KEEP_AFTER * params.framerate))
    with wave.open(str(path), "wb") as target:
        target.setparams(params)
        target.writeframes(samples[start:end].tobytes())


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
                # Without this, Windows reads the text in its own encoding: every accented letter
                # turns into two wrong ones, and the voice speaks gibberish without any error.
                "-X",
                "utf8",
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
        trim(target)


if __name__ == "__main__":
    main()
