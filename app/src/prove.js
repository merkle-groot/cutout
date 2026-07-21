/**
 * Proving, in a Worker when the browser allows it and on the main thread when it
 * does not.
 *
 * The fallback is the point. Moving proving off-thread is the single largest UX
 * win in the app, but a Worker adds ways to fail that the main thread does not
 * have — module workers are unsupported in older browsers, a strict CSP can
 * forbid the worker script, and a bundler can mis-resolve it. None of those are
 * worth a broken withdrawal, so anything that goes wrong while STARTING the
 * worker falls back to proving inline: the user gets today's frozen tab rather
 * than an error.
 *
 * A failure that comes back FROM the worker is a real proving failure and is
 * rethrown untouched. Retrying it on the main thread would just freeze the tab
 * and fail again a minute later.
 */

let workerFactory = () => new Worker(new URL("./prover.worker.js", import.meta.url), { type: "module" });
let unavailable = false;
let nextId = 1;

/** Test seam: swap the worker constructor, or pass null to force the fallback. */
export function setWorkerFactory(factory) {
  workerFactory = factory;
  unavailable = false;
}

/** Rebuild the SDK's error shape from what survived structured clone. */
function workerError({ message, details }) {
  const error = new Error(message ?? "Proving failed");
  if (details?.length) error.details = { worker: details.join(" · ") };
  return error;
}

/**
 * Prove in a Worker. Rejects with `{ fallback: true }` only when the worker could
 * not be started, which is the caller's signal to prove inline instead.
 */
function proveInWorker(payload) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = workerFactory();
    } catch {
      unavailable = true;
      reject({ fallback: true });
      return;
    }
    if (!worker) {
      unavailable = true;
      reject({ fallback: true });
      return;
    }

    const id = nextId++;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      fn(value);
    };

    worker.addEventListener("message", (event) => {
      if (event.data?.id !== id) return;
      if (event.data.ok) finish(resolve, event.data.proof);
      // `fallback` means the worker could not run at all (an SDK that needs `window`,
      // say), not that the proof was rejected — so it earns a main-thread retry.
      else if (event.data.fallback) { unavailable = true; finish(reject, { fallback: true }); }
      else finish(reject, workerError(event.data));
    });
    // Fires when the worker script itself fails to load or throws at import time —
    // the "could not start" case, not a proving failure.
    worker.addEventListener("error", () => {
      unavailable = true;
      finish(reject, { fallback: true });
    });

    worker.postMessage({ id, payload });
  });
}

/**
 * Generate and verify a proof.
 *
 * `proveInline` is injected by the caller so this module never imports the SDK
 * itself — that keeps the fallback path identical to the code it replaced, and
 * keeps this file testable without pulling in snarkjs.
 */
export async function prove(payload, proveInline) {
  if (!unavailable) {
    try {
      return await proveInWorker(payload);
    } catch (error) {
      if (!error?.fallback) throw error;
    }
  }
  return proveInline();
}
