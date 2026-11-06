import assert from "node:assert/strict";
import test from "node:test";
import { followUpWhatsAppUrls, openFollowUpWhatsApp } from "../src/lib/follow-up-whatsapp.ts";

test("normalizes Malaysian mobile formats and encodes optional message", () => {
  for (const phone of ["+60 17-355 9147", "017-355 9147", "60173559147", "173559147", "0060 17 355 9147"]) {
    assert.deepEqual(followUpWhatsAppUrls(phone, "Hai & hello"), [
      "whatsapp-business://send?phone=60173559147&text=Hai%20%26%20hello",
      "whatsapp://send?phone=60173559147&text=Hai%20%26%20hello",
      "https://wa.me/60173559147?text=Hai%20%26%20hello",
    ]);
  }
  assert.equal(followUpWhatsAppUrls("011-1234 5678")[2], "https://wa.me/601112345678");
  assert.equal(followUpWhatsAppUrls("0173559147")[2], "https://wa.me/60173559147");
  assert.throws(() => followUpWhatsAppUrls("not a phone"), /Invalid Malaysian mobile number/);
});

test("opens wa.me directly", async () => {
  const previousWindow = globalThis.window;
  const attempted = [];
  globalThis.window = { location: { assign: (url) => attempted.push(url) } };
  try {
    await openFollowUpWhatsApp("0173559147", "Hai");
    assert.deepEqual(attempted, ["https://wa.me/60173559147?text=Hai"]);
  } finally {
    globalThis.window = previousWindow;
  }
});
