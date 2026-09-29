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

test("tries Business, regular WhatsApp, then web when the page remains visible", async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const attempted = [];
  const timers = [];
  const listeners = new Map();
  globalThis.window = {
    location: { assign: (url) => attempted.push(url) },
    setTimeout: (callback) => { timers.push(callback); return timers.length; },
    clearTimeout: () => {},
    addEventListener: (type, callback) => listeners.set(`window:${type}`, callback),
    removeEventListener: (type) => listeners.delete(`window:${type}`),
  };
  globalThis.document = {
    hidden: false,
    addEventListener: (type, callback) => listeners.set(`document:${type}`, callback),
    removeEventListener: (type) => listeners.delete(`document:${type}`),
  };
  try {
    const opened = openFollowUpWhatsApp("0173559147");
    assert.deepEqual(attempted, ["whatsapp-business://send?phone=60173559147"]);
    timers.shift()();
    timers.shift()();
    await opened;
    assert.deepEqual(attempted, followUpWhatsAppUrls("0173559147"));
    assert.equal(listeners.size, 0);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});

test("stops fallback after an app takes the page to the background", async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const attempted = [];
  const timers = [];
  const listeners = new Map();
  globalThis.window = {
    location: { assign: (url) => attempted.push(url) },
    setTimeout: (callback) => { timers.push(callback); return timers.length; },
    clearTimeout: () => {},
    addEventListener: (type, callback) => listeners.set(`window:${type}`, callback),
    removeEventListener: (type) => listeners.delete(`window:${type}`),
  };
  globalThis.document = {
    hidden: false,
    addEventListener: (type, callback) => listeners.set(`document:${type}`, callback),
    removeEventListener: (type) => listeners.delete(`document:${type}`),
  };
  try {
    const opened = openFollowUpWhatsApp("0173559147");
    globalThis.document.hidden = true;
    listeners.get("document:visibilitychange")();
    await opened;
    timers.shift()();
    assert.deepEqual(attempted, ["whatsapp-business://send?phone=60173559147"]);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});
