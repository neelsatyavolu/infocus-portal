/*
 * InFocus Meetings E2EE frame transform (RTCRtpScriptTransform worker).
 * Mirrors src/lib/meetings/client/frame-crypto.ts and key-ring.ts byte for byte; the unit tests
 * (tests/meetings-client-frame-crypto.test.ts) load this file and check the two interoperate.
 *
 * Frame: clearHeader || ciphertext+tag(16) || iv(12) || epoch(1), AES-GCM-256, AAD = clearHeader.
 * Clear header: VP8 key frame 10 bytes, VP8 delta 3, audio 1.
 * Frames are dropped (never sent or rendered in the clear) when no key is available or decryption fails.
 *
 * Messages in:  { type: "setKey", key: Uint8Array(32), epoch: number, sendDelayMs?: number } | { type: "forget", id: string } | { type: "clearKeys" }
 * On a rekey (sendDelayMs > 0) the new key decrypts at once but encryption keeps the previous
 * epoch until the delay passes, so slower peers can fetch the new key (mirrors key-ring.ts).
 * Messages out: { type: "decrypt", id: string, ok: boolean }  (only on state change, per receiver)
 */
(function (scope) {
  "use strict";

  var SALT = new TextEncoder().encode("infocus-meet-v1");
  var INFO = new TextEncoder().encode("frame");
  var IV_BYTES = 12;
  var TAG_BYTES = 16;
  var TRAILER_BYTES = IV_BYTES + 1;
  var FAIL_THRESHOLD = 10;

  var ring = { current: null, previous: null };
  var schedule = { send: null, pending: null, switchAt: null };
  var failures = {};

  function epochByte(epoch) {
    return ((epoch % 256) + 256) % 256;
  }

  function headerLength(kind, isKeyFrame) {
    if (kind === "audio") return 1;
    return isKeyFrame ? 10 : 3;
  }

  async function deriveFrameKey(raw) {
    var base = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: SALT, info: INFO },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  function addKey(entry) {
    var current = ring.current;
    if (!current) ring = { current: entry, previous: null };
    else if (entry.epoch === current.epoch) ring = { current: entry, previous: ring.previous };
    else if (entry.epoch > current.epoch) ring = { current: entry, previous: current };
  }

  function settleSendKey(now) {
    if (schedule.pending && schedule.switchAt !== null && now >= schedule.switchAt) {
      schedule = { send: schedule.pending, pending: null, switchAt: null };
    }
    return schedule.send;
  }

  function scheduleSendKey(entry, now, delayMs) {
    var send = settleSendKey(now);
    if (!send || !(delayMs > 0) || entry.epoch === send.epoch) {
      schedule = { send: entry, pending: null, switchAt: null };
    } else if (entry.epoch > send.epoch) {
      schedule = { send: schedule.pending || send, pending: entry, switchAt: now + delayMs };
    }
  }

  function keyForEpochByte(byte) {
    if (ring.current && epochByte(ring.current.epoch) === byte) return ring.current.key;
    if (ring.previous && epochByte(ring.previous.epoch) === byte) return ring.previous.key;
    return undefined;
  }

  async function encryptFrame(key, epoch, frame, hdrLen, iv) {
    var data = new Uint8Array(frame);
    var header = data.subarray(0, Math.min(hdrLen, data.byteLength));
    var plain = data.subarray(header.byteLength);
    var nonce = iv || crypto.getRandomValues(new Uint8Array(IV_BYTES));
    var sealed = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: header }, key, plain)
    );
    var out = new Uint8Array(header.byteLength + sealed.byteLength + TRAILER_BYTES);
    out.set(header, 0);
    out.set(sealed, header.byteLength);
    out.set(nonce, header.byteLength + sealed.byteLength);
    out[out.byteLength - 1] = epochByte(epoch);
    return out.buffer;
  }

  async function decryptFrame(lookup, frame, hdrLen) {
    if (frame.byteLength < TAG_BYTES + TRAILER_BYTES) return null;
    var data = new Uint8Array(frame);
    var key = lookup(data[data.byteLength - 1]);
    if (!key) return null;
    var sealedEnd = data.byteLength - TRAILER_BYTES;
    var header = data.subarray(0, Math.min(hdrLen, sealedEnd - TAG_BYTES));
    var sealed = data.subarray(header.byteLength, sealedEnd);
    var iv = data.slice(sealedEnd, sealedEnd + IV_BYTES);
    try {
      var plain = new Uint8Array(
        await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv, additionalData: header }, key, sealed)
      );
      var out = new Uint8Array(header.byteLength + plain.byteLength);
      out.set(header, 0);
      out.set(plain, header.byteLength);
      return out.buffer;
    } catch (error) {
      return null;
    }
  }

  function reportDecrypt(id, ok) {
    var count = failures[id] || 0;
    if (ok) {
      if (count >= FAIL_THRESHOLD) scope.postMessage({ type: "decrypt", id: id, ok: true });
      failures[id] = 0;
      return;
    }
    failures[id] = count + 1;
    if (count + 1 === FAIL_THRESHOLD) scope.postMessage({ type: "decrypt", id: id, ok: false });
  }

  function isKeyFrame(frame) {
    return typeof frame.type === "string" && frame.type === "key";
  }

  function makeTransform(options) {
    var kind = options.kind === "video" ? "video" : "audio";
    var id = String(options.id || "");
    if (options.operation === "encrypt") {
      return new TransformStream({
        transform: async function (frame, controller) {
          var current = settleSendKey(Date.now());
          if (!current || frame.data.byteLength === 0) return;
          frame.data = await encryptFrame(current.key, current.epoch, frame.data, headerLength(kind, isKeyFrame(frame)));
          controller.enqueue(frame);
        }
      });
    }
    return new TransformStream({
      transform: async function (frame, controller) {
        if (frame.data.byteLength === 0) return;
        var plain = await decryptFrame(keyForEpochByte, frame.data, headerLength(kind, isKeyFrame(frame)));
        reportDecrypt(id, plain !== null);
        if (!plain) return;
        frame.data = plain;
        controller.enqueue(frame);
      }
    });
  }

  scope.onmessage = function (event) {
    var message = event.data || {};
    if (message.type === "setKey" && message.key && typeof message.epoch === "number") {
      var raw = new Uint8Array(message.key);
      if (raw.byteLength !== 32) return;
      var delayMs = typeof message.sendDelayMs === "number" ? message.sendDelayMs : 0;
      deriveFrameKey(raw).then(function (key) {
        var entry = { epoch: message.epoch, key: key };
        addKey(entry);
        scheduleSendKey(entry, Date.now(), delayMs);
      });
    } else if (message.type === "forget" && typeof message.id === "string") {
      // The receiver's track ended: drop its failure counter (a long call creates many).
      delete failures[message.id];
    } else if (message.type === "clearKeys") {
      ring = { current: null, previous: null };
      schedule = { send: null, pending: null, switchAt: null };
    }
  };

  scope.onrtctransform = function (event) {
    var transformer = event.transformer;
    transformer.readable.pipeThrough(makeTransform(transformer.options || {})).pipeTo(transformer.writable);
  };

  // Test hook: the unit tests evaluate this file with a fake scope and call these directly.
  scope.__meetE2ee = {
    deriveFrameKey: deriveFrameKey,
    encryptFrame: encryptFrame,
    decryptFrame: decryptFrame,
    headerLength: headerLength,
    sendEpoch: function (now) {
      var send = settleSendKey(now);
      return send ? send.epoch : null;
    },
    setKeyForTest: function (epoch, key, now, delayMs) {
      var entry = { epoch: epoch, key: key };
      addKey(entry);
      scheduleSendKey(entry, now, delayMs);
    }
  };
})(self);
