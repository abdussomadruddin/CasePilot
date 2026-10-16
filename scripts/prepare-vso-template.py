"""Remove existing field text from the supplied template; retain original artwork."""
import pathlib
import sys
import fitz

source, target = map(pathlib.Path, sys.argv[1:3])
doc = fitz.open(source)
doc.select([0])
page = doc[0]
# PDF bottom-left coordinates. Filled values and their old appearance streams
# are redacted, while vector dotted/double lines are retained.
zones = [(493, 725, 84, 18), (118, 697, 300, 18), (118, 680, 300, 17),
         (118, 620, 300, 59), (493, 672, 84, 41),
         (118, 553, 222, 55), (437, 552, 142, 56),
         (217, 358, 125, 177), (79, 397, 73, 17), (83, 288, 110, 14),
         (340, 288, 110, 14), (275, 137, 113, 28), (466, 137, 112, 28)]
for x, y, width, height in zones:
    page.add_redact_annot(fitz.Rect(x, page.rect.height-y-height, x+width, page.rect.height-y), fill=False)
page.apply_redactions(images=0, graphics=0, text=0)
doc.set_metadata({})
target.parent.mkdir(parents=True, exist_ok=True)
doc.save(target, garbage=4, deflate=True)
doc.close()
doc = fitz.open(target)
page = doc[0]
page.add_redact_annot(fitz.Rect(32, page.rect.height-217, 192, page.rect.height-175), fill=(1, 1, 1))
page.apply_redactions(images=2, graphics=2, text=0)
doc.save(target.with_name("honda-vso-no-signature.pdf"), garbage=4, deflate=True)
