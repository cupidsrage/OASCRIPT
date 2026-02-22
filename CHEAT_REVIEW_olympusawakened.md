# Olympus Awakened – Potential Player Cheat Paths (Static Client Snapshot)

Scope reviewed: `olympusawakened.com (2)` archive (HTML + JS + captured API responses).

## Important caveat
This is a **client-side static review**. I cannot prove server-side validation from this snapshot, so the items below are **potential exploit paths** if backend checks are weak or missing.

## High-risk potential cheat vectors

1. **Combat action spam / bypassing UI cooldown gates**
   - Client cooldown and anti-double-submit are enforced with browser state (`actionInFlight`, `state.canAttack`, delay bars).
   - Requests still go to `api/combat_api.php` with mutable fields (`action`, `monster_id`, `auto_combat`, etc.) via `FormData`.
   - A cheater can bypass UI logic by replaying crafted POSTs from DevTools or external scripts.
   - Impact if backend is weak: attack-speed hacks, bypassed revive/death pacing, forced target switching.

2. **Map movement rate-limit bypass**
   - Client movement throttling uses `MIN_INTERVAL_MS`, `lastMoveAt`, and optional shared cooldown helpers.
   - Actual move request is a simple POST to `api/map_move.php` with only `direction` + `csrf_token`.
   - Attackers can ignore front-end timing and flood move requests directly.
   - Impact if backend is weak: speed-walking, pathing advantage, farming efficiency boost.

3. **Stat allocation tampering beyond UI limits**
   - UI caps per-click allocation and recursively batches requests in client logic.
   - Request to `api/stats_api.php` includes mutable `stat` and `amount` fields.
   - Cheaters can submit forged amounts/stats not available in UI.
   - Impact if backend is weak: over-allocation, invalid stat categories, progression corruption.

4. **Tournament lock appears largely UI-based in front-end layer**
   - Locking uses CSS/UI disabling (`pointer-events-none`, `aria-disabled`) and client redirects.
   - If server-side authorization is incomplete, users may still hit non-tournament actions/pages directly.
   - Impact if backend is weak: access to restricted tabs/actions during tournament windows.

5. **Chat HTML rendering may permit XSS-to-cheat chaining**
   - Chat content is injected with `innerHTML` in multiple paths.
   - If server sanitization is incomplete for chat content/tooltips, an attacker could run script in victim sessions.
   - Impact if backend is weak: stolen CSRF/session context, automated combat/actions in victim account, botcheck bypass workflows.

## Secondary signals worth validating

- Botcheck challenge flow is client-visible and tokenized; verify backend enforces expiration, per-attempt limits, and lockouts independent of UI timers.
- Captured API endpoints return rich combat/HUD data; ensure all endpoints require auth and strict per-user scoping.
- Hidden form fields in `game.php` (`action`, `direction`, `quest_id`, etc.) should be treated as untrusted and fully revalidated.

## Recommended server-side defenses (priority order)

1. Enforce authoritative cooldowns and action sequencing server-side for combat/movement/revive.
2. Apply strict schema + bounds checks on all mutable params (`action`, `monster_id`, `amount`, `quest_id`, `direction`, `tab`).
3. Add per-endpoint rate limiting with anti-replay semantics (nonce or monotonic action windows where applicable).
4. Keep tournament/plane/action authorization fully server-side (never UI-only).
5. Sanitize/encode all chat-rendered content and tooltip HTML; enforce CSP and consider Trusted Types.
6. Log anomaly patterns (impossible APM, invalid stat deltas, movement bursting) and auto-flag accounts.

## Quick manual test plan for your backend team

1. Send repeated `fight` POSTs directly to `api/combat_api.php` faster than UI cooldown.
2. Burst `api/map_move.php` calls (parallel + sub-interval) and verify server rejects extras.
3. POST `amount=999999` / invalid `stat` to `api/stats_api.php`.
4. Hit restricted tab/action routes during tournament lock.
5. Attempt chat payloads with HTML/script/event handlers; verify output encoding.

