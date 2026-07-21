import assert from "node:assert/strict";
import test from "node:test";
import { prove, setWorkerFactory } from "./prove.js";

/** A stand-in Worker driven by whatever `behaviour` does with the posted message. */
function fakeWorker(behaviour) {
  return () => {
    const listeners = { message: [], error: [] };
    const worker = {
      terminated: false,
      addEventListener: (type, fn) => listeners[type].push(fn),
      terminate() { this.terminated = true; },
      postMessage(data) {
        behaviour({
          reply: (payload) => listeners.message.forEach((fn) => fn({ data: { id: data.id, ...payload } })),
          fail: () => listeners.error.forEach((fn) => fn({})),
        });
      },
    };
    fakeWorker.last = worker;
    return worker;
  };
}

const never = () => { throw new Error("inline proving should not have run"); };

test("a proof from the worker is returned as-is", async () => {
  setWorkerFactory(fakeWorker(({ reply }) => reply({ ok: true, proof: { pi_a: "1" } })));
  assert.deepEqual(await prove({ kind: "withdrawL1", args: [] }, never), { pi_a: "1" });
});

test("the worker is terminated once it has answered", async () => {
  setWorkerFactory(fakeWorker(({ reply }) => reply({ ok: true, proof: {} })));
  await prove({ kind: "withdrawL1", args: [] }, never);
  assert.equal(fakeWorker.last.terminated, true);
});

test("a worker that cannot start falls back to inline proving", async () => {
  setWorkerFactory(() => { throw new Error("module workers unsupported"); });
  assert.equal(await prove({ kind: "withdrawL1", args: [] }, async () => "inline"), "inline");
});

test("a worker that fails to load falls back to inline proving", async () => {
  setWorkerFactory(fakeWorker(({ fail }) => fail()));
  assert.equal(await prove({ kind: "withdrawL1", args: [] }, async () => "inline"), "inline");
});

test("once the worker is known unavailable it is not retried", async () => {
  let built = 0;
  setWorkerFactory(() => { built += 1; throw new Error("nope"); });
  await prove({ kind: "withdrawL1", args: [] }, async () => "inline");
  await prove({ kind: "withdrawL1", args: [] }, async () => "inline");
  assert.equal(built, 1, "the second call should skip the worker entirely");
});

test("a real proving failure is rethrown, never retried inline", async () => {
  // Retrying would freeze the tab for a minute and fail exactly the same way.
  setWorkerFactory(fakeWorker(({ reply }) => reply({ ok: false, message: "Failed to generate proof", details: ["witness mismatch"] })));
  await assert.rejects(
    () => prove({ kind: "withdrawL1", args: [] }, never),
    (error) => {
      assert.match(error.message, /Failed to generate proof/);
      // `describeError` reads the useful text out of `details`, so it has to survive.
      assert.match(error.details.worker, /witness mismatch/);
      return true;
    },
  );
});

test("a reply for a different request is ignored", async () => {
  setWorkerFactory(() => {
    const listeners = { message: [], error: [] };
    return {
      addEventListener: (type, fn) => listeners[type].push(fn),
      terminate() {},
      postMessage(data) {
        listeners.message.forEach((fn) => fn({ data: { id: data.id + 999, ok: true, proof: "wrong" } }));
        listeners.message.forEach((fn) => fn({ data: { id: data.id, ok: true, proof: "right" } }));
      },
    };
  });
  assert.equal(await prove({ kind: "withdrawL1", args: [] }, never), "right");
});

test("an SDK that cannot load inside the worker falls back rather than failing", async () => {
  // The worker flags this case specifically: it means the worker environment is
  // unusable, not that the proof was rejected.
  setWorkerFactory(fakeWorker(({ reply }) => reply({ ok: false, fallback: true, message: "Worker could not load the SDK: window is not defined" })));
  assert.equal(await prove({ kind: "withdrawL1", args: [] }, async () => "inline"), "inline");
});
