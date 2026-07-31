/* ============================================================================
   stub.js — pages that are scaffolded but not yet wired up.
   Mounts the shared chrome so navigation and the footer work everywhere.
   ========================================================================= */

import { mountChrome, mountWaves, initReveal } from './core.js';

await mountChrome();
mountWaves();
initReveal();
