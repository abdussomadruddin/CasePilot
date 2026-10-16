import fitz
from pathlib import Path

doc = fitz.open(Path.home() / "Downloads/KM-Ipoh-Receipt-0009.pdf")
while len(doc) > 1:
    doc.delete_page(1)
page = doc[0]
rectangles = [(188, 15, 620, 56), (138, 119, 357, 199), (508, 119, 797, 199), (118, 211, 330, 244), (415, 229, 539, 304), (479, 311, 800, 328), (46, 361, 292, 375), (300, 361, 548, 375), (556, 361, 800, 375), (46, 399, 292, 413), (300, 399, 548, 413), (556, 399, 800, 413), (38, 430, 803, 446), (618, 512, 803, 551)]
for rect in rectangles:
    page.add_redact_annot(fitz.Rect(rect), fill=False)
page.apply_redactions(images=0, graphics=0)
doc.set_metadata({})
doc.save(Path(__file__).resolve().parents[1] / "assets/receipt-template.pdf", garbage=4, deflate=True)
