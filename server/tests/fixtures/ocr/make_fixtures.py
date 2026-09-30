"""Regenerates the OCR test fixtures. Every name and number on them is made up
("SAMPLE CARD HOLDER", 1234 5678 9012, ABCDE1234F); none belongs to a person.

    python make_fixtures.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent

CARDS = {
    "aadhaar-masked.png": ["GOVERNMENT SAMPLE ID", "SAMPLE CARD HOLDER", "Year of Birth 1990", "XXXX XXXX 1234"],
    "aadhaar-unmasked.png": ["GOVERNMENT SAMPLE ID", "SAMPLE CARD HOLDER", "Year of Birth 1990", "1234 5678 9012"],
    "pan.png": ["INCOME TAX DEPARTMENT SAMPLE", "SAMPLE CARD HOLDER", "Permanent Account Number", "ABCDE1234F"],
}


def render(name: str, lines: list[str]) -> None:
    font = ImageFont.load_default(size=54)
    img = Image.new("RGB", (1400, 120 + 110 * len(lines)), "white")
    draw = ImageDraw.Draw(img)
    for i, line in enumerate(lines):
        draw.text((60, 60 + i * 110), line, fill="black", font=font)
    img.save(OUT / name)


if __name__ == "__main__":
    for name, lines in CARDS.items():
        render(name, lines)
        print("wrote", name)
