/**
 * Transient "COPIED" confirmation, pinned beside the control that was clicked.
 *
 * Deliberately outside the render cycle and outside `#app`: it is appended to
 * the body with fixed positioning, so a re-render triggered by `guard` cannot
 * wipe it mid-animation, and it never becomes state that has to be cleared.
 * Copy confirmation used to go through `state.notice`, which pushed a card into
 * the panel for an action whose result is already in the user's clipboard —
 * feedback belongs where the click happened.
 *
 * Takes a measured RECT, never the element. `guard` re-renders `#app` before it
 * runs the work (see main.js), so by the time the copy resolves the clicked
 * button has been replaced and detached — and a detached node measures as all
 * zeros, which parked every sticker in the top-left corner of the page. The
 * caller must measure synchronously inside the click handler, before yielding.
 */
export function showCopiedSticker(rect) {
  document.querySelectorAll(".copied-sticker").forEach((old) => old.remove());
  if (!rect) return;
  // An all-zero rect is a detached or unrendered node, not a real position.
  if (!rect.width && !rect.height) return;

  const sticker = document.createElement("div");
  sticker.className = "copied-sticker";
  sticker.textContent = "COPIED";
  // Flip to the left of the control when there is no room to its right.
  const room = window.innerWidth - rect.right;
  if (room < 110) {
    sticker.style.right = `${window.innerWidth - rect.left + 10}px`;
  } else {
    sticker.style.left = `${rect.right + 10}px`;
  }
  sticker.style.top = `${rect.top + rect.height / 2}px`;
  document.body.appendChild(sticker);
  sticker.addEventListener("animationend", () => sticker.remove());
}

/** Measure now, for a sticker that will not be shown until after a re-render. */
export function anchorRect(element) {
  const rect = element?.getBoundingClientRect?.();
  return rect ? { left: rect.left, right: rect.right, top: rect.top, width: rect.width, height: rect.height } : null;
}
