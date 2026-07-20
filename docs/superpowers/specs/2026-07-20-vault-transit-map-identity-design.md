# Vault Transit Map Identity Controls

## Goal

Combine the shielded-address display and recovery-phrase action with the Transit Map panel. These controls must exist only on the exact `/vault` route and not on any vault workflow route.

## User experience

The Transit Map panel keeps its current heading, total, SVG map, legend, and note-count explanation. A visually distinct identity section appears at the bottom of that same panel.

The identity section displays the public spending and viewing key coordinates with their existing copy actions. Its explanatory copy states why publication matters: publishing associates these public shielded keys with the connected wallet in the registry, allowing another sender to resolve that wallet and deliver a shielded note. It also states that private keys and the recovery phrase stay local and are never published.

The **Show recovery phrase** action is always available in the identity section while the vault is unlocked.

The **Publish shielded address** action is rendered only when the registry check definitively reports that the connected wallet's keys are not published (`state.registered === false`). It is absent after successful publication, while no wallet is connected, and while registry status is still being checked.

## Architecture

`homeView()` owns the Transit Map and is rendered only for the exact `/vault` route. It will include a small identity-controls renderer after the map content. The shared `appShell()` will stop rendering the standalone `vaultAddressTile()` after the primary grid.

This placement makes route scope structural rather than conditional: child routes render their workflow panel through `appShell()` but do not call `homeView()`, so they cannot render the identity or recovery controls.

The existing `identityStrip()`, copy handlers, recovery handler, and publication handler remain the source of behavior. The identity markup may be adapted for its new location, but cryptographic derivation, registry calls, and mnemonic handling do not change.

## Styling

The embedded identity section will be separated from the map content with a strong divider and spacing consistent with the existing neo-brutalist panel. Key rows remain readable and copyable at desktop and mobile widths. The actions remain grouped beneath the explanatory copy; the recovery action fills the available width when the conditional publish action is absent.

Obsolete full-width standalone-tile layout rules will be removed or renamed so they no longer imply a second panel below the dashboard.

## Error handling and privacy

Existing guarded publication and clipboard error handling remains unchanged. The feature must not expose the mnemonic in page markup before the user selects **Show recovery phrase**. Only the public `(B, V)` coordinates appear in the Transit Map panel.

The copy must not imply that publishing uploads the recovery phrase or private shielded keys.

## Testing

Render-level tests will verify:

- `/vault` includes the Transit Map identity section, both public key rows, and the recovery action.
- Child vault routes do not include those controls.
- The publish action appears when `state.registered === false` and is absent when publication is confirmed or status is unknown.
- The publication explanation covers sender resolution and distinguishes public keys from local private recovery material.

The app test suite and production build will be run after implementation.
