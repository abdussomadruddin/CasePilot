import fitz
from pathlib import Path

source = Path.home() / "Downloads/Invoice - Irfan Faris (Latest).pdf"
doc = fitz.open(source)
while len(doc) > 1:
    doc.delete_page(1)
page = doc[0]
for rect in [(88, 155, 430, 229), (438, 220, 550, 244), (459, 292, 549, 582), (89, 368, 458, 394), (88, 621, 500, 656)]:
    page.add_redact_annot(fitz.Rect(rect), fill=False)
page.apply_redactions(images=0, graphics=0)
page.add_redact_annot(fitz.Rect(330, 60, 555, 151), fill=(1, 1, 1))
page.apply_redactions(images=2, graphics=2)
doc.set_metadata({})
doc.save(Path(__file__).resolve().parents[1] / "assets/invoice-template.pdf", garbage=4, deflate=True)
