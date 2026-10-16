import fitz
from pathlib import Path
import sys
source = Path(sys.argv[1])
doc = fitz.open(source)
page = doc[0]
values = ["12 October 2026", "IRFAN FARIS", "010812101659", "Honda City Hatchback RS", "Ignite Red Metallic", "PMHGN5880SD305909", "L15ZE7005901", "Hong Leong Bank", "HONG LEONG", "MUIZ NAZMI"]
for value in values:
    for rect in page.search_for(value):
        page.add_redact_annot(rect, fill=False)
page.apply_redactions(images=0, graphics=0)
doc.set_metadata({})
doc.save(Path(__file__).resolve().parents[1] / "assets/ehakmilik-template.pdf", garbage=4, deflate=True)
