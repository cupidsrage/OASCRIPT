// ==UserScript==
// @name         OA AutoCombat + Last Beast HUD + CapSolver (Stealth Mode)
// @namespace    http://tampermonkey.net/
// @version      6.9.84
// @description  Auto-combat (F1), Last Beast teleport (F2), CapSolver auto-solve - v6.9.83: Added Tampermonkey @updateURL/@downloadURL metadata for automatic updates
// @description  Auto-combat (F1), Last Beast teleport (F2), CapSolver auto-solve - v6.9.77: FIX - Added WAIT_MOVE phase with 200ms delay + position verification - v6.9.58: ⚔️ Auto: ON/OFF button in game header - click to toggle, syncs with F1
// @author       You
// @match        https://olympusawakened.com/game.php*
// @match        https://www.olympusawakened.com/game.php*
// @match        https://*.olympusawakened.com/game.php*
// @updateURL    https://raw.githubusercontent.com/cupidsrage/OASCRIPT/refs/heads/main/OA_AutoCombat_v6_9_16_183_user__9_%20(15).js
// @downloadURL  https://raw.githubusercontent.com/cupidsrage/OASCRIPT/refs/heads/main/OA_AutoCombat_v6_9_16_183_user__9_%20(15).js
// @noframes
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      api.capsolver.com
// @connect      api.anthropic.com
// @connect      api.openai.com
// ==/UserScript==

(function () {
  'use strict';

  // Bridge for Tampermonkey sandbox: use unsafeWindow so console API functions
  // are accessible from the browser's page console (F12), not just the sandbox.
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  // ===== STEALTH MODE CONFIGURATION =====
  // IMPORTANT: These delays apply to ALL combat profiles (instant, fast, humanized)
  // When stealth is enabled, these delays are ADDED on top of your profile's base timing
  // Profile controls base combat speed, stealth adds anti-detection on top
  const STEALTH_CONFIG = {
    enabled: true, // Set to false to restore full logging
    useKeyboard: true, // Use F/A/R hotkeys instead of clicks
    obfuscateStorage: false, // Use random localStorage key prefixes (breaks existing settings)
    hideVersionBadge: true, // Hide the visible script badge
    quietLogs: true, // Reduce console spam
    addMistakes: true, // Simulate human errors (missed clicks, wrong keys)
    mistakeChance: 0.015, // 1.5% chance of human-like mistake

    // DELAY TUNING - Adjust these for speed vs stealth balance
    redBarDelayMin: 30,     // Min delay after red bar completes (was 50)
    redBarDelayMax: 100,    // Max delay after red bar completes (was 200)
    buttonChangeDelayMin: 80,  // Min delay after button text changes (was 150)
    buttonChangeDelayMax: 200, // Max delay after button text changes (was 400)

    // PAUSE CHANCES - Reduce for speed
    microPauseChance: 0.03,    // 3% chance of 0.5-1.5s pause (was 5.8%)
    shortBreakChance: 0.008,   // 0.8% chance of 2-5s break (was 1.5%)
    longPauseChance: 0.001,    // 0.1% chance of 5-10s pause (was 0.3%)

    // SAFETY DELAYS - Reduce for maximum speed (WARNING: lower = higher detection risk)
    serverAckGuardMs: 80,      // Server response guard (default 80ms, min 20ms)
    actionEligibleDelayMs: 35, // Action eligibility delay (default 35ms, min 10ms)

    // COMBAT ENGINE TIMING - How often script checks for combat actions
    engineIntervalMs: 45,      // Engine heartbeat (default 45ms, ludicrous: 15ms)
    tickThrottleMs: 40,        // Tick throttle (default 40ms, ludicrous: 10ms)

    // API POLLING - How often to check hud_state for gold/exp changes
    apiPollIntervalMin: 2000,  // Minimum time between API polls (default 2000ms)
    apiPollIntervalMax: 4000,  // Maximum time between API polls (default 4000ms, adds randomness)

    // EARLY FIRE - Act before red bar fully drains (server tolerance testing)
    // 0  = wait for full drain (safest, current behavior)
    // 50 = act when 50ms remain on server timer (test server tolerance)
    // 100 = act when 100ms remain (riskier but faster if server allows)
    earlyFireMs: 0,
  };

  // Keyboard event simulator - more human-like than direct clicks
  function simulateKeyPress(key, target = document.body) {
    if (!STEALTH_CONFIG.useKeyboard) return false;

    try {
      const eventOptions = {
        key: key,
        code: 'Key' + key.toUpperCase(),
        keyCode: key.charCodeAt(0),
        which: key.charCodeAt(0),
        bubbles: true,
        cancelable: true,
        composed: true
      };

      // Simulate the full keydown -> keypress -> keyup sequence like a real user
      target.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
      target.dispatchEvent(new KeyboardEvent('keypress', eventOptions));

      // Small human delay between keydown and keyup (10-40ms)
      const releaseDelay = 10 + Math.random() * 30;
      setTimeout(() => {
        target.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
      }, releaseDelay);

      return true;
    } catch (e) {
      if (!STEALTH_CONFIG.quietLogs) console.warn('[Stealth] Key simulation failed:', e);
      return false;
    }
  }

  // Human-like mistake simulator
  function shouldMakeMistake() {
    return STEALTH_CONFIG.addMistakes && Math.random() < STEALTH_CONFIG.mistakeChance;
  }

  // Stealth logging wrapper
  const slog = (tag, ...args) => {
    if (!STEALTH_CONFIG.quietLogs) {
      console.log(`[${tag}]`, ...args);
    }
  };

  const swarn = (tag, ...args) => {
    if (!STEALTH_CONFIG.quietLogs) {
      console.warn(`[${tag}]`, ...args);
    }
  };

  // Stealth presets for easy configuration
  const STEALTH_PRESETS = {
    maximum: {
      name: 'Maximum Stealth (Slowest)',
      redBarDelayMin: 50, redBarDelayMax: 200,
      buttonChangeDelayMin: 150, buttonChangeDelayMax: 400,
      microPauseChance: 0.058, shortBreakChance: 0.015, longPauseChance: 0.003,
      mistakeChance: 0.02,
      serverAckGuardMs: 80, actionEligibleDelayMs: 35,
      engineIntervalMs: 45, tickThrottleMs: 40,
      apiPollIntervalMin: 3000, apiPollIntervalMax: 7000,
      earlyFireMs: 0
    },
    balanced: {
      name: 'Balanced (Default)',
      redBarDelayMin: 30, redBarDelayMax: 100,
      buttonChangeDelayMin: 80, buttonChangeDelayMax: 200,
      microPauseChance: 0.03, shortBreakChance: 0.008, longPauseChance: 0.001,
      mistakeChance: 0.015,
      serverAckGuardMs: 80, actionEligibleDelayMs: 35,
      engineIntervalMs: 45, tickThrottleMs: 40,
      apiPollIntervalMin: 2500, apiPollIntervalMax: 5000,
      earlyFireMs: 0
    },
    fast: {
      name: 'Fast Stealth',
      redBarDelayMin: 20, redBarDelayMax: 60,
      buttonChangeDelayMin: 40, buttonChangeDelayMax: 120,
      microPauseChance: 0.015, shortBreakChance: 0.003, longPauseChance: 0,
      mistakeChance: 0.01,
      serverAckGuardMs: 60, actionEligibleDelayMs: 25,
      engineIntervalMs: 30, tickThrottleMs: 25,
      apiPollIntervalMin: 2000, apiPollIntervalMax: 4500,
      earlyFireMs: 0
    },
    minimal: {
      name: 'Minimal Stealth (Fastest, Higher Risk)',
      redBarDelayMin: 10, redBarDelayMax: 40,
      buttonChangeDelayMin: 20, buttonChangeDelayMax: 80,
      microPauseChance: 0.005, shortBreakChance: 0, longPauseChance: 0,
      mistakeChance: 0.005,
      serverAckGuardMs: 40, actionEligibleDelayMs: 15,
      engineIntervalMs: 25, tickThrottleMs: 20,
      apiPollIntervalMin: 2000, apiPollIntervalMax: 4000,
      earlyFireMs: 0
    },
    ludicrous: {
      name: 'Ludicrous Speed (MAXIMUM SPEED, HIGH DETECTION RISK)',
      redBarDelayMin: 0, redBarDelayMax: 10,
      buttonChangeDelayMin: 0, buttonChangeDelayMax: 20,
      microPauseChance: 0, shortBreakChance: 0, longPauseChance: 0,
      mistakeChance: 0,
      serverAckGuardMs: 20, actionEligibleDelayMs: 10,
      engineIntervalMs: 15, tickThrottleMs: 10,
      apiPollIntervalMin: 2500, apiPollIntervalMax: 6000,
      earlyFireMs: 0
    }
  };

  // Auto-load saved preset
  setTimeout(() => {
    try {
      const saved = localStorage.getItem('oa_stealth_preset_v1');
      if (saved === 'off') {
        STEALTH_CONFIG.enabled = false;
        STEALTH_CONFIG.useKeyboard = false;
        console.log('[Stealth] Loaded: OFF (direct clicks, zero delays)');
      } else if (saved && STEALTH_PRESETS[saved]) {
        Object.assign(STEALTH_CONFIG, STEALTH_PRESETS[saved]);
        STEALTH_CONFIG.enabled = true;
        STEALTH_CONFIG.useKeyboard = true;
        console.log('[Stealth] Loaded preset:', saved);
      }
      window.__oaStealthLoadedPreset = saved || 'balanced';
    } catch(e) { console.warn('[Stealth] Load error:', e); }
  }, 100);

  // Apply a preset
  _w.useStealthPreset = function(presetName) {
    const preset = STEALTH_PRESETS[presetName];
    if (!preset) {
      console.error('[Stealth] Unknown preset:', presetName);
      console.log('[Stealth] Available presets:', Object.keys(STEALTH_PRESETS).join(', '));
      return;
    }

    Object.assign(STEALTH_CONFIG, preset);
    console.log(`[Stealth] Applied preset: ${preset.name}`);
    console.log('[Stealth] Red bar delay:', `${preset.redBarDelayMin}-${preset.redBarDelayMax}ms`);
    console.log('[Stealth] Button change delay:', `${preset.buttonChangeDelayMin}-${preset.buttonChangeDelayMax}ms`);
    return preset;
  };

  _w.listStealthPresets = function() {
    console.log('[Stealth] Available presets:');
    for (const [key, preset] of Object.entries(STEALTH_PRESETS)) {
      console.log(`  ${key}: ${preset.name}`);
      console.log(`    → Red bar: ${preset.redBarDelayMin}-${preset.redBarDelayMax}ms`);
      console.log(`    → Button change: ${preset.buttonChangeDelayMin}-${preset.buttonChangeDelayMax}ms`);
    }
    console.log('\nUsage: useStealthPreset("fast")');
  };

  // Expose stealth controls
  _w.toggleStealth = function(enable) {
    STEALTH_CONFIG.enabled = enable !== undefined ? !!enable : !STEALTH_CONFIG.enabled;
    console.log('[Stealth] Mode:', STEALTH_CONFIG.enabled ? 'ON' : 'OFF');
    return STEALTH_CONFIG.enabled;
  };

  _w.stealthStatus = function() {
    console.log('[Stealth] Configuration:', STEALTH_CONFIG);
    return STEALTH_CONFIG;
  };

  _w.setStealthConfig = function(key, value) {
    if (key in STEALTH_CONFIG) {
      STEALTH_CONFIG[key] = value;
      console.log(`[Stealth] ${key} = ${value}`);
    } else {
      console.error('[Stealth] Unknown config key:', key);
    }
  };

  // Diagnostic: Verify stealth is actually working
  _w.verifyStealthActive = function() {
    console.log('═══════════════════════════════════════════════');
    console.log('       STEALTH MODE VERIFICATION              ');
    console.log('═══════════════════════════════════════════════');
    console.log('');
    console.log('🔍 Stealth Configuration:');
    console.log(`  Enabled: ${STEALTH_CONFIG.enabled ? '✅ YES' : '❌ NO'}`);
    console.log(`  Use Keyboard: ${STEALTH_CONFIG.useKeyboard ? '✅ YES (F/A/R hotkeys)' : '❌ NO (direct clicks)'}`);
    console.log(`  Add Mistakes: ${STEALTH_CONFIG.addMistakes ? '✅ YES' : '❌ NO'}`);
    console.log('');
    console.log('⏱️ Delay Settings:');
    console.log(`  Red Bar Delay: ${STEALTH_CONFIG.redBarDelayMin}-${STEALTH_CONFIG.redBarDelayMax}ms`);
    console.log(`  Button Change Delay: ${STEALTH_CONFIG.buttonChangeDelayMin}-${STEALTH_CONFIG.buttonChangeDelayMax}ms`);
    console.log(`  Mistake Chance: ${(STEALTH_CONFIG.mistakeChance * 100).toFixed(1)}%`);
    console.log('');
    console.log('🎮 Combat Profile:');
    try {
      const profile = window.__oaCombatProfile?.get();
      if (profile) {
        console.log(`  Current Profile: ${profile.label || profile.id}`);
        console.log(`  Profile Cooldown: ${profile.cfg?.clickCooldownMs || 0}ms`);
      }
    } catch {}
    console.log('');
    console.log('✅ CONFIRMATION:');
    if (STEALTH_CONFIG.enabled && STEALTH_CONFIG.useKeyboard) {
      console.log('  Stealth IS ACTIVE on ALL profiles!');
      console.log('  - Keyboard hotkeys (F/A/R) are used instead of clicks');
      console.log(`  - Red bar delay: ${STEALTH_CONFIG.redBarDelayMin}-${STEALTH_CONFIG.redBarDelayMax}ms added after bar completes`);
      console.log(`  - Button change delay: ${STEALTH_CONFIG.buttonChangeDelayMin}-${STEALTH_CONFIG.buttonChangeDelayMax}ms added when text changes`);
      console.log('');
      console.log('💡 To see delays in action:');
      console.log('  setStealthConfig("quietLogs", false)');
      console.log('  Then watch for: [Stealth] messages during combat');
    } else {
      console.log('  ⚠️ Stealth is DISABLED or not using keyboard!');
      console.log('');
      console.log('To enable:');
      console.log('  toggleStealth(true)');
      console.log('  useStealthPreset("minimal")');
    }
    console.log('═══════════════════════════════════════════════');
  };

  // Test early fire - find server tolerance (v6.9.60+)
  _w.testEarlyFire = function(ms) {
    if (ms === undefined) {
      console.log('════════════════════════════════════════════');
      console.log('    EARLY FIRE - SERVER TOLERANCE TEST     ');
      console.log('════════════════════════════════════════════');
      console.log(`Current earlyFireMs: ${STEALTH_CONFIG.earlyFireMs}`);
      console.log('');
      console.log('Usage: testEarlyFire(ms)');
      console.log('  0   = disabled (wait for bar, safe)');
      console.log('  25  = fire 25ms early (very safe test)');
      console.log('  50  = fire 50ms early (recommended test)');
      console.log('  100 = fire 100ms early (aggressive)');
      console.log('');
      console.log('Steps:');
      console.log('  1. resetPerfStats()');
      console.log('  2. testEarlyFire(50)');
      console.log('  3. Fight 2min, check actions/sec');
      console.log('  4. If faster → try 100. If same → server rejected');
      console.log('════════════════════════════════════════════');
      return;
    }
    STEALTH_CONFIG.earlyFireMs = Number(ms) || 0;
    if (STEALTH_CONFIG.earlyFireMs > 0) {
      console.log(`[EarlyFire] ✅ Set to ${STEALTH_CONFIG.earlyFireMs}ms - acting before bar fully drains!`);
      console.log('[EarlyFire] Watch for: [EarlyFire] Firing Xms early...');
    } else {
      console.log('[EarlyFire] ❌ Disabled - back to waiting for full bar');
    }
  };

  // Test DOM scraping for gold/exp (v6.9.56+)
  _w.testDOMScraping = function() {
    if (typeof window.__oaDOMTracking === 'undefined') {
      console.error('[DOM] Tracking not initialized yet. Wait 1-2 seconds after page load.');
      return;
    }

    const data = window.__oaDOMTracking.readHudFromDOM();
    console.log('═══════════════════════════════════════════════');
    console.log('       DOM SCRAPING TEST (v6.9.56+)          ');
    console.log('═══════════════════════════════════════════════');
    console.log('');
    console.log('📊 Data read from page DOM:');
    console.log(`  Gold: ${data.gold !== null ? data.gold.toLocaleString() : '❌ Not found'}`);
    console.log(`  Exp: ${data.exp !== null ? data.exp.toLocaleString() : '❌ Not found'}`);
    console.log(`  Exp to Next: ${data.exp_to_next !== null ? data.exp_to_next.toLocaleString() : '❌ Not found'}`);
    console.log(`  Level: ${data.level !== null ? data.level : '❌ Not found'}`);
    console.log(`  HP: ${data.hp !== null ? data.hp + '/' + data.max_hp : '❌ Not found'}`);
    console.log('');
    console.log('🎯 Status:');
    if (data.gold !== null || data.exp !== null || data.level !== null) {
      console.log('  ✅ DOM scraping WORKING!');
      console.log('  ✅ NO API CALLS to /api/hud_state.php');
      console.log('  ✅ ZERO server-side footprint for tracking');
      console.log('');
      console.log('💡 This eliminates the predictable API pattern that got you detected!');
    } else {
      console.log('  ⚠️ Could not find gold/exp elements in DOM');
      console.log('  ℹ️ This may be normal if you\'re not on the game page');
      console.log('  ℹ️ Script will keep trying to find elements every 500ms');
    }
    console.log('═══════════════════════════════════════════════');
    return data;
  };

  // ===== PERFORMANCE MONITORING =====
  const PERF_MONITOR = {
    gameAuto: {
      actionTimes: [],
      lastActionAt: 0,
      totalActions: 0,
      startTime: 0,
    },
    scriptAuto: {
      actionTimes: [],
      lastActionAt: 0,
      totalActions: 0,
      startTime: 0,
    },
    maxSamples: 100, // Keep last 100 actions for averaging
  };

  function recordAction(source) {
    const now = Date.now();
    const monitor = source === 'game' ? PERF_MONITOR.gameAuto : PERF_MONITOR.scriptAuto;

    if (!monitor.startTime) monitor.startTime = now;

    if (monitor.lastActionAt > 0) {
      const timeSinceLastAction = now - monitor.lastActionAt;
      monitor.actionTimes.push(timeSinceLastAction);

      // Keep only last N samples
      if (monitor.actionTimes.length > PERF_MONITOR.maxSamples) {
        monitor.actionTimes.shift();
      }
    }

    monitor.lastActionAt = now;
    monitor.totalActions++;
  }

  function getPerformanceStats(source) {
    const monitor = source === 'game' ? PERF_MONITOR.gameAuto : PERF_MONITOR.scriptAuto;

    if (monitor.actionTimes.length === 0) {
      return {
        avgTimePerAction: 0,
        actionsPerSecond: 0,
        totalActions: monitor.totalActions,
        sampleSize: 0,
        minTime: 0,
        maxTime: 0,
      };
    }

    const sum = monitor.actionTimes.reduce((a, b) => a + b, 0);
    const avg = sum / monitor.actionTimes.length;
    const min = Math.min(...monitor.actionTimes);
    const max = Math.max(...monitor.actionTimes);

    return {
      avgTimePerAction: avg,
      actionsPerSecond: 1000 / avg,
      totalActions: monitor.totalActions,
      sampleSize: monitor.actionTimes.length,
      minTime: min,
      maxTime: max,
      sessionDuration: monitor.startTime ? Date.now() - monitor.startTime : 0,
    };
  }

  _w.compareAutoSpeeds = function() {
    const gameStats = getPerformanceStats('game');
    const scriptStats = getPerformanceStats('script');

    console.log('═══════════════════════════════════════════════');
    console.log('       AUTO-COMBAT PERFORMANCE COMPARISON      ');
    console.log('═══════════════════════════════════════════════');
    console.log('');

    if (gameStats.totalActions > 0) {
      console.log('📊 GAME AUTO (Built-in):');
      console.log(`  Total Actions: ${gameStats.totalActions}`);
      console.log(`  Sample Size: ${gameStats.sampleSize} recent actions`);
      console.log(`  Avg Time/Action: ${gameStats.avgTimePerAction.toFixed(0)}ms`);
      console.log(`  Actions/Second: ${gameStats.actionsPerSecond.toFixed(2)}`);
      console.log(`  Min/Max Time: ${gameStats.minTime.toFixed(0)}ms / ${gameStats.maxTime.toFixed(0)}ms`);
      if (gameStats.sessionDuration > 0) {
        console.log(`  Session Duration: ${(gameStats.sessionDuration / 1000 / 60).toFixed(1)} minutes`);
      }
      console.log('');
    } else {
      console.log('📊 GAME AUTO: No data yet (turn on game auto to measure)');
      console.log('');
    }

    if (scriptStats.totalActions > 0) {
      console.log('⚡ SCRIPT AUTO (with stealth):');
      console.log(`  Total Actions: ${scriptStats.totalActions}`);
      console.log(`  Sample Size: ${scriptStats.sampleSize} recent actions`);
      console.log(`  Avg Time/Action: ${scriptStats.avgTimePerAction.toFixed(0)}ms`);
      console.log(`  Actions/Second: ${scriptStats.actionsPerSecond.toFixed(2)}`);
      console.log(`  Min/Max Time: ${scriptStats.minTime.toFixed(0)}ms / ${scriptStats.maxTime.toFixed(0)}ms`);
      if (scriptStats.sessionDuration > 0) {
        console.log(`  Session Duration: ${(scriptStats.sessionDuration / 1000 / 60).toFixed(1)} minutes`);
      }
      console.log('');
    } else {
      console.log('⚡ SCRIPT AUTO: No data yet (turn on script auto to measure)');
      console.log('');
    }

    if (gameStats.totalActions > 0 && scriptStats.totalActions > 0) {
      const speedRatio = (scriptStats.actionsPerSecond / gameStats.actionsPerSecond) * 100;
      const timeDiff = scriptStats.avgTimePerAction - gameStats.avgTimePerAction;

      console.log('🔍 COMPARISON:');
      console.log(`  Script is ${speedRatio.toFixed(1)}% of game auto speed`);
      console.log(`  Script adds ${timeDiff.toFixed(0)}ms overhead per action`);

      if (speedRatio >= 95) {
        console.log('  ✅ Virtually identical speeds!');
      } else if (speedRatio >= 90) {
        console.log('  ✅ Very close - difference is barely noticeable');
      } else if (speedRatio >= 80) {
        console.log('  ⚠️  Noticeable but minor difference');
      } else {
        console.log('  ⚠️  Significant difference - check stealth settings');
      }
      console.log('');
    }

    console.log('═══════════════════════════════════════════════');
    console.log('💡 Tips:');
    console.log('  - Use game auto for pure speed (press F3)');
    console.log('  - Use script auto for beasts + stealth (press F1)');
    console.log('  - Run: useStealthPreset("minimal") for faster script auto');
    console.log('  - Run: resetPerfStats() to clear and restart measurement');
    console.log('═══════════════════════════════════════════════');

    return { game: gameStats, script: scriptStats };
  };

  _w.resetPerfStats = function() {
    PERF_MONITOR.gameAuto = { actionTimes: [], lastActionAt: 0, totalActions: 0, startTime: 0 };
    PERF_MONITOR.scriptAuto = { actionTimes: [], lastActionAt: 0, totalActions: 0, startTime: 0 };
    console.log('[PerfMonitor] Stats reset. Start game auto or script auto to begin measuring.');
  };

  _w.perfStats = function(source) {
    if (source === 'game') {
      const stats = getPerformanceStats('game');
      console.log('📊 Game Auto Stats:', stats);
      return stats;
    } else if (source === 'script') {
      const stats = getPerformanceStats('script');
      console.log('⚡ Script Auto Stats:', stats);
      return stats;
    } else {
      return _w.compareAutoSpeeds();
    }
  };

  // Expose the recording function for use in combat code
  window.__oaRecordAction = recordAction;

  // ===== Safe Built-in Debug API (no hotkeys, no listeners) =====
  // Use: window.__oaDebugDump()  -> prints + returns a JSON snapshot. Also stores it to localStorage: oa_last_debug_dump_v1
  (function initSafeDebugAPI() {
    if (window.__oaDebugDump) return;

    const KA_KEY = "oa_kingdom_auto_settings_v3";

    function safeJson(v) { try { return JSON.parse(v); } catch { return v; } }
    function jget(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return localStorage.getItem(k); } }

    function guessPlaneFromForms() {
      const order = ["underworld","katabasis","aetheria","aerion","olympus"];
      const forms = Array.from(document.querySelectorAll('form[data-plane-change-form]'));
      let up = "", down = "";
      for (const f of forms) {
        const pid = String(f.querySelector('input[name="plane_id"]')?.value || "").trim().toLowerCase();
        const btn = f.querySelector('button[type="submit"], button');
        const title = String(btn?.getAttribute("title") || "").toLowerCase();
        const txt = String(btn?.textContent || "").toLowerCase();
        const joined = `${title} ${txt}`;
        if (joined.includes("ascend") || joined.includes("p↑") || joined.includes("↑")) up = pid;
        if (joined.includes("descend") || joined.includes("p↓") || joined.includes("↓")) down = pid;
      }
      const ui = order.indexOf(up);
      const di = order.indexOf(down);
      if (up && down && ui >= 0 && di >= 0) {
        if (ui - di === 2) return order[di + 1];
        if (di - ui === 2) return order[ui + 1];
        if (ui > di) return order[Math.max(0, ui - 1)];
        if (di > ui) return order[Math.min(order.length - 1, di + 1)];
      }
      if (up && ui >= 0) return order[Math.max(0, ui - 1)];
      if (down && di >= 0) return order[Math.min(order.length - 1, di + 1)];
      return "";
    }

    function readKA() {
      const s = safeJson(localStorage.getItem(KA_KEY) || "{}") || {};
      const active = s.activeProfile || "Default";
      const prof = (s.profiles && s.profiles[active]) ? s.profiles[active] : null;
      return { activeProfile: active, profile: prof };
    }

    window.__oaDebugDump = function(reason) {
      const url = location.href;
      const tabParam = new URL(url).searchParams.get("tab") || "combat";
      const { activeProfile, profile } = readKA();
      const forms = Array.from(document.querySelectorAll('form[data-plane-change-form]')).map(f => {
        const pid = f.querySelector('input[name="plane_id"]')?.value || "";
        const btn = f.querySelector('button[type="submit"],button');
        return {
          plane_id: pid,
          title: btn?.getAttribute("title") || "",
          text: (btn?.textContent || "").trim(),
        };
      });

      const st = document.querySelector("#server-time");
      const dump = {
        reason: reason || "manual",
        nowISO: new Date().toISOString(),
        url,
        tabParam,
        loadedVersion: localStorage.getItem("oa_userscript_loaded_version_v1") || window.__OA_SCRIPT_VERSION || "",
        kingdomAuto: {
          activeProfile,
          wantPlane: profile?.plane ?? null,
          teleportToStart: profile?.teleportToStart ?? null,
          dryRun: profile?.dryRun ?? null,
          onlyUnruled: profile?.onlyUnruled ?? null,
          stepsCount: Array.isArray(profile?.steps) ? profile.steps.length : null,
        },
        gate: {
          gateTrace: jget("oa_ka_gate_trace_v1"),
          pendingPlane: jget("oa_ka_pending_start_plane_v1"),
          alignedToken: jget("oa_ka_plane_aligned_token_v1"),
          lastPlaneEnforce: jget("oa_ka_last_plane_enforce_v1"),
          planeStepAttempt: jget("oa_ka_plane_step_attempt_v1"),
        },
        planeUI: {
          planeFormsCount: forms.length,
          planeForms: forms.slice(0, 8),
          guessPlaneFromForms: guessPlaneFromForms() || null,
        },
        serverTime: st ? {
          text: (st.textContent || "").trim(),
          epoch: st.dataset?.serverEpoch || null,
          utcOffset: st.dataset?.serverUtcOffset || null,
        } : null,
      };

      try { localStorage.setItem("oa_last_debug_dump_v1", JSON.stringify(dump)); } catch {}
      console.log("[OA DEBUG DUMP]", dump);
      try { if (typeof notify === "function") notify("OA debug dumped to console."); } catch {}
      return dump;
    };
  })();
// ===== Kingdom Plane UI Event Delegation (survives modal rerenders) =====
  (function initPlaneUIDelegation() {
    if (window.__oaPlaneUIDelegationInstalled) return;
    window.__oaPlaneUIDelegationInstalled = true;

    const KA_KEY = "oa_kingdom_auto_settings_v3";
    const PLANE_ORDER = ["underworld","katabasis","aetheria","aerion","olympus"];

    const normPlane = (p) => {
      const x = String(p || "").trim().toLowerCase();
      if (!x) return "";
      if (x === "oly" || x.includes("olymp")) return "olympus";
      if (x === "aer" || x.includes("aerion")) return "aerion";
      if (x === "aeth" || x.includes("aether")) return "aetheria";
      if (x === "kat" || x.includes("katab")) return "katabasis";
      if (x === "und" || x.includes("under")) return "underworld";
      if (PLANE_ORDER.includes(x)) return x;
      return x.replace(/[^a-z]/g, "");
    };

    const readStore = () => {
      try { return JSON.parse(localStorage.getItem(KA_KEY) || "{}") || {}; }
      catch (e) { return {}; }
    };
    const writeStore = (s) => {
      try { localStorage.setItem(KA_KEY, JSON.stringify(s || {})); return true; }
      catch (e) { return false; }
    };
    const ensureProfile = (store, name) => {
      store.profiles = store.profiles || {};
      if (!store.profiles[name]) store.profiles[name] = { steps: [], plane: "" };
      if (typeof store.profiles[name] !== "object") store.profiles[name] = { steps: [], plane: "" };
      if (!("plane" in store.profiles[name])) store.profiles[name].plane = "";
      return store.profiles[name];
    };

    const isInKAModal = (el) => {
      try {
        const m = document.getElementById("oa-ka-modal");
        return !!(m && m.contains(el) && m.style.display !== "none");
      } catch (e) { return false; }
    };

    const detectPlaneFromForms = () => {
      try {
        const forms = Array.from(document.querySelectorAll('form[data-plane-change-form]'));
        if (!forms.length) return "";
        let up = "", down = "";
        for (const f of forms) {
          const pid = normPlane(f.querySelector('input[name="plane_id"]')?.value || "");
          const btn = f.querySelector('button[type="submit"], button');
          const title = String(btn?.getAttribute("title") || "").toLowerCase();
          const txt = String(btn?.textContent || "").toLowerCase();
          const joined = title + " " + txt;
          if (joined.includes("ascend") || joined.includes("p↑") || joined.includes("↑")) up = pid;
          if (joined.includes("descend") || joined.includes("p↓") || joined.includes("↓")) down = pid;
        }
        const ui = PLANE_ORDER.indexOf(up);
        const di = PLANE_ORDER.indexOf(down);
        if (up && down && ui >= 0 && di >= 0) {
          if (ui - di === 2) return PLANE_ORDER[di + 1] || "";
          if (di - ui === 2) return PLANE_ORDER[ui + 1] || "";
          if (ui > di) return PLANE_ORDER[ui - 1] || "";
          if (di > ui) return PLANE_ORDER[di + 1] || "";
        }
        if (up && ui >= 0) return PLANE_ORDER[Math.max(0, ui - 1)] || "";
        if (down && di >= 0) return PLANE_ORDER[Math.min(PLANE_ORDER.length - 1, di + 1)] || "";
      } catch {}
      return "";
    };

    const detectPlaneBestEffort = () => {
      // Try game helpers (if visible), then plane forms, then combat lock key
      try { if (typeof getCurrentPlaneName === "function") { const p = normPlane(getCurrentPlaneName()); if (p) return p; } } catch {}
      try { if (typeof getCurrentLocationKey === "function") {
        const k = String(getCurrentLocationKey() || "");
        const mm = k.match(/^\d{3},([^,]+),\d{3}$/i);
        const p = normPlane(mm?.[1] || "");
        if (p) return p;
      } } catch {}
      const f = detectPlaneFromForms(); if (f) return f;
      try { const lock = normPlane(localStorage.getItem("oa_pve_plane_lock_v1") || ""); if (lock) return lock; } catch {}
      try { const last = normPlane(localStorage.getItem("oa_ka_last_plane_v1") || ""); if (last) return last; } catch {}
      return "";
    };

    const savePlaneToActiveProfile = (plane) => {
      const p = normPlane(plane || "");
      const store = readStore();
      const active = String(store.activeProfile || "Default");
      const prof = ensureProfile(store, active);
      prof.plane = p;
      store.activeProfile = active;
      const ok = writeStore(store);
      try { localStorage.setItem("oa_ka_last_plane_v1", p); } catch {}
      return { ok, active, plane: p };
    };

    const onChange = (ev) => {
      try {
        const t = ev.target;
        if (!t || t.id !== "oa-ka-plane") return;
        if (!isInKAModal(t)) return;

        const v = normPlane(String(t.value || ""));
        __oaRecordUIAction("plane_select_change", { plane: v });
        const r = savePlaneToActiveProfile(v);
        __oaRecordUIAction("plane_select_saved", { plane: r.plane, profile: r.active });
        console.log("[KingdomAuto][Plane][DELEGATE] selected+saved:", r);
      } catch (e) {
        try { __oaRecordUIAction("plane_select_error", { err: String(e && e.message || e) }); } catch {}
      }
    };

    const onClick = (ev) => {
      try {
        const btn = ev.target && (ev.target.closest ? ev.target.closest("#oa-ka-plane-lock-current") : null);
        if (!btn) return;
        if (!isInKAModal(btn)) return;

        __oaRecordUIAction("lock_current_clicked", {});
        const cur = detectPlaneBestEffort();
        if (!cur) {
          __oaRecordUIAction("lock_current_unknown_plane", {});
          console.log("[KingdomAuto][Plane][DELEGATE] current plane unknown here (go Map/Combat and try again).");
          return;
        }

        const r = savePlaneToActiveProfile(cur);
        __oaRecordUIAction("lock_current_saved", { plane: r.plane, profile: r.active });
        console.log("[KingdomAuto][Plane][DELEGATE] locked+saved:", r);

        // reflect in select if present
        try {
          const m = document.getElementById("oa-ka-modal");
          const sel = m && m.querySelector && m.querySelector("#oa-ka-plane");
          if (sel) sel.value = r.plane;
        } catch {}
      } catch (e) {
        try { __oaRecordUIAction("lock_current_error", { err: String(e && e.message || e) }); } catch {}
      }
    };

    document.addEventListener("change", onChange, true);
    document.addEventListener("click", onClick, true);
  })();
// --- Version marker (readable from page console via localStorage) ---
  const __OA_USERSCRIPT_VERSION = '6.9.16.165';
  try {
    localStorage.setItem("oa_userscript_loaded_version_v1", __OA_USERSCRIPT_VERSION);
    localStorage.setItem("oa_userscript_loaded_at_v1", String(Date.now()));
  } catch {}

  function __oaRecordUIAction(type, payload) {
    try {
      const obj = { at: Date.now(), type: String(type || ""), ...(payload || {}) };
      localStorage.setItem("oa_ka_last_ui_action_v1", JSON.stringify(obj));
      const key = "oa_ka_ui_actions_v1";
      let arr = [];
      try { arr = JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { arr = []; }
      if (!Array.isArray(arr)) arr = [];
      arr.push(obj);
      if (arr.length > 50) arr = arr.slice(arr.length - 50);
      localStorage.setItem(key, JSON.stringify(arr));
    } catch {}
  }
// ===== Global Plane Helpers (shared across modules) =====
  const __OA_PLANE_ORDER = ["underworld","katabasis","aetheria","aerion","olympus"];
  const __OA_PLANE_SYNONYMS = {
    under: "underworld", underworld: "underworld",
    kata: "katabasis", kat: "katabasis", katabasis: "katabasis",
    aeth: "aetheria", aetheria: "aetheria", etheria: "aetheria",
    aer: "aerion", aerion: "aerion",
    oly: "olympus", olympus: "olympus",
    gaia: "olympus" // legacy
  };

  function normalizePlaneName(v) {
    const raw = String(v || "").trim().toLowerCase();
    if (!raw) return "";
    const key = raw.replace(/[^a-z]/g, "");
    const norm = __OA_PLANE_SYNONYMS[key] || key;
    return __OA_PLANE_ORDER.includes(norm) ? norm : norm;
  }

    // --- Local plane detector for Kingdom Auto / Plane tools ---
    // Returns canonical id: underworld|katabasis|aetheria|aerion|olympus|"".
    function detectPlaneLocal() {
      const cache = (pid) => {
        try {
          const n = normalizePlaneName(pid || "");
          if (!n) return "";
          localStorage.setItem("oa_last_plane_cache_v1", n);
          localStorage.setItem("oa_last_plane_cache_at_v1", String(Date.now()));
          return n;
        } catch (e) { return normalizePlaneName(pid || ""); }
      };

      try {
        // 1) From location key "###,plane,###"
        const k = (typeof getCurrentLocationKey === "function") ? String(getCurrentLocationKey() || "") : "";
        if (k) {
          const mm = k.match(/^\d{3},([^,]+),\d{3}$/i);
          const pid = normalizePlaneName(mm?.[1] || "");
          if (pid) return cache(pid);
        }
      } catch {}

      try {
        // 2) CombatState / HUD card
        const pid = (typeof getPlaneIdSafe === "function") ? getPlaneIdSafe() : null;
        const n = normalizePlaneName(pid || "");
        if (n) return cache(n);
      } catch {}

      try {
        // 3) Map plane-change forms inference (Ascend/Descend buttons)
        const order = ["underworld","katabasis","aetheria","aerion","olympus"];
        const forms = Array.from(document.querySelectorAll('form[data-plane-change-form]'));
        if (forms && forms.length) {
          let up = "", down = "";
          for (const f of forms) {
            const pid = normalizePlaneName(f.querySelector('input[name="plane_id"]')?.value || "");
            const btn = f.querySelector('button[type="submit"], button');
            const title = String(btn?.getAttribute("title") || "").toLowerCase();
            const txt = String(btn?.textContent || "").toLowerCase();
            const joined = title + " " + txt;
            if (joined.includes("ascend") || joined.includes("p↑") || joined.includes("↑")) up = pid;
            if (joined.includes("descend") || joined.includes("p↓") || joined.includes("↓")) down = pid;
          }
          const ui = order.indexOf(up);
          const di = order.indexOf(down);
          if (up && down && ui >= 0 && di >= 0) {
            // expect current between the two
            if (ui - di === 2) return cache(order[di+1]);
            if (di - ui === 2) return cache(order[ui+1]);
          }
          if (up && ui >= 0) return cache(order[Math.max(0, ui-1)] || "");
          if (down && di >= 0) return cache(order[Math.min(order.length-1, di+1)] || "");
        }
      } catch {}

      try {
        // 4) Game helper if exposed
        if (typeof getCurrentPlaneName === "function") {
          const n = normalizePlaneName(getCurrentPlaneName() || "");
          if (n) return cache(n);
        }
      } catch {}

      // 5) REMOVED: Do NOT use combat plane lock as current plane detection
      // This was causing infinite loops when plane detection failed and fell back
      // to the lock, making the system think it was on a different plane than reality.

      // 6) Last known cache (2 minutes)
      try {
        const last = String(localStorage.getItem("oa_last_plane_cache_v1") || "");
        const at = Number(localStorage.getItem("oa_last_plane_cache_at_v1") || 0) || 0;
        if (last && (Date.now() - at) < 120000) return normalizePlaneName(last);
      } catch {}
      return "";
    }

    // Strict plane detection: do NOT fall back to plane-lock settings (prevents false positives).
    function detectPlaneStrictLocal() {
      const cache = (pid) => {
        try {
          const n = normalizePlaneName(pid || "");
          if (!n) return "";
          localStorage.setItem("oa_last_plane_cache_strict_v1", n);
          localStorage.setItem("oa_last_plane_cache_strict_at_v1", String(Date.now()));
          return n;
        } catch (e) { return normalizePlaneName(pid || ""); }
      };

      try {
        // 1) From location key "###,plane,###"
        const k = (typeof getCurrentLocationKey === "function") ? String(getCurrentLocationKey() || "") : "";
        if (k) {
          const mm = k.match(/^\d{3},([^,]+),\d{3}$/i);
          const pid = normalizePlaneName(mm?.[1] || "");
          if (pid) return cache(pid);
        }
      } catch {}

      try {
        // 2) CombatState / HUD helpers (if present)
        const pid = (typeof getPlaneIdSafe === "function") ? getPlaneIdSafe() : null;
        const n = normalizePlaneName(pid || "");
        if (n) return cache(n);
      } catch {}

      try {
        // 3) Map plane-change forms inference (Ascend/Descend buttons)
        const order = ["underworld","katabasis","aetheria","aerion","olympus"];
        const forms = Array.from(document.querySelectorAll('form[data-plane-change-form]'));
        if (forms && forms.length) {
          let up = "", down = "";
          for (const f of forms) {
            const pid = normalizePlaneName(f.querySelector('input[name="plane_id"]')?.value || "");
            const btn = f.querySelector('button[type="submit"], button');
            const title = String(btn?.getAttribute("title") || "").toLowerCase();
            const txt = String(btn?.textContent || "").toLowerCase();
            const joined = title + " " + txt;
            if (joined.includes("ascend") || joined.includes("p↑") || joined.includes("↑")) up = pid;
            if (joined.includes("descend") || joined.includes("p↓") || joined.includes("↓")) down = pid;
          }
          const ui = order.indexOf(up);
          const di = order.indexOf(down);
          if (up && down && ui >= 0 && di >= 0) {
            if (ui - di === 2) return cache(order[di+1]);
            if (di - ui === 2) return cache(order[ui+1]);
          }
          if (up && ui >= 0) return cache(order[Math.max(0, ui-1)] || "");
          if (down && di >= 0) return cache(order[Math.min(order.length-1, di+1)] || "");
        }
      } catch {}

      try {
        // 4) Game helper if exposed
        if (typeof getCurrentPlaneName === "function") {
          const n = normalizePlaneName(getCurrentPlaneName() || "");
          if (n) return cache(n);
        }
      } catch {}

      // 5) Strict cache (2 minutes)
      try {
        const last = String(localStorage.getItem("oa_last_plane_cache_strict_v1") || "");
        const at = Number(localStorage.getItem("oa_last_plane_cache_strict_at_v1") || 0) || 0;
        if (last && (Date.now() - at) < 120000) return normalizePlaneName(last);
      } catch {}

      return "";
    }

    // --- Kingdom Plane Debug Snapshot + Page Bridge (for GM sandbox scripts) ---
    // This script runs with GM_xmlhttpRequest grants, so it is sandboxed. The page console cannot see sandbox globals.
    // We therefore write a snapshot to localStorage and install a tiny page-context bridge with dump() helpers.
    const __OA_KA_STORE_KEY = "oa_kingdom_auto_settings_v3";

    function __oaGetActiveProfileFromStore(store) {
      try { return String(store?.activeProfile || "Default"); } catch (e) { return "Default"; }
    }

    function __oaGetWantPlaneFromStore(store) {
      try {
        const ap = __oaGetActiveProfileFromStore(store);
        const want = normalizePlaneName(store?.profiles?.[ap]?.plane || "");
        return want || "";
      } catch (e) { return ""; }
    }

    function __oaReadKAStoreRaw() {
      try { return localStorage.getItem(__OA_KA_STORE_KEY) || ""; } catch (e) { return ""; }
    }

    function __oaReadKAStore() {
      try {
        const raw = __oaReadKAStoreRaw();
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }

    function __oaGetTabLocal() {
      try { return new URL(location.href).searchParams.get("tab") || "combat"; } catch (e) { return "combat"; }
    }

    function __oaWritePlaneDebugSnapshot(reason) {
      try {
        const store = __oaReadKAStore();
        const activeProfile = __oaGetActiveProfileFromStore(store);
        const want = __oaGetWantPlaneFromStore(store);
        const cur = normalizePlaneName(detectPlaneLocal() || "");

        const forms = document.querySelectorAll('form[data-plane-change-form]');
        const snap = {
          ok: true,
          reason: String(reason || ""),
          at: Date.now(),
          tab: __oaGetTabLocal(),
          url: location.href,
          curPlane: cur || "",
          wantPlane: want || "",
          activeProfile,
          storeHasPlane: !!(store?.profiles?.[activeProfile]?.plane),
          planeFormsCount: forms?.length || 0,
          hasPlaneForms: !!(forms && forms.length),
        };

        localStorage.setItem("oa_plane_debug_snapshot_v1", JSON.stringify(snap));
        if (cur) localStorage.setItem("oa_plane_current_guess_v1", cur);
        localStorage.setItem("oa_plane_current_guess_at_v1", String(Date.now()));
      } catch {}
    }

    function __oaInstallPlanePageBridge() {
      try {
        if (document.getElementById("oa-plane-bridge-v1")) return;
        const sc = document.createElement("script");
        sc.id = "oa-plane-bridge-v1";
        sc.type = "text/javascript";
        sc.textContent = `(function(){try{
          if(window.__oaPlaneBridgeInstalled) return;
          window.__oaPlaneBridgeInstalled=true;

          window.__oaKingdomPlaneDebug = window.__oaKingdomPlaneDebug || {};
          window.__oaKingdomPlaneDebug.ping = function(){ return {ok:true, at:Date.now()}; };
          window.__oaKingdomPlaneDebug.dump = function(){
            try { return JSON.parse(localStorage.getItem('oa_plane_debug_snapshot_v1')||'null'); } catch(e){ return null; }
          };

          window.__oaPlaneLock = window.__oaPlaneLock || {};
          window.__oaPlaneLock.detectCurrentPlane = function(){
            try { return localStorage.getItem('oa_plane_current_guess_v1')||''; } catch(e){ return ''; }
          };
          window.__oaPlaneLock.debugInfo = function(){
            try { return JSON.parse(localStorage.getItem('oa_plane_debug_snapshot_v1')||'null'); } catch(e){ return null; }
          };
        }catch {}})();`;
        (document.head || document.documentElement).appendChild(sc);
      } catch {}
    }

    try { __oaInstallPlanePageBridge(); } catch {}
    try { __oaWritePlaneDebugSnapshot("init"); } catch {}
    try { setInterval(() => __oaWritePlaneDebugSnapshot("interval"), 2000); } catch {}

// Expose plane helpers for debugging in console
    try {
      window.__oaKingdomPlaneDebug = {
        detectPlaneLocal: () => {
          try { return normalizePlaneName(detectPlaneLocal() || ""); } catch (e) { return ""; }
        },
        getWantPlane: () => {
          try {
            const cfg = loadSettings();
            const want = normalizePlaneName(cfg?.plane || "");
            return want || "";
          } catch (e) { return ""; }
        },
        dump: () => {
          try {
            const cfg = loadSettings();
            const want = normalizePlaneName(cfg?.plane || "");
            const cur = normalizePlaneName(detectPlaneLocal() || "");
            return { want, cur, tab: getTab(), activeProfile: cfg?.activeProfile, raw: cfg };
          } catch (e) { return { error: String(e) }; }
        }
      };
    } catch {}

  // ===== Plane Lock Manager (reliable, no hotkey-scope dependency) =====
  (function initPlaneLockManager(){
    const KEY = "oa_pve_plane_lock_v1";
    const ORDER = ["underworld","katabasis","aetheria","aerion","olympus"];

    function norm(p){
      const x = String(p||"").trim().toLowerCase();
      if (!x) return "";
      if (x.includes("under")) return "underworld";
      if (x.includes("kat")) return "katabasis";
      if (x.includes("aeth")) return "aetheria";
      if (x.includes("aerion")) return "aerion";
      if (x.includes("olymp")) return "olympus";
      // already an id?
      if (ORDER.includes(x)) return x;
      return x.replace(/[^a-z]/g,"");
    }

    function getTargets(){
      const forms = Array.from(document.querySelectorAll('form[data-plane-change-form]'));
      let up = "", down = "";
      for (const f of forms) {
        const btn = f.querySelector('button[type="submit"], button:not([type])');
        if (!btn) continue;
        const title = String(btn.getAttribute("title")||"").toLowerCase();
        const txt = String(btn.textContent||"").toLowerCase();
        const joined = title + " " + txt;
        const planeId = norm(f.querySelector('input[name="plane_id"]')?.value || "");
        if (!planeId) continue;
        if (joined.includes("ascend")) up = planeId;
        if (joined.includes("descend")) down = planeId;
        // fallback arrows
        if (!up && joined.includes("↑")) up = planeId;
        if (!down && joined.includes("↓")) down = planeId;
      }
      return { up, down };
    }

    function detectCurrentPlane() {
      try {
        // 1) Prefer the game's own plane id if available (most reliable)
        if (typeof getCurrentPlaneName === "function") {
          const p = getCurrentPlaneName();
          const n = norm(p);
          if (ORDER.includes(n)) return n;
        }
      } catch {}

      try {
        // 2) Try HUD location card dataset plane tokens
        const card = (typeof getHudLocationCard === "function") ? getHudLocationCard() : null;
        const pid = norm(card?.dataset?.planeId || card?.dataset?.plane || "");
        if (ORDER.includes(pid)) return pid;
      } catch {}

      try {
        // 3) Parse from location key "###,Plane,###"
        const k = String((typeof getCurrentLocationKey === "function" ? getCurrentLocationKey() : "") || "");
        const mm = k.match(/^\d{3},([^,]+),\d{3}$/i);
        const pid = norm(mm?.[1] || "");
        if (ORDER.includes(pid)) return pid;
      } catch {}

      try {
        // 4) Infer from plane-change HUD buttons (fallback)
        const { up, down } = getTargets();
        const upIdx = ORDER.indexOf(up);
        const downIdx = ORDER.indexOf(down);

        if (up && down && upIdx >= 0 && downIdx >= 0) {
          const mid = (upIdx + downIdx) / 2;
          if (Number.isInteger(mid) && ORDER[mid]) return ORDER[mid];
          if (upIdx > downIdx) return ORDER[upIdx - 1] || ORDER[downIdx + 1] || "";
        }

        if (up && upIdx >= 0) return ORDER[Math.max(0, upIdx - 1)] || "";
        if (down && downIdx >= 0) return ORDER[Math.min(ORDER.length - 1, downIdx + 1)] || "";
      } catch {}

      return "";
    }

    function get(){
      try { return String(localStorage.getItem(KEY) || "").trim(); } catch (e) { return ""; }
    }
    function set(val){
      try {
        const v = norm(val);
        if (!v) return false;
        localStorage.setItem(KEY, v);
        return true;
      } catch (e) { return false; }
    }
    function clear(){
      try { localStorage.removeItem(KEY); } catch {}
    }

    function ensureUI(){
      const ID = "oa-plane-lock-ui";
      const existing = document.getElementById(ID);
      const hudNow = document.getElementById("oa-last-beast-ui");
      if (existing) {
        // If we mounted before the HUD existed, relocate into HUD when available.
        if (hudNow && !hudNow.contains(existing)) {
          try { existing.remove(); } catch (e) { return; }
        } else {
          return;
        }
      }
      // Prefer placing in the OA HUD (oa-last-beast-ui); fall back to server-time / plane buttons.
      const hud = document.getElementById("oa-last-beast-ui");
      let anchor = null;
      let inHud = false;
      if (hud) {
        const leftCol = hud.children && hud.children[0];
        const profileRow = leftCol && leftCol.children && leftCol.children[2];
        anchor = profileRow || leftCol || hud;
        inHud = true;
      } else {
        anchor = document.getElementById("server-time")
          || document.querySelector("#server-time")
          || document.querySelector('form[data-plane-change-form]')?.parentElement;
      }
      if (!anchor) return;

      const wrap = document.createElement("div");
      wrap.id = ID;
      wrap.style.cssText = "display:inline-flex;align-items:center;gap:6px;margin-left:10px;padding:4px 8px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.35);color:#fff;font-size:12px;line-height:1.2;";

      const label = document.createElement("span");
      label.textContent = "PvE Plane:";
      label.style.opacity = "0.9";

      const sel = document.createElement("select");
      sel.style.cssText = "background:rgba(0,0,0,.25);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:2px 6px;font-size:12px;";
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "None";
      sel.appendChild(opt0);
      for (const p of ORDER) {
        const o = document.createElement("option");
        o.value = p;
        o.textContent = p[0].toUpperCase() + p.slice(1);
        sel.appendChild(o);
      }

      const btnCur = document.createElement("button");
      btnCur.type = "button";
      btnCur.textContent = "Lock=Current";
      btnCur.style.cssText = "padding:2px 6px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;";
      btnCur.title = "Set PvE plane lock to your current plane (inferred from P↑/P↓ buttons).";

      const btnClear = document.createElement("button");
      btnClear.type = "button";
      btnClear.textContent = "Clear";
      btnClear.style.cssText = btnCur.style.cssText;
      btnClear.title = "Clear PvE plane lock.";

      const status = document.createElement("span");
      status.style.cssText = "opacity:.85;margin-left:4px;";

      function refresh(){
        const v = get();
        sel.value = v;
        status.textContent = v ? ("Locked: " + v) : "Unlocked";
      }

      sel.addEventListener("change", () => {
        const v = sel.value;
        if (!v) clear();
        else set(v);
        refresh();
      });

      btnCur.addEventListener("click", () => {
        const cur = detectCurrentPlane();
        if (cur) set(cur);
        refresh();
        console.log("[PlaneLock] set to current:", cur || "(unknown)");
      });

      btnClear.addEventListener("click", () => {
        clear(); refresh();
        console.log("[PlaneLock] cleared");
      });

      wrap.appendChild(label);
      wrap.appendChild(sel);
      wrap.appendChild(btnCur);
      wrap.appendChild(btnClear);
      wrap.appendChild(status);

      if (inHud) { try { anchor.appendChild(wrap); } catch {} }
      else { anchor.insertAdjacentElement("afterend", wrap); }
      refresh();
      setInterval(refresh, 3000);
      setTimeout(__oaPlaneLock_relocateIntoHUD, 350);
      setTimeout(__oaPlaneLock_relocateIntoHUD, 1200);

    }
    function __oaPlaneLock_relocateIntoHUD(){
      try {
        const ui = document.getElementById("oa-plane-lock-ui");
        const hud = document.getElementById("oa-last-beast-ui");
        if (ui && hud && !hud.contains(ui)) {
          // Put it near the top of the HUD
          ui.style.marginLeft = "0";
          ui.style.marginTop = "6px";
          ui.style.display = "flex";
          ui.style.flexWrap = "wrap";
          hud.appendChild(ui);
        }
      } catch {}
    }

    // Expose a small API
    window.__oaPlaneLock = {
      KEY, ORDER,
      norm,
      get, set, clear,
      detectCurrentPlane,
      ensureUI,
    };

    // Mount UI a couple times in case header loads late
    const mount = () => { try { ensureUI(); } catch {} };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => { mount(); setTimeout(mount, 800); setTimeout(mount, 2500); }, { once:true });
    } else {
      mount(); setTimeout(mount, 800); setTimeout(mount, 2500);
    }
  })();

  // Script build/version marker (reduced visibility for stealth)
  try { if (!STEALTH_CONFIG.quietLogs) window.__OA_SCRIPT_VERSION = '6.9.44'; } catch {}
  if (!STEALTH_CONFIG.quietLogs) {
    try { console.log('[OA Script] Loaded v6.9.44 (STEALTH)'); } catch {}
  }

  // Visible badge next to the Server time chip so you can confirm the script is actually running
  (function attachVersionBadge(){
    // Skip badge if stealth mode is enabled
    if (STEALTH_CONFIG.hideVersionBadge) {
      if (!STEALTH_CONFIG.quietLogs) console.log('[Stealth] Version badge hidden');
      return;
    }

    const BADGE_ID = "oa-script-version-badge";
    const COMBAT_BTN_ID = "oa-autocombat-toggle-btn";

    function updateCombatToggleBtn() {
      const btn = document.getElementById(COMBAT_BTN_ID);
      if (!btn) return;
      const on = !!(window.__oaState && window.__oaState.enabled);
      btn.textContent = on ? "⚔️ Auto: ON" : "⚔️ Auto: OFF";
      btn.style.background = on ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.2)";
      btn.style.borderColor = on ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.4)";
      btn.style.color = on ? "#86efac" : "#fca5a5";
    }
    window.__oaUpdateCombatBtn = updateCombatToggleBtn;

    function mount(){
      try {
        if (document.getElementById(COMBAT_BTN_ID)) return;
        const host = document.getElementById("server-time") || document.querySelector("#server-time, .oa-chip#server-time");
        if (!host) return;

        const btn = document.createElement("button");
        btn.id = COMBAT_BTN_ID;
        btn.title = "Toggle Auto Combat (F1)";
        btn.style.cssText = [
          "margin-left:6px",
          "padding:2px 10px",
          "border-radius:10px",
          "font-size:11px",
          "line-height:1.6",
          "border:1px solid rgba(239,68,68,0.4)",
          "background:rgba(239,68,68,0.2)",
          "color:#fca5a5",
          "vertical-align:middle",
          "white-space:nowrap",
          "cursor:pointer",
          "font-weight:600",
          "transition:all 0.15s ease",
        ].join(";");
        btn.textContent = "⚔️ Auto: OFF";

        btn.addEventListener("click", () => {
          if (window.__oaState && window.__oaState.enabled) {
            if (typeof window.__oaDisableScriptAuto === "function") window.__oaDisableScriptAuto("btn");
          } else {
            if (typeof window.__oaEnableScriptAuto === "function") window.__oaEnableScriptAuto("btn");
          }
          setTimeout(updateCombatToggleBtn, 50);
        });
        btn.addEventListener("mouseenter", () => { btn.style.filter = "brightness(1.3)"; });
        btn.addEventListener("mouseleave", () => { btn.style.filter = ""; });

        host.insertAdjacentElement("afterend", btn);

        // Optionally show version badge
        if (!STEALTH_CONFIG.hideVersionBadge) {
          const b = document.createElement("span");
          b.id = BADGE_ID;
          b.textContent = "OA Script 6.9.58";
          b.title = "Userscript is running.";
          b.style.cssText = "margin-left:6px;padding:2px 6px;border-radius:10px;font-size:11px;line-height:1.4;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.15);color:#fff;vertical-align:middle;white-space:nowrap;opacity:0.5;";
          btn.insertAdjacentElement("afterend", b);
        }

        // Sync state once combat system has had time to init
        setTimeout(updateCombatToggleBtn, 500);
        setTimeout(updateCombatToggleBtn, 2000);
      } catch {}
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => { mount(); setTimeout(mount, 600); }, { once:true });
    } else {
      mount(); setTimeout(mount, 600);
    }
  })();

  try { if (window.top && window.top !== window.self) return; } catch {}
  if (location.pathname !== '/game.php') return;
if (!location.hostname.endsWith('olympusawakened.com')) return;

  slog('OA Script', 'Userscript init on', location.href);
  try { window.__OA_SCRIPT_VERSION = '6.9.44'; } catch {}
  // ============================================================================
  // Shared helpers (storage + lifecycle). Refactor: centralized cleanup.
  const OA = window.__OA || (window.__OA = {});
  OA.VERSION = '6.9.16.19';
  OA.LIFECYCLE = window.__OA_LIFECYCLE || (window.__OA_LIFECYCLE = { intervals: new Set(), timeouts: new Set(), cleanups: [] });

  // Navigation guard: prevents rapid-fire tab navigation loops that can trigger OA's single-tab/login redirects.
  OA.NAV = OA.NAV || (function () {
    let lastNavMs = 0;
    function canNav(minGapMs) {
      const now = Date.now();
      const gap = typeof minGapMs === 'number' ? minGapMs : 350;
      if (now - lastNavMs < gap) return false;
      lastNavMs = now;
      return true;
    }
    function replace(url, opts) {
      const o = opts || {};
      const force = !!o.force;
      const gap = typeof o.minGapMs === 'number' ? o.minGapMs : 350;
      if (!force && !canNav(gap)) return false;
      try { location.replace(url); } catch { try { location.href = url; } catch {} }
      return true;
    }
    function href(url, opts) {
      const o = opts || {};
      const force = !!o.force;
      const gap = typeof o.minGapMs === 'number' ? o.minGapMs : 350;
      if (!force && !canNav(gap)) return false;
      try { location.href = url; } catch {}
      return true;
    }
    return { replace, href };
  })();

  OA.setInterval = function (fn, ms) {
    const id = window.setInterval(fn, ms);
    try { OA.LIFECYCLE.intervals.add(id); } catch {}
    return id;
  };

  OA.setTimeout = function (fn, ms) {
    const id = window.setTimeout(fn, ms);
    try { OA.LIFECYCLE.timeouts.add(id); } catch {}
    return id;
  };

  OA.addCleanup = function (fn) {
    try { OA.LIFECYCLE.cleanups.push(fn); } catch {}
  };

  OA.clearAll = function () {
    // Clear any registered timers
    try { for (const id of OA.LIFECYCLE.timeouts) { try { clearTimeout(id); } catch {} } } catch {}
    try { for (const id of OA.LIFECYCLE.intervals) { try { clearInterval(id); } catch {} } } catch {}
    try { OA.LIFECYCLE.timeouts.clear(); OA.LIFECYCLE.intervals.clear(); } catch {}

    // Run cleanups (one-shot)
    try {
      const cleanups = OA.LIFECYCLE.cleanups.splice(0);
      for (const fn of cleanups) { try { fn(); } catch {} }
    } catch {}
  };

  OA.Storage = OA.Storage || {
    get(key, fallback = null) { try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, String(value)); } catch {} },
    getBool(key, fallback = false) {
      const v = this.get(key, null);
      if (v == null || v === '') return fallback;
      if (v === true || v === 'true' || v === '1') return true;
      if (v === false || v === 'false' || v === '0') return false;
      try { return Boolean(JSON.parse(v)); } catch { return fallback; }
    },
    setBool(key, value) { this.set(key, value ? '1' : '0'); },
    getJSON(key, fallback = null) {
      const v = this.get(key, null);
      if (v == null || v === '') return fallback;
      try { return JSON.parse(v); } catch { return fallback; }
    },
    setJSON(key, value) { try { this.set(key, JSON.stringify(value)); } catch {} },
  };

  OA.setTimeout(() => { try { installAudioUnlockHooks(); installSecurityCheckObserver(); } catch {} }, 0);
  // ============================================================================
  // CAPSOLVER INTEGRATION - START
  // ============================================================================
  const CAPSOLVER_KEY = "oa_capsolver_api_key_v1";
  const CAPSOLVER_ENABLED_KEY = "oa_capsolver_enabled_v1";
  const CAPSOLVER_STATS_KEY = "oa_capsolver_stats_v1";

  function loadCapSolverApiKey() {
    try { return localStorage.getItem(CAPSOLVER_KEY) || ""; } catch { return ""; }
  }

  function saveCapSolverApiKey(key) {
    try { localStorage.setItem(CAPSOLVER_KEY, String(key || "")); } catch {}
  }

  function loadCapSolverEnabled() {
    try {
      const raw = localStorage.getItem(CAPSOLVER_ENABLED_KEY);
      if (!raw) return false;
      return Boolean(JSON.parse(raw));
    } catch { return false; }
  }

  function saveCapSolverEnabled(enabled) {
    try { localStorage.setItem(CAPSOLVER_ENABLED_KEY, JSON.stringify(!!enabled)); } catch {}
  }

  function loadCapSolverStats() {
    try {
      const raw = localStorage.getItem(CAPSOLVER_STATS_KEY);
      if (!raw) return {
        solves: 0,           // CapSolver returned a solution
        failures: 0,         // CapSolver failed to solve
        passed: 0,           // Security check passed (modal closed after submit)
        rejected: 0,         // Security check rejected (error shown)
        manual: 0,           // Manually solved (no CapSolver)
        lastSolvedAt: 0,
        lastAttemptAnswer: '',
        history: []          // Last 20 attempts with results
      };
      return JSON.parse(raw);
    } catch { return { solves: 0, failures: 0, passed: 0, rejected: 0, manual: 0, lastSolvedAt: 0, lastAttemptAnswer: '', history: [] }; }
  }

  function saveCapSolverStats(stats) {
    try { localStorage.setItem(CAPSOLVER_STATS_KEY, JSON.stringify(stats)); } catch {}
  }

  // Track the last answer we submitted to detect pass/fail
  let lastSecurityCheckAnswer = '';
  let lastSecurityCheckTime = 0;
  let lastSecurityCheckWasAuto = false;
  let securityCheckWasVisible = false;
  let lastCapSolverAttemptHistory = null;
  let lastSecurityCheckContext = null;
  const capSolverRecoveryStateByModal = new WeakMap();
  const CAPSOLVER_RECOVERY_LIMIT = 1;
  const CAPSOLVER_RECOVERY_COOLDOWN_MS = 15000;
  let capSolverOneShotOverride = null;

  function recordSecurityCheckAttempt(answer, isAuto) {
    lastSecurityCheckAnswer = answer;
    lastSecurityCheckTime = Date.now();
    lastSecurityCheckWasAuto = isAuto;

    const stats = loadCapSolverStats();
    stats.lastAttemptAnswer = answer;
    saveCapSolverStats(stats);
  }

  function classifyBotcheckPromptPattern(modalText) {
    const text = String(modalText || '');
    const lower = text.toLowerCase();
    if (/enter\s+(?:the\s+)?(?:full\s+)?6[- ]?character\s+code/i.test(text) ||
        /enter\s+(?:the\s+)?(?:full\s+)?code\s+shown/i.test(text) ||
        /(?:entire|complete|whole|full)\s+(?:code|captcha)/i.test(text)) return 'full_code';
    if (/(\d)(?:st|nd|rd|th)\s+character/i.test(text)) return 'ordinal_single';
    if (/characters?\s+[\d,\sand]+/i.test(text)) return 'multi_positions';
    if (/(first|second|third|fourth|fifth|sixth)\s+character/i.test(lower)) return 'word_positions';
    if (/character\s*#?\s*\d/i.test(text)) return 'character_number';
    return 'unknown';
  }

  function captureBotcheckContext(modal, optionProfile, preprocessProfile) {
    const modalText = modal?.textContent || modal?.innerText || '';
    const timerEl = modal?.querySelector?.('[data-botcheck-timer], .botcheck-timer, [class*="timer"]');
    return {
      timerVisible: !!timerEl,
      timerText: timerEl?.textContent?.trim?.() || '',
      promptPattern: classifyBotcheckPromptPattern(modalText),
      optionProfile: optionProfile || null,
      preprocessProfile: preprocessProfile || null,
      capturedAt: Date.now()
    };
  }

  function buildRecoveryOverride(context) {
    const prevProfile = String(context?.preprocessProfile || 'auto').toLowerCase();
    const alternateProfile = prevProfile === 'raw' ? 'high_contrast' : 'raw';
    const previousScore = Number(context?.optionProfile?.score);
    const adjustedScore = Number.isFinite(previousScore) ? Math.max(0.75, previousScore - 0.1) : 0.8;
    return {
      profile: alternateProfile,
      optionOverrides: { score: adjustedScore },
      variation: `recovery_${alternateProfile}_score_${String(adjustedScore).replace('.', '_')}`
    };
  }

  async function waitForBotcheckImageRefresh(captchaImg, previousSrc) {
    const started = Date.now();
    while (Date.now() - started < 8000) {
      const srcChanged = captchaImg?.src && captchaImg.src !== previousSrc;
      const loaded = captchaImg?.complete && captchaImg?.naturalWidth > 0 && captchaImg?.naturalHeight > 0;
      if (srcChanged && loaded) return true;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return false;
  }

  async function triggerBotcheckRecoveryOnReject(reason = 'unknown_reject', context = null, wasAuto = false) {
    if (!wasAuto) return;
    const modal = document.getElementById('botcheck-modal');
    if (!modal || !modal.classList.contains('flex')) return;

    const state = capSolverRecoveryStateByModal.get(modal) || { attempts: 0, cooldownUntil: 0 };
    const now = Date.now();
    if (state.attempts >= CAPSOLVER_RECOVERY_LIMIT) {
      console.log('[CapSolver-Recovery] Skip: retry limit reached for modal');
      return;
    }
    if (state.cooldownUntil > now) {
      console.log('[CapSolver-Recovery] Skip: cooldown active for modal');
      return;
    }

    const refreshBtn = modal.querySelector('[data-botcheck-refresh]');
    const captchaImg = modal.querySelector('[data-botcheck-image]');
    if (!refreshBtn || !captchaImg) {
      console.log('[CapSolver-Recovery] Skip: refresh controls unavailable');
      return;
    }

    const previousSrc = captchaImg.src;
    state.attempts += 1;
    state.cooldownUntil = now + CAPSOLVER_RECOVERY_COOLDOWN_MS;
    capSolverRecoveryStateByModal.set(modal, state);

    try {
      refreshBtn.click();
      const refreshed = await waitForBotcheckImageRefresh(captchaImg, previousSrc);
      if (!refreshed) {
        console.log('[CapSolver-Recovery] Refresh timeout waiting for new image');
        return;
      }

      const override = buildRecoveryOverride(context);
      capSolverOneShotOverride = override;
      capSolverLastAttempt = 0;
      console.log('[CapSolver-Recovery] Retrying with override:', override, 'reason:', reason);
      await autoSolveWithCapSolver();
    } catch (e) {
      console.log('[CapSolver-Recovery] Recovery failed:', e);
    }
  }

  function recordSecurityCheckResult(passed, rejectionReason = null) {
    // Prevent double-recording (both fetch interceptor and MutationObserver may fire)
    if (lastSecurityCheckTime === 0) return;

    const attemptContextSnapshot = lastSecurityCheckContext ? { ...lastSecurityCheckContext } : null;
    const wasAutoAttempt = !!lastSecurityCheckWasAuto;

    const stats = loadCapSolverStats();
    const timeTaken = Date.now() - lastSecurityCheckTime;

    if (passed) {
      stats.passed = (stats.passed || 0) + 1;
      console.log('[SecurityCheck] PASSED! Answer:', lastSecurityCheckAnswer, 'Auto:', lastSecurityCheckWasAuto, 'Time:', timeTaken, 'ms');

      // Trigger resume check MULTIPLE times with different delays for reliability
      console.log('[SecurityCheck] Scheduling resume triggers...');

      // Immediate trigger (100ms)
      setTimeout(() => {
        console.log('[SecurityCheck] Immediate resume trigger (100ms)');
        try {
          if (typeof window.__autoCombat?.resumeAutoCombatIfNeeded === 'function') {
            window.__autoCombat.resumeAutoCombatIfNeeded();
          } else {
            console.warn('[SecurityCheck] resumeAutoCombatIfNeeded not available yet');
          }
        } catch (e) {
          console.warn('[SecurityCheck] Resume trigger error (100ms):', e);
        }
      }, 100);

      // Backup trigger (500ms)
      setTimeout(() => {
        console.log('[SecurityCheck] Backup resume trigger (500ms)');
        try {
          if (typeof window.__autoCombat?.resumeAutoCombatIfNeeded === 'function') {
            window.__autoCombat.resumeAutoCombatIfNeeded();
          }
        } catch (e) {
          console.warn('[SecurityCheck] Resume trigger error (500ms):', e);
        }
      }, 500);

      // Final fallback trigger (1500ms)
      setTimeout(() => {
        console.log('[SecurityCheck] Final resume trigger (1500ms)');
        try {
          if (typeof window.__autoCombat?.resumeAutoCombatIfNeeded === 'function') {
            window.__autoCombat.resumeAutoCombatIfNeeded();
          }
        } catch (e) {
          console.warn('[SecurityCheck] Resume trigger error (1500ms):', e);
        }
      }, 1500);
    } else {
      stats.rejected = (stats.rejected || 0) + 1;
      console.log('[SecurityCheck] REJECTED! Answer:', lastSecurityCheckAnswer, 'Auto:', lastSecurityCheckWasAuto);

      // Save failed attempt with image for human review (Claude solver only)
      if (lastSecurityCheckWasAuto && lastSCImageBase64) {
        try {
          saveFailedSCAttempt(lastSCImageBase64, lastSCImageRawBase64, lastSCModalText, lastSecurityCheckAnswer, lastSCFullSolution, lastSCPositions);
        } catch (e) {
          console.warn('[ClaudeSC] Failed to save SC image:', e.message);
        }
      }
    }

    // Track history (keep last 20)
    if (!stats.history) stats.history = [];
    stats.history.unshift({
      answer: lastSecurityCheckAnswer,
      passed: passed,
      auto: lastSecurityCheckWasAuto,
      time: timeTaken,
      capSolverAttempts: Array.isArray(lastCapSolverAttemptHistory) ? lastCapSolverAttemptHistory : undefined,
      capSolverAttemptCount: Array.isArray(lastCapSolverAttemptHistory) ? lastCapSolverAttemptHistory.length : undefined,
      rejectionReason: passed ? undefined : (rejectionReason || 'unknown_reject'),
      rejectionContext: attemptContextSnapshot || undefined,
      at: Date.now()
    });
    if (stats.history.length > 20) stats.history.length = 20;

    saveCapSolverStats(stats);

    if (!passed && wasAutoAttempt) {
      triggerBotcheckRecoveryOnReject(rejectionReason || 'unknown_reject', attemptContextSnapshot, wasAutoAttempt);
    }

    // Reset ALL tracking
    lastSecurityCheckAnswer = '';
    lastSecurityCheckTime = 0;
    lastSCImageBase64 = '';
    lastSCImageRawBase64 = '';
    lastSCModalText = '';
    lastSCFullSolution = '';
    lastSCPositions = null;
    lastCapSolverAttemptHistory = null;
    lastSecurityCheckContext = null;
  }

  function recordManualSecurityCheck() {
    const stats = loadCapSolverStats();
    stats.manual = (stats.manual || 0) + 1;
    saveCapSolverStats(stats);
    console.log('[SecurityCheck] Manually solved');
  }

  // Monitor for security check pass/fail
  function startSecurityCheckResultMonitor() {
    const modal = document.getElementById('botcheck-modal');
    if (!modal) return;

    const errorEl = modal.querySelector('[data-botcheck-error]');

    // Watch for error element becoming visible (rejection)
    if (errorEl) {
      const errorObserver = new MutationObserver(() => {
        const errorText = errorEl.textContent?.trim() || '';
        const isVisible = !errorEl.classList.contains('hidden') && errorText.length > 0;

        if (isVisible && lastSecurityCheckTime > 0) {
          // Error appeared - solution was rejected
          recordSecurityCheckResult(false, 'modal_error_visible');
        }
      });

      errorObserver.observe(errorEl, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true
      });
    }

    // Watch for modal closing (success)
    const modalObserver = new MutationObserver(() => {
      const wasVisible = securityCheckWasVisible;
      const isVisible = modal.classList.contains('flex');

      if (wasVisible && !isVisible && lastSecurityCheckTime > 0) {
        // Modal closed after we submitted - solution was accepted
        recordSecurityCheckResult(true, null);
      } else if (wasVisible && !isVisible && lastSecurityCheckTime === 0) {
        // Modal closed but we didn't track an auto attempt - manual solve
        recordManualSecurityCheck();
      }

      if (!isVisible) {
        capSolverRecoveryStateByModal.delete(modal);
      }

      securityCheckWasVisible = isVisible;
    });

    modalObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });
    securityCheckWasVisible = modal.classList.contains('flex');
  }

  // Show stats in console
  _w.securityCheckStats = function() {
    const stats = loadCapSolverStats();
    const passRate = stats.passed > 0 ? ((stats.passed / (stats.passed + stats.rejected)) * 100).toFixed(1) : 0;

    console.log('=== Security Check Stats ===');
    console.log('CapSolver attempts:', stats.solves);
    console.log('CapSolver failures:', stats.failures);
    console.log('Passed:', stats.passed);
    console.log('Rejected:', stats.rejected);
    console.log('Manual solves:', stats.manual);
    console.log('Pass rate:', passRate + '%');
    console.log('Last 5 attempts:');
    (stats.history || []).slice(0, 5).forEach((h, i) => {
      console.log(`  ${i + 1}. "${h.answer}" - ${h.passed ? 'PASS' : 'FAIL'} (${h.auto ? 'auto' : 'manual'}) ${h.time}ms`);
    });

    return stats;
  };

  // Reset stats
  _w.securityCheckStatsReset = function() {
    saveCapSolverStats({ solves: 0, failures: 0, passed: 0, rejected: 0, manual: 0, lastSolvedAt: 0, lastAttemptAnswer: '', history: [] });
    console.log('[SecurityCheck] Stats reset');
  };

  // Show learning insights - what patterns Claude is learning from
  _w.securityCheckLearning = function() {
    const stats = loadCapSolverStats();
    const history = stats.history || [];

    const recentSuccesses = history.filter(h => h.passed).slice(0, 20);
    const recentFailures = history.filter(h => !h.passed).slice(0, 20);

    console.log('=== Security Check Learning Insights ===');
    console.log(`Total history: ${history.length} attempts`);
    console.log(`Recent successes: ${recentSuccesses.length}`);
    console.log(`Recent failures: ${recentFailures.length}`);

    // Analyze character frequency in successes vs failures
    const successChars = {};
    const failureChars = {};

    recentSuccesses.forEach(h => {
      const answer = (h.answer || '').toUpperCase();
      for (const c of answer) {
        successChars[c] = (successChars[c] || 0) + 1;
      }
    });

    recentFailures.forEach(h => {
      const answer = (h.answer || '').toUpperCase();
      for (const c of answer) {
        failureChars[c] = (failureChars[c] || 0) + 1;
      }
    });

    // Find characters that appear more in failures (potential misreads)
    const suspiciousChars = [];
    for (const [char, failCount] of Object.entries(failureChars)) {
      const successCount = successChars[char] || 0;
      const failRatio = failCount / (failCount + successCount);
      if (failRatio > 0.6 && failCount >= 2) {
        suspiciousChars.push({ char, failCount, successCount, failRatio });
      }
    }

    if (suspiciousChars.length > 0) {
      console.log('\n⚠️ SUSPICIOUS CHARACTERS (appear more often in failures):');
      suspiciousChars.sort((a, b) => b.failRatio - a.failRatio).forEach(s => {
        console.log(`  "${s.char}": ${(s.failRatio * 100).toFixed(0)}% fail rate (${s.failCount} fails, ${s.successCount} passes)`);
      });
    }

    // Show recent failures for manual review
    if (recentFailures.length > 0) {
      console.log('\n❌ RECENT FAILURES (review these):');
      recentFailures.slice(0, 10).forEach((h, i) => {
        const timeAgo = Math.round((Date.now() - h.at) / 60000);
        console.log(`  ${i + 1}. "${h.answer}" - ${timeAgo}m ago`);
      });
    }

    // Show recent successes for comparison
    if (recentSuccesses.length > 0) {
      console.log('\n✅ RECENT SUCCESSES (these worked):');
      recentSuccesses.slice(0, 10).forEach((h, i) => {
        const timeAgo = Math.round((Date.now() - h.at) / 60000);
        console.log(`  ${i + 1}. "${h.answer}" - ${timeAgo}m ago`);
      });
    }

    // Calculate rolling accuracy
    const last10 = history.slice(0, 10);
    const last10Passed = last10.filter(h => h.passed).length;
    console.log(`\n📊 Rolling accuracy (last 10): ${last10Passed}/10 = ${(last10Passed * 10)}%`);

    // Show human corrections
    const corrections = loadSCCorrections();
    if (corrections.length > 0) {
      console.log(`\n👨‍🏫 HUMAN CORRECTIONS (${corrections.length} stored):`);
      corrections.slice(0, 10).forEach((c, i) => {
        let diff = '';
        for (let j = 0; j < 6; j++) {
          if (c.claudeAnswer[j] !== c.correctAnswer[j]) diff += ` ${c.claudeAnswer[j]}→${c.correctAnswer[j]}`;
        }
        console.log(`  ${i + 1}. "${c.claudeAnswer}" → "${c.correctAnswer}" (${diff.trim()})`);
      });
    }

    const failedImages = loadFailedSCImages();
    const uncorrected = failedImages.filter(f => !f.corrected).length;
    if (uncorrected > 0) {
      console.log(`\n⏳ ${uncorrected} failed attempts awaiting review. Use reviewFailedSC() or reviewFailedSCVisual()`);
    }

    return { stats, suspiciousChars, recentSuccesses, recentFailures, corrections };
  };

  // ===== FAILED SC IMAGE STORE (for human review & correction) =====
  const SC_FAILED_IMAGES_KEY = 'oa_sc_failed_images_v1';
  const SC_CORRECTIONS_KEY = 'oa_sc_corrections_v1';
  const MAX_FAILED_IMAGES = 15;

  // Temp vars: set when Claude submits, consumed when result detected
  let lastSCImageBase64 = '';
  let lastSCImageRawBase64 = '';
  let lastSCModalText = '';
  let lastSCFullSolution = '';
  let lastSCPositions = null;

  // ── SC Failure Notification Interceptor ──
  // Monkey-patch gameNotifications.show to detect "security check failed" messages
  // This catches BOTH timer expiry AND wrong answer notifications reliably.
  let scNotificationFailDetected = false;
  let scNotificationFailText = '';
  (function installSCNotificationInterceptor() {
    function tryPatch() {
      if (!window.gameNotifications || typeof window.gameNotifications.show !== 'function') return false;
      const origShow = window.gameNotifications.show;
      window.gameNotifications.show = function(message) {
        const lower = (message || '').toLowerCase();
        if (lower.includes('security check fail') || lower.includes('botcheck fail') ||
            lower.includes('check failed') || lower.includes('been logged out')) {
          scNotificationFailDetected = true;
          scNotificationFailText = message;
          console.log('[ClaudeSC-Notify] ❌ Failure notification intercepted:', message);
        }
        return origShow.call(this, message);
      };
      console.log('[ClaudeSC] Notification interceptor installed for SC failure detection');
      return true;
    }
    // Try immediately, then retry every 500ms until game loads
    if (!tryPatch()) {
      const retryInterval = setInterval(() => {
        if (tryPatch()) clearInterval(retryInterval);
      }, 500);
      // Give up after 30s
      setTimeout(() => clearInterval(retryInterval), 30000);
    }
  })();

  function loadFailedSCImages() {
    try { return JSON.parse(localStorage.getItem(SC_FAILED_IMAGES_KEY) || '[]'); }
    catch { return []; }
  }
  function saveFailedSCImages(arr) {
    try { localStorage.setItem(SC_FAILED_IMAGES_KEY, JSON.stringify(arr)); } catch (e) {
      while (arr.length > 3) { arr.pop(); try { localStorage.setItem(SC_FAILED_IMAGES_KEY, JSON.stringify(arr)); return; } catch {} }
      console.warn('[ClaudeSC] Could not save failed images — localStorage full');
    }
  }
  function loadSCCorrections() {
    try { return JSON.parse(localStorage.getItem(SC_CORRECTIONS_KEY) || '[]'); }
    catch { return []; }
  }
  function saveSCCorrections(arr) {
    try { localStorage.setItem(SC_CORRECTIONS_KEY, JSON.stringify(arr)); } catch {}
  }

  function saveFailedSCAttempt(imageBase64, rawImageBase64, modalText, claudeAnswer, fullSolution, positions) {
    const failures = loadFailedSCImages();
    failures.unshift({
      image: imageBase64,       // processed
      imageRaw: rawImageBase64, // raw
      question: modalText,
      claudeAnswer: claudeAnswer,
      fullSolution: fullSolution,
      positions: positions,
      at: Date.now(),
      corrected: false,
      correctAnswer: null
    });
    if (failures.length > MAX_FAILED_IMAGES) failures.length = MAX_FAILED_IMAGES;
    saveFailedSCImages(failures);
    console.log(`[ClaudeSC] 💾 Failed attempt saved for review (${failures.length} stored). Use reviewFailedSC() or reviewFailedSCVisual()`);
    try {
      if (window.gameNotifications && typeof window.gameNotifications.show === 'function') {
        window.gameNotifications.show('📸 SC failure saved for review (' + failures.length + ' stored)');
      }
    } catch {}
  }

  // ── Console API: Review failed attempts ──
  _w.reviewFailedSC = function(index) {
    const failures = loadFailedSCImages();
    if (failures.length === 0) {
      console.log('[ClaudeSC] No failed attempts stored. 🎉');
      return;
    }

    if (typeof index === 'number') {
      const f = failures[index];
      if (!f) { console.log(`[ClaudeSC] Invalid index. Range: 0-${failures.length - 1}`); return; }
      const timeAgo = Math.round((Date.now() - f.at) / 60000);
      console.log(`\n=== Failed SC #${index} (${timeAgo}m ago) ===`);
      console.log('Question:', f.question?.substring(0, 200));
      console.log('Claude full solution:', f.fullSolution);
      console.log('Positions extracted:', f.positions || 'none (full code)');
      console.log('Submitted answer:', f.claudeAnswer);
      console.log('Corrected:', f.corrected ? `✅ "${f.correctAnswer}"` : '❌ Not yet');
      if (f.image) {
        const imgUrl = f.image.startsWith('data:') ? f.image : `data:image/png;base64,${f.image}`;
        console.log(`%c `, `font-size:1px; padding:75px 200px; background:url(${imgUrl}) no-repeat center/contain;`);
      }
      console.log(`\nTo correct: correctSC(${index}, 'ABCDEF')`);
      return f;
    }

    console.log(`\n=== Failed SC Attempts (${failures.length} stored) ===`);
    console.log('Use reviewFailedSC(N) to see details for entry N');
    console.log('Use correctSC(N, "ANSWER") to provide correct 6-char answer');
    console.log('Use reviewFailedSCVisual() for visual review overlay\n');
    failures.forEach((f, i) => {
      const timeAgo = Math.round((Date.now() - f.at) / 60000);
      const hrs = Math.floor(timeAgo / 60); const mins = timeAgo % 60;
      const timeStr = hrs > 0 ? `${hrs}h ${mins}m ago` : `${mins}m ago`;
      const status = f.corrected ? `✅ corrected → "${f.correctAnswer}"` : '⏳ needs review';
      console.log(`  ${i}. [${timeStr}] Claude: "${f.claudeAnswer}" (full: "${f.fullSolution}") — ${status}`);
    });
    return failures;
  };

  // ── Console API: Provide correct answer ──
  _w.correctSC = function(index, correctAnswer) {
    if (typeof index !== 'number' || typeof correctAnswer !== 'string') {
      console.log('Usage: correctSC(index, "CORRECT6CHARS")');
      return;
    }
    correctAnswer = correctAnswer.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (correctAnswer.length !== 6) {
      console.log('[ClaudeSC] ⚠️ Answer must be exactly 6 alphanumeric characters. Got:', correctAnswer);
      return;
    }

    const failures = loadFailedSCImages();
    if (!failures[index]) { console.log(`[ClaudeSC] Invalid index. Range: 0-${failures.length - 1}`); return; }

    const wrong = failures[index].fullSolution;

    failures[index].corrected = true;
    failures[index].correctAnswer = correctAnswer;
    failures[index].analysisStatus = 'pending'; // will be updated async
    saveFailedSCImages(failures);

    const corrections = loadSCCorrections();
    corrections.unshift({
      claudeAnswer: wrong,
      correctAnswer: correctAnswer,
      positions: failures[index].positions,
      at: failures[index].at,
      correctedAt: Date.now(),
      analysis: null // will be filled async
    });
    if (corrections.length > 30) corrections.length = 30;
    saveSCCorrections(corrections);

    console.log(`[ClaudeSC] ✅ Correction saved! Claude said "${wrong}" → correct is "${correctAnswer}"`);
    let diff = '  ';
    for (let i = 0; i < 6; i++) {
      if (wrong[i] !== correctAnswer[i]) diff += `pos${i + 1}: ${wrong[i]}→${correctAnswer[i]}  `;
    }
    if (diff.trim()) console.log(`[ClaudeSC] Character corrections: ${diff}`);

    // Fire-and-forget: send to Claude for deep analysis
    const imageBase64 = failures[index].image;
    if (imageBase64) {
      console.log('[ClaudeSC] 🧠 Sending to Claude for misread analysis...');
      analyzeSCMisread(imageBase64, wrong, correctAnswer, index).then(analysis => {
        if (analysis) {
          console.log('[ClaudeSC] 🧠 Analysis complete:', analysis);
          try { window.gameNotifications?.show?.('🧠 SC analysis complete'); } catch {}
        }
      }).catch(e => {
        console.warn('[ClaudeSC] Analysis failed:', e.message);
      });
    }

    return { wrong, correct: correctAnswer };
  };

  // ── Claude Misread Analysis ──
  // Sends the image + wrong/correct answers to Claude for deep analysis
  // Stores the analysis in both failed images and corrections for future learning
  async function analyzeSCMisread(imageBase64, wrongAnswer, correctAnswer, failureIndex) {
    const key = localStorage.getItem('oa_ai_api_key_v1');
    if (!key) {
      console.log('[ClaudeSC] No API key — skipping analysis');
      return null;
    }

    // Build the diff for the prompt
    let charDiffs = [];
    for (let i = 0; i < 6; i++) {
      if (wrongAnswer[i] !== correctAnswer[i]) {
        charDiffs.push(`Position ${i + 1}: you said "${wrongAnswer[i]}" but correct is "${correctAnswer[i]}"`);
      }
    }

    // Get both images from the failure entry
    const failures = loadFailedSCImages();
    const entry = failures[failureIndex];
    const processedImg = entry?.image || imageBase64;
    const rawImg = entry?.imageRaw || '';

    // Build image content — send both when available
    const imageContent = [];
    if (rawImg) {
      const rawData = rawImg.startsWith('data:') ? rawImg.split(',')[1] : rawImg;
      imageContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: rawData } });
    }
    if (processedImg) {
      const procData = processedImg.startsWith('data:') ? processedImg.split(',')[1] : processedImg;
      imageContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: procData } });
    }
    if (imageContent.length === 0) return null;

    const hasBoth = imageContent.length === 2;
    const imageDesc = hasBoth
      ? 'You are given two versions of the same CAPTCHA: Image 1 is the RAW original, Image 2 is PREPROCESSED (noise removed, contrast enhanced). Examine both.'
      : 'You are given a CAPTCHA image.';

    try {
      const res = await gmFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: [
              ...imageContent,
              { type: 'text', text: `${imageDesc}

You previously read this CAPTCHA and answered "${wrongAnswer}" but the correct answer was "${correctAnswer}".

The specific errors were:
${charDiffs.join('\n')}

Look at the image(s) carefully and explain in 2-3 concise sentences:
1. What visual feature in each misread character caused the confusion?
2. What specific visual cue distinguishes the correct character from what you read?

Be concrete about the visual features (e.g. "the curve at top-right", "the gap in the bottom", "the diagonal stroke"). This will help you avoid the same mistake next time.

Respond with ONLY the analysis, no preamble.` }
            ]
          }]
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const analysis = (data.content?.[0]?.text || '').trim();

      if (!analysis) return null;

      // Store analysis in the failed image entry
      try {
        const failures = loadFailedSCImages();
        if (failures[failureIndex]) {
          failures[failureIndex].analysis = analysis;
          failures[failureIndex].analysisStatus = 'done';
          saveFailedSCImages(failures);
        }
      } catch {}

      // Store analysis in the corrections list (most recent correction = index 0)
      try {
        const corrections = loadSCCorrections();
        // Find the matching correction (most recently added, same wrong+correct pair)
        const match = corrections.find(c => c.claudeAnswer === wrongAnswer && c.correctAnswer === correctAnswer && !c.analysis);
        if (match) {
          match.analysis = analysis;
          saveSCCorrections(corrections);
        }
      } catch {}

      return analysis;

    } catch (e) {
      // Mark as failed so UI doesn't show spinner forever
      try {
        const failures = loadFailedSCImages();
        if (failures[failureIndex]) {
          failures[failureIndex].analysisStatus = 'failed';
          saveFailedSCImages(failures);
        }
      } catch {}
      throw e;
    }
  }

  // ── Console API: Visual review popup ──
  _w.reviewFailedSCVisual = function() {
    const failures = loadFailedSCImages();
    if (failures.length === 0) {
      console.log('[ClaudeSC] No failed attempts to review.');
      try { window.gameNotifications?.show?.('No failed SC attempts stored yet.'); } catch {}
      return;
    }

    let overlay = document.getElementById('sc-review-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'sc-review-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:monospace;';

    let currentIdx = 0;
    let analysisRefreshTimer = null;

    function render() {
      // Reload data each render to catch async analysis updates
      const currentFailures = loadFailedSCImages();
      const f = currentFailures[currentIdx] || failures[currentIdx];
      const timeAgo = Math.round((Date.now() - f.at) / 60000);
      const hrs = Math.floor(timeAgo / 60); const mins = timeAgo % 60;
      const timeStr = hrs > 0 ? `${hrs}h ${mins}m ago` : `${mins}m ago`;
      const imgSrc = f.image ? (f.image.startsWith('data:') ? f.image : `data:image/png;base64,${f.image}`) : '';
      const rawImgSrc = f.imageRaw ? (f.imageRaw.startsWith('data:') ? f.imageRaw : `data:image/png;base64,${f.imageRaw}`) : '';

      // Analysis section
      let analysisHtml = '';
      if (f.analysis) {
        analysisHtml = `<div style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.3);border-radius:4px;padding:6px 8px;margin-bottom:10px;font-size:10px;color:#c4b5fd;max-height:80px;overflow-y:auto;">
          <div style="font-size:9px;color:#8b5cf6;margin-bottom:2px;">🧠 Claude's self-analysis:</div>
          ${f.analysis}
        </div>`;
      } else if (f.analysisStatus === 'pending') {
        analysisHtml = `<div style="background:rgba(234,179,8,0.1);border:1px solid rgba(234,179,8,0.3);border-radius:4px;padding:6px 8px;margin-bottom:10px;font-size:10px;color:#fbbf24;">
          ⏳ Claude is analyzing the misread...
        </div>`;
      } else if (f.analysisStatus === 'failed') {
        analysisHtml = `<div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:4px;padding:4px 8px;margin-bottom:10px;font-size:10px;color:#f87171;">
          ⚠️ Analysis failed (API error)
        </div>`;
      }

      overlay.innerHTML = `
        <div style="background:#1a1a2e;border:2px solid #d4af37;border-radius:8px;padding:20px;max-width:500px;width:90%;color:#e0e0e0;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <span style="color:#d4af37;font-size:14px;font-weight:bold;">🔍 Failed SC Review (${currentIdx + 1}/${currentFailures.length})</span>
            <span style="color:#888;font-size:11px;">${timeStr}</span>
          </div>
          ${imgSrc ? `<div style="display:flex;gap:6px;margin-bottom:10px;">
            <div style="flex:1;text-align:center;">
              <div style="font-size:9px;color:#888;margin-bottom:2px;">Processed</div>
              <img src="${imgSrc}" style="width:100%;max-height:100px;object-fit:contain;border:1px solid #333;border-radius:4px;background:#000;">
            </div>
            ${rawImgSrc ? `<div style="flex:1;text-align:center;">
              <div style="font-size:9px;color:#888;margin-bottom:2px;">Raw</div>
              <img src="${rawImgSrc}" style="width:100%;max-height:100px;object-fit:contain;border:1px solid #333;border-radius:4px;background:#000;">
            </div>` : ''}
          </div>` : '<div style="color:#f66;margin-bottom:10px;">No image saved</div>'}
          <div style="font-size:11px;color:#aaa;margin-bottom:6px;max-height:40px;overflow:hidden;">Question: ${(f.question || 'No question text').substring(0, 150)}</div>
          <div style="display:flex;gap:10px;margin-bottom:10px;">
            <div style="flex:1;background:#2a1a1a;padding:6px 8px;border-radius:4px;">
              <div style="font-size:9px;color:#f66;">Claude answered:</div>
              <div style="font-size:16px;color:#ff8888;letter-spacing:3px;">${f.fullSolution || f.claudeAnswer}</div>
              ${f.positions ? `<div style="font-size:9px;color:#888;">Positions ${f.positions.join(',')} → "${f.claudeAnswer}"</div>` : ''}
            </div>
            <div style="flex:1;background:#1a2a1a;padding:6px 8px;border-radius:4px;">
              <div style="font-size:9px;color:#4ade80;">${f.corrected ? 'Correct answer:' : 'Your correction:'}</div>
              ${f.corrected
                ? `<div style="font-size:16px;color:#4ade80;letter-spacing:3px;">${f.correctAnswer}</div>`
                : `<input id="sc-review-input" type="text" maxlength="6" placeholder="ABC123"
                    style="background:#111;border:1px solid #4ade80;color:#4ade80;font-size:16px;letter-spacing:3px;width:100%;padding:3px 6px;border-radius:3px;font-family:monospace;text-transform:uppercase;">`
              }
            </div>
          </div>
          ${analysisHtml}
          <div style="display:flex;gap:6px;justify-content:space-between;">
            <div style="display:flex;gap:6px;">
              <button id="sc-review-prev" style="background:#333;border:1px solid #555;color:#ccc;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px;" ${currentIdx === 0 ? 'disabled style="opacity:0.4;cursor:default;background:#333;border:1px solid #555;color:#ccc;padding:4px 12px;border-radius:4px;font-size:12px;"' : ''}>◄ Prev</button>
              <button id="sc-review-next" style="background:#333;border:1px solid #555;color:#ccc;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px;" ${currentIdx >= currentFailures.length - 1 ? 'disabled style="opacity:0.4;cursor:default;background:#333;border:1px solid #555;color:#ccc;padding:4px 12px;border-radius:4px;font-size:12px;"' : ''}>Next ►</button>
            </div>
            <div style="display:flex;gap:6px;">
              ${!f.corrected ? '<button id="sc-review-save" style="background:rgba(74,222,128,0.2);border:1px solid #4ade80;color:#4ade80;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px;">✓ Save & Analyze</button>' : ''}
              <button id="sc-review-close" style="background:rgba(212,175,55,0.2);border:1px solid #d4af37;color:#d4af37;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px;">Close</button>
            </div>
          </div>
        </div>`;

      // Clear any existing refresh timer
      if (analysisRefreshTimer) { clearInterval(analysisRefreshTimer); analysisRefreshTimer = null; }

      // Auto-refresh while analysis is pending
      if (f.analysisStatus === 'pending') {
        analysisRefreshTimer = setInterval(() => {
          const updated = loadFailedSCImages();
          if (updated[currentIdx] && updated[currentIdx].analysisStatus !== 'pending') {
            render(); // re-render with updated data
          }
        }, 2000);
      }

      overlay.querySelector('#sc-review-close')?.addEventListener('click', () => {
        if (analysisRefreshTimer) clearInterval(analysisRefreshTimer);
        overlay.remove();
      });
      overlay.querySelector('#sc-review-prev')?.addEventListener('click', () => { if (currentIdx > 0) { currentIdx--; render(); } });
      overlay.querySelector('#sc-review-next')?.addEventListener('click', () => { if (currentIdx < currentFailures.length - 1) { currentIdx++; render(); } });
      overlay.querySelector('#sc-review-save')?.addEventListener('click', () => {
        const input = overlay.querySelector('#sc-review-input');
        if (!input) return;
        const val = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (val.length !== 6) { input.style.borderColor = '#f66'; return; }
        _w.correctSC(currentIdx, val);
        render(); // immediate re-render shows 'pending' analysis state
      });
      overlay.querySelector('#sc-review-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') overlay.querySelector('#sc-review-save')?.click();
      });
    }

    render();
    document.body.appendChild(overlay);
    console.log('[ClaudeSC] Visual review opened.');
  };

  _w.clearFailedSC = function() {
    localStorage.removeItem(SC_FAILED_IMAGES_KEY);
    console.log('[ClaudeSC] Failed SC images cleared.');
  };

  _w.clearSCCorrections = function() {
    localStorage.removeItem(SC_CORRECTIONS_KEY);
    console.log('[ClaudeSC] SC corrections cleared.');
  };

  _w.securityCheckCorrections = function() {
    const corrections = loadSCCorrections();
    const failedImages = loadFailedSCImages();
    const uncorrected = failedImages.filter(f => !f.corrected).length;
    console.log(`=== SC Corrections (${corrections.length} total) ===`);
    corrections.slice(0, 15).forEach((c, i) => {
      let diff = '';
      for (let j = 0; j < 6; j++) {
        if (c.claudeAnswer[j] !== c.correctAnswer[j]) diff += ` ${c.claudeAnswer[j]}→${c.correctAnswer[j]}`;
      }
      console.log(`  ${i + 1}. "${c.claudeAnswer}" → "${c.correctAnswer}" (${diff.trim()})`);
    });
    if (uncorrected > 0) console.log(`\n⏳ ${uncorrected} failed attempts awaiting review.`);
    return { corrections, pending: uncorrected };
  };

  // ===== FETCH INTERCEPTOR for reliable botcheck pass/fail detection =====
  // The MutationObserver approach misses some failures. Intercepting the actual
  // server response is much more reliable.
  (function installBotcheckFetchInterceptor() {
    const origFetch = window.fetch;
    window.fetch = async function(...args) {
      const response = await origFetch.apply(this, args);

      // Only intercept POSTs to combat_api.php
      try {
        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
        if (!url.includes('combat_api.php')) return response;

        // Check if this was a botcheck submission
        const opts = args[1] || {};
        const body = opts.body;
        if (!body || !(body instanceof FormData)) return response;

        let action = '';
        try { action = body.get('action') || ''; } catch { return response; }
        if (action !== 'botcheck') return response;

        // Clone and read the response to check result
        const clone = response.clone();
        clone.json().then(data => {
          if (!data) return;

          if (data.error === 'botcheck_failed') {
            console.log('[ClaudeSC-Intercept] ❌ Server confirmed FAILURE');
            // If we have a pending auto-solve, record the failure with image
            if (lastSecurityCheckWasAuto && lastSecurityCheckTime > 0) {
              recordSecurityCheckResult(false, 'server_botcheck_failed');
            }
          } else if (data.botcheck_passed) {
            console.log('[ClaudeSC-Intercept] ✅ Server confirmed PASS');
            if (lastSecurityCheckTime > 0) {
              recordSecurityCheckResult(true, null);
            }
          } else if (data.error === 'botcheck_logout') {
            console.log('[ClaudeSC-Intercept] 🚨 Botcheck logout!');
            if (lastSecurityCheckTime > 0) {
              recordSecurityCheckResult(false, 'server_botcheck_logout');
            }
          }
        }).catch(() => {});
      } catch {}

      return response;
    };
    console.log('[ClaudeSC] Fetch interceptor installed for reliable SC pass/fail detection');
  })();

  function gmFetch(url, options) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: options.method || 'GET',
        url: url,
        headers: options.headers || {},
        data: options.body,
        onload: (response) => {
          resolve({
            ok: response.status >= 200 && response.status < 300,
            status: response.status,
            json: async () => JSON.parse(response.responseText)
          });
        },
        onerror: () => reject(new Error('GM_xmlhttpRequest failed')),
        ontimeout: () => reject(new Error('Request timeout'))
      });
    });
  }

  class CapSolverClient {
    constructor() {
      this.apiUrl = 'https://api.capsolver.com';
      this.timeout = 120000;
    }

    getApiKey() {
      return loadCapSolverApiKey();
    }

    async createTask(taskData) {
      const apiKey = this.getApiKey();
      if (!apiKey) throw new Error('CapSolver API key not configured');

      const response = await gmFetch(`${this.apiUrl}/createTask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientKey: apiKey,
          task: taskData
        })
      });

      const data = await response.json();
      console.log('[CapSolver] createTask response:', data);

      if (data.errorId && data.errorId !== 0) {
        throw new Error(data.errorDescription || 'CapSolver API error');
      }

      // FIXED: Check if solution is already in the response (ImageToText tasks solve instantly)
      if (data.status === 'ready' && data.solution) {
        console.log('[CapSolver] Solution returned immediately in createTask!');
        return { taskId: data.taskId, solution: data.solution, immediate: true };
      }

      return { taskId: data.taskId, immediate: false };
    }

    async getTaskResult(taskId) {
      const apiKey = this.getApiKey();
      const startTime = Date.now();

      while (Date.now() - startTime < this.timeout) {
        const response = await gmFetch(`${this.apiUrl}/getTaskResult`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientKey: apiKey,
            taskId: taskId
          })
        });

        const data = await response.json();
        console.log('[CapSolver] getTaskResult response:', data);

        if (data.status === 'ready') {
          return data.solution;
        }

        if (data.errorId && data.errorId !== 0) {
          throw new Error(data.errorDescription || 'CapSolver task error');
        }

        await new Promise(r => setTimeout(r, 1000));
      }

      throw new Error('CapSolver timeout - no solution received');
    }

    async solveImageToText(imageBase64, options = {}) {
      let taskData;

      // The 'number' module requires 'images' array instead of 'body'
      if (options.module === 'number') {
        taskData = {
          type: 'ImageToTextTask',
          images: [imageBase64],
          ...options
        };
      } else {
        taskData = {
          type: 'ImageToTextTask',
          body: imageBase64,
          ...options
        };
      }

      console.log('[CapSolver] Creating ImageToTextTask...');
      const result = await this.createTask(taskData);
      console.log('[CapSolver] Task created:', result.taskId);

      // FIXED: If solution was returned immediately, use it directly
      if (result.immediate && result.solution) {
        console.log('[CapSolver] Using immediate solution:', result.solution);
        // 'number' module returns answers array, others return text
        if (options.module === 'number' && result.solution.answers) {
          return result.solution.answers[0] || '';
        }
        return result.solution.text || '';
      }

      // Otherwise poll for result (shouldn't happen for ImageToText but just in case)
      const solution = await this.getTaskResult(result.taskId);
      console.log('[CapSolver] Solution received:', solution);

      if (options.module === 'number' && solution.answers) {
        return solution.answers[0] || '';
      }
      return solution.text || '';
    }
  }

  let capSolverInProgress = false;
  let capSolverLastAttempt = 0;
  const CAPSOLVER_MIN_INTERVAL = 10000;

  const CAPSOLVER_PREPROCESS_MODE_KEY = 'oa_capsolver_preprocess_mode_v1';

  function computeCaptchaImageStats(pixelData) {
    const data = pixelData.data;
    const totalPixels = data.length / 4;

    if (!totalPixels) {
      return {
        meanLuminance: 0,
        brightPixelRatio: 0,
        dominantColor: 'none',
        colorDominance: 0,
        avgR: 0,
        avgG: 0,
        avgB: 0
      };
    }

    let luminanceSum = 0;
    let brightCount = 0;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      rSum += r;
      gSum += g;
      bSum += b;

      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      luminanceSum += luminance;
      if (luminance > 200) brightCount++;
    }

    const avgR = rSum / totalPixels;
    const avgG = gSum / totalPixels;
    const avgB = bSum / totalPixels;
    const channelMax = Math.max(avgR, avgG, avgB);
    const channelMin = Math.min(avgR, avgG, avgB);

    let dominantColor = 'balanced';
    if (channelMax === avgR) dominantColor = 'red';
    else if (channelMax === avgG) dominantColor = 'green';
    else if (channelMax === avgB) dominantColor = 'blue';

    return {
      meanLuminance: luminanceSum / totalPixels,
      brightPixelRatio: brightCount / totalPixels,
      dominantColor,
      colorDominance: channelMax ? (channelMax - channelMin) / channelMax : 0,
      avgR,
      avgG,
      avgB
    };
  }

  function countBlackNeighbors(data, width, height, x, y) {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const idx = (ny * width + nx) * 4;
          if (data[idx] === 0) count++;
        }
      }
    }
    return count;
  }

  function removeIsolatedBlackPixels(imageData, width, height, minNeighbors = 2) {
    const data = imageData.data;
    const result = new Uint8ClampedArray(data.length);
    result.set(data);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (data[idx] === 0) {
          const neighbors = countBlackNeighbors(data, width, height, x, y);
          if (neighbors < minNeighbors) {
            result[idx] = 255;
            result[idx + 1] = 255;
            result[idx + 2] = 255;
          }
        }
      }
    }

    data.set(result);
  }

  function applyHighContrastProfile(imageData, width, height) {
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

      const isPinkText = (r > 180 && b > 150 && r > g + 20);
      const isWhiteText = (r > 200 && g > 200 && b > 200);
      const isVeryBright = luminance > 180;

      if (isPinkText || isWhiteText || isVeryBright) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      } else {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      }
    }

    removeIsolatedBlackPixels(imageData, width, height, 2);
    removeIsolatedBlackPixels(imageData, width, height, 2);
  }

  function applyLightDenoiseProfile(imageData, width, height) {
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

      const isTextLike = (r > 165 && b > 130 && r > g + 12) || luminance > 190;
      if (isTextLike) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      } else {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      }
    }

    removeIsolatedBlackPixels(imageData, width, height, 1);
  }

  function resolveCaptchaPreprocessProfile(stats, forcedModeOverride = null) {
    let forcedMode = 'auto';
    if (typeof forcedModeOverride === 'string' && forcedModeOverride.trim()) {
      forcedMode = forcedModeOverride.trim().toLowerCase();
    } else {
      try {
        forcedMode = (localStorage.getItem(CAPSOLVER_PREPROCESS_MODE_KEY) || 'auto').trim().toLowerCase();
      } catch (e) {
        forcedMode = 'auto';
      }
    }

    const aliasMap = {
      auto: 'auto',
      raw: 'raw',
      none: 'raw',
      off: 'raw',
      bypass: 'raw',
      light: 'light_denoise',
      light_denoise: 'light_denoise',
      denoise: 'light_denoise',
      high: 'high_contrast',
      contrast: 'high_contrast',
      high_contrast: 'high_contrast'
    };

    const normalizedForced = aliasMap[forcedMode] || 'auto';
    if (normalizedForced !== 'auto') {
      return { profile: normalizedForced, modeSource: `forced:${forcedMode}` };
    }

    const cleanImage = stats.meanLuminance > 185 && stats.brightPixelRatio > 0.72 && stats.colorDominance < 0.10;
    if (cleanImage) {
      return { profile: 'raw', modeSource: 'auto-clean-bypass' };
    }

    if (stats.colorDominance > 0.16 || stats.meanLuminance < 125 || stats.brightPixelRatio < 0.32) {
      return { profile: 'high_contrast', modeSource: 'auto-noisy-or-low-contrast' };
    }

    return { profile: 'light_denoise', modeSource: 'auto-balanced' };
  }

  // Preprocess captcha image with dynamic profile selection
  function preprocessCaptchaImage(img, forcedProfile = null) {
    console.log('[CapSolver] preprocessCaptchaImage called');

    const origWidth = img.naturalWidth || img.width;
    const origHeight = img.naturalHeight || img.height;

    if (!origWidth || !origHeight) {
      console.log('[CapSolver] ERROR: Image has no dimensions!');
      return '';
    }

    const scale = 2;
    const width = origWidth * scale;
    const height = origHeight * scale;

    console.log('[CapSolver] Original size:', origWidth, 'x', origHeight, '-> Scaled:', width, 'x', height);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = width;
    canvas.height = height;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    try {
      ctx.drawImage(img, 0, 0, width, height);
    } catch (e) {
      console.log('[CapSolver] drawImage FAILED:', e);
      return '';
    }

    let imageData;
    try {
      imageData = ctx.getImageData(0, 0, width, height);
    } catch (e) {
      console.log('[CapSolver] getImageData FAILED (CORS?):', e);
      return '';
    }

    const stats = computeCaptchaImageStats(imageData);
    const { profile, modeSource } = resolveCaptchaPreprocessProfile(stats, forcedProfile);

    console.log(
      '[CapSolver] Preprocess profile:',
      profile,
      `(${modeSource})`,
      '| stats:',
      `meanLum=${stats.meanLuminance.toFixed(1)}`,
      `brightRatio=${stats.brightPixelRatio.toFixed(3)}`,
      `dominant=${stats.dominantColor}`,
      `dominance=${stats.colorDominance.toFixed(3)}`
    );

    if (profile === 'high_contrast') {
      applyHighContrastProfile(imageData, width, height);
      ctx.putImageData(imageData, 0, 0);
    } else if (profile === 'light_denoise') {
      applyLightDenoiseProfile(imageData, width, height);
      ctx.putImageData(imageData, 0, 0);
    } else {
      console.log('[CapSolver] Bypassing preprocessing (raw mode)');
    }

    let dataUrl;
    try {
      dataUrl = canvas.toDataURL('image/png');
    } catch (e) {
      console.log('[CapSolver] toDataURL FAILED:', e);
      return '';
    }

    const base64 = dataUrl.split(',')[1] || '';
    console.log('[CapSolver] Preprocess output ready:', profile, 'size:', base64.length);
    console.log('[CapSolver] Preprocessed image data URL (paste in browser to view):');
    console.log(dataUrl);
    return { base64, profile, modeSource };
  }

  function analyzeCapSolverOutput(rawSolution) {
    const normalized = String(rawSolution || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const reasons = [];

    if (!normalized) reasons.push("empty");
    if (normalized.length !== 6) reasons.push("wrong_length");
    if (!/^[A-Z0-9]{6}$/.test(normalized)) reasons.push("non_alnum");
    if (/^(.)\1{5}$/.test(normalized)) reasons.push("all_same_char");
    if (/^(?:0O){3}$|^(?:O0){3}$/.test(normalized)) reasons.push("ambiguous_0o_pattern");

    return {
      normalized,
      valid: reasons.length === 0,
      reasons
    };
  }

  async function autoSolveWithCapSolver() {
    if (!loadCapSolverEnabled()) {
      console.log('[CapSolver] Auto-solve disabled in settings');
      return;
    }

    const apiKey = loadCapSolverApiKey();
    if (!apiKey || apiKey.length < 10) {
      console.log('[CapSolver] No API key configured');
      return;
    }

    const now = Date.now();
    if (now - capSolverLastAttempt < CAPSOLVER_MIN_INTERVAL) {
      console.log('[CapSolver] Too soon since last attempt');
      return;
    }

    if (capSolverInProgress) {
      console.log('[CapSolver] Already solving...');
      return;
    }

    const modal = document.getElementById("botcheck-modal");
    if (!modal) {
      console.log('[CapSolver] Botcheck modal not found');
      return;
    }

    if (!modal.classList.contains('flex')) {
      console.log('[CapSolver] Botcheck modal not visible');
      return;
    }

    try {
      capSolverInProgress = true;
      capSolverLastAttempt = now;
      console.log('[CapSolver] Starting auto-solve attempt...');

      const captchaImg = modal.querySelector('[data-botcheck-image]');

      if (!captchaImg) {
        console.log('[CapSolver] CAPTCHA image element not found');
        capSolverInProgress = false;
        return;
      }

      const imgSrc = captchaImg.src;
      if (!imgSrc) {
        console.log('[CapSolver] Image has no src - modal may be incomplete');
        capSolverInProgress = false;
        return;
      }

      // Check if image has actually loaded with valid dimensions
      if (!captchaImg.complete || captchaImg.naturalWidth === 0 || captchaImg.naturalHeight === 0) {
        console.log('[CapSolver] Image not fully loaded yet - skipping this tick');
        capSolverInProgress = false;
        return;
      }

      // Check for timer - if no timer, this might be a broken/incomplete modal
      const timerEl = modal.querySelector('[data-botcheck-timer], .botcheck-timer, [class*="timer"]');
      const modalText = modal.textContent || '';
      const hasTimeLeft = /time\s*left|seconds?|:\d{2}/i.test(modalText);

      if (!timerEl && !hasTimeLeft) {
        console.log('[CapSolver] No timer found - modal may be broken/incomplete, skipping');
        capSolverInProgress = false;
        return;
      }

      console.log('[CapSolver] Found image:', imgSrc);
      console.log('[CapSolver] Image element:', captchaImg);
      console.log('[CapSolver] Image dimensions:', captchaImg.naturalWidth, 'x', captchaImg.naturalHeight);
      console.log('[CapSolver] Image complete:', captchaImg.complete);

      // Build staged retry plans. First attempt uses baseline settings, retries vary one dimension each.
      const attemptPlans = [
        { profile: 'auto', optionOverrides: {}, variation: 'baseline' },
        { profile: 'raw', optionOverrides: {}, variation: 'retry_profile_raw' },
        { profile: 'auto', optionOverrides: { score: 0.85 }, variation: 'retry_score_0_85' }
      ];

      if (capSolverOneShotOverride) {
        attemptPlans.unshift({
          profile: capSolverOneShotOverride.profile || 'raw',
          optionOverrides: { ...(capSolverOneShotOverride.optionOverrides || {}) },
          variation: capSolverOneShotOverride.variation || 'recovery_override'
        });
        console.log('[CapSolver] Applying one-shot recovery override:', capSolverOneShotOverride);
        capSolverOneShotOverride = null;
      }

      const solver = new CapSolverClient();

      // CapSolver options for this captcha type
      // You can customize these in console: capSolverSetOptions({...})
      const defaultOptions = {
        module: 'common',       // Use 'common' module for alphanumeric captchas
        score: 0.9,            // Confidence threshold
        case: false,           // Case insensitive
        numeric: 0,            // ANY characters (0=any, 1=numbers, 2=letters)
        minLength: 6,
        maxLength: 6
      };

      // Load custom options if set
      let customOptions = {};
      try {
        const saved = localStorage.getItem('oa_capsolver_options_v1');
        if (saved) customOptions = JSON.parse(saved);
      } catch {}

      const baseOptions = { ...defaultOptions, ...customOptions };
      console.log('[CapSolver] Base options:', baseOptions);

      // Stage 0: submit once, then retry only when output is invalid/known-bad.
      let solution = '';
      const attemptHistory = [];

      for (let index = 0; index < attemptPlans.length; index++) {
        const attempt = index + 1;
        const plan = attemptPlans[index];
        const attemptOptions = { ...baseOptions, ...plan.optionOverrides };

        console.log(`[CapSolver] Attempt ${attempt}/${attemptPlans.length} using profile=${plan.profile}, variation=${plan.variation}`);

        let preparedImageData = '';
        let resolvedProfile = plan.profile;
        let modeSource = 'n/a';

        if (imgSrc.startsWith('data:image')) {
          console.log('[CapSolver] Image is base64, preprocessing with plan profile...');
          try {
            const preprocessResult = preprocessCaptchaImage(captchaImg, plan.profile);
            preparedImageData = preprocessResult?.base64 || '';
            resolvedProfile = preprocessResult?.profile || resolvedProfile;
            modeSource = preprocessResult?.modeSource || modeSource;
          } catch (e) {
            console.log('[CapSolver] Preprocessing failed, using raw base64:', e);
            preparedImageData = imgSrc.split(',')[1];
            modeSource = 'fallback:raw-base64';
          }
        } else {
          // Capture image via canvas path then preprocess according to plan profile
          console.log('[CapSolver] Capturing image via canvas for attempt profile:', plan.profile);
          try {
            if (!captchaImg.complete || captchaImg.naturalWidth === 0) {
              console.log('[CapSolver] Waiting for image to load...');
              await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Image load timeout')), 5000);
                captchaImg.onload = () => { clearTimeout(timeout); resolve(); };
                captchaImg.onerror = () => { clearTimeout(timeout); reject(new Error('Image load error')); };
              });
            }

            const preprocessResult = preprocessCaptchaImage(captchaImg, plan.profile);
            preparedImageData = preprocessResult?.base64 || '';
            resolvedProfile = preprocessResult?.profile || resolvedProfile;
            modeSource = preprocessResult?.modeSource || modeSource;
          } catch (e) {
            console.log('[CapSolver] Canvas/preprocess capture failed:', e);
            modeSource = 'capture_failed';
          }
        }

        if (!preparedImageData) {
          const failedMeta = {
            attempt,
            profileRequested: plan.profile,
            profileResolved: resolvedProfile,
            modeSource,
            options: attemptOptions,
            accepted: false,
            rejectedReason: 'no_image_data',
            at: Date.now()
          };
          attemptHistory.push(failedMeta);
          console.log('[CapSolver] Attempt rejected:', failedMeta);
          continue;
        }

        let rawSolution = '';
        let analysis;
        try {
          rawSolution = await solver.solveImageToText(preparedImageData, attemptOptions);
          analysis = analyzeCapSolverOutput(rawSolution);
        } catch (e) {
          analysis = { normalized: '', valid: false, reasons: ['solver_error:' + (e.message || 'unknown')] };
        }

        const attemptMeta = {
          attempt,
          profileRequested: plan.profile,
          profileResolved: resolvedProfile,
          modeSource,
          variation: plan.variation,
          options: {
            module: attemptOptions.module,
            score: attemptOptions.score,
            case: attemptOptions.case,
            numeric: attemptOptions.numeric,
            minLength: attemptOptions.minLength,
            maxLength: attemptOptions.maxLength
          },
          rawSolution: String(rawSolution || ''),
          normalizedSolution: analysis.normalized,
          accepted: analysis.valid,
          rejectedReasons: analysis.reasons,
          at: Date.now()
        };

        attemptHistory.push(attemptMeta);
        console.log('[CapSolver] Attempt result:', attemptMeta);

        if (analysis.valid) {
          solution = analysis.normalized;
          break;
        }
      }

      if (!solution) {
        lastCapSolverAttemptHistory = attemptHistory;
        throw new Error('No acceptable solution from staged retries');
      }

      lastCapSolverAttemptHistory = attemptHistory;
      console.log('[CapSolver] Accepted solution:', solution);
      console.log('[CapSolver] Attempt history:', attemptHistory);

      // Check if the modal asks for specific character positions
      // Look for text like "Enter the 4th character" or "Enter the 1st, 3rd, and 6th character"
      let finalAnswer = solution; // Default to full solution

      try {
        const modalText = modal.textContent || modal.innerText || '';
        console.log('[CapSolver] Modal text:', modalText.substring(0, 500));

        const positions = new Set();
        const lowerText = modalText.toLowerCase();

        // First check: Does this look like asking for the full code?
        const wantsFullCode = /enter\s+(?:the\s+)?(?:full\s+)?6[- ]?character\s+code/i.test(modalText) ||
                              /enter\s+(?:the\s+)?(?:full\s+)?code\s+shown/i.test(modalText) ||
                              /enter\s+(?:the\s+)?(?:entire|complete|whole|full)/i.test(modalText);

        if (wantsFullCode) {
          console.log('[CapSolver] Modal asks for full 6-character code');
        } else {
          // NEW Pattern: Single position like "Enter the 4th character" or "4th character"
          // This is the NEW captcha format
          const singlePosPattern = /(?:enter\s+)?(?:the\s+)?(\d)(?:st|nd|rd|th)\s+character/gi;
          let singleMatch;
          while ((singleMatch = singlePosPattern.exec(modalText)) !== null) {
            const num = parseInt(singleMatch[1]);
            if (num >= 1 && num <= 6) {
              positions.add(num);
              console.log('[CapSolver] Found single position request:', num);
            }
          }

          // Pattern: "character X" or "character #X"
          const charNumPattern = /character\s*#?\s*(\d)/gi;
          let charNumMatch;
          while ((charNumMatch = charNumPattern.exec(modalText)) !== null) {
            const num = parseInt(charNumMatch[1]);
            if (num >= 1 && num <= 6) {
              positions.add(num);
              console.log('[CapSolver] Found "character X" pattern:', num);
            }
          }

          // Pattern: "Enter characters 2, 4 and 6" or "characters 1, 3, 5 from the code"
          const charactersPattern = /(?:enter\s+)?characters?\s+(\d)(?:[,\s]+(?:and\s+)?(\d))*(?:\s+(?:from|of))?/gi;
          let charMatch;
          while ((charMatch = charactersPattern.exec(modalText)) !== null) {
            const allDigits = charMatch[0].match(/\b(\d)\b/g) || [];
            for (const d of allDigits) {
              const num = parseInt(d);
              if (num >= 1 && num <= 6) positions.add(num);
            }
          }

          // Pattern: Ordinal patterns like "1st, 3rd, and 6th character"
          const ordinalPattern = /(\d)(?:st|nd|rd|th)(?:[,\s]+(?:and\s+)?(\d)(?:st|nd|rd|th))*/gi;
          let ordinalMatch;
          while ((ordinalMatch = ordinalPattern.exec(modalText)) !== null) {
            const digits = ordinalMatch[0].match(/(\d)(?:st|nd|rd|th)/gi) || [];
            for (const d of digits) {
              const num = parseInt(d);
              if (num >= 1 && num <= 6) positions.add(num);
            }
          }

          // Pattern: Word forms like "first, third, and sixth character"
          const wordMap = { 'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5, 'sixth': 6 };
          const wordPattern = /(first|second|third|fourth|fifth|sixth)/gi;
          let wordMatch;
          while ((wordMatch = wordPattern.exec(lowerText)) !== null) {
            // Check if "character" appears nearby
            const contextStart = Math.max(0, wordMatch.index - 30);
            const contextEnd = Math.min(lowerText.length, wordMatch.index + wordMatch[0].length + 30);
            const context = lowerText.substring(contextStart, contextEnd);
            if (context.includes('character')) {
              const num = wordMap[wordMatch[1].toLowerCase()];
              if (num) {
                positions.add(num);
                console.log('[CapSolver] Found word form position:', wordMatch[1], '->', num);
              }
            }
          }
        }

        console.log('[CapSolver] Detected positions:', Array.from(positions).sort((a,b) => a-b));

        // If we found specific positions (1-5), extract just those characters
        if (positions.size > 0 && positions.size < 6) {
          const sortedPositions = Array.from(positions).sort((a, b) => a - b);
          finalAnswer = sortedPositions.map(pos => solution[pos - 1]).join('');
          console.log(`[CapSolver] Extracting positions ${sortedPositions.join(', ')} from "${solution}" = "${finalAnswer}"`);
        } else {
          console.log('[CapSolver] Using full 6-character solution');
        }
      } catch (parseErr) {
        console.log('[CapSolver] Position parsing error:', parseErr);
        // Fall back to full solution
      }

      console.log('[CapSolver] Final answer to enter:', finalAnswer);

      // Random delay between 7-14 seconds to look more human
      const humanDelay = Math.floor(Math.random() * 3000) + 5000; // 7000-14000ms
      console.log(`[CapSolver] Waiting ${(humanDelay/1000).toFixed(1)}s before entering solution (human delay)...`);
      await new Promise(resolve => setTimeout(resolve, humanDelay));

      const input = modal.querySelector('[data-botcheck-input]');
      if (!input) {
        console.log('[CapSolver] Input field not found');
        return;
      }

      // FIXED: More robust input value setting for React/Vue apps
      console.log('[CapSolver] Setting input value to:', finalAnswer);

      // Method 1: Native setter (works with React)
      try {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(input, finalAnswer);
      } catch (e) {
        console.log('[CapSolver] Native setter failed:', e);
        input.value = finalAnswer;
      }

      // Method 2: Focus and simulate typing
      input.focus();

      // Dispatch all the events React/Vue might need
      input.dispatchEvent(new Event('focus', { bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

      // Method 3: Also try setting via attribute
      input.setAttribute('value', finalAnswer);

      console.log('[CapSolver] Solution entered:', finalAnswer, '| Input value now:', input.value);

      const selectedPlan = attemptHistory.find(a => a && a.accepted) || attemptHistory[attemptHistory.length - 1] || null;
      lastSecurityCheckContext = captureBotcheckContext(modal, selectedPlan?.options || baseOptions, selectedPlan?.profileResolved || selectedPlan?.profileRequested || null);

      // Track this attempt for pass/fail detection
      recordSecurityCheckAttempt(finalAnswer, true);

      // Instead of clicking button, just press Enter on the input field
      // The existing botcheck handler in the script will submit on Enter
      setTimeout(() => {
        console.log('[CapSolver] Pressing Enter to submit...');
        try {
          // Focus the input first
          input.focus();

          // Dispatch Enter key event
          const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
          });
          input.dispatchEvent(enterEvent);

          // Also try keyup and keypress for compatibility
          input.dispatchEvent(new KeyboardEvent('keyup', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true
          }));

          input.dispatchEvent(new KeyboardEvent('keypress', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true
          }));

          console.log('[CapSolver] Enter key sent');
        } catch (e) {
          console.log('[CapSolver] Enter key failed:', e);
        }
      }, 500);

      const stats = loadCapSolverStats();
      stats.solves = (stats.solves || 0) + 1;
      stats.lastSolvedAt = Date.now();
      saveCapSolverStats(stats);

      try {
        if (window.gameNotifications && typeof window.gameNotifications.show === 'function') {
          window.gameNotifications.show('✔ CapSolver: Solved! (' + solution + ')');
        }
      } catch {}

    } catch (error) {
      console.error('[CapSolver] Auto-solve failed:', error);

      const stats = loadCapSolverStats();
      stats.failures = (stats.failures || 0) + 1;
      if (!stats.history) stats.history = [];
      if (Array.isArray(lastCapSolverAttemptHistory) && lastCapSolverAttemptHistory.length > 0) {
        stats.history.unshift({
          answer: '',
          passed: false,
          auto: true,
          time: 0,
          capSolverAttempts: lastCapSolverAttemptHistory,
          capSolverAttemptCount: lastCapSolverAttemptHistory.length,
          capSolverFailedBeforeSubmit: true,
          at: Date.now()
        });
        if (stats.history.length > 20) stats.history.length = 20;
      }
      saveCapSolverStats(stats);

      try {
        if (window.gameNotifications && typeof window.gameNotifications.show === 'function') {
          window.gameNotifications.show('✔' + error.message);
        }
      } catch {}
    } finally {
      capSolverInProgress = false;
    }
  }

  let capSolverCheckInterval = null;

  function startCapSolverMonitor() {
    if (capSolverCheckInterval) return;

    capSolverCheckInterval = OA.setInterval(() => {
      if (!loadCapSolverEnabled()) return;

      // Respect solver choice from Stat Analyzer panel
      try {
        const solverChoice = localStorage.getItem('oa_sc_solver_choice_v1') || 'capsolver';
        if (solverChoice !== 'capsolver') return;
      } catch {}

      const modal = document.getElementById('botcheck-modal');
      const visible = modal && modal.classList.contains('flex');

      if (visible) {
        autoSolveWithCapSolver();
      }
    }, 2000);
  }

  startCapSolverMonitor();

  // Start monitoring for security check pass/fail results
  setTimeout(() => {
    startSecurityCheckResultMonitor();
    console.log('[SecurityCheck] Result monitor started. Use securityCheckStats() to view stats.');
  }, 1000);

  // Expose a stop() so the main script can cleanly unload the CapSolver monitor.
  window.__oaCapSolver = window.__oaCapSolver || {};
  window.__oaCapSolver.stop = function () {
    try { if (capSolverCheckInterval) { clearInterval(capSolverCheckInterval); capSolverCheckInterval = null; } } catch {}
  };

  // Ensure lifecycle stop clears CapSolver too.
  OA.addCleanup(() => { try { window.__oaCapSolver?.stop?.(); } catch {} });

  console.log('[CapSolver] Module loaded. Creating global functions...');

  // Direct global function approach (more reliable than object assignment)
  _w.capSolverTest = async function() {
    console.log('[CapSolver] Direct test function called');
    await autoSolveWithCapSolver();
  };

  _w.capSolverSetKey = function(key) {
    saveCapSolverApiKey(key);
    console.log('[CapSolver] API key saved');
  };

  _w.capSolverEnable = function() {
    saveCapSolverEnabled(true);
    console.log('[CapSolver] Auto-solve ENABLED');
  };

  _w.capSolverDisable = function() {
    saveCapSolverEnabled(false);
    console.log('[CapSolver] Auto-solve DISABLED');
  };

  window.capSolverStats = function() {
    const stats = loadCapSolverStats();
    console.log('[CapSolver] Stats:', stats);
    return stats;
  };

  console.log('[CapSolver] ✔ Global functions created');
  console.log('[CapSolver] Usage: capSolverSetKey("CAP-xxx"), capSolverEnable(), capSolverTest()');

  // Function to customize CapSolver options
  _w.capSolverSetOptions = function(options) {
    try {
      localStorage.setItem('oa_capsolver_options_v1', JSON.stringify(options));
      console.log('[CapSolver] Options saved:', options);
      console.log('[CapSolver] Available options:');
      console.log('  module: "common" (default), "ocr", "queueit"');
      console.log('  score: 0.0-1.0 (confidence threshold, lower = accept more)');
      console.log('  case: true/false (case sensitive)');
      console.log('  numeric: 0 (any), 1 (numbers only), 2 (letters only)');
      console.log('  minLength/maxLength: expected code length');
    } catch (e) {
      console.error('[CapSolver] Failed to save options:', e);
    }
  };

  window.capSolverGetOptions = function() {
    try {
      const saved = localStorage.getItem('oa_capsolver_options_v1');
      const options = saved ? JSON.parse(saved) : {};
      console.log('[CapSolver] Current custom options:', options);
      console.log('[CapSolver] Defaults: { module: "common", score: 0.5, case: false, minLength: 4, maxLength: 4 }');
      return options;
    } catch { return {}; }
  };

  window.capSolverResetOptions = function() {
    try {
      localStorage.removeItem('oa_capsolver_options_v1');
      console.log('[CapSolver] Options reset to defaults');
    } catch {}
  };

  // ============================================================================
  // CAPSOLVER INTEGRATION - END
  // ============================================================================
const BEAST_RETURN_KEY = "oa_beast_return_to_combat_v1";
  const BEAST_PENDING_KEY = "oa_last_beast_pending_v1";
  const BEAST_INFLIGHT_KEY = "oa_last_beast_inflight_v1";
  const COORD_PENDING_KEY = "oa_coord_teleport_pending_v1";
  const BOTCHECK_RESUME_KEY = "oa_resume_autocombat_after_botcheck_v1";
  const BOTCHECK_BEEP_KEY = "oa_botcheck_beep_enabled_v1";
  const KINGDOM_RUNNING_KEY = "oa_kingdom_auto_running_v1";
  function isKingdomAutoRunning() {
    try { return localStorage.getItem(KINGDOM_RUNNING_KEY) === "1"; } catch (e) { return false; }
  }

  (function enforceCombatAfterAutoBeastTeleport() {
    // FIRST: If AutoBeast is OFF, clear ALL pending beast state to stop loops
    const isAutoBeastEnabled = (() => {
      try {
        const rawAuto = localStorage.getItem("oa_last_beast_auto_v1");
        if (!rawAuto) return false;
        return Boolean(JSON.parse(rawAuto));
      } catch { return false; }
    })();

    if (!isAutoBeastEnabled) {
      // Check if there's any pending auto teleport and clear it
      try {
        const pendingRaw = localStorage.getItem(BEAST_PENDING_KEY);
        if (pendingRaw) {
          const pending = JSON.parse(pendingRaw);
          if (pending?.source === "auto") {
            console.log("[AutoBeast] OFF - Clearing stale auto pending on page load");
            localStorage.removeItem(BEAST_PENDING_KEY);
            localStorage.removeItem(BEAST_INFLIGHT_KEY);
            localStorage.removeItem(BEAST_RETURN_KEY);
          }
        }
      } catch {}
    }

    let flag = null;
    try { flag = localStorage.getItem(BEAST_RETURN_KEY); } catch {}

    if (isKingdomAutoRunning()) {
      // Prevent combat→map bouncing while Kingdom Auto is navigating.
      try { localStorage.removeItem(BEAST_RETURN_KEY); } catch {}
      return;
    }

    if (flag === "1") {
      try { localStorage.removeItem(BEAST_RETURN_KEY); } catch {}

      if (location.pathname === "/game.php") {
        const url = new URL(location.href);
        const currentTab = url.searchParams.get("tab") || "combat";
        if (currentTab !== "combat") {
          // Check if there's actually a beast present before forcing back to combat
          const select = document.getElementById("monster-select");
          const hasBeast = select && Array.from(select.options).some((opt) => isBeastOption(opt));

          if (hasBeast) {
            url.searchParams.set("tab", "combat");
            console.log("[AutoBeast] Teleport complete -> forcing back to combat tab");
            OA.NAV.replace(url.toString());
          } else {
            console.log("[AutoBeast] BEAST_RETURN_KEY set but no beast present - clearing flag");
          }
        } else {
          // We're on combat tab after beast teleport - select beast and start fighting
          console.log("[AutoBeast] Returned to combat tab - will select beast and start combat");

          // Function to find beast and start fight via API
          async function tryStartBeastFight(attempt) {
            if (attempt > 15) {
              console.log("[AutoBeast] Gave up trying to find beast after 15 attempts");
              // Restore saved plane lock since no beast found
              try {
                const savedPlane = localStorage.getItem("oa_beast_return_plane_v1");
                if (savedPlane) {
                  localStorage.setItem("oa_pve_plane_lock_v1", savedPlane);
                  localStorage.removeItem("oa_beast_return_plane_v1");
                  console.log("[AutoBeast] No beast found - restored PvE plane lock:", savedPlane);
                  try { planeMgr.tick("beast_restore_reload"); } catch {}
                }
              } catch {}
              return;
            }

            try {
              const select = document.getElementById("monster-select");
              if (!select) {
                console.log("[AutoBeast] No monster-select found, retrying...");
                setTimeout(() => tryStartBeastFight(attempt + 1), 500);
                return;
              }

              // Look for beast option with data-beast-option attribute
              const beastOption = Array.from(select.options).find((opt) => isBeastOption(opt));

              if (!beastOption) {
                console.log("[AutoBeast] No beast option found yet, retrying... (attempt " + attempt + ")");
                setTimeout(() => tryStartBeastFight(attempt + 1), 500);
                return;
              }

              const beastId = beastOption.value;
              console.log("[AutoBeast] Found beast:", beastId, beastOption.textContent);

              // Select the beast in dropdown
              select.value = beastId;
              select.dispatchEvent(new Event('change', { bubbles: true }));

              // Get CSRF token
              const csrfToken = window.csrfToken ||
                document.querySelector('meta[name="csrf-token"]')?.content ||
                document.querySelector('input[name="csrf_token"]')?.value || '';

              if (!csrfToken) {
                console.log("[AutoBeast] No CSRF token found, trying button click instead");
                const mainBtn = document.getElementById("combat-main-button");
                if (mainBtn) mainBtn.click();
                return;
              }

              // Start fight via API
              console.log("[AutoBeast] Starting fight with beast via API:", beastId);
              const fd = new FormData();
              fd.append('action', 'start_fight');
              fd.append('monster_id', beastId);
              fd.append('csrf_token', csrfToken);
              fd.append('tab', 'combat');

              const res = await fetch('api/combat_api.php', {
                method: 'POST',
                body: fd,
                credentials: 'same-origin'
              });

              if (res.ok) {
                const data = await res.json();
                console.log("[AutoBeast] Fight started:", data.success ? "success" : "failed");
                // The game's combat polling will pick up the state change
              } else {
                console.log("[AutoBeast] API returned error, trying button click");
                const mainBtn = document.getElementById("combat-main-button");
                if (mainBtn) mainBtn.click();
              }

            } catch (e) {
              console.log("[AutoBeast] Error:", e);
              // Fallback to button click
              const mainBtn = document.getElementById("combat-main-button");
              if (mainBtn) mainBtn.click();
            }
          }

          // Start trying after page settles
          setTimeout(() => tryStartBeastFight(1), 1500);
        }
      }
    }
    (function submitPendingBeastTeleportOnMapPage() {
    // Fallback must NOT fight the main pending handler (which sets inflight + auto-return semantics).
    // Strategy: if pending is structured JSON, wait briefly for HUD/init; only submit if still pending and HUD didn't mount.
    try {
      if (location.pathname !== "/game.php") return;
      const url = new URL(location.href);
      const tab = url.searchParams.get("tab") || "combat";
      if (tab !== "map") return;

      const raw = localStorage.getItem(BEAST_PENDING_KEY);
      if (!raw) return;

      let pending = null;
      try { pending = JSON.parse(raw); } catch {}
      const isStructured = !!pending && typeof pending === "object" && ("source" in pending || "cdKey" in pending);

      const doFallbackSubmit = () => {
        const raw2 = localStorage.getItem(BEAST_PENDING_KEY);
        if (!raw2 || raw2 !== raw) return false;
        // REMOVED: Don't skip if HUD exists - let this handler work too
        // The HUD's doSubmitLastBeastNow will also try, but having both try is fine

        // Robustly find the "Ride to the Last Beast" form (Map tab).
        const form =
          (typeof findTeleportLastBeastForm === "function" ? findTeleportLastBeastForm() : null) ||
          document.querySelector('form input[name="action"][value="teleport_last_beast"]')?.closest("form") ||
          document.querySelector('form input[name="action"][value="teleport_last_beast" i]')?.closest("form") ||
          (() => {
            const btns = Array.from(document.querySelectorAll('form button[type="submit"], form button, form input[type="submit"]'));
            const b = btns.find((el) => /ride\s+to\s+the\s+last\s+beast/i.test(String(el.textContent || el.value || "")));
            return b ? b.closest("form") : null;
          })() ||
          null;
        if (!form) {
          console.log("[AutoBeast] Map page: teleport form not found yet");
          return false;
        }

        const src = String((pending && pending.source) || raw || "unknown");

        // Never submit auto teleports if AutoBeast is OFF (prevents loops from stale pending).
        const _autoEnabled = (() => {
          try {
            const rawAuto = localStorage.getItem("oa_last_beast_auto_v1");
            if (!rawAuto) return false; // DEFAULT TO FALSE - safer
            return Boolean(JSON.parse(rawAuto));
          } catch { return false; }
        })();

        // If source is "auto" and AutoBeast is OFF, clear everything and abort
        if (src === "auto" && !_autoEnabled) {
          console.log("[AutoBeast] AutoBeast OFF - clearing ALL pending state");
          try { localStorage.removeItem(BEAST_PENDING_KEY); } catch {}
          try { localStorage.removeItem(BEAST_INFLIGHT_KEY); } catch {}
          try { localStorage.removeItem(BEAST_RETURN_KEY); } catch {}
          return true;
        }

        const csrf = form.querySelector('input[name="csrf_token"]')?.value?.trim() || (typeof getCsrfToken === "function" ? getCsrfToken() : "");
        const nonce = form.querySelector('input[name="map_nonce"]')?.value?.trim() || "";
        if (!csrf || !nonce) return false; // wait for Map to fully hydrate

        const cdKey = String((pending && pending.cdKey) || "");

        // Prevent rapid double-submits on slow Map loads.
        const lockKey = "oa_last_beast_submit_lock_v1";
        const now = Date.now();
        const last = Number(localStorage.getItem(lockKey) || 0);
        if (Number.isFinite(last) && now - last < 3500) return false;
        try { localStorage.setItem(lockKey, String(now)); } catch {}

        // Always return to combat after teleport submits (auto + manual).
        try { localStorage.setItem(BEAST_RETURN_KEY, "1"); } catch {}

        // Seed inflight so arrival confirm can arm location cooldown and stop retry loops.
        const _cdKey = cdKey || "";
        if (_cdKey) {
          try { setCooldownForLocation(_cdKey, "submit"); } catch {}
          try {
            const inflight = { kind: "lastbeast", cdKey: _cdKey, source: src, submittedAt: Date.now(), attempts: 1, fromLoc: "" };
            localStorage.setItem(BEAST_INFLIGHT_KEY, JSON.stringify(inflight));
          } catch {}
        }

        // Ensure expected hidden fields are set.
        const ensureHidden = (name, value) => {
          let i = form.querySelector(`input[name="${name}"]`);
          if (!i) {
            i = document.createElement("input");
            i.type = "hidden";
            i.name = name;
            form.appendChild(i);
          }
          i.value = String(value);
        };
        ensureHidden("csrf_token", csrf);
        ensureHidden("from_tab", "map");

        const ok = (typeof clickOrSubmitForm === "function")
          ? clickOrSubmitForm(form)
          : (form.requestSubmit ? (form.requestSubmit(), true) : (form.submit(), true));

        if (ok) {
          try { localStorage.removeItem(BEAST_PENDING_KEY); } catch {}
          console.log("[LastBeast] Pending teleport fallback submit (observed).");
          return true;
        }

        // Release lock if submit failed so we can retry.
        try { localStorage.removeItem(lockKey); } catch {}
        return false;
      };

      if (isStructured) {
        const startAt = Date.now();
        const tick = () => {
          try {
            if (doFallbackSubmit()) return true;
          } catch {}
          return false;
        };

        // Try a few times while the Map tab hydrates (AJAX/partials).
        const t = setInterval(() => {
          if (tick()) { clearInterval(t); return; }
          if (Date.now() - startAt > 20000) { clearInterval(t); }
        }, 400);
        setTimeout(tick, 400);
        return;
      }

      // Legacy/unstructured pending: submit immediately.
      doFallbackSubmit();
    } catch (e) {
      console.warn("[LastBeast] Pending Map submit fallback failed", e);
    }
  })();

  })();

  const TAB_HOTKEYS = {
    '1': '/game.php?tab=combat',
    '2': '/game.php?tab=inventory',
    '3': '/game.php?tab=shop',
    '4': '/game.php?tab=market',
    '5': '/game.php?tab=map',
    '6': '/game.php?tab=quests',
    '7': '/game.php?tab=kingdoms',
    '8': '/clan.php',
    '9': '/skills.php',
  };

  function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (!tag) return false;
    const t = tag.toUpperCase();
    return (t === 'INPUT' || t === 'TEXTAREA' || el.isContentEditable);
  }

  function onTabHotkey(e) {
    const key = e.key;
    if (!(key in TAB_HOTKEYS)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTypingTarget(e.target)) return;

    const path = TAB_HOTKEYS[key];
    if (!path) return;

    const url = location.origin + path;
    if (location.href === url) return;

    console.log('[OA Script] Tab hotkey', key, '→', url);
    e.preventDefault();
    location.href = url;
  }
  document.addEventListener('keydown', onTabHotkey, true);

  function isGameView() {
    if (document.getElementById('combat-main-button')) return true;
    if (document.getElementById('map')) return true;
    if (document.querySelector('[data-map-view]')) return true;
    if (document.getElementById('player-hp-text')) return true;
    if (document.querySelector('#nav-combat, #game-top-bar, #oa-game-root')) return true;
    return false;
  }

  function waitForGameAndStart() {
    if (isGameView()) {
      init();
      return;
    }

    const obs = new MutationObserver(() => {
      if (isGameView()) {
        obs.disconnect();
        init();
      }
    });

    obs.observe(document.documentElement, { childList: true, subtree: true });

    setTimeout(() => {
      obs.disconnect();
      if (!window.__autoCombat && !window.__oaLastBeast) {
        console.log('[OA Script] No game DOM detected after timeout; not attaching AutoCombat/LastBeast.');
      }
    }, 10000);
  }

  function init() {

    const VIS_SPOOF_KEY = "oa_visibility_spoof_v1";
    const ANTIPAUSE_KEY = "oa_antipause_v1";

    function loadAntiPauseEnabled() {
      try {
        const raw = localStorage.getItem(ANTIPAUSE_KEY);
        if (!raw) return false;
        return Boolean(JSON.parse(raw));
      } catch { return false; }
    }

    function saveAntiPauseEnabled(v) {
      try { localStorage.setItem(ANTIPAUSE_KEY, JSON.stringify(!!v)); } catch {}
    }

    function installAntiPause(debugLog) {
      const logv = (m, o) => { try { debugLog?.(m, o); } catch {} };

      const defineNoopHandler = (obj, prop) => {
        try {
          const desc = Object.getOwnPropertyDescriptor(obj, prop);
          if (desc && desc.configurable === false) return false;
          Object.defineProperty(obj, prop, {
            configurable: true,
            get: () => null,
            set: () => {},
          });
          return true;
        } catch { return false; }
      };

      const stop = (e) => {
        try {
          e.stopImmediatePropagation?.();
          e.stopPropagation?.();
        } catch {}
      };

      // Stop visibility/focus events from reaching app listeners (capture runs before bubble).
      const blocked = [
        ["doc", "visibilitychange"],
        ["doc", "webkitvisibilitychange"],
        ["win", "blur"],
        ["win", "focus"],
        ["win", "pagehide"],
        ["win", "pageshow"],
      ];

      const installed = { listeners: {}, props: {} };

      for (const [scope, type] of blocked) {
        const target = scope === "doc" ? document : window;
        try {
          const h = (e) => stop(e);
          target.addEventListener(type, h, true);
          installed.listeners[type] = true;
        } catch { installed.listeners[type] = false; }
      }

      installed.props.onvisibilitychange = defineNoopHandler(document, "onvisibilitychange");
      installed.props.onwebkitvisibilitychange = defineNoopHandler(document, "onwebkitvisibilitychange");
      installed.props.onblur = defineNoopHandler(window, "onblur");
      installed.props.onfocus = defineNoopHandler(window, "onfocus");
      installed.props.onpagehide = defineNoopHandler(window, "onpagehide");
      installed.props.onpageshow = defineNoopHandler(window, "onpageshow");

      // Some code uses requestAnimationFrame which can pause in background; route through setTimeout.
      // This does NOT defeat timer throttling, but prevents full RAF pause patterns.
      try {
        if (!window.__oaOrigRAF) window.__oaOrigRAF = window.requestAnimationFrame?.bind(window);
        window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
        installed.raf = true;
      } catch { installed.raf = false; }

      logv("AntiPause installed", installed);
      try { window.__oaAntiPause = { installed: true, installedDetails: installed }; } catch {}
    }

    function startSilentAudio(debugLog) {
      const logv = (m, o) => { try { debugLog?.(m, o); } catch {} };
      try {
        if (window.__oaSilentAudio?.ctx) return;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) { logv("SilentAudio not supported"); return; }
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.0001; // non-zero avoids some autoplay edge cases
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        ctx.resume?.().catch?.(() => {});
        window.__oaSilentAudio = { ctx, osc, gain };
        logv("SilentAudio started", { state: ctx.state });
      } catch (e) { logv("SilentAudio failed", String(e)); }
    }

    function loadVisSpoofEnabled() {
      try {
        const raw = localStorage.getItem(VIS_SPOOF_KEY);
        if (!raw) return false;
        return Boolean(JSON.parse(raw));
      } catch { return false; }
    }

    function saveVisSpoofEnabled(v) {
      try { localStorage.setItem(VIS_SPOOF_KEY, JSON.stringify(!!v)); } catch {}
    }

    function installVisibilitySpoof(debugLog) {
      const logv = (m, o) => { try { debugLog?.(m, o); } catch {} };

      const tryDefineGetter = (obj, prop, getter) => {
        try {
          const desc = Object.getOwnPropertyDescriptor(obj, prop);
          if (desc && desc.configurable === false) return false;
          Object.defineProperty(obj, prop, { configurable: true, get: getter });
          return true;
        } catch { return false; }
      };

      const ok = {
        hidden: false,
        visibilityState: false,
        webkitHidden: false,
        hasFocus: false,
      };

      // Many apps pause on Page Visibility API. This DOES NOT defeat browser background throttling; it only prevents client code from thinking it's hidden.
      ok.hidden = tryDefineGetter(Document.prototype, "hidden", () => false) || tryDefineGetter(document, "hidden", () => false);
      ok.webkitHidden = tryDefineGetter(Document.prototype, "webkitHidden", () => false) || tryDefineGetter(document, "webkitHidden", () => false);
      ok.visibilityState = tryDefineGetter(Document.prototype, "visibilityState", () => "visible") || tryDefineGetter(document, "visibilityState", () => "visible");

      try {
        const origHasFocus = document.hasFocus?.bind(document);
        document.hasFocus = () => true;
        ok.hasFocus = true;
        // Keep original accessible for debugging (no restore for safety).
        document.__oaOrigHasFocus = origHasFocus;
      } catch {}

      logv("Visibility spoof installed", ok);

      // Some apps read these directly.
      try { window.onblur = null; } catch {}
      try { window.onfocus = null; } catch {}

      // Expose a minimal status hook
      try { window.__oaVisSpoof = { installed: true, ok }; } catch {}
    }

    window.__autoCombat?.stop?.();
    window.__oaLastBeast?.stop?.();

    // Optional: spoof Page Visibility so built-in game auto-combat doesn't pause on tab out (does NOT defeat browser timer throttling).
    if (loadVisSpoofEnabled()) {
      installVisibilitySpoof((m, o) => console.log(`[OA VisSpoof] ${m}`, o ?? ""));
    }

    if (loadAntiPauseEnabled()) {
      installAntiPause((m, o) => console.log(`[OA AntiPause] ${m}`, o ?? ""));
      // Best-effort: audio can reduce aggressive throttling in some browsers; may require user gesture.
      startSilentAudio((m, o) => console.log(`[OA AntiPause] ${m}`, o ?? ""));
    }

    window.__oaMoveHotkeys?.stop?.();

    const fmtInt = (value) => {
      try {
        if (window.App && typeof window.App.formatInt === 'function') return window.App.formatInt(value);
      } catch {}
      const n = Number(value);
      if (!Number.isFinite(n)) return '0';
      try { return n.toLocaleString('en-US'); } catch { return String(n); }
    };

    const fmtNumber = (value, min, max) => {
      try {
        if (window.App && typeof window.App.formatNumber === 'function') {
          return window.App.formatNumber(value, min, max);
        }
      } catch {}
      const n = Number(value);
      if (!Number.isFinite(n)) return '0';
      const minimumFractionDigits = typeof min === 'number' ? min : 0;
      const maximumFractionDigits = typeof max === 'number' ? max : (min !== undefined ? min : 2);
      try {
        return n.toLocaleString('en-US', { minimumFractionDigits, maximumFractionDigits });
      } catch {
        return String(n.toFixed(Math.max(0, Math.min(20, maximumFractionDigits))));
      }
    };

    function getCsrfToken() {
      try {
        if (window.App && typeof window.App.csrfToken === 'string' && window.App.csrfToken) {
          return window.App.csrfToken;
        }
      } catch {}
      if (typeof window.csrfToken === 'string' && window.csrfToken) return window.csrfToken;
      const meta = document.querySelector('meta[name="csrf-token"]');
      const metaToken = meta?.getAttribute('content')?.trim();
      if (metaToken) return metaToken;

      // Map pages often already contain a csrf_token hidden input in forms.
      const inputToken = document.querySelector('input[name="csrf_token"]')?.value?.trim();
      if (inputToken) return inputToken;

      return '';
    }

    const STATS_STORE_KEY = "oa_auto_stats_v1";
    const defaultStats = {
      fightsStarted: 0,
      attacks: 0,
      potionsUsed: 0,
      revives: 0,
      beastTeleportsTotal: 0,
      beastTeleportsAuto: 0,
      beastTeleportsHotkey: 0,
      beastTeleportsButton: 0,
      autoCombatTotalMs: 0,
      autoCombatLastEnabledAt: null,
    };

    function loadStats() {
      try {
        const raw = localStorage.getItem(STATS_STORE_KEY);
        if (!raw) return { ...defaultStats };
        const parsed = JSON.parse(raw);
        return Object.assign({}, defaultStats, parsed);
      } catch {
        return { ...defaultStats };
      }
    }

    function saveStats(s) { try { localStorage.setItem(STATS_STORE_KEY, JSON.stringify(s)); } catch {} }

    let stats = loadStats();
    let statsDisplayRefresh = null;

    function notifyStatsUpdated() {
      if (typeof statsDisplayRefresh === "function") {
        try { statsDisplayRefresh(); } catch {}
      }
    }

    function touchAutoCombatStart() {
      const now = Date.now();
      if (stats.autoCombatLastEnabledAt == null) {
        stats.autoCombatLastEnabledAt = now;
        saveStats(stats);
        notifyStatsUpdated();
      }
    }

    function touchAutoCombatStop() {
      const now = Date.now();
      if (stats.autoCombatLastEnabledAt != null) {
        const delta = now - stats.autoCombatLastEnabledAt;
        if (delta > 0 && Number.isFinite(delta)) stats.autoCombatTotalMs = (stats.autoCombatTotalMs || 0) + delta;
        stats.autoCombatLastEnabledAt = null;
        saveStats(stats);
        notifyStatsUpdated();
      }
    }

    function recordAttack(isStart) {
      stats.attacks = (stats.attacks || 0) + 1;
      if (isStart) stats.fightsStarted = (stats.fightsStarted || 0) + 1;
      saveStats(stats);
      notifyStatsUpdated();

      // Performance monitoring: record script auto action
      try {
        if (typeof window.__oaRecordAction === 'function') {
          window.__oaRecordAction('script');
        }
      } catch {}
    }
    function recordPotionUse() { stats.potionsUsed = (stats.potionsUsed || 0) + 1; saveStats(stats); notifyStatsUpdated(); }
    function recordRevive() { stats.revives = (stats.revives || 0) + 1; saveStats(stats); notifyStatsUpdated(); }

    function recordBeastTeleport(source) {
      stats.beastTeleportsTotal = (stats.beastTeleportsTotal || 0) + 1;
      if (source === 'auto') stats.beastTeleportsAuto = (stats.beastTeleportsAuto || 0) + 1;
      else if (source === 'hotkey') stats.beastTeleportsHotkey = (stats.beastTeleportsHotkey || 0) + 1;
      else if (source === 'button') stats.beastTeleportsButton = (stats.beastTeleportsButton || 0) + 1;
      saveStats(stats);
      notifyStatsUpdated();
    }

    let autoModeForRates = false;

    const hudTrack = {
      active: false,
      lastGold: 0,
      goldGain: 0,
      lastLevel: null,
      lastExp: 0,
      lastExpToNext: 0,
      xpGain: 0,
      expMode: null, // 'threshold' | 'remaining'
      activeMsTotal: 0,
      lastActiveTickAt: null,
      rateSamples: [], // [{activeMs, xp, gold, t}]
      lastRateSampleAt: 0,
      lastPosX: null,
      lastPosY: null,
    };

    function resetHudTrack() {
      hudTrack.active = false;
      hudTrack.lastGold = 0;
      hudTrack.goldGain = 0;
      hudTrack.lastLevel = null;
      hudTrack.lastExp = 0;
      hudTrack.lastExpToNext = 0;
      hudTrack.xpGain = 0;
      hudTrack.expMode = null;
      hudTrack.activeMsTotal = 0;
      hudTrack.lastActiveTickAt = null;
      hudTrack.rateSamples = [];
      hudTrack.lastRateSampleAt = 0;
      hudTrack.lastPosX = null;
      hudTrack.lastPosY = null;
    }

    function resetAllStats() {
      const keepAutoTimer = !!autoModeForRates && !!stats.autoCombatLastEnabledAt;
      stats = { ...defaultStats };
      if (keepAutoTimer) stats.autoCombatLastEnabledAt = Date.now();
      saveStats(stats);
      resetHudTrack();
      notifyStatsUpdated();
    }

    function getRuntimeRates() {
      // Rolling window based on ACTIVE combat time (not wall clock), so teleports/map time won't tank the rate.
      const RATE_WINDOW_ACTIVE_MS = 15 * 60 * 1000; // 15 minutes of active time
      if (!hudTrack.rateSamples || hudTrack.rateSamples.length < 2) return { xpPerHour: 0, goldPerHour: 0 };

      const latest = hudTrack.rateSamples[hudTrack.rateSamples.length - 1];
      const latestActive = Number(latest.activeMs || 0);
      if (!Number.isFinite(latestActive) || latestActive <= 0) return { xpPerHour: 0, goldPerHour: 0 };

      let oldest = hudTrack.rateSamples[0];
      for (let i = hudTrack.rateSamples.length - 1; i >= 0; i--) {
        const s = hudTrack.rateSamples[i];
        const d = latestActive - Number(s.activeMs || 0);
        if (d >= RATE_WINDOW_ACTIVE_MS) { oldest = s; break; }
        oldest = s;
      }

      const dActive = latestActive - Number(oldest.activeMs || 0);
      if (!Number.isFinite(dActive) || dActive <= 15000) return { xpPerHour: 0, goldPerHour: 0 };

      const dxp = Number(latest.xp || 0) - Number(oldest.xp || 0);
      const dgold = Number(latest.gold || 0) - Number(oldest.gold || 0);

      const factor = 3600000 / dActive;

      return {
        xpPerHour: Number.isFinite(dxp) && dxp > 0 ? dxp * factor : 0,
        goldPerHour: Number.isFinite(dgold) && dgold > 0 ? dgold * factor : 0,
      };
    }

    // Expose for Stat Analyzer
    window.__oaGetRates = getRuntimeRates;
    window.__oaHudTrack = hudTrack;

    (function setupDOMTracking() {
      // CRITICAL: Read gold/exp/level from DOM instead of API calls
      // This eliminates predictable server-side request patterns!

      function readHudFromDOM() {
        const result = {
          gold: null,
          level: null,
          exp: null,
          exp_to_next: null,
          hp: null,
          max_hp: null
        };

        // Try common element IDs/classes for gold
        let goldEl = document.getElementById('player-gold-value') ||
                     document.querySelector('[data-gold-value]') ||
                     document.querySelector('.gold-value') ||
                     document.querySelector('[data-stat="gold"]');

        if (goldEl) {
          const goldText = goldEl.textContent.replace(/[^\d]/g, '');
          result.gold = parseInt(goldText, 10);
        }

        // Try common element IDs/classes for exp
        let expEl = document.getElementById('player-exp-value') ||
                    document.querySelector('[data-exp-value]') ||
                    document.querySelector('.exp-value') ||
                    document.querySelector('[data-stat="exp"]');

        if (expEl) {
          const expText = expEl.textContent.replace(/[^\d]/g, '');
          result.exp = parseInt(expText, 10);
        }

        // Exp to next level
        let expNextEl = document.getElementById('player-exp-next') ||
                        document.querySelector('[data-exp-next]') ||
                        document.querySelector('.exp-next');

        if (expNextEl) {
          const expNextText = expNextEl.textContent.replace(/[^\d]/g, '');
          result.exp_to_next = parseInt(expNextText, 10);
        }

        // Level
        const lvlEl = document.getElementById("player-level-value");
        if (lvlEl) {
          result.level = parseInt(lvlEl.textContent.replace(/[^\d]/g, ''), 10);
        }

        // HP
        const hpText = document.getElementById("player-hp-text");
        if (hpText) {
          const m = (hpText.textContent || "").match(/([\d,]+)\s*\/\s*([\d,]+)/);
          if (m) {
            result.hp = parseInt(m[1].replace(/,/g, ''), 10);
            result.max_hp = parseInt(m[2].replace(/,/g, ''), 10);
          }
        }

        return result;
      }

      // Poll DOM instead of API - much faster, no server calls!
      let domPollInterval = null;

      function pollDOMForChanges() {
        const data = readHudFromDOM();

        // Only process if we got at least some data
        const gotGold = typeof data.gold === 'number' && !isNaN(data.gold);
        const gotLevel = typeof data.level === 'number' && !isNaN(data.level);
        const gotExp = typeof data.exp === 'number' && !isNaN(data.exp);
        const gotExpToNext = typeof data.exp_to_next === 'number' && !isNaN(data.exp_to_next);

        if (!gotGold && !gotLevel && !gotExp && !gotExpToNext) return;

        const autoOnNow = !!autoModeForRates;
        const activeNow = autoOnNow && (function () {
          try {
            if (location.pathname !== "/game.php") return false;
            const tab = new URL(location.href).searchParams.get("tab") || "combat";
            if (tab !== "combat") return false;
            return true;
          } catch { return true; }
        })();

        // Track ACTIVE time only (combat tab + script enabled).
        const nowTs = Date.now();
        if (hudTrack.lastActiveTickAt == null) hudTrack.lastActiveTickAt = nowTs;
        if (activeNow) {
          const dt = nowTs - hudTrack.lastActiveTickAt;
          if (dt > 0 && dt < 60000 && Number.isFinite(dt)) hudTrack.activeMsTotal += dt;
        }
        hudTrack.lastActiveTickAt = nowTs;

        // Rate samples (throttled)
        const SAMPLE_MS = 2500;
        if (activeNow && (nowTs - (hudTrack.lastRateSampleAt || 0) >= SAMPLE_MS)) {
          hudTrack.lastRateSampleAt = nowTs;
          hudTrack.rateSamples.push({ t: nowTs, activeMs: hudTrack.activeMsTotal, xp: hudTrack.xpGain, gold: hudTrack.goldGain });
          // Keep ~30 min of active-time history
          const keepActive = 30 * 60 * 1000;
          const latestActive = hudTrack.activeMsTotal;
          while (hudTrack.rateSamples.length > 2) {
            const first = hudTrack.rateSamples[0];
            if (latestActive - Number(first.activeMs || 0) <= keepActive) break;
            hudTrack.rateSamples.shift();
          }
        }

        if (!hudTrack.active) {
          hudTrack.active = true;
          hudTrack.activeMsTotal = 0;
          hudTrack.lastActiveTickAt = Date.now();
          hudTrack.rateSamples = [];
          hudTrack.lastRateSampleAt = 0;
          if (gotGold) hudTrack.lastGold = data.gold;
          if (gotLevel) hudTrack.lastLevel = data.level;
          if (gotExp) hudTrack.lastExp = data.exp;
          if (gotExpToNext) hudTrack.lastExpToNext = data.exp_to_next;
        } else {
          if (gotGold) {
            const deltaGold = data.gold - hudTrack.lastGold;
            if (activeNow && Number.isFinite(deltaGold) && deltaGold > 0) hudTrack.goldGain += deltaGold;
            hudTrack.lastGold = data.gold;
          }

          if (gotLevel && data.level !== hudTrack.lastLevel) {
            console.log(`[HUD] Level up: ${hudTrack.lastLevel} → ${data.level}`);
            hudTrack.lastLevel = data.level;
          }

          if (gotExp || gotExpToNext) {
            let xpDelta = 0;
            if (gotExp && gotExpToNext) {
              const prevProgress = hudTrack.lastExp;
              const prevToNext = hudTrack.lastExpToNext;
              const nowProgress = data.exp;
              const nowToNext = data.exp_to_next;
              if (nowToNext === prevToNext) {
                xpDelta = nowProgress - prevProgress;
              } else if (nowToNext < prevToNext) {
                xpDelta = (prevToNext - prevProgress) + nowProgress;
              }
              hudTrack.lastExp = nowProgress;
              hudTrack.lastExpToNext = nowToNext;
            }
            if (activeNow && Number.isFinite(xpDelta) && xpDelta > 0) {
              hudTrack.xpGain += xpDelta;
            }
          }
        }
      }

      function start() {
        if (domPollInterval) return;
        // Poll DOM every 500ms - fast, local, zero server impact!
        domPollInterval = setInterval(pollDOMForChanges, 500);
        console.log('[HUD] DOM tracking started - NO API CALLS!');
      }

      function stop() {
        if (!domPollInterval) return;
        clearInterval(domPollInterval);
        domPollInterval = null;
        console.log('[HUD] DOM tracking stopped');
      }

      // Start immediately
      setTimeout(start, 1000);

      // Expose controls
      window.__oaDOMTracking = { start, stop, readHudFromDOM };
    })();

    // OLD API POLLING SYSTEM - DISABLED
    // Keeping code for reference but not running it
    (function setupRatesPolling_DISABLED() {
      // DISABLED: Now using DOM scraping instead of API calls
      return;

      // Poll hud_state.php API for XP/Gold changes
      let pollInterval = null;
      let lastFetchTime = 0;
      let nextFetchAt = 0;

      function getRandomizedPollInterval() {
        const min = STEALTH_CONFIG.apiPollIntervalMin || 2000;
        const max = STEALTH_CONFIG.apiPollIntervalMax || 4000;
        return min + Math.random() * (max - min);
      }

      async function fetchHudState() {
        try {
          const res = await fetch('/api/hud_state.php', {
            method: 'GET',
            credentials: 'same-origin'
          });
          if (!res.ok) return null;
          const data = await res.json();
          if (!data || !data.success || !data.char) return null;
          return data.char;
        } catch (e) {
          return null;
        }
      }

      async function pollForChanges() {
        // Use randomized throttle to avoid predictable API call patterns
        const now = Date.now();
        if (now < nextFetchAt) return;

        // Set next fetch time with randomization
        const interval = getRandomizedPollInterval();
        nextFetchAt = now + interval;
        lastFetchTime = now;

        const data = await fetchHudState();
        if (!data) return;

        const gotGold = typeof data.gold === 'number';
        const gotLevel = typeof data.level === 'number';
        const gotExp = typeof data.exp === 'number';
        const gotExpToNext = typeof data.exp_to_next === 'number';

        if (!gotGold && !gotLevel && !gotExp && !gotExpToNext) return;

        const autoOnNow = !!autoModeForRates;
        const activeNow = autoOnNow && (function () {
          try {
            if (location.pathname !== "/game.php") return false;
            const tab = new URL(location.href).searchParams.get("tab") || "combat";
            if (tab !== "combat") return false;
            return true;
          } catch { return true; }
        })();

        // Track ACTIVE time only (combat tab + script enabled).
        const nowTs = Date.now();
        if (hudTrack.lastActiveTickAt == null) hudTrack.lastActiveTickAt = nowTs;
        if (activeNow) {
          const dt = nowTs - hudTrack.lastActiveTickAt;
          if (dt > 0 && dt < 60000 && Number.isFinite(dt)) hudTrack.activeMsTotal += dt;
        }
        hudTrack.lastActiveTickAt = nowTs;

        // Rate samples (throttled)
        const SAMPLE_MS = 2500;
        if (activeNow && (nowTs - (hudTrack.lastRateSampleAt || 0) >= SAMPLE_MS)) {
          hudTrack.lastRateSampleAt = nowTs;
          hudTrack.rateSamples.push({ t: nowTs, activeMs: hudTrack.activeMsTotal, xp: hudTrack.xpGain, gold: hudTrack.goldGain });
          // Keep ~30 min of active-time history
          const keepActive = 30 * 60 * 1000;
          const latestActive = hudTrack.activeMsTotal;
          while (hudTrack.rateSamples.length > 2) {
            const first = hudTrack.rateSamples[0];
            if (latestActive - Number(first.activeMs || 0) <= keepActive) break;
            hudTrack.rateSamples.shift();
          }
        }

        if (!hudTrack.active) {
          hudTrack.active = true;
          hudTrack.activeMsTotal = 0;
          hudTrack.lastActiveTickAt = Date.now();
          hudTrack.rateSamples = [];
          hudTrack.lastRateSampleAt = 0;
          if (gotGold) hudTrack.lastGold = data.gold;
          if (gotLevel) hudTrack.lastLevel = data.level;
          if (gotExp) hudTrack.lastExp = data.exp;
          if (gotExpToNext) hudTrack.lastExpToNext = data.exp_to_next;
        } else {
          if (gotGold) {
            const deltaGold = data.gold - hudTrack.lastGold;
            if (activeNow && Number.isFinite(deltaGold) && deltaGold > 0) hudTrack.goldGain += deltaGold;
            hudTrack.lastGold = data.gold;
          }

          if (gotLevel && gotExp) {
            const prevLevel = hudTrack.lastLevel;
            const prevExp = hudTrack.lastExp;
            const prevExpToNext = hudTrack.lastExpToNext;

            const currLevel = data.level;
            const currExp = data.exp;
            const currToNext = gotExpToNext ? data.exp_to_next : null;

            if (prevLevel === null) {
              hudTrack.lastLevel = currLevel;
              hudTrack.lastExp = currExp;
            } else {
              if (currLevel === prevLevel) {
                const candThreshold = (Number.isFinite(currExp) && Number.isFinite(prevExp)) ? (currExp - prevExp) : 0;
                const candRemaining =
                  (currToNext != null && prevExpToNext != null && Number.isFinite(currToNext) && Number.isFinite(prevExpToNext))
                    ? (prevExpToNext - currToNext)
                    : 0;

                let chosen = 0;
                let chosenMode = hudTrack.expMode;

                if (chosenMode === "remaining") {
                  chosen = candRemaining > 0 ? candRemaining : 0;
                  if (chosen === 0 && candThreshold > 0) { chosen = candThreshold; chosenMode = "threshold"; }
                } else if (chosenMode === "threshold") {
                  chosen = candThreshold > 0 ? candThreshold : 0;
                  if (chosen === 0 && candRemaining > 0) { chosen = candRemaining; chosenMode = "remaining"; }
                } else {
                  if (candRemaining > 0 || candThreshold > 0) {
                    if (candRemaining > candThreshold) { chosen = candRemaining; chosenMode = "remaining"; }
                    else { chosen = candThreshold; chosenMode = "threshold"; }
                  }
                }

                if (activeNow && chosen > 0 && Number.isFinite(chosen)) {
                  hudTrack.xpGain += chosen;
                  hudTrack.expMode = chosenMode || hudTrack.expMode;
                }
              } else if (currLevel > prevLevel) {
                if (activeNow) {
                  let gain = 0;
                  if (hudTrack.expMode === "remaining") {
                    if (prevExpToNext != null && Number.isFinite(prevExpToNext) && prevExpToNext > 0) gain += prevExpToNext;
                  } else {
                    if (prevExpToNext != null && Number.isFinite(prevExpToNext) && Number.isFinite(prevExp)) {
                      const tail = prevExpToNext - prevExp;
                      if (tail > 0) gain += tail;
                    }
                  }
                  if (Number.isFinite(currExp) && currExp > 0) gain += currExp;
                  if (gain > 0) hudTrack.xpGain += gain;
                }
              } else if (currLevel < prevLevel) {
                hudTrack.xpGain = 0;
                hudTrack.expMode = null;
              }

              hudTrack.lastLevel = currLevel;
              hudTrack.lastExp = currExp;
            }
          }

          if (gotExpToNext) hudTrack.lastExpToNext = data.exp_to_next;
        }

        notifyStatsUpdated();
      }

      // Start polling
      pollInterval = setInterval(pollForChanges, 1000);

      // Initial poll
      setTimeout(pollForChanges, 500);

      console.log("[OA Script] XP/Gold tracking via hud_state.php API initialized.");
    })();

    function getStatsSummary() {
      const prof = getSelectedCombatProfile().label;

      const fights = fmtInt(stats.fightsStarted || 0);
      const attacks = fmtInt(stats.attacks || 0);
      const pots = fmtInt(stats.potionsUsed || 0);
      const revives = fmtInt(stats.revives || 0);
      const lbTotal = fmtInt(stats.beastTeleportsTotal || 0);
      const lbAuto = fmtInt(stats.beastTeleportsAuto || 0);
      const lbHotkey = fmtInt(stats.beastTeleportsHotkey || 0);
      const lbButton = fmtInt(stats.beastTeleportsButton || 0);

      let totalMs = stats.autoCombatTotalMs || 0;
      if (stats.autoCombatLastEnabledAt != null && autoModeForRates) totalMs += Date.now() - stats.autoCombatLastEnabledAt;
      const hours = totalMs / 3600000;
      const acStr = fmtNumber(hours, 2, 2);

      const { xpPerHour, goldPerHour } = getRuntimeRates();
      const xpStr = fmtNumber(xpPerHour, 0, 0);
      const goldStr = fmtNumber(goldPerHour, 0, 0);

      return [
        `Profile ${prof}`,
        `Fights ${fights} · Attacks ${attacks}`,
        `Pots ${pots} · Revives ${revives}`,
        `LB ${lbTotal} (Auto ${lbAuto}, F2 ${lbHotkey}, Btn ${lbButton})`,
        `Auto ${acStr} h`,
        `XP/h ${xpStr} · Gold/h ${goldStr}`,
      ].join('\n');
    }

    function getCombatState() {
      const cs = window.CombatState;
      return cs && typeof cs === 'object' ? cs : null;
    }

    function parseCombatConfigFromDom() {
      try {
        const el = document.querySelector("[data-combat-config]");
        const raw = el?.getAttribute("data-combat-config");
        if (!raw) return null;
        // Attribute may be HTML-escaped in some environments.
        const decoded = raw.replace(/&quot;/g, '"').replace(/&#34;/g, '"');
        return JSON.parse(decoded);
      } catch (e) { return null; }
    }

    function getActionReadyAtFromDom() {
      const cfg = parseCombatConfigFromDom();
      const v = Number(cfg?.nextActionTsMs || cfg?.nextActionReadyAtMs || cfg?.nextActionReadyAt || 0);
      return Number.isFinite(v) ? v : 0;
    }

    function getCurrentLocationKey() {
      // CombatState.planeId may be missing on Map tab; fall back to HUD location card dataset.
      const cs = getCombatState();
      const card = document.getElementById("hud-location-card");
      const planeFromCard =
        card?.dataset?.planeId ||
        card?.getAttribute?.("data-plane-id") ||
        card?.getAttribute?.("data-planeid") ||
        card?.dataset?.plane ||
        "";
      const plane = String(cs?.planeId || planeFromCard || "").trim();
      let x = null, y = null;

      if (hudTrack && Number.isFinite(hudTrack.lastPosX) && Number.isFinite(hudTrack.lastPosY)) {
        x = hudTrack.lastPosX;
        y = hudTrack.lastPosY;
      } else {
        const dx = Number(card?.getAttribute("data-pos-x"));
        const dy = Number(card?.getAttribute("data-pos-y"));
        if (Number.isFinite(dx) && Number.isFinite(dy)) { x = dx; y = dy; }
      }

      if (!plane || x == null || y == null) return "";
      const xs = String(Math.max(0, Math.floor(Number(x)))).padStart(3, "0");
      const ys = String(Math.max(0, Math.floor(Number(y)))).padStart(3, "0");
      try { localStorage.setItem('oa_last_plane_cache_v1', String(plane||'').toLowerCase()); localStorage.setItem('oa_last_plane_cache_at_v1', String(Date.now())); } catch {}
      return `${xs},${plane.toLowerCase()},${ys}`;
    }

    function normalizeLocKey(locKey) {
      if (!locKey) return "";
      const s = String(locKey).trim();
      // Accept forms like "005,Olympus,035" or "005,Olympus,035!"
      const m = s.match(/(\d{1,3})\s*,\s*([A-Za-z_-]+)\s*,\s*(\d{1,3})/);
      if (!m) return s.toLowerCase();
      const x = String(parseInt(m[1], 10)).padStart(3, "0");
      const plane = String(m[2]).toLowerCase();
      const y = String(parseInt(m[3], 10)).padStart(3, "0");
      return `${x},${plane},${y}`;
    }

    function locMatches(a, b) {
      const na = normalizeLocKey(a);
      const nb = normalizeLocKey(b);
      if (!na || !nb) return false;

      // plane match can be strict or substring (olympus vs olympus)
      const pa = na.split(",")[1] || "";
      const pb = nb.split(",")[1] || "";
      const planeOk = (pa === pb) || pa.includes(pb) || pb.includes(pa);

      return planeOk && (na.split(",")[0] === nb.split(",")[0]) && (na.split(",")[2] === nb.split(",")[2]);
    }

    const BEAST_ONLY_PLANES = new Set([]); // disabled beast-only plane restrictions (allow AutoCombat in Underworld/Olympus)

    function getPlaneIdSafe() {
      const cs = getCombatState();
      if (cs && cs.planeId) return String(cs.planeId).toLowerCase();
      const card = document.getElementById("hud-location-card");
      const pid = card?.dataset?.planeId;
      return pid ? String(pid).toLowerCase() : null;
    }

    function isGameAutoCombatRunning() { return !!(window.AutoCombat && window.AutoCombat.isRunning); }

    function isGameAutoCombatEnabled() {
      const cs = getCombatState();
      const v = cs?.autoCombat?.enabled;
      if (typeof v === "boolean") return v;
      return loadGameAutoWanted();
    }

    function findGameAutoCombatToggleEl() {
      const selectors = [
        "#auto-combat-button",
        "#autocombat-button",
        "#auto-combat-toggle",
        "[data-auto-combat-toggle]",
        "[data-autocombat-toggle]",
        'button[name="action"][value="toggle_auto_combat"]',
        'button[name="action"][value="auto_combat"]',
        'button[name="action"][value="start_auto_combat"]',
        'button[value="toggle_auto_combat"]',
        'button[value="start_auto_combat"]',
      ];
      for (const s of selectors) {
        const el = document.querySelector(s);
        if (el) return el;
      }

      // Heuristic scan (cached DOM may change; this is only used when restart needed)
      const candidates = Array.from(document.querySelectorAll("button, a, div[role='button']"));
      const wanted = candidates.find((el) => {
        const t = (el.getAttribute("title") || el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        return t.includes("auto combat") || (t.includes("auto") && t.includes("combat"));
      });
      return wanted || null;
    }

    function tryStartGameAutoCombat(reason) {
      try {
        if (window.AutoCombat && typeof window.AutoCombat.start === "function") {
          window.AutoCombat.start();
          console.log("[GameAuto] start() called", { reason });
          return true;
        }
      } catch {}

      // Before clicking toggle button, make sure auto is actually OFF
      // If it's already ON, clicking a toggle would turn it OFF (bad!)
      const labelEl = document.getElementById("auto-combat-label");
      if (labelEl) {
        const text = (labelEl.textContent || "").trim().toLowerCase();
        if (text.includes("on")) {
          console.log("[GameAuto] already on (detected via label), no action needed", { reason });
          return true;
        }
      }

      const el = findGameAutoCombatToggleEl();
      if (el && typeof el.click === "function") {
        el.click();
        console.log("[GameAuto] toggle clicked to turn ON", { reason });
        return true;
      }

      console.log("[GameAuto] unable to start (no API / button not found)", { reason });
      return false;
    }

    function tryStopGameAutoCombat(reason) {
      try {
        if (window.AutoCombat && typeof window.AutoCombat.stop === "function") {
          window.AutoCombat.stop();
          console.log("[GameAuto] stop() called", { reason });
          return true;
        }
      } catch {}

      const el = findGameAutoCombatToggleEl();
      if (el && typeof el.click === "function") {
        el.click();
        console.log("[GameAuto] toggle clicked (stop)", { reason });
        return true;
      }

      console.log("[GameAuto] unable to stop (no API / button not found)", { reason });
      return false;
    }

    function isDelayBarReady() {
  const fill = document.getElementById("combat-delay-fill");
  if (!fill) return true;

  // Inline % if present.
  const w = (fill.style?.width || "").trim();
  const m = w.match(/([0-9.]+)%/);
  if (m) {
    const pct = parseFloat(m[1]);
    return pct <= 2; // treat <=2% as empty
  }

  // Layout-based fallback (handles builds that animate width without inline %).
  const parent = fill.parentElement;
  const fw = fill.getBoundingClientRect?.().width || 0;
  const pw = parent?.getBoundingClientRect?.().width || 0;

  // Some UIs keep a 1–8px "stub" even when empty; treat small widths as empty.
  if (fw <= 10) return true;

  if (pw > 0) {
    const ratio = fw / pw;
    return ratio <= 0.08; // <=8% considered empty-ish
  }

  return true;
}

    function getDelayMsRemaining() {
  const cs = getCombatState();
  if (!cs) return 0;
  let readyAt = Number(cs.nextActionReadyAt || 0);
  if (!readyAt || !Number.isFinite(readyAt)) return 0;

  // Some builds send seconds; normalize to ms.
  if (readyAt < 1e12) readyAt *= 1000;

  const diff = readyAt - Date.now();
  // Guard against clock skew / stale values.
  if (diff > 60_000) return 0;
  return diff > 0 ? diff : 0;
}

    function isCombatReady() {
      const cs = getCombatState();
      if (!cs) return isDelayBarReady();
      if (cs.delayActive) return false;
      const remaining = getDelayMsRemaining();
      if (remaining > 0) return false;
      if (cs.canAttack === false) return false;
      return true;
    }

    // Teleports should not depend on CombatState.canAttack (often false on non-combat tabs).
    // This checks only the "red bar" delay / nextActionReadyAt and whether you're currently in combat.
    // Teleports should not depend on CombatState.canAttack (often false on non-combat tabs).
// Prefer the actual teleport button's enabled state when present (most reliable).
function isTeleportReady() {
  const cs = getCombatState();
  if (cs && cs.inCombat) return false;

  const tab = getCurrentTab();

  // On Map: require the actual "Ride to the Last Beast" button to be present + clickable.
  if (tab === "map") {
    const form = document.querySelector('form input[name="action"][value="teleport_last_beast"]')?.closest('form') || null;
    const btn = form?.querySelector('button[type="submit"]') || null;
    return !!(btn && isElementClickable(btn));
  }

  // Off-Map: we can still decide if we're ready to switch to Map and submit.
  if (cs && cs.delayActive) return false;
  if (getDelayMsRemaining() > 0) return false;
  return isDelayBarReady();
}

    const state = {
      enabled: false,
      holdForBeastTeleport: false,
      loopTimer: null,
      lastClickAt: 0,
      lastManualCombatClickAt: 0,
      lastHealAt: 0,
      healInFlight: false,
      copiedCode: null,
      nextEligibleActionAt: 0,
    };

    const HEAL_MISSING_HP = 500;

    const AUTO_COMBAT_STORE_KEY = "oa_auto_combat_enabled_v1";
    const GAME_AUTO_WANTED_KEY = "oa_game_autocombat_wanted_v1";

    const GAME_AUTO_FORCE_KEY = "oa_game_autocombat_force_v1";

    function loadGameAutoForce() {
      try {
        const raw = localStorage.getItem(GAME_AUTO_FORCE_KEY);
        if (!raw) return false;
        return Boolean(JSON.parse(raw));
      } catch { return false; }
    }
    function saveGameAutoForce(v) { try { localStorage.setItem(GAME_AUTO_FORCE_KEY, JSON.stringify(!!v)); } catch {} }
const PIN_COMBAT_UI_KEY = "oa_pin_combat_ui_v1";
    const LAYOUT_ENABLED_KEY = "oa_layout_enabled_v1";
    const LAYOUT_STORE_KEY = "oa_layout_panels_v1";
    const KINGDOM_WIDGET_ENABLED_KEY = "oa_kingdom_widget_enabled_v1";

    function loadAutoCombatEnabled() {
      try {
        const raw = localStorage.getItem(AUTO_COMBAT_STORE_KEY);
        if (!raw) return false;
        return Boolean(JSON.parse(raw));
      } catch {
        return false;
      }
    }
    function saveAutoCombatEnabled(v) { try { localStorage.setItem(AUTO_COMBAT_STORE_KEY, JSON.stringify(!!v)); } catch {} }

    function loadGameAutoWanted() {
      try {
        const raw = localStorage.getItem(GAME_AUTO_WANTED_KEY);
        if (!raw) return false;
        return Boolean(JSON.parse(raw));
      } catch { return false; }
    }
    function saveGameAutoWanted(v) { try { localStorage.setItem(GAME_AUTO_WANTED_KEY, JSON.stringify(!!v)); } catch {} }

    function loadPinCombatUiEnabled() {
      try {
        const raw = localStorage.getItem(PIN_COMBAT_UI_KEY);
        if (!raw) return false;
        return Boolean(JSON.parse(raw));
      } catch { return false; }
    }
    function savePinCombatUiEnabled(v) { try { localStorage.setItem(PIN_COMBAT_UI_KEY, JSON.stringify(!!v)); } catch {} }

    const pinCombatUi = {
      enabled: false,
      styleEl: null,
      enforcerTimer: null,
    };

    function ensurePinStyle() {
      if (pinCombatUi.styleEl) return;
      const style = document.createElement("style");
      style.id = "oa-pin-combat-ui-style";
      style.textContent = `
        #combat-main-button.oa-pin-combat-fixed {
          position: fixed !important;
          right: 14px !important;
          bottom: 14px !important;
          z-index: 2147483646 !important;
        }
        #combat-delay-indicator.oa-pin-combat-fixed {

          position: fixed !important;
          right: 14px !important;
          bottom: 62px !important;
          width: min(340px, calc(100vw - 28px)) !important;
          z-index: 2147483645 !important;
          pointer-events: none !important;
        }
        /* keep the internal bar visible even if parent pointer-events is none */
        #combat-delay-indicator.oa-pin-combat-fixed * {
          pointer-events: none !important;
        }

        [data-combat-config].oa-pin-combat-panel {
          position: fixed !important;
          right: 14px !important;
          bottom: 108px !important;
          width: min(520px, calc(100vw - 28px)) !important;
          max-height: min(420px, calc(100vh - 140px)) !important;
          overflow: auto !important;
          z-index: 2147483644 !important;
        }
      `;
      document.documentElement.appendChild(style);
      pinCombatUi.styleEl = style;
    }

    function applyPinCombatUi(enabled) {
      pinCombatUi.enabled = !!enabled;
      ensurePinStyle();

      const btn = document.getElementById("combat-main-button");
      const delay = document.getElementById("combat-delay-indicator");
      const panel = document.querySelector("[data-combat-config]") || btn?.closest?.("[data-combat-config]") || null;

      if (btn) {
        if (pinCombatUi.enabled) btn.classList.add("oa-pin-combat-fixed");
        else btn.classList.remove("oa-pin-combat-fixed");
      }

      if (pinCombatUi.enabled) {
        if (!pinCombatUi.enforcerTimer) {
          pinCombatUi.enforcerTimer = setInterval(() => {
            if (!pinCombatUi.enabled) return;
            try { applyPinCombatUi(true); } catch {}
          }, 1000);
        }
      } else {
        if (pinCombatUi.enforcerTimer) {
          clearInterval(pinCombatUi.enforcerTimer);
          pinCombatUi.enforcerTimer = null;
        }
      }

      if (panel) {
        if (pinCombatUi.enabled) panel.classList.add("oa-pin-combat-panel");
        else panel.classList.remove("oa-pin-combat-panel");
      }
    }

    // ------------------------------
    // Combat Profiles
    // ------------------------------
    const COMBAT_PROFILE_KEY = "oa_combat_profile_v2";
    const COMBAT_PROFILES = {
      fast: { id: "fast", label: "Fast" },
      mid: { id: "mid", label: "Mid" },
      human: { id: "human", label: "Human" },
      humanized: { id: "humanized", label: "Humanized" },
    };

    function loadCombatProfileId() {
      try {
        const raw = localStorage.getItem(COMBAT_PROFILE_KEY);
        if (!raw) return "mid";
        const id = String(JSON.parse(raw));
        return COMBAT_PROFILES[id] ? id : "mid";
      } catch {
        return "mid";
      }
    }
    function saveCombatProfileId(id) {
      try {
        const safe = COMBAT_PROFILES[id] ? id : "mid";
        localStorage.setItem(COMBAT_PROFILE_KEY, JSON.stringify(safe));
      } catch {}
    }

    let combatProfileId = loadCombatProfileId();
    function setCombatProfileId(id) {
      const safe = COMBAT_PROFILES[id] ? id : "mid";
      combatProfileId = safe;
      saveCombatProfileId(safe);
    }
    function getSelectedCombatProfile() {
      return COMBAT_PROFILES[combatProfileId] || COMBAT_PROFILES.mid;
    }

    function randInt(min, max) {
      const lo = Math.min(min, max);
      const hi = Math.max(min, max);
      return Math.floor(lo + Math.random() * (hi - lo + 1));
    }
    function chance(p01) {
      return Math.random() < Math.max(0, Math.min(1, p01));
    }

    // Humanized timing: uses a bell-curve distribution instead of flat random
    // Most delays cluster around the center with occasional fast/slow outliers
    function randGaussian(mean, stdDev) {
      // Box-Muller transform for normal distribution
      let u1 = Math.random();
      let u2 = Math.random();
      if (u1 < 0.0001) u1 = 0.0001; // avoid log(0)
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return Math.round(mean + z * stdDev);
    }
    function clampMs(val, min, max) {
      return Math.max(min, Math.min(max, Math.round(val)));
    }

    // Per-session "rhythm" for the humanized profile
    // Each session gets slightly different base timings to simulate different moods/alertness
    const humanizedSession = {
      baseFactor: 0.85 + Math.random() * 0.3, // 0.85-1.15x speed factor for this session
      fatigueStart: Date.now(),
      fightCount: 0,
    };

    function getProfileCfg() {
      switch (combatProfileId) {
        case "fast":
          return {
            clickCooldownMs: 15,
            baseTickMs: 35,
            tickJitterMs: 20,
            readyPaddingMs: 10,
            healCooldownMs: 350,
            reactionMinMs: 0,
            reactionMaxMs: 0,
            microPauseChance: 0,
            microPauseMinMs: 0,
            microPauseMaxMs: 0,
          };
        case "humanized": {
          // Dynamic humanized profile - simulates a focused but human player
          const sessionMinutes = (Date.now() - humanizedSession.fatigueStart) / 60000;

          // STEALTH: Variable timing based on time of day
          const hour = new Date().getHours();
          const isLateNight = hour < 6 || hour > 22; // Slower late night
          const isPrimetime = hour >= 18 && hour <= 22; // Focused evening

          let timeOfDayFactor = 1.0;
          if (isLateNight) timeOfDayFactor = 1.25; // 25% slower when tired
          else if (isPrimetime) timeOfDayFactor = 0.92; // 8% faster when alert

          // Fatigue: very mild slowdown over time (caps at ~1.15x after 90 min)
          const fatigueFactor = Math.min(1.15, 1 + sessionMinutes * 0.0017) * timeOfDayFactor;

          // Session rhythm factor
          const rhythm = humanizedSession.baseFactor;

          // Base reaction: gaussian centered around 200ms - a focused player reacting to the button
          // Most clicks land 120-350ms, occasional slow one up to 500ms
          const baseReaction = clampMs(randGaussian(200, 60) * rhythm * fatigueFactor, 80, 550);

          // STEALTH: More varied distraction patterns with configurable chances
          // Micro-pause: glancing at chat, adjusting
          // Distraction: checking phone/discord
          // Long pause: bio break, getting drink
          const distractionRoll = Math.random();
          let distractionMs = 0;

          const longChance = STEALTH_CONFIG.longPauseChance || 0.001;
          const shortChance = STEALTH_CONFIG.shortBreakChance || 0.008;
          const microChance = STEALTH_CONFIG.microPauseChance || 0.03;

          if (distractionRoll < longChance) {
            distractionMs = randInt(5000, 10000); // Very rare long pause
            slog('Stealth', 'Long pause:', (distractionMs/1000).toFixed(1) + 's');
          } else if (distractionRoll < longChance + shortChance) {
            distractionMs = randInt(2000, 5000); // Short break
            slog('Stealth', 'Short break:', (distractionMs/1000).toFixed(1) + 's');
          } else if (distractionRoll < longChance + shortChance + microChance) {
            distractionMs = randInt(500, 1500); // Quick glance away
          }

          return {
            clickCooldownMs: clampMs(60 * rhythm, 40, 100),
            baseTickMs: clampMs(90 * rhythm, 60, 150),
            tickJitterMs: clampMs(120 * rhythm, 70, 200),
            readyPaddingMs: clampMs(30 * rhythm, 15, 60),
            healCooldownMs: clampMs(700 * rhythm * fatigueFactor, 400, 1100),
            reactionMinMs: clampMs(baseReaction * 0.6, 50, 300),
            reactionMaxMs: clampMs(baseReaction * 1.4, 150, 600),
            microPauseChance: 0, // Handled via distractionMs instead
            microPauseMinMs: 0,
            microPauseMaxMs: 0,
            _distractionMs: distractionMs,
            _fatigueFactor: fatigueFactor,
          };
        }
        case "human":
          return {
            clickCooldownMs: 140,
            baseTickMs: 140,
            tickJitterMs: 220,
            readyPaddingMs: 60,
            healCooldownMs: 900,
            reactionMinMs: 180,
            reactionMaxMs: 650,
            microPauseChance: 0.035,
            microPauseMinMs: 600,
            microPauseMaxMs: 1400,
          };
        case "mid":
        default:
          return {
            clickCooldownMs: 50,
            baseTickMs: 90,
            tickJitterMs: 60,
            readyPaddingMs: 20,
            healCooldownMs: 600,
            reactionMinMs: 40,
            reactionMaxMs: 160,
            microPauseChance: 0.01,
            microPauseMinMs: 250,
            microPauseMaxMs: 600,
          };
      }
    }

    function scheduleCombatWake(ms) {
  // Kept for compatibility; RAF loop handles responsiveness.
  // Still allow a very small one-shot wake if loop is not yet running.
  if (!state.enabled) return;
  scheduleLoop();
}

function isCombatDelayClear() {
  const cs = getCombatState();

  // Early fire mode: use server timer directly instead of waiting for visual bar
  const earlyFireMs = STEALTH_CONFIG.earlyFireMs || 0;
  if (earlyFireMs > 0) {
    // Read exact server timestamp from DOM or CombatState
    let readyAt = Number(cs?.nextActionReadyAt || 0);
    if (readyAt > 0) {
      // Normalize seconds → ms if needed
      if (readyAt < 1e12) readyAt *= 1000;
      const remaining = readyAt - Date.now();
      // Act earlyFireMs before server is ready
      if (remaining > earlyFireMs) return false;
      // Close enough - fire early!
      if (remaining > 0) {
        slog('EarlyFire', `Firing ${remaining.toFixed(0)}ms early (earlyFireMs=${earlyFireMs})`);
      }
      // Still apply stealth reaction delay on top
      if (STEALTH_CONFIG.enabled) {
        const now = Date.now();
        if (!state._lastDelayCompleteAt) {
          state._lastDelayCompleteAt = now;
          const delayMin = STEALTH_CONFIG.redBarDelayMin || 0;
          const delayMax = STEALTH_CONFIG.redBarDelayMax || 10;
          const reactionDelay = delayMin + Math.random() * (delayMax - delayMin);
          state._delayCompleteBuffer = now + reactionDelay;
          return false;
        }
        if (now < state._delayCompleteBuffer) return false;
      }
      return true;
    }
    // If no server timer available, fall through to visual bar check
  }

  // Standard mode: wait for visual bar to drain + cs.delayActive
  if (cs && cs.delayActive) return false;

  const barReady = isDelayBarReady();

  // STEALTH: Don't click instantly when bar completes - add human reaction buffer
  // APPLIES TO ALL PROFILES (instant/fast/humanized) - stealth is non-negotiable
  if (barReady && STEALTH_CONFIG.enabled) {
    const now = Date.now();
    if (!state._lastDelayCompleteAt) {
      state._lastDelayCompleteAt = now;
      // Human reaction: configurable delay after noticing bar is done
      const delayMin = STEALTH_CONFIG.redBarDelayMin || 30;
      const delayMax = STEALTH_CONFIG.redBarDelayMax || 100;
      const reactionDelay = delayMin + Math.random() * (delayMax - delayMin);
      state._delayCompleteBuffer = now + reactionDelay;
      slog('Stealth', `Red bar completed, reaction delay: ${reactionDelay.toFixed(0)}ms`);
      return false;
    }

    if (now < state._delayCompleteBuffer) {
      return false; // Still in reaction buffer
    }
  }

  return barReady;
}

function ensureCombatActionReady() {
  const now = Date.now();

  // Hard guard: prevents double-sending the same action before the server/UI reacts.
  if (now < (state._serverAckGuardUntil || 0)) return false;

  // Still keep the delay-bar safety.
  if (!isCombatDelayClear()) return false;

  return true;
}

function readCombatUiSnapshot() {
  const btn = document.getElementById("combat-main-button");
  const txt = (btn?.textContent || "").trim();
  const clickable = !!btn && isElementClickable(btn);

  // Delay fill ratio (0..1). Some builds don't update inline %, so also use layout width.
  let fill = 0;
  const fillEl = document.getElementById("combat-delay-fill");
  if (fillEl) {
    const w = (fillEl.style?.width || "").trim();
    const m = w.match(/([0-9.]+)%/);
    if (m) {
      fill = Math.max(0, Math.min(1, parseFloat(m[1]) / 100));
    } else {
      const parent = fillEl.parentElement;
      const fw = fillEl.getBoundingClientRect?.().width || 0;
      const pw = parent?.getBoundingClientRect?.().width || 0;
      if (pw > 0) fill = Math.max(0, Math.min(1, fw / pw));
    }
  }

  const rem = Math.max(0, Number(getDelayMsRemaining() || 0));
  const cs = getCombatState();
  const delayActive = !!(cs && cs.delayActive);

  return { txt, clickable, fill, rem, delayActive };
}

function isActionAcked(prevSnap, curSnap) {
  if (!prevSnap || !curSnap) return false;

  // Delay starts (best signal)
  if (curSnap.delayActive) {
    // STEALTH: Reset reaction buffers when new delay starts
    if (state._lastDelayCompleteAt) {
      state._lastDelayCompleteAt = null;
      state._delayCompleteBuffer = 0;
    }
    // Also reset button text change tracking for next cycle
    state._buttonReadyAfter = null;
    state._buttonTextChangedAt = null;

    return true;
  }
  if (curSnap.rem > 0) return true;
  if (curSnap.fill > 0.002) return true;

  // Button re-render / state change
  if (prevSnap.txt && curSnap.txt && prevSnap.txt !== curSnap.txt) return true;
  if (prevSnap.clickable && !curSnap.clickable) return true;

  return false;
}

function clearInFlightIfAcked() {
  if (!state._actionInFlight) return false;

  const cur = readCombatUiSnapshot();
  const prev = state._actionPrevSnap;

  const age = Date.now() - (state._actionInFlightAt || 0);
  const acked = isActionAcked(prev, cur);

  if (acked || age > 140) {
    state._actionInFlight = false;
    state._actionInFlightAt = 0;
    state._actionPrevSnap = null;

    // If we saw a real UI/server ack, unlock immediately.
    // If we timed out, keep a short lock to avoid spam on slow/odd UI states.
    state._combatBtnLockUntil = acked ? 0 : (Date.now() + 90);
    return true;
  }

  return false;
}

function clickCombatAction(el) {
  if (!el) return false;

  const now = Date.now();
  const isMain = (el.id === "combat-main-button");

  if (isMain) {
    // Smooth lock: prevents double-taps without waiting for a UI "ack" (which caused fast/hang cycles).
    const label = (el.textContent || "").trim();

    let lockMs = 180;
    if (label === "Switch Target") lockMs = 160;
    else if (label === "Start (F)" || label === "Duel (F)") lockMs = 240;
    else if (label === "Attack (A)" || label === "Duel Attack (A)") lockMs = 180;

    const minGap = 140; // absolute minimum gap between main button clicks
    if (now - (state._mainBtnLastClickAt || 0) < minGap) return false;

    if (now < (state._combatBtnLockUntil || 0)) return false;

    state._mainBtnLastClickAt = now;
    state._combatBtnLockUntil = now + lockMs;

    // We no longer rely on ack-based in-flight gating; keep fields cleared.
    state._actionInFlight = false;
    state._actionInFlightAt = 0;
    state._actionPrevSnap = null;
  }

  safeClick(el);

  // Configurable guard delays for server/UI reaction
  const serverGuard = STEALTH_CONFIG.serverAckGuardMs || 80;
  const actionDelay = STEALTH_CONFIG.actionEligibleDelayMs || 35;

  state._serverAckGuardUntil = Math.max(state._serverAckGuardUntil || 0, now + serverGuard);
  state.nextEligibleActionAt = Math.max(state.nextEligibleActionAt || 0, now + actionDelay);

  return true;
}

function gateNextActionAfterWork() {
      const cfg = getProfileCfg();
      const now = Date.now();

      let extra = 0;
      if (cfg.reactionMaxMs > 0) extra += randInt(cfg.reactionMinMs, cfg.reactionMaxMs);
      if (cfg.microPauseChance > 0 && chance(cfg.microPauseChance)) extra += randInt(cfg.microPauseMinMs, cfg.microPauseMaxMs);

      // Humanized distraction delay (computed fresh in getProfileCfg each call)
      if (cfg._distractionMs > 0) extra += cfg._distractionMs;

      // Track fight count for humanized fatigue
      if (combatProfileId === "humanized") humanizedSession.fightCount++;

      state.nextEligibleActionAt = Math.max(state.nextEligibleActionAt || 0, now + extra);
    }

    window.__oaCombatProfile = {
      get: () => ({ ...getSelectedCombatProfile(), cfg: getProfileCfg() }),
      set: (id) => setCombatProfileId(id),
      list: () => Object.values(COMBAT_PROFILES).map(p => ({ id: p.id, label: p.label })),
    };

    // Expose state for external UI (auto combat button etc.)
    window.__oaState = state;

    const log = (m) => console.log(`[AutoCombat] ${m}`);

    function safeClick(el) {
      const now = Date.now();
      const cfg = getProfileCfg();
      if (now - state.lastClickAt < cfg.clickCooldownMs) return;
      if (now - state.lastManualCombatClickAt < 200) return;
      state.lastClickAt = now;

      // STEALTH MODE: Use keyboard hotkeys instead of clicking
      if (STEALTH_CONFIG.useKeyboard && el && el.id === 'combat-main-button') {
        const label = (el.textContent || '').trim();
        let hotkey = null;

        // Map button labels to their hotkeys
        if (label.includes('Start') || label.includes('Duel')) {
          hotkey = 'f'; // Start (F) or Duel (F)
        } else if (label.includes('Attack')) {
          hotkey = 'a'; // Attack (A) or Duel Attack (A)
        } else if (label.includes('Revive')) {
          hotkey = 'r'; // Revive (R)
        }

        if (hotkey) {
          // Simulate human mistake occasionally - press wrong key then correct one
          if (shouldMakeMistake()) {
            const wrongKeys = ['q', 'w', 'e', 's', 'd', 'g'];
            const wrongKey = wrongKeys[Math.floor(Math.random() * wrongKeys.length)];
            slog('Stealth', `Human mistake: pressing ${wrongKey} instead of ${hotkey}`);
            simulateKeyPress(wrongKey);
            // Realize mistake and press correct key 100-300ms later
            setTimeout(() => {
              slog('Stealth', `Correcting to ${hotkey}`);
              simulateKeyPress(hotkey);
            }, 100 + Math.random() * 200);
          } else {
            slog('Stealth', `Using hotkey: ${hotkey.toUpperCase()} for "${label}"`);
            simulateKeyPress(hotkey);
          }
          return;
        }
      }

      // Fallback to regular click if not a combat button or stealth disabled
      el.click();
    }

    function isElementClickable(el) {
  if (!el) return false;

  // Standard disabled states
  if (el.disabled) return false;
  if (el.matches?.(":disabled")) return false;

  const aria = (el.getAttribute && el.getAttribute("aria-disabled")) || "";
  if (String(aria).toLowerCase() === "true") return false;

  const dataDisabled = (el.getAttribute && (el.getAttribute("data-disabled") || el.getAttribute("data-state"))) || "";
  if (String(dataDisabled).toLowerCase() === "disabled") return false;

  const cls = String(el.className || "");
  const badClassTokens = ["cursor-not-allowed","disabled","is-disabled","oa-button--disabled"];
  if (badClassTokens.some((t) => cls.includes(t))) return false;

  const s = getComputedStyle(el);
  if (s.display === "none" || s.visibility === "hidden") return false;
  if (s.pointerEvents === "none") return false;

  return true;
}

function isOnScreenAndTop(el) {
      if (!isElementClickable(el)) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) return false;
      if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return false;
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0" || s.pointerEvents === "none") return false;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      return !!top && (top === el || el.contains(top));
    }

    function isVisible(el) {
      if (!isElementClickable(el)) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return false;
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0" || s.pointerEvents === "none") return false;
      return true;
    }
    const panelLayout = {
      enabled: (function () {
        try {
          const raw = localStorage.getItem(LAYOUT_ENABLED_KEY);
          if (!raw) return false;
          return Boolean(JSON.parse(raw));
        } catch { return false; }
      })(),
      positions: (function () {
        try {
          const raw = localStorage.getItem(LAYOUT_STORE_KEY);
          if (!raw) return {};
          const parsed = JSON.parse(raw);
          return parsed && typeof parsed === "object" ? parsed : {};
        } catch { return {}; }
      })(),
      panels: new Map(), // id -> { wrap, body, title, target, origParent, origNext }
      styleEl: null,
      timer: null,
    };
    const kingdomWidget = {
      enabled: (function () {
        try {
          const raw = localStorage.getItem(KINGDOM_WIDGET_ENABLED_KEY);
          if (!raw) return false;
          return Boolean(JSON.parse(raw));
        } catch { return false; }
      })(),
      root: null,
      body: null,
      statusEl: null,
      lastLoadedAt: 0,
      inFlight: null,
    };

    function saveKingdomWidgetEnabled(v) { try { localStorage.setItem(KINGDOM_WIDGET_ENABLED_KEY, JSON.stringify(!!v)); } catch {} }

    function ensurePanelStage() {
      let stage = document.getElementById("oa-panel-stage");
      if (stage) return stage;
      stage = document.createElement("div");
      stage.id = "oa-panel-stage";
      stage.style.display = "none";
      document.body.appendChild(stage);
      return stage;
    }

    function setKingdomStatus(msg) {
      if (!kingdomWidget.statusEl) return;
      kingdomWidget.statusEl.textContent = msg || "";
      kingdomWidget.statusEl.style.display = msg ? "" : "none";
    }

    function ensureKingdomWidget() {
      if (kingdomWidget.root && document.contains(kingdomWidget.root)) return kingdomWidget.root;

      const stage = ensurePanelStage();

      const root = document.createElement("div");
      root.id = "oa-kingdom-widget-root";
      Object.assign(root.style, { padding: "8px" });

      const top = document.createElement("div");
      Object.assign(top.style, {
        display: "flex",
        gap: "8px",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "8px",
        flexWrap: "wrap",
      });

      const left = document.createElement("div");
      left.textContent = "Kingdom";
      Object.assign(left.style, { font: "800 11px/1 system-ui, -apple-system, Segoe UI, sans-serif", color: "#fde68a" });

      const status = document.createElement("div");
      Object.assign(status.style, {
        font: "600 11px/1.2 system-ui, -apple-system, Segoe UI, sans-serif",
        color: "#cbd5f5",
        opacity: "0.95",
        display: "none",
        flex: "1 1 auto",
        minWidth: "140px",
      });

      const right = document.createElement("div");
      Object.assign(right.style, { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" });

      const refreshBtn = document.createElement("button");
      refreshBtn.type = "button";
      refreshBtn.textContent = "Refresh";
      Object.assign(refreshBtn.style, {
        font: "700 11px/1 system-ui, -apple-system, Segoe UI, sans-serif",
        padding: "4px 10px",
        borderRadius: "999px",
        background: "rgba(148,163,184,0.15)",
        border: "1px solid rgba(148,163,184,0.45)",
        color: "#e5e7eb",
        cursor: "pointer",
      });

      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.textContent = "Open";
      Object.assign(openBtn.style, {
        font: "700 11px/1 system-ui, -apple-system, Segoe UI, sans-serif",
        padding: "4px 10px",
        borderRadius: "999px",
        background: "rgba(59,130,246,0.14)",
        border: "1px solid rgba(148,163,184,0.45)",
        color: "#e5e7eb",
        cursor: "pointer",
      });

      right.append(refreshBtn, openBtn);
      top.append(left, status, right);

      const body = document.createElement("div");
      Object.assign(body.style, { minHeight: "140px" });
      body.textContent = "Loading…";

      root.append(top, body);
      stage.appendChild(root);

      kingdomWidget.root = root;
      kingdomWidget.body = body;
      kingdomWidget.statusEl = status;

      openBtn.addEventListener("click", () => {
        const url = new URL(location.href);
        url.pathname = "/game.php";
        url.searchParams.set("tab", "kingdoms");
        location.href = url.toString();
      });

      refreshBtn.addEventListener("click", () => refreshKingdomWidget(true));

      return root;
    }

    function syncCsrfTokens(root) {
      const csrf = getCsrfToken();
      if (!csrf || !root) return;
      root.querySelectorAll('input[name="csrf_token"]').forEach((i) => { try { i.value = csrf; } catch {} });
    }

    function wireKingdomActionBar(root) {
      const mode = root.querySelector('select[name="kingdom_action_mode"]');
      if (!mode) return;

      const field = (name) => root.querySelector(`[data-kingdom-field="${name}"]`);

      const unit = field("unit");
      const direction = field("direction");
      const structure = field("structure");
      const amount = field("amount");

      const show = (el, on) => { if (!el) return; el.style.display = on ? "" : "none"; };

      const update = () => {
        const v = String(mode.value || "");
        if (v === "fortify") {
          show(unit, false);
          show(direction, true);
          show(structure, true);
          show(amount, true);
        } else if (v === "build_army") {
          show(unit, true);
          show(direction, false);
          show(structure, false);
          show(amount, true);
        } else {
          show(unit, false);
          show(direction, false);
          show(structure, false);
          show(amount, true);
        }
      };

      mode.addEventListener("change", update);
      update();
    }

    function formToUrlSearchParams(form) {
      const fd = new FormData(form);
      const p = new URLSearchParams();
      for (const [k, v] of fd.entries()) {
        p.append(k, typeof v === "string" ? v : String(v));
      }
      return p;
    }

    function wireKingdomFormSubmissions(root) {
      if (!root) return;
      if (root.__oaKingdomFormsWired) return;
      root.__oaKingdomFormsWired = true;

      root.addEventListener("submit", async (e) => {
        const form = e.target;
        if (!(form instanceof HTMLFormElement)) return;

        const actionInput = form.querySelector('input[name="action"]');
        const actionVal = String(actionInput?.value || "");
        if (!actionVal.startsWith("kingdom_")) return;

        e.preventDefault();
        e.stopPropagation();

        syncCsrfTokens(form);

        const submitBtn = form.querySelector('button[type="submit"], button:not([type])');
        if (submitBtn) submitBtn.disabled = true;

        setKingdomStatus("Submitting…");

        try {
          const body = formToUrlSearchParams(form);

          const res = await fetch("/game.php?tab=kingdoms", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body,
          });

          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          setKingdomStatus("Submitted ✔");
          setTimeout(() => setKingdomStatus(""), 2200);

          // Refresh stats/UI after server processes
          setTimeout(() => refreshKingdomWidget(true), 700);
        } catch (err) {
          setKingdomStatus(`Failed: ${err?.message || err}`);
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      }, true);
    }

    async function refreshKingdomWidget(force) {
      if (!kingdomWidget.enabled) return;
      const now = Date.now();
      if (!force && now - (kingdomWidget.lastLoadedAt || 0) < 30000) return;
      if (kingdomWidget.inFlight) return kingdomWidget.inFlight;

      const root = ensureKingdomWidget();
      const body = kingdomWidget.body;

      const run = (async () => {
        try {
          if (body) body.textContent = "Loading…";
          setKingdomStatus("Loading…");

          const res = await fetch("/game.php?tab=kingdoms", { credentials: "include" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const html = await res.text();

          const doc = new DOMParser().parseFromString(html, "text/html");
          const content = doc.querySelector('[data-kingdom-content="1"]');

          if (!content) {
            if (body) body.textContent = "Could not find kingdom content. Open Kingdoms once, then refresh.";
            setKingdomStatus("Not found");
            return;
          }

          const frag = document.createDocumentFragment();
          frag.appendChild(content.cloneNode(true));

          if (body) {
            body.innerHTML = "";
            body.appendChild(frag);
            syncCsrfTokens(body);
            wireKingdomActionBar(body);
            wireKingdomFormSubmissions(body);
          }

          kingdomWidget.lastLoadedAt = now;
          setKingdomStatus("");
        } catch (e) {
          if (body) body.textContent = `Failed to load: ${e?.message || e}`;
          setKingdomStatus("Load failed");
        } finally {
          kingdomWidget.inFlight = null;
        }
      })();

      kingdomWidget.inFlight = run;
      return run;
    }

    function savePanelLayoutEnabled(v) { try { localStorage.setItem(LAYOUT_ENABLED_KEY, JSON.stringify(!!v)); } catch {} }
    function savePanelPositions() { try { localStorage.setItem(LAYOUT_STORE_KEY, JSON.stringify(panelLayout.positions || {})); } catch {} }

    function getTabSafe() {
      try { return new URL(location.href).searchParams.get("tab") || "combat"; }
      catch { return "combat"; }
    }

    function ensurePanelLayoutStyle() {
      if (panelLayout.styleEl) return;

      const style = document.createElement("style");
      style.id = "oa-panel-layout-style";
      style.textContent = `
        .oa-panel-wrap {
          position: fixed;
          z-index: 999997;
          border-radius: 12px;
          background: rgba(15,23,42,0.86);
          border: 1px solid rgba(148,163,184,0.55);
          box-shadow: 0 12px 28px rgba(15,23,42,0.55);
          backdrop-filter: blur(10px);
          overflow: hidden;
          min-width: 240px;
          min-height: 140px;
          pointer-events: auto;
        }
        .oa-panel-titlebar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 6px 10px;
          font: 700 11px/1 system-ui, -apple-system, Segoe UI, sans-serif;
          letter-spacing: .03em;
          text-transform: uppercase;
          color: #a5b4fc;
          border-bottom: 1px solid rgba(148,163,184,0.35);
          user-select: none;
          cursor: grab;
        }
        .oa-panel-titlebar:active { cursor: grabbing; }
        .oa-panel-titlebar button {
          font: 700 11px/1 system-ui, -apple-system, Segoe UI, sans-serif;
          padding: 3px 8px;
          border-radius: 999px;
          background: rgba(148,163,184,0.15);
          border: 1px solid rgba(148,163,184,0.45);
          color: #e5e7eb;
          cursor: pointer;
          text-transform: none;
          letter-spacing: normal;
        }
        .oa-panel-body {
          height: calc(100% - 30px);
          overflow: auto;
          min-height: 0;
        }
        .oa-panel-resize {
          position: absolute;
          right: 2px;
          bottom: 2px;
          width: 16px;
          height: 16px;
          cursor: nwse-resize;
          opacity: 0.85;
        }
        .oa-panel-resize:before {
          content: "";
          position: absolute;
          right: 3px;
          bottom: 3px;
          width: 10px;
          height: 10px;
          border-right: 2px solid rgba(148,163,184,0.8);
          border-bottom: 2px solid rgba(148,163,184,0.8);
          border-radius: 2px;
        }
        .oa-panel-layout-hint {
          position: fixed;
          z-index: 999996;
          left: 12px;
          bottom: 12px;
          padding: 6px 10px;
          border-radius: 10px;
          background: rgba(15,23,42,0.86);
          border: 1px solid rgba(148,163,184,0.55);
          color: #e5e7eb;
          font: 600 11px/1.2 system-ui, -apple-system, Segoe UI, sans-serif;
          pointer-events: none;
          max-width: min(520px, calc(100vw - 24px));
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `;
      document.head.appendChild(style);
      panelLayout.styleEl = style;
    }

    function clampRect(rect) {
      const w = Math.max(240, Math.min(window.innerWidth - 12, rect.width));
      const h = Math.max(140, Math.min(window.innerHeight - 12, rect.height));
      const left = Math.max(6, Math.min(window.innerWidth - w - 6, rect.left));
      const top = Math.max(6, Math.min(window.innerHeight - h - 6, rect.top));
      return { left, top, width: w, height: h };
    }

    function getSavedRect(id, fallback) {
      const r = panelLayout.positions?.[id];
      if (r && Number.isFinite(r.left) && Number.isFinite(r.top) && Number.isFinite(r.width) && Number.isFinite(r.height)) {
        return clampRect(r);
      }
      return clampRect(fallback);
    }

    function setSavedRect(id, rect) {
      panelLayout.positions = panelLayout.positions || {};
      panelLayout.positions[id] = clampRect(rect);
      savePanelPositions();
    }

    function findChatPanelRoot() {
      // Use same selectors as beast detection but return a wrapper that includes input if possible.
      const msgContainer = document.querySelector('#chat-messages, #chat-log, [data-chat-messages], [data-chat], .chat-messages, .chat-log')
        || document.querySelector('[data-message-id], [data-messageid]')?.closest?.('#chat-messages, #chat-log, [data-chat-messages], [data-chat], .chat-messages, .chat-log');

      if (!msgContainer) return null;

      let root = msgContainer.closest?.('#chat, #chat-container, .chat, .chat-container, [data-chat-root]') || msgContainer.parentElement;
      for (let i = 0; i < 6 && root && root !== document.body; i++) {
        const hasEntry = !!root.querySelector('input[type="text"], textarea, [data-chat-input], #chat-input');
        if (hasEntry) break;
        root = root.parentElement;
      }
      return root || msgContainer;
    }

    function findCombatPanelRoot() {
      const btn = document.getElementById("combat-main-button");
      if (!btn) return null;

      const delayFill = document.getElementById("combat-delay-fill");

      // Prefer a named combat container if present (but try to keep it separate from the delay bar if possible)
      const named = btn.closest?.("#combat, #combat-container, #combat-tab, [data-combat], .combat, .combat-container");
      if (named) {
        if (!delayFill || !named.contains(delayFill)) return named;
      }

      // Smallest wrapper around the main combat controls, avoiding the delay bar when possible.
      let node = btn.parentElement;
      let best = null;

      for (let i = 0; i < 12 && node && node !== document.body; i++) {
        const hasSelect = !!node.querySelector?.("#monster-select");
        const hasBtn = !!node.querySelector?.("#combat-main-button");
        const okSize = node.getBoundingClientRect().height > 140;

        if (hasSelect && hasBtn && okSize) {
          const includesDelay = !!(delayFill && node.contains(delayFill));
          if (!includesDelay) return node;
          best = best || node; // fallback if delay can't be separated
        }
        node = node.parentElement;
      }

      return best || btn.closest("form") || btn.parentElement;
    }

    function createPanel(id, titleText, target, fallbackRect) {
      if (!target) return null;

      const existing = panelLayout.panels.get(id);
      if (existing && existing.target === target) return existing;

      ensurePanelLayoutStyle();

      const wrap = document.createElement("div");
      wrap.className = "oa-panel-wrap";
      wrap.dataset.panelId = id;

      const title = document.createElement("div");
      title.className = "oa-panel-titlebar";

      const name = document.createElement("div");
      name.textContent = titleText;

      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.textContent = "Reset";
      closeBtn.addEventListener("click", () => {
        // Reset this panel to its fallback rect (keep layout enabled)
        setSavedRect(id, fallbackRect);
        const r = getSavedRect(id, fallbackRect);
        wrap.style.left = `${r.left}px`;
        wrap.style.top = `${r.top}px`;
        wrap.style.width = `${r.width}px`;
        wrap.style.height = `${r.height}px`;
      });

      title.append(name, closeBtn);

      const body = document.createElement("div");
      body.className = "oa-panel-body";

      const resize = document.createElement("div");
      resize.className = "oa-panel-resize";

      wrap.append(title, body, resize);

      // Save original placement so we can restore
      const origParent = target.parentElement;
      const origNext = target.nextSibling;

      const prevStyle = {
        position: target.style.position,
        top: target.style.top,
        left: target.style.left,
        right: target.style.right,
        bottom: target.style.bottom,
        width: target.style.width,
        maxWidth: target.style.maxWidth,
        height: target.style.height,
      };

      body.appendChild(target);

      // If the target was fixed/sticky (top bar / nav), normalize so it can live inside a draggable panel.
      try {
        target.style.width = "100%";
        target.style.maxWidth = "100%";

        const cs = getComputedStyle(target);
        if (cs.position === "fixed" || cs.position === "sticky") {
          target.style.position = "relative";
          target.style.top = "";
          target.style.left = "";
          target.style.right = "";
          target.style.bottom = "";
        }

        if (id === "topstats" || id === "nav") {
          target.style.position = "relative";
          target.style.top = "";
          target.style.left = "";
          target.style.right = "";
          target.style.bottom = "";
        }
      } catch {}

      const r = getSavedRect(id, fallbackRect);
      wrap.style.left = `${r.left}px`;
      wrap.style.top = `${r.top}px`;
      wrap.style.width = `${r.width}px`;
      wrap.style.height = `${r.height}px`;

      document.body.appendChild(wrap);

      // Drag
      let dragging = false;
      let dragStartX = 0, dragStartY = 0, startLeft = 0, startTop = 0;

      const onDragDown = (e) => {
        if (e.button != null && e.button !== 0) return;
        dragging = true;
        const rect = wrap.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        e.preventDefault();
        e.stopPropagation();
        addEventListener("mousemove", onDragMove, true);
        addEventListener("mouseup", onDragUp, true);
      };

      const onDragMove = (e) => {
        if (!dragging) return;
        const left = startLeft + (e.clientX - dragStartX);
        const top = startTop + (e.clientY - dragStartY);
        const rect = clampRect({ left, top, width: wrap.offsetWidth, height: wrap.offsetHeight });
        wrap.style.left = `${rect.left}px`;
        wrap.style.top = `${rect.top}px`;
        e.preventDefault();
        e.stopPropagation();
      };

      const onDragUp = () => {
        if (!dragging) return;
        dragging = false;
        setSavedRect(id, wrap.getBoundingClientRect());
        removeEventListener("mousemove", onDragMove, true);
        removeEventListener("mouseup", onDragUp, true);
      };

      title.addEventListener("mousedown", onDragDown, true);

      // Resize
      let resizing = false;
      let resizeStartX = 0, resizeStartY = 0, startW = 0, startH = 0;

      const onResizeDown = (e) => {
        if (e.button != null && e.button !== 0) return;
        resizing = true;
        const rect = wrap.getBoundingClientRect();
        startW = rect.width;
        startH = rect.height;
        resizeStartX = e.clientX;
        resizeStartY = e.clientY;
        e.preventDefault();
        e.stopPropagation();
        addEventListener("mousemove", onResizeMove, true);
        addEventListener("mouseup", onResizeUp, true);
      };

      const onResizeMove = (e) => {
        if (!resizing) return;
        const w = startW + (e.clientX - resizeStartX);
        const h = startH + (e.clientY - resizeStartY);
        const rect = clampRect({ left: wrap.getBoundingClientRect().left, top: wrap.getBoundingClientRect().top, width: w, height: h });
        wrap.style.width = `${rect.width}px`;
        wrap.style.height = `${rect.height}px`;
        e.preventDefault();
        e.stopPropagation();
      };

      const onResizeUp = () => {
        if (!resizing) return;
        resizing = false;
        setSavedRect(id, wrap.getBoundingClientRect());
        removeEventListener("mousemove", onResizeMove, true);
        removeEventListener("mouseup", onResizeUp, true);
      };

      resize.addEventListener("mousedown", onResizeDown, true);

      const panel = { id, wrap, body, title, target, origParent, origNext, fallbackRect, prevStyle };
      panelLayout.panels.set(id, panel);
      return panel;
    }

    function removePanel(id) {
      const panel = panelLayout.panels.get(id);
      if (!panel) return;

      try {
        // Restore DOM placement
        if (panel.origParent) {
          if (panel.origNext && panel.origNext.parentElement === panel.origParent) panel.origParent.insertBefore(panel.target, panel.origNext);
          else panel.origParent.appendChild(panel.target);
        }
      } catch {}

      try {
        if (panel.prevStyle) {
          panel.target.style.position = panel.prevStyle.position;
          panel.target.style.top = panel.prevStyle.top;
          panel.target.style.left = panel.prevStyle.left;
          panel.target.style.right = panel.prevStyle.right;
          panel.target.style.bottom = panel.prevStyle.bottom;
          panel.target.style.width = panel.prevStyle.width;
          panel.target.style.maxWidth = panel.prevStyle.maxWidth;
          panel.target.style.height = panel.prevStyle.height;
        }
      } catch {}

      try { panel.wrap?.remove(); } catch {}
      panelLayout.panels.delete(id);
    }

    function ensureLayoutHint() {
      let hint = document.getElementById("oa-panel-layout-hint");
      if (hint) return hint;
      hint = document.createElement("div");
      hint.id = "oa-panel-layout-hint";
      hint.className = "oa-panel-layout-hint";
      hint.textContent = "Layout mode: drag panel title bars to move; drag corner to resize. Toggle off to restore default page layout.";
      document.body.appendChild(hint);
      return hint;
    }

    function removeLayoutHint() {
      try { document.getElementById("oa-panel-layout-hint")?.remove(); } catch {}
    }

    function findTopStatsPanelRoot() {
      // Player stats/location/map header area
      return (
        document.querySelector("#game-top-bar") ||
        document.querySelector("#oa-game-root #game-top-bar") ||
        document.querySelector("#oa-game-root header") ||
        document.querySelector("header")
      );
    }

    function findNavButtonsPanelRoot() {
      // The row of buttons/tabs that link to other pages (combat/inventory/shop/etc)
      const combatLink =
        document.querySelector('a[href*="game.php?tab=combat"]') ||
        document.querySelector('a[href*="tab=combat"]') ||
        document.querySelector("#nav-combat");

      if (combatLink) {
        const nav = combatLink.closest?.("nav, #game-nav, #nav, #nav-tabs, #game-tabs, .nav, .tabs");
        if (nav) return nav;

        const row = combatLink.closest?.("#game-tabs, #tab-bar, .tab-bar, .game-tabs");
        if (row) return row;

        return combatLink.parentElement;
      }

      const navs = Array.from(document.querySelectorAll("nav, .tabs, .tab-bar, #nav, #nav-tabs, #game-tabs")).slice(0, 12);
      for (const n of navs) {
        const links = n.querySelectorAll?.('a[href*="tab="]') || [];
        if (links.length >= 3) return n;
      }

      return null;
    }

    function findDelayBarPanelRoot() {
      // The red delay bar / indicator panel
      const indicator = document.getElementById("combat-delay-indicator");
      if (indicator) {
        const panel =
          indicator.closest?.('.oa-panel[data-combat-config]') ||
          indicator.closest?.(".oa-panel") ||
          indicator.parentElement;
        if (panel) return panel;
      }

      const fill = document.getElementById("combat-delay-fill");
      if (!fill) return null;

      return (
        fill.closest?.('.oa-panel[data-combat-config], #combat-delay, #combat-delay-bar, [data-combat-delay], .combat-delay') ||
        fill.parentElement
      );
    }

function applyPanelLayoutIfNeeded() {
      if (!panelLayout.enabled) return;
      if (location.pathname !== "/game.php") return;
      if (getTabSafe() !== "combat") return;

      ensureLayoutHint();

      const topstats = findTopStatsPanelRoot();
      const nav = findNavButtonsPanelRoot();
      const delay = findDelayBarPanelRoot();
      const combat = findCombatPanelRoot();
      const chat = findChatPanelRoot();

      // Avoid double-wrapping the same element.
      let navSafe = nav;
      let topSafe = topstats;
      let delaySafe = delay;

      if (navSafe && topSafe && navSafe === topSafe) navSafe = null;
      if (delaySafe && combat && delaySafe === combat) delaySafe = null;

      // NOTE: Skipping "topstats" panel - moving the header element triggers the game's security check.
      // The game detects DOM manipulation of this element and shows an empty botcheck modal.
      // createPanel("topstats", "Top", topSafe, { left: 12, top: 8, width: Math.min(880, window.innerWidth - 24), height: 96 });

      createPanel("nav", "Nav", navSafe, { left: 12, top: 112, width: Math.min(880, window.innerWidth - 24), height: 64 });
      createPanel("delay", "Delay", delaySafe, { left: 12, top: 184, width: 520, height: 90 });

      // Existing panels (optional to move):
      createPanel("combat", "Combat", combat, { left: 12, top: 284, width: Math.min(720, window.innerWidth - 24), height: Math.min(520, window.innerHeight - 320) });
      createPanel("chat", "Chat", chat, { left: Math.max(12, window.innerWidth - 460), top: 184, width: 420, height: Math.min(window.innerHeight - 220, 740) });

      if (kingdomWidget.enabled) {
        const k = ensureKingdomWidget();
        refreshKingdomWidget(false);
        createPanel("kingdom", "Kingdom", k, { left: Math.max(12, window.innerWidth - 560), top: 284, width: 520, height: Math.min(window.innerHeight - 320, 560) });
      } else {
        removePanel("kingdom");
      }
    }

    function teardownPanelLayout() {
      removeLayoutHint();
      for (const id of Array.from(panelLayout.panels.keys())) removePanel(id);
    }

    function setPanelLayoutEnabled(v) {
      panelLayout.enabled = !!v;
      savePanelLayoutEnabled(panelLayout.enabled);
      if (panelLayout.enabled) applyPanelLayoutIfNeeded();
      else teardownPanelLayout();
    }

    function startPanelLayoutLoop() {
      if (panelLayout.timer) return;
      panelLayout.timer = setInterval(() => {
        if (!panelLayout.enabled) return;
        applyPanelLayoutIfNeeded();
      }, 1000);
    }

    function parseHp(text) {
      const m = String(text).replace(/\s+/g, " ").match(/([\d,]+)\s*\/\s*([\d,]+)/);
      if (!m) return null;
      const cur = parseInt(m[1].replace(/,/g, ""), 10);
      const max = parseInt(m[2].replace(/,/g, ""), 10);
      if (isNaN(cur) || isNaN(max)) return null;
      return { cur, max };
    }

    function getPlayerHp() {
      const cs = getCombatState();
      if (cs && typeof cs.playerHp === 'number' && typeof cs.playerMaxHp === 'number') {
        return { cur: cs.playerHp, max: cs.playerMaxHp };
      }
      const hpEl = document.getElementById("player-hp-text");
      if (!hpEl) return null;
      return parseHp(hpEl.textContent);
    }

    function isPlayerDead() {
      const hp = getPlayerHp();
      if (!hp) return false;
      return hp.cur <= 0;
    }

    function getHealingPotionInfo(btn) {
      const title = (btn.getAttribute("title") || "");
      const txt = btn.textContent || "";
      const label = (title + " " + txt).toLowerCase();

      let heal = 0;
      if (label.includes("major healing")) heal = 5000;
      else if (label.includes("basic healing")) heal = 1000;
      else if (label.includes("minor healing")) heal = 500;
      else return null;

      const m = label.match(/x(\d+)/i);
      const count = m ? parseInt(m[1], 10) : 1;
      if (Number.isNaN(count) || count <= 0) return null;
      return { heal, count };
    }

    function findBestHealButton(missing) {
      const buttons = Array.from(document.querySelectorAll('button[name="action"][value="use_potion"]'));
      let bestBtn = null;
      let bestHeal = 0;

      for (const b of buttons) {
        if (b.disabled || !isVisible(b)) continue;
        const info = getHealingPotionInfo(b);
        if (!info) continue;
        if (info.heal > missing) continue;
        if (info.heal > bestHeal) { bestHeal = info.heal; bestBtn = b; }
      }
      return bestBtn;
    }

    function findReviveButton() {
      const candidates = [];
      const byId = document.getElementById("revive-button");
      if (byId) candidates.push(byId);

      document.querySelectorAll('button[name="action"][value="revive"]').forEach(b => candidates.push(b));
      document.querySelectorAll('button, a, div[role="button"]').forEach(el => {
        const txt = el.textContent.replace(/\s+/g, " ").trim();
        if (/^revive\b/i.test(txt)) candidates.push(el);
      });

      for (const el of candidates) {
        if (isVisible(el) && isOnScreenAndTop(el)) return el;
      }
      return null;
    }

    function checkAndUseMinorHeal() {
      const now = Date.now();
      if (state.healInFlight) return false;

      const cfg = getProfileCfg();
      if (now - state.lastHealAt < cfg.healCooldownMs) return false;

      const hp = getPlayerHp();
      if (!hp) return false;
      if (hp.cur <= 0) return false;

      const missing = hp.max - hp.cur;
      if (missing < HEAL_MISSING_HP) return false;

      const healBtn = findBestHealButton(missing);
      if (!healBtn) return false;

      state.healInFlight = true;
      state.lastHealAt = now;
      recordPotionUse();
      clickCombatAction(healBtn);
      setTimeout(() => (state.healInFlight = false), 150);
      return true;
    }

    // ===== Beast limit helpers (daily/weekly) =====
    // When OA says "You cannot kill any more <Beast> today/week", we mark it in localStorage.
    // AutoCombat must then STOP re-selecting that beast, or it will spam attacks forever.
    const __OA_BEAST_LIMIT_STORE_KEY = "oa_beast_weekly_limits_v1";

    // Server-day/week keys (prefer in-game server time if available)
    function __oaGetServerNowMs() {
      try {
        const st = document.querySelector("#server-time");
        const raw = st?.dataset?.serverEpoch || st?.getAttribute?.("data-server-epoch") || "";
        if (raw) {
          let n = parseInt(String(raw), 10);
          if (Number.isFinite(n)) {
            if (n < 1e12) n *= 1000; // seconds -> ms
            return n;
          }
        }
      } catch {}
      return Date.now();
    }

    function __oaServerDayKey() {
      const d = new Date(__oaGetServerNowMs());
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    }

    // ISO week key in UTC, e.g. "2026-W05"
    function __oaIsoWeekKeyUTC(ms) {
      const d = new Date(ms);
      const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      // Thursday decides ISO year/week
      date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
      const yyyy = date.getUTCFullYear();
      return `${yyyy}-W${String(weekNo).padStart(2, "0")}`;
    }

// Custom week key in UTC, aligned to weekly reset (Sat 23:59 server time).
// Returns the UTC date (YYYY-MM-DD) for the Sunday start-of-week (after +1 minute shift).
function __oaWeekKeyCustomUTC(ms) {
  try {
    const shifted = (ms || 0) + 60_000; // +1 minute to align boundary at Sat 23:59
    const d = new Date(shifted);
    // Create a UTC-midnight date for the shifted day.
    const dayStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    // Weeks start Sunday in this scheme (0=Sunday..6=Saturday)
    const dow = dayStart.getUTCDay();
    dayStart.setUTCDate(dayStart.getUTCDate() - dow);
    const y = dayStart.getUTCFullYear();
    const m = String(dayStart.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dayStart.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  } catch (e) {
    // Fallback to ISO week if anything goes wrong.
    try { return __oaIsoWeekKeyUTC(ms || Date.now()); } catch (e2) { return "week-unknown"; }
  }
}
function __oaServerWeekKey() {
      // Weekly reset: Saturday 23:59 (server time).
      // We model this as a Sunday 00:00 week-boundary, with a +1 minute shift.
      // That makes the week key flip exactly at Sat 23:59.
      return __oaWeekKeyCustomUTC(__oaGetServerNowMs());
    }

    function __oaReadBeastLimitStore() {
      try { return JSON.parse(localStorage.getItem(__OA_BEAST_LIMIT_STORE_KEY) || "{}") || {}; }
      catch (e) { return {}; }
    }

    function __oaIsBeastNameLimited(name) {
      try {
        const n = String(name || "").trim().toLowerCase();
        if (!n) return false;

        const limits = __oaReadBeastLimitStore();
        const entry = limits[n];
        if (!entry) return false;

        // Old format: timestamp only (treat as 24h)
        if (typeof entry === "number") {
          return (Date.now() - entry) < (24 * 60 * 60 * 1000);
        }

        const scope = String(entry.scope || entry.kind || "").toLowerCase();
        if (scope === "weekly" || scope === "week") {
          const wk = String(entry.weekKey || entry.week || "");
          const curWk = __oaServerWeekKey();
          if (wk && wk === curWk) return true;
        } else {
          // default daily
          const dk = String(entry.dayKey || entry.dateKey || entry.date || "");
          const curDayKey = __oaServerDayKey();
          const curDayStr = new Date(__oaGetServerNowMs()).toDateString(); // backwards compat
          if (dk && (dk === curDayKey || dk === curDayStr)) return true;
        }

        // Stale -> clean up
        delete limits[n];
        try { localStorage.setItem(__OA_BEAST_LIMIT_STORE_KEY, JSON.stringify(limits)); } catch {}
        return false;
      } catch (e) { return false; }
    }

// Manual reset helper: clears limited-beast store and re-enables any options we disabled.
// scope: "all" | "daily" | "weekly"
function __oaResetBeastLimits(scope = "all") {
  const sc = String(scope || "all").toLowerCase();
  try {
    const limits = __oaReadBeastLimitStore();
    if (sc === "all") {
      localStorage.removeItem(__OA_BEAST_LIMIT_STORE_KEY);
    } else {
      const kept = {};
      for (const [k, v] of Object.entries(limits || {})) {
        const s = String(v?.scope || v?.kind || "daily").toLowerCase();
        const isWeekly = (s === "weekly" || s === "week");
        if (sc === "daily") {
          if (isWeekly) kept[k] = v;
        } else if (sc === "weekly") {
          if (!isWeekly) kept[k] = v;
        }
      }
      localStorage.setItem(__OA_BEAST_LIMIT_STORE_KEY, JSON.stringify(kept));
    }
  } catch {}

  // Re-enable any dropdown options we disabled due to limit messages.
  try {
    const sel = document.getElementById("monster-select");
    if (sel) {
      for (const opt of Array.from(sel.options || [])) {
        if (!opt) continue;
        if (opt.getAttribute && opt.getAttribute("data-oa-limit-disabled") === "1") {
          opt.removeAttribute("data-oa-limit-disabled");
          // Only flip disabled off if we were the one that disabled it.
          opt.disabled = false;
        }
      }
    }
  } catch {}

  try { localStorage.removeItem("oa_last_beast_limit_event_v1"); } catch {}

  try {
    window.dispatchEvent(new CustomEvent("oa_beast_limits_reset", { detail: { scope: sc, at: Date.now() } }));
  } catch {}

  try { console.log("[OA] Beast limits reset:", sc); } catch {}
}

// Expose to console for convenience:
//   OA_ResetBeastLimits()            -> all
//   OA_ResetBeastLimits("daily")     -> daily only
//   OA_ResetBeastLimits("weekly")    -> weekly only
try { window.OA_ResetBeastLimits = __oaResetBeastLimits; } catch {}

    function __oaExtractBeastNameFromOption(optOrText) {
      try {
        const txt = (typeof optOrText === "string")
          ? optOrText
          : String(optOrText?.textContent || "");

        if (!txt) return "";

        // Examples:
        // "Keraunos [300100/300100] (Lvl 200)" -> "Keraunos"
        // "Ashen Wraith (Lvl 180)" -> "Ashen Wraith"
        const m = txt.match(/^\s*([^\[\(]+?)\s*(?:\[|\(|$)/);
        return String(m?.[1] || txt).trim();
      } catch (e) { return ""; }
    }

function isBeastOption(opt) {
  if (!opt) return false;
  const v = String(opt.value || "");
  const valueLower = v.toLowerCase();
  const beastAttr = String(opt.dataset?.beastOption || "").toLowerCase();
  const beastGroup = opt.closest?.("optgroup") || opt.parentElement;
  const beastGroupId = String(beastGroup?.id || "").toLowerCase();
  const beastGroupLabel = String(beastGroup?.label || "").toLowerCase();
  const label = String(opt.textContent || "").toLowerCase();
  return (
    valueLower.startsWith("beast:") ||
    beastAttr === "1" ||
    beastAttr === "true" ||
    beastAttr === "yes" ||
    opt.hasAttribute?.("data-beast-option") ||
    beastGroupId.includes("beast") ||
    beastGroupLabel.includes("beast") ||
    (/\[\s*\d+\s*\/\s*\d+\s*\]/.test(label) && beastGroupLabel.includes("nearby"))
  );
}

function selectHighestLevelMonsterIfNeeded() {
  const cs = getCombatState();
  if (cs && cs.inCombat) return;

  const select = document.getElementById("monster-select");
  if (!select) return;

  const allOpts = Array.from(select.options || []);

  const isDisabledOpt = (opt) => {
    if (!opt) return true;
    if (opt.disabled) return true;
    const v = String(opt.value ?? "");
    if (!v || v === "0") return true;
    const t = String(opt.textContent || "").toLowerCase();
    if (t.includes("vanished") || t.includes("slain") || t.includes("defeated") || t.includes("fallen")) return true;
    return false;
  };

  // Check if PvP mode is on (check localStorage directly since variable may not be in scope)
  let pvpMode = false;
  try {
    const pvpRaw = localStorage.getItem("oa_pvp_auto_target_v1");
    pvpMode = pvpRaw === "true" || pvpRaw === "1";
  } catch {}

  // Player options (for PvP mode)
  const playerOpts = allOpts.filter((opt) => {
    if (!opt) return false;
    const v = String(opt.value || "");
    return v.startsWith("player:") && !isDisabledOpt(opt);
  });

  // If PvP mode is on and there are players, ALWAYS target players first
  if (pvpMode && playerOpts.length > 0) {
    let bestPlayer = playerOpts[0];
    let bestLevel = -Infinity;

    for (const opt of playerOpts) {
      const txt = String(opt.textContent || "");
      const mLvl = txt.match(/\bLvl\s*(\d+)\b/i);
      const lvl = mLvl ? parseInt(mLvl[1], 10) : 0;
      if (lvl > bestLevel) {
        bestPlayer = opt;
        bestLevel = lvl;
      }
    }

    const currentVal = String(select.value || "");
    if (currentVal && currentVal === String(bestPlayer.value)) return;

    select.value = String(bestPlayer.value);
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));

    console.log("[AutoCombat] PvP Mode: Player targeted:", { id: bestPlayer.value, text: bestPlayer.textContent });
    return;
  }

  // Respect a valid current selection to prevent auto-jumping to pinned/highest targets.
  // Only auto-select when the current option is missing/invalid/disabled.
  const selectedVal = String(select.value || "");
  const currentOpt = allOpts.find((opt) => String(opt?.value || "") === selectedVal);
  if (currentOpt && !isDisabledOpt(currentOpt)) {
    return;
  }

  const beastOpts = allOpts.filter((opt) => {
    if (!opt || !opt.dataset) return false;
    const isBeast = isBeastOption(opt);
    if (!isBeast) return false;
    if (isDisabledOpt(opt)) return false;

    // Skip beasts that hit the daily/weekly cap (prevents infinite re-attack loop).
    const beastName = __oaExtractBeastNameFromOption(opt);
    if (beastName && __oaIsBeastNameLimited(beastName)) return false;

    return true;
  });

  const monsterOpts = allOpts.filter((opt) =>
    opt && opt.dataset && opt.dataset.monsterOption === "1" && !isDisabledOpt(opt)
  );

  function getOptionLevel(opt) {
    if (!opt) return 0;

    // Prefer explicit dataset.
    const d = opt.dataset || {};
    for (const k of ["beastLevel", "monsterLevel", "level"]) {
      const v = d[k];
      if (v != null && v !== "") {
        const n = parseInt(String(v), 10);
        if (Number.isFinite(n)) return n;
      }
    }

    // Prefer the "Lvl 200" token (avoid HP like 300100/300100).
    const txt = String(opt.textContent || "");
    const mLvl = txt.match(/\bLvl\s*(\d+)\b/i);
    if (mLvl) return parseInt(mLvl[1], 10) || 0;

    // Fallback: last number in string.
    const nums = txt.match(/\d+/g);
    if (nums && nums.length) return parseInt(nums[nums.length - 1], 10) || 0;

    return 0;
  }

  // PRIORITY 1: BEASTS ALWAYS FIRST (even over pinned monsters!)
  if (beastOpts.length > 0) {
    let best = null;
    let bestLevel = -Infinity;
    for (const opt of beastOpts) {
      const lvl = getOptionLevel(opt);
      if (!best || lvl > bestLevel) {
        best = opt;
        bestLevel = lvl;
      }
    }
    if (best) {
      const currentVal = String(select.value || (cs?.currentMonsterId ?? "") || "");
      if (currentVal && currentVal === String(best.value)) return;

      select.value = String(best.value);
      allOpts.forEach((opt) => {
        const on = opt === best;
        opt.selected = on;
        if (on) opt.setAttribute("selected", "selected");
        else opt.removeAttribute("selected");
      });

      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));

      console.log("[AutoCombat] Beast selected (priority):", { id: best.value, lvl: getOptionLevel(best) });
      return;
    }
  }

  // PRIORITY 2: Pinned Fight # (only when NO beasts available)
  // Selects by POSITION in the monster list (not by value) so it works across all planes
  try {
    const pinnedNum = localStorage.getItem("oa_fight_num_v1");
    if (pinnedNum && monsterOpts.length > 0) {
      const n = parseInt(pinnedNum, 10);
      if (n >= 1) {
        const pinnedOpt = monsterOpts[n - 1]; // 1-based index
        if (pinnedOpt && !isDisabledOpt(pinnedOpt)) {
          const currentVal = String(select.value || "");
          if (currentVal !== String(pinnedOpt.value)) {
            select.value = String(pinnedOpt.value);
            allOpts.forEach((opt) => {
              const on = opt === pinnedOpt;
              opt.selected = on;
              if (on) opt.setAttribute("selected", "selected");
              else opt.removeAttribute("selected");
            });
            select.dispatchEvent(new Event("input", { bubbles: true }));
            select.dispatchEvent(new Event("change", { bubbles: true }));
            console.log("[AutoCombat] Pinned monster #" + n + " selected:", pinnedOpt.textContent.trim());
          }
          return; // skip normal highest-level logic
        }
      }
    }
  } catch {}

  // PRIORITY 3: Highest level monster (default)
  if (!monsterOpts.length) return;

  let best = null;
  let bestLevel = -Infinity;
  for (const opt of monsterOpts) {
    const lvl = getOptionLevel(opt);
    if (!best || lvl > bestLevel) {
      best = opt;
      bestLevel = lvl;
    }
  }
  if (!best) return;

  // Determine current selection: prefer select.value; fall back to CombatState.currentMonsterId.
  const currentVal = String(select.value || (cs?.currentMonsterId ?? "") || "");
  if (currentVal && currentVal === String(best.value)) return;

  select.value = String(best.value);
  allOpts.forEach((opt) => {
    const on = opt === best;
    opt.selected = on;
    if (on) opt.setAttribute("selected", "selected");
    else opt.removeAttribute("selected");
  });

  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));

  console.log("[AutoCombat] Highest level monster selected:", { id: best.value, lvl: getOptionLevel(best) });
}

    // Force select a regular monster (NOT a beast) - used when beast limit is reached
    function selectRegularMonster() {
      const cs = getCombatState();
      if (cs && cs.inCombat) return false;

      const select = document.getElementById("monster-select");
      if (!select) return false;

      const allOpts = Array.from(select.options || []);

      const isDisabledOpt = (opt) => {
        if (!opt) return true;
        if (opt.disabled) return true;
        const v = String(opt.value ?? "");
        if (!v || v === "0") return true;
        const t = String(opt.textContent || "").toLowerCase();
        if (t.includes("vanished") || t.includes("slain") || t.includes("defeated") || t.includes("fallen")) return true;
        return false;
      };

      // Only regular monsters - NOT beasts
      const monsterOpts = allOpts.filter((opt) => {
        if (!opt || !opt.dataset) return false;
        const v = String(opt.value || "");
        // Exclude beasts
        const isBeast = opt.dataset.beastOption === "1" || v.startsWith("beast:");
        if (isBeast) return false;
        // Must be a monster
        return opt.dataset.monsterOption === "1" && !isDisabledOpt(opt);
      });

      if (!monsterOpts.length) {
        console.log("[AutoCombat] No regular monsters available to switch to");
        return false;
      }

      function getOptionLevel(opt) {
        if (!opt) return 0;
        const txt = String(opt.textContent || "");
        const mLvl = txt.match(/\bLvl\s*(\d+)\b/i);
        if (mLvl) return parseInt(mLvl[1], 10) || 0;
        return 0;
      }

      // Find highest level monster
      let best = null;
      let bestLevel = -Infinity;
      for (const opt of monsterOpts) {
        const lvl = getOptionLevel(opt);
        if (!best || lvl > bestLevel) {
          best = opt;
          bestLevel = lvl;
        }
      }
      if (!best) return false;

      select.value = String(best.value);
      allOpts.forEach((opt) => {
        const on = opt === best;
        opt.selected = on;
        if (on) opt.setAttribute("selected", "selected");
        else opt.removeAttribute("selected");
      });

      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));

      console.log("[AutoCombat] Switched to regular monster (avoiding beast):", { id: best.value, text: best.textContent, lvl: bestLevel });
      return true;
    }

    function canStartSelectedFight() {
      const cs = getCombatState();
      if (cs && cs.inCombat) {
        console.log("[canStartSelectedFight] Blocked: in combat");
        return false;
      }

      const select = document.getElementById("monster-select");
      if (!select) {
        console.log("[canStartSelectedFight] No select, returning true");
        return true;
      }

      // If a limited beast is selected, do NOT start the fight (prevents spam clicking).
      try {
        const curOpt = select.options?.[select.selectedIndex];
        const v = String(select.value || "");
        const isBeast = v.startsWith("beast:") || curOpt?.dataset?.beastOption === "1";
        if (isBeast) {
          const beastName = __oaExtractBeastNameFromOption(curOpt);
          if (beastName && __oaIsBeastNameLimited(beastName)) {
            console.log("[canStartSelectedFight] Blocked: limited beast selected:", beastName);
            try { selectRegularMonster(); } catch {}
            return false;
          }
        }
      } catch {}

      // --- PvE Plane Lock (mobs only): step planes toward locked plane before fighting normal monsters.
      // Multi-step capable (e.g. Olympus -> ... -> Katabasis). This runs BEFORE any fight starts.
      // SKIP if Kingdom Auto is running (it has its own plane enforcement)
      try {
        const kingdomAutoRunning = localStorage.getItem("oa_kingdom_auto_running_v1") === "1";
        if (kingdomAutoRunning) {
          // Kingdom Auto is active - don't interfere with its plane
        } else {
        const LOCK_KEY = "oa_pve_plane_lock_v1";
        const LASTSTEP_KEY = "oa_pve_plane_lock_laststep_ms_v2";
        const STEP_COUNT_KEY = "oa_pve_plane_step_count_v1";
        const lockRaw = (() => { try { return String(localStorage.getItem(LOCK_KEY) || ""); } catch (e) { return ""; } })();
        const lock = (window.__oaPlaneLock?.norm ? window.__oaPlaneLock.norm(lockRaw) : String(lockRaw || "").trim().toLowerCase());

        // Current plane: prefer robust detector (handles Aerion/Olympus), then fallback
        const curRaw = (window.__oaPlaneLock?.detectCurrentPlane ? window.__oaPlaneLock.detectCurrentPlane() : (getPlaneIdSafe() || ""));
        const cur = (window.__oaPlaneLock?.norm ? window.__oaPlaneLock.norm(curRaw) : String(curRaw || "").trim().toLowerCase());

        if (lock && cur && lock !== cur) {
          // Check step count to prevent infinite loops
          const stepCount = Number(localStorage.getItem(STEP_COUNT_KEY) || 0);

          // Also track session step count (resets on tab close, not page reload)
          const SESSION_STEP_KEY = "oa_pve_session_step_count";
          const sessionStepCount = Number(sessionStorage.getItem(SESSION_STEP_KEY) || 0);

          if (stepCount > 20 || sessionStepCount > 30) {
            console.log("[AutoCombat] PvE Plane Lock: Too many steps, clearing lock", { stepCount, sessionStepCount });
            try { localStorage.removeItem(LOCK_KEY); } catch {}
            try { localStorage.removeItem(LASTSTEP_KEY); } catch {}
            try { localStorage.removeItem(STEP_COUNT_KEY); } catch {}
            try { sessionStorage.removeItem(SESSION_STEP_KEY); } catch {}
          } else {
          const v0 = String(select.value || "");
          const isPlayer = v0.startsWith("player:");
          const isBeast  = v0.startsWith("beast:");

          // If any beasts are available, do NOT force plane changes (beasts have priority).
          let hasBeast = false;
          try {
            hasBeast = !!select.querySelector('option[value^="beast:"], option[data-beast-option="1"], option[data-beast-option="true"], optgroup#beast-options-group option');
          } catch (e) {
            hasBeast = false;
          }

          if (!hasBeast && !isPlayer && !isBeast) {
            const order = ["underworld","katabasis","aetheria","aerion","olympus"];
            const a = order.indexOf(cur);
            const b = order.indexOf(lock);

            if (a >= 0 && b >= 0) {
              const nowMs = Date.now();
              const lastStep = Number((() => { try { return localStorage.getItem(LASTSTEP_KEY) || 0; } catch (e) { return 0; } })()) || 0;

              // prevent rapid double stepping while the UI updates
              if (nowMs - lastStep < 1400) {
                return false;
              }

              const dir = (b > a) ? "up" : "down";
              const ok = (typeof clickPlaneStep === "function")
                ? clickPlaneStep(dir)
                : (typeof __oaClickPlaneStep === "function" ? __oaClickPlaneStep(dir) : false);

              if (ok) {
                try { localStorage.setItem(LASTSTEP_KEY, String(nowMs)); } catch {}
                try { localStorage.setItem(STEP_COUNT_KEY, String(stepCount + 1)); } catch {}

                try { localStorage.setItem("oa_autocombat_restore_delay_until_ms_v1", String(nowMs + 1000)); } catch {}try { sessionStorage.setItem("oa_pve_session_step_count", String(sessionStepCount + 1)); } catch {}
                console.log("[AutoCombat] PvE Plane Lock: stepping plane", { from: cur, to: lock, dir, stepCount: stepCount + 1, sessionStepCount: sessionStepCount + 1 });
                return false; // wait for plane change, then retry next tick (repeat until match)
              } else {
                console.log("[AutoCombat] PvE Plane Lock: cannot step (no button?)", { from: cur, to: lock, dir });
              }
            }
          }
          }
        } else if (lock && cur && lock === cur) {
          // Plane matches - reset step counters
          try { localStorage.removeItem(STEP_COUNT_KEY); } catch {}
          try { sessionStorage.removeItem("oa_pve_session_step_count"); } catch {}
        }
        }
      } catch {}
const planeId = getPlaneIdSafe();
      const beastOnly = planeId ? BEAST_ONLY_PLANES.has(String(planeId)) : false;

      const opt = select.options?.[select.selectedIndex] || null;
      const val = String(select.value || "");
      const txtLabel = String(opt?.textContent || "").toLowerCase();

      console.log("[canStartSelectedFight] Selected:", val, "Text:", txtLabel);

      const isBeast = opt
        ? isBeastOption(opt)
        : val.startsWith("beast:");

      const looksInvalid =
        !val || val === "0" ||
        !!opt?.disabled ||
        txtLabel.includes("vanished") || txtLabel.includes("slain") || txtLabel.includes("defeated") || txtLabel.includes("fallen");

      if (looksInvalid) {
        console.log("[canStartSelectedFight] Selection looks invalid, trying to select highest level monster");
        try {

selectHighestLevelMonsterIfNeeded(); } catch {}
        const v2 = String(select.value || "");
        if (!v2 || v2 === "0") {
          console.log("[canStartSelectedFight] Blocked: still no valid selection");
          return false;
        }
      }

      // On beast-only planes, only fight beasts, and only if the server says beasts exist.
      if (beastOnly) {
        if (!Array.isArray(cs?.beasts)) {
          console.log("[canStartSelectedFight] Blocked: beast-only plane but no beasts array");
          return false;
        }
        if (cs.beasts.length === 0) {
          console.log("[canStartSelectedFight] Blocked: beast-only plane but 0 beasts");
          return false;
        }

        const opt2 = select.options?.[select.selectedIndex] || null;
        const isBeast2 = opt2
          ? isBeastOption(opt2)
          : String(select.value || "").startsWith("beast:");

        return isBeast2;
      }

      // On normal planes: if we are still pointing at a beast but server says no beasts, don't start.
      // EXCEPTION: If we just teleported to a beast, allow the fight even if CombatState hasn't updated yet
      if (isBeast) {
        // Check if we just teleported (within last 60 seconds) - check both lock keys
        let justTeleported = false;
        try {
          // Check new hard block key
          const hardBlockRaw = localStorage.getItem("oa_beast_hard_block_v2");
          if (hardBlockRaw) {
            const block = JSON.parse(hardBlockRaw);
            const age = Date.now() - (block.timestamp || 0);
            if (age < 60000) {
              justTeleported = true;
              console.log("[AutoCombat] Beast selected, hard block active - allowing fight");
            }
          }
          // Also check old lock key for backwards compatibility
          if (!justTeleported) {
            const lockRaw = localStorage.getItem("oa_beast_teleport_lock_v1");
            if (lockRaw) {
              const lock = JSON.parse(lockRaw);
              const age = Date.now() - (lock.timestamp || 0);
              if (age < 60000) {
                justTeleported = true;
                console.log("[AutoCombat] Beast selected, recently teleported - allowing fight");
              }
            }
          }
        } catch {}

        // If we just teleported OR if there's a beast in the dropdown, allow the fight
        if (!justTeleported) {
          // Check if there's actually a beast option available (regardless of CombatState)
          const beastOpt = Array.from(select.options || []).find((o) => {
            if (!o || o.disabled) return false;
            const v = String(o.value || "");
            const isBeast = isBeastOption(o);
            if (!isBeast) return false;

            const beastName = __oaExtractBeastNameFromOption(o);
            if (beastName && __oaIsBeastNameLimited(beastName)) return false;

            return true;
          });
if (beastOpt) {
            // There's a beast in the dropdown - select it and allow fight
            if (select.value !== beastOpt.value) {
              select.value = beastOpt.value;
              select.dispatchEvent(new Event("change", { bubbles: true }));
            }
            console.log("[AutoCombat] Beast option exists in dropdown - allowing fight");
            justTeleported = true;
          }
        }

        if (!justTeleported) {
          if (!Array.isArray(cs?.beasts)) return false;
          if (cs.beasts.length === 0) return false;
        }
      }

      return true;
    }

    function getBotcheckEls() {
      return {
        title: document.getElementById("botcheck-title"),
        codeEl: document.querySelector("[data-botcheck-code]"),
        input: document.querySelector("[data-botcheck-input]"),
        submit: document.querySelector("[data-botcheck-submit]"),
      };
    }

    function isBotcheckVisible() {
      const { title, input, submit } = getBotcheckEls();
      return (
        (title && title.offsetParent !== null) ||
        (input && input.offsetParent !== null) ||
        (submit && submit.offsetParent !== null)
      );
    }

    function loadBotcheckBeepEnabled() {
      try {
        const raw = localStorage.getItem(BOTCHECK_BEEP_KEY);
        if (!raw) return true;
        return Boolean(JSON.parse(raw));
      } catch { return true; }
    }
    function saveBotcheckBeepEnabled(v) { try { localStorage.setItem(BOTCHECK_BEEP_KEY, JSON.stringify(!!v)); } catch {} }

    const botcheck = {
      wasVisible: false,
      pausedAuto: false,
      alarmTimer: null,
      beepEnabled: loadBotcheckBeepEnabled(),
      audioCtx: null,
      lastBeepAt: 0,
      monitorTimer: null,
    };

    function ensureAudioContext() {
      try {
        if (botcheck.audioCtx && botcheck.audioCtx.state !== "closed") return botcheck.audioCtx;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        botcheck.audioCtx = new Ctx();
        return botcheck.audioCtx;
      } catch { return null; }
    }

    function playBeepPattern() {
      if (!botcheck.beepEnabled) return;

      const now = Date.now();
      if (now - botcheck.lastBeepAt < 1500) return;
      botcheck.lastBeepAt = now;

      const ctx = ensureAudioContext();
      if (!ctx) return;

      // Some browsers require a user gesture before audio will play; we still try.
      const t0 = ctx.currentTime + 0.02;

      const makeBeep = (tStart, duration, freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, tStart);
        gain.gain.setValueAtTime(0.0001, tStart);
        gain.gain.exponentialRampToValueAtTime(0.25, tStart + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, tStart + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(tStart);
        osc.stop(tStart + duration + 0.02);
      };

      // 3 short beeps
      makeBeep(t0 + 0.00, 0.18, 880);
      makeBeep(t0 + 0.28, 0.18, 880);
      makeBeep(t0 + 0.56, 0.22, 660);
    }

    function startBotcheckAlarm() {
      if (botcheck.alarmTimer) return;
      playBeepPattern();
      botcheck.alarmTimer = setInterval(() => {
        if (!isBotcheckVisible()) return;
        playBeepPattern();
      }, 6500);
    }

    function stopBotcheckAlarm() {
      if (botcheck.alarmTimer) {
        clearInterval(botcheck.alarmTimer);
        botcheck.alarmTimer = null;
      }
    }

    function ensureCombatTab() {
      try {
        if (location.pathname !== "/game.php") return;
        const url = new URL(location.href);
        const tab = url.searchParams.get("tab") || "combat";
        if (tab !== "combat") {
          url.searchParams.set("tab", "combat");
          OA.NAV.replace(url.toString());
        }
      } catch {}
    }

    // Track when security check was last cleared
    let securityCheckClearedAt = 0;
    const SECURITY_CHECK_COOLDOWN_MS = 3000; // 3 seconds

    function resumeAutoCombatIfNeeded() {
      console.log('[AutoCombat] resumeAutoCombatIfNeeded called');

      try {
        const resumeKey = localStorage.getItem(BOTCHECK_RESUME_KEY);
        console.log('[AutoCombat] BOTCHECK_RESUME_KEY:', resumeKey);
        if (resumeKey !== "1") {
          console.log('[AutoCombat] Resume key not set, skipping resume');
          return;
        }
      } catch (e) {
        console.warn('[AutoCombat] Error checking resume key:', e);
        return;
      }

      const visible = isBotcheckVisible();
      console.log('[AutoCombat] Botcheck visible:', visible);
      if (visible) {
        console.log('[AutoCombat] Botcheck still visible, skipping resume');
        return;
      }

      try { localStorage.removeItem(BOTCHECK_RESUME_KEY); } catch {}
      console.log('[AutoCombat] Cleared BOTCHECK_RESUME_KEY');

      console.log('[AutoCombat] botcheck.pausedAuto:', botcheck.pausedAuto);
      console.log('[AutoCombat] state.enabled:', state.enabled);

      // AGGRESSIVE: If resume key was set and modal is gone, FORCE RESUME regardless of flags
      // Don't check pausedAuto or state.enabled - just resume!
      console.log('[AutoCombat] FORCING RESUME (aggressive mode)');

      // Set the cleared timestamp and wait 3 seconds before resuming
      securityCheckClearedAt = Date.now();
      log("Security Check cleared, waiting 3 seconds before resuming...");

      setTimeout(() => {
        if (isBotcheckVisible()) {
          log("Security Check appeared again, aborting resume.");
          return;
        }

        console.log('[AutoCombat] Resuming now! (forced)');
        botcheck.pausedAuto = false;

        // Resume script AutoCombat where it left off
        state.enabled = true;
        autoModeForRates = true;
        saveAutoCombatEnabled(true);
        touchAutoCombatStart();
        ensureCombatTab();
        scheduleLoop();
        log("Resumed AutoCombat after Security Check cleared (3s delay).");
      }, SECURITY_CHECK_COOLDOWN_MS);
    }

    // Helper to check if we're still in security check cooldown
    function isInSecurityCheckCooldown() {
      return (Date.now() - securityCheckClearedAt) < SECURITY_CHECK_COOLDOWN_MS;
    }

    function startBotcheckMonitor() {
      if (botcheck.monitorTimer) return;
      botcheck.monitorTimer = setInterval(() => {
        const visible = isBotcheckVisible();
        if (visible) {
          startBotcheckAlarm();
        } else {
          stopBotcheckAlarm();
          resumeAutoCombatIfNeeded();
        }
      }, 400);
    }

    async function copyBotcheckCodeIfAny() {
      const { codeEl } = getBotcheckEls();
      const code = codeEl?.textContent?.trim();
      if (!code || code.length !== 4) return;
      if (state.copiedCode === code) return;
      state.copiedCode = code;
      try { await navigator.clipboard.writeText(code); log(`Security code copied: ${code}`); }
      catch { log(`Clipboard blocked. Code is: ${code}`); }
    }

    function focusBotcheckInput() {
      const { title, input } = getBotcheckEls();
      (title || input)?.scrollIntoView?.({ block: "center" });
      if (input && input.offsetParent !== null) { input.focus(); input.select?.(); }
    }

    let gameAutoWasRunning = false;

    function tick() {
      if (!state.enabled) return;

      // Don't do anything during security check cooldown
      if (isInSecurityCheckCooldown()) {
        return;
      }

      const gameAuto = isGameAutoCombatRunning();
      if (gameAuto) {
        try { enforceBeastOnlyPolicy(); } catch {}
        if (!gameAutoWasRunning) {
          log("Game AutoCombat detected; yielding to built-in auto.");
        }
        gameAutoWasRunning = true;
        return;
      } else if (gameAutoWasRunning) {
        log("Game AutoCombat stopped; resuming script auto.");
        gameAutoWasRunning = false;
      }

      if (isBotcheckVisible()) {
        log("Security Check detected — pausing automation + alerting.");
        copyBotcheckCodeIfAny();
        focusBotcheckInput();

        startBotcheckAlarm();
        startBotcheckMonitor();

        // Remember we should resume if we were running.
        if (state.enabled) {
          botcheck.pausedAuto = true;
          console.log('[AutoCombat] Set botcheck.pausedAuto = true');
          try {
            localStorage.setItem(BOTCHECK_RESUME_KEY, "1");
            console.log('[AutoCombat] Set BOTCHECK_RESUME_KEY = 1');
          } catch {}
        } else {
          console.log('[AutoCombat] state.enabled was false, not setting resume flag');
        }

        state.enabled = false;
        autoModeForRates = false;
        // Keep persisted AutoCombat preference ON so it can restore after check clears.
        saveAutoCombatEnabled(true);

        touchAutoCombatStop();
        stopLoop();
        if (panelLayout.timer) { clearInterval(panelLayout.timer); panelLayout.timer = null; }
        teardownPanelLayout();
        return;
      }

      // Single-authority engine: while an action is "in flight", wait for the UI/server ack
      // (delay bar starts / button state changes) to avoid double-taps.
      if (state._actionInFlight) {
        clearInFlightIfAcked();
        const age = Date.now() - (state._actionInFlightAt || 0);
        if (age < 120) return;
      }

// If a beast teleport is pending, finish the current fight, then stop starting new fights
      // so the delay bar can drop to zero and the teleport can fire.
      if (state.holdForBeastTeleport) {
        const csHold = getCombatState();
        if (!csHold || !csHold.inCombat) return;
      }

      selectHighestLevelMonsterIfNeeded();

      // If a beast just died, the dropdown may still show a stale beast selection; prevent "long delay" from invalid starts.
      // ALSO: Restore saved plane lock when there are no more beasts
      (function clearStaleBeastSelectionIfAny() {
        const cs = getCombatState();
        if (!cs || cs.inCombat) return;
        if (!Array.isArray(cs.beasts)) return;

        // If no beasts available and we have a saved plane lock, restore it
        if (cs.beasts.length === 0) {
          try {
            const savedPlane = localStorage.getItem("oa_beast_return_plane_v1");
            if (savedPlane) {
              localStorage.setItem("oa_pve_plane_lock_v1", savedPlane);
              localStorage.removeItem("oa_beast_return_plane_v1");
              console.log("[AutoCombat] No beasts - restored PvE plane lock:", savedPlane);
              // Immediately trigger plane stepping
              try { planeMgr.tick("beast_restore_combat"); } catch {}
            }
          } catch {}
        }

        if (cs.beasts.length !== 0) return;

        const select = document.getElementById("monster-select");
        if (!select) return;

        const opt = select.options?.[select.selectedIndex] || null;
        const val = String(select.value || "");
        const isBeast = opt ? (String(opt.value || "").startsWith("beast:") || opt.dataset?.beastOption === "1") : val.startsWith("beast:");
        if (!isBeast) return;

        // Rerun selection logic; on beast-only planes this clears to 0, otherwise it picks best normal monster.
        try { selectHighestLevelMonsterIfNeeded(); } catch {}
      })();

      if (!isCombatReady()) return;
      if (!ensureCombatActionReady()) return;

      if (checkAndUseMinorHeal()) { gateNextActionAfterWork(); return; }

      if (isPlayerDead()) {
        const revive = findReviveButton();
        if (revive) {
          recordRevive();
          clickCombatAction(revive);
          gateNextActionAfterWork();
          return;
        }
      }

      const combatBtn = document.getElementById("combat-main-button");
      if (!combatBtn || !isElementClickable(combatBtn)) {
        const now = Date.now();
        if (now - (state._dbgLastMissingBtnAt || 0) > 1200) {
          state._dbgLastMissingBtnAt = now;
          console.log("[AutoCombat Debug] Combat button not found or not clickable");
        }
        return;
      }
      if (!isOnScreenAndTop(combatBtn)) {
        const now = Date.now();
        if (now - (state._dbgLastBtnNotTopAt || 0) > 1200) {
          state._dbgLastBtnNotTopAt = now;
          console.log("[AutoCombat Debug] Combat button not on screen/top");
        }
        return;
      }

      const text = combatBtn.textContent.trim();

      // STEALTH: Add reaction delay when button text changes (human needs to read new action)
      // APPLIES TO ALL PROFILES (instant/fast/humanized) - stealth is enforced when enabled
      if (STEALTH_CONFIG.enabled && STEALTH_CONFIG.useKeyboard) {
        // Track button text changes
        if (!state._lastButtonText) state._lastButtonText = text;

        if (text !== state._lastButtonText) {
          // Button text just changed! (e.g., "Start (F)" → "Attack (A)")
          const now = Date.now();

          if (!state._buttonTextChangedAt || state._lastButtonText !== state._buttonTextBeforeChange) {
            // First time seeing this change
            state._buttonTextChangedAt = now;
            state._buttonTextBeforeChange = state._lastButtonText;
            state._lastButtonText = text;

            // Human reaction: configurable delay to read new button text and react
            const delayMin = STEALTH_CONFIG.buttonChangeDelayMin || 80;
            const delayMax = STEALTH_CONFIG.buttonChangeDelayMax || 200;
            const readDelay = delayMin + Math.random() * (delayMax - delayMin);
            state._buttonReadyAfter = now + readDelay;

            slog('Stealth', `Button changed: "${state._buttonTextBeforeChange}" → "${text}", reaction delay: ${readDelay.toFixed(0)}ms`);
            return; // Don't act yet
          }

          state._lastButtonText = text;
        }

        // If we're still in reaction delay, don't act
        if (state._buttonReadyAfter && Date.now() < state._buttonReadyAfter) {
          return;
        }

        // Clear reaction delay once acted
        if (state._buttonReadyAfter) {
          state._buttonReadyAfter = null;
          state._buttonTextChangedAt = null;
        }
      }

      const nowTxt = Date.now();
      if (text !== state._dbgLastBtnText || (nowTxt - (state._dbgLastBtnTextAt || 0)) > 1200) {
        state._dbgLastBtnText = text;
        state._dbgLastBtnTextAt = nowTxt;
        console.log("[AutoCombat Debug] Button text:", text);
      }

      if (state.holdForBeastTeleport) {
        if (text === "Attack (A)" || text === "Duel Attack (A)") { recordAttack(false); clickCombatAction(combatBtn);
        gateNextActionAfterWork(); }
        return;
      }

      if (text === "Switch Target") {
        clickCombatAction(combatBtn);
        gateNextActionAfterWork();
        return;
      }
      if (text === "Start (F)" || text === "Duel (F)") {
        console.log("[AutoCombat Debug] Found Start/Duel button, checking canStartSelectedFight...");
        if (!canStartSelectedFight()) {
          console.log("[AutoCombat Debug] canStartSelectedFight returned false");
          // Reduced penalty (was 350ms) - proactive target observer should catch most cases
          state.nextEligibleActionAt = Math.max(state.nextEligibleActionAt || 0, Date.now() + 100);
          return;
        }
        console.log("[AutoCombat Debug] Clicking Start button!");
        recordAttack(true);
        clickCombatAction(combatBtn);
        gateNextActionAfterWork();
        return;
      }
      if (text === "Attack (A)" || text === "Duel Attack (A)") {
        recordAttack(false);
        clickCombatAction(combatBtn);
        gateNextActionAfterWork();
        return;
      }
    }

function scheduleCombatTick(reason) {
  if (!state.enabled) return;
  state._combatDirty = true;
  state._combatDirtyReason = String(reason || "");

  // If guards have already expired, fire a tick immediately instead of
  // waiting for the next engine interval (saves up to 15ms per action!)
  const now = Date.now();
  const guardsExpired = now >= (state.nextEligibleActionAt || 0) &&
                        now >= (state._serverAckGuardUntil || 0) &&
                        now >= (state._nextTickAt || 0);

  if (guardsExpired && state._combatEngineInterval != null) {
    // Schedule a microtask-level tick - faster than setInterval
    Promise.resolve().then(() => {
      if (!state.enabled || !state._combatDirty) return;
      const n = Date.now();
      if (n < (state.nextEligibleActionAt || 0)) return;
      if (n < (state._serverAckGuardUntil || 0)) return;
      if (n < (state._nextTickAt || 0)) return;
      state._nextTickAt = n + (STEALTH_CONFIG.tickThrottleMs || 10);
      state._combatDirty = false;
      try { tick(); } catch (e) { console.error("[AutoCombat] tick error", e); }
    });
  }
}

function ensureCombatEngine() {
  if (!state.enabled) return;
  if (state._combatEngineInterval != null) return;

  state._combatDirty = true;
  state._nextTickAt = 0;

  // Configurable timing - faster settings = more responsive but slightly higher CPU
  const ENGINE_INTERVAL_MS = STEALTH_CONFIG.engineIntervalMs || 45;
  const TICK_THROTTLE_MS = STEALTH_CONFIG.tickThrottleMs || 40;

  state._combatEngineInterval = OA.setInterval(() => {
    if (!state.enabled) return;

    const now = Date.now();

    // ALWAYS respect the action gate – even if dirty.
    // This is what makes reaction delays / humanized pauses actually work.
    if (now < (state.nextEligibleActionAt || 0)) return;

    // If nothing changed, don't burn cycles.
    if (!state._combatDirty) return;

    if (now < (state._nextTickAt || 0)) return;
    state._nextTickAt = now + TICK_THROTTLE_MS;

    state._combatDirty = false;

    try { tick(); } catch (e) { console.error("[AutoCombat] tick error", e); }
  }, ENGINE_INTERVAL_MS);

  // Kick once immediately.
  OA.setTimeout(() => {
    if (!state.enabled) return;
    try { state._combatDirty = false; tick(); } catch (e) { console.error("[AutoCombat] tick error", e); }
  }, 0);
}

function ensureCombatObserver() {
  if (state._combatObserver) return;

  state._combatObserver = new MutationObserver(() => scheduleCombatTick("mutation"));

  // Observe a stable container so we keep reacting even if the combat button is re-rendered/replaced.
  const root =
    document.getElementById("game-container") ||
    document.getElementById("main-content") ||
    document.getElementById("map-panel") ||
    document.body;

  try {
    state._combatObserver.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
    });
  } catch (e) {
    try {
      state._combatObserver.observe(document.body, { subtree: true, childList: true, attributes: true });
    } catch {}
  }

  scheduleCombatTick("observer-init");

  // DEDICATED BUTTON OBSERVER - watches combat button specifically for instant reaction
  // The main observer watches the whole page (slow), this one watches only the button (fast)
  if (!state._buttonObserver) {
    function attachButtonObserver() {
      const btn = document.getElementById("combat-main-button");
      if (!btn) {
        // Button not in DOM yet, retry shortly
        setTimeout(attachButtonObserver, 200);
        return;
      }

      state._buttonObserver = new MutationObserver(() => {
        scheduleCombatTick("button-change");
      });

      // Watch the button itself AND its parent (some games swap the element)
      state._buttonObserver.observe(btn, {
        characterData: true,  // Text changes ("Attacking..." → "Attack (A)")
        childList: true,      // Children change
        attributes: true,     // disabled, class, etc
        subtree: true
      });

      // Also watch parent in case button element is replaced entirely
      if (btn.parentElement) {
        state._buttonObserver.observe(btn.parentElement, {
          childList: true,    // Button replaced
          subtree: false
        });
      }

      console.log("[AutoCombat] Dedicated button observer attached");
    }
    attachButtonObserver();
  }

  // Also watch the delay bar specifically for when it empties
  if (!state._delayBarObserver) {
    function attachDelayBarObserver() {
      const fill = document.getElementById("combat-delay-fill");
      if (!fill) {
        setTimeout(attachDelayBarObserver, 200);
        return;
      }

      state._delayBarObserver = new MutationObserver(() => {
        scheduleCombatTick("delay-bar-change");
      });

      state._delayBarObserver.observe(fill, {
        attributes: true,           // style.width changes
        attributeFilter: ['style'], // Only care about style
      });

      console.log("[AutoCombat] Dedicated delay bar observer attached");
    }
    attachDelayBarObserver();
  }

  // PROACTIVE TARGET SELECTION - Detect dead monsters IMMEDIATELY
  // This eliminates the 350ms penalty by selecting new targets DURING combat, not after
  if (!state._targetObserver) {
    const monsterSelect = document.getElementById("monster-select");
    if (monsterSelect) {
      state._targetObserver = new MutationObserver((mutations) => {
        // Skip if in combat (can't change target mid-fight anyway)
        const cs = getCombatState();
        if (cs && cs.inCombat) return;

        // Check if selected option is now invalid (monster died/vanished)
        const select = document.getElementById("monster-select");
        if (!select) return;

        const currentOpt = select.options?.[select.selectedIndex];
        const currentVal = String(select.value || "");
        const currentText = String(currentOpt?.textContent || "").toLowerCase();

        const isInvalid =
          !currentVal ||
          currentVal === "0" ||
          currentOpt?.disabled ||
          currentText.includes("vanished") ||
          currentText.includes("slain") ||
          currentText.includes("defeated") ||
          currentText.includes("fallen");

        if (isInvalid) {
          console.log("[ProactiveTarget] Current target invalid, selecting new target immediately");
          try {
            selectHighestLevelMonsterIfNeeded();
            // Trigger a tick to check if we can start next fight
            scheduleCombatTick("target-changed");
          } catch (e) {
            console.error("[ProactiveTarget] Error selecting new target:", e);
          }
        }
      });

      // Watch for changes to the dropdown options (monster dies, new monsters appear)
      state._targetObserver.observe(monsterSelect, {
        childList: true,     // Options added/removed
        subtree: true,       // Watch inside optgroups
        characterData: true, // Text changes (Lvl 5 Monster → Lvl 5 Monster [Slain])
        attributes: true,    // disabled attribute changes
        attributeFilter: ['disabled', 'value']
      });

      console.log("[ProactiveTarget] Target observer initialized - will detect dead monsters during combat");
    }
  }

  // Start performance monitoring loop (runs independently of script auto)
  if (!state._perfMonitorInterval) {
    state._perfMonitorInterval = setInterval(() => {
      try {
        const gameAuto = isGameAutoCombatRunning();
        const cs = getCombatState();
        const delayActive = !!(cs && cs.delayActive);

        // Monitor game auto by watching delay bar
        if (gameAuto) {
          // Action detected: delay just became active
          if (delayActive && !state._lastGameAutoDelayActive) {
            if (typeof window.__oaRecordAction === 'function') {
              window.__oaRecordAction('game');
            }
          }
          state._lastGameAutoDelayActive = delayActive;
        } else {
          state._lastGameAutoDelayActive = false;
        }
      } catch {}
    }, 50); // Check every 50ms
  }
}

function teardownCombatObserver() {
  try { if (state._combatObserver) state._combatObserver.disconnect(); } catch {}
  state._combatObserver = null;

  try { if (state._buttonObserver) state._buttonObserver.disconnect(); } catch {}
  state._buttonObserver = null;

  try { if (state._delayBarObserver) state._delayBarObserver.disconnect(); } catch {}
  state._delayBarObserver = null;

  // Clean up proactive target observer
  try { if (state._targetObserver) state._targetObserver.disconnect(); } catch {}
  state._targetObserver = null;

  if (state._combatRaf != null) {
    try { cancelAnimationFrame(state._combatRaf); } catch {}
  }
  state._combatRaf = null;

  // Clean up performance monitoring interval
  if (state._perfMonitorInterval) {
    try { clearInterval(state._perfMonitorInterval); } catch {}
    state._perfMonitorInterval = null;
  }
}

function scheduleLoop() {
  if (!state.enabled) return;
  ensureCombatObserver();
  ensureCombatEngine();
  scheduleCombatTick("scheduleLoop");
}

function stopLoop() {
  teardownCombatObserver();
  if (state._combatEngineInterval != null) {
    try { clearInterval(state._combatEngineInterval); } catch {}
    state._combatEngineInterval = null;
  }
  if (state._combatTickTimer != null) {
    try { clearTimeout(state._combatTickTimer); } catch {}
    state._combatTickTimer = null;
  }
  state._combatTickPending = false;
  state._combatBtnLockUntil = 0;
  state._combatDirty = false;
  state._combatDirtyReason = "";
  state._nextTickAt = 0;
  state._mainBtnLastClickAt = 0;

  if (state.loopTimer != null) {
    clearTimeout(state.loopTimer);
    state.loopTimer = null;
  }
  if (state._combatWakeTimer != null) {
    clearTimeout(state._combatWakeTimer);
    state._combatWakeTimer = null;
  }
  if (state._combatLoopRaf != null) {
    try { cancelAnimationFrame(state._combatLoopRaf); } catch {}
    state._combatLoopRaf = null;
  }
  state._actionInFlight = false;
  state._actionInFlightAt = 0;
  state._actionPrevSnap = null;

  state._serverAckGuardUntil = 0;
}

    function ensureCombatTab(reason) {
      try {
        if (location.pathname !== "/game.php") return true;
        const url = new URL(location.href);
        const tab = url.searchParams.get("tab") || "combat";
        if (tab !== "combat") {
          url.searchParams.set("tab", "combat");
          console.log("[AutoCombat] Switching to combat tab for", reason || "action");
          location.href = url.toString();
          return false;
        }
      } catch {}
      return true;
    }

    function enableScriptAuto(reason) {
      if (!ensureCombatTab(reason || "enableScriptAuto")) return;

      if (isGameAutoCombatRunning()) {
        log("Cannot enable script AutoCombat: game AutoCombat is currently running.");
        state.enabled = false;
        autoModeForRates = false;
        saveAutoCombatEnabled(false);
        try { if (window.__oaUpdateCombatBtn) window.__oaUpdateCombatBtn(); } catch {}
        return;
      }
      state.enabled = true;
      autoModeForRates = true;
      saveAutoCombatEnabled(true);
      log(`ENABLED${reason ? " (" + reason + ")" : ""}`);
      touchAutoCombatStart();
      scheduleLoop();
      try { if (window.__oaUpdateCombatBtn) window.__oaUpdateCombatBtn(); } catch {}
    }

    function disableScriptAuto(reason) {
      state.enabled = false;
      autoModeForRates = false;
      saveAutoCombatEnabled(false);
      log(`DISABLED${reason ? " (" + reason + ")" : ""}`);
      touchAutoCombatStop();
      stopLoop();
      try { if (window.__oaUpdateCombatBtn) window.__oaUpdateCombatBtn(); } catch {}
    }

    // Expose for header toggle button
    window.__oaEnableScriptAuto = enableScriptAuto;
    window.__oaDisableScriptAuto = disableScriptAuto;

    function enableGameAuto(reason) {
      if (!ensureCombatTab(reason || "enableGameAuto")) return;

      saveGameAutoWanted(true);
      const ok = tryStartGameAutoCombat(reason || "enableGameAuto");
      if (!ok) log("Tried to enable GAME AutoCombat but could not find start control.");
    }

    function disableGameAuto(reason) {
      saveGameAutoWanted(false);
      tryStopGameAutoCombat(reason || "disableGameAuto");
    }

function onAutoKey(e) {
      if (e.key !== "F1") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      e.preventDefault();

      if (!state.enabled) enableScriptAuto('F1');
      else disableScriptAuto('F1');
      // Update the auto combat button immediately
      try { if (typeof window.__oaUpdateAutoCombatBtn === 'function') window.__oaUpdateAutoCombatBtn(); } catch {}
}
    document.addEventListener("keydown", onAutoKey, true);

    // ========== F7: Auto-Target Players (PvP Mode) ==========
    const PVP_MODE_KEY = "oa_pvp_auto_target_v1";
    let pvpAutoTargetEnabled = false;

    function loadPvpAutoTarget() {
      try {
        const raw = localStorage.getItem(PVP_MODE_KEY);
        return raw === "true" || raw === "1";
      } catch { return false; }
    }

    function savePvpAutoTarget(enabled) {
      try { localStorage.setItem(PVP_MODE_KEY, enabled ? "true" : "false"); } catch {}
    }

    pvpAutoTargetEnabled = loadPvpAutoTarget();

    function findPlayerInDropdown() {
      const select = document.getElementById("monster-select");
      if (!select) return null;

      // Look for player option (value starts with "player:")
      const playerOption = Array.from(select.options).find(opt => {
        return opt.value && opt.value.startsWith("player:");
      });

      return playerOption || null;
    }

    function selectAndFightPlayer() {
      const playerOption = findPlayerInDropdown();
      if (!playerOption) {
        console.log("[PvP Auto] No player found in dropdown");
        return false;
      }

      const select = document.getElementById("monster-select");
      if (!select) return false;

      // Check if already targeting this player
      if (select.value === playerOption.value) {
        return true; // Already selected
      }

      console.log("[PvP Auto] Selecting player:", playerOption.value, playerOption.textContent);
      select.value = playerOption.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));

      return true;
    }

    // Hook into the combat loop to auto-target players when PvP mode is on
    function maybeSwitchToPlayer() {
      if (!pvpAutoTargetEnabled) return;
      if (!state.enabled) return; // Only when auto-combat is running

      const cs = getCombatState();
      // Only switch when not in combat (between fights)
      if (cs && cs.inCombat) return;

      const select = document.getElementById("monster-select");
      if (!select) return;

      // Check if currently targeting a player
      if (select.value && select.value.startsWith("player:")) return;

      // Try to switch to a player
      selectAndFightPlayer();
    }

    // Check for player targets periodically when PvP mode is on
    let pvpCheckInterval = null;

    function startPvpCheck() {
      if (pvpCheckInterval) return;
      pvpCheckInterval = setInterval(maybeSwitchToPlayer, 1000);
      console.log("[PvP Auto] Player targeting check started");
    }

    function stopPvpCheck() {
      if (pvpCheckInterval) {
        clearInterval(pvpCheckInterval);
        pvpCheckInterval = null;
        console.log("[PvP Auto] Player targeting check stopped");
      }
    }

    function onPvpToggleKey(e) {
      if (e.key !== "F7") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      e.preventDefault();

      pvpAutoTargetEnabled = !pvpAutoTargetEnabled;
      savePvpAutoTarget(pvpAutoTargetEnabled);

      if (pvpAutoTargetEnabled) {
        startPvpCheck();
        log("PvP Auto-Target: ON - Will target players when available");
        // Immediately try to select a player
        selectAndFightPlayer();
      } else {
        stopPvpCheck();
        log("PvP Auto-Target: OFF");
      }
    }
    document.addEventListener("keydown", onPvpToggleKey, true);

    // Start PvP check if it was enabled
    if (pvpAutoTargetEnabled) {
      startPvpCheck();
    }
    // ========== END F7 PvP Mode ==========

    function onModeToggleKey(e) {
      if (e.key !== "F3") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      e.preventDefault();

      const cs = getCombatState();
      const gameEnabled = !!cs?.autoCombat?.enabled;
      const gameRunning = isGameAutoCombatRunning();

      // Alternate between script AutoCombat and the game's built-in AutoCombat.
      if (state.enabled) {
        // Script -> Game
        disableScriptAuto("F3→Game");
        enableGameAuto("F3→Game");
        return;
      }

      if (gameRunning || gameEnabled || loadGameAutoWanted()) {
        // Game -> Script
        disableGameAuto("F3→Script");
        enableScriptAuto("F3→Script");
        return;
      }

      // If neither is active, start script auto by default.
      enableScriptAuto("F3→Script");
    }
    document.addEventListener("keydown", onModeToggleKey, true);

    // --- Movement hotkeys: Arrow keys + plane keys ([ / ]) ---
    const moveHotkeyState = { lastAt: 0 };
    const MOVE_KEY_COOLDOWN_MS = 120;

    function getHudLocationCard() {
      return document.getElementById("hud-location-card");
    }

    function clickHudMove(direction) {
      const card = getHudLocationCard();
      if (!card) return false;

      const form = card.querySelector(`form[data-map-move-form] input[name="direction"][value="${direction}"]`)?.closest("form");
      const btn = form?.querySelector('button[type="submit"], button:not([type])');
      if (!btn || btn.disabled) return false;

      btn.click();
      return true;
    }

    function clickHudPlane(planeId) {
      const card = getHudLocationCard();
      if (!card) return false;

      const form = card.querySelector(`form[data-plane-change-form] input[name="plane_id"][value="${planeId}"]`)?.closest("form");
      const btn = form?.querySelector('button[type="submit"], button:not([type])');
      if (!btn || btn.disabled) return false;

      btn.click();
      return true;

    // ===== Plane Manager (5-plane aware) =====
    const PLANE_ORDER = ["underworld", "katabasis", "aetheria", "aerion", "olympus"];
    const PLANE_SYNONYMS = {
      uw: "underworld", under: "underworld", underworld: "underworld",
      kat: "katabasis", kata: "katabasis", katabasis: "katabasis",
      aeth: "aetheria", aetheria: "aetheria", etheria: "aetheria",
      aer: "aerion", aerion: "aerion",
      oly: "olympus", olympus: "olympus",
      gaia: "olympus" // legacy mapping some builds used for "up"
    };

    function normalizePlaneName(v) {
      const raw = String(v || "").trim().toLowerCase();
      if (!raw) return "";
      const key = raw.replace(/[^a-z]/g, "");
      return PLANE_SYNONYMS[key] || key;
    }

    function planeTitle(p) {
      const n = normalizePlaneName(p);
      return n ? (n.charAt(0).toUpperCase() + n.slice(1)) : "";
    }

    function getCurrentPlaneName() {
      // Prefer CombatState.planeId, then HUD card dataset.
      try {
        const cs = getCombatState();
        const pid = cs?.planeId ?? getHudLocationCard()?.dataset?.planeId ?? getHudLocationCard()?.dataset?.plane ?? "";
        const norm = normalizePlaneName(pid);
        if (PLANE_ORDER.includes(norm)) return norm;
      } catch {}
      // As a last resort, parse from location key if it contains the plane token.
      try {
        const k = String(getCurrentLocationKey?.() || "");
        const m = k.match(/^\d{3},([^,]+),\d{3}$/i);
        const norm = normalizePlaneName(m ? m[1] : "");
        if (PLANE_ORDER.includes(norm)) return norm;
      } catch {}
      return "";
    }

    function getPlaneChangeForms() {
      const card = getHudLocationCard();
      if (!card) return [];
      const forms = Array.from(card.querySelectorAll('form[data-plane-change-form]'));
      return forms.map((f) => {
        const input = f.querySelector('input[name="plane_id"]');
        const val = input?.value ?? "";
        const target = normalizePlaneName(val);
        const btn = f.querySelector('button[type="submit"], button:not([type])');
        const label = String(btn?.textContent || "").trim().toLowerCase();
        return { f, btn, label, target, raw: String(val||"") };
      }).filter(o => o.btn && !o.btn.disabled);
    }

    function clickPlaneStep(direction) {
      const dir = String(direction || "").toLowerCase(); // "up" | "down"
      const cur = normalizePlaneName(((typeof detectPlaneStrictLocal === "function" ? detectPlaneStrictLocal() : "") || (typeof detectPlaneLocal === "function" ? detectPlaneLocal() : "") || (typeof getCurrentPlaneName === "function" ? getCurrentPlaneName() : "") || ""));
      const curIdx = PLANE_ORDER.indexOf(cur);
      const forms = getPlaneChangeForms();
      if (curIdx < 0) return false;
      if (!forms.length) {
        // Fallback: submit plane change directly (works even if HUD plane buttons aren't mounted on this tab).
        const targetIdx = (dir === "up") ? (curIdx + 1) : (dir === "down" ? (curIdx - 1) : curIdx);
        const targetPlane = PLANE_ORDER[targetIdx];
        if (!targetPlane) return false;
        try {
          const csrf = (document.querySelector('input[name="csrf_token"]')?.value || document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "").trim();
          if (!csrf) return false;
          const form = document.createElement("form");
          form.method = "POST";
          form.action = "/game.php";
          form.style.display = "none";
          const add = (n, v) => { const i = document.createElement("input"); i.type = "hidden"; i.name = n; i.value = String(v); form.appendChild(i); };
          add("csrf_token", csrf);
          add("action", "change_plane");
          add("plane_source", "userscript");
          add("plane_id", targetPlane);
          document.body.appendChild(form);
          form.submit();
          return true;
        } catch (e) { return false; }
      }

      // First: try by button label if present
      if (dir === "up") {
        const byLabel = forms.find(o => o.label.includes("ascend") || o.label.includes("up"));
        if (byLabel) { byLabel.btn.click(); return true; }
      }
      if (dir === "down") {
        const byLabel = forms.find(o => o.label.includes("descend") || o.label.includes("down"));
        if (byLabel) { byLabel.btn.click(); return true; }
      }

      // Second: infer by target plane index relative to current plane
      const scored = forms
        .map(o => ({...o, idx: PLANE_ORDER.indexOf(o.target)}))
        .filter(o => o.idx >= 0)
        .sort((a,b)=>a.idx-b.idx);

      if (!scored.length) return false;

      if (dir === "up") {
        const cand = scored.find(o => o.idx > curIdx) || scored[scored.length-1];
        if (cand) { cand.btn.click(); return true; }
      } else if (dir === "down") {
        const cand = [...scored].reverse().find(o => o.idx < curIdx) || scored[0];
        if (cand) { cand.btn.click(); return true; }
      }

      return false;
    }

    // Plane lock for PvE mobs (optional)
    const LS_PVE_PLANE_LOCK = "oa_pve_plane_lock_v1";
    const planeMgr = {
      desired: "",
      lastStepAt: 0,
      stepCooldownMs: 900,
      busy: false,
      get lock() { try { return normalizePlaneName(localStorage.getItem(LS_PVE_PLANE_LOCK) || ""); } catch { return ""; } },
      setLock(v) { try { const n = normalizePlaneName(v); if (n) localStorage.setItem(LS_PVE_PLANE_LOCK, n); else localStorage.removeItem(LS_PVE_PLANE_LOCK); } catch {} },
      clearLock() { try { localStorage.removeItem(LS_PVE_PLANE_LOCK); } catch {} },
      tick(reason) {
        const target = this.lock;
        if (!target) return false;

        const cs = getCombatState();
        if (cs && cs.inCombat) return true; // wait until out of combat

        const cur = getCurrentPlaneName();
        if (!cur || cur === target) return false;

        const now = Date.now();
        if (now - this.lastStepAt < this.stepCooldownMs) return true;

        const a = PLANE_ORDER.indexOf(cur);
        const b = PLANE_ORDER.indexOf(target);
        if (a < 0 || b < 0) return false;

        const dir = (b > a) ? "up" : "down";
        const ok = clickPlaneStep(dir);
        if (ok) this.lastStepAt = now;
        return ok;
      }
    };

    // Expose for console/debug
    try {
      window.__oaPlane = window.__oaPlane || {};
      window.__oaPlane.getCurrent = getCurrentPlaneName;
      window.__oaPlane.setPveLock = (p) => planeMgr.setLock(p);
      window.__oaPlane.clearPveLock = () => planeMgr.clearLock();
      window.__oaPlane.clickStepUp = () => clickPlaneStep("up");
      window.__oaPlane.clickStepDown = () => clickPlaneStep("down");
      window.__oaPlane.tick = () => planeMgr.tick("manual");
    } catch {}

    // ── Periodic plane lock enforcement ──
    // This runs every 1.5s to actually step planes when the lock is set.
    // Without this, the plane lock only gets checked inside canStartSelectedFight()
    // which may not fire frequently enough (e.g. after beast dies and lock is restored).
    setInterval(() => {
      try {
        // Skip if script auto is off
        if (!state.enabled) return;
        // Skip if kingdom auto is running
        if (localStorage.getItem("oa_kingdom_auto_running_v1") === "1") return;
        planeMgr.tick("periodic");
      } catch {}
    }, 1500);

}

    // --- Plane Hotkey Fix: local safe click helper (prevents ReferenceError if clickPlaneStep is out of scope) ---
    function __oaClickPlaneStep(direction) {
      try {
        const dir = String(direction || "").toLowerCase(); // "up" | "down"
        const forms = Array.from(document.querySelectorAll('form[data-plane-change-form]'));
        if (!forms.length) return false;

        const items = forms.map(f => {
          const btn = f.querySelector('button[type="submit"], button:not([type])');
          const title = String(btn?.getAttribute('title') || "");
          const txt = String(btn?.textContent || "");
          const joined = (title + " " + txt).toLowerCase();
          return { f, btn, joined };
        }).filter(o => o.btn && !o.btn.disabled);

        if (!items.length) return false;

        const pick = (needle) => items.find(o => o.joined.includes(needle));
        let chosen = null;

        if (dir === "up") {
          chosen = pick("ascend") || pick("p↑") || items.find(o => o.joined.includes("↑"));
        } else if (dir === "down") {
          chosen = pick("descend") || pick("p↓") || items.find(o => o.joined.includes("↓"));
        } else {
          return false;
        }

        if (!chosen) return false;
        if (chosen?.btn) { chosen.btn.click(); return true; }
      } catch {}
      return false;
    }

function onMoveHotkeys(e) {

      // --- Plane Lock Alt Hotkeys (more reliable than brackets) ---
      try {
        if (e.ctrlKey && e.altKey && !e.shiftKey) {
          if (e.code === "KeyL") { // lock to current
            const cur = window.__oaPlaneLock?.detectCurrentPlane?.() || "";
            if (cur) window.__oaPlaneLock?.set?.(cur);
            console.log("[PlaneLock] Ctrl+Alt+L => lock current:", cur || "(unknown)");
            try { e.preventDefault(); e.stopPropagation(); } catch {}
            return;
          }
          if (e.code === "KeyK") { // clear
            window.__oaPlaneLock?.clear?.();
            console.log("[PlaneLock] Ctrl+Alt+K => cleared");
            try { e.preventDefault(); e.stopPropagation(); } catch {}
            return;
          }
        }
      } catch {}

      // --- Plane Lock Hotkeys ---
      // Ctrl+Alt+Shift+[ : lock PvE plane to current plane (mobs only). Ctrl+Alt+Shift+] : clear lock.
      try {
        if (e.ctrlKey && e.altKey && e.shiftKey) {
          if (e.key === "[" || e.code === "BracketLeft") {
            const cur = (typeof getCurrentPlaneName === "function") ? getCurrentPlaneName() : "";
            if (cur) {
              try { localStorage.setItem("oa_pve_plane_lock_v1", String(cur)); } catch {}
              console.log("[PlaneLock] PvE plane locked to:", cur);
            } else {
              console.log("[PlaneLock] Unable to detect current plane; lock not set.");
            }
            try { e.preventDefault(); e.stopPropagation(); } catch {}
            return;
          }
          if (e.key === "]" || e.code === "BracketRight") {
            try { localStorage.removeItem("oa_pve_plane_lock_v1"); } catch {}
            console.log("[PlaneLock] PvE plane lock cleared");
            try { e.preventDefault(); e.stopPropagation(); } catch {}
            return;
          }
        }
      } catch {}
if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const now = Date.now();
      if (now - moveHotkeyState.lastAt < MOVE_KEY_COOLDOWN_MS) return;

      let handled = false;

      // Arrow keys move (north/south/west/east)
      if (e.key === "ArrowUp") handled = clickHudMove("north");
      else if (e.key === "ArrowDown") handled = clickHudMove("south");
      else if (e.key === "ArrowLeft") handled = clickHudMove("west");
      else if (e.key === "ArrowRight") handled = clickHudMove("east");

      // Brackets change plane (descend/ascend)
      // Support both key and code for keyboard layouts.
      if (!handled) {
if (e.key === "[" || e.code === "BracketLeft") handled = (typeof clickPlaneStep === "function" ? clickPlaneStep("down") : __oaClickPlaneStep("down"));
        else if (e.key === "]" || e.code === "BracketRight") handled = (typeof clickPlaneStep === "function" ? clickPlaneStep("up") : __oaClickPlaneStep("up"));
        }

        // Ctrl+Alt+Shift+[ : lock PvE plane to current plane; Ctrl+Alt+Shift+] : clear lock
        try {
          if (e.ctrlKey && e.altKey && e.shiftKey) {
            if (e.key === "[" || e.code === "BracketLeft") {
              const curP = getCurrentPlaneName();
              if (curP) { planeMgr.setLock(curP); notify(`PvE Plane Lock: ${planeTitle(curP)}`); handled = true; }
            } else if (e.key === "]" || e.code === "BracketRight") {
              planeMgr.clearLock(); notify("PvE Plane Lock: OFF"); handled = true;
            }
          }
        } catch {}

      if (!handled) return;

      moveHotkeyState.lastAt = now;
      e.preventDefault();
      e.stopPropagation();
    }

    document.addEventListener("keydown", onMoveHotkeys, true);

    document.addEventListener("click", (e) => {
      const target = e.target;
      if (!target) return;
      const btn = document.getElementById("combat-main-button");
      if (!btn) return;
      if (btn === target || btn.contains(target)) state.lastManualCombatClickAt = Date.now();
    });

    // Keep built-in game AutoCombat working even when scrolled: pin main combat button + delay bar into viewport.
    applyPinCombatUi(loadPinCombatUiEnabled());

    (function restoreAutoCombatState() {
      const persisted = loadAutoCombatEnabled();

      // Delay restore after plane returns so the UI can hydrate (prevents premature actions).
      const DELAY_KEY = "oa_autocombat_restore_delay_until_ms_v1";
      let delayMs = 0;
      try {
        const until = Number(localStorage.getItem(DELAY_KEY) || 0);
        const now = Date.now();
        if (Number.isFinite(until) && until > now) delayMs = Math.min(5000, until - now);
        if (until) localStorage.removeItem(DELAY_KEY);
      } catch {}

      if (persisted && !isGameAutoCombatRunning()) {
        if (delayMs > 0) {
          log("Restoring AutoCombat from previous page: ENABLED (delayed " + Math.round(delayMs) + "ms)");
          setTimeout(() => {
            try {
              // Respect any user change during delay.
              if (!loadAutoCombatEnabled()) return;
              if (isGameAutoCombatRunning()) { saveAutoCombatEnabled(false); return; }
              if (state.enabled) return;

              state.enabled = true;
              state.nextEligibleActionAt = 0;
              autoModeForRates = true;
              touchAutoCombatStart();
              scheduleLoop();
            } catch {}
          }, delayMs);
          return;
        }

        state.enabled = true;
        state.nextEligibleActionAt = 0;
        autoModeForRates = true;
        log("Restoring AutoCombat from previous page: ENABLED");
        touchAutoCombatStart();
        scheduleLoop();
      } else {
        autoModeForRates = false;
        if (persisted && isGameAutoCombatRunning()) {
          log("AutoCombat was persisted ON, but game AutoCombat is active; leaving script auto DISABLED.");
          saveAutoCombatEnabled(false);
        } else {
          log("AutoCombat restored as DISABLED");
        }
      }
    })();

    window.__autoCombat = {
      stop: () => {
        try { if (gameAutoKeepAliveTimer) { clearInterval(gameAutoKeepAliveTimer); gameAutoKeepAliveTimer = null; } } catch {}

        try { clearInterval(enforceBeastOnlyPolicyTimer); } catch {}
        try {
          if (pinCombatUi?.enforcerTimer) { clearInterval(pinCombatUi.enforcerTimer); pinCombatUi.enforcerTimer = null; }
        } catch {}

        document.removeEventListener("keydown", onAutoKey, true);
        document.removeEventListener("keydown", onModeToggleKey, true);
        state.enabled = false;
        autoModeForRates = false;
        state.nextEligibleActionAt = 0;
        saveAutoCombatEnabled(false);
        touchAutoCombatStop();
        stopLoop();
        stopBotcheckAlarm();
        if (botcheck.monitorTimer) { clearInterval(botcheck.monitorTimer); botcheck.monitorTimer = null; }
        try { localStorage.removeItem(BOTCHECK_RESUME_KEY); } catch {}

        // Refactor: make sure ALL submodules stop cleanly (timers, monitors, hotkeys).
        try { window.__oaMoveHotkeys?.stop?.(); } catch {}
        try { window.__oaCapSolver?.stop?.(); } catch {}
        try { window.__OA?.clearAll?.(); } catch {}

        delete window.__autoCombat;
        log("Unloaded");
      },
      status: () => ({ enabled: state.enabled, copiedCode: state.copiedCode, profile: getSelectedCombatProfile() }),
      resumeAutoCombatIfNeeded: resumeAutoCombatIfNeeded,
    };

    startBotcheckMonitor();

    // CRITICAL: Check for pending resume on initialization
    // This handles cases where page reloaded after security check passed
    setTimeout(() => {
      console.log('[AutoCombat] Initialization: checking for pending resume...');
      const resumeKey = localStorage.getItem(BOTCHECK_RESUME_KEY);
      console.log('[AutoCombat] Initialization: BOTCHECK_RESUME_KEY =', resumeKey);

      if (resumeKey === "1") {
        console.log('[AutoCombat] Initialization: Found pending resume, triggering...');
        // Wait a bit for everything to be ready, then try to resume
        setTimeout(() => {
          resumeAutoCombatIfNeeded();
        }, 1000);
      } else {
        console.log('[AutoCombat] Initialization: No pending resume');
      }
    }, 500);

    startPanelLayoutLoop();
    if (panelLayout.enabled) applyPanelLayoutIfNeeded();

    window.__oaMoveHotkeys = {
      stop: () => {
        try { document.removeEventListener("keydown", onMoveHotkeys, true); } catch {}
        delete window.__oaMoveHotkeys;
      },
    };

    log("Loaded. F1: Script AutoCombat, F2: Last Beast, F3: Toggle Script→Game AutoCombat, 1–9: tabs.");

    // Keep the game's built-in AutoCombat running when AutoKeep is enabled in the HUD.
// This will turn auto ON if it's off, but never turn it OFF.
let gameAutoKeepAliveTimer = null;
let lastGameAutoRestartAt = 0;

function stopGameAutoKeepAliveLoop() {
  if (gameAutoKeepAliveTimer) {
    clearInterval(gameAutoKeepAliveTimer);
    gameAutoKeepAliveTimer = null;
  }
}

function startGameAutoKeepAliveLoop() {
  if (gameAutoKeepAliveTimer) return;
  gameAutoKeepAliveTimer = setInterval(() => {
    // Master gate: HUD AutoKeep toggle
    if (!loadGameAutoForce()) return;

    // Only meaningful on Combat tab
    try {
      if (location.pathname !== "/game.php") return;
      const tab = new URL(location.href).searchParams.get("tab") || "combat";
      if (tab !== "combat") return;
    } catch {}

    // If script AutoCombat is running, don't fight it.
    if (state.enabled) return;

    // If a Security Check is visible, don't spam auto toggles.
    if (isBotcheckVisible()) return;

    // If it's already running, nothing to do.
    if (isGameAutoCombatRunning()) return;

    // Avoid spamming attempts (minimum 10 seconds between attempts)
    const now = Date.now();
    if (now - lastGameAutoRestartAt < 10000) return;

    // If we are mid-action delay, let it settle.
    const cs = getCombatState();
    const remaining = getDelayMsRemaining();
    if ((cs && cs.delayActive) || remaining > 250) return;

    lastGameAutoRestartAt = now;

    // Keep the persisted "wanted" flag ON so page switches can resume.
    saveGameAutoWanted(true);

    // This will only click if auto is actually OFF (checks button label first)
    tryStartGameAutoCombat("autokeep");
  }, 2000); // Check every 2 seconds
}

// Start keepalive only if AutoKeep is enabled.
if (loadGameAutoForce()) startGameAutoKeepAliveLoop();

    // Enforce beast-only target policy even when script AutoCombat is OFF (helps built-in game auto too).
    let lastPlaneSeen = null;
    const enforceBeastOnlyPolicy = () => {
      const planeId = getPlaneIdSafe();
      if (!planeId) return;
      const beastOnly = BEAST_ONLY_PLANES.has(String(planeId));

      // If we just changed into a beast-only plane, clear target immediately to avoid stale mobs.
      if (planeId !== lastPlaneSeen) {
        lastPlaneSeen = planeId;
        if (beastOnly) {
          try { selectHighestLevelMonsterIfNeeded(); } catch {}
        }
      }

      if (!beastOnly) return;

      const select = document.getElementById("monster-select");
      if (!select) return;

      const opt = select.options?.[select.selectedIndex] || null;
      const val = String(select.value || "");
      const isBeast = opt ? (String(opt.value || "").startsWith("beast:") || opt.dataset?.beastOption === "1") : (val.startsWith("beast:"));
      if (!isBeast) {
        try { selectHighestLevelMonsterIfNeeded(); } catch {}
      }
    };

    const enforceBeastOnlyPolicyTimer = setInterval(enforceBeastOnlyPolicy, 900);

    (function () {
      const UI_ID = "oa-last-beast-ui";

      const INFLIGHT_MAX_MS = 45_000; // safety window
      const INFLIGHT_RETRY_AFTER_MS = 4_000;

      function loadInflightTeleport() {
        try {
          const raw = localStorage.getItem(BEAST_INFLIGHT_KEY);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object") return null;
          return parsed;
        } catch { return null; }
      }
      function saveInflightTeleport(obj) { try { localStorage.setItem(BEAST_INFLIGHT_KEY, JSON.stringify(obj)); } catch {} }
      function clearInflightTeleport() { try { localStorage.removeItem(BEAST_INFLIGHT_KEY); } catch {} }

      const POS_STORE_KEY = "oa_last_beast_pos_v1";
      const HUD_FLOAT_KEY = "oa_hud_float_v1";
      const BEAST_STORE_KEY = "oa_last_beast_seen_v3";
      const AUTO_STORE_KEY = "oa_last_beast_auto_v1";
      const FORCE_F2_KEY = "oa_f2_force_ignore_delay_v1";

      const SECURITY_BEEP_KEY = "oa_security_beep_enabled_v1";
      const SECURITY_BEEP_COOLDOWN_MS = 30_000;
      const DEBUG_STORE_KEY = "oa_last_beast_debug_v1";

      // 2 hours per location
      const LOCATION_COOLDOWNS_KEY = "oa_beast_location_cooldowns_v2";
      const SPAWN_BACKOFF_KEY = "oa_beast_spawn_backoff_v1";
      const SPAWN_BACKOFF_MS = 90 * 1000; // 90s anti-spam across page/plane switches

      try { localStorage.removeItem("oa_beast_location_cooldowns_v1"); } catch {}

      const LOCATION_COOLDOWN_MS = 2 * 60 * 60 * 1000;

      document.getElementById(UI_ID)?.remove();

      function uiLog(m, o) { console.log(`[LastBeast] ${m}`, o ?? ""); }
      function getCurrentTab() { return new URL(location.href).searchParams.get("tab") || "combat"; }

      // ------------------------------
      // ------------------------------
      // ------------------------------
      // Teleports (Last Beast + Coords) via SAME behavior as pressing F2,
      // plus a small retry loop for the common failure case: CSRF isn't available yet right after redirect.
      // ------------------------------
      let lastTeleportSubmitAt = 0;
      const TELEPORT_SUBMIT_MIN_GAP_MS = 900;

      let teleportRetryTimer = null;
      let teleportRetryJob = null; // { kind, source, cdKey, x, y, attempts, maxAttempts }

      // Chariot cooldown: track when we last successfully used the chariot (from chat message)
      const CHARIOT_COOLDOWN_KEY = "oa_chariot_last_use_ms_v1";
      const CHARIOT_COOLDOWN_MS = 10000; // 10 seconds

      function getChariotCooldownRemaining() {
        try {
          const lastUse = Number(localStorage.getItem(CHARIOT_COOLDOWN_KEY) || 0);
          if (!lastUse) return 0;
          const elapsed = Date.now() - lastUse;
          return Math.max(0, CHARIOT_COOLDOWN_MS - elapsed);
        } catch { return 0; }
      }

      function setChariotCooldown() {
        try { localStorage.setItem(CHARIOT_COOLDOWN_KEY, String(Date.now())); } catch {}
      }

      function isChariotOnCooldown() {
        return getChariotCooldownRemaining() > 0;
      }

      function canSubmitTeleportNow() {
        return Date.now() - lastTeleportSubmitAt >= TELEPORT_SUBMIT_MIN_GAP_MS;
      }

      function getTeleportBlockReason() {
        const cs = getCombatState();

        // Primary: CombatState timing (best)
        const readyAt = Number(cs?.nextActionReadyAt || 0);
        if (cs && cs.delayActive) {
          const remainingMs = Math.max(0, readyAt ? (readyAt - Date.now()) : getDelayMsRemaining());
          return { blocked: true, remainingMs: remainingMs || 250, reason: "cs.delayActive" };
        }
        const remaining = getDelayMsRemaining();
        if (remaining > 0) return { blocked: true, remainingMs: remaining, reason: "cs.nextActionReadyAt" };

        // Fallback: DOM combat-config timing (works on Map tab too)
        const domReadyAt = getActionReadyAtFromDom();
        if (domReadyAt && Number.isFinite(domReadyAt)) {
          const diff = domReadyAt - Date.now();
          if (diff > 0) return { blocked: true, remainingMs: diff, reason: "dom.nextActionTsMs" };
        }

        // Last fallback: visual delay bar fill width
        if (!isDelayBarReady()) return { blocked: true, remainingMs: 250, reason: "delaybar" };

        return { blocked: false, remainingMs: 0, reason: "ready" };
      }

      function scheduleTeleportRetry(job) {
        teleportRetryJob = job;

        if (teleportRetryTimer) return;

        teleportRetryTimer = setInterval(() => {
          if (!teleportRetryJob) {
            clearInterval(teleportRetryTimer);
            teleportRetryTimer = null;
            return;
          }

          if (getCurrentTab() !== "map") return;

          const csrf = getCsrfToken();
          if (!csrf) {
            status.textContent = "Waiting for CSRF token…";
            teleportRetryJob.attempts += 1;
            if (teleportRetryJob.attempts >= teleportRetryJob.maxAttempts) {
              status.textContent = "Teleport failed (no CSRF). Try F2 once on Map.";
              uiLog("Teleport retry exhausted (no CSRF).", teleportRetryJob);
              teleportRetryJob = null;
            }
            return;
          }

          const force = !!forceF2IgnoreDelay && job.kind === "lastbeast" && String(job.source || "") === "hotkey";
const block = getTeleportBlockReason();
if (block.blocked && !force) {
  const s = Math.max(0.1, Math.ceil(block.remainingMs / 100) / 10);
  status.textContent = `Waiting for action delay… ${s}s`;
  return;
}

          if (teleportRetryJob && teleportRetryJob.kind === "coords" && !canSubmitTeleportNow()) return;

          const job = teleportRetryJob;
          const hasLastBeastForm = job && job.kind === "lastbeast" && !!findTeleportLastBeastForm();
          teleportRetryJob = null;

          if (job.kind === "lastbeast") doSubmitLastBeastNow(job.source, job.cdKey);
          else if (job.kind === "coords") doSubmitTeleportCoordsNow(job.x, job.y, job.source);
        }, 250);
      }

function findTeleportLastBeastForm() {
  const actionInput =
    document.querySelector('form input[name="action"][value="teleport_last_beast"]') ||
    document.querySelector('form input[name="action"][value="teleport_last_beast" i]') ||
    document.querySelector('input[name="action"][value="teleport_last_beast"]');

  return actionInput?.closest("form") || null;
}

function clickOrSubmitForm(form) {
  if (!form) return false;
  const btn =
    form.querySelector('button[type="submit"]') ||
    form.querySelector('button') ||
    form.querySelector('input[type="submit"]');
  try {
    if (btn && typeof btn.click === "function") {
      btn.click();
      return true;
    }
  } catch {}
  try {
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
      return true;
    }
  } catch {}
  try {
    form.submit();
    return true;
  } catch {}
  return false;
}

function doSubmitLastBeastNow(source, cdKey) {
        const currentTab = getCurrentTab();
        console.log("[AutoBeast] doSubmitLastBeastNow called, tab:", currentTab);

        if (currentTab !== "map") {
          console.log("[AutoBeast] Not on map tab, current:", currentTab);
          return;
        }

const force = !!forceF2IgnoreDelay && String(source || "") === "hotkey";
const block = getTeleportBlockReason();
console.log("[AutoBeast] Block check:", block);
if (block.blocked && !force) {
  const s = Math.max(0.1, Math.ceil(block.remainingMs / 100) / 10);
  console.log("[AutoBeast] Blocked by action delay:", s, "seconds");
  status.textContent = `Waiting for action delay… ${s}s`;
  scheduleTeleportRetry({ kind: "lastbeast", source: source || "unknown", cdKey: cdKey || "", attempts: 0, maxAttempts: 80 });
  return;
}

        const csrf = getCsrfToken();
        console.log("[AutoBeast] CSRF token:", csrf ? "found" : "NOT FOUND");
        if (!csrf) {
          status.textContent = "Waiting for CSRF token…";
          scheduleTeleportRetry({ kind: "lastbeast", source: source || "unknown", cdKey: cdKey || "", attempts: 0, maxAttempts: 40 });
          return;
        }

        // Clear any pending beast request once we're actually submitting.
        try { localStorage.removeItem(BEAST_PENDING_KEY); } catch {}
        recordBeastTeleport(source || "unknown");

        // Always return to combat after teleport submits (auto + hotkeys).
        try { localStorage.setItem(BEAST_RETURN_KEY, "1"); } catch {}

        // Find the "Ride to the Last Beast" button or form
        let form = null;
        let rideButton = null;

        // Method 1: Find by action input (most reliable based on the HTML provided)
        const actionInput = document.querySelector('input[name="action"][value="teleport_last_beast"]');
        console.log("[AutoBeast] Action input found:", !!actionInput);
        if (actionInput) {
          form = actionInput.closest("form");
          rideButton = form?.querySelector('button[type="submit"]');
          console.log("[AutoBeast] Form found:", !!form, "Button found:", !!rideButton);
        }

        // Method 2: Find by button text as fallback
        if (!rideButton) {
          const allButtons = document.querySelectorAll('button[type="submit"]');
          console.log("[AutoBeast] Searching", allButtons.length, "submit buttons");
          for (const btn of allButtons) {
            const txt = (btn.textContent || "").toLowerCase().trim();
            console.log("[AutoBeast] Button text:", txt);
            if (txt.includes("ride to the last beast") || txt.includes("last beast")) {
              rideButton = btn;
              form = btn.closest("form");
              console.log("[AutoBeast] Found 'Ride to Last Beast' button via text search");
              break;
            }
          }
        }

        if (!form && !rideButton) {
          console.log("[AutoBeast] ERROR: No teleport form/button found on map page!");
          status.textContent = "Waiting for Map teleport form…";
          scheduleTeleportRetry({ kind: "lastbeast", source: source || "unknown", cdKey: cdKey || "", attempts: 0, maxAttempts: 80 });
          return;
        }

        // If we have a form, check for nonce
        if (form) {
          const nonceInput = form.querySelector('input[name="map_nonce"]');
          console.log("[AutoBeast] Nonce found:", !!nonceInput, nonceInput?.value ? "has value" : "NO VALUE");
          if (!nonceInput || !nonceInput.value) {
            status.textContent = "Waiting for Map nonce…";
            scheduleTeleportRetry({ kind: "lastbeast", source: source || "unknown", cdKey: cdKey || "", attempts: 0, maxAttempts: 80 });
            return;
          }

          const ensureHidden = (name, value) => {
            let i = form.querySelector(`input[name="${name}"]`);
            if (!i) {
              i = document.createElement("input");
              i.type = "hidden";
              i.name = name;
              form.appendChild(i);
            }
            i.value = String(value);
          };

          ensureHidden("csrf_token", csrf);
          ensureHidden("from_tab", currentTab);
        }

        status.textContent = "Riding to last beast…";
        uiLog("Submitting teleport_last_beast from Map tab", { from_tab: currentTab, source, cdKey });

        // Track inflight teleport
        const _cdKey = cdKey || "";
        if (_cdKey) {
          try { setCooldownForLocation(_cdKey, "submit"); } catch {}
          const fromLoc = getCurrentLocationKey();
          const inflight = {
            kind: "lastbeast",
            cdKey: _cdKey,
            source: source || "unknown",
            submittedAt: Date.now(),
            attempts: 1,
            fromLoc: fromLoc || ""
          };
          saveInflightTeleport(inflight);
        }

        lastTeleportSubmitAt = Date.now();

        // CRITICAL: Clear pending key BEFORE clicking to prevent loops
        try { localStorage.removeItem(BEAST_PENDING_KEY); } catch {}

        // Submit - click the button
        if (rideButton) {
          console.log("[AutoBeast] CLICKING 'Ride to Last Beast' button NOW!");
          rideButton.click();
        } else if (form) {
          console.log("[AutoBeast] SUBMITTING form NOW!");
          form.requestSubmit ? form.requestSubmit() : form.submit();
        }
      }

      // NEW: Teleport to beast using /rc chat command
      // Key for storing the plane to return to after beast fight
      const BEAST_RETURN_PLANE_KEY = "oa_beast_return_plane_v1";

      // Retry state for /rc command when waiting for action delay
      let rcRetryTimer = null;
      let rcRetryJob = null;

      async function teleportViaChatCommand(source, cdKey) {
        console.log("[AutoBeast] Using /rc chat command to teleport...");

        // Check chariot cooldown (10 seconds after successful use)
        const chariotCd = getChariotCooldownRemaining();
        if (chariotCd > 0) {
          const s = Math.ceil(chariotCd / 1000);
          console.log("[AutoBeast] Chariot on cooldown:", s, "seconds remaining");
          status.textContent = `Chariot cooldown: ${s}s…`;

          // Schedule retry
          rcRetryJob = { source, cdKey };
          if (!rcRetryTimer) {
            rcRetryTimer = setInterval(() => {
              if (!rcRetryJob) {
                clearInterval(rcRetryTimer);
                rcRetryTimer = null;
                return;
              }

              const cd = getChariotCooldownRemaining();
              if (cd <= 0) {
                const job = rcRetryJob;
                rcRetryJob = null;
                clearInterval(rcRetryTimer);
                rcRetryTimer = null;
                console.log("[AutoBeast] Chariot cooldown cleared, retrying...");
                teleportViaChatCommand(job.source, job.cdKey);
              } else {
                const secs = Math.ceil(cd / 1000);
                status.textContent = `Chariot cooldown: ${secs}s…`;
              }
            }, 500);
          }
          return false;
        }

        // Check if in combat - can't teleport during combat
        const cs = getCombatState();
        if (cs && cs.inCombat) {
          console.log("[AutoBeast] In combat, waiting...");
          status.textContent = "Waiting for combat to end…";

          // Schedule retry
          rcRetryJob = { source, cdKey };
          if (!rcRetryTimer) {
            rcRetryTimer = setInterval(() => {
              if (!rcRetryJob) {
                clearInterval(rcRetryTimer);
                rcRetryTimer = null;
                return;
              }

              const checkCs = getCombatState();
              if (!checkCs || !checkCs.inCombat) {
                const job = rcRetryJob;
                rcRetryJob = null;
                clearInterval(rcRetryTimer);
                rcRetryTimer = null;
                console.log("[AutoBeast] Combat ended, proceeding with /rc");
                doTeleportViaChatCommand(job.source, job.cdKey);
              } else {
                status.textContent = "Waiting for combat to end…";
              }
            }, 500);
          }
          return false;
        }

        // Check action delay (red bar)
        const block = getTeleportBlockReason();
        if (block.blocked) {
          const s = Math.max(0.1, Math.ceil(block.remainingMs / 100) / 10);
          console.log("[AutoBeast] Blocked by action delay:", s, "seconds");
          status.textContent = `Waiting for action delay… ${s}s`;

          // Schedule retry
          rcRetryJob = { source, cdKey };
          if (!rcRetryTimer) {
            rcRetryTimer = setInterval(() => {
              if (!rcRetryJob) {
                clearInterval(rcRetryTimer);
                rcRetryTimer = null;
                return;
              }

              const checkCs = getCombatState();
              if (checkCs && checkCs.inCombat) {
                status.textContent = "Waiting for combat to end…";
                return;
              }

              const checkBlock = getTeleportBlockReason();
              if (!checkBlock.blocked) {
                const job = rcRetryJob;
                rcRetryJob = null;
                clearInterval(rcRetryTimer);
                rcRetryTimer = null;
                console.log("[AutoBeast] Action delay cleared, proceeding with /rc");
                doTeleportViaChatCommand(job.source, job.cdKey);
              } else {
                const secs = Math.max(0.1, Math.ceil(checkBlock.remainingMs / 100) / 10);
                status.textContent = `Waiting for action delay… ${secs}s`;
              }
            }, 200);
          }
          return false;
        }

        return doTeleportViaChatCommand(source, cdKey);
      }

      async function doTeleportViaChatCommand(source, cdKey) {
        // Get CSRF token
        const csrf = window.csrfToken || getCsrfToken();
        if (!csrf) {
          console.log("[AutoBeast] No CSRF token for chat command");
          status.textContent = "Waiting for CSRF token…";
          return false;
        }

        // Clear pending state
        try { localStorage.removeItem(BEAST_PENDING_KEY); } catch {}

        // Record the teleport
        recordBeastTeleport(source || "rc_command");

        // Set return flag to go back to combat tab
        try { localStorage.setItem(BEAST_RETURN_KEY, "1"); } catch {}

        // IMPORTANT: Save the current PvE plane lock so we can restore it after beast fight
        // Then clear it so combat doesn't try to switch planes during beast fight
        try {
          const currentPlaneLock = localStorage.getItem("oa_pve_plane_lock_v1");
          if (currentPlaneLock) {
            localStorage.setItem(BEAST_RETURN_PLANE_KEY, currentPlaneLock);
            console.log("[AutoBeast] Saved return plane:", currentPlaneLock);
          }
          localStorage.removeItem("oa_pve_plane_lock_v1");
          console.log("[AutoBeast] Temporarily cleared PvE plane lock for beast fight");
        } catch {}

        // Send /rc command via chat API
        const formData = new FormData();
        formData.append('message', '/rc');
        formData.append('csrf_token', csrf);

        try {
          status.textContent = "Sending /rc command…";
          const response = await fetch('api/chat_api.php', {
            method: 'POST',
            body: formData,
            credentials: 'same-origin',
          });

          if (response.ok) {
            console.log("[AutoBeast] /rc command sent successfully!");
            status.textContent = "Teleporting via /rc…";
            lastTeleportSubmitAt = Date.now();

            // Store teleport time so we can detect new limit messages after page reload
            try { localStorage.setItem("oa_beast_teleport_time_v1", String(Date.now())); } catch {}

            // Set cooldown for this location
            if (cdKey) {
              try { setCooldownForLocation(cdKey, "rc_teleport"); } catch {}
            }

            // Force page reload to get updated plane/position data
            setTimeout(() => {
              console.log("[AutoBeast] Reloading to combat tab after /rc teleport...");
              const url = new URL(location.href);
              url.searchParams.set("tab", "combat");
              location.href = url.toString();
            }, 1500);

            return true;
          } else {
            console.log("[AutoBeast] /rc command failed:", response.status);
            status.textContent = "Teleport failed: " + response.status;
            // Restore plane lock on failure
            try {
              const savedPlane = localStorage.getItem(BEAST_RETURN_PLANE_KEY);
              if (savedPlane) {
                localStorage.setItem("oa_pve_plane_lock_v1", savedPlane);
                localStorage.removeItem(BEAST_RETURN_PLANE_KEY);
                console.log("[AutoBeast] Restored plane lock after failed teleport:", savedPlane);
              }
            } catch {}
            return false;
          }
        } catch (err) {
          console.log("[AutoBeast] /rc command error:", err);
          status.textContent = "Teleport error: " + err.message;
          // Restore plane lock on error
          try {
            const savedPlane = localStorage.getItem(BEAST_RETURN_PLANE_KEY);
            if (savedPlane) {
              localStorage.setItem("oa_pve_plane_lock_v1", savedPlane);
              localStorage.removeItem(BEAST_RETURN_PLANE_KEY);
              console.log("[AutoBeast] Restored plane lock after error:", savedPlane);
            }
          } catch {}
          return false;
        }
      }

      // Function to restore plane lock after beast is killed or no beast found
      function restorePlaneLockAfterBeast() {
        try {
          const savedPlane = localStorage.getItem(BEAST_RETURN_PLANE_KEY);
          if (savedPlane) {
            localStorage.setItem("oa_pve_plane_lock_v1", savedPlane);
            localStorage.removeItem(BEAST_RETURN_PLANE_KEY);
            console.log("[AutoBeast] Restored PvE plane lock:", savedPlane);
            return savedPlane;
          }
        } catch {}
        return null;
      }

      // Periodic check: restore plane lock when no beasts are available
      // This runs every 2 seconds to catch beast death or "no beast" situations
      (function startBeastPlaneRestoreMonitor() {
        setInterval(() => {
          try {
            // Only check if we have a saved plane to restore
            const savedPlane = localStorage.getItem(BEAST_RETURN_PLANE_KEY);
            if (!savedPlane) return;

            // Check if there are any beasts in the dropdown
            const select = document.getElementById("monster-select");
            if (!select) return;

            const hasBeast = Array.from(select.options).some(opt =>
              opt.hasAttribute('data-beast-option') ||
              (opt.value && String(opt.value).startsWith("beast:"))
            );

            // Also check CombatState.beasts if available
            const cs = window.CombatState;
            const csHasBeasts = cs && Array.isArray(cs.beasts) && cs.beasts.length > 0;

            // If no beasts anywhere, restore the plane lock
            if (!hasBeast && !csHasBeasts) {
              localStorage.setItem("oa_pve_plane_lock_v1", savedPlane);
              localStorage.removeItem(BEAST_RETURN_PLANE_KEY);
              console.log("[AutoBeast] Monitor: No beasts detected - restored PvE plane lock:", savedPlane);

              // Immediately trigger plane stepping
              try { planeMgr.tick("beast_restore"); } catch {}

              // Notify user
              try {
                if (window.gameNotifications && typeof window.gameNotifications.show === "function") {
                  window.gameNotifications.show("Beast dead/gone - returning to " + savedPlane);
                }
              } catch {}
            }
          } catch (e) {
            console.log("[AutoBeast] Monitor error:", e);
          }
        }, 2000);
      })();

      function submitLastBeast(source, cdKey) {
        console.log("[AutoBeast] submitLastBeast called:", source);

        if (String(source || "") === "auto" && !autoBeastEnabled) {
          console.log("[AutoBeast] Auto disabled, ignoring");
          return;
        }

        // Use /rc chat command - it always teleports to the last beast
        teleportViaChatCommand(source, cdKey);
      }

      function parseLocTripleToXY(loc) {
        const raw = String(loc || "").trim();
        const mm = raw.match(/(\d{1,3})\s*,\s*[^,]+\s*,\s*(\d{1,3})/);
        if (!mm) return null;
        const x = parseInt(mm[1], 10);
        const y = parseInt(mm[2], 10);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { x, y };
      }

      function clampTeleportXY(x, y) {
        const container = document.querySelector('[data-map-view]');
        if (!container || !container.dataset) return { x, y };
        const w = Number(container.dataset.planeWidth);
        const h = Number(container.dataset.planeHeight);
        const ww = Number.isFinite(w) && w > 0 ? w : null;
        const hh = Number.isFinite(h) && h > 0 ? h : null;
        return {
          x: ww != null ? Math.max(0, Math.min(ww - 1, x)) : x,
          y: hh != null ? Math.max(0, Math.min(hh - 1, y)) : y,
        };
      }

      function doSubmitTeleportCoordsNow(x, y, source) {
        const currentTab = getCurrentTab();
        if (currentTab !== "map") return;

        const block = getTeleportBlockReason();
        if (block.blocked) {
          const s = Math.max(0.1, Math.ceil(block.remainingMs / 100) / 10);
          status.textContent = `Waiting for action delay… ${s}s`;
          scheduleTeleportRetry({ kind: "coords", x, y, source: source || "unknown", attempts: 0, maxAttempts: 80 });
          return;
        }

        if (!canSubmitTeleportNow()) {
          scheduleTeleportRetry({ kind: "coords", x, y, source: source || "unknown", attempts: 0, maxAttempts: 80 });
          return;
        }

        const csrf = getCsrfToken();
        if (!csrf) {
          status.textContent = "Waiting for CSRF token…";
          scheduleTeleportRetry({ kind: "coords", x, y, source: source || "unknown", attempts: 0, maxAttempts: 40 });
          return;
        }

        // Clear any pending coord request once we're actually submitting.
        try { localStorage.removeItem(COORD_PENDING_KEY); } catch {}

        try { localStorage.setItem(BEAST_RETURN_KEY, "1"); } catch {}

        const { x: cx, y: cy } = clampTeleportXY(x, y);

        const actionInput = document.querySelector('form input[name="action"][value="teleport_map"]');
        const form = actionInput?.closest("form");
        if (!form) {
          status.textContent = "Waiting for Map teleport form…";
          scheduleTeleportRetry({ kind: "coords", x, y, source: source || "unknown", attempts: 0, maxAttempts: 80 });
          return;
        }

        const nonceInput = form.querySelector('input[name="map_nonce"]');
        if (!nonceInput || !nonceInput.value) {
          status.textContent = "Waiting for Map nonce…";
          scheduleTeleportRetry({ kind: "coords", x, y, source: source || "unknown", attempts: 0, maxAttempts: 80 });
          return;
        }

        const ensureHidden = (name, value) => {
          let i = form.querySelector(`input[name="${name}"]`);
          if (!i) {
            i = document.createElement("input");
            i.type = "hidden";
            i.name = name;
            form.appendChild(i);
          }
          i.value = String(value);
        };

        const ensureNumber = (name, value) => {
          let i = form.querySelector(`input[name="${name}"]`);
          if (!i) {
            i = document.createElement("input");
            i.type = "hidden";
            i.name = name;
            form.appendChild(i);
          }
          i.value = String(value);
        };

        ensureHidden("csrf_token", csrf);
        ensureNumber("teleport_x", cx);
        ensureNumber("teleport_y", cy);

        status.textContent = `Teleporting to (${cx}, ${cy})…`;
        uiLog("Submitting teleport_map", { x: cx, y: cy, source });

        lastTeleportSubmitAt = Date.now();
        form.requestSubmit ? form.requestSubmit() : form.submit();
      }

      function submitTeleportCoords(x, y, source) {
        const currentTab = getCurrentTab();

        const xx = parseInt(String(x), 10);
        const yy = parseInt(String(y), 10);
        if (!Number.isFinite(xx) || !Number.isFinite(yy)) {
          status.textContent = "Invalid coords (need numbers).";
          return uiLog("teleport_map invalid coords", { x, y });
        }

        if (currentTab !== "map") {
          try { localStorage.setItem(COORD_PENDING_KEY, JSON.stringify({ x: xx, y: yy, source: source || "unknown" })); } catch {}
          status.textContent = "Coord teleport requires Map – switching to Map…";
          uiLog(`Coord teleport requested from tab "${currentTab}", redirecting to Map first.`, { x: xx, y: yy });

          const url = new URL(location.href);
          url.pathname = "/game.php";
          url.searchParams.set("tab", "map");
          location.href = url.toString();
          return;
        }

        doSubmitTeleportCoordsNow(xx, yy, source);
      }
      // Expose HUD coordinate teleport for other modules (e.g., Kingdom Auto)
      try { window.__oaTeleportToCoords = submitTeleportCoords; } catch {}

      function findEmbeddedHudHost() {
        const loc = document.getElementById('hud-location-card');
        if (loc && loc.parentElement) return loc.parentElement;

        const sel = ['#game-top-bar', '#oa-game-root #game-top-bar', 'header'];
        for (const s of sel) {
          const el = document.querySelector(s);
          if (el) return el;
        }
        return null;
      }

      function makeDraggable(el) {
        const saved = (() => {
          try { return JSON.parse(localStorage.getItem(POS_STORE_KEY) || "null"); }
          catch { return null; }
        })();

        if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
          el.style.left = `${saved.left}px`;
          el.style.top = `${saved.top}px`;
          el.style.right = "auto";
          el.style.bottom = "auto";
        }

        let dragging = false;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;

        function onDown(e) {
          if (!e.shiftKey) return;
          if (e.button != null && e.button !== 0) return;

          dragging = true;
          el.style.cursor = "grabbing";

          const r = el.getBoundingClientRect();
          startLeft = r.left;
          startTop = r.top;

          startX = (e.touches ? e.touches[0].clientX : e.clientX);
          startY = (e.touches ? e.touches[0].clientY : e.clientY);

          e.preventDefault();
          e.stopPropagation();

          addEventListener("mousemove", onMove, true);
          addEventListener("mouseup", onUp, true);
          addEventListener("touchmove", onMove, { capture: true, passive: false });
          addEventListener("touchend", onUp, true);
        }

        function onMove(e) {
          if (!dragging) return;

          const x = (e.touches ? e.touches[0].clientX : e.clientX);
          const y = (e.touches ? e.touches[0].clientY : e.clientY);

          let left = startLeft + (x - startX);
          let top = startTop + (y - startY);

          const maxLeft = window.innerWidth - el.offsetWidth;
          const maxTop = window.innerHeight - el.offsetHeight;
          left = Math.max(0, Math.min(maxLeft, left));
          top = Math.max(0, Math.min(maxTop, top));

          el.style.left = `${left}px`;
          el.style.top = `${top}px`;
          el.style.right = "auto";
          el.style.bottom = "auto";

          e.preventDefault();
          e.stopPropagation();
        }

        function onUp() {
          if (!dragging) return;
          dragging = false;
          el.style.cursor = "grab";

          const r = el.getBoundingClientRect();
          try { localStorage.setItem(POS_STORE_KEY, JSON.stringify({ left: r.left, top: r.top })); } catch {}

          removeEventListener("mousemove", onMove, true);
          removeEventListener("mouseup", onUp, true);
          removeEventListener("touchmove", onMove, true);
          removeEventListener("touchend", onUp, true);
        }

        el.style.cursor = "grab";
        el.addEventListener("mousedown", onDown, true);
        el.addEventListener("touchstart", onDown, { capture: true, passive: false });

        return () => {
          el.removeEventListener("mousedown", onDown, true);
          el.removeEventListener("touchstart", onDown, true);
        };
      }

      function loadHudFloatEnabled() {
        try {
          const raw = localStorage.getItem(HUD_FLOAT_KEY);
          if (!raw) return false;
          return Boolean(JSON.parse(raw));
        } catch { return false; }
      }
      function saveHudFloatEnabled(v) { try { localStorage.setItem(HUD_FLOAT_KEY, JSON.stringify(!!v)); } catch {} }

      function loadAutoBeastEnabled() {
        try {
          const raw = localStorage.getItem(AUTO_STORE_KEY);
          console.log("[AutoBeast] Loading auto state - raw from localStorage:", raw);
          if (!raw) {
            console.log("[AutoBeast] No saved state, defaulting to OFF");
            return false; // Default to OFF
          }
          const parsed = Boolean(JSON.parse(raw));
          console.log("[AutoBeast] Parsed state:", parsed);
          return parsed;
        } catch (e) {
          console.log("[AutoBeast] Error loading state:", e);
          return false;
        }
      }
      function saveAutoBeastEnabled(v) {
        console.log("[AutoBeast] Saving auto state:", v);
        try { localStorage.setItem(AUTO_STORE_KEY, JSON.stringify(!!v)); } catch {}
      }

function loadForceF2IgnoreDelay() {
  try {
    const raw = localStorage.getItem(FORCE_F2_KEY);
    if (!raw) return false;
    return Boolean(JSON.parse(raw));
  } catch { return false; }
}
function saveForceF2IgnoreDelay(v) { try { localStorage.setItem(FORCE_F2_KEY, JSON.stringify(!!v)); } catch {} }

function loadSecurityBeepEnabled() {
  try {
    const raw = localStorage.getItem(SECURITY_BEEP_KEY);
    if (!raw) return true; // default ON
    return Boolean(JSON.parse(raw));
  } catch { return true; }
}
function saveSecurityBeepEnabled(v) { try { localStorage.setItem(SECURITY_BEEP_KEY, JSON.stringify(!!v)); } catch {} }

let securityBeepEnabled = loadSecurityBeepEnabled();
let lastSecurityBeepAt = 0;

let _oaAudioCtx = null;
let _oaAudioUnlocked = false;
let _oaAudioWarned = false;

function ensureOaAudioCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!_oaAudioCtx || _oaAudioCtx.state === "closed") _oaAudioCtx = new Ctx();
  return _oaAudioCtx;
}

function unlockOaAudio() {
  const ctx = ensureOaAudioCtx();
  if (!ctx) return false;
  try { ctx.resume?.(); } catch {}
  // Prime with a silent tick; needs user gesture to actually unlock in some browsers.
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.02);
  } catch {}
  if (ctx.state === "running") _oaAudioUnlocked = true;
  return _oaAudioUnlocked;
}

function installAudioUnlockHooks() {
  const once = () => { try { unlockOaAudio(); } catch {} };
  // First user interaction unlocks sound for future beeps.
  window.addEventListener("pointerdown", once, { once: true, capture: true });
  window.addEventListener("keydown", once, { once: true, capture: true });
}

function beepTone(ctx, freq, ms, gainVal) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "square";
  o.frequency.value = freq;
  g.gain.value = gainVal;
  o.connect(g);
  g.connect(ctx.destination);
  o.start();
  setTimeout(() => { try { o.stop(); } catch {} }, ms);
}

function playSecurityBeep() {
  // NOTE: browsers often block audio until a user gesture.
  const ctx = ensureOaAudioCtx();
  if (ctx) {
    try { ctx.resume?.(); } catch {}
    if (ctx.state !== "running") {
      if (!_oaAudioWarned) {
        _oaAudioWarned = true;
        try { notify("Sound blocked by browser — click the page once to enable beeps."); } catch {}
      }
      return false;
    }
    try {
      // Two-beep pattern for visibility.
      beepTone(ctx, 880, 220, 0.12);
      setTimeout(() => { try { beepTone(ctx, 660, 260, 0.12); } catch {} }, 280);
      return true;
    } catch (e) {
      // fall through
    }
  }

  // Fallback: HTMLAudio (may also be blocked)
  try {
    const a = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=");
    a.play().catch(() => {});
    return true;
  } catch {}
  return false;
}

// ============================================================================
  // Hourly server-time chime (uses #server-time chip)
//   - Beeps once per hour at server HH:00
//   - Requires a user interaction once (click/keydown) for audio unlock in most browsers
//   - Toggle: Alt+Click the server-time chip (persisted in localStorage)
// ============================================================================
  const HOURLY_CHIME_ENABLED_KEY = "oa_hourly_server_chime_enabled_v1";
  const HOURLY_CHIME_LASTKEY_KEY = "oa_hourly_server_chime_lastkey_v1";

  function isHourlyChimeEnabled() {
    // Default ON (user asked for it)
    const raw = OA.Storage.get(HOURLY_CHIME_ENABLED_KEY, null);
    if (raw == null) return true;
    return OA.Storage.getBool(HOURLY_CHIME_ENABLED_KEY, true);
  }

  function setHourlyChimeEnabled(v) {
    OA.Storage.setBool(HOURLY_CHIME_ENABLED_KEY, !!v);
    try { notify(`Hourly chime: ${v ? "ON" : "OFF"} (Alt+Click Server time to toggle)`); } catch {}
    try { updateHourlyChimeHint(); } catch {}
  }

  function updateHourlyChimeHint() {
    const el = document.getElementById("server-time");
    if (!el) return;
    const on = isHourlyChimeEnabled();
    const baseTitle = el.getAttribute("title") || "Server time";
    const hint = ` | Hourly chime: ${on ? "ON" : "OFF"} (Alt+Click to toggle)`;
    // Avoid title growing forever
    const clean = String(baseTitle).split(" | Hourly chime:")[0];
    el.setAttribute("title", clean + hint);
  }

  function playHourlyChime(serverDate) {
    const ctx = ensureOaAudioCtx();
    if (!ctx) return false;
    try { ctx.resume?.(); } catch {}
    if (ctx.state !== "running") {
      if (!_oaAudioWarned) {
        _oaAudioWarned = true;
        try { notify("Sound blocked by browser — click the page once to enable beeps."); } catch {}
      }
      return false;
    }
    try {
      // A quick, pleasant triple-chime.
      beepTone(ctx, 880, 140, 0.10);
      setTimeout(() => { try { beepTone(ctx, 1320, 120, 0.085); } catch {} }, 180);
      setTimeout(() => { try { beepTone(ctx, 1760, 110, 0.07); } catch {} }, 330);
      return true;
    } catch {}
    return false;
  }

  function startHourlyServerChime() {
    let baseEpoch = null;
    let baseClientMs = 0;
    let offsetSec = 0;
    let lastKey = String(OA.Storage.get(HOURLY_CHIME_LASTKEY_KEY, "") || "");

    function readBase() {
      const el = document.getElementById("server-time");
      if (!el) return false;
      const epoch = parseInt(el.getAttribute("data-server-epoch") || "", 10);
      const off = parseInt(el.getAttribute("data-server-utc-offset") || "0", 10);
      if (!Number.isFinite(epoch) || epoch < 1000000000) return false;

      baseEpoch = epoch;           // UTC epoch seconds (as provided by page)
      offsetSec = Number.isFinite(off) ? off : 0; // seconds offset from UTC
      baseClientMs = Date.now();   // when we sampled epoch
      updateHourlyChimeHint();
      return true;
    }

    function getServerNow() {
      if (baseEpoch == null) {
        if (!readBase()) return null;
      }
      const deltaSec = (Date.now() - baseClientMs) / 1000;
      const utcSecNow = baseEpoch + deltaSec;
      // Server local time = UTC + offset
      return new Date((utcSecNow + offsetSec) * 1000);
    }

    function hourKey(d) {
      // YYYY-MM-DD HH
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hr = String(d.getHours()).padStart(2, "0");
      return `${y}-${m}-${day} ${hr}`;
    }

    function tick() {
      // Keep base synced occasionally in case the page updates server-time epoch
      if (baseEpoch != null && (Date.now() - baseClientMs) > 5 * 60 * 1000) {
        readBase();
      }

      if (!isHourlyChimeEnabled()) return;

      const d = getServerNow();
      if (!d) return;

      const key = hourKey(d);

      // Seed on first run so it won't chime immediately after load
      if (!lastKey) {
        lastKey = key;
        OA.Storage.set(HOURLY_CHIME_LASTKEY_KEY, lastKey);
        return;
      }

      // Chime near the top of the hour (allow a tiny 0-1s window)
      if (d.getMinutes() === 0 && d.getSeconds() <= 1) {
        if (lastKey !== key) {
          lastKey = key;
          OA.Storage.set(HOURLY_CHIME_LASTKEY_KEY, lastKey);
          playHourlyChime(d);
        }
      }
    }

    // Attach Alt+Click toggle on the chip (best-effort)
    function attachToggleHandler() {
      const el = document.getElementById("server-time");
      if (!el) return false;
      const handler = (e) => {
        try {
          if (!e || !e.altKey || e.shiftKey) return;
          e.preventDefault();
          e.stopPropagation();
          setHourlyChimeEnabled(!isHourlyChimeEnabled());
        } catch {}
      };
      el.addEventListener("click", handler, true);
      OA.addCleanup(() => { try { el.removeEventListener("click", handler, true); } catch {} });
      updateHourlyChimeHint();
      return true;
    }

    // Start ticking (1s)
    OA.setInterval(() => { try { tick(); } catch {} }, 1000);
    // Keep trying to bind toggle if DOM re-renders
    OA.setInterval(() => { try { attachToggleHandler(); } catch {} }, 5000);

    // Initial sync
    OA.setTimeout(() => { try { readBase(); attachToggleHandler(); } catch {} }, 800);
  }

  // Start hourly chime module
  OA.setTimeout(() => { try { startHourlyServerChime(); } catch {} }, 1200);

// ============================================================================
// Server-time Scheduler (on-the-hour / daily) — uses #server-time chip epoch
//   - Provides a reliable "server clock" derived from data-server-epoch + client elapsed time
//   - Includes an hourly example: "Hourly Kingdom Walk" (runs Kingdom Auto, then returns to combat)
//   - Toggle Hourly Kingdom Walk: Alt+Shift+Click the server-time chip
// ============================================================================
(function serverTimeScheduler() {
  "use strict";

  // Scheduler reliability helpers (must live in THIS scheduler scope)
  const SCHED_WALK_LAST_TICK_LOCAL_KEY = "oa_sched_kingdom_walk_last_tick_local_v1";
  let schedArmedTimerId = 0;
  const SCHED_ARM_MAX_MS = 6 * 60 * 60 * 1000; // re-arm at least every 6h
  const SCHED_DEBUG_LAST_FIRE_KEY = "oa_sched_kingdom_walk_last_fire_v1";

  const SCHED_HOURLY_WALK_ENABLED_KEY = "oa_sched_hourly_kingdom_walk_enabled_v1";
  const SCHED_HOURLY_WALK_LASTKEY_KEY = "oa_sched_hourly_kingdom_walk_lastkey_v1";
  const SCHED_HOURLY_WALK_ACTIVE_KEY  = "oa_sched_hourly_kingdom_walk_active_v1"; // JSON {runId, phase, snapshot, returnTo}
  const SCHED_HOURLY_WALK_REQ_KEY     = "oa_sched_hourly_kingdom_walk_req_v1";    // JSON {runId, atUtcSec}
  const SCHED_HOURLY_WALK_PROFILE_KEY = "oa_sched_hourly_kingdom_walk_profile_v1";
  const SCHED_WALK_CFG_KEY = "oa_sched_kingdom_walk_cfg_v1";
  const SCHED_WALK_LAST_OCC_KEY = "oa_sched_kingdom_walk_last_occ_v1"; // which Kingdom Auto profile to run

  // Multi-scheduler: array of up to 5 schedules
  const SCHED_MULTI_KEY = "oa_sched_multi_kingdom_walk_v1";
  const MAX_SCHEDULES = 5;

  // These keys are already used elsewhere in the script (we mirror them here for restore)
  const AUTO_COMBAT_STORE_KEY = "oa_auto_combat_enabled_v1";
  const AUTO_BEAST_STORE_KEY  = "oa_last_beast_auto_v1";
  const GAME_AUTO_WANTED_KEY  = "oa_game_autocombat_wanted_v1";
  const GAME_AUTO_FORCE_KEY   = "oa_game_autocombat_force_v1";

  // Kingdom Auto settings key (must be configured for scheduled runs)
  const KA_SETTINGS_KEY = "oa_kingdom_auto_settings_v3";
  const KA_RUNNING_KEY  = "oa_kingdom_auto_running_v1";

  let baseEpochSec = null;
  let baseClientMs = 0;
  let offsetSec = 0;

  function jget(k, fb) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : fb; } catch { return fb; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  function jdel(k) { try { localStorage.removeItem(k); } catch {} }

  function readBase(force) {
    const el = document.getElementById("server-time");
    if (!el) return false;
    const epoch = parseInt(el.getAttribute("data-server-epoch") || "", 10);
    const off = parseInt(el.getAttribute("data-server-utc-offset") || "0", 10);
    if (!Number.isFinite(epoch) || epoch < 1000000000) return false;

    // IMPORTANT:
    // Many pages render a static data-server-epoch that does NOT auto-update. If we re-sample that same epoch
    // and reset baseClientMs, we'd effectively "pin" server time to near-constant values (breaking schedules).
    // So: only reset the base when the epoch value actually changes (or when forced / first init).
    const nextOffset = Number.isFinite(off) ? off : 0;
    const nowMs = Date.now();

    const already = Number.isFinite(baseEpochSec);
    const sameEpoch = already && (epoch === baseEpochSec) && (nextOffset === offsetSec);

    if (!force && sameEpoch) {
      // Keep the existing baseClientMs so getServerUtcMs() continues to advance smoothly.
      return true;
    }

    baseEpochSec = epoch;                 // UTC epoch seconds as provided by page
    offsetSec = nextOffset;
    baseClientMs = nowMs;
    updateHint();
    return true;
  }

  function getServerUtcMs() {
    if (!Number.isFinite(baseEpochSec)) return Date.now();
    const dt = Date.now() - baseClientMs;
    return (baseEpochSec * 1000) + dt;
  }

  function getServerLocalMs() {
    return getServerUtcMs() + (offsetSec * 1000);
  }

  function parts(ms) {
    // Server local "parts" (year/month/day/hour/min/sec) in UTC-based getters since ms already shifted.
    const d = new Date(ms);
    return {
      y: d.getUTCFullYear(),
      mo: d.getUTCMonth() + 1,
      d: d.getUTCDate(),
      h: d.getUTCHours(),
      mi: d.getUTCMinutes(),
      s: d.getUTCSeconds(),
    };
  }

  function pad2(n) { return String(n).padStart(2, "0"); }
  function hourKey(p) { return `${p.y}-${pad2(p.mo)}-${pad2(p.d)} ${pad2(p.h)}`; }

  function normalizeHHMM(input) {
  // Accept "HH:MM" plus common separators users accidentally type: "HH;MM", "HH.MM", "HH,MM".
  let s = String(input || "").trim();
  if (!s) return null;
  s = s.replace(/[;.,]/g, ":").replace(/\s+/g, "");
  const m = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  let hh = parseInt(m[1], 10);
  let mi = parseInt(m[2], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mi)) return null;
  hh = Math.max(0, Math.min(23, hh));
  mi = Math.max(0, Math.min(59, mi));
  return String(hh).padStart(2, "0") + ":" + String(mi).padStart(2, "0");
}

function cfgFromLegacy() {
  // Legacy hourly toggle/profile -> new scheduler config.
  const enabled = !!OA.Storage.get(SCHED_HOURLY_WALK_ENABLED_KEY, false);
  const profile = String(OA.Storage.get(SCHED_HOURLY_WALK_PROFILE_KEY, "Default") || "Default");
  return {
    enabled,
    profile,
    startHHMM: "00:00",     // aligns to top of hour when interval=1 hour
    everyValue: 1,
    everyUnit: "hours",
    catchUpMins: 5,         // run if we're within 5 minutes of the scheduled time
  };
}

function sanitizeCfg(cfg) {
  const out = (cfg && typeof cfg === "object") ? { ...cfg } : {};
  out.enabled = !!out.enabled;
  out.startHHMM = normalizeHHMM(out.startHHMM) || "00:00";
  out.everyValue = Math.max(1, parseInt(out.everyValue ?? 1, 10) || 1);
  out.everyUnit = (["minutes", "hours", "days"].includes(String(out.everyUnit || "")) ? String(out.everyUnit) : "hours");
  out.profile = String(out.profile || "Default").trim() || "Default";
  out.catchUpMins = Math.max(0, parseInt(out.catchUpMins ?? 30, 10) || 30);

  // Guard against "instant fire" when enabling/changing schedules.
  // notBeforeLocalMs is the earliest scheduled occurrence (server-local ms) we allow to run.
  out.enabledAtLocalMs = Number(out.enabledAtLocalMs || 0);
  if (!Number.isFinite(out.enabledAtLocalMs) || out.enabledAtLocalMs < 0) out.enabledAtLocalMs = 0;

  out.notBeforeLocalMs = Number(out.notBeforeLocalMs || 0);
  if (!Number.isFinite(out.notBeforeLocalMs) || out.notBeforeLocalMs < 0) out.notBeforeLocalMs = 0;

  return out;
}

function getScheduleCfg() {
  let cfg = null;
  try { cfg = jget(SCHED_WALK_CFG_KEY, null); } catch {}
  if (!cfg || typeof cfg !== "object") {
    cfg = cfgFromLegacy();
    try { jset(SCHED_WALK_CFG_KEY, cfg); } catch {}
  }
  return sanitizeCfg(cfg);
}

function setScheduleCfg(nextCfg) {
  const cfg = sanitizeCfg(nextCfg);
  try { jset(SCHED_WALK_CFG_KEY, cfg); } catch {}
  try { updateHint(); } catch {}
  return cfg;
}

function mergeScheduleCfg(partial) {
  const base = getScheduleCfg();
  const wants = { ...base, ...(partial || {}) };
  const merged = sanitizeCfg(wants);

  // If we're enabled and the user changes timing fields, recompute notBeforeLocalMs
  // so we don't "catch" an older aligned tick and fire instantly.
  try {
    const timingTouched = partial && typeof partial === "object" && (
      Object.prototype.hasOwnProperty.call(partial, "startHHMM") ||
      Object.prototype.hasOwnProperty.call(partial, "everyValue") ||
      Object.prototype.hasOwnProperty.call(partial, "everyUnit")
    );
    const enablingNow = !!merged.enabled && !base.enabled; // enable toggle should also prevent "instant fire"
    if (merged.enabled && (timingTouched || enablingNow)) {
      let nowLocal = 0;
      try { if (!Number.isFinite(baseEpochSec)) readBase(); } catch {}
      try { nowLocal = Number.isFinite(baseEpochSec) ? getServerLocalMs() : Date.now(); } catch { nowLocal = Date.now(); }
      const inf = scheduleInfo(nowLocal, merged);
      merged.notBeforeLocalMs = inf && Number.isFinite(inf.nextMs) ? inf.nextMs : (merged.notBeforeLocalMs || 0);
      merged.enabledAtLocalMs = enablingNow ? nowLocal : (merged.enabledAtLocalMs || nowLocal);
      try { OA.Storage.set(SCHED_WALK_LAST_OCC_KEY, 0); } catch {}
    }
  } catch {}

  try { jset(SCHED_WALK_CFG_KEY, merged); } catch {}
  try { updateHint(); } catch {}
  return merged;
}

function intervalMinutesFromCfg(cfg) {
  const v = Math.max(1, parseInt(cfg.everyValue ?? 1, 10) || 1);
  const u = String(cfg.everyUnit || "hours");
  if (u === "minutes") return v;
  if (u === "days") return v * 1440;
  return v * 60;
}

function scheduleInfo(nowLocalMs, cfg) {
  const safe = sanitizeCfg(cfg);
  const periodMin = intervalMinutesFromCfg(safe);
  const periodMs = Math.max(60000, periodMin * 60000);

  // Parse HH:MM (server-local clock, stored as UTC for localMs usage)
  const m = String(safe.startHHMM || "00:00").match(/^(\d{2}):(\d{2})$/);
  const hh = m ? parseInt(m[1], 10) : 0;
  const mi = m ? parseInt(m[2], 10) : 0;
  const startMin = (hh * 60) + mi;

  const dayMs = 86400000;
  const dayStart = Math.floor(nowLocalMs / dayMs) * dayMs;
  const firstMs = dayStart + (startMin * 60000); // first occurrence for "today"

  // If we're before today's start time, the next run is firstMs (do NOT anchor to yesterday).
  if (nowLocalMs < firstMs) {
    const occMs = firstMs - periodMs;
    const nextMs = firstMs;
    return { periodMs, periodMin, firstMs, occMs, nextMs };
  }

  // Otherwise, align to today's firstMs and step forward by the period.
  const k = Math.floor((nowLocalMs - firstMs) / periodMs);
  const occMs = firstMs + (k * periodMs);
  const nextMs = occMs + periodMs;
  return { periodMs, periodMin, firstMs, occMs, nextMs };
}

function formatServerHHMM(localMs) {
  const d = new Date(localMs);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mi}`;
}

function getNextKingdomWalkRunInfo() {
  if (!Number.isFinite(baseEpochSec)) { try { readBase(); } catch {} }
  if (!Number.isFinite(baseEpochSec)) return { nextText: "—" };
  const cfg = getScheduleCfg();
  const nowLocal = getServerLocalMs();
  const inf = scheduleInfo(nowLocal, cfg);
  return {
    enabled: cfg.enabled,
    nowLocalMs: nowLocal,
    nowText: formatServerHHMM(nowLocal),
    nextLocalMs: inf.nextMs,
    nextText: formatServerHHMM(inf.nextMs),
    cfg,
  };
}

function isEnabled() { return !!getScheduleCfg().enabled; }

function setEnabled(v) {
  const want = !!v;
  const prev = getScheduleCfg();
  const patch = { enabled: want };

  // When turning ON, set a "not before" boundary to the next scheduled time
  // so we don't run immediately just because the current minute happens to align.
  if (want && !prev.enabled) {
    let nowLocal = 0;
    try { if (!Number.isFinite(baseEpochSec)) readBase(); } catch {}
    try { nowLocal = Number.isFinite(baseEpochSec) ? getServerLocalMs() : Date.now(); } catch { nowLocal = Date.now(); }
    patch.enabledAtLocalMs = nowLocal;
    try {
      const inf = scheduleInfo(nowLocal, sanitizeCfg({ ...prev, ...patch }));
      patch.notBeforeLocalMs = inf && Number.isFinite(inf.nextMs) ? inf.nextMs : 0;
    } catch {}
    try { OA.Storage.set(SCHED_WALK_LAST_OCC_KEY, 0); } catch {}
  }

  mergeScheduleCfg(patch);
}

function getDesiredWalkProfile() {
  return String(getScheduleCfg().profile || "Default");
}

function setDesiredWalkProfile(name) {
  const n = String(name || "").trim() || "Default";
  mergeScheduleCfg({ profile: n });
}

// ========== Multi-Scheduler Functions ==========

function getMultiSchedules() {
  try {
    const arr = jget(SCHED_MULTI_KEY, null);
    if (Array.isArray(arr)) return arr.slice(0, MAX_SCHEDULES);
  } catch {}
  return [];
}

function setMultiSchedules(arr) {
  const safe = Array.isArray(arr) ? arr.slice(0, MAX_SCHEDULES) : [];
  jset(SCHED_MULTI_KEY, safe);
}

function generateScheduleId() {
  return "sched_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
}

function createDefaultSchedule(profile) {
  return {
    id: generateScheduleId(),
    enabled: false,
    profile: profile || "Default",
    startHHMM: "00:00",
    everyValue: 1,
    everyUnit: "hours",
    lastOccMs: 0,
    notBeforeMs: 0
  };
}

function addSchedule(profile) {
  const arr = getMultiSchedules();
  if (arr.length >= MAX_SCHEDULES) return null;
  const sched = createDefaultSchedule(profile);
  arr.push(sched);
  setMultiSchedules(arr);
  return sched;
}

function removeSchedule(id) {
  const arr = getMultiSchedules();
  const filtered = arr.filter(s => s.id !== id);
  setMultiSchedules(filtered);
}

function updateSchedule(id, updates) {
  const arr = getMultiSchedules();
  const idx = arr.findIndex(s => s.id === id);
  if (idx < 0) return;
  arr[idx] = { ...arr[idx], ...updates };
  setMultiSchedules(arr);
}

function getScheduleById(id) {
  return getMultiSchedules().find(s => s.id === id) || null;
}

function getNextScheduleToRun(nowLocalMs) {
  // Returns the schedule that should run next (considering enabled, notBeforeMs, lastOccMs)
  const scheds = getMultiSchedules().filter(s => s.enabled);
  if (scheds.length === 0) return null;

  let soonest = null;
  let soonestMs = Infinity;

  for (const s of scheds) {
    const cfg = {
      startHHMM: s.startHHMM || "00:00",
      everyValue: s.everyValue || 1,
      everyUnit: s.everyUnit || "hours"
    };
    const inf = scheduleInfo(nowLocalMs, cfg);

    // Check if this occurrence should fire
    const lastOcc = Number(s.lastOccMs || 0);
    const notBefore = Number(s.notBeforeMs || 0);

    // Current aligned occurrence
    const occMs = inf.occMs;

    // Skip if we've already fired for this occurrence
    if (lastOcc >= occMs) continue;

    // Skip if before notBeforeMs
    if (occMs < notBefore) continue;

    // Check catch-up window (5 minutes)
    const catchUpMs = 5 * 60 * 1000;
    if (nowLocalMs >= occMs && nowLocalMs < occMs + catchUpMs) {
      // This schedule is ready to fire now
      if (occMs < soonestMs) {
        soonestMs = occMs;
        soonest = { schedule: s, occMs, nextMs: inf.nextMs };
      }
    }
  }

  return soonest;
}

function getNextScheduleRunTime(nowLocalMs) {
  // Get the next scheduled run time across all enabled schedules
  const scheds = getMultiSchedules().filter(s => s.enabled);
  if (scheds.length === 0) return null;

  let soonestMs = Infinity;
  let soonestSched = null;

  for (const s of scheds) {
    const cfg = {
      startHHMM: s.startHHMM || "00:00",
      everyValue: s.everyValue || 1,
      everyUnit: s.everyUnit || "hours"
    };
    const inf = scheduleInfo(nowLocalMs, cfg);
    const notBefore = Number(s.notBeforeMs || 0);
    const lastOcc = Number(s.lastOccMs || 0);

    // Determine next eligible run
    let nextRun = inf.nextMs;
    if (inf.occMs > lastOcc && inf.occMs >= notBefore && nowLocalMs < inf.occMs + 5 * 60 * 1000) {
      nextRun = inf.occMs;
    }

    if (nextRun < soonestMs) {
      soonestMs = nextRun;
      soonestSched = s;
    }
  }

  return soonestSched ? { schedule: soonestSched, nextMs: soonestMs } : null;
}

function markScheduleFired(id, occMs) {
  updateSchedule(id, { lastOccMs: occMs });
}

// ========== End Multi-Scheduler Functions ==========

  function isKaConfigured() {
    const s = jget(KA_SETTINGS_KEY, null);
    const owner = s && typeof s.owner === "string" ? s.owner.trim() : "";
    return owner.length > 0;
  }

  function isKaRunning() { try { return localStorage.getItem(KA_RUNNING_KEY) === "1"; } catch { return false; } }

  function snapshotAutomation() {
    return {
      autoCombatEnabled: !!jget(AUTO_COMBAT_STORE_KEY, false),
      autoBeastEnabled:  !!jget(AUTO_BEAST_STORE_KEY, false),
      gameAutoWanted:    !!jget(GAME_AUTO_WANTED_KEY, false),
      gameAutoForce:     !!jget(GAME_AUTO_FORCE_KEY, false),
    };
  }

  function pauseAutomationForTask() {
    // Disable toggles via localStorage (script reads these on load/restore)
    try { localStorage.setItem(AUTO_COMBAT_STORE_KEY, JSON.stringify(false)); } catch {}
    try { localStorage.setItem(AUTO_BEAST_STORE_KEY, JSON.stringify(false)); } catch {}
    try { localStorage.setItem(GAME_AUTO_WANTED_KEY, JSON.stringify(false)); } catch {}
    try { localStorage.setItem(GAME_AUTO_FORCE_KEY, JSON.stringify(false)); } catch {}
  }

  function gotoTab(tabName) {
    try {
      const url = location.origin + `/game.php?tab=${encodeURIComponent(String(tabName || "combat"))}`;
      if (location.href !== url) location.href = url;
    } catch {}
  }

  function requestHourlyKingdomWalk(triggerKey, atUtcSec, overrideProfile) {
    if (!isKaConfigured()) {
      try { window.gameNotifications?.show?.("Scheduled Kingdom Walk: configure Kingdom Auto Owner first (F4 widget)."); } catch {}
      return;
    }
    if (isKaRunning()) return;

    const active = jget(SCHED_HOURLY_WALK_ACTIVE_KEY, null);
    if (active && active.runId) return;

    const snap = snapshotAutomation();
    // Use override profile if provided (from multi-scheduler), otherwise use default
    const desiredProfile = overrideProfile || getDesiredWalkProfile();
    let prevProfile = "Default";
    try {
      const store = jget(KA_SETTINGS_KEY, null);
      const ap = store && typeof store.activeProfile === "string" ? store.activeProfile : "Default";
      const profs = store && typeof store.profiles === "object" ? store.profiles : {};
      prevProfile = (ap && profs && profs[ap]) ? ap : (profs && profs.Default ? "Default" : "Default");
    } catch {}
    const runId = `hourly:${String(triggerKey)}`;

    jset(SCHED_HOURLY_WALK_ACTIVE_KEY, {
      runId,
      phase: "pending_start",
      startedAtUtcSec: atUtcSec,
      createdAtClientMs: Date.now(),
      returnTo: "combat",
      snapshot: snap,
      desiredProfile,
      prevProfile,
    });
    jset(SCHED_HOURLY_WALK_REQ_KEY, { runId, atUtcSec });

    // Pause any combat/beast automation before tab swap.
    pauseAutomationForTask();

    // Move to kingdoms tab; Kingdom Auto module will auto-start when it sees pending_start.
    gotoTab("kingdoms");
  }

  function updateHint() {
  const el = document.getElementById("server-time");
  if (!el) return;
  try {
    const cfg = getScheduleCfg();
    const baseTitle = el.getAttribute("title") || "";
    // Preserve any other suffixes (e.g., chime). Only replace our own.
    const clean = String(baseTitle).split(" | Scheduled walk:")[0];

    let suffix = ` | Scheduled walk: ${cfg.enabled ? "ON" : "OFF"} (Alt+Shift+Click)`;
    if (cfg.enabled) {
      const info = getNextKingdomWalkRunInfo();
      if (info && info.nextText) {
        suffix += ` • Next ${info.nextText}`;
      }
      try {
        const lf = OA.Storage.get(SCHED_DEBUG_LAST_FIRE_KEY, null);
        if (lf && lf.occLocalMs) { suffix += ` • Last ${formatServerHHMM(lf.occLocalMs)}`; }
      } catch {}

      if (cfg.everyValue && cfg.everyUnit && cfg.startHHMM) {
        suffix += ` • ${cfg.startHHMM} then every ${cfg.everyValue} ${cfg.everyUnit}`;
      }
    }
    el.setAttribute("title", clean + suffix);
  } catch {}
}

  function attachToggleHandler() {
    const el = document.getElementById("server-time");
    if (!el) return false;

    // Avoid duplicate bindings across re-renders
    try {
      if (el.dataset && el.dataset.oaSchedToggleBound === "1") {
        try { updateHint(); } catch {}
        return true;
      }
    } catch {}

    const handler = (e) => {
      try {
        if (!e || !e.altKey || !e.shiftKey) return; // Alt+Shift only
        e.preventDefault();
        e.stopPropagation();
        setEnabled(!isEnabled());
        try { window.gameNotifications?.show?.(`Scheduled Kingdom Walk: ${isEnabled() ? "ON" : "OFF"}`); } catch {}
        try { updateHint(); } catch {}
      } catch {}
    };

    el.addEventListener("click", handler, true);
    try { if (el.dataset) el.dataset.oaSchedToggleBound = "1"; } catch {}
    // NOTE: Do not register OA.addCleanup here — AutoCombat may call OA.clearAll(), and we
    // want scheduler toggles + timers to survive that.
    try { updateHint(); } catch {}
    return true;
  }

  function armScheduler() {
  // Arm a single timeout for the next scheduled occurrence (plus periodic re-arming cap).
  try {
    if (schedArmedTimerId) { clearTimeout(schedArmedTimerId); schedArmedTimerId = 0; }
  } catch {}
  const cfg = getScheduleCfg();
  if (!cfg.enabled) return;

  if (!Number.isFinite(baseEpochSec)) { try { readBase(); } catch {} }
  if (!Number.isFinite(baseEpochSec)) return;

  try {
    const nowLocal = getServerLocalMs();
    const inf = scheduleInfo(nowLocal, cfg);
    const target = inf.nextMs;
    let delay = target - nowLocal;
    if (!Number.isFinite(delay)) return;
    delay = Math.max(250, Math.min(delay, SCHED_ARM_MAX_MS));
    schedArmedTimerId = setTimeout(() => {
      try { tick(); } catch {}
    }, delay);
  } catch {}
}

function getTabName() {
  try { return new URL(location.href).searchParams.get("tab") || ""; } catch { return ""; }
}

function setKaActiveProfileIfExists(name) {
  const want = String(name || "").trim() || "Default";
  try {
    const store = jget(KA_SETTINGS_KEY, null);
    if (!store || typeof store !== "object") return "Default";
    const profs = store && typeof store.profiles === "object" ? store.profiles : {};
    const chosen = (want && profs && profs[want]) ? want : ((profs && profs.Default) ? "Default" : want);
    store.activeProfile = chosen;
    jset(KA_SETTINGS_KEY, store);
    return chosen;
  } catch {}
  return "Default";
}

function resumeAutomationFromSnapshot(snap) {
  const s = (snap && typeof snap === "object") ? snap : {};
  try { localStorage.setItem(AUTO_COMBAT_STORE_KEY, JSON.stringify(!!s.autoCombatEnabled)); } catch {}
  try { localStorage.setItem(AUTO_BEAST_STORE_KEY, JSON.stringify(!!s.autoBeastEnabled)); } catch {}
  try { localStorage.setItem(GAME_AUTO_WANTED_KEY, JSON.stringify(!!s.gameAutoWanted)); } catch {}
  try { localStorage.setItem(GAME_AUTO_FORCE_KEY, JSON.stringify(!!s.gameAutoForce)); } catch {}
}

function clearScheduledRunState() {
  try { localStorage.removeItem(SCHED_HOURLY_WALK_REQ_KEY); } catch {}
  try { localStorage.removeItem(SCHED_HOURLY_WALK_ACTIVE_KEY); } catch {}
}

function startKaNow() {
  // Best effort: click widget button if present, otherwise dispatch F4.
  try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch {}
  const btn = document.getElementById("oa-ka-toggle");
  if (btn && typeof btn.click === "function") { try { btn.click(); return true; } catch {} }
  try { window.dispatchEvent(new KeyboardEvent("keydown", { key: "F4", bubbles: true })); return true; } catch {}
  return false;
}

function driveScheduledRun(active) {
  // active: {runId, phase, startedAtUtcSec, createdAtClientMs, snapshot, desiredProfile, prevProfile, returnTo, ...}
  const nowClient = Date.now();
  const created = Number(active.createdAtClientMs || 0) || nowClient;

  // Safety: if it's been stuck too long, clear it so scheduling doesn't die.
  if (nowClient - created > 2 * 60 * 60 * 1000) {
    try { window.gameNotifications?.show?.("Scheduled Walk: cleared (stuck > 2h)."); } catch {}
    clearScheduledRunState();
    return;
  }

  const phase = String(active.phase || "pending_start");

  if (phase === "pending_start") {
    // Ensure we're on the kingdoms tab.
    if (getTabName() !== "kingdoms") { gotoTab("kingdoms"); return; }

    // Wait for the Kingdom Auto widget/hotkey to exist (it boots on interval).
    const btn = document.getElementById("oa-ka-toggle");
    if (!btn) {
      // If it never appears, abort after ~25s.
      const first = Number(active._pendingFirstSeenMs || 0) || 0;
      if (!first) {
        active._pendingFirstSeenMs = nowClient;
        try { jset(SCHED_HOURLY_WALK_ACTIVE_KEY, active); } catch {}
        return;
      }
      if (nowClient - first > 25000) {
        try { window.gameNotifications?.show?.("Scheduled Walk: couldn't find Kingdom Auto UI (aborted)."); } catch {}
        clearScheduledRunState();
      }
      return;
    }

    // Select desired profile (if it exists).
    try { active._chosenProfile = setKaActiveProfileIfExists(active.desiredProfile); } catch {}

    // Start Kingdom Auto.
    const ok = startKaNow();
    if (ok) {
      active.phase = "running";
      active.kaStartedAtClientMs = nowClient;
      try { jset(SCHED_HOURLY_WALK_ACTIVE_KEY, active); } catch {}
    }
    return;
  }

  if (phase === "running") {
    // Wait until Kingdom Auto stops.
    if (isKaRunning()) return;

    active.phase = "restoring";
    active.finishedAtClientMs = nowClient;
    try { jset(SCHED_HOURLY_WALK_ACTIVE_KEY, active); } catch {}
    return;
  }

  if (phase === "restoring") {
    // Restore the previous KA profile, then resume automation and return to combat.
    try { setKaActiveProfileIfExists(active.prevProfile); } catch {}
    try { resumeAutomationFromSnapshot(active.snapshot); } catch {}
    try { gotoTab(active.returnTo || "combat"); } catch {}
    try { window.gameNotifications?.show?.("Scheduled Walk: done."); } catch {}
    clearScheduledRunState();
    return;
  }

  // Unknown phase -> clear
  clearScheduledRunState();
}

function tick() {
  // Check multi-schedules
  const multiScheds = getMultiSchedules();
  const hasEnabled = multiScheds.some(s => s.enabled);

  if (!hasEnabled) return;

  if (!Number.isFinite(baseEpochSec)) { readBase(); if (!Number.isFinite(baseEpochSec)) return; }

  // Drive any active scheduled run (state machine).
  try {
    const active = jget(SCHED_HOURLY_WALK_ACTIVE_KEY, null);
    if (active && active.runId) { driveScheduledRun(active); return; }
  } catch {}

  // Don't interrupt an in-progress Kingdom Auto run (manual or scheduled).
  const nowLocal = getServerLocalMs();
  if (isKaRunning()) {
    // Mark all schedule occurrences as fired so we don't catch up after
    for (const s of multiScheds.filter(x => x.enabled)) {
      const sinf = scheduleInfo(nowLocal, { startHHMM: s.startHHMM, everyValue: s.everyValue, everyUnit: s.everyUnit });
      if (sinf.occMs > (s.lastOccMs || 0)) {
        markScheduleFired(s.id, sinf.occMs);
      }
    }
    return;
  }

  // Track last tick for boundary crossing detection
  OA.Storage.set(SCHED_WALK_LAST_TICK_LOCAL_KEY, nowLocal);

  // Find and run next due schedule
  const toRun = getNextScheduleToRun(nowLocal);
  if (toRun && toRun.schedule) {
    const s = toRun.schedule;
    markScheduleFired(s.id, toRun.occMs);
    const atUtcSec = Math.floor(getServerUtcMs() / 1000);
    const key = `multi:${s.id}:${Math.floor(toRun.occMs / 60000)}`;
    try { window.gameNotifications?.show?.(`Scheduled Walk [${s.profile}]: starting (${formatServerHHMM(toRun.occMs)} server)`); } catch {}
    try { OA.Storage.set(SCHED_DEBUG_LAST_FIRE_KEY, { scheduleId: s.id, profile: s.profile, occLocalMs: toRun.occMs, firedAtClientMs: Date.now() }); } catch {}
    requestHourlyKingdomWalk(key, atUtcSec, s.profile);
  }
}

  // Bootstrap
  function ensureSchedulerLoops() {
  try {
    const v = "6.9.16.37";
    try { window.__OA_SCRIPT_VERSION = v; } catch {}
    // Page-bridge: expose version + a console-friendly scheduler API in the *page* window.
    try {
      const BRIDGE_ID = "oa-sched-page-bridge-v1";
      if (!document.getElementById(BRIDGE_ID)) {
        const sc = document.createElement("script");
        sc.id = BRIDGE_ID;
        sc.textContent = `(function(){
          try{ window.__OA_SCRIPT_VERSION = "6.9.16.37"; }catch {}
          window.__oaScheduler = window.__oaScheduler || {};
          let baseEpochSec = NaN, baseClientMs = 0, baseOffsetSec = 0;
          function readBase(){
            const el = document.getElementById("server-time");
            if(!el) return false;
            const ep = parseInt(el.getAttribute("data-server-epoch")||"",10);
            const off = parseInt(el.getAttribute("data-server-utc-offset")||"",10);
            if(!Number.isFinite(ep) || !Number.isFinite(off)) return false;
            if(!Number.isFinite(baseEpochSec) || ep !== baseEpochSec || off !== baseOffsetSec){
              baseEpochSec = ep; baseOffsetSec = off; baseClientMs = Date.now();
            }
            return true;
          }
          function getServerLocalMs(){
            if(!Number.isFinite(baseEpochSec)) { if(!readBase()) return Date.now(); }
            const utcMs = (baseEpochSec*1000) + (Date.now()-baseClientMs);
            return utcMs + (baseOffsetSec*1000);
          }
          function intervalMinutesFromCfg(cfg){
            const every = Math.max(1, parseInt(cfg.every||1,10)||1);
            const unit = String(cfg.unit||"hours");
            if(unit==="minutes") return every;
            if(unit==="days") return every*1440;
            return every*60;
          }
          function sanitizeCfg(cfg){
            const c = cfg||{};
            const out = {
              enabled: !!c.enabled,
              startHHMM: String(c.startHHMM||"00:00").replace(/[;,.]/g,":").trim(),
              every: Math.max(1, parseInt(c.every||1,10)||1),
              unit: (String(c.unit||"hours")==="minutes"||String(c.unit||"hours")==="days") ? String(c.unit||"hours") : "hours",
              catchUpMins: Math.max(1, parseInt(c.catchUpMins??30,10)||30),
              notBeforeLocalMs: Number(c.notBeforeLocalMs||0)||0
            };
            const m = out.startHHMM.match(/^(\d{1,2}):(\d{2})$/);
            if(m){
              const hh = String(Math.min(23, Math.max(0, parseInt(m[1],10)||0))).padStart(2,"0");
              const mi = String(Math.min(59, Math.max(0, parseInt(m[2],10)||0))).padStart(2,"0");
              out.startHHMM = hh+":"+mi;
            } else out.startHHMM = "00:00";
            return out;
          }
          function scheduleInfo(nowLocalMs, cfg){
            const safe = sanitizeCfg(cfg);
            const periodMin = intervalMinutesFromCfg(safe);
            const periodMs = Math.max(60000, periodMin*60000);
            const m = safe.startHHMM.match(/^(\d{2}):(\d{2})$/);
            const hh = m?parseInt(m[1],10):0;
            const mi = m?parseInt(m[2],10):0;
            const startMin = hh*60+mi;
            const dayMs = 86400000;
            const dayStart = Math.floor(nowLocalMs/dayMs)*dayMs;
            const firstMs = dayStart + startMin*60000;
            if(nowLocalMs < firstMs){
              return {periodMs, periodMin, firstMs, occMs:firstMs-periodMs, nextMs:firstMs};
            }
            const k = Math.floor((nowLocalMs-firstMs)/periodMs);
            const occMs = firstMs + k*periodMs;
            return {periodMs, periodMin, firstMs, occMs, nextMs:occMs+periodMs};
          }
          function formatHHMM(localMs){
            const d = new Date(localMs);
            const hh = String(d.getUTCHours()).padStart(2,"0");
            const mi = String(d.getUTCMinutes()).padStart(2,"0");
            return hh+":"+mi;
          }
          function getCfg(){
            let cfg = {};
            try{ cfg = JSON.parse(localStorage.getItem("oa_sched_kingdom_walk_cfg_v1")||"{}")||{}; }catch {}
            return sanitizeCfg(cfg);
          }
          window.__oaScheduler.getNextKingdomWalkRunInfo = function(){
            const cfg = getCfg();
            const now = getServerLocalMs();
            if(!cfg.enabled) return { enabled:false, nowLocalMs: now, nowText: formatHHMM(now), nextText:"—", cfg };
            const inf = scheduleInfo(now, cfg);
            const catchUpMs = Math.max(5000, cfg.catchUpMins*60000);
            const windowMs = Math.min(catchUpMs, Math.max(60000, Math.floor(inf.periodMs/2)));
            let boundary = inf.nextMs;
            if(inf.occMs >= inf.firstMs){
              const lateOcc = now - inf.occMs;
              if(lateOcc >=0 && lateOcc <= windowMs) boundary = inf.occMs;
            }
            const notBefore = Number(cfg.notBeforeLocalMs||0)||0;
            if(notBefore>0 && boundary < notBefore) boundary = notBefore;
            return { enabled:true, nowLocalMs: now, nowText: formatHHMM(now), nextLocalMs: boundary, nextText: formatHHMM(boundary), cfg, inf };
          };
          window.__oaScheduler.ping = function(){
            return { ok:true, version: window.__OA_SCRIPT_VERSION, hasGetNext: typeof window.__oaScheduler.getNextKingdomWalkRunInfo==="function" };
          };
        })();`;
        document.documentElement.appendChild(sc);
      }
    } catch {}
    window.__oaScheduler = window.__oaScheduler || {};
    const sch = window.__oaScheduler;

    // Always expose the scheduler API (even if timers were already armed).
    sch._loopsVersion = v;

    // Tear down any previous timers (safe on reload).
    try { if (sch._tickIv) clearInterval(sch._tickIv); } catch {}
    try { if (sch._baseIv) clearInterval(sch._baseIv); } catch {}
    try { if (sch._baseTo) clearTimeout(sch._baseTo); } catch {}

    sch._errLastLogMs = sch._errLastLogMs || 0;
    sch._lastError = sch._lastError || null;

    const __safeTick = () => {
      try { tick(); }
      catch (e) {
        try { sch._lastError = String(e && (e.stack || e.message) || e); } catch {}
        const now = Date.now();
        if (now - (sch._errLastLogMs || 0) > 15000) {
          sch._errLastLogMs = now;
          console.warn("[OA Scheduler] tick error:", e);
        }
      }
    };

    sch._tickIv = setInterval(__safeTick, 1000);
    sch._baseIv = setInterval(() => { try { readBase(); attachToggleHandler(); } catch {} }, 5000);
    sch._baseTo = setTimeout(() => { try { readBase(); attachToggleHandler(); } catch {} }, 900);

    sch._loopsArmed = true;
  } catch {}
}
ensureSchedulerLoops();try { if (window.top && window.top !== window.self) { /* no-op */ } else { window.top.__oaScheduler = window.__oaScheduler; } } catch {}

  // Optional tiny API for console use (and settings UI)
try {
  window.__oaScheduler = window.__oaScheduler || {};

  // Legacy hourly API (kept for older UI hooks)
  window.__oaScheduler.setHourlyKingdomWalkEnabled = (v) => { setEnabled(!!v); };
  window.__oaScheduler.setHourlyKingdomWalkProfile = (name) => { setDesiredWalkProfile(name); };
  window.__oaScheduler.getHourlyKingdomWalkProfile = () => getDesiredWalkProfile();

  // New scheduler API
  window.__oaScheduler.getKingdomWalkSchedule = () => getScheduleCfg();
  window.__oaScheduler.setKingdomWalkSchedule = (cfg) => { return setScheduleCfg(cfg || getScheduleCfg()); };
  window.__oaScheduler.mergeKingdomWalkSchedule = (partial) => { return mergeScheduleCfg(partial || {}); };
  window.__oaScheduler.getNextKingdomWalkRunInfo = () => { try { return getNextKingdomWalkRunInfo(); } catch (e) { try { window.__oaScheduler._lastError = String(e && (e.stack || e.message) || e); } catch {} return { error: String(e && (e.message || e) || e) }; } };
  window.__oaScheduler.ping = () => ({ ok: true, version: window.__OA_SCRIPT_VERSION || "6.9.16.37", loopsArmed: !!window.__oaScheduler._loopsArmed, loopsVersion: window.__oaScheduler._loopsVersion, lastError: window.__oaScheduler._lastError, hasGetNext: (typeof window.__oaScheduler.getNextKingdomWalkRunInfo === "function") });
  window.__oaScheduler.runKingdomWalkNow = () => {
    try {
      const atUtcSec = Math.floor(getServerUtcMs() / 1000);
      requestHourlyKingdomWalk("manual", atUtcSec);
    } catch {}
  };

  window.__oaScheduler.getServerLocalMs = () => getServerLocalMs();
  window.__oaScheduler.getServerUtcMs = () => getServerUtcMs();
} catch {}
})();;
function isSecurityCheckLikely() {
  const bodyText = (document.body?.innerText || "").toLowerCase();
  const titleText = (document.title || "").toLowerCase();
  const keywords = [
    "security check",
    "verify you are human",
    "captcha",
    "cloudflare",
    "challenge",
    "attention required",
    "human verification",
    "are you human",
  ];
  if (keywords.some((k) => bodyText.includes(k) || titleText.includes(k))) return true;

  if (document.querySelector('iframe[src*="captcha" i], iframe[src*="challenge" i], iframe[src*="cloudflare" i]')) return true;

  if (document.querySelector('#cf-wrapper, .cf-challenge, .cf-error-details, [id*="challenge" i]')) return true;
  if (document.querySelector('input[name*="captcha" i], div[class*="captcha" i]')) return true;
  if (document.querySelector('div[id*="captcha" i], div[id*="challenge" i]')) return true;

  return false;
}

function maybeBeepSecurityCheck() {
  if (!securityBeepEnabled) return;
  const now = Date.now();
  if (now - lastSecurityBeepAt < SECURITY_BEEP_COOLDOWN_MS) return;
  if (!isSecurityCheckLikely()) return;
  lastSecurityBeepAt = now;
  try { uiLog("SECURITY CHECK detected — beep", {}); } catch {}
  playSecurityBeep();
  try { notify("Security check detected!"); } catch {}
}

function installSecurityCheckObserver() {
  try {
    const mo = new MutationObserver(() => maybeBeepSecurityCheck());
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true, attributes: true });
    setTimeout(() => maybeBeepSecurityCheck(), 800);
  } catch {}
}

let autoBeastEnabled = loadAutoBeastEnabled();
let forceF2IgnoreDelay = loadForceF2IgnoreDelay();

      // If AutoBeast is OFF, prevent any stale auto jobs from causing teleport loops.
      (function cleanupAutoBeastJobsIfDisabled() {
        if (autoBeastEnabled) return;
        try {
          const raw = localStorage.getItem(BEAST_PENDING_KEY);
          if (raw) {
            let p = null;
            try { p = JSON.parse(raw); } catch {}
            const src = String((p && p.source) || raw || "");
            if (src === "auto") localStorage.removeItem(BEAST_PENDING_KEY);
          }
        } catch {}
        try {
          const job = loadInflightTeleport();
          if (job && String(job.source || "") === "auto") clearInflightTeleport();
        } catch {}
      })();

      function loadDebugEnabled() {
        try {
          const raw = localStorage.getItem(DEBUG_STORE_KEY);
          if (!raw) return false;
          return Boolean(JSON.parse(raw));
        } catch { return false; }
      }
      function saveDebugEnabled(v) { try { localStorage.setItem(DEBUG_STORE_KEY, JSON.stringify(!!v)); } catch {} }

      let debugEnabled = loadDebugEnabled();

      function dlog(msg, obj) {
        if (!debugEnabled) return;
        try { console.log(`[LastBeast][DBG] ${msg}`, obj ?? ""); } catch {}
      }

      let hudFloat = loadHudFloatEnabled();

      const wrap = document.createElement("div");
      wrap.id = UI_ID;

      Object.assign(wrap.style, {
        zIndex: "99997",
        position: "fixed",
        top: "10px",
        left: "10px",
        display: "flex",
        flexDirection: "column",
        width: "320px",
        maxHeight: "85vh",
        padding: "0",
        borderRadius: "8px",
        background: "rgba(15,15,25,0.97)",
        border: "1px solid rgba(212,175,55,0.4)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
        pointerEvents: "auto",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        fontSize: "11px",
        color: "#e5e5e5",
        userSelect: "none",
        overflow: "hidden",
      });

      // ── HUD Header (matching sa-hdr style) ──
      const hudHeader = document.createElement("div");
      Object.assign(hudHeader.style, {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "6px 10px",
        background: "rgba(212,175,55,0.15)",
        borderBottom: "1px solid rgba(212,175,55,0.3)",
        cursor: "move",
        flexShrink: "0",
      });
      const hudTitleEl = document.createElement("span");
      hudTitleEl.textContent = "\u2694\uFE0F Beast HUD";
      Object.assign(hudTitleEl.style, { fontWeight: "700", color: "#d4af37", fontSize: "12px" });
      const hudHeaderBtns = document.createElement("div");
      hudHeaderBtns.style.cssText = "display:flex;gap:3px;";
      const hudCloseBtn = document.createElement("button");
      hudCloseBtn.textContent = "\u2715";
      hudCloseBtn.title = "Close";
      hudCloseBtn.style.cssText = "background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#ccc;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:10px;";
      hudCloseBtn.onmouseenter = () => { hudCloseBtn.style.background = "rgba(212,175,55,0.3)"; hudCloseBtn.style.color = "#fff"; };
      hudCloseBtn.onmouseleave = () => { hudCloseBtn.style.background = "rgba(255,255,255,0.1)"; hudCloseBtn.style.color = "#ccc"; };
      hudCloseBtn.onclick = () => { wrap.style.display = "none"; try { localStorage.setItem("oa_hud_panel_vis_v1", "0"); } catch {} };
      hudHeaderBtns.appendChild(hudCloseBtn);
      hudHeader.append(hudTitleEl, hudHeaderBtns);
      wrap.appendChild(hudHeader);

      // ── Drag support (on header) ──
      let _hudDrag = false, _hudDx = 0, _hudDy = 0;
      hudHeader.onmousedown = (e) => {
        if (e.target === hudCloseBtn) return;
        _hudDrag = true; _hudDx = e.clientX - wrap.offsetLeft; _hudDy = e.clientY - wrap.offsetTop;
      };
      document.addEventListener("mousemove", (e) => { if (_hudDrag) { wrap.style.left = (e.clientX - _hudDx) + "px"; wrap.style.top = (e.clientY - _hudDy) + "px"; wrap.style.right = "auto"; } });
      document.addEventListener("mouseup", () => { _hudDrag = false; });

      // ── HUD Body (scrollable content area) ──
      const hudBody = document.createElement("div");
      Object.assign(hudBody.style, { overflowY: "auto", padding: "8px 10px", flex: "1" });
      wrap.appendChild(hudBody);

      const leftCol = document.createElement("div");
      Object.assign(leftCol.style, {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        width: "100%",
      });

      const headerRow = document.createElement("div");
      Object.assign(headerRow.style, {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
        flexWrap: "wrap",
      });

      const leftHeader = document.createElement("div");
      Object.assign(leftHeader.style, { display: "flex", alignItems: "center", gap: "6px", flex: "1 1 auto", minWidth: 0 });

      const title = document.createElement("div");
      Object.assign(title.style, {
        fontSize: "10px",
        fontWeight: "600",
        letterSpacing: "0.5px",
        textTransform: "uppercase",
        color: "#94a3b8",
        whiteSpace: "nowrap",
      });
      title.textContent = "Teleport";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Go";
      btn.className = "oa-button oa-button--primary px-3 py-1 text-xs";
      Object.assign(btn.style, { fontSize: "11px", padding: "4px 10px", borderRadius: "999px" });
      btn.onclick = () => submitLastBeast('button');

      leftHeader.append(title, btn);

      const rightHeader = document.createElement("div");
      Object.assign(rightHeader.style, { display: "flex", alignItems: "center", gap: "6px", flex: "0 0 auto", flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "100%" });

      const resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.textContent = "Reset";
      resetBtn.className = "oa-button px-3 py-1 text-xs";
      Object.assign(resetBtn.style, {
        fontSize: "11px",
        padding: "4px 10px",
        borderRadius: "999px",
        background: "rgba(148,163,184,0.15)",
        border: "1px solid rgba(148,163,184,0.45)",
        color: "#e5e7eb",
        cursor: "pointer",
      });

      const cdResetBtn = document.createElement("button");
      cdResetBtn.type = "button";
      cdResetBtn.textContent = "CD-Reset";
      cdResetBtn.className = "oa-button px-3 py-1 text-xs";
      Object.assign(cdResetBtn.style, {
        fontSize: "11px",
        padding: "4px 10px",
        borderRadius: "999px",
        background: "rgba(239,68,68,0.12)",
        border: "1px solid rgba(239,68,68,0.35)",
        color: "#fee2e2",
        cursor: "pointer",
      });

const limitResetBtn = document.createElement("button");
limitResetBtn.type = "button";
limitResetBtn.textContent = "Limit-Reset";
limitResetBtn.className = "oa-button px-3 py-1 text-xs";
Object.assign(limitResetBtn.style, {
  fontSize: "11px",
  padding: "4px 10px",
  borderRadius: "999px",
  background: "rgba(251,191,36,0.14)",
  border: "1px solid rgba(251,191,36,0.40)",
  color: "#fff7ed",
  cursor: "pointer",
});
limitResetBtn.title = "Reset beast kill-limit blocks (re-enables capped beasts in dropdown).\nClick = reset ALL (daily+weekly).\nCtrl/Cmd+Click = reset DAILY only.\nShift+Click = reset WEEKLY only.\nDaily reset: 00:00. Weekly reset: Saturday 23:59.";

limitResetBtn.addEventListener("click", (ev) => {
  const isShift = !!(ev && ev.shiftKey);
  const isCtrl = !!(ev && (ev.ctrlKey || ev.metaKey));
  const scope = isShift ? "weekly" : (isCtrl ? "daily" : "all");
  const msg =
    scope === "weekly" ? "Reset WEEKLY beast kill limits now?\n\nThis clears the script's weekly cap blocks and re-enables disabled beast options."
    : scope === "daily" ? "Reset DAILY beast kill limits now?\n\nThis clears the script's daily cap blocks and re-enables disabled beast options."
    : "Reset ALL beast kill limits (daily + weekly) now?\n\nThis clears the script's cap blocks and re-enables disabled beast options.";
  if (!confirm(msg)) return;

  try {
    if (typeof window.OA_ResetBeastLimits === "function") window.OA_ResetBeastLimits(scope);
    else if (typeof __oaResetBeastLimits === "function") __oaResetBeastLimits(scope);
  } catch {}

  try { renderReadyStatus(`Limits reset: ${scope}`); setTimeout(() => renderReadyStatus(""), 1400); } catch {}
});
const autoLabel = document.createElement("label");
      Object.assign(autoLabel.style, {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "11px",
        cursor: "pointer",
        padding: "2px 8px",
        borderRadius: "999px",
        background: autoBeastEnabled ? "rgba(22,163,74,0.18)" : "rgba(148,163,184,0.15)",
        border: "1px solid rgba(148,163,184,0.45)",
        whiteSpace: "nowrap",
      });

      const autoCheckbox = document.createElement("input");
      autoCheckbox.type = "checkbox";
      autoCheckbox.checked = autoBeastEnabled;
      autoCheckbox.style.margin = "0";

      const autoSpan = document.createElement("span");
      autoSpan.textContent = "Auto";
      autoSpan.style.paddingTop = "1px";

      autoLabel.append(autoCheckbox, autoSpan);

      const f2Label = document.createElement("label");
      Object.assign(f2Label.style, {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "11px",
        cursor: "pointer",
        padding: "2px 8px",
        borderRadius: "999px",
        background: forceF2IgnoreDelay ? "rgba(168,85,247,0.18)" : "rgba(148,163,184,0.15)",
        border: "1px solid rgba(148,163,184,0.45)",
        whiteSpace: "nowrap",
      });

      const f2Checkbox = document.createElement("input");
      f2Checkbox.type = "checkbox";
      f2Checkbox.checked = forceF2IgnoreDelay;
      f2Checkbox.style.margin = "0";

      const f2Span = document.createElement("span");
      f2Span.textContent = "F2 Force";
      f2Span.title = "Ignore action-delay checks for F2 Last Beast teleport";
      f2Span.style.paddingTop = "1px";

      f2Label.append(f2Checkbox, f2Span);

const secLabel = document.createElement("label");
Object.assign(secLabel.style, {
  display: "flex",
  alignItems: "center",
  gap: "4px",
  fontSize: "11px",
  cursor: "pointer",
  padding: "2px 8px",
  borderRadius: "999px",
  background: securityBeepEnabled ? "rgba(34,197,94,0.18)" : "rgba(148,163,184,0.15)",
  border: "1px solid rgba(148,163,184,0.45)",
  userSelect: "none",
});

const secCheckbox = document.createElement("input");
secCheckbox.type = "checkbox";
secCheckbox.checked = !!securityBeepEnabled;

const secSpan = document.createElement("span");
secSpan.textContent = "Security Beep";

secLabel.append(secCheckbox, secSpan);
const beepLabel = document.createElement("label");
      Object.assign(beepLabel.style, {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "11px",
        cursor: "pointer",
        padding: "2px 8px",
        borderRadius: "999px",
        background: botcheck.beepEnabled ? "rgba(251,191,36,0.14)" : "rgba(148,163,184,0.15)",
        border: "1px solid rgba(148,163,184,0.45)",
        whiteSpace: "nowrap",
      });

      const beepCheckbox = document.createElement("input");
      beepCheckbox.type = "checkbox";
      beepCheckbox.checked = !!botcheck.beepEnabled;
      beepCheckbox.style.margin = "0";

      const beepSpan = document.createElement("span");
      beepSpan.textContent = "Beep";

      beepLabel.append(beepCheckbox, beepSpan);

      const debugLabel = document.createElement("label");
      Object.assign(debugLabel.style, {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "11px",
        cursor: "pointer",
        padding: "2px 8px",
        borderRadius: "999px",
        background: debugEnabled ? "rgba(239,68,68,0.14)" : "rgba(148,163,184,0.15)",
        border: "1px solid rgba(148,163,184,0.45)",
        whiteSpace: "nowrap",
      });

      const debugCheckbox = document.createElement("input");
      debugCheckbox.type = "checkbox";
      debugCheckbox.checked = !!debugEnabled;
      debugCheckbox.style.margin = "0";

      const debugSpan = document.createElement("span");
      debugSpan.textContent = "Debug";

      debugLabel.append(debugCheckbox, debugSpan);

      const visLabel = document.createElement("label");
      Object.assign(visLabel.style, {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "11px",
        cursor: "pointer",
        padding: "2px 8px",
        borderRadius: "999px",
        background: (loadVisSpoofEnabled() || loadAntiPauseEnabled()) ? "rgba(34,197,94,0.14)" : "rgba(148,163,184,0.15)",
        border: "1px solid rgba(148,163,184,0.45)",
        whiteSpace: "nowrap",
      });

      const visCheckbox = document.createElement("input");
      visCheckbox.type = "checkbox";
      visCheckbox.checked = loadVisSpoofEnabled() || loadAntiPauseEnabled();
      visCheckbox.style.margin = "0";

      const visSpan = document.createElement("span");
      visSpan.textContent = "KeepAlive";

      visLabel.append(visCheckbox, visSpan);

      beepCheckbox.addEventListener("change", () => {
        botcheck.beepEnabled = !!beepCheckbox.checked;
        saveBotcheckBeepEnabled(botcheck.beepEnabled);
        beepLabel.style.background = botcheck.beepEnabled ? "rgba(251,191,36,0.14)" : "rgba(148,163,184,0.15)";
      });

      debugCheckbox.addEventListener("change", () => {
        debugEnabled = !!debugCheckbox.checked;
        saveDebugEnabled(debugEnabled);
        debugLabel.style.background = debugEnabled ? "rgba(239,68,68,0.14)" : "rgba(148,163,184,0.15)";
        dlog("Debug toggled", { enabled: debugEnabled });
        renderReadyStatus("");
      });

      visCheckbox.addEventListener("change", () => {
        const enabled = !!visCheckbox.checked;
        saveVisSpoofEnabled(enabled);
        saveAntiPauseEnabled(enabled);
        visLabel.style.background = enabled ? "rgba(34,197,94,0.14)" : "rgba(148,163,184,0.15)";
        dlog("KeepAlive toggled", { enabled });
        if (enabled) {
          // User gesture → we can start audio reliably here.
          try { startSilentAudio((m, o) => console.log(`[OA AntiPause] ${m}`, o ?? "")); } catch {}
        }
        renderReadyStatus(enabled ? "KeepAlive ON (refresh)" : "KeepAlive OFF (refresh)");
      });

      const layoutLabel = document.createElement("label");
      Object.assign(layoutLabel.style, {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "11px",
        cursor: "pointer",
        padding: "2px 8px",
        borderRadius: "999px",
        background: panelLayout.enabled ? "rgba(59,130,246,0.14)" : "rgba(148,163,184,0.15)",
        border: "1px solid rgba(148,163,184,0.45)",
        whiteSpace: "nowrap",
      });

      const layoutCheckbox = document.createElement("input");
      layoutCheckbox.type = "checkbox";
      layoutCheckbox.checked = !!panelLayout.enabled;
      layoutCheckbox.style.margin = "0";

      const layoutSpan = document.createElement("span");
      layoutSpan.textContent = "Layout";

      layoutLabel.append(layoutCheckbox, layoutSpan);

      const pinLabel = document.createElement("label");
      Object.assign(pinLabel.style, {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "11px",
        cursor: "pointer",
        padding: "2px 8px",
        borderRadius: "999px",
        background: loadPinCombatUiEnabled() ? "rgba(16,185,129,0.14)" : "rgba(148,163,184,0.15)",
        border: "1px solid rgba(148,163,184,0.45)",
        whiteSpace: "nowrap",
      });

      const pinCheckbox = document.createElement("input");
      pinCheckbox.type = "checkbox";
      pinCheckbox.checked = loadPinCombatUiEnabled();
      pinCheckbox.style.margin = "0";

      const pinSpan = document.createElement("span");
      pinSpan.textContent = "Pin";

      pinLabel.append(pinCheckbox, pinSpan);

      pinCheckbox.addEventListener("change", () => {
        const enabled = !!pinCheckbox.checked;
        savePinCombatUiEnabled(enabled);
        pinLabel.style.background = enabled ? "rgba(16,185,129,0.14)" : "rgba(148,163,184,0.15)";
        applyPinCombatUi(enabled);
        dlog("PinCombatUI toggled", { enabled });
      });

      // Keep the game's built-in AutoCombat running: if it stops, try to start it again (across pages).
      const ensureAutoLabel = document.createElement("label");
      Object.assign(ensureAutoLabel.style, {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "11px",
        cursor: "pointer",
        padding: "2px 8px",
        borderRadius: "999px",
        background: loadGameAutoForce() ? "rgba(59,130,246,0.14)" : "rgba(148,163,184,0.15)",
        border: "1px solid rgba(148,163,184,0.45)",
        whiteSpace: "nowrap",
      });

      const ensureAutoCheckbox = document.createElement("input");
      ensureAutoCheckbox.type = "checkbox";
      ensureAutoCheckbox.checked = loadGameAutoForce();
      ensureAutoCheckbox.style.margin = "0";

      const ensureAutoSpan = document.createElement("span");
      ensureAutoSpan.textContent = "AutoKeep";

      ensureAutoLabel.append(ensureAutoCheckbox, ensureAutoSpan);

      ensureAutoCheckbox.addEventListener("change", () => {
        const enabled = !!ensureAutoCheckbox.checked;

        saveGameAutoForce(enabled);
        ensureAutoLabel.style.background = enabled ? "rgba(59,130,246,0.14)" : "rgba(148,163,184,0.15)";
        dlog("GameAutoKeepalive toggled", { enabled });

        if (enabled) {
          // While AutoKeep is ON we want built-in auto to be ON and kept running.
          saveGameAutoWanted(true);
          startGameAutoKeepAliveLoop();

          // Best-effort immediate start (loop will also do it).
          try { setTimeout(() => tryStartGameAutoCombat("hud-keepalive-enable"), 80); } catch {}
        } else {
          // Stop forcing: do NOT restart built-in auto anymore.
          stopGameAutoKeepAliveLoop();
        }

        renderReadyStatus(enabled ? "AutoKeep ON" : "AutoKeep OFF");
        setTimeout(() => renderReadyStatus(""), 1100);
      });

      const layoutResetBtn = document.createElement("button");
      layoutResetBtn.type = "button";
      layoutResetBtn.textContent = "L-Reset";
      layoutResetBtn.className = "oa-button px-3 py-1 text-xs";
      Object.assign(layoutResetBtn.style, {
        fontSize: "11px",
        padding: "4px 10px",
        borderRadius: "999px",
        background: "rgba(148,163,184,0.15)",
        border: "1px solid rgba(148,163,184,0.45)",
        color: "#e5e7eb",
        cursor: "pointer",
      });

      layoutCheckbox.addEventListener("change", () => {
        setPanelLayoutEnabled(!!layoutCheckbox.checked);
        layoutLabel.style.background = panelLayout.enabled ? "rgba(59,130,246,0.14)" : "rgba(148,163,184,0.15)";
      });

      layoutResetBtn.addEventListener("click", () => {
        try { localStorage.removeItem(LAYOUT_STORE_KEY); } catch {}
        panelLayout.positions = {};
        // Re-apply defaults immediately
        if (panelLayout.enabled) {
          teardownPanelLayout();
          applyPanelLayoutIfNeeded();
        }
      });

      const floatLabel = document.createElement("label");
      Object.assign(floatLabel.style, {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "11px",
        cursor: "pointer",
        padding: "2px 8px",
        borderRadius: "999px",
        background: hudFloat ? "rgba(168,85,247,0.16)" : "rgba(148,163,184,0.15)",
        border: "1px solid rgba(148,163,184,0.45)",
        whiteSpace: "nowrap",
      });

      const floatCheckbox = document.createElement("input");
      floatCheckbox.type = "checkbox";
      floatCheckbox.checked = !!hudFloat;
      floatCheckbox.style.margin = "0";

      const floatSpan = document.createElement("span");
      floatSpan.textContent = "Float";

      floatLabel.append(floatCheckbox, floatSpan);

      const kingdomLabel = document.createElement("label");
      Object.assign(kingdomLabel.style, {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "11px",
        cursor: "pointer",
        padding: "2px 8px",
        borderRadius: "999px",
        background: kingdomWidget.enabled ? "rgba(34,197,94,0.12)" : "rgba(148,163,184,0.15)",
        border: "1px solid rgba(148,163,184,0.45)",
        whiteSpace: "nowrap",
      });

      const kingdomCheckbox = document.createElement("input");
      kingdomCheckbox.type = "checkbox";
      kingdomCheckbox.checked = !!kingdomWidget.enabled;
      kingdomCheckbox.style.margin = "0";

      const kingdomSpan = document.createElement("span");
      kingdomSpan.textContent = "Kingdom";

      kingdomLabel.append(kingdomCheckbox, kingdomSpan);

      // Manual Resume Button (workaround if auto-resume fails)
      const resumeBtn = document.createElement("button");
      Object.assign(resumeBtn.style, {
        padding: "4px 8px",
        fontSize: "10px",
        cursor: "pointer",
        border: "1px solid rgba(34,197,94,0.3)",
        borderRadius: "4px",
        background: "rgba(34,197,94,0.15)",
        color: "#22c55e",
        marginLeft: "6px",
        fontWeight: "500",
        display: "none" // Hidden by default
      });
      resumeBtn.textContent = "Resume F1";
      resumeBtn.title = "Manually resume F1 auto-combat after security check";
      resumeBtn.onclick = () => {
        console.log('[ManualResume] Button clicked - forcing resume');
        // Force resume regardless of checks
        try { localStorage.removeItem(BOTCHECK_RESUME_KEY); } catch {}
        botcheck.pausedAuto = false;
        state.enabled = true;
        autoModeForRates = true;
        saveAutoCombatEnabled(true);
        touchAutoCombatStart();
        ensureCombatTab();
        scheduleLoop();
        log("F1 resumed manually via button!");
        resumeBtn.style.display = "none";
      };

      // Show resume button when botcheck appears if F1 was running
      const resumeBtnMonitor = setInterval(() => {
        try {
          const visible = isBotcheckVisible();
          if (visible && state.enabled && resumeBtn.style.display === "none") {
            setTimeout(() => {
              try {
                // Show button 3 seconds after security check appears
                if (isBotcheckVisible()) {
                  resumeBtn.style.display = "inline-block";
                  console.log('[ManualResume] Showing resume button (security check active)');
                }
              } catch (e) {
                console.error('[ManualResume] Error showing button:', e);
              }
            }, 3000);
          } else if (!visible && resumeBtn.style.display === "inline-block") {
            // Hide button when security check is gone
            resumeBtn.style.display = "none";
          }
        } catch (e) {
          console.error('[ManualResume] Monitor error:', e);
        }
      }, 500);

      rightHeader.append(resetBtn, cdResetBtn, limitResetBtn, autoLabel, f2Label, secLabel, beepLabel, debugLabel, layoutLabel, pinLabel, ensureAutoLabel, layoutResetBtn, kingdomLabel, resumeBtn);
      headerRow.append(leftHeader, rightHeader);

      const status = document.createElement("div");
      Object.assign(status.style, {
        fontSize: "11px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        padding: "5px 7px",
        borderRadius: "5px",
        background: "rgba(0,0,0,0.3)",
        border: "1px solid rgba(255,255,255,0.06)",
        color: "#e5e5e5",
      });

      // Combat Profile selector (under Ready/Auto line)
      const profileWrap = document.createElement("div");
      Object.assign(profileWrap.style, {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "2px 8px",
        borderRadius: "999px",
        background: "rgba(148,163,184,0.15)",
        border: "1px solid rgba(148,163,184,0.45)",
        whiteSpace: "nowrap",
        width: "fit-content",
      });

      const profileLabel = document.createElement("span");
      profileLabel.textContent = "Combat";
      Object.assign(profileLabel.style, { fontSize: "11px", opacity: "0.9", paddingTop: "1px" });

      const profileSelect = document.createElement("select");
      Object.assign(profileSelect.style, {
        fontSize: "11px",
        borderRadius: "999px",
        padding: "2px 8px",
        background: "rgba(15,23,42,0.9)",
        color: "#e5e7eb",
        border: "1px solid rgba(148,163,184,0.45)",
        outline: "none",
        cursor: "pointer",
      });

      for (const p of Object.values(COMBAT_PROFILES)) {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.label;
        profileSelect.appendChild(opt);
      }
      profileSelect.value = combatProfileId;
      profileWrap.append(profileLabel, profileSelect);

      const profileRow = document.createElement("div");
      Object.assign(profileRow.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginTop: "2px",
      });
      profileRow.append(profileWrap);

      const coordRow = document.createElement("div");
      Object.assign(coordRow.style, {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginTop: "2px",
      });

      const coordLabel = document.createElement("div");
      coordLabel.textContent = "TP";
      Object.assign(coordLabel.style, {
        fontSize: "11px",
        fontWeight: "700",
        color: "#fde68a",
        padding: "0 6px",
        borderRadius: "999px",
        background: "rgba(251,191,36,0.12)",
        border: "1px solid rgba(251,191,36,0.25)",
      });

      const xInput = document.createElement("input");
      xInput.type = "number";
      xInput.inputMode = "numeric";
      xInput.placeholder = "X";
      xInput.min = "0";
      xInput.style.width = "52px";
      Object.assign(xInput.style, {
        fontSize: "11px",
        padding: "4px 6px",
        borderRadius: "8px",
        background: "rgba(15,23,42,0.9)",
        border: "1px solid rgba(148,163,184,0.45)",
        color: "#e5e7eb",
        outline: "none",
      });

      const yInput = document.createElement("input");
      yInput.type = "number";
      yInput.inputMode = "numeric";
      yInput.placeholder = "Y";
      yInput.min = "0";
      yInput.style.width = "52px";
      Object.assign(yInput.style, {
        fontSize: "11px",
        padding: "4px 6px",
        borderRadius: "8px",
        background: "rgba(15,23,42,0.9)",
        border: "1px solid rgba(148,163,184,0.45)",
        color: "#e5e7eb",
        outline: "none",
      });

      const tpBtn = document.createElement("button");
      tpBtn.type = "button";
      tpBtn.textContent = "Go";
      tpBtn.className = "oa-button oa-button--primary px-3 py-1 text-xs";
      Object.assign(tpBtn.style, { fontSize: "11px", padding: "4px 10px", borderRadius: "999px" });
      tpBtn.onclick = () => submitTeleportCoords(xInput.value, yInput.value, "hud");

      coordRow.append(coordLabel, xInput, yInput, tpBtn);

      const statsDiv = document.createElement("div");
      Object.assign(statsDiv.style, {
        fontSize: "11px",
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        whiteSpace: "pre",
        lineHeight: "1.35",
        opacity: "0.95",
        padding: "5px 7px",
        borderRadius: "5px",
        background: "rgba(0,0,0,0.3)",
        border: "1px solid rgba(255,255,255,0.06)",
        width: "100%",
        boxSizing: "border-box",
      });

      statsDiv.textContent = getStatsSummary();
      statsDisplayRefresh = function () { statsDiv.textContent = getStatsSummary(); };
      statsDisplayRefresh();

      // ─── Fight by Number row ───────────────────────────────────────────────
      const fightNumRow = document.createElement("div");
      Object.assign(fightNumRow.style, {
        display: "flex", alignItems: "center", gap: "6px",
        padding: "5px 0 2px", borderTop: "1px solid rgba(255,255,255,0.07)",
      });
      const fightNumLabel = document.createElement("span");
      fightNumLabel.textContent = "Fight #";
      Object.assign(fightNumLabel.style, { fontSize: "11px", color: "#94a3b8", whiteSpace: "nowrap", flexShrink: "0" });
      const fightNumInput = document.createElement("input");
      fightNumInput.type = "number"; fightNumInput.inputMode = "numeric";
      fightNumInput.min = "1"; fightNumInput.placeholder = "1, 2, 3…";
      try { const sv = localStorage.getItem("oa_fight_num_v1"); if (sv) fightNumInput.value = sv; } catch {}
      Object.assign(fightNumInput.style, {
        width: "60px", fontSize: "11px", padding: "4px 6px", borderRadius: "8px",
        background: "rgba(15,23,42,0.9)", border: "1px solid rgba(148,163,184,0.45)",
        color: "#e5e7eb", outline: "none",
      });
      const fightNumName = document.createElement("span");
      fightNumName.style.cssText = "font-size:10px;color:#64748b;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      function updateFightNumPreview() {
        const n = parseInt(fightNumInput.value, 10);
        if (!n || n < 1) { fightNumName.textContent = ""; return; }
        const sel = document.getElementById("monster-select");
        if (!sel) { fightNumName.textContent = ""; return; }
        const monsterOpts = Array.from(sel.options).filter(opt =>
          opt.dataset && opt.dataset.monsterOption === "1" && opt.value && opt.value !== ""
        );
        const opt = monsterOpts[n - 1];
        fightNumName.textContent = opt ? (opt.dataset.monsterName || opt.textContent.trim()) : `(${monsterOpts.length} mobs on plane)`;
      }
      fightNumInput.addEventListener("input", updateFightNumPreview);
      fightNumInput.addEventListener("change", updateFightNumPreview);
      const fightNumBtn = document.createElement("button");
      fightNumBtn.type = "button";
      fightNumBtn.className = "oa-button oa-button--primary px-3 py-1 text-xs";
      Object.assign(fightNumBtn.style, { fontSize: "11px", padding: "4px 10px", borderRadius: "999px", flexShrink: "0" });
      fightNumBtn.textContent = "Pin";
      fightNumBtn.title = "Pin this mob — auto combat will always fight it (beasts still have priority!)";
      fightNumBtn.onclick = () => {
        const n = parseInt(fightNumInput.value, 10);
        if (!n || n < 1) { renderReadyStatus("Enter a position number"); setTimeout(() => renderReadyStatus(""), 1500); return; }
        try { localStorage.setItem("oa_fight_num_v1", String(n)); } catch {}
        const sel = document.getElementById("monster-select");
        const monsterOpts = sel ? Array.from(sel.options).filter(opt =>
          opt.dataset && opt.dataset.monsterOption === "1" && opt.value && opt.value !== ""
        ) : [];
        const opt = monsterOpts[n - 1];
        const mobName = opt ? (opt.dataset.monsterName || opt.textContent.trim()) : `Position #${n}`;
        if (sel && opt) {
          sel.value = String(opt.value);
          sel.dispatchEvent(new Event("input",  { bubbles: true }));
          sel.dispatchEvent(new Event("change", { bubbles: true }));
        }
        renderReadyStatus(`Pinned: ${mobName}`);
        fightNumClearBtn.style.display = "";
      };

      const fightNumClearBtn = document.createElement("button");
      fightNumClearBtn.type = "button";
      fightNumClearBtn.textContent = "✕";
      fightNumClearBtn.title = "Clear pin — auto combat resumes highest-level targeting";
      Object.assign(fightNumClearBtn.style, {
        fontSize: "11px", padding: "4px 7px", borderRadius: "999px", flexShrink: "0",
        background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)",
        color: "#fca5a5", cursor: "pointer",
        display: localStorage.getItem("oa_fight_num_v1") ? "" : "none",
      });
      fightNumClearBtn.onclick = () => {
        try { localStorage.removeItem("oa_fight_num_v1"); } catch {}
        fightNumInput.value = "";
        fightNumName.textContent = "";
        fightNumClearBtn.style.display = "none";
        renderReadyStatus("Pin cleared — auto-select highest level");
        setTimeout(() => renderReadyStatus(""), 1500);
      };

      fightNumInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); fightNumBtn.click(); } });
      fightNumRow.append(fightNumLabel, fightNumInput, fightNumName, fightNumBtn, fightNumClearBtn);
      setTimeout(updateFightNumPreview, 200);

      leftCol.append(headerRow, status, profileRow, coordRow, fightNumRow, statsDiv);
      hudBody.appendChild(leftCol);

      function formatLocCooldownLabel() {
        const h = LOCATION_COOLDOWN_MS / 3600000;
        if (Math.abs(h - 2) < 0.01) return "2h/loc";
        return `${fmtNumber(h, 1, 1)}h/loc`;
      }

      function renderReadyStatus(extra) {
        const base = autoBeastEnabled
          ? `Ready · Auto ON · Loc CD ${formatLocCooldownLabel()}`
          : `Ready · Auto OFF · Loc CD ${formatLocCooldownLabel()}`;
        status.textContent = extra ? `${extra} · ${base}` : base;
      }

      profileSelect.addEventListener("change", () => {
        setCombatProfileId(profileSelect.value);
        statsDisplayRefresh?.();

        if (state?.enabled) {
          state.nextEligibleActionAt = 0;
          stopLoop();
          scheduleLoop();
        }

        renderReadyStatus(`Combat: ${getSelectedCombatProfile().label}`);
        setTimeout(() => renderReadyStatus(""), 1100);
      });

      resetBtn.onclick = () => {
        const ok = confirm("Reset HUD stats?\n\nClears: Fights/Attacks/Pots/Revives/LB/Auto time/XP+Gold gains.");
        if (!ok) return;
        resetAllStats();
        renderReadyStatus("Stats reset");
        setTimeout(() => renderReadyStatus(""), 1600);
      };

      let cleanupDrag = null;
      let embedded = false;

      function remountHud() {
        try { cleanupDrag?.(); } catch {}
        cleanupDrag = null;

        // Always fixed panel (we have our own drag in the header)
        wrap.style.position = "fixed";

        // Restore visibility
        try {
          const vis = localStorage.getItem("oa_hud_panel_vis_v1");
          if (vis === "0") wrap.style.display = "none";
          else wrap.style.display = "flex";
        } catch {}

        if (!wrap.parentNode) document.body.appendChild(wrap);

        // Create toggle button above stat analyzer button
        if (!document.getElementById("oa-hud-toggle-btn")) {
          const toggleBtn = document.createElement("button");
          toggleBtn.id = "oa-hud-toggle-btn";
          toggleBtn.textContent = "\u2694\uFE0F";
          toggleBtn.title = "Beast HUD (F5)";
          toggleBtn.style.cssText = `
            position:fixed; bottom:50px; right:10px; width:34px; height:34px;
            background:linear-gradient(135deg,rgba(30,58,95,0.9),rgba(45,27,105,0.9));
            border:1px solid rgba(212,175,55,0.4); border-radius:50%; z-index:99998;
            cursor:pointer; font-size:15px; display:flex; align-items:center; justify-content:center;
            box-shadow:0 2px 8px rgba(0,0,0,0.3);
          `;
          toggleBtn.onclick = () => {
            const vis = wrap.style.display !== "none";
            wrap.style.display = vis ? "none" : "flex";
            try { localStorage.setItem("oa_hud_panel_vis_v1", vis ? "0" : "1"); } catch {}
          };
          document.body.appendChild(toggleBtn);

          // F5 hotkey
          document.addEventListener("keydown", (e) => {
            if (e.key === "F5" && !(e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) {
              e.preventDefault();
              const vis = wrap.style.display !== "none";
              wrap.style.display = vis ? "none" : "flex";
              try { localStorage.setItem("oa_hud_panel_vis_v1", vis ? "0" : "1"); } catch {}
            }
          });
        }

        renderReadyStatus("");
      }

      startInflightVerifier();

      function startInflightVerifier() {
        const job = loadInflightTeleport();
        if (!job || !job.submittedAt || !job.cdKey) return;
        if (String(job.source || "") === "auto" && !autoBeastEnabled) {
          dlog("AutoBeast OFF - clearing inflight auto teleport job.", job);
          clearInflightTeleport();
          try {
            const raw = localStorage.getItem(BEAST_PENDING_KEY);
            if (raw) {
              let p = null;
              try { p = JSON.parse(raw); } catch {}
              const src = String((p && p.source) || raw || "");
              if (src === "auto") localStorage.removeItem(BEAST_PENDING_KEY);
            }
          } catch {}
          return;
        }

        const startedAt = Date.now();
        dlog("Inflight verifier started", job);

        const timer = setInterval(() => {
          const cur = getCurrentLocationKey();
          const target = job.cdKey;
          const age = Date.now() - Number(job.submittedAt || startedAt);

          if (cur && locMatches(cur, target)) {
            dlog("Teleport arrival confirmed", { cur, target, ageMs: age });
            try { setCooldownForLocation(target, "arrived"); } catch {}
            clearInflightTeleport();
            renderReadyStatus("Arrived · returning to combat…");

            // Return to combat after arrival confirm.
            try {
              const url = new URL(location.href);
              url.pathname = "/game.php";
              url.searchParams.set("tab", "combat");
              OA.NAV.replace(url.toString());
            } catch {}

            clearInterval(timer);
            return;
          }

          if (age > INFLIGHT_MAX_MS) {
            dlog("Inflight expired; clearing", { ageMs: age, cur, target });
            clearInflightTeleport();
            renderReadyStatus("Teleport timed out");
            clearInterval(timer);
            return;
          }

          // If we seem not to have moved after a few seconds, re-attempt (route to map) a limited number of times.
          // DISABLED - this was causing infinite loops
          /*
          if (age > INFLIGHT_RETRY_AFTER_MS) {
            const curJob = loadInflightTeleport();
            if (!curJob) { clearInterval(timer); return; }

            const attempts = Number(curJob.attempts || 1);
            if (attempts >= 4) return;

            // Only retry if we can read current location and we appear not to have moved.
            if (!cur) return;
            if (curJob.fromLoc && !locMatches(cur, curJob.fromLoc)) return;

            // If we're already on Map, let the pending handler do the next submit.
            if (getCurrentTab() !== "map") {
              dlog("Teleport seems not applied; requeueing attempt", { attempts, cur, target });
              saveInflightTeleport({ ...curJob, attempts: attempts + 1, submittedAt: Date.now() });
              const _src = String(curJob.source || "auto");
              if (_src === "auto" && !autoBeastEnabled) {
                dlog("AutoBeast OFF - skipping inflight retry requeue.", curJob);
                return;
              }
              try { localStorage.setItem(BEAST_PENDING_KEY, JSON.stringify({ source: _src, cdKey: curJob.cdKey || "" })); } catch {}
              const url = new URL(location.href);
              url.pathname = "/game.php";
              url.searchParams.set("tab", "map");
              location.href = url.toString();
            }
          }
          */
        }, 500);

        // Safety: stop after max ms even if tab unloads.
        setTimeout(() => { try { clearInterval(timer); } catch {} }, INFLIGHT_MAX_MS + 1000);
      }

      floatCheckbox?.addEventListener?.("change", () => {
        hudFloat = !!floatCheckbox.checked;
        saveHudFloatEnabled(hudFloat);
        floatLabel.style.background = hudFloat ? "rgba(168,85,247,0.16)" : "rgba(148,163,184,0.15)";
        remountHud();
      });

      kingdomCheckbox.addEventListener("change", () => {
        kingdomWidget.enabled = !!kingdomCheckbox.checked;
        saveKingdomWidgetEnabled(kingdomWidget.enabled);
        kingdomLabel.style.background = kingdomWidget.enabled ? "rgba(34,197,94,0.12)" : "rgba(148,163,184,0.15)";

        // If you enable the panel, turn on Layout automatically so you can move/resize it.
        if (kingdomWidget.enabled && !panelLayout.enabled) {
          panelLayout.enabled = true;
          savePanelLayoutEnabled(true);
          layoutCheckbox.checked = true;
        }

        applyPanelLayoutIfNeeded();
      });

      remountHud();

      (function handlePendingLastBeast() {
        const tab = getCurrentTab();
        if (tab !== "map") return;

        let pending = null;
        try {
          const raw = localStorage.getItem(BEAST_PENDING_KEY);
          if (raw) {
            // Keep pending in storage until we actually submit (so early CSRF issues won't drop it).
            try { pending = JSON.parse(raw); } catch { pending = { source: raw, cdKey: "" }; }
          }
        } catch {}

        if (!pending) return;

        const src = pending.source || "unknown";
        const cdKey = pending.cdKey || "";

        // CLEAR PENDING IMMEDIATELY to prevent loops
        try { localStorage.removeItem(BEAST_PENDING_KEY); } catch {}

        if (String(src) === "auto" && !autoBeastEnabled) {
          uiLog("AutoBeast OFF - ignoring pending auto beast teleport.", pending);
          status.textContent = "AutoBeast OFF · ignored pending auto teleport";
          return;
        }

        uiLog("Pending Last Beast teleport found on Map tab; submitting now.", pending);
        status.textContent = "Executing pending Last Beast teleport from Map…";
        submitLastBeast(src, cdKey);
      })();

      (function handlePendingCoordTeleport() {
        const tab = getCurrentTab();
        if (tab !== "map") return;

        let pending = null;
        try {
          const raw = localStorage.getItem(COORD_PENDING_KEY);
          if (raw) {
            // Keep pending in storage until we actually submit.
            pending = JSON.parse(raw);
          }
        } catch {}

        if (!pending || typeof pending !== "object") return;

        const x = pending.x;
        const y = pending.y;
        uiLog("Pending coord teleport found on Map tab; submitting now.", pending);
        status.textContent = `Executing pending coord teleport to (${x}, ${y})…`;
        submitTeleportCoords(x, y, pending.source || "pending");
      })();

      function onBeastHotkey(e) {
        if (e.key !== "F2") return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (isTypingTarget(e.target)) return;

        e.preventDefault();
        submitLastBeast('hotkey');
      }
      document.addEventListener("keydown", onBeastHotkey, true);

      // Track when Auto was just enabled to prevent immediate teleport
      let autoJustEnabledAt = 0;

      autoCheckbox.addEventListener('change', () => {
        autoBeastEnabled = !!autoCheckbox.checked;
        saveAutoBeastEnabled(autoBeastEnabled);
        autoLabel.style.background = autoBeastEnabled ? "rgba(22,163,74,0.18)" : "rgba(148,163,184,0.15)";
        if (autoBeastEnabled) {
          // Set a cooldown so we don't immediately teleport
          autoJustEnabledAt = Date.now();
          console.log("[AutoBeast] Turned ON - 3s cooldown before teleporting");
        } else {
          // Clear pending teleport state when turning off - but NOT the location tracking!
          // The location tracking prevents loops, so we need to keep it
          pendingSpawn = null;
          try { localStorage.removeItem(BEAST_PENDING_KEY); } catch {}
          try { localStorage.removeItem(BEAST_INFLIGHT_KEY); } catch {}
          console.log("[AutoBeast] Turned OFF - cleared pending state (kept location tracking)");
        }
        renderReadyStatus("");
      });

f2Checkbox.addEventListener('change', () => {
  forceF2IgnoreDelay = !!f2Checkbox.checked;
  saveForceF2IgnoreDelay(forceF2IgnoreDelay);

secCheckbox.addEventListener('change', () => {
  securityBeepEnabled = !!secCheckbox.checked;
  saveSecurityBeepEnabled(securityBeepEnabled);
  secLabel.style.background = securityBeepEnabled ? "rgba(34,197,94,0.18)" : "rgba(148,163,184,0.15)";
  if (securityBeepEnabled) {
    try { unlockOaAudio(); } catch {}
    try { playSecurityBeep(); } catch {}
    notify("Security beep enabled.");
  }
});f2Label.style.background = forceF2IgnoreDelay ? "rgba(168,85,247,0.18)" : "rgba(148,163,184,0.15)";
  if (forceF2IgnoreDelay) notify("F2 Force enabled (ignores action-delay checks).");
});

      // ------------------------------
      // Location cooldown store
      // ------------------------------
      function loadLocationCooldowns() {
        try {
          const raw = localStorage.getItem(LOCATION_COOLDOWNS_KEY);
          const obj = raw ? JSON.parse(raw) : {};
          const out = {};
          let changed = false;

          for (const [k, v] of Object.entries((obj && typeof obj === "object") ? obj : {})) {
            const nk = normalizeLocKey(k);
            const until = Number(v || 0);
            if (!nk || !Number.isFinite(until) || until <= 0) { changed = true; continue; }
            if (!out[nk] || until > out[nk]) out[nk] = until;
            if (nk !== String(k || "").trim().toLowerCase()) changed = true;
          }

          if (changed) {
            try { localStorage.setItem(LOCATION_COOLDOWNS_KEY, JSON.stringify(out)); } catch {}
          }
          return out;
        } catch {
          return {};
        }
      }
      function saveLocationCooldowns(map) {
        try { localStorage.setItem(LOCATION_COOLDOWNS_KEY, JSON.stringify(map || {})); } catch {}
      }
      function loadSpawnBackoff() {
        try {
          const raw = localStorage.getItem(SPAWN_BACKOFF_KEY);
          const obj = raw ? JSON.parse(raw) : {};
          const out = {};
          let changed = false;

          for (const [k, v] of Object.entries((obj && typeof obj === "object") ? obj : {})) {
            const nk = normalizeLocKey(k);
            const until = Number(v || 0);
            if (!nk || !Number.isFinite(until) || until <= 0) { changed = true; continue; }
            if (!out[nk] || until > out[nk]) out[nk] = until;
            if (nk !== String(k || "").trim().toLowerCase()) changed = true;
          }

          if (changed) {
            try { localStorage.setItem(SPAWN_BACKOFF_KEY, JSON.stringify(out)); } catch {}
          }
          return out;
        } catch {
          return {};
        }
      }
      function saveSpawnBackoff(map) {
        try { localStorage.setItem(SPAWN_BACKOFF_KEY, JSON.stringify(map || {})); } catch {}
      }
      let spawnBackoff = loadSpawnBackoff();

      function pruneSpawnBackoff(now = Date.now()) {
        let changed = false;
        for (const k of Object.keys(spawnBackoff || {})) {
          const until = Number(spawnBackoff[k] || 0);
          if (!until || until <= now) { delete spawnBackoff[k]; changed = true; }
        }
        if (changed) saveSpawnBackoff(spawnBackoff);
      }
      function getSpawnBackoffUntil(key) {
        if (!key) return 0;
        pruneSpawnBackoff();
        const nk = normalizeLocKey(key);
        return Number(spawnBackoff[nk] || 0);
      }
      function setSpawnBackoff(key, until) {
        if (!key) return;
        pruneSpawnBackoff();
        const nk = normalizeLocKey(key);
        spawnBackoff[nk] = Number(until || 0);
        saveSpawnBackoff(spawnBackoff);
      }
      function clearSpawnBackoff(key) {
        if (!key) return;
        const nk = normalizeLocKey(key);
        delete spawnBackoff[nk];
        saveSpawnBackoff(spawnBackoff);
      }

      let locationCooldowns = loadLocationCooldowns();

      function resetLocationCooldowns() {
        try { localStorage.removeItem("oa_beast_location_cooldowns_v1"); } catch {}
        try { localStorage.removeItem(LOCATION_COOLDOWNS_KEY); } catch {}
        // Also clear the simple last beast location
        try { localStorage.removeItem("oa_last_beast_location_v1"); } catch {}
        locationCooldowns = {};
        saveLocationCooldowns(locationCooldowns);
        uiLog("Cooldowns + last location cleared.");
        renderReadyStatus("Cooldowns cleared");
        dlog("Cooldowns cleared", { key: LOCATION_COOLDOWNS_KEY });
        console.log("[AutoBeast] CD Reset: Cleared last beast location");
        setTimeout(() => renderReadyStatus(""), 1600);
      }

      // Wire CD reset button now that cooldown store is initialized (avoids TDZ issues).
      try {
        cdResetBtn.onclick = () => {
          const ok = confirm("Clear Last Beast location cooldowns?\n\nThis lets AutoBeast teleport again for locations currently on cooldown.");
          if (!ok) return;
          resetLocationCooldowns();
        };
      } catch {}

      function pruneLocationCooldowns() {
        const now = Date.now();
        let changed = false;
        for (const [loc, until] of Object.entries(locationCooldowns)) {
          if (!until || !Number.isFinite(until) || until <= now) {
            delete locationCooldowns[loc];
            changed = true;
          }
        }
        if (changed) saveLocationCooldowns(locationCooldowns);
      }
      function getLocationCooldownUntil(loc) {
        pruneLocationCooldowns();
        const nk = normalizeLocKey(loc);
        const v = Number(locationCooldowns[nk] || 0);
        return Number.isFinite(v) ? v : 0;
      }
      function setLocationCooldown(loc, untilEpochMs) {
        if (!loc) return;
        const nk = normalizeLocKey(loc);
        locationCooldowns[nk] = Number(untilEpochMs) || 0;
        saveLocationCooldowns(locationCooldowns);
      }

      // ------------------------------
      // BEAST ALERT detection (Observer + dedupe + per-location cooldown + pending)
      // ------------------------------
      function loadLastBeastSeen() {
        try {
          const raw = localStorage.getItem(BEAST_STORE_KEY);
          if (!raw) return null;
          return JSON.parse(raw);
        } catch { return null; }
      }
      function saveLastBeastSeen(obj) { try { localStorage.setItem(BEAST_STORE_KEY, JSON.stringify(obj)); } catch {} }

      let lastBeastSeen = loadLastBeastSeen();
      let pendingSpawn = null;
      let lastAutoTeleportAt = 0;
      const AUTO_BEAST_MIN_GAP_MS = 1500;

      const SEEN_TTL_MS = 6 * 60 * 60 * 1000;
      const SEEN_CACHE_KEY = "oa_beast_seen_cache_v1";

      // Load seen cache from localStorage
      function loadSeenCache() {
        try {
          const raw = localStorage.getItem(SEEN_CACHE_KEY);
          if (!raw) return new Map();
          const obj = JSON.parse(raw);
          return new Map(Object.entries(obj));
        } catch { return new Map(); }
      }

      // Save seen cache to localStorage
      function saveSeenCache(cache) {
        try {
          const obj = Object.fromEntries(cache);
          localStorage.setItem(SEEN_CACHE_KEY, JSON.stringify(obj));
        } catch {}
      }

      const seenCache = loadSeenCache();

      function pruneSeenCache() {
        const now = Date.now();
        let changed = false;
        for (const [k, t] of seenCache) {
          if (now - t > SEEN_TTL_MS) {
            seenCache.delete(k);
            changed = true;
          }
        }
        if (changed) saveSeenCache(seenCache);
      }
      function markSeen(key) {
        pruneSeenCache();
        seenCache.set(key, Date.now());
        saveSeenCache(seenCache);
      }
      function hasSeen(key) { pruneSeenCache(); return seenCache.has(key); }

      function normalizeText(s) {
        return String(s || "").replace(/\s+/g, " ").trim();
      }
      function hashStringDjb2(s) {
        let h = 5381;
        for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
        return (h >>> 0).toString(16);
      }
      function stableBeastSignature(text) {
        let s = String(text || "");
        s = s.replace(/^\s*\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*:?\s*/i, "");
        s = s.replace(/\s+/g, " ").trim().toLowerCase();
        return s;
      }

      function extractLocation(text) {
        const raw = String(text || "");
        const norm = raw.replace(/\s+/g, " ").trim();

        // Prefer scanning the tail after the last " at " if present (more stable)
        const lower = norm.toLowerCase();
        const atIdx = lower.lastIndexOf(" at ");
        const search = atIdx >= 0 ? norm.slice(atIdx + 4) : norm;

        // Find the LAST coordinate-like triple: 017,Aetheria,017 (spaces/parentheses allowed)
        const reLoc = /(\d{1,3})\s*,\s*([A-Za-z][A-Za-z0-9 _'\-]+?)\s*,\s*(\d{1,3})/g;
        const matches = Array.from(search.matchAll(reLoc));
        const mm = matches.length ? matches[matches.length - 1] : null;
        if (mm) {
          const a = String(mm[1]).padStart(3, "0");
          const plane = String(mm[2]).trim().replace(/\s+/g, "");
          const b = String(mm[3]).padStart(3, "0");
          return `${a},${plane},${b}`;
        }

        // Fallback: anything after last " at "
        if (atIdx >= 0) {
          const tail = norm.slice(atIdx + 4).replace(/[.\s]+$/g, "").trim();
          if (tail.includes(",") && tail.length <= 80) return tail.replace(/\s+/g, "");
        }
        return "";
      }

      function extractBeastName(text) {
        const t = String(text || "");
        // For spawn: "[BEAST ALERT] Steelhero has spawned Harpie at 027,Aetheria,006!"
        // We want "Harpie"
        const spawnMatch = t.match(/has\s+spawned\s+(.+?)\s+at\s+/i);
        if (spawnMatch) return spawnMatch[1].trim();

        // For slain: "[BEAST ALERT] Azzok has slain Minotaur at 025,Katabasis,033"
        // We want "Minotaur"
        const slainMatch = t.match(/has\s+slain\s+(.+?)\s+at\s+/i);
        if (slainMatch) return slainMatch[1].trim();

        // For weekly limit: "You cannot kill any more Lernaean Hydra this week"
        const limitMatch = t.match(/cannot kill any more\s+(.+?)\s+this week/i);
        if (limitMatch) return limitMatch[1].trim();

        // Fallback: try to get player name (old behavior)
        const m = t.match(/^\s*\[BEAST ALERT\]\s*(.+?)\s+has\s+/i);
        return (m ? m[1] : "").trim();
      }

      function parseBeastAlert(raw) {
        const text = normalizeText(raw);
        const upper = text.toUpperCase();
        if (!upper.includes("[BEAST ALERT]")) return null;

        const isSpawn =
          upper.includes("HAS SPAWNED") ||
          upper.includes("HAS EMERGED") ||
          upper.includes("HAS APPEARED") ||
          upper.includes("HAS AWAKENED") ||
          upper.includes("HAS RISEN");

        const isSlain =
          upper.includes("HAS BEEN SLAIN") ||
          upper.includes("HAS BEEN DEFEATED") ||
          upper.includes("HAS FALLEN") ||
          upper.includes("HAS SLAIN");

        const isVanished =
          upper.includes("HAS VANISHED") ||
          upper.includes("HAS DISAPPEARED") ||
          upper.includes("HAS FLED");

        let kind = null;
        if (isSpawn) kind = "spawn";
        else if (isSlain) kind = "slain";
        else if (isVanished) kind = "vanished";
        else return null;

        const location = extractLocation(text);
        const beastName = extractBeastName(text);

        return { text, kind, location, beastName };
      }

      function buildBeastKey(parsed) {
        const sig = `${parsed.kind}|${stableBeastSignature(parsed.text)}`;
        return `sig:${hashStringDjb2(sig)}`;
      }

      function isLocationBlocked(locOrKey) {
        if (!locOrKey) return false;
        return Date.now() < getLocationCooldownUntil(locOrKey);
      }

      function setCooldownForLocation(locOrKey, reason) {
        if (!locOrKey) return;
        const until = Date.now() + LOCATION_COOLDOWN_MS;
        setLocationCooldown(locOrKey, until);
        uiLog(`Cooldown set (${reason})`, { key: locOrKey, until });
      }

      // SIMPLE TELEPORT LOCK - prevents repeated teleports
      const TELEPORT_LOCK_KEY = "oa_beast_teleport_lock_v1";

      function getTeleportLock() {
        try {
          const raw = localStorage.getItem(TELEPORT_LOCK_KEY);
          if (!raw) return null;
          return JSON.parse(raw);
        } catch { return null; }
      }

      function setTeleportLock(location) {
        try {
          localStorage.setItem(TELEPORT_LOCK_KEY, JSON.stringify({
            location: location,
            timestamp: Date.now()
          }));
          console.log("[AutoBeast] LOCK SET for location:", location);
        } catch {}
      }

      function clearTeleportLock() {
        try {
          localStorage.removeItem(TELEPORT_LOCK_KEY);
          console.log("[AutoBeast] LOCK CLEARED");
        } catch {}
      }

      function isLocationLocked(location) {
        const lock = getTeleportLock();
        if (!lock) return false;

        // Lock expires after 5 minutes
        const age = Date.now() - lock.timestamp;
        if (age > 5 * 60 * 1000) {
          clearTeleportLock();
          return false;
        }

        // Check if same location (normalize for comparison)
        const normLoc = String(location || "").replace(/\s+/g, "").toLowerCase();
        const normLock = String(lock.location || "").replace(/\s+/g, "").toLowerCase();

        if (normLoc === normLock) {
          console.log("[AutoBeast] Location is LOCKED:", location, "age:", Math.round(age/1000), "s");
          return true;
        }

        return false;
      }

      // ========== SIMPLE BEAST SYSTEM ==========
      // Just store the last teleported location and don't go there again
      const LAST_BEAST_LOC_KEY = "oa_last_beast_location_v1";
      const LAST_BEAST_TELEPORT_KEY = "oa_last_beast_teleport_v1";

      function getLastBeastLocation() {
        try {
          return localStorage.getItem(LAST_BEAST_LOC_KEY) || "";
        } catch { return ""; }
      }

      function setLastBeastLocation(loc) {
        try {
          localStorage.setItem(LAST_BEAST_LOC_KEY, loc);
          // Also save timestamp
          localStorage.setItem(LAST_BEAST_TELEPORT_KEY, JSON.stringify({
            location: loc,
            teleportedAt: Date.now()
          }));
          console.log("[AutoBeast] Saved location:", loc);
        } catch {}
      }

      function clearLastBeastLocation() {
        try {
          localStorage.removeItem(LAST_BEAST_LOC_KEY);
          // DON'T clear LAST_BEAST_TELEPORT_KEY - we need it to prevent loops
          // It will naturally expire after 30 minutes
          console.log("[AutoBeast] Cleared saved location (kept teleport timestamp)");
        } catch {}
      }

      // Normalize location for comparison (strip leading zeros, lowercase)
      function normalizeLocation(loc) {
        if (!loc) return "";
        // Parse x,plane,y format
        const parts = String(loc).split(",");
        if (parts.length !== 3) return String(loc).toLowerCase().trim();
        const x = parseInt(parts[0], 10);
        const plane = parts[1].trim();
        const y = parseInt(parts[2], 10);
        return `${x},${plane},${y}`.toLowerCase();
      }

      // Check if we recently teleported to this location (within last 5 minutes)
      function wasRecentlyTeleportedTo(loc) {
        try {
          const raw = localStorage.getItem(LAST_BEAST_TELEPORT_KEY);
          console.log("[AutoBeast] wasRecentlyTeleportedTo check - raw:", raw, "| checking loc:", loc);
          if (!raw) return false;
          const data = JSON.parse(raw);
          const savedNorm = normalizeLocation(data.location);
          const checkNorm = normalizeLocation(loc);
          console.log("[AutoBeast] Comparing normalized:", savedNorm, "vs", checkNorm);
          if (savedNorm !== checkNorm) return false;
          const age = Date.now() - (data.teleportedAt || 0);
          // If we teleported to this location in the last 30 minutes, skip
          if (age < 30 * 60 * 1000) {
            console.log("[AutoBeast] Recently teleported to", loc, "(" + Math.round(age/1000) + "s ago)");
            return true;
          }
          return false;
        } catch (e) {
          console.log("[AutoBeast] wasRecentlyTeleportedTo error:", e);
          return false;
        }
      }

      // Track processed message IDs in localStorage to survive page reloads
      const PROCESSED_MSGS_KEY = "oa_beast_processed_msgs_v1";

      function getProcessedMessages() {
        try {
          const raw = localStorage.getItem(PROCESSED_MSGS_KEY);
          if (!raw) return {};
          return JSON.parse(raw);
        } catch { return {}; }
      }

      function markMessageProcessed(msgId) {
        try {
          const msgs = getProcessedMessages();
          msgs[msgId] = Date.now();
          // Clean up old entries (older than 2 hours)
          const cutoff = Date.now() - 2 * 60 * 60 * 1000;
          for (const [id, time] of Object.entries(msgs)) {
            if (time < cutoff) delete msgs[id];
          }
          localStorage.setItem(PROCESSED_MSGS_KEY, JSON.stringify(msgs));
        } catch {}
      }

      function wasMessageProcessed(msgId) {
        try {
          const msgs = getProcessedMessages();
          return !!msgs[msgId];
        } catch { return false; }
      }

      function maybeHandleBeastMessage(el) {
        const rawText = el?.textContent || "";
        const parsed = parseBeastAlert(rawText);
        if (!parsed) return;

        // Create a unique key for this message
        const msgId = el?.dataset?.messageId || el?.dataset?.messageid || rawText.slice(0, 100);

        // Don't do anything on beast death messages
        if (parsed.kind === "slain" || parsed.kind === "vanished") {
          console.log("[AutoBeast] Beast died/vanished, ignoring:", parsed.beastName);
          return;
        }

        if (parsed.kind !== "spawn") return;

        console.log("[AutoBeast] Spawn detected:", parsed.beastName, "at", parsed.location);

        // CHECK IF THIS BEAST IS WEEKLY LIMITED
        if (parsed.beastName && isBeastWeeklyLimited(parsed.beastName)) {
          console.log("[AutoBeast] Beast is weekly limited, skipping:", parsed.beastName);
          return;
        }

        // CHECK IF WE ALREADY PROCESSED THIS MESSAGE (survives page reloads)
        if (wasMessageProcessed(msgId)) {
          console.log("[AutoBeast] Message already processed, skipping");
          return;
        }

        // CHECK FRESH FROM LOCALSTORAGE - not the in-memory variable
        const freshAutoEnabled = loadAutoBeastEnabled();
        if (!freshAutoEnabled) {
          console.log("[AutoBeast] Auto disabled, skipping");
          return;
        }

        // Check if Auto was just enabled - wait 3 seconds before teleporting
        if (autoJustEnabledAt && Date.now() - autoJustEnabledAt < 3000) {
          console.log("[AutoBeast] Auto just enabled, waiting for cooldown...");
          return;
        }

        // Don't teleport if in combat
        const cs = getCombatState();
        if (cs && cs.inCombat) {
          console.log("[AutoBeast] In combat, will retry later");
          return;
        }

        // Mark as processed BEFORE teleporting (this survives page reloads)
        console.log("[AutoBeast] Marking message as processed:", msgId);
        markMessageProcessed(msgId);

        console.log("[AutoBeast] *** TELEPORTING via /rc ***");

        // Use /rc command - it always goes to the last beast
        submitLastBeast("auto", parsed.location);
      }

      function scanNodeForBeastAlerts(node) {
        if (!node) return;
        if (!autoBeastEnabled) return;

        // Don't clear on beast death - it causes loops since death message stays in chat

        const el = (node.nodeType === 1) ? node : (node.nodeType === 3 ? node.parentElement : null);
        if (!el) return;

        const txt = el.textContent || "";
        if (txt && txt.toUpperCase?.().includes("[BEAST ALERT]")) maybeHandleBeastMessage(el);

        const descendants = el.querySelectorAll?.('[data-message-id],[data-messageid],div,li,p,span');
        if (!descendants) return;

        for (const d of descendants) {
          const t = d.textContent || "";
          if (t && t.toUpperCase?.().includes("[BEAST ALERT]")) maybeHandleBeastMessage(d);
        }
      }

      // Check for chariot success message: "You take the Reigns of the Chariot to..."
      const seenChariotMsgIds = new Set();

      function checkForChariotSuccessMessage(node) {
        if (!node) return;
        const el = (node.nodeType === 1) ? node : (node.nodeType === 3 ? node.parentElement : null);
        if (!el) return;

        // Get message ID to avoid re-processing
        const msgEl = el.closest?.('[data-message-id],[data-messageid]') || el;
        const msgId = msgEl?.dataset?.messageId || msgEl?.dataset?.messageid || msgEl?.getAttribute?.('data-message-id') || msgEl?.getAttribute?.('data-messageid') || "";

        const txt = String(el.textContent || "").toLowerCase();
        if (txt.includes("take the reigns of the chariot") || txt.includes("reigns of the chariot to")) {
          if (msgId && seenChariotMsgIds.has(msgId)) return; // Already processed
          if (msgId) seenChariotMsgIds.add(msgId);
          console.log("[AutoBeast] Chariot success detected in chat, setting 10s cooldown, msgId:", msgId);
          setChariotCooldown();
          return; // Don't check descendants if we found it
        }

        // Also check descendants
        const descendants = el.querySelectorAll?.('[data-message-id],[data-messageid],div,li,p,span');
        if (!descendants) return;
        for (const d of descendants) {
          const dMsgEl = d.closest?.('[data-message-id],[data-messageid]') || d;
          const dMsgId = dMsgEl?.dataset?.messageId || dMsgEl?.dataset?.messageid || dMsgEl?.getAttribute?.('data-message-id') || dMsgEl?.getAttribute?.('data-messageid') || "";

          const t = String(d.textContent || "").toLowerCase();
          if (t.includes("take the reigns of the chariot") || t.includes("reigns of the chariot to")) {
            if (dMsgId && seenChariotMsgIds.has(dMsgId)) continue; // Already processed
            if (dMsgId) seenChariotMsgIds.add(dMsgId);
            console.log("[AutoBeast] Chariot success detected in chat (descendant), setting 10s cooldown, msgId:", dMsgId);
            setChariotCooldown();
            return;
          }
        }
      }

      function flushPendingSpawn() {
        pendingSpawn = null;
        if (state) state.holdForBeastTeleport = false;
      }

      function findChatContainer() {
        const sel = '#chat-messages, #chat-log, [data-chat-messages], [data-chat], .chat-messages, .chat-log';
        const direct = document.querySelector(sel);
        if (direct) return direct;

        const msg = document.querySelector('[data-message-id], [data-messageid]');
        if (msg) {
          return msg.closest?.(sel) || msg.parentElement;
        }
        return null;
      }

      // Prime from existing history (no teleport)
      (function primeBeastSeenFromExistingChat() {
        // Check if there's an existing spawn in chat and mark that location as "already teleported"
        // This prevents teleporting on page load to a beast we might already be at
        try {
          const container = findChatContainer() || document;
          const candidates = container.querySelectorAll?.('[data-message-id],[data-messageid],div,li,p,span') || [];

          for (const el of candidates) {
            const t = el.textContent || "";
            if (!t || !t.toUpperCase?.().includes("[BEAST ALERT]")) continue;
            const parsed = parseBeastAlert(t);
            if (parsed?.kind === "spawn" && parsed.location) {
              // There's a spawn in chat history - save this location so we don't teleport to it
              setLastBeastLocation(parsed.location);
              console.log("[AutoBeast] Found existing spawn in chat, marking location:", parsed.location);
              break;
            }
          }
        } catch (e) {
          console.log("[AutoBeast] Error priming from chat:", e);
        }

        uiLog("Beast system initialized.");
      })();

      let chatObserver = null;
      let fallbackPollTimer = null;
      let safetyPollTimer = null;
      let pendingTimer = null;

      // Track which beast NAMES have hit weekly limit (stored in localStorage to persist)
      const WEEKLY_LIMIT_KEY = "oa_beast_weekly_limits_v1";

      function getWeeklyLimitedBeasts() {
        try {
          const raw = localStorage.getItem(WEEKLY_LIMIT_KEY);
          if (!raw) return {};
          return JSON.parse(raw);
        } catch { return {}; }
      }

      function markBeastWeeklyLimited(beastName, scope) {
        try {
          const limits = getWeeklyLimitedBeasts();
          const n = String(beastName || "").trim().toLowerCase();
          if (!n) return;

          const sc = (String(scope || "").toLowerCase().includes("week")) ? "weekly" : "daily";
          const now = Date.now();

          limits[n] = {
            at: now,
            scope: sc,
            dayKey: __oaServerDayKey(),
            weekKey: __oaServerWeekKey(),
            date: new Date(__oaGetServerNowMs()).toDateString() // backwards compat
          };

          localStorage.setItem(WEEKLY_LIMIT_KEY, JSON.stringify(limits));
          console.log("[AutoBeast] Marked beast as " + sc + " limited:", beastName);
        } catch {}
      }

      function isBeastWeeklyLimited(beastName) {
        // Unified with __oaIsBeastNameLimited (handles daily + weekly + cleanup)
        try { return __oaIsBeastNameLimited(beastName); } catch { return false; }
      }

      // Track weekly/daily limit messages we've already handled
      const handledLimitMsgs = new Set();

      // Key for storing teleport time
      const BEAST_TELEPORT_TIME_KEY = "oa_beast_teleport_time_v1";
      const BEAST_LIMIT_MSG_WINDOW_MS = 15000; // Only react to limit messages within 15s of teleport

      function checkForBeastLimitMessage(node) {
        if (!node) return;
        const text = node.textContent || "";

        // Match "You cannot kill any more [beast] this week" OR "today"
        const isLimitMsg = text.includes("cannot kill any more") &&
                          (text.includes("this week") || text.includes("today"));
        if (!isLimitMsg) return;

        // Get message ID to avoid duplicate handling
        const msgEl = node.closest?.('[data-message-id],[data-messageid]') || node;
        const msgId = msgEl?.dataset?.messageId || msgEl?.dataset?.messageid || "";

        if (msgId && handledLimitMsgs.has(msgId)) return;
        if (msgId) handledLimitMsgs.add(msgId);

        // Extract beast name from message like "You cannot kill any more Minotaur today (2/2)."
        const match = text.match(/cannot kill any more\s+(?:of\s+)?(?:the\s+)?(.+?)\s+(?:this week|today)\b/i);
        if (!match || !match[1]) return;

        const beastName = match[1].trim();
        const isDaily = text.includes("today");
        const limitScope = isDaily ? "daily" : "weekly";
        console.log("[AutoBeast] " + (isDaily ? "Daily" : "Weekly") + " limit reached for:", beastName);

        // Mark beast as limited
        markBeastWeeklyLimited(beastName, limitScope);

        // Disable the matching beast option in the dropdown right away
        // (prevents AutoCombat from re-selecting it and spamming attacks).
        try {
          const sel = document.getElementById("monster-select");
          if (sel) {
            const b = beastName.toLowerCase();
            for (const opt of Array.from(sel.options || [])) {
              const v = String(opt?.value || "");
              const isBeastOpt = v.startsWith("beast:") || opt?.dataset?.beastOption === "1";
              if (!isBeastOpt) continue;
              const t = String(opt?.textContent || "").toLowerCase();
              const optName = (typeof __oaExtractBeastNameFromOption === "function") ? __oaExtractBeastNameFromOption(opt).toLowerCase() : "";
              if ((optName && (optName === b || optName.includes(b) || b.includes(optName))) || t.includes(b)) {
                opt.disabled = true;
                opt.setAttribute("data-oa-limit-disabled", "1");
              }
            }
          }
        } catch {}

        // Broadcast a short-lived event for any other loop to react immediately
        try {
          localStorage.setItem("oa_last_beast_limit_event_v1", JSON.stringify({
            at: Date.now(),
            beast: beastName,
            scope: (isDaily ? "daily" : "weekly")
          }));
        } catch {}

        // ALWAYS clear beast targeting state and switch to regular combat
        console.log("[AutoBeast] Limit message detected, clearing beast state and switching target...");

        // Clear the teleport time
        try { localStorage.removeItem(BEAST_TELEPORT_TIME_KEY); } catch {}

        // Clear beast targeting state
        try { localStorage.removeItem("oa_last_beast_pending_v1"); } catch {}
        try { localStorage.removeItem("oa_beast_return_to_combat_v1"); } catch {}

        // Restore plane lock if we saved one
        try {
          const savedPlane = localStorage.getItem("oa_beast_return_plane_v1");
          if (savedPlane) {
            localStorage.setItem("oa_pve_plane_lock_v1", savedPlane);
            localStorage.removeItem("oa_beast_return_plane_v1");
            console.log("[AutoBeast] Restored plane lock:", savedPlane);
          }
        } catch {}

        // ALWAYS switch to a REGULAR monster (not beast) when we see a limit message
        console.log("[AutoBeast] Switching to regular monster (not beast)...");
        try {
          selectRegularMonster();
        } catch (e) {
          console.log("[AutoBeast] Error selecting regular monster:", e);
        }

        // Show status
        if (status) {
          status.textContent = "Beast limit reached, resuming normal combat...";
        }

        // Also stop any ongoing combat with F key simulation
        console.log("[AutoBeast] Stopping current combat target...");
      }

      // Alias for backwards compatibility
      function checkForWeeklyLimitMessage(node) {
        checkForBeastLimitMessage(node);
      }

      (function startBeastObserver() {
        const container = findChatContainer();
        if (container) {
          chatObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
              if (m.type === "childList") {
                if (!m.addedNodes || !m.addedNodes.length) continue;
                for (const n of m.addedNodes) {
                  scanNodeForBeastAlerts(n);
                  checkForWeeklyLimitMessage(n);
                  checkForChariotSuccessMessage(n);
                }
              } else if (m.type === "characterData") {
                scanNodeForBeastAlerts(m.target);
                checkForWeeklyLimitMessage(m.target);
                checkForChariotSuccessMessage(m.target);
              }
            }
          });
          chatObserver.observe(container, { childList: true, subtree: true, characterData: true });
          uiLog("Chat observer attached for BEAST alerts.", container);
          dlog("Observer attached", { foundContainer: true });
          // Safety scan: chat implementations sometimes update text nodes without adding elements.
          // This scans the last few message nodes periodically (cheap) to avoid missing spawns.
          safetyPollTimer = setInterval(() => {
            const nodes = Array.from(document.querySelectorAll('[data-message-id],[data-messageid]'));
            const tail = nodes.slice(Math.max(0, nodes.length - 25));
            for (const el of tail) {
              scanNodeForBeastAlerts(el);
              checkForWeeklyLimitMessage(el);
              checkForChariotSuccessMessage(el);
            }
          }, 1500);

        } else {
          uiLog("Chat container not found; using fallback polling for BEAST alerts.");
          dlog("Observer fallback polling", { foundContainer: false });
          fallbackPollTimer = setInterval(() => {
            const nodes = Array.from(document.querySelectorAll('[data-message-id],[data-messageid]'));
            const tail = nodes.slice(Math.max(0, nodes.length - 25));
            for (const el of tail) {
              scanNodeForBeastAlerts(el);
              checkForWeeklyLimitMessage(el);
              checkForChariotSuccessMessage(el);
            }
          }, 1200);

        // Safety scan even in fallback mode
        if (!safetyPollTimer) {
          safetyPollTimer = setInterval(() => {
            const nodes = Array.from(document.querySelectorAll('[data-message-id],[data-messageid]'));
            const tail = nodes.slice(Math.max(0, nodes.length - 25));
            for (const el of tail) {
              scanNodeForBeastAlerts(el);
              checkForWeeklyLimitMessage(el);
              checkForChariotSuccessMessage(el);
            }
          }, 1500);
        }
        }

        pendingTimer = setInterval(flushPendingSpawn, 500);
      })();

      // ========== BEAST DETECTION VIA CHAT ==========
      // Simple approach: watch chat for beast spawn messages, teleport when Auto is ON
      // ================================================

      window.__oaLastBeast = {
        go() { submitLastBeast('api'); },
        testTeleport() {
          console.log("[AutoBeast] TEST: Calling doSubmitLastBeastNow...");
          doSubmitLastBeastNow("test", "test");
        },
        teleportCoords(x, y) { submitTeleportCoords(x, y, 'api'); },
        teleportLoc(locTriple) {
          const xy = parseLocTripleToXY(locTriple);
          if (!xy) return uiLog('teleportLoc: invalid loc', locTriple);
          submitTeleportCoords(xy.x, xy.y, 'api');
        },
        stop() {
          document.removeEventListener("keydown", onBeastHotkey, true);

          chatObserver?.disconnect();
          chatObserver = null;

          if (fallbackPollTimer) { clearInterval(fallbackPollTimer); fallbackPollTimer = null; }
          if (safetyPollTimer) { clearInterval(safetyPollTimer); safetyPollTimer = null; }
          if (pendingTimer) { clearInterval(pendingTimer); pendingTimer = null; }
          if (teleportRetryTimer) { clearInterval(teleportRetryTimer); teleportRetryTimer = null; }
          teleportRetryJob = null;

          cleanupDrag?.();
          wrap.remove();
          delete window.__oaLastBeast;
          uiLog("Unloaded");
        },
        resetPos() {
          localStorage.removeItem(POS_STORE_KEY);
          if (!embedded) {
            wrap.style.right = "16px";
            wrap.style.bottom = "56px";
            wrap.style.left = "auto";
            wrap.style.top = "auto";
          }
          status.textContent = embedded ? `Position fixed (embedded).` : `Position reset. Shift+Drag to move`;
        },
        resetBeastMemory() {
          localStorage.removeItem(BEAST_STORE_KEY);
          localStorage.removeItem(LOCATION_COOLDOWNS_KEY);
          locationCooldowns = {};
          lastBeastSeen = null;
          pendingSpawn = null;
          uiLog("Cleared stored beast alert memory + location cooldowns.");
        },
        resetCooldowns() {
          resetLocationCooldowns?.();
        },

        resetStats() {
          resetAllStats();
          renderReadyStatus("Stats reset");
          setTimeout(() => renderReadyStatus(""), 1600);
        },
        setAuto(enabled) {
          autoBeastEnabled = !!enabled;
          autoCheckbox.checked = autoBeastEnabled;
          saveAutoBeastEnabled(autoBeastEnabled);
          autoLabel.style.background = autoBeastEnabled ? "rgba(22,163,74,0.18)" : "rgba(148,163,184,0.15)";
          if (!autoBeastEnabled) pendingSpawn = null;
          uiLog(`Auto Beast set to ${autoBeastEnabled ? "ON" : "OFF"} via API.`);
          renderReadyStatus("");
        },
      };

      uiLog(
        `Loaded. F1: AutoCombat, F2: Last Beast, 1–9: tabs, Auto Beast: ${
          autoBeastEnabled ? "ON" : "OFF"
        }, Alerts: observer+dedupe+pending, cooldown: 2h/location. HUD: ${embedded ? "embedded" : "floating"}.`
      );
    })();
  }

  waitForGameAndStart();

  /* ===========================
     Kingdom Auto (F4) - v0.1
     - tab is "kingdoms"
     - uses HUD teleport-to-coords ONLY for initial corner (optional)
     - walks rectangle serpentine via /api/map_move.php
     - colonizes unruled tiles, runs captured action steps, enforces Owner match
     =========================== */
  (function kingdomAutoF4() {
    "use strict";
    try { console.log("[KingdomAuto] IIFE starting..."); } catch {}

    const LS_RUNNING = "oa_kingdom_auto_running_v1";
    const LS_SETTINGS = "oa_kingdom_auto_settings_v3";
    const LS_STATE = "oa_kingdom_auto_state_v3";
    const LS_LOCK = "oa_kingdom_auto_lock_v1";
    const LS_OPTIONS = "oa_kingdom_auto_options_cache_v1";

    // Gold to Drachma conversion
    const GOLD_CAP = 5_000_000_000; // 5 billion gold cap
    const LS_LAST_DRACHMA_CONVERT = "oa_ka_last_drachma_convert_v1";

    // Plane order for multi-plane stepping (must be in scope for plane enforcement)
    const PLANE_ORDER = ["underworld", "katabasis", "aetheria", "aerion", "olympus"];

    // ========================================
    // Kingdom Database - Collects kingdom info as you explore
    // ========================================
    const LS_KINGDOM_DB = "oa_kingdom_database_v1";

    // Read current location from DOM (data-map-coords)
    function getMapCoordsFromDOM() {
      try {
        // Try data-map-coords attribute first (most reliable)
        const coordsEl = document.querySelector('[data-map-coords]');
        if (coordsEl) {
          const coords = coordsEl.getAttribute('data-map-coords') || coordsEl.textContent || '';
          // Format: "Loc: 000,Aet,000" or "000,Aet,000"
          const match = coords.match(/(\d{1,3}),([^,]+),(\d{1,3})/);
          if (match) {
            return {
              x: parseInt(match[1], 10),
              plane: match[2].trim().toLowerCase(),
              y: parseInt(match[3], 10)
            };
          }
        }

        // Fallback to hud-location-coords
        const hudCoordsEl = document.getElementById("hud-location-coords");
        if (hudCoordsEl) {
          const hudText = String(hudCoordsEl.textContent || "").trim();
          const match = hudText.match(/(\d{3}),([^,]+),(\d{3})/);
          if (match) {
            return {
              x: parseInt(match[1], 10),
              plane: match[2].trim().toLowerCase(),
              y: parseInt(match[3], 10)
            };
          }
        }
      } catch (e) {
        console.log('[KingdomAuto] Error reading coords from DOM:', e);
      }
      return null;
    }

    function loadKingdomDB() {
      try {
        const raw = localStorage.getItem(LS_KINGDOM_DB);
        if (!raw) return {};
        return JSON.parse(raw) || {};
      } catch { return {}; }
    }

    function saveKingdomDB(db) {
      try { localStorage.setItem(LS_KINGDOM_DB, JSON.stringify(db)); } catch {}
    }

    function getKingdomKey(plane, x, y) {
      return `${plane}:${x},${y}`;
    }

    // Plane name normalization for Kingdom DB
    const KDB_PLANE_MAP = {
      underworld: "underworld", under: "underworld", uw: "underworld", und: "underworld",
      katabasis: "katabasis", kata: "katabasis", kat: "katabasis",
      aetheria: "aetheria", aeth: "aetheria", aether: "aetheria", aet: "aetheria",
      aerion: "aerion", aer: "aerion",
      olympus: "olympus", oly: "olympus",
      // Legacy/alternate names - map to correct planes
      gaia: "aetheria",  // gaia seems to be aetheria based on user report
    };

    function normalizeKDBPlane(raw) {
      if (!raw) return "";
      const key = String(raw).trim().toLowerCase().replace(/[^a-z]/g, "");
      return KDB_PLANE_MAP[key] || key;
    }

    function saveKingdomToDB(kingdomData, coords, plane) {
      if (!kingdomData || !coords || !plane) return;

      // Normalize plane name
      const normalizedPlane = normalizeKDBPlane(plane);
      if (!normalizedPlane) return;

      // Extract NPCs at current location FIRST (before checking owner)
      const npcs = extractNPCsFromDOM();

      // Skip unowned/unclaimed kingdoms UNLESS they have NPCs
      const ownerName = kingdomData.owner_name || "";
      const isUnowned = !ownerName || ownerName === "Unruled" || ownerName.toLowerCase() === "unclaimed";

      // Check if we already have this kingdom in DB with NPCs
      const db = loadKingdomDB();
      const key = getKingdomKey(normalizedPlane, coords.x, coords.y);
      const existing = db[key];
      const existingHasNPCs = existing && existing.npcs && existing.npcs.length > 0;

      if (isUnowned && (!npcs || npcs.length === 0) && !existingHasNPCs) {
        // Skip: unowned AND no NPCs detected AND no NPCs in existing data
        return;
      }

      const kd = {
        plane: normalizedPlane,
        x: coords.x,
        y: coords.y,
        owner: isUnowned ? "Unruled" : ownerName,
        faith: kingdomData.faith || 0,
        census: kingdomData.census || 0,
        grain: kingdomData.grain || 0,
        ambrosia: kingdomData.ambrosia || 0,
        coffers: kingdomData.coffers || 0,
        footmen: kingdomData.footmen || 0,
        longbowmen: kingdomData.longbowmen || 0,
        ballistae: kingdomData.ballistae || 0,
        trebuchets: kingdomData.trebuchets || 0,
        keep_total: (kingdomData.keep_n_lvl || 0) + (kingdomData.keep_s_lvl || 0) + (kingdomData.keep_e_lvl || 0) + (kingdomData.keep_w_lvl || 0),
        curtain_total: (kingdomData.curtain_n_lvl || 0) + (kingdomData.curtain_s_lvl || 0) + (kingdomData.curtain_e_lvl || 0) + (kingdomData.curtain_w_lvl || 0),
        castle_total: (kingdomData.castle_n_lvl || 0) + (kingdomData.castle_s_lvl || 0) + (kingdomData.castle_e_lvl || 0) + (kingdomData.castle_w_lvl || 0),
        // CRITICAL: Preserve existing NPCs if we didn't detect any new ones
        npcs: npcs.length > 0 ? npcs : (existingHasNPCs ? existing.npcs : undefined),
        updatedAt: Date.now(),
      };

      db[key] = kd;
      saveKingdomDB(db);

      const npcInfo = (kd.npcs && kd.npcs.length > 0) ? ` | NPCs: ${kd.npcs.join(', ')}` : '';
      const unownedTag = isUnowned ? ' (Unruled with NPCs)' : '';
      console.log(`[KingdomDB] Saved: ${key} - Owner: ${kd.owner}${unownedTag}${npcInfo} (raw plane: ${plane})`);

      // Trigger incremental overlay update if map overlay system is loaded
      if (typeof updateSingleMapCell === 'function') {
        updateSingleMapCell(normalizedPlane, coords.x, coords.y, kd);
      }
    }

    // Extract NPCs from the map panel
    function extractNPCsFromDOM() {
      const npcPanel = document.querySelector('[data-map-npcs-panel]');
      if (!npcPanel) {
        console.log('[KingdomDB] [NPC Extract] No NPC panel found ([data-map-npcs-panel])');
        return [];
      }

      const npcList = npcPanel.querySelector('[data-map-npcs-list]');
      if (!npcList) {
        console.log('[KingdomDB] [NPC Extract] No NPC list found ([data-map-npcs-list])');
        return [];
      }

      const npcItems = npcList.querySelectorAll('li');
      console.log('[KingdomDB] [NPC Extract] Found', npcItems.length, 'NPC items in list');

      const npcs = [];

      for (const item of npcItems) {
        // Extract NPC name from the first span with font-semibold
        const nameEl = item.querySelector('.font-semibold');
        if (nameEl) {
          const name = nameEl.textContent.trim();
          if (name) {
            console.log('[KingdomDB] [NPC Extract] Found NPC:', name);
            npcs.push(name);
          }
        }
      }

      return npcs;
    }

    // Save NPCs directly when on map tab (NPC scanning mode)
    function saveNPCsFromMapTab(coords, plane) {
      console.log('[KingdomDB] [NPC Mode] saveNPCsFromMapTab called with:', { coords, plane });

      if (!coords || !plane) {
        console.log('[KingdomDB] [NPC Mode] ERROR: Missing coords or plane', { coords, plane });
        return;
      }

      const normalizedPlane = normalizeKDBPlane(plane);
      console.log('[KingdomDB] [NPC Mode] Normalized plane:', plane, '→', normalizedPlane);

      if (!normalizedPlane) {
        console.log('[KingdomDB] [NPC Mode] ERROR: Plane normalization failed');
        return;
      }

      // Extract NPCs from map panel
      const npcs = extractNPCsFromDOM();

      console.log('[KingdomDB] [NPC Mode] Extracting NPCs at', coords, '- Found:', npcs.length);

      // Only save if NPCs found OR if we want to track empty tiles too
      // For now, only save tiles with NPCs
      if (!npcs || npcs.length === 0) {
        console.log('[KingdomDB] [NPC Mode] No NPCs found, skipping save');
        return;
      }

      const db = loadKingdomDB();
      const key = getKingdomKey(normalizedPlane, coords.x, coords.y);
      console.log('[KingdomDB] [NPC Mode] Generated key:', key);

      // Check if we already have data for this kingdom
      const existing = db[key] || {};

      // Create/update kingdom record with NPCs
      const kd = {
        ...existing,  // Keep any existing data
        plane: normalizedPlane,
        x: coords.x,
        y: coords.y,
        npcs: npcs,
        updatedAt: Date.now(),
      };

      db[key] = kd;
      saveKingdomDB(db);

      console.log(`[KingdomDB] [NPC Mode] Saved: ${key} | NPCs: ${npcs.join(', ')}`);

      // Trigger incremental overlay update if map overlay system is loaded
      if (typeof updateSingleMapCell === 'function') {
        updateSingleMapCell(normalizedPlane, coords.x, coords.y, kd);
      }
    }

    // Fetch and save kingdom data for current position
    let lastFetchedPos = null;
    let fetchInProgress = false;

    async function fetchAndSaveCurrentKingdom(forceRefresh = false) {
      if (fetchInProgress) return;

      const mapView = document.querySelector('[data-map-view]');
      if (!mapView) {
        console.log('[KingdomDB] No map view element found');
        return;
      }

      const plane = mapView.dataset.planeId || "";
      const x = parseInt(mapView.dataset.posX || "0", 10);
      const y = parseInt(mapView.dataset.posY || "0", 10);

      if (!plane || !Number.isFinite(x) || !Number.isFinite(y)) {
        console.log('[KingdomDB] Invalid position data:', { plane, x, y });
        return;
      }

      // Skip if we already fetched this position (unless forced)
      const posKey = `${plane}:${x},${y}`;
      if (!forceRefresh && posKey === lastFetchedPos) {
        console.log('[KingdomDB] Already fetched:', posKey);
        return;
      }

      fetchInProgress = true;
      console.log('[KingdomDB] Fetching kingdom data for:', posKey);
      try {
        const res = await fetch('api/kingdom_status.php', {
          method: 'GET',
          credentials: 'same-origin',
          headers: { 'Accept': 'application/json' },
        });

        if (!res.ok) {
          console.log('[KingdomDB] Fetch failed:', res.status);
          return;
        }
        const data = await res.json();

        if (data?.ok && data?.kingdom) {
          saveKingdomToDB(data.kingdom, { x, y }, plane);
          lastFetchedPos = posKey;
        } else {
          console.log('[KingdomDB] No kingdom data in response:', data);
        }
      } catch (e) {
        console.log('[KingdomDB] Fetch error:', e);
      } finally {
        fetchInProgress = false;
      }
    }

    // Watch for position changes on the map view element
    let kingdomDBObserver = null;
    let kingdomDBWatchInterval = null;

    function startKingdomDBWatcher() {
      if (kingdomDBObserver) return;

      // Try to find and observe the map view element
      function setupObserver() {
        const mapView = document.querySelector('[data-map-view]');
        if (!mapView) return false;

        // Observe attribute changes on the map view
        kingdomDBObserver = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.type === 'attributes' &&
                (mutation.attributeName === 'data-pos-x' ||
                 mutation.attributeName === 'data-pos-y' ||
                 mutation.attributeName === 'data-plane-id')) {
              // Position or plane changed - fetch immediately
              fetchAndSaveCurrentKingdom();
              break;
            }
          }
        });

        kingdomDBObserver.observe(mapView, {
          attributes: true,
          attributeFilter: ['data-pos-x', 'data-pos-y', 'data-plane-id']
        });

        // Also fetch current position immediately
        fetchAndSaveCurrentKingdom();

        console.log('[KingdomDB] Position watcher started');
        return true;
      }

      // Try to set up observer, retry if map not found yet
      if (!setupObserver()) {
        kingdomDBWatchInterval = setInterval(() => {
          const tab = new URL(location.href).searchParams.get("tab") || "";
          if ((tab === "kingdoms" || tab === "map") && setupObserver()) {
            clearInterval(kingdomDBWatchInterval);
            kingdomDBWatchInterval = null;
          }
        }, 500);
      }
    }

    function stopKingdomDBWatcher() {
      if (kingdomDBObserver) {
        kingdomDBObserver.disconnect();
        kingdomDBObserver = null;
      }
      if (kingdomDBWatchInterval) {
        clearInterval(kingdomDBWatchInterval);
        kingdomDBWatchInterval = null;
      }
      lastFetchedPos = null;
    }

    // Start/stop watcher based on tab
    function startKingdomDBPolling() {
      // Check tab periodically and manage watcher
      setInterval(() => {
        const tab = new URL(location.href).searchParams.get("tab") || "";
        if (tab === "kingdoms" || tab === "map") {
          startKingdomDBWatcher();
        } else {
          stopKingdomDBWatcher();
        }
      }, 1000);

      // Initial check
      const tab = new URL(location.href).searchParams.get("tab") || "";
      if (tab === "kingdoms" || tab === "map") {
        startKingdomDBWatcher();
      }

      console.log('[KingdomDB] System initialized');
    }

    // Expose API for viewing database
    // Expose fetchAndSaveCurrentKingdom for external use (e.g., Kingdom Auto)
    window.__kingdomDB_fetchAndSave = fetchAndSaveCurrentKingdom;

    // Reset the lastFetchedPos to allow re-fetching
    window.__kingdomDB_resetLastPos = function() {
      lastFetchedPos = null;
    };

    // Fetch and save kingdom at specific coordinates (for use when map view isn't available)
    async function fetchAndSaveKingdomAt(x, y, plane) {
      if (!plane || !Number.isFinite(x) || !Number.isFinite(y)) {
        console.log('[KingdomDB] Invalid params for saveAt:', { x, y, plane });
        return;
      }

      const normalizedPlane = normalizeKDBPlane(plane);
      console.log('[KingdomDB] Fetching kingdom at:', normalizedPlane, x, y);

      try {
        const res = await fetch('api/kingdom_status.php', {
          method: 'GET',
          credentials: 'same-origin',
          headers: { 'Accept': 'application/json' },
        });

        if (!res.ok) {
          console.log('[KingdomDB] Fetch failed:', res.status);
          return;
        }
        const data = await res.json();

        if (data?.ok && data?.kingdom) {
          saveKingdomToDB(data.kingdom, { x, y }, normalizedPlane);
        } else {
          console.log('[KingdomDB] No kingdom data in response');
        }
      } catch (e) {
        console.log('[KingdomDB] Fetch error:', e);
      }
    }

    try { console.log("[KingdomAuto] About to set window.__kingdomDB..."); } catch {}
    window.__kingdomDB = {
      // Save current position to database (call this from Kingdom Auto)
      // Forces a refresh by resetting lastFetchedPos
      saveCurrentPosition: function() {
        lastFetchedPos = null; // Reset to force fetch
        return fetchAndSaveCurrentKingdom(true);
      },

      // Save kingdom at specific coordinates (use when on kingdoms tab)
      saveAt: function(x, y, plane) {
        return fetchAndSaveKingdomAt(x, y, plane);
      },

      // Save NPCs at current location (use when on map tab)
      saveCurrentNPCs: function() {
        try {
          const locKey = getCurrentLocationKey();
          if (!locKey) {
            console.log('[KingdomDB] No location found');
            return false;
          }

          // Parse location: "005,olympus,035"
          const parts = locKey.split(',');
          if (parts.length !== 3) {
            console.log('[KingdomDB] Invalid location format:', locKey);
            return false;
          }

          const x = parseInt(parts[0], 10);
          const plane = parts[1].trim();
          const y = parseInt(parts[2], 10);

          if (!Number.isFinite(x) || !plane || !Number.isFinite(y)) {
            console.log('[KingdomDB] Invalid coordinates:', {x, plane, y});
            return false;
          }

          console.log('[KingdomDB] Manually saving NPCs at', {x, y, plane});
          saveNPCsFromMapTab({x, y}, plane);
          return true;
        } catch (e) {
          console.log('[KingdomDB] Error saving NPCs:', e);
          return false;
        }
      },

      getAll: () => loadKingdomDB(),

      getByOwner: (ownerName) => {
        const db = loadKingdomDB();
        const results = [];
        const search = ownerName.toLowerCase();
        for (const [key, kd] of Object.entries(db)) {
          if (kd.owner && kd.owner.toLowerCase().includes(search)) {
            results.push({ key, ...kd });
          }
        }
        return results.sort((a, b) => (a.owner || "").localeCompare(b.owner || ""));
      },

      getByPlane: (plane) => {
        const db = loadKingdomDB();
        const results = [];
        const search = plane.toLowerCase();
        for (const [key, kd] of Object.entries(db)) {
          if (kd.plane && kd.plane.toLowerCase().includes(search)) {
            results.push({ key, ...kd });
          }
        }
        return results.sort((a, b) => a.x - b.x || a.y - b.y);
      },

      getByCoords: (plane, x, y) => {
        const db = loadKingdomDB();
        const key = getKingdomKey(plane, x, y);
        return db[key] || null;
      },

      search: (query) => {
        const db = loadKingdomDB();
        const results = [];
        const search = query.toLowerCase();
        for (const [key, kd] of Object.entries(db)) {
          if (
            (kd.owner && kd.owner.toLowerCase().includes(search)) ||
            (kd.plane && kd.plane.toLowerCase().includes(search)) ||
            key.includes(search)
          ) {
            results.push({ key, ...kd });
          }
        }
        return results;
      },

      // Flexible filter function - pass any criteria
      // Example: find({ plane: 'gaia', minGold: 1000, maxArmy: 50, npcName: 'Kelmis' })
      find: (criteria = {}) => {
        const db = loadKingdomDB();
        const results = [];

        for (const [key, kd] of Object.entries(db)) {
          const army = (kd.footmen || 0) + (kd.longbowmen || 0) + (kd.ballistae || 0) + (kd.trebuchets || 0);
          const fortifications = (kd.keep_total || 0) + (kd.curtain_total || 0) + (kd.castle_total || 0);

          // Check all criteria
          if (criteria.plane && kd.plane !== criteria.plane) continue;
          if (criteria.owner && !kd.owner?.toLowerCase().includes(criteria.owner.toLowerCase())) continue;
          if (criteria.notOwner && kd.owner?.toLowerCase().includes(criteria.notOwner.toLowerCase())) continue;
          if (criteria.minGold !== undefined && (kd.coffers || 0) < criteria.minGold) continue;
          if (criteria.maxGold !== undefined && (kd.coffers || 0) > criteria.maxGold) continue;
          if (criteria.minGrain !== undefined && (kd.grain || 0) < criteria.minGrain) continue;
          if (criteria.minAmbrosia !== undefined && (kd.ambrosia || 0) < criteria.minAmbrosia) continue;
          if (criteria.minArmy !== undefined && army < criteria.minArmy) continue;
          if (criteria.maxArmy !== undefined && army > criteria.maxArmy) continue;
          if (criteria.minFaith !== undefined && (kd.faith || 0) < criteria.minFaith) continue;
          if (criteria.maxFaith !== undefined && (kd.faith || 0) > criteria.maxFaith) continue;
          if (criteria.minCensus !== undefined && (kd.census || 0) < criteria.minCensus) continue;
          if (criteria.minFortifications !== undefined && fortifications < criteria.minFortifications) continue;
          if (criteria.maxFortifications !== undefined && fortifications > criteria.maxFortifications) continue;
          if (criteria.unruled === true && kd.owner !== "Unruled") continue;
          if (criteria.unruled === false && kd.owner === "Unruled") continue;

          // NPC filtering
          if (criteria.hasNPC === true && (!kd.npcs || kd.npcs.length === 0)) continue;
          if (criteria.npcName) {
            const searchNPC = criteria.npcName.toLowerCase();
            if (!kd.npcs || !kd.npcs.some(npc => npc.toLowerCase().includes(searchNPC))) continue;
          }

          results.push({
            key,
            ...kd,
            army,
            fortifications,
          });
        }

        // Sort by specified field or default to gold
        const sortBy = criteria.sortBy || 'coffers';
        const sortDir = criteria.sortDir === 'asc' ? 1 : -1;
        results.sort((a, b) => ((b[sortBy] || 0) - (a[sortBy] || 0)) * sortDir);

        // Limit results
        if (criteria.limit) {
          return results.slice(0, criteria.limit);
        }

        return results;
      },

      // Find kingdoms with gold (coffers)
      withGold: (minGold = 1, plane = null) => {
        return window.__kingdomDB.find({
          minGold,
          plane,
          sortBy: 'coffers',
        });
      },

      // Find kingdoms with grain
      withGrain: (minGrain = 1, plane = null) => {
        return window.__kingdomDB.find({
          minGrain,
          plane,
          sortBy: 'grain',
        });
      },

      // Find kingdoms with ambrosia
      withAmbrosia: (minAmbrosia = 1, plane = null) => {
        return window.__kingdomDB.find({
          minAmbrosia,
          plane,
          sortBy: 'ambrosia',
        });
      },

      // Find kingdoms with armies
      withArmy: (minArmy = 1, plane = null) => {
        return window.__kingdomDB.find({
          minArmy,
          plane,
          sortBy: 'army',
        });
      },

      // Find undefended kingdoms (has gold but no/low army)
      undefended: (minGold = 100, maxArmy = 10, plane = null) => {
        return window.__kingdomDB.find({
          minGold,
          maxArmy,
          plane,
          unruled: false, // exclude unruled since they have no loot
          sortBy: 'coffers',
        });
      },

      // Find good raid targets (gold with low defense)
      targets: (plane = null, limit = 20) => {
        const results = window.__kingdomDB.find({
          minGold: 50,
          maxArmy: 100,
          maxFortifications: 50,
          plane,
          unruled: false,
        });

        // Score by gold / (army + fortifications + 1)
        for (const r of results) {
          r.score = (r.coffers || 0) / ((r.army || 0) + (r.fortifications || 0) + 1);
        }
        results.sort((a, b) => b.score - a.score);

        return results.slice(0, limit);
      },

      // Find wealthy kingdoms (most resources)
      wealthy: (plane = null, limit = 20) => {
        const results = window.__kingdomDB.find({ plane });

        // Score by total resources
        for (const r of results) {
          r.wealth = (r.coffers || 0) + (r.grain || 0) * 10 + (r.ambrosia || 0) * 100;
        }
        results.sort((a, b) => b.wealth - a.wealth);

        return results.slice(0, limit);
      },

      // Find well-defended kingdoms
      fortified: (minFortifications = 10, plane = null) => {
        return window.__kingdomDB.find({
          minFortifications,
          plane,
          sortBy: 'fortifications',
        });
      },

      // Find kingdoms with NPCs
      withNPCs: (plane = null) => {
        return window.__kingdomDB.find({
          hasNPC: true,
          plane,
          sortBy: 'coffers',
        });
      },

      // Find kingdoms with specific NPC
      findNPC: (npcName, plane = null) => {
        return window.__kingdomDB.find({
          npcName,
          plane,
          sortBy: 'coffers',
        });
      },

      // Find unowned kingdoms with NPCs (for quest NPCs in unclaimed lands)
      unownedNPCs: (plane = null) => {
        return window.__kingdomDB.find({
          hasNPC: true,
          unruled: true,
          plane,
        });
      },

      // Show detailed info for a kingdom
      inspect: (plane, x, y) => {
        const kd = window.__kingdomDB.getByCoords(plane, x, y);
        if (!kd) {
          console.log(`No data for ${plane}:${x},${y}`);
          return null;
        }

        const army = (kd.footmen || 0) + (kd.longbowmen || 0) + (kd.ballistae || 0) + (kd.trebuchets || 0);
        const forts = (kd.keep_total || 0) + (kd.curtain_total || 0) + (kd.castle_total || 0);

        let npcSection = '';
        if (kd.npcs && kd.npcs.length > 0) {
          npcSection = `
────────────────────────────────────────
  NPCs (${kd.npcs.length}):
    ${kd.npcs.map(npc => `🧙 ${npc}`).join('\n    ')}`;
        }

        console.log(`
═══════════════════════════════════════
  Kingdom: ${kd.owner} @ ${plane} (${x}, ${y})
═══════════════════════════════════════
  Faith: ${kd.faith}%  |  Census: ${kd.census}
════════════════════════════════════════
  RESOURCES:
    Gold (Coffers): ${(kd.coffers || 0).toLocaleString()}
    Grain: ${(kd.grain || 0).toLocaleString()}
    Ambrosia: ${(kd.ambrosia || 0).toLocaleString()}
════════════════════════════════════════
  ARMY (Total: ${army}):
    Footmen: ${kd.footmen || 0}
    Longbowmen: ${kd.longbowmen || 0}
    Ballistae: ${kd.ballistae || 0}
    Trebuchets: ${kd.trebuchets || 0}
════════════════════════════════════════
  FORTIFICATIONS (Total: ${forts}):
    Keep: ${kd.keep_total || 0}
    Curtain: ${kd.curtain_total || 0}
    Castle: ${kd.castle_total || 0}${npcSection}
════════════════════════════════════════
  Last Updated: ${new Date(kd.updatedAt).toLocaleString()}
═══════════════════════════════════════
        `);

        return kd;
      },

      // Pretty print results as a table
      table: (results, fields = ['owner', 'plane', 'x', 'y', 'coffers', 'army', 'fortifications']) => {
        if (!results || results.length === 0) {
          console.log('No results to display');
          return;
        }
        console.table(results.map(r => {
          const row = {};
          for (const f of fields) {
            row[f] = r[f];
          }
          return row;
        }));
      },

      stats: () => {
        const db = loadKingdomDB();
        const entries = Object.values(db);
        const byPlane = {};
        const byOwner = {};
        const goldByOwner = {};
        let totalGold = 0, totalGrain = 0, totalAmbrosia = 0, totalArmy = 0;

        for (const kd of entries) {
          byPlane[kd.plane] = (byPlane[kd.plane] || 0) + 1;
          byOwner[kd.owner] = (byOwner[kd.owner] || 0) + 1;
          goldByOwner[kd.owner] = (goldByOwner[kd.owner] || 0) + (kd.coffers || 0);
          totalGold += kd.coffers || 0;
          totalGrain += kd.grain || 0;
          totalAmbrosia += kd.ambrosia || 0;
          totalArmy += (kd.footmen || 0) + (kd.longbowmen || 0) + (kd.ballistae || 0) + (kd.trebuchets || 0);
        }

        // Top owners by gold
        const topByGold = Object.entries(goldByOwner)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([owner, gold]) => ({ owner, gold, kingdoms: byOwner[owner] }));

        console.log(`
═══════════════════════════════════════════════════════════════
  Kingdom Database Statistics
═══════════════════════════════════════════════════════════════
  Total Kingdoms: ${entries.length}
════════════════════════════════════════════════════════════════
  TOTAL RESOURCES ACROSS ALL KINGDOMS:
    💰 Gold:     ${totalGold.toLocaleString()}
    🌾 Grain:    ${totalGrain.toLocaleString()}
    🍷 Ambrosia: ${totalAmbrosia.toLocaleString()}
    ⚔️  Army:     ${totalArmy.toLocaleString()}
════════════════════════════════════════════════════════════════
  BY PLANE:
${Object.entries(byPlane).map(([p, c]) => `    ${p}: ${c}`).join('\n')}
════════════════════════════════════════════════════════════════
  TOP 10 RICHEST PLAYERS (by gold in coffers):
${topByGold.slice(0, 10).map((p, i) => `    ${i+1}. ${p.owner}: ${p.gold.toLocaleString()} gold (${p.kingdoms} kingdoms)`).join('\n')}
═══════════════════════════════════════════════════════════════
        `);

        return {
          total: entries.length,
          byPlane,
          topOwners: Object.entries(byOwner)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([owner, count]) => ({ owner, count })),
          topByGold,
          resources: {
            totalGold,
            totalGrain,
            totalAmbrosia,
            totalArmy,
          },
        };
      },

      // Get total gold for a specific player
      playerWealth: (playerName) => {
        const db = loadKingdomDB();
        const search = playerName.toLowerCase();
        let totalGold = 0, totalGrain = 0, totalAmbrosia = 0, totalArmy = 0;
        const kingdoms = [];

        for (const [key, kd] of Object.entries(db)) {
          if (kd.owner && kd.owner.toLowerCase().includes(search)) {
            totalGold += kd.coffers || 0;
            totalGrain += kd.grain || 0;
            totalAmbrosia += kd.ambrosia || 0;
            totalArmy += (kd.footmen || 0) + (kd.longbowmen || 0) + (kd.ballistae || 0) + (kd.trebuchets || 0);
            kingdoms.push(kd);
          }
        }

        if (kingdoms.length === 0) {
          console.log(`No kingdoms found for player matching "${playerName}"`);
          return null;
        }

        // Get exact owner name from first match
        const ownerName = kingdoms[0].owner;

        console.log(`
═══════════════════════════════════════════════════════════════
  Player Wealth: ${ownerName}
═══════════════════════════════════════════════════════════════
  Kingdoms: ${kingdoms.length}
════════════════════════════════════════════════════════════════
  TOTAL RESOURCES:
    💰 Gold:     ${totalGold.toLocaleString()}
    🌾 Grain:    ${totalGrain.toLocaleString()}
    🍷 Ambrosia: ${totalAmbrosia.toLocaleString()}
    ⚔️  Army:     ${totalArmy.toLocaleString()}
════════════════════════════════════════════════════════════════
  KINGDOMS BY GOLD:
${kingdoms.sort((a,b) => (b.coffers||0) - (a.coffers||0)).slice(0,10).map(k => `    ${k.plane} (${k.x},${k.y}): ${(k.coffers||0).toLocaleString()} gold`).join('\n')}
═══════════════════════════════════════════════════════════════
        `);

        return {
          owner: ownerName,
          kingdoms: kingdoms.length,
          totalGold,
          totalGrain,
          totalAmbrosia,
          totalArmy,
          kingdomList: kingdoms,
        };
      },

      // Leaderboard - all players ranked by total gold
      leaderboard: (limit = 20) => {
        const db = loadKingdomDB();
        const playerStats = {};

        for (const kd of Object.values(db)) {
          const owner = kd.owner || 'Unknown';
          if (!playerStats[owner]) {
            playerStats[owner] = { gold: 0, grain: 0, ambrosia: 0, army: 0, kingdoms: 0 };
          }
          playerStats[owner].gold += kd.coffers || 0;
          playerStats[owner].grain += kd.grain || 0;
          playerStats[owner].ambrosia += kd.ambrosia || 0;
          playerStats[owner].army += (kd.footmen || 0) + (kd.longbowmen || 0) + (kd.ballistae || 0) + (kd.trebuchets || 0);
          playerStats[owner].kingdoms += 1;
        }

        const sorted = Object.entries(playerStats)
          .map(([owner, stats]) => ({ owner, ...stats }))
          .sort((a, b) => b.gold - a.gold)
          .slice(0, limit);

        console.log(`
═══════════════════════════════════════════════════════════════
  Gold Leaderboard (Top ${limit})
═══════════════════════════════════════════════════════════════`);
        console.table(sorted.map((p, i) => ({
          Rank: i + 1,
          Player: p.owner,
          'Total Gold': p.gold.toLocaleString(),
          Kingdoms: p.kingdoms,
          Army: p.army,
        })));

        return sorted;
      },

      // Print help for all commands
      help: () => {
        console.log(`
═══════════════════════════════════════════════════════════════
  Kingdom Database Commands
═══════════════════════════════════════════════════════════════

  BASIC QUERIES:
    __kingdomDB.getAll()              - Get entire database
    __kingdomDB.getByOwner("name")    - Find by owner name
    __kingdomDB.getByPlane("gaia")    - Get all in a plane
    __kingdomDB.getByCoords("gaia", 10, 20) - Get specific kingdom
    __kingdomDB.search("query")       - Search owners/planes
    __kingdomDB.inspect("gaia", 10, 20) - Detailed kingdom view

  FIND RESOURCES:
    __kingdomDB.withGold(minAmount, plane?)     - Kingdoms with gold
    __kingdomDB.withGrain(minAmount, plane?)    - Kingdoms with grain
    __kingdomDB.withAmbrosia(minAmount, plane?) - Kingdoms with ambrosia
    __kingdomDB.withArmy(minAmount, plane?)     - Kingdoms with armies

  RAID PLANNING:
    __kingdomDB.undefended(minGold?, maxArmy?)  - Gold but no army
    __kingdomDB.targets(plane?, limit?)         - Best raid targets
    __kingdomDB.wealthy(plane?, limit?)         - Richest kingdoms
    __kingdomDB.withNPCs(plane?)                - All kingdoms with NPCs
    __kingdomDB.findNPC(name, plane?)           - Kingdoms with specific NPC
    __kingdomDB.unownedNPCs(plane?)             - Unruled kingdoms with NPCs
    __kingdomDB.fortified(minForts?, plane?)    - Well-defended

  FLEXIBLE FILTER:
    __kingdomDB.find({
      plane: "gaia",          // specific plane
      owner: "name",          // owner contains
      notOwner: "name",       // owner doesn't contain
      minGold: 1000,          // minimum coffers
      maxArmy: 50,            // maximum army size
      maxFortifications: 20,  // max fortification total
      unruled: false,         // exclude unruled
      sortBy: "coffers",      // sort field
      sortDir: "desc",        // sort direction
      limit: 20               // max results
    })

  DISPLAY:
    __kingdomDB.table(results)        - Pretty print as table
    __kingdomDB.stats()               - Database statistics + total gold
    __kingdomDB.playerWealth("name")  - Total resources for a player
    __kingdomDB.leaderboard(20)       - Top players by gold

  DATA MANAGEMENT:
    __kingdomDB.export()              - Download as JSON
    __kingdomDB.import(jsonData)      - Import JSON data
    __kingdomDB.clear()               - Clear database
    __kingdomDB.remove("gaia", x, y)  - Remove single entry

  MAP OVERLAY:
    __kingdomDB.map.show()            - Show territory overlay
    __kingdomDB.map.hide()            - Hide overlay
    __kingdomDB.map.refresh()         - Refresh overlay
    __kingdomDB.map.setColor("owner", "rgba(...)") - Custom color
═══════════════════════════════════════════════════════════════
        `);
      },

      export: () => {
        const db = loadKingdomDB();
        const json = JSON.stringify(db, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kingdom_database_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        console.log('[KingdomDB] Exported', Object.keys(db).length, 'kingdoms');
      },

      import: (jsonData) => {
        try {
          const imported = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
          const db = loadKingdomDB();
          let added = 0;
          let updated = 0;

          for (const [key, kd] of Object.entries(imported)) {
            if (db[key]) {
              // Update if imported is newer
              if (kd.updatedAt > (db[key].updatedAt || 0)) {
                db[key] = kd;
                updated++;
              }
            } else {
              db[key] = kd;
              added++;
            }
          }

          saveKingdomDB(db);
          console.log(`[KingdomDB] Imported: ${added} added, ${updated} updated`);
          return { added, updated };
        } catch (e) {
          console.error('[KingdomDB] Import error:', e);
          return { error: e.message };
        }
      },

      clear: () => {
        if (confirm('Are you sure you want to clear the entire Kingdom Database?')) {
          localStorage.removeItem(LS_KINGDOM_DB);
          console.log('[KingdomDB] Database cleared');
          return true;
        }
        return false;
      },

      remove: (plane, x, y) => {
        const db = loadKingdomDB();
        const key = getKingdomKey(plane, x, y);
        if (db[key]) {
          delete db[key];
          saveKingdomDB(db);
          console.log(`[KingdomDB] Removed: ${key}`);
          return true;
        }
        return false;
      },
    };

    // Start polling on load
    setTimeout(startKingdomDBPolling, 2000);
    // ========================================
    // End Kingdom Database
    // ========================================

    // ========================================
    // Kingdom Map Overlay - Visual territory display
    // ========================================
    const LS_MAP_OVERLAY_ENABLED = "oa_kingdom_map_overlay_enabled_v1";
    const LS_MAP_OVERLAY_COLORS = "oa_kingdom_map_overlay_colors_v1";

    // Generate a consistent color for each player based on their name
    function stringToColor(str) {
      if (!str || str === "Unruled") return "rgba(100, 100, 100, 0.3)";
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      const h = Math.abs(hash) % 360;
      return `hsla(${h}, 70%, 50%, 0.5)`;
    }

    // Load custom colors (player -> color mapping)
    function loadOverlayColors() {
      try {
        const raw = localStorage.getItem(LS_MAP_OVERLAY_COLORS);
        return raw ? JSON.parse(raw) : {};
      } catch { return {}; }
    }

    function saveOverlayColors(colors) {
      try { localStorage.setItem(LS_MAP_OVERLAY_COLORS, JSON.stringify(colors)); } catch {}
    }

    function getPlayerColor(playerName) {
      const customColors = loadOverlayColors();
      if (customColors[playerName]) return customColors[playerName];
      return stringToColor(playerName);
    }

    // Map configurations - grid is always 50x50
    const MAP_GRID_SIZE = 50;

    // Cache reference to grid cells for fast updates
    let cachedGridCells = null;
    let cachedMapContainer = null;
    let cachedPlane = null;

    // Get grid cell by coordinates (fast lookup)
    function getGridCell(x, y) {
      if (!cachedGridCells) return null;
      const index = y * MAP_GRID_SIZE + x;
      return cachedGridCells[index] || null;
    }

    // Update a single cell's overlay (called when database saves new data)
    function updateSingleMapCell(plane, x, y, kd) {
      // Check if overlay is enabled
      const enabled = localStorage.getItem(LS_MAP_OVERLAY_ENABLED) !== 'false';
      if (!enabled) return;

      // Check if we're on the same plane
      const mapContainer = document.querySelector('[data-map-view]');
      if (!mapContainer) return;
      const currentPlane = mapContainer.dataset.planeId || 'gaia';
      if (plane !== currentPlane) return;

      // Use cached cells or get fresh
      if (!cachedGridCells || cachedMapContainer !== mapContainer) {
        const gridOverlay = mapContainer.querySelector('.grid');
        if (!gridOverlay) return;
        cachedGridCells = gridOverlay.querySelectorAll(':scope > div');
        cachedMapContainer = mapContainer;
      }

      const cell = getGridCell(x, y);
      if (!cell) return;

      // Apply styling to this single cell
      const color = getPlayerColor(kd.owner);
      const borderColor = color.replace(/[\d.]+\)$/, '1)');

      cell.style.border = `1px solid ${borderColor}`;
      cell.style.backgroundColor = color;
      cell.style.boxSizing = 'border-box';
      cell.dataset.oaKingdom = kd.owner;
      cell.dataset.oaStyled = '1';
      cell.title = `${kd.owner} (${x},${y})\nFaith: ${kd.faith}% | Census: ${kd.census}\nArmy: ${kd.footmen + kd.longbowmen + kd.ballistae + kd.trebuchets}`;

      // Note: We don't update labels on single cell updates - that would be expensive
      // Labels get updated on full refresh or toggle
    }

    // Full overlay rebuild (only on initial load, toggle, or plane change)
    function injectMapOverlay() {
      const mapContainer = document.querySelector('[data-map-view]');
      if (!mapContainer) return;

      // Find the game's grid overlay
      const gridOverlay = mapContainer.querySelector('.grid');
      if (!gridOverlay) {
        console.log('[KingdomMap] No grid found');
        return;
      }

      // Check if overlay is enabled
      const enabled = localStorage.getItem(LS_MAP_OVERLAY_ENABLED) !== 'false';

      // Get all grid cells (should be 50x50 = 2500 cells)
      const cells = gridOverlay.querySelectorAll(':scope > div');

      // Cache for fast single-cell updates
      cachedGridCells = cells;
      cachedMapContainer = mapContainer;

      // Get current plane
      const plane = mapContainer.dataset.planeId || 'gaia';
      cachedPlane = plane;

      // Build lookup from database
      const lookup = enabled ? buildKingdomLookup(plane) : {};

      // Group by owner for labels
      const ownerGroups = {};
      for (const kd of Object.values(lookup)) {
        if (!ownerGroups[kd.owner]) ownerGroups[kd.owner] = [];
        ownerGroups[kd.owner].push(kd);
      }

      // Iterate through grid cells and apply our overlay
      cells.forEach((cell, index) => {
        // Grid is row-major: index = y * 50 + x
        const x = index % MAP_GRID_SIZE;
        const y = Math.floor(index / MAP_GRID_SIZE);
        const key = `${x},${y}`;
        const kd = lookup[key];

        // Clear our custom styles if overlay disabled or no data
        if (!enabled || !kd) {
          if (cell.dataset.oaStyled) {
            cell.style.border = '';
            cell.style.backgroundColor = '';
            cell.removeAttribute('data-oa-styled');
            cell.removeAttribute('data-oa-kingdom');
            cell.removeAttribute('title');
          }
          return;
        }

        // We have data for this cell - apply our overlay
        const color = getPlayerColor(kd.owner);
        const borderColor = color.replace(/[\d.]+\)$/, '1)');

        cell.style.border = `1px solid ${borderColor}`;
        cell.style.backgroundColor = color;
        cell.style.boxSizing = 'border-box';
        cell.dataset.oaKingdom = kd.owner;
        cell.dataset.oaStyled = '1';
        cell.title = `${kd.owner} (${x},${y})\nFaith: ${kd.faith}% | Census: ${kd.census}\nArmy: ${kd.footmen + kd.longbowmen + kd.ballistae + kd.trebuchets}`;
      });

      // Remove existing labels
      mapContainer.querySelectorAll('.oa-kingdom-label').forEach(el => el.remove());

      if (!enabled) return;

      // Add owner name labels centered on their territories
      for (const [owner, kingdoms] of Object.entries(ownerGroups)) {
        if (owner === "Unruled" || kingdoms.length < 1) continue;

        // Calculate center of owner's territory
        let avgX = 0, avgY = 0;
        for (const k of kingdoms) {
          avgX += k.x;
          avgY += k.y;
        }
        avgX /= kingdoms.length;
        avgY /= kingdoms.length;

        // Convert to percentage position (grid is 50x50 covering 100% of image)
        const leftPct = ((avgX + 0.5) / MAP_GRID_SIZE) * 100;
        const topPct = ((avgY + 0.5) / MAP_GRID_SIZE) * 100;

        const label = document.createElement('div');
        label.className = 'oa-kingdom-label';
        label.style.cssText = `
          position: absolute;
          left: ${leftPct}%;
          top: ${topPct}%;
          transform: translate(-50%, -50%);
          color: white;
          font-size: ${Math.min(14, 8 + Math.floor(kingdoms.length / 2))}px;
          font-weight: bold;
          text-shadow:
            -1px -1px 2px rgba(0,0,0,0.9),
            1px -1px 2px rgba(0,0,0,0.9),
            -1px 1px 2px rgba(0,0,0,0.9),
            1px 1px 2px rgba(0,0,0,0.9),
            0 0 8px rgba(0,0,0,0.8);
          white-space: nowrap;
          pointer-events: none;
          z-index: 15;
        `;
        label.textContent = `${owner} (${kingdoms.length})`;
        mapContainer.appendChild(label);
      }

      console.log(`[KingdomMap] Overlay applied for ${plane}: ${Object.keys(lookup).length} kingdoms`);
    }

    // Build a lookup map from database for quick access
    function buildKingdomLookup(plane) {
      const db = loadKingdomDB();
      const lookup = {};
      for (const [key, kd] of Object.entries(db)) {
        if (kd.plane === plane) {
          lookup[`${kd.x},${kd.y}`] = kd;
        }
      }
      return lookup;
    }

    // Toggle button for the overlay
    function createOverlayToggle() {
      const existing = document.getElementById('oa-kingdom-overlay-toggle');
      if (existing) return;

      const btn = document.createElement('button');
      btn.id = 'oa-kingdom-overlay-toggle';
      btn.textContent = '🗺️ Territory';
      btn.title = 'Toggle Kingdom Territory Overlay';

      const enabled = localStorage.getItem(LS_MAP_OVERLAY_ENABLED) !== 'false';
      btn.style.cssText = `
        position: fixed;
        bottom: 70px;
        right: 10px;
        z-index: 9999;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        background: ${enabled ? 'rgba(34, 197, 94, 0.9)' : 'rgba(100, 100, 100, 0.8)'};
        color: white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        transition: background 0.2s;
      `;

      btn.addEventListener('click', () => {
        const wasEnabled = localStorage.getItem(LS_MAP_OVERLAY_ENABLED) !== 'false';
        const newEnabled = !wasEnabled;
        localStorage.setItem(LS_MAP_OVERLAY_ENABLED, String(newEnabled));
        btn.style.background = newEnabled ? 'rgba(34, 197, 94, 0.9)' : 'rgba(100, 100, 100, 0.8)';
        injectMapOverlay();
        console.log(`[KingdomMap] Overlay ${newEnabled ? 'enabled' : 'disabled'}`);
      });

      document.body.appendChild(btn);
    }

    // Debounced overlay injection - prevents rapid rebuilds
    let mapOverlayDebounceTimer = null;
    let lastMapPlane = null;

    function debouncedMapOverlay() {
      if (mapOverlayDebounceTimer) clearTimeout(mapOverlayDebounceTimer);
      mapOverlayDebounceTimer = setTimeout(() => {
        const mapContainer = document.querySelector('[data-map-view]');
        if (!mapContainer) return;

        const currentPlane = mapContainer.dataset.planeId || '';

        // Only do full rebuild if plane changed or first load
        if (currentPlane !== lastMapPlane) {
          lastMapPlane = currentPlane;
          injectMapOverlay();
        }
      }, 300);
    }

    // Watch for map tab - uses debouncing to avoid excessive rebuilds
    function watchForMapTab() {
      let wasOnMapTab = false;

      const observer = new MutationObserver(() => {
        const tab = new URL(location.href).searchParams.get("tab") || "";
        const isOnMapTab = (tab === "map" || tab === "kingdoms");

        if (isOnMapTab && !wasOnMapTab) {
          // Just entered map tab - create toggle and do initial overlay
          wasOnMapTab = true;
          setTimeout(() => {
            createOverlayToggle();
            injectMapOverlay();
          }, 500);
        } else if (isOnMapTab) {
          // Already on map tab - only rebuild if plane changed (debounced)
          debouncedMapOverlay();
        } else {
          wasOnMapTab = false;
          // Clear cache when leaving map tab
          cachedGridCells = null;
          cachedMapContainer = null;
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      // Initial check
      const tab = new URL(location.href).searchParams.get("tab") || "";
      if (tab === "map" || tab === "kingdoms") {
        wasOnMapTab = true;
        setTimeout(() => {
          createOverlayToggle();
          injectMapOverlay();
        }, 1000);
      }
    }

    // Extend the API with map functions
    window.__kingdomDB.map = {
      show: () => {
        localStorage.setItem(LS_MAP_OVERLAY_ENABLED, 'true');
        injectMapOverlay();
      },
      hide: () => {
        localStorage.setItem(LS_MAP_OVERLAY_ENABLED, 'false');
        injectMapOverlay();
      },
      refresh: () => injectMapOverlay(),
      setColor: (playerName, color) => {
        const colors = loadOverlayColors();
        colors[playerName] = color;
        saveOverlayColors(colors);
        injectMapOverlay();
        console.log(`[KingdomMap] Set ${playerName} color to ${color}`);
      },
      clearColors: () => {
        localStorage.removeItem(LS_MAP_OVERLAY_COLORS);
        injectMapOverlay();
        console.log('[KingdomMap] Custom colors cleared');
      },
      getColors: () => loadOverlayColors(),
    };

    // Start watching for map tab
    setTimeout(watchForMapTab, 2000);
    // ========================================
    // End Kingdom Map Overlay
    // ========================================

    // ========================================
    // Kingdom Scout UI - Search & Visualize
    // ========================================
    const LS_SCOUT_PANEL_POS = "oa_kingdom_scout_pos_v1";
    const LS_SCOUT_PANEL_OPEN = "oa_kingdom_scout_open_v1";

    let scoutPanel = null;
    let scoutResultsHighlighted = [];

    function loadScoutPos() {
      try {
        const raw = localStorage.getItem(LS_SCOUT_PANEL_POS);
        if (!raw) return { x: 100, y: 100 };
        return JSON.parse(raw);
      } catch { return { x: 100, y: 100 }; }
    }

    function saveScoutPos(pos) {
      try { localStorage.setItem(LS_SCOUT_PANEL_POS, JSON.stringify(pos)); } catch {}
    }

    // Highlight search results on the map grid
    function highlightSearchResults(results) {
      // Clear previous highlights
      clearSearchHighlights();

      if (!results || results.length === 0) return;

      const mapContainer = document.querySelector('[data-map-view]');
      if (!mapContainer) return;

      const gridOverlay = mapContainer.querySelector('.grid');
      if (!gridOverlay) return;

      const cells = gridOverlay.querySelectorAll(':scope > div');
      const currentPlane = mapContainer.dataset.planeId || '';

      // Build a set of matching coordinates for this plane
      const matchSet = new Set();
      for (const r of results) {
        if (r.plane === currentPlane) {
          matchSet.add(`${r.x},${r.y}`);
        }
      }

      // Apply highlight to matching cells
      cells.forEach((cell, index) => {
        const x = index % MAP_GRID_SIZE;
        const y = Math.floor(index / MAP_GRID_SIZE);
        const key = `${x},${y}`;

        if (matchSet.has(key)) {
          cell.dataset.oaScoutHighlight = '1';
          cell.style.outline = '3px solid #ff0';
          cell.style.outlineOffset = '-2px';
          cell.style.zIndex = '100';
          scoutResultsHighlighted.push(cell);
        }
      });

      console.log(`[KingdomScout] Highlighted ${scoutResultsHighlighted.length} cells`);
    }

    function clearSearchHighlights() {
      for (const cell of scoutResultsHighlighted) {
        cell.style.outline = '';
        cell.style.outlineOffset = '';
        cell.style.zIndex = '';
        cell.removeAttribute('data-oa-scout-highlight');
      }
      scoutResultsHighlighted = [];
    }

    function createScoutPanel() {
      if (scoutPanel) return;

      const pos = loadScoutPos();

      scoutPanel = document.createElement('div');
      scoutPanel.id = 'oa-kingdom-scout-panel';
      scoutPanel.innerHTML = `
        <div class="scout-header" style="
          display:flex;justify-content:space-between;align-items:center;
          padding:6px 10px;
          background:rgba(212,175,55,0.15);
          border-bottom:1px solid rgba(212,175,55,0.3);
          cursor:move;
          border-radius:8px 8px 0 0;
        ">
          <span style="font-weight:700;color:#d4af37;font-size:12px;">\u{1F3F0} Kingdom Scout</span>
          <div>
            <button class="scout-minimize" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#ccc;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:10px;">\u2500</button>
            <button class="scout-close" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#ccc;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:10px;">\u2715</button>
          </div>
        </div>
        <div class="scout-body" style="padding:8px 10px;overflow-y:auto;max-height:calc(85vh - 40px);">
          <div class="scout-filters" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
            <div>
              <label style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Plane</label>
              <select id="scout-plane" style="width:100%;padding:4px 6px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);color:#e5e5e5;border-radius:4px;font-size:11px;">
                <option value="">All Planes</option>
                <option value="underworld">Underworld</option>
                <option value="katabasis">Katabasis</option>
                <option value="aetheria">Aetheria</option>
                <option value="aerion">Aerion</option>
                <option value="olympus">Olympus</option>
              </select>
            </div>
            <div>
              <label style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Owner</label>
              <input id="scout-owner" type="text" placeholder="Any owner" style="width:100%;padding:4px 6px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);color:#e5e5e5;border-radius:4px;box-sizing:border-box;font-size:11px;">
            </div>
            <div>
              <label style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Min Gold</label>
              <input id="scout-min-gold" type="number" placeholder="0" style="width:100%;padding:4px 6px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);color:#e5e5e5;border-radius:4px;box-sizing:border-box;font-size:11px;">
            </div>
            <div>
              <label style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Max Army</label>
              <input id="scout-max-army" type="number" placeholder="Any" style="width:100%;padding:4px 6px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);color:#e5e5e5;border-radius:4px;box-sizing:border-box;font-size:11px;">
            </div>
            <div>
              <label style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Min Grain</label>
              <input id="scout-min-grain" type="number" placeholder="0" style="width:100%;padding:4px 6px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);color:#e5e5e5;border-radius:4px;box-sizing:border-box;font-size:11px;">
            </div>
            <div>
              <label style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Max Forts</label>
              <input id="scout-max-forts" type="number" placeholder="Any" style="width:100%;padding:4px 6px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);color:#e5e5e5;border-radius:4px;box-sizing:border-box;font-size:11px;">
            </div>
            <div>
              <label style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">🧙 NPC Name</label>
              <input id="scout-npc" type="text" placeholder="Any NPC" style="width:100%;padding:4px 6px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);color:#e5e5e5;border-radius:4px;box-sizing:border-box;font-size:11px;">
            </div>
          </div>

          <div style="display:flex;gap:6px;margin-bottom:8px;align-items:center;">
            <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#94a3b8;cursor:pointer;">
              <input id="scout-has-npc" type="checkbox" style="cursor:pointer;">
              Has ANY NPC
            </label>
          </div>

          <div style="display:flex;gap:4px;margin-bottom:8px;">
            <button id="scout-search-btn" style="flex:1;padding:5px;background:rgba(212,175,55,0.25);color:#d4af37;border:1px solid rgba(212,175,55,0.4);border-radius:4px;cursor:pointer;font-weight:bold;font-size:11px;">Search</button>
            <button id="scout-targets-btn" style="flex:1;padding:5px;background:rgba(245,158,11,0.2);color:#f59e0b;border:1px solid rgba(245,158,11,0.35);border-radius:4px;cursor:pointer;font-weight:bold;font-size:11px;">\u{1F3AF} Targets</button>
            <button id="scout-clear-btn" style="padding:5px 10px;background:rgba(255,255,255,0.08);color:#94a3b8;border:1px solid rgba(255,255,255,0.15);border-radius:4px;cursor:pointer;font-size:11px;">Clear</button>
          </div>

          <div style="display:flex;gap:4px;margin-bottom:8px;">
            <button id="scout-stats-btn" style="flex:1;padding:4px;background:rgba(99,102,241,0.15);color:#818cf8;border:1px solid rgba(99,102,241,0.3);border-radius:4px;cursor:pointer;font-size:10px;">\u{1F4CA} Stats</button>
            <button id="scout-leaderboard-btn" style="flex:1;padding:4px;background:rgba(139,92,246,0.15);color:#a78bfa;border:1px solid rgba(139,92,246,0.3);border-radius:4px;cursor:pointer;font-size:10px;">\u{1F3C6} Leaderboard</button>
          </div>

          <div id="scout-stats-panel" style="display:none;background:rgba(0,0,0,0.3);border-radius:5px;padding:8px;margin-bottom:8px;border:1px solid rgba(255,255,255,0.06);">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
              <div>
                <div style="color:#94a3b8;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;">Total Gold</div>
                <div id="scout-total-gold" style="color:#d4af37;font-size:13px;font-weight:bold;">0</div>
              </div>
              <div>
                <div style="color:#94a3b8;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;">Kingdoms</div>
                <div id="scout-total-kingdoms" style="color:#4ade80;font-size:13px;font-weight:bold;">0</div>
              </div>
              <div>
                <div style="color:#94a3b8;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;">Total Grain</div>
                <div id="scout-total-grain" style="color:#84cc16;font-size:13px;font-weight:bold;">0</div>
              </div>
              <div>
                <div style="color:#94a3b8;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;">Total Army</div>
                <div id="scout-total-army" style="color:#f87171;font-size:13px;font-weight:bold;">0</div>
              </div>
            </div>
          </div>

          <div id="scout-results-info" style="font-size:10px;color:#94a3b8;margin-bottom:6px;">
            Database: <span id="scout-db-count">0</span> kingdoms | Results: <span id="scout-result-count">0</span> | Gold: <span id="scout-result-gold">0</span>
          </div>

          <div id="scout-results" style="
            max-height: 280px;
            overflow-y: auto;
            background: rgba(0,0,0,0.3);
            border-radius: 5px;
            border: 1px solid rgba(255,255,255,0.06);
          ">
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
              <thead style="position:sticky;top:0;background:rgba(15,15,25,0.98);">
                <tr style="color:#94a3b8;">
                  <th style="padding:5px 6px;text-align:left;cursor:pointer;border-bottom:1px solid rgba(212,175,55,0.2);font-size:10px;text-transform:uppercase;" data-sort="owner">Owner</th>
                  <th style="padding:5px 6px;text-align:right;cursor:pointer;border-bottom:1px solid rgba(212,175,55,0.2);font-size:10px;text-transform:uppercase;" data-sort="coffers">Gold</th>
                  <th style="padding:5px 6px;text-align:right;cursor:pointer;border-bottom:1px solid rgba(212,175,55,0.2);font-size:10px;text-transform:uppercase;" data-sort="army">Army</th>
                  <th style="padding:5px 6px;text-align:center;border-bottom:1px solid rgba(212,175,55,0.2);font-size:10px;text-transform:uppercase;">Loc</th>
                </tr>
              </thead>
              <tbody id="scout-results-body">
              </tbody>
            </table>
          </div>
        </div>
      `;

      scoutPanel.style.cssText = `
        position: fixed;
        left: ${pos.x}px;
        top: ${pos.y}px;
        width: 340px;
        background: rgba(15,15,25,0.97);
        border: 1px solid rgba(212,175,55,0.4);
        border-radius: 8px;
        z-index: 99996;
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 11px;
        color: #e5e5e5;
        box-shadow: 0 4px 24px rgba(0,0,0,0.6);
        display: none;
        overflow: hidden;
      `;

      document.body.appendChild(scoutPanel);

      // Make draggable
      const header = scoutPanel.querySelector('.scout-header');
      let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;

      header.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDragging = true;
        dragOffsetX = e.clientX - scoutPanel.offsetLeft;
        dragOffsetY = e.clientY - scoutPanel.offsetTop;
      });

      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const x = Math.max(0, e.clientX - dragOffsetX);
        const y = Math.max(0, e.clientY - dragOffsetY);
        scoutPanel.style.left = x + 'px';
        scoutPanel.style.top = y + 'px';
      });

      document.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          saveScoutPos({ x: scoutPanel.offsetLeft, y: scoutPanel.offsetTop });
        }
      });

      // Close button
      scoutPanel.querySelector('.scout-close').addEventListener('click', () => {
        scoutPanel.style.display = 'none';
        localStorage.setItem(LS_SCOUT_PANEL_OPEN, 'false');
        clearSearchHighlights();
      });

      // Minimize button
      const body = scoutPanel.querySelector('.scout-body');
      scoutPanel.querySelector('.scout-minimize').addEventListener('click', () => {
        body.style.display = body.style.display === 'none' ? 'block' : 'none';
      });

      // Search button
      scoutPanel.querySelector('#scout-search-btn').addEventListener('click', runScoutSearch);

      // Targets button - quick search for raid targets
      scoutPanel.querySelector('#scout-targets-btn').addEventListener('click', () => {
        document.getElementById('scout-min-gold').value = '100';
        document.getElementById('scout-max-army').value = '50';
        document.getElementById('scout-max-forts').value = '30';
        document.getElementById('scout-owner').value = '';
        runScoutSearch();
      });

      // Clear button
      scoutPanel.querySelector('#scout-clear-btn').addEventListener('click', () => {
        document.getElementById('scout-plane').value = '';
        document.getElementById('scout-owner').value = '';
        document.getElementById('scout-min-gold').value = '';
        document.getElementById('scout-max-army').value = '';
        document.getElementById('scout-min-grain').value = '';
        document.getElementById('scout-max-forts').value = '';
        document.getElementById('scout-results-body').innerHTML = '';
        document.getElementById('scout-result-count').textContent = '0';
        document.getElementById('scout-result-gold').textContent = '0';
        clearSearchHighlights();
      });

      // Stats button - toggle stats panel
      scoutPanel.querySelector('#scout-stats-btn').addEventListener('click', () => {
        const statsPanel = document.getElementById('scout-stats-panel');
        if (statsPanel.style.display === 'none') {
          updateScoutStats();
          statsPanel.style.display = 'block';
        } else {
          statsPanel.style.display = 'none';
        }
      });

      // Leaderboard button - show top players by gold
      scoutPanel.querySelector('#scout-leaderboard-btn').addEventListener('click', showScoutLeaderboard);

      // Sortable headers
      let currentSort = { field: 'coffers', dir: -1 };
      scoutPanel.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
          const field = th.dataset.sort;
          if (currentSort.field === field) {
            currentSort.dir *= -1;
          } else {
            currentSort.field = field;
            currentSort.dir = -1;
          }
          runScoutSearch();
        });
      });

      // Update DB count
      updateScoutDBCount();
    }

    function updateScoutDBCount() {
      const countEl = document.getElementById('scout-db-count');
      if (countEl) {
        const db = loadKingdomDB();
        countEl.textContent = Object.keys(db).length;
      }
    }

    function updateScoutStats() {
      const db = loadKingdomDB();
      let totalGold = 0, totalGrain = 0, totalArmy = 0;
      let count = 0;

      for (const kd of Object.values(db)) {
        totalGold += kd.coffers || 0;
        totalGrain += kd.grain || 0;
        totalArmy += (kd.footmen || 0) + (kd.longbowmen || 0) + (kd.ballistae || 0) + (kd.trebuchets || 0);
        count++;
      }

      document.getElementById('scout-total-gold').textContent = totalGold.toLocaleString();
      document.getElementById('scout-total-kingdoms').textContent = count.toLocaleString();
      document.getElementById('scout-total-grain').textContent = totalGrain.toLocaleString();
      document.getElementById('scout-total-army').textContent = totalArmy.toLocaleString();
    }

    function showScoutLeaderboard() {
      const db = loadKingdomDB();
      const playerStats = {};

      for (const kd of Object.values(db)) {
        const owner = kd.owner || 'Unknown';
        if (!playerStats[owner]) {
          playerStats[owner] = { gold: 0, kingdoms: 0, army: 0 };
        }
        playerStats[owner].gold += kd.coffers || 0;
        playerStats[owner].army += (kd.footmen || 0) + (kd.longbowmen || 0) + (kd.ballistae || 0) + (kd.trebuchets || 0);
        playerStats[owner].kingdoms += 1;
      }

      const sorted = Object.entries(playerStats)
        .map(([owner, stats]) => ({ owner, ...stats }))
        .sort((a, b) => b.gold - a.gold)
        .slice(0, 50);

      // Show in results table
      const tbody = document.getElementById('scout-results-body');
      tbody.innerHTML = '';

      document.getElementById('scout-result-count').textContent = sorted.length + ' players';
      document.getElementById('scout-result-gold').textContent = sorted.reduce((s, p) => s + p.gold, 0).toLocaleString();

      for (const [i, p] of sorted.entries()) {
        const tr = document.createElement('tr');
        tr.style.cssText = 'border-bottom:1px solid #222;cursor:pointer;';

        tr.innerHTML = `
          <td style="padding:6px;color:#4ade80;"><span style="color:#888;font-size:10px;">#${i+1}</span> ${escapeHtml(p.owner)}</td>
          <td style="padding:6px;text-align:right;color:#fbbf24;font-weight:bold;">${p.gold.toLocaleString()}</td>
          <td style="padding:6px;text-align:right;color:#f87171;">${p.army.toLocaleString()}</td>
          <td style="padding:6px;text-align:center;color:#888;font-size:10px;">${p.kingdoms} kds</td>
        `;

        // Hover highlight
        tr.addEventListener('mouseenter', () => tr.style.background = '#1a1a2e');
        tr.addEventListener('mouseleave', () => tr.style.background = '');

        // Click to filter by this player
        tr.addEventListener('click', () => {
          document.getElementById('scout-owner').value = p.owner;
          runScoutSearch();
        });

        tbody.appendChild(tr);
      }

      clearSearchHighlights();
    }

    function runScoutSearch() {
      const plane = document.getElementById('scout-plane').value;
      const owner = document.getElementById('scout-owner').value;
      const minGold = parseInt(document.getElementById('scout-min-gold').value) || 0;
      const maxArmy = document.getElementById('scout-max-army').value ? parseInt(document.getElementById('scout-max-army').value) : undefined;
      const minGrain = parseInt(document.getElementById('scout-min-grain').value) || 0;
      const maxForts = document.getElementById('scout-max-forts').value ? parseInt(document.getElementById('scout-max-forts').value) : undefined;
      const npcName = document.getElementById('scout-npc').value.trim();
      const hasNPC = document.getElementById('scout-has-npc').checked;

      const criteria = {
        sortBy: 'coffers',
      };

      if (plane) criteria.plane = plane;
      if (owner) criteria.owner = owner;
      if (minGold > 0) criteria.minGold = minGold;
      if (maxArmy !== undefined) criteria.maxArmy = maxArmy;
      if (minGrain > 0) criteria.minGrain = minGrain;
      if (maxForts !== undefined) criteria.maxFortifications = maxForts;
      if (npcName) criteria.npcName = npcName;
      if (hasNPC) criteria.hasNPC = true;

      // Exclude unruled by default if searching for gold
      if (minGold > 0) criteria.unruled = false;

      const results = window.__kingdomDB.find(criteria);

      // Calculate total gold in results
      const totalResultGold = results.reduce((sum, r) => sum + (r.coffers || 0), 0);

      // Update result count and gold
      document.getElementById('scout-result-count').textContent = results.length;
      document.getElementById('scout-result-gold').textContent = totalResultGold.toLocaleString();
      updateScoutDBCount();

      // Render results
      const tbody = document.getElementById('scout-results-body');
      tbody.innerHTML = '';

      for (const r of results.slice(0, 100)) { // Limit to 100 for performance
        const tr = document.createElement('tr');
        tr.style.cssText = 'border-bottom:1px solid #222;cursor:pointer;';
        tr.dataset.plane = r.plane;
        tr.dataset.x = r.x;
        tr.dataset.y = r.y;

        const npcIcon = (r.npcs && r.npcs.length > 0) ? ' 🧙' : '';

        tr.innerHTML = `
          <td style="padding:6px;color:#4ade80;">${escapeHtml(r.owner || 'Unruled')}${npcIcon}</td>
          <td style="padding:6px;text-align:right;color:#fbbf24;">${(r.coffers || 0).toLocaleString()}</td>
          <td style="padding:6px;text-align:right;color:#f87171;">${r.army || 0}</td>
          <td style="padding:6px;text-align:center;color:#888;font-size:10px;">${r.plane?.slice(0,3)}:${r.x},${r.y}</td>
        `;

        // Hover highlight
        tr.addEventListener('mouseenter', () => {
          tr.style.background = '#1a1a2e';
        });
        tr.addEventListener('mouseleave', () => {
          tr.style.background = '';
        });

        // Click to show details
        tr.addEventListener('click', () => {
          showKingdomDetail(r);
        });

        tbody.appendChild(tr);
      }

      // Highlight on map
      highlightSearchResults(results);
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    function showKingdomDetail(kd) {
      const army = (kd.footmen || 0) + (kd.longbowmen || 0) + (kd.ballistae || 0) + (kd.trebuchets || 0);
      const forts = (kd.keep_total || 0) + (kd.curtain_total || 0) + (kd.castle_total || 0);

      // Create a detail popup
      let popup = document.getElementById('oa-scout-detail-popup');
      if (!popup) {
        popup = document.createElement('div');
        popup.id = 'oa-scout-detail-popup';
        popup.style.cssText = `
          position: fixed;
          background: #1a1a2e;
          border: 1px solid #4ade80;
          border-radius: 8px;
          padding: 16px;
          z-index: 10001;
          min-width: 280px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6);
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 13px;
          color: #e0e0e0;
        `;
        document.body.appendChild(popup);
      }

      popup.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="font-weight:bold;color:#4ade80;font-size:15px;">${escapeHtml(kd.owner || 'Unruled')}</span>
          <button onclick="this.parentElement.parentElement.style.display='none'" style="background:none;border:none;color:#888;cursor:pointer;font-size:18px;">×</button>
        </div>
        <div style="color:#888;font-size:11px;margin-bottom:12px;">
          ${kd.plane} (${kd.x}, ${kd.y}) • Faith: ${kd.faith}% • Census: ${kd.census}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div style="background:#0d0d15;padding:8px;border-radius:4px;">
            <div style="color:#888;font-size:10px;">GOLD</div>
            <div style="color:#fbbf24;font-size:16px;font-weight:bold;">${(kd.coffers || 0).toLocaleString()}</div>
          </div>
          <div style="background:#0d0d15;padding:8px;border-radius:4px;">
            <div style="color:#888;font-size:10px;">GRAIN</div>
            <div style="color:#84cc16;font-size:16px;font-weight:bold;">${(kd.grain || 0).toLocaleString()}</div>
          </div>
          <div style="background:#0d0d15;padding:8px;border-radius:4px;">
            <div style="color:#888;font-size:10px;">AMBROSIA</div>
            <div style="color:#c084fc;font-size:16px;font-weight:bold;">${(kd.ambrosia || 0).toLocaleString()}</div>
          </div>
          <div style="background:#0d0d15;padding:8px;border-radius:4px;">
            <div style="color:#888;font-size:10px;">ARMY</div>
            <div style="color:#f87171;font-size:16px;font-weight:bold;">${army}</div>
          </div>
        </div>
        <div style="margin-top:12px;background:#0d0d15;padding:8px;border-radius:4px;">
          <div style="color:#888;font-size:10px;margin-bottom:4px;">ARMY BREAKDOWN</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;">
            <div>Footmen: <span style="color:#f87171;">${kd.footmen || 0}</span></div>
            <div>Longbowmen: <span style="color:#f87171;">${kd.longbowmen || 0}</span></div>
            <div>Ballistae: <span style="color:#f87171;">${kd.ballistae || 0}</span></div>
            <div>Trebuchets: <span style="color:#f87171;">${kd.trebuchets || 0}</span></div>
          </div>
        </div>
        <div style="margin-top:8px;background:#0d0d15;padding:8px;border-radius:4px;">
          <div style="color:#888;font-size:10px;margin-bottom:4px;">FORTIFICATIONS (Total: ${forts})</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;font-size:11px;">
            <div>Keep: <span style="color:#60a5fa;">${kd.keep_total || 0}</span></div>
            <div>Curtain: <span style="color:#60a5fa;">${kd.curtain_total || 0}</span></div>
            <div>Castle: <span style="color:#60a5fa;">${kd.castle_total || 0}</span></div>
          </div>
        </div>
        ${kd.npcs && kd.npcs.length > 0 ? `
        <div style="margin-top:8px;background:#0d0d15;padding:8px;border-radius:4px;border:1px solid rgba(139,92,246,0.3);">
          <div style="color:#a78bfa;font-size:10px;margin-bottom:4px;">🧙 NPCs AT THIS LOCATION</div>
          <div style="font-size:11px;color:#c4b5fd;">
            ${kd.npcs.map(npc => `<div style="margin:2px 0;">• ${escapeHtml(npc)}</div>`).join('')}
          </div>
        </div>
        ` : ''}
        <div style="margin-top:12px;color:#666;font-size:10px;">
          Updated: ${new Date(kd.updatedAt).toLocaleString()}
        </div>
      `;

      // Position near the scout panel
      const panelRect = scoutPanel.getBoundingClientRect();
      popup.style.left = (panelRect.right + 10) + 'px';
      popup.style.top = panelRect.top + 'px';
      popup.style.display = 'block';
    }

    // Toggle button for the scout panel
    function createScoutToggle() {
      const existing = document.getElementById('oa-kingdom-scout-toggle');
      if (existing) return;

      const btn = document.createElement('button');
      btn.id = 'oa-kingdom-scout-toggle';
      btn.textContent = 'u{1F3F0}';
      btn.title = 'Kingdom Scout';
      btn.style.cssText = `
        position:fixed; bottom:90px; right:10px; width:34px; height:34px;
        background:linear-gradient(135deg,rgba(30,58,95,0.9),rgba(45,27,105,0.9));
        border:1px solid rgba(212,175,55,0.4); border-radius:50%; z-index:99998;
        cursor:pointer; font-size:15px; display:flex; align-items:center; justify-content:center;
        box-shadow:0 2px 8px rgba(0,0,0,0.3);
      `;

      btn.addEventListener('click', () => {
        createScoutPanel();
        const isOpen = scoutPanel.style.display !== 'none';
        scoutPanel.style.display = isOpen ? 'none' : 'block';
        localStorage.setItem(LS_SCOUT_PANEL_OPEN, String(!isOpen));
        if (!isOpen) {
          updateScoutDBCount();
        } else {
          clearSearchHighlights();
        }
      });

      document.body.appendChild(btn);

      // Restore panel state
      if (localStorage.getItem(LS_SCOUT_PANEL_OPEN) === 'true') {
        createScoutPanel();
        scoutPanel.style.display = 'block';
        updateScoutDBCount();
      }
    }

    // Initialize scout toggle when on kingdoms tab
    function initScoutUI() {
      const checkTab = () => {
        const tab = new URL(location.href).searchParams.get("tab") || "";
        if (tab === "map" || tab === "kingdoms") {
          createScoutToggle();
        }
      };

      // Check periodically
      setInterval(checkTab, 2000);
      setTimeout(checkTab, 1000);
    }

    // Extend the API with scout functions
    window.__kingdomDB.scout = {
      open: () => {
        createScoutPanel();
        scoutPanel.style.display = 'block';
        updateScoutDBCount();
      },
      close: () => {
        if (scoutPanel) {
          scoutPanel.style.display = 'none';
          clearSearchHighlights();
        }
      },
      search: runScoutSearch,
      highlight: highlightSearchResults,
      clearHighlights: clearSearchHighlights,
    };

    // Start scout UI
    setTimeout(initScoutUI, 2000);
    // ========================================
    // End Kingdom Scout UI
    // ========================================

    const LS_WIDGET_POS = "oa_kingdom_auto_widget_pos_v1";
    function loadWidgetPos() {
      try {
        const raw = localStorage.getItem(LS_WIDGET_POS);
        if (!raw) return { x: 14, y: 160 };
        const p = JSON.parse(raw);
        const x = Number(p?.x);
        const y = Number(p?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 14, y: 160 };
        return { x: Math.max(0, x), y: Math.max(0, y) };
      } catch {
        return { x: 14, y: 160 };
      }
    }
    function saveWidgetPos(pos) {
      try { localStorage.setItem(LS_WIDGET_POS, JSON.stringify(pos)); } catch {}
    }

    const PHASE = {
      IDLE: "IDLE",
      NAV_MAP: "NAV_MAP",
      TP_START: "TP_START",
      WAIT_TP: "WAIT_TP",
      NAV_KINGDOMS: "NAV_KINGDOMS",
      RUN_TILE: "RUN_TILE",
      NAV_BACK_MAP: "NAV_BACK_MAP",
      MOVE_NEXT: "MOVE_NEXT",
      WAIT_MOVE: "WAIT_MOVE",
      DONE: "DONE",
    };

    function nowMs() { return Date.now(); }
    function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

    function clampInt(v, min, max) {
      const n = parseInt(String(v), 10);
      if (!Number.isFinite(n)) return min;
      return Math.max(min, Math.min(max, n));
    }

    function jget(k, fb) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : fb; } catch { return fb; } }
    function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

    // Check current gold and convert to drachma if at cap (5 billion)
    const LS_GOLD_CONVERT_PHASE = "oa_ka_gold_convert_phase_v1";

    async function checkAndConvertGoldToDrachma() {
      try {
        // Throttle: don't check more than once per 3 seconds
        const lastCheck = Number(localStorage.getItem(LS_LAST_DRACHMA_CONVERT) || 0);
        if (Date.now() - lastCheck < 3000) return false;
        localStorage.setItem(LS_LAST_DRACHMA_CONVERT, String(Date.now()));

        // Check if we're in the middle of a conversion process
        const convertPhase = jget(LS_GOLD_CONVERT_PHASE, null);

        // Fetch current gold from hud_state API
        const res = await fetch('/api/hud_state.php', { method: 'GET', credentials: 'same-origin' });
        if (!res.ok) return false;
        const data = await res.json();
        if (!data?.success || typeof data.char?.gold !== 'number') return false;

        const currentGold = data.char.gold;

        // If gold is below cap and we were converting, clear the phase
        if (currentGold < GOLD_CAP) {
          if (convertPhase) {
            dbg("gold conversion complete", { gold: currentGold });
            localStorage.removeItem(LS_GOLD_CONVERT_PHASE);
          }
          return false;
        }

        dbg("gold at cap", { gold: currentGold, cap: GOLD_CAP, phase: convertPhase });

        // Phase 1: Navigate to market tab
        const currentTab = getTab();
        if (currentTab !== "market") {
          dbg("gold convert: navigating to market tab");
          jset(LS_GOLD_CONVERT_PHASE, { phase: "nav_market", startedAt: Date.now() });
          gotoTab("market");
          return true; // Will continue on next tick
        }

        // Phase 2: Click the Conversion tab button
        const conversionTabBtn = document.querySelector('button[data-market-tab="convert"]');
        const convertForm = document.querySelector('form input[name="action"][value="convert_gold_to_drachma"]')?.closest('form');

        if (!convertForm && conversionTabBtn) {
          dbg("gold convert: clicking Conversion tab");
          jset(LS_GOLD_CONVERT_PHASE, { phase: "click_convert_tab", startedAt: Date.now() });
          conversionTabBtn.click();
          return true; // Will continue on next tick
        }

        // Phase 3: Submit the convert form
        if (!convertForm) {
          // Form still not visible - maybe page is loading
          const phase = jget(LS_GOLD_CONVERT_PHASE, null);
          if (phase && Date.now() - (phase.startedAt || 0) > 10000) {
            // Timeout after 10 seconds
            dbg("gold convert: timeout waiting for form");
            localStorage.removeItem(LS_GOLD_CONVERT_PHASE);
          }
          return false;
        }

        // Update CSRF token
        const csrf = getCsrfToken();
        const csrfInp = convertForm.querySelector('input[name="csrf_token"]');
        if (csrfInp && csrf) csrfInp.value = csrf;

        // Find and click submit button
        const btn = convertForm.querySelector('button[type="submit"], button');
        if (btn) {
          dbg("converting gold to drachma", { gold: currentGold });
          notify("Kingdom Auto: Converting 5B gold → 1 Drachma");
          btn.click();
          jset(LS_GOLD_CONVERT_PHASE, { phase: "submitted", startedAt: Date.now() });
          return true;
        }

        return false;
      } catch (e) {
        dbg("drachma convert error", String(e?.message || e));
        return false;
      }
    }

    function getOptionsCache() {
      const c = jget(LS_OPTIONS, null);
      if (!c || typeof c !== "object") return { modes: [], units: [], directions: [], structures: [] };
      return {
        modes: Array.isArray(c.modes) ? c.modes : [],
        units: Array.isArray(c.units) ? c.units : [],
        directions: Array.isArray(c.directions) ? c.directions : [],
        structures: Array.isArray(c.structures) ? c.structures : [],
      };
    }
    function setOptionsCache(c) { jset(LS_OPTIONS, c); }

    function mapSelectOptions(sel) {
      if (!sel) return [];
      return Array.from(sel.options || []).map((o) => ({ value: String(o.value), label: String((o.textContent || o.value)).trim() }));
    }

    function findModeSelect(panel) {
  if (!panel) return null;
  return (
    panel.querySelector('select[name="kingdom_action_mode"]') ||
    panel.querySelector('select[name="action_mode"]') ||
    panel.querySelector('select[id*="action_mode"]') ||
    panel.querySelector('select[name*="action_mode"]') ||
    Array.from(panel.querySelectorAll("select")).find((s) => {
      const opts = Array.from(s.options || []).map((o) => String(o.value || "").toLowerCase());
      return opts.includes("build_army") || opts.includes("fortify") || opts.includes("buy_grain") || opts.includes("deposit") || opts.includes("withdraw");
    }) ||
    null
  );
}

function pickModeValue(modes, want) {
  const w = String(want || "").toLowerCase();
  if (!Array.isArray(modes)) return "";
  const exact = modes.find((o) => String(o.value || "").toLowerCase() === w);
  if (exact) return exact.value;
  const byLabel = modes.find((o) => String(o.label || "").toLowerCase().includes(w));
  if (byLabel) return byLabel.value;
  // loose matches
  if (w === "build_army") {
    const m = modes.find((o) => /build/.test(String(o.label || "").toLowerCase()) || /build/.test(String(o.value || "").toLowerCase()));
    if (m) return m.value;
  }
  if (w === "fortify") {
    const m = modes.find((o) => /fortif/.test(String(o.label || "").toLowerCase()) || /fortif/.test(String(o.value || "").toLowerCase()));
    if (m) return m.value;
  }
  return "";
}

const FULL_FALLBACK_MODES = [
  { value: "build_army", label: "Build Army" },
  { value: "fortify", label: "Fortify" },
  { value: "buy_grain", label: "Buy Grain" },
  { value: "deposit", label: "Deposit" },
  { value: "withdraw", label: "Withdraw" },
  { value: "levy", label: "Levy" },
  { value: "ambrosia", label: "Ambrosia" },
  { value: "compensate", label: "Compensate" },
];

    async function refreshOptionsCache() {
  const panel0 = findKingdomPanel();
  if (!panel0) return false;

  const modeSel0 = findModeSelect(panel0);
  if (!modeSel0) return false;

  const modes = mapSelectOptions(modeSel0);
  const cache = {
    modes: modes,
    units: [],
    directions: [],
    structures: [],
  };

  const origMode = String(modeSel0.value || "");
  const buildMode = pickModeValue(modes, "build_army") || origMode;
  const fortifyMode = pickModeValue(modes, "fortify") || origMode;

  async function switchMode(val) {
    const panel = findKingdomPanel();
    const modeSel = findModeSelect(panel);
    if (!panel || !modeSel) return null;
    setSelectValue(modeSel, val);
    try { modeSel.dispatchEvent(new Event("change", { bubbles: true })); } catch {}
    await sleep(160);
    return findKingdomPanel();
  }

  // Harvest build_army unit dropdown (if available)
  try {
    const pBuild = await switchMode(buildMode);
    const unitSel = pBuild?.querySelector('[data-kingdom-field="unit"] select') || pBuild?.querySelector('select[name*="unit"]') || null;
    cache.units = mapSelectOptions(unitSel);
  } catch (e) { dbg("options build harvest error", String(e?.message || e)); }

  // Harvest fortify direction/structure dropdowns (if available)
  try {
    const pFort = await switchMode(fortifyMode);
    const dirSel = pFort?.querySelector('[data-kingdom-field="direction"] select') || pFort?.querySelector('select[name*="direction"]') || null;
    const structSel = pFort?.querySelector('[data-kingdom-field="structure"] select') || pFort?.querySelector('select[name*="structure"]') || null;
    cache.directions = mapSelectOptions(dirSel);
    cache.structures = mapSelectOptions(structSel);
  } catch (e) { dbg("options fortify harvest error", String(e?.message || e)); }

  // Restore original mode
  try { await switchMode(origMode); } catch {}

  // If we couldn't read modes (selector mismatch), provide a safer fallback list
  if (!cache.modes || !cache.modes.length) cache.modes = FULL_FALLBACK_MODES;

  setOptionsCache(cache);
  dbg("options refreshed", cache);
  return true;
}

    const FALLBACK_MODES = [
      { value: "build_army", label: "Build Army" },
      { value: "fortify", label: "Fortify" },
    ];

    function isRunning() { try { return localStorage.getItem(LS_RUNNING) === "1"; } catch { return false; } }
    function setRunning(v) { try { v ? localStorage.setItem(LS_RUNNING, "1") : localStorage.removeItem(LS_RUNNING); } catch {} }

    function notify(msg) {
      try {
        if (window.gameNotifications && typeof window.gameNotifications.show === "function") return window.gameNotifications.show(String(msg));
      } catch {}
      console.log("[KingdomAuto]", msg);
    }

    const __dbgBuf = [];
    function dbg(message, data) {
      const settings = loadSettings?.() || null;
      if (!settings || !settings.debug) return;
      const line = `[KingdomAuto][DBG] ${message}`;
      try {
        if (data !== undefined) console.log(line, data);
        else console.log(line);
      } catch {}
      try {
        __dbgBuf.push({ t: Date.now(), message, data });
        if (__dbgBuf.length > 250) __dbgBuf.splice(0, __dbgBuf.length - 250);
        window.__oaKingdomAutoDebug = { buffer: __dbgBuf };
      } catch {}
    }

    function getTab() {
      try { return new URL(location.href).searchParams.get("tab") || ""; } catch { return ""; }
    }

    function gotoTab(tab) {
      try {
        const u = new URL(location.href);
        u.pathname = "/game.php";
        u.searchParams.set("tab", tab);
        location.href = u.toString();
      } catch {
        location.href = "/game.php?tab=" + encodeURIComponent(tab);
      }
    }

    function getCsrfToken() {
      const meta = document.querySelector('meta[name="csrf-token"], meta[name="csrf_token"], meta[name="csrf"]');
      const metaVal = meta?.getAttribute?.("content");
      if (metaVal && String(metaVal).length > 5) return String(metaVal);

      const inp = document.querySelector('input[name="csrf_token"], input[name="csrf"]');
      const inpVal = inp && "value" in inp ? String(inp.value || "") : "";
      if (inpVal && inpVal.length > 5) return inpVal;

      const w = window;
      const direct = w.csrf_token || w.csrfToken || w.__csrf || (w.App && (w.App.csrf_token || w.App.csrfToken));
      if (direct && String(direct).length > 5) return String(direct);

      return "";
    }

    function normalizeProfileName(n) {
  const s = String(n || "").trim();
  // Keep names short-ish and safe for storage keys/UI
  return s ? s.slice(0, 40) : "";
}

function defaultProfileSettings() {
  return {
    bottomLeft: { x: 0, y: 49 },
    topRight: { x: 49, y: 0 },
    teleportToStart: true,
    plane: "", // optional: one of Underworld/Katabasis/Aetheria/Aerion/Olympus

    stopOnOwnerMismatch: true,
    onlyUnruled: true,
    detectNPCs: false, // walk on map tab to detect NPCs (slower)
    dryRun: false,
    steps: [], // captured from kingdom action form
  };
}

function normalizeProfile(p) {
  const d = defaultProfileSettings();
  const o = (p && typeof p === "object") ? p : {};
  return {
    ...d,
    ...o,
    bottomLeft: { x: clampInt(o?.bottomLeft?.x ?? d.bottomLeft.x, 0, 49), y: clampInt(o?.bottomLeft?.y ?? d.bottomLeft.y, 0, 49) },
    topRight: { x: clampInt(o?.topRight?.x ?? d.topRight.x, 0, 49), y: clampInt(o?.topRight?.y ?? d.topRight.y, 0, 49) },
    teleportToStart: !!(o?.teleportToStart ?? d.teleportToStart),
        plane: normalizePlaneName(o?.plane ?? d.plane),
    stopOnOwnerMismatch: !!(o?.stopOnOwnerMismatch ?? d.stopOnOwnerMismatch),
    onlyUnruled: !!(o?.onlyUnruled ?? d.onlyUnruled),
    detectNPCs: !!(o?.detectNPCs ?? d.detectNPCs),
    dryRun: !!(o?.dryRun ?? d.dryRun),
    steps: Array.isArray(o?.steps) ? o.steps : [],
  };
}

function normalizeStore(raw) {
  const dProf = defaultProfileSettings();
  const r = (raw && typeof raw === "object") ? raw : {};
  const owner = typeof r.owner === "string" ? r.owner : "";
  const debug = !!r.debug;

  let profiles = (r.profiles && typeof r.profiles === "object") ? r.profiles : {};
  const fixed = {};
  for (const k of Object.keys(profiles)) fixed[k] = normalizeProfile(profiles[k]);
  profiles = fixed;

  // Always ensure Default exists and is valid
  if (!profiles.Default) profiles.Default = normalizeProfile(dProf);

  let activeProfile = normalizeProfileName(r.activeProfile) || "Default";
  if (!profiles[activeProfile]) activeProfile = "Default";

  return { owner, debug, activeProfile, profiles };
}

function getStore() { return normalizeStore(jget(LS_SETTINGS, null)); }
function putStore(store) { jset(LS_SETTINGS, store); }

function listProfileNames(store) {
  try {
    const names = Object.keys(store?.profiles || {});
    names.sort((a, b) => String(a).localeCompare(String(b)));
    return names;
  } catch { return ["Default"]; }
}

function defaultSettings() {
  const p = defaultProfileSettings();
  return {
    owner: "",
    debug: false,
    activeProfile: "Default",
    profiles: { Default: p },
    ...p, // flattened for backward-compat with existing code paths
  };
}

    function loadSettings() {
  const d = defaultSettings();
  const store = getStore();
  const active = store.activeProfile || "Default";
  const p = store.profiles?.[active] ? store.profiles[active] : normalizeProfile(null);

  console.log('[KingdomAuto] loadSettings: active profile =', active);
  console.log('[KingdomAuto] loadSettings: profile from store, steps count =', (p?.steps || []).length);

  const out = {
    ...d,
    owner: String(store.owner || ""),
    debug: !!store.debug,
    activeProfile: active,
    profiles: store.profiles || { Default: normalizeProfile(null) },
    ...normalizeProfile(p),
  };

  console.log('[KingdomAuto] loadSettings: final output, steps count =', (out?.steps || []).length);
  console.log('[KingdomAuto] loadSettings: detectNPCs =', out?.detectNPCs);

  // NOTE: Removed auto-fallback to oa_ka_last_plane_v1 / oa_pve_plane_lock_v1
  // This was causing conflicts when AutoCombat and Kingdom Auto are set to different planes.
  // Now the profile's plane setting must be explicitly set in the UI.

  return out;
}

    function saveSettings(s) {
  const store = getStore();
  const name = normalizeProfileName(s?.activeProfile || store.activeProfile) || "Default";
  if (!store.profiles) store.profiles = {};
  if (!store.profiles.Default) store.profiles.Default = normalizeProfile(null);

  store.owner = String(s?.owner || "").trim();
  store.debug = !!s?.debug;
  store.activeProfile = store.profiles[name] ? name : (name === "Default" ? "Default" : (store.profiles.Default ? "Default" : name));

  // Persist the currently-active profile fields
  const active = store.activeProfile || "Default";

  // Preserve plane unless caller explicitly supplies it (prevents accidental clearing during runtime saves)
  const __existingPlane = (() => {
    try {
      const activeTmp = store.activeProfile || "Default";
      const cur = store.profiles?.[activeTmp]?.plane;
      return normalizePlaneName(cur || "");
    } catch (e) { return ""; }
  })();
  // Only allow clearing plane when Settings modal is open (prevents accidental wipe from runtime saves).
  const __modalPlaneEl = (() => { try { return document.querySelector("#oa-ka-plane"); } catch { return null; } })();
  const __modalRoot = (() => { try { return document.getElementById("oa-ka-modal"); } catch { return null; } })();
  const __isModalOpen = !!(__modalRoot && __modalRoot.style && __modalRoot.style.display !== "none");
  const __allowPlaneClear = !!(__isModalOpen && __modalPlaneEl);
  const __hasPlaneProp = !!(s && Object.prototype.hasOwnProperty.call(s, "plane"));
let __planeVal = __existingPlane;
  if (__allowPlaneClear) {
    __planeVal = normalizePlaneName(String(__modalPlaneEl.value || ""));
  } else if (__hasPlaneProp) {
    const __cand = normalizePlaneName((s.plane ?? ""));
    if (__cand) __planeVal = __cand; // preserve if blank
  }
const prof = normalizeProfile({
    bottomLeft: s?.bottomLeft,
    topRight: s?.topRight,
    teleportToStart: s?.teleportToStart,
        plane: __planeVal,
    stopOnOwnerMismatch: s?.stopOnOwnerMismatch,
    onlyUnruled: s?.onlyUnruled,
    detectNPCs: s?.detectNPCs,
    dryRun: s?.dryRun,
    steps: s?.steps,
  });
  console.log('[KingdomAuto] saveSettings: saving to profile', active, 'steps count:', (s?.steps || []).length);
  console.log('[KingdomAuto] saveSettings: detectNPCs =', s?.detectNPCs);
  console.log('[KingdomAuto] saveSettings: normalized profile steps:', (prof?.steps || []).length);
  console.log('[KingdomAuto] saveSettings: normalized profile detectNPCs:', prof?.detectNPCs);
  store.profiles[active] = prof;

  putStore(store);
  console.log('[KingdomAuto] saveSettings: saved to localStorage');

    try { if (typeof __oaWritePlaneDebugSnapshot === 'function') __oaWritePlaneDebugSnapshot('saveSettings'); } catch {}
}

function setActiveProfile(name) {
  const n = normalizeProfileName(name);
  if (!n) return false;
  const store = getStore();
  if (!store.profiles || !store.profiles[n]) return false;
  store.activeProfile = n;
  putStore(store);
  return true;
}

function createProfile(name, cloneCurrent) {
  const n = normalizeProfileName(name);
  if (!n) return { ok: false, reason: "Name required." };
  const store = getStore();
  if (!store.profiles) store.profiles = {};
  if (store.profiles[n]) return { ok: false, reason: "Profile exists." };

  const base = (cloneCurrent && store.profiles?.[store.activeProfile]) ? store.profiles[store.activeProfile] : null;
  store.profiles[n] = normalizeProfile(base);
  store.activeProfile = n;
  putStore(store);
  return { ok: true, name: n };
}

function renameProfile(oldName, newName) {
  const o = normalizeProfileName(oldName);
  const n = normalizeProfileName(newName);
  if (!o || !n) return { ok: false, reason: "Invalid name." };
  if (o === "Default") return { ok: false, reason: "Default cannot be renamed." };
  const store = getStore();
  if (!store.profiles || !store.profiles[o]) return { ok: false, reason: "Profile not found." };
  if (store.profiles[n]) return { ok: false, reason: "New name already exists." };

  store.profiles[n] = normalizeProfile(store.profiles[o]);
  delete store.profiles[o];
  if (store.activeProfile === o) store.activeProfile = n;
  putStore(store);
  return { ok: true, name: n };
}

function deleteProfile(name) {
  const n = normalizeProfileName(name);
  if (!n) return { ok: false, reason: "Invalid name." };
  if (n === "Default") return { ok: false, reason: "Default cannot be deleted." };

  const store = getStore();
  if (!store.profiles || !store.profiles[n]) return { ok: false, reason: "Profile not found." };

  delete store.profiles[n];

  const names = listProfileNames(store);
  if (!names.length) {
    // Restore Default
    store.profiles = { Default: normalizeProfile(null) };
    store.activeProfile = "Default";
  } else if (!store.profiles[store.activeProfile]) {
    store.activeProfile = names[0] || "Default";
  }
  putStore(store);
  return { ok: true };
}

    function computeRect(s) {
      const minX = Math.min(s.bottomLeft.x, s.topRight.x);
      const maxX = Math.max(s.bottomLeft.x, s.topRight.x);
      const minY = Math.min(s.bottomLeft.y, s.topRight.y); // top
      const maxY = Math.max(s.bottomLeft.y, s.topRight.y); // bottom
      return { minX, maxX, minY, maxY };
    }

    function initialState(s) {
      const b = computeRect(s);
      const startTile = { x: b.minX, y: b.maxY }; // bottom-left of rectangle
      const wantsTeleport = !!s.teleportToStart;
      return {
        running: true,
        phase: wantsTeleport ? PHASE.NAV_MAP : PHASE.NAV_KINGDOMS,
        bounds: b,
        cur: startTile,
        rowDir: 1,
        stepIdx: 0,
        didTeleport: !wantsTeleport,
        tpTarget: startTile,
        tpStartedAt: 0,
        justColonized: false,
        lastActAt: 0,
      };
    }

    function loadState() { return jget(LS_STATE, null); }
    function saveState(st) { jset(LS_STATE, st); }

    function acquireLock() {
      try {
        const raw = localStorage.getItem(LS_LOCK);
        const now = nowMs();
        if (raw) {
          const o = JSON.parse(raw);
          if (o && typeof o.t === "number" && now - o.t < 900) return false;
        }
        localStorage.setItem(LS_LOCK, JSON.stringify({ t: now }));
        return true;
      } catch {
        return true;
      }
    }

    function releaseLock() { try { localStorage.removeItem(LS_LOCK); } catch {} }

    function stop(reason) {
      setRunning(false);
      const st = loadState() || {};
      st.running = false;
      st.phase = PHASE.IDLE;
      saveState(st);
      renderWidget();
      if (reason) notify(reason);

      // Clear any pending plane enforcement state
      try { localStorage.removeItem("oa_ka_pending_start_plane_v1"); } catch {}
      try { localStorage.removeItem("oa_ka_plane_fix_laststep_ms_v2"); } catch {}
      try { localStorage.removeItem("oa_pve_plane_lock_laststep_ms_v2"); } catch {}
      try { localStorage.removeItem("oa_ka_plane_step_count_v1"); } catch {}

      // If this run was triggered by the scheduler, restore automation state
      try {
        const schedKey = "oa_sched_hourly_kingdom_walk_active_v1";
        const sched = jget(schedKey, null);
        if (sched && sched.runId) {
          const snap = (sched.snapshot || {});
          const prevProfile = String(sched.prevProfile || "").trim();
          if (prevProfile) { try { setActiveProfile(prevProfile); } catch {} }
          try { localStorage.setItem("oa_auto_combat_enabled_v1", JSON.stringify(!!snap.autoCombatEnabled)); } catch {}
          try { localStorage.setItem("oa_last_beast_auto_v1", JSON.stringify(!!snap.autoBeastEnabled)); } catch {}
          try { localStorage.setItem("oa_game_autocombat_wanted_v1", JSON.stringify(!!snap.gameAutoWanted)); } catch {}
          try { localStorage.setItem("oa_game_autocombat_force_v1", JSON.stringify(!!snap.gameAutoForce)); } catch {}
          try { localStorage.removeItem(schedKey); } catch {}
        }
      } catch {}

      // Always return to combat tab when Kingdom Auto stops (so AutoCombat can resume)
      setTimeout(() => {
        try {
          console.log("[KingdomAuto] Returning to combat tab...");
          gotoTab("combat");
        } catch (e) {
          console.log("[KingdomAuto] gotoTab failed:", e);
        }
      }, 800);
    }

    function normalizeOwner(s) { return String(s || "").trim().toLowerCase(); }

    function findKingdomPanel() { return document.querySelector("[data-kingdom-panel]"); }
    function ownerFromPanel(panel) {
      const el = panel.querySelector('[data-kingdom-stat="owner_name"]');
      return el ? String(el.textContent || "").trim() : "";
    }
    function isUnruled(panel) {
      if (!panel) return false;

      // Strong signals (safe): colonize action present or explicit message.
      if (panel.querySelector('input[name="action"][value="colonize_kingdom"]')) return true;

      const text = String(panel.textContent || "");
      if (/no ruling kingdom/i.test(text)) return true;

      // "Unclaimed" tiles often show an Establish button, but owned tiles should never trigger this path.
      if (/\bunclaimed\b/i.test(text)) {
        const establishBtn = Array.from(panel.querySelectorAll("button")).some((b) =>
          String(b.textContent || "").toLowerCase().includes("establish a kingdom")
        );
        if (establishBtn) return true;
      }

      return false;
    }

    function setSelectValue(selectEl, desired) {
      if (!selectEl) return false;
      const want = String(desired ?? "");
      if (!want) return true;
      for (const opt of Array.from(selectEl.options || [])) {
        if (String(opt.value) === want) { selectEl.value = opt.value; return true; }
      }
      const wantLower = want.toLowerCase();
      for (const opt of Array.from(selectEl.options || [])) {
        if (String(opt.value).toLowerCase() === wantLower || String(opt.textContent || "").trim().toLowerCase() === wantLower) {
          selectEl.value = opt.value;
          return true;
        }
      }
      return false;
    }

    function applySemanticStep(panel, step) {
      const modeSel = findModeSelect(panel);
      if (!modeSel) return { ok: false, reason: "mode_missing" };

      const desiredMode = String(step.mode || "").trim();
      if (desiredMode && String(modeSel.value) !== desiredMode) {
        setSelectValue(modeSel, desiredMode);
        try { modeSel.dispatchEvent(new Event("change", { bubbles: true })); } catch {}
        return { ok: false, reason: "waiting_dynamic_fields" };
      }

      const modeLower = String(modeSel.value || "").toLowerCase();
      const unitSel = panel.querySelector('[data-kingdom-field="unit"] select');
      const dirSel = panel.querySelector('[data-kingdom-field="direction"] select');
      const structSel = panel.querySelector('[data-kingdom-field="structure"] select');
      const amtInp = panel.querySelector('[data-kingdom-field="amount"] input[name="kingdom_amount"]');

      if (modeLower === "build_army") {
        if (!unitSel) return { ok: false, reason: "waiting_unit_select" };
        setSelectValue(unitSel, step.unit);
      } else if (modeLower === "fortify") {
        if (!dirSel || !structSel) return { ok: false, reason: "waiting_fortify_fields" };
        setSelectValue(dirSel, step.direction);
        setSelectValue(structSel, step.structure);
      }

      if (amtInp && step.amount !== undefined) amtInp.value = String(step.amount);

      const form = modeSel.closest("form");
      if (!form) return { ok: false, reason: "form_missing" };
      return { ok: true, form };
    }

function submitColonize(panel, settings, st) {
      try {
        dbg("submitColonize: enter", {
          hasPanel: !!panel,
          tab: getTab(),
          cur: st?.cur,
          justColonized: st?.justColonized,
          hasColonizeInput: !!panel?.querySelector('input[name="action"][value="colonize_kingdom"]'),
        });
      } catch {}

      const form = panel?.querySelector('form input[name="action"][value="colonize_kingdom"]')?.closest("form");
      if (!form) {
        try { dbg("submitColonize: form missing", { snippet: String(panel?.innerHTML || "").slice(0, 500) }); } catch {}
        return false;
      }

      const csrf = getCsrfToken();
      const csrfInp = form.querySelector('input[name="csrf_token"], input[name="csrf"]');
      if (csrfInp && csrf) csrfInp.value = csrf;

      const btnCandidates = Array.from(form.querySelectorAll('button, button[type="submit"], input[type="submit"]'));
      const btn =
        btnCandidates.find((b) => (b.tagName || "").toLowerCase() === "button" &&
          ((b.textContent || "").trim().toLowerCase().includes("establish a kingdom") ||
           (b.textContent || "").trim().toLowerCase().includes("establish"))) ||
        btnCandidates.find((b) => (b.tagName || "").toLowerCase() === "button") ||
        btnCandidates.find((b) => (b.tagName || "").toLowerCase() === "input") ||
        null;

      try {
        dbg("submitColonize: candidates", btnCandidates.map((b) => ({
          tag: (b.tagName || "").toLowerCase(),
          text: String(b.textContent || b.value || "").trim().slice(0, 80),
          cls: b.className || "",
          type: b.getAttribute ? b.getAttribute("type") : "",
        })));
        dbg("submitColonize: chosen", btn ? {
          tag: (btn.tagName || "").toLowerCase(),
          text: String(btn.textContent || btn.value || "").trim().slice(0, 120),
          cls: btn.className || "",
        } : null);
      } catch {}

      if (settings.dryRun) {
        notify("[DryRun] Would establish kingdom on this tile.");
        return true;
      }

      try {
        if (btn && typeof btn.click === "function") {
          btn.click();
          dbg("submitColonize: clicked button", true);
          return true;
        }
        form.requestSubmit ? form.requestSubmit() : form.submit();
        dbg("submitColonize: submitted form", true);
        return true;
      } catch (e) {
        try { dbg("submitColonize: error", String(e?.message || e)); } catch {}
        return false;
      }
    }

    function findActionForm(panel) {
      const sel = panel.querySelector('select[name="kingdom_action_mode"]');
      if (!sel) return null;
      const form = sel.closest("form");
      return form || null;
    }

    function captureStepFromCurrentTile() {
      const panel = findKingdomPanel();
      if (!panel) return { ok: false, error: "No kingdom panel found. Open tab=kingdoms first." };
      const form = findActionForm(panel);
      if (!form) return { ok: false, error: "No action form found on this tile." };

      const fields = {};
      const els = Array.from(form.querySelectorAll("input[name], select[name], textarea[name]"));
      for (const el of els) {
        const name = String(el.getAttribute("name") || "");
        if (!name) continue;
        const tag = String(el.tagName || "").toLowerCase();
        const type = String(el.getAttribute("type") || "").toLowerCase();
        if (tag === "input" && (type === "checkbox" || type === "radio")) fields[name] = el.checked ? "1" : "0";
        else fields[name] = "value" in el ? String(el.value ?? "") : "";
      }
      const label = (fields.kingdom_action_mode ? ("Mode: " + fields.kingdom_action_mode) : "Captured Step");
      return { ok: true, step: { label, fields } };
    }

    function applyFieldsToForm(form, fields) {
      for (const k of Object.keys(fields || {})) {
        const v = fields[k];
        let nodes = [];
        try { nodes = Array.from(form.querySelectorAll('[name="' + CSS.escape(k) + '"]')); } catch { nodes = Array.from(form.querySelectorAll('[name="' + k.replace(/"/g, '\\"') + '"]')); }
        if (!nodes.length) continue;
        for (const el of nodes) {
          const tag = String(el.tagName || "").toLowerCase();
          const type = String(el.getAttribute("type") || "").toLowerCase();
          if (tag === "input" && (type === "checkbox" || type === "radio")) el.checked = (v === "1" || v === "true" || v === "on");
          else if ("value" in el) {
            el.value = String(v);
            try { el.dispatchEvent(new Event("change", { bubbles: true })); } catch {}
          }
        }
      }
      const csrf = getCsrfToken();
      const csrfEl = form.querySelector('input[name="csrf_token"], input[name="csrf"]');
      if (csrfEl && csrf) csrfEl.value = csrf;
    }

    function submitForm(form, settings, label) {
      if (settings.dryRun) {
        notify("[DryRun] Would submit step: " + String(label || "form"));
        return true;
      }

      // Prefer clicking the submit button (some pages bind JS to click).
      const btnCandidates = Array.from(form.querySelectorAll('button, button[type="submit"], input[type="submit"]'));
      const btn =
        btnCandidates.find((b) => (b.tagName || "").toLowerCase() === "button" &&
          (b.textContent || "").trim().toLowerCase().includes("submit")) ||
        btnCandidates.find((b) => (b.tagName || "").toLowerCase() === "button" &&
          (b.textContent || "").trim().toLowerCase().includes("confirm")) ||
        btnCandidates.find((b) => (b.tagName || "").toLowerCase() === "button") ||
        btnCandidates.find((b) => (b.tagName || "").toLowerCase() === "input") ||
        null;

      try {
        if (btn && typeof btn.click === "function") {
          btn.click();
          return true;
        }
        form.requestSubmit ? form.requestSubmit() : form.submit();
        return true;
      } catch (e) {
        return false;
      }
    }

    async function moveMap(direction) {
      const dir = String(direction || "").toLowerCase();
      if (!dir) throw new Error("missing direction");

      // Check if movement is on cooldown first
      const moveButtons = document.querySelectorAll('form[data-map-move-form] button[type="submit"]');
      if (moveButtons.length > 0) {
        const anyDisabled = Array.from(moveButtons).some(btn => btn.disabled);
        if (anyDisabled) {
          throw new Error("Movement on cooldown");
        }
      }

      // 0) Try clickHudMove first (same method arrow keys use) - works on any tab with HUD
      try {
        if (typeof clickHudMove === "function") {
          const hudOk = clickHudMove(dir);
          if (hudOk) {
            dbg("move:hud", { dir, success: true });
            return;
          }
        }
      } catch (e) {
        dbg("move:hud error", String(e?.message || e));
      }

      // 1) Try clicking/submitting the on-screen move form (if present in DOM).
      try {
        const forms = Array.from(document.querySelectorAll('form[data-map-move-form]'));
        const form = forms.find((f) => {
          const a = f.querySelector('input[name="action"][value="move_map"]');
          const d = f.querySelector('input[name="direction"]');
          return !!a && !!d && String(d.value || "").toLowerCase() === dir;
        }) || null;

        if (form) {
          const csrf = getCsrfToken();
          const csrfInp = form.querySelector('input[name="csrf_token"], input[name="csrf"]');
          if (csrfInp && csrf) csrfInp.value = csrf;

          const btn = form.querySelector('button[type="submit"], button, input[type="submit"]');
          dbg("move:dom", { dir, hasForm: true, hasBtn: !!btn });
          if (btn && typeof btn.click === "function") btn.click();
          else form.requestSubmit ? form.requestSubmit() : form.submit();
          return;
        }
        dbg("move:dom", { dir, hasForm: false });
      } catch (e) {
        dbg("move:dom error", String(e?.message || e));
      }

      // 2) Fallback: POST same data as the move form to game.php.
      const csrf = getCsrfToken();
      if (!csrf) throw new Error("Missing CSRF");

      const body = new URLSearchParams();
      body.set("csrf_token", csrf);
      body.set("action", "move_map");
      body.set("direction", dir);

      dbg("move:fetch", { dir });

      const resp = await fetch("/game.php", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body,
      });
      if (!resp.ok) throw new Error("move_map failed");
      // server returns html; no need to parse
    }

    function computeNextTile(st) {
      const b = st.bounds;
      const x = st.cur.x;
      const y = st.cur.y;

      // serpentine, bottom row (maxY) -> top row (minY), moving north (y-1)
      if (st.rowDir === 1) {
        if (x < b.maxX) return { x: x + 1, y, rowDir: 1, move: "east" };
        if (y > b.minY) return { x, y: y - 1, rowDir: -1, move: "north" };
        return null;
      } else {
        if (x > b.minX) return { x: x - 1, y, rowDir: -1, move: "west" };
        if (y > b.minY) return { x, y: y - 1, rowDir: 1, move: "north" };
        return null;
      }
    }

    function getMapPosFromDom() {
      const view = document.querySelector("[data-map-view]");
      if (!view) return null;
      const x = parseInt(view.getAttribute("data-pos-x") || "", 10);
      const y = parseInt(view.getAttribute("data-pos-y") || "", 10);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y };
    }

    function teleportToStart(x, y) {
      if (typeof window.__oaTeleportToCoords === "function") {
        window.__oaTeleportToCoords(x, y, "kingdom_auto_start");
        return true;
      }
      notify("Kingdom Auto: HUD teleport function not ready. Open Map/HUD once then retry.");
      return false;
    }
    // --- Pending-start plane pump: ensures plane alignment happens even when Kingdom Auto is not yet "running" ---
    const __OA_KA_PENDING_PLANE_KEY = "oa_ka_pending_start_plane_v1";
    const __OA_KA_PLANE_ENF_KEY = "oa_ka_last_plane_enforce_v1";
    let __oaKAPendingPlaneTimer = null;
    let __oaKAPendingPlaneActive = false;
    let __oaKAPendingPlaneLastStepMs = 0;

    function __oaKAWritePlaneEnf(info) {
      try { localStorage.setItem(__OA_KA_PLANE_ENF_KEY, JSON.stringify({ at: Date.now(), ...(info || {}) })); } catch {}
    }

    function __oaKADetectCurrentPlaneBestEffort() {
      // Prefer true plane detection (forms/header inference); do NOT use combat plane-lock fallback here.
      try { if (typeof detectPlaneLocal === "function") { const p = normalizePlaneName(detectPlaneLocal() || ""); if (p) return p; } } catch {}
      try { if (typeof getCurrentPlaneName === "function") { const p = normalizePlaneName(getCurrentPlaneName() || ""); if (p) return p; } } catch {}
      try {
        // Infer from ascend/descend forms in the header (works on Map/Kingdoms/Combat if buttons exist)
        const forms = Array.from(document.querySelectorAll('form[data-plane-change-form]'));
        if (forms && forms.length) {
          let up = "", down = "";
          for (const f of forms) {
            const pid = normalizePlaneName(f.querySelector('input[name="plane_id"]')?.value || "");
            const btn = f.querySelector('button[type="submit"], button');
            const title = String(btn?.getAttribute("title") || "").toLowerCase();
            const txt = String(btn?.textContent || "").toLowerCase();
            const joined = title + " " + txt;
            if (joined.includes("ascend") || joined.includes("p↑") || joined.includes("↑")) up = pid;
            if (joined.includes("descend") || joined.includes("p↓") || joined.includes("↓")) down = pid;
          }
          const ui = PLANE_ORDER.indexOf(up);
          const di = PLANE_ORDER.indexOf(down);
          if (up && down && ui >= 0 && di >= 0) {
            // Normal layout: down = one below current, up = one above current
            if (ui - di === 2) return PLANE_ORDER[di + 1] || "";
            if (di - ui === 2) return PLANE_ORDER[ui + 1] || "";
            if (ui > di) return PLANE_ORDER[Math.max(0, ui - 1)] || "";
            if (di > ui) return PLANE_ORDER[Math.min(PLANE_ORDER.length - 1, di + 1)] || "";
          }
          if (up && ui >= 0) return PLANE_ORDER[Math.max(0, ui - 1)] || "";
          if (down && di >= 0) return PLANE_ORDER[Math.min(PLANE_ORDER.length - 1, di + 1)] || "";
        }
      } catch {}
      return "";
    }

    function __oaKAArmPendingPlanePump() {
      if (__oaKAPendingPlaneTimer) return;
      __oaKAPendingPlaneTimer = setInterval(() => {
        try {
          const pend = jget(__OA_KA_PENDING_PLANE_KEY, null);
          if (!pend || !pend.desiredPlane) {
            __oaKAPendingPlaneActive = false;
            return;
          }
          const want = normalizePlaneName(pend.desiredPlane || "");
          const cur = __oaKADetectCurrentPlaneBestEffort();

          __oaKAPendingPlaneActive = true;

          // If we can't detect current plane yet, we may need Map; wait/route if needed.
          if (!cur) {
            __oaKAWritePlaneEnf({ mode: "pending_start", step: "cur_unknown", want, cur: "", tab: getTab?.() });
            try { if (getTab() !== "map") gotoTab("map"); } catch {}
            return;
          }

          // If aligned, clear pending and start
          if (cur === want) {
            try { localStorage.removeItem(__OA_KA_PENDING_PLANE_KEY); } catch {}
            // Drop a short-lived token so startStop() can start without re-arming plane alignment.
            try { localStorage.setItem("oa_ka_plane_aligned_token_v1", JSON.stringify({ plane: want, at: Date.now() })); } catch {}
            __oaKAWritePlaneEnf({ mode: "pending_start", step: "aligned_token_set", want, cur, tab: getTab?.() });
            // Start now (but avoid recursion loops by only starting if not running)
            try { if (!isRunning()) startStop(); } catch {}
            return;
          }

          // Need to step planes
          const a = PLANE_ORDER.indexOf(cur);
          const b = PLANE_ORDER.indexOf(want);
          if (a < 0 || b < 0) {
            __oaKAWritePlaneEnf({ mode: "pending_start", step: "bad_index", want, cur, tab: getTab?.() });
            return;
          }

          const now = Date.now();
          if (now - __oaKAPendingPlaneLastStepMs < 1400) {
            __oaKAWritePlaneEnf({ mode: "pending_start", step: "throttle", want, cur, tab: getTab?.() });
            return;
          }

          // Need plane-change controls available; try current tab first, else route to Map.
          try {
            const forms = (typeof getPlaneChangeForms === "function") ? getPlaneChangeForms() : Array.from(document.querySelectorAll('form[data-plane-change-form]'));
            if (!forms || !forms.length) {
              if (typeof getTab === "function" && getTab() !== "map") {
                try { gotoTab("map"); } catch {}
                __oaKAWritePlaneEnf({ mode: "pending_start", step: "no_plane_forms_route_map", want, cur, tab: getTab?.() });
                return;
              }
              __oaKAWritePlaneEnf({ mode: "pending_start", step: "no_plane_forms_wait", want, cur, tab: getTab?.() });
              return;
            }
          } catch {}
const dir = (b > a) ? "up" : "down";

          // Try to step planes WITHOUT relying on combat-plane detection helpers.
          // We already have `cur` from best-effort detection above; use it to choose direction and target.
          let __clicked = false;
          let __chosen = null;

          function __getCsrf() {
            return (
              (document.querySelector('input[name="csrf_token"]')?.value || "") ||
              (document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "")
            ).trim();
          }

          // 1) Prefer the helper if available (it returns {btn,label,target} objects)
          try {
            const __forms = (typeof getPlaneChangeForms === "function") ? getPlaneChangeForms() : [];
            if (__forms && __forms.length) {
              let __pick = null;
              if (dir === "up") __pick = __forms.find(o => (o.label || "").includes("ascend") || (o.label || "").includes("up"));
              if (dir === "down") __pick = __forms.find(o => (o.label || "").includes("descend") || (o.label || "").includes("down"));
              if (!__pick) __pick = __forms[0];
              if (__pick && __pick.btn) {
                __pick.btn.click();
                __clicked = true;
                __chosen = { method: "helper", label: __pick.label || "", target: __pick.target || "" };
              }
            }
          } catch {}

          // 2) DOM fallback: click the <button> inside form[data-plane-change-form]
          if (!__clicked) {
            try {
              const __formsDom = Array.from(document.querySelectorAll('form[data-plane-change-form]'));
              let __best = null;
              for (const f of __formsDom) {
                const btn = f.querySelector('button[type="submit"],button');
                const title = String(btn?.getAttribute("title") || "").toLowerCase();
                const text = String(btn?.textContent || "").toLowerCase();
                const label = (title + " " + text);
                const ok = (dir === "up")
                  ? (label.includes("ascend") || label.includes("p↑") || label.includes("↑"))
                  : (label.includes("descend") || label.includes("p↓") || label.includes("↓"));
                if (ok) { __best = { f, btn, label }; break; }
              }
              if (__best && __best.btn) {
                if (typeof __best.f.requestSubmit === "function") __best.f.requestSubmit(__best.btn);
                else __best.btn.click();
                __clicked = true;
                const pid = __best.f.querySelector('input[name="plane_id"]')?.value || "";
                __chosen = { method: "dom", label: __best.label || "", plane_id: String(pid) };
              }
            } catch {}
          }

          // 3) Last-resort: submit change_plane directly to the next plane in the order.
          if (!__clicked) {
            try {
              const targetIdx = (dir === "up") ? (a + 1) : (a - 1);
              const targetPlane = PLANE_ORDER[targetIdx];
              const csrf = __getCsrf();
              if (targetPlane && csrf) {
                const form = document.createElement("form");
                form.method = "POST";
                form.action = "/game.php";
                form.style.display = "none";
                const add = (n, v) => { const i = document.createElement("input"); i.type = "hidden"; i.name = n; i.value = String(v); form.appendChild(i); };
                add("csrf_token", csrf);
                add("action", "change_plane");
                add("plane_source", "userscript_ka");
                add("plane_id", targetPlane);
                document.body.appendChild(form);
                form.submit();
                __clicked = true;
                __chosen = { method: "manual", plane_id: targetPlane };
              }
            } catch {}
          }

          __oaKAPendingPlaneLastStepMs = now;

          try {
            localStorage.setItem("oa_ka_plane_step_attempt_v1", JSON.stringify({
              at: now,
              tab: (typeof getTab === "function" ? getTab() : ""),
              dir,
              want,
              cur,
              clicked: __clicked,
              chosen: __chosen
            }));
          } catch {}

          if (!__clicked) {
            __oaKAWritePlaneEnf({ mode: "pending_start", step: "plane_step_failed", dir, want, cur, tab: getTab?.() });
            try { notify(`Kingdom Auto: can't change plane yet — no plane buttons found.`); } catch {}
            return;
          }

          __oaKAWritePlaneEnf({ mode: "pending_start", step: "plane_step_clicked", dir, want, cur, tab: getTab?.() });
          try { notify(`Kingdom Auto: correcting plane to ${planeTitle(want)}...`); } catch {}
       } catch (e) {
          try { __oaKAWritePlaneEnf({ mode: "pending_start", step: "error", err: String(e && e.message || e) }); } catch {}
        }
      }, 650);
    }

    try { __oaKAArmPendingPlanePump(); } catch {}

    function startStop() {

      try {
        const __s = loadSettings();
        const __want = normalizePlaneName(__s?.plane || "");
        const __cur = __oaKADetectCurrentPlaneBestEffort();
        __oaKAWritePlaneEnf({ mode: "start_pressed", want: __want, cur: __cur, tab: (typeof getTab === "function" ? getTab() : "") });
      } catch {}
if (isRunning()) return stop("Kingdom Auto: stopped.");

      const s = loadSettings();

      // If a plane is configured for this profile, HARD-GATE the Kingdom walk until the plane is aligned.
      // This prevents Map teleport / walking on the wrong plane.
      const desiredPlane = normalizePlaneName(s.plane);
      const __KA_PLANE_ORDER = ["underworld","katabasis","aetheria","aerion","olympus"];
      if (desiredPlane && __KA_PLANE_ORDER.includes(desiredPlane)) {
        const tok = jget("oa_ka_plane_aligned_token_v1", null);
        const tokPlane = normalizePlaneName((tok && (tok.plane || tok.plane_id || tok.want || "")) || "");
        const tokAge = Date.now() - Number((tok && tok.at) || 0);
        const tokOk = tokPlane === desiredPlane && tokAge >= 0 && tokAge < 30000;

        const pend = jget(__OA_KA_PENDING_PLANE_KEY, null);
        const pendPlane = normalizePlaneName((pend && (pend.desiredPlane || pend.want || "")) || "");

        try {
          localStorage.setItem("oa_ka_gate_trace_v1", JSON.stringify({
            at: Date.now(),
            desiredPlane,
            tokOk,
            tokPlane,
            tokAge,
            pending: !!pend,
            pendPlane,
            tab: (typeof getTab === "function" ? getTab() : "")
          }));
        } catch {}

        if (!tokOk) {
          // Arm or refresh pending plane alignment.
          if (!pend || pendPlane !== desiredPlane) {
            try {
              localStorage.setItem(__OA_KA_PENDING_PLANE_KEY, JSON.stringify({
                desiredPlane,
                at: Date.now(),
                reason: "f4_start"
              }));
            } catch {}
          }

          try { __oaKAArmPendingPlanePump(); } catch {}
          try {
            __oaKAWritePlaneEnf({
              mode: "start_gate",
              step: "armed_pending",
              want: desiredPlane,
              cur: (typeof __oaKADetectCurrentPlaneBestEffort === "function" ? __oaKADetectCurrentPlaneBestEffort() : ""),
              tab: (typeof getTab === "function" ? getTab() : "")
            });
          } catch {}

          notify(`Kingdom Auto: aligning plane to ${desiredPlane}...`);
          // Do NOT start yet. The pending-plane pump will call startStop() after alignment.
          return;
        } else {
          // Consume token and proceed to start normally.
          try { localStorage.removeItem("oa_ka_plane_aligned_token_v1"); } catch {}
          try { __oaKAWritePlaneEnf({ mode: "start_gate", step: "token_ok_starting", want: desiredPlane, tab: (typeof getTab === "function" ? getTab() : "") }); } catch {}
        }
      }

if (!Array.isArray(s.steps) || s.steps.length < 1) {
        notify("Kingdom Auto: no steps set — will only establish kingdoms (use Settings → Add Step / Capture Step).");
      }

      try { localStorage.removeItem("oa_beast_return_to_combat_v1"); } catch {}
      const st = initialState(s);
      saveState(st);
      setRunning(true);
      renderWidget();
      notify("Kingdom Auto: starting (F4 to stop).");

      // Only visit Map if we need to teleport to the starting corner.
      if (s.teleportToStart) gotoTab("map");
      else gotoTab("kingdoms");
    }

    // ---------- UI ----------
    function addStyle(css) {
      const st = document.createElement("style");
      st.textContent = css;
      document.head.appendChild(st);
    }

    addStyle(`
      /* Kingdom Auto UI */
      #oa-ka-widget{position:fixed;left:14px;top:160px;right:auto;bottom:auto;z-index:2147483647;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto;width:280px;max-width:280px;pointer-events:none}
      #oa-ka-widget .box{background:rgba(0,0,0,.82);border:1px solid rgba(251,191,36,.55);border-radius:14px;padding:10px;box-shadow:0 10px 34px rgba(0,0,0,.38);pointer-events:auto}
      #oa-ka-widget .title{display:flex;align-items:center;justify-content:space-between;color:#fde68a;font-weight:900;margin-bottom:6px;letter-spacing:.2px}
      #oa-ka-widget button{cursor:pointer;border-radius:12px;border:1px solid rgba(251,191,36,.35);background:rgba(251,191,36,.12);color:#fff;padding:6px 10px;font-size:12px}
      #oa-ka-widget .meta{color:#d1d5db;font-size:12px;line-height:1.25}

      #oa-ka-modal{position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.70);backdrop-filter:blur(2px)}
      #oa-ka-modal .panel{width:min(1120px,calc(100vw - 20px));max-height:calc(100vh - 20px);overflow:hidden;background:rgba(2,6,23,.97);border:1px solid rgba(251,191,36,.45);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.62)}
      #oa-ka-modal .ka-head{position:sticky;top:0;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;background:rgba(2,6,23,.98);border-bottom:1px solid rgba(148,163,184,.22)}
      #oa-ka-modal .ka-title{color:#fde68a;font-weight:900;letter-spacing:.2px}
      #oa-ka-modal .ka-scroll{overflow:auto;max-height:calc(100vh - 20px);padding:14px}

      #oa-ka-modal button{cursor:pointer;border-radius:12px;border:1px solid rgba(148,163,184,.30);background:rgba(148,163,184,.10);color:#e5e7eb;padding:8px 10px;font-size:12px}
      #oa-ka-modal button:hover{background:rgba(148,163,184,.16)}
      #oa-ka-modal button:active{transform:translateY(1px)}
      #oa-ka-modal input,#oa-ka-modal select{background:rgba(15,23,42,.92);border:1px solid rgba(148,163,184,.45);border-radius:12px;padding:8px 10px;color:#e5e7eb;font-size:12px;outline:none}
      #oa-ka-modal input:focus,#oa-ka-modal select:focus{border-color:rgba(251,191,36,.65);box-shadow:0 0 0 3px rgba(251,191,36,.12)}
      #oa-ka-modal input[type="checkbox"]{width:14px;height:14px}

      #oa-ka-modal .ka-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      #oa-ka-modal .ka-body{display:grid;grid-template-columns:360px 1fr;gap:12px;margin-top:12px}
      @media (max-width: 980px){
        #oa-ka-modal .ka-two{grid-template-columns:1fr}
        #oa-ka-modal .ka-body{grid-template-columns:1fr}
      }

      #oa-ka-modal .ka-card{background:rgba(148,163,184,.06);border:1px solid rgba(148,163,184,.22);border-radius:16px;padding:12px}
      #oa-ka-modal .ka-card-title{color:#fde68a;font-weight:900;font-size:11px;letter-spacing:.10em;text-transform:uppercase;margin-bottom:10px}
      #oa-ka-modal .ka-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      #oa-ka-modal .ka-hint{color:#94a3b8;font-size:12px;opacity:.95}
      #oa-ka-modal .ka-inline{display:flex;flex-direction:column;gap:4px;min-width:160px}
      #oa-ka-modal .ka-inline span{color:#cbd5e1;font-size:12px}
      #oa-ka-modal .ka-check{display:flex;align-items:center;gap:8px;color:#e2e8f0;font-size:12px;padding:6px 8px;border-radius:12px;background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.18)}

      #oa-ka-modal .ka-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      @media (min-width: 980px){
        #oa-ka-modal .ka-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
      }
      #oa-ka-modal .ka-span-all{grid-column:1 / -1}

      #oa-ka-modal .steps{margin-top:0}
      #oa-ka-modal .ka-steps{margin-top:10px;max-height:48vh;overflow:auto;padding-right:4px}
      #oa-ka-modal .step{display:flex;gap:8px;padding:10px;border:1px solid rgba(148,163,184,.22);border-radius:14px;margin-top:10px;background:rgba(148,163,184,.08)}
    `);

    function ensureWidget() {
      let w = document.getElementById("oa-ka-widget");
      if (w) return w;

      w = document.createElement("div");
      w.id = "oa-ka-widget";
      w.innerHTML = `
        <div class="box">
          <div class="title">
            <div>⚠ Kingdom Auto</div>
            <button id="oa-ka-settings">Settings</button>
          </div>
          <div class="meta" id="oa-ka-meta"></div>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
            <button id="oa-ka-toggle">Start (F4)</button>
            <button id="oa-ka-dump">Dump DBG</button>
          </div>
        </div>
      `;
      document.body.appendChild(w);

      // Avoid blocking map movement controls: draggable + saved position.
      const pos = loadWidgetPos();
      w.style.left = pos.x + "px";
      w.style.top = pos.y + "px";
      w.style.right = "auto";
      w.style.bottom = "auto";

      const title = w.querySelector(".title");
      if (title) {
        title.style.cursor = "move";
        title.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          const startX = ev.clientX;
          const startY = ev.clientY;
          const rect = w.getBoundingClientRect();
          const baseX = rect.left;
          const baseY = rect.top;
          const onMove = (e2) => {
            const nx = Math.max(0, baseX + (e2.clientX - startX));
            const ny = Math.max(0, baseY + (e2.clientY - startY));
            w.style.left = nx + "px";
            w.style.top = ny + "px";
          };
          const onUp = () => {
            window.removeEventListener("mousemove", onMove, true);
            window.removeEventListener("mouseup", onUp, true);
            const rect2 = w.getBoundingClientRect();
            saveWidgetPos({ x: Math.round(rect2.left), y: Math.round(rect2.top) });
          };
          window.addEventListener("mousemove", onMove, true);
          window.addEventListener("mouseup", onUp, true);
        });
      }

      w.querySelector("#oa-ka-settings").addEventListener("click", () => openModal());
      w.querySelector("#oa-ka-toggle").addEventListener("click", () => startStop());
      w.querySelector("#oa-ka-dump").addEventListener("click", () => {
        try {
          const buf = window.__oaKingdomAutoDebug?.buffer || [];
          console.log("[KingdomAuto][DBG] buffer", buf);
          notify("DBG dumped to console.");
        } catch {}
      });
      return w;
    }

    function ensureModal() {
      let m = document.getElementById("oa-ka-modal");
      if (m) return m;

      m = document.createElement("div");
      m.id = "oa-ka-modal";
      m.innerHTML = `

<div class="panel">
  <div class="ka-head">
    <div class="ka-title">⚠ Kingdom Auto Settings</div>
    <div class="ka-row">
      <button id="oa-ka-close" type="button">Close</button>
    </div>
  </div>

  <div class="ka-scroll">
    <div class="ka-two">
      <div class="ka-card">
        <div class="ka-card-title">Profiles</div>

        <div class="ka-row">
          <label class="ka-inline">
            <span>Active profile</span>
            <select id="oa-ka-profile"></select>
          </label>

          <div class="ka-row" style="margin-left:auto;">
            <button id="oa-ka-prof-new" type="button">New</button>
            <button id="oa-ka-prof-rename" type="button">Rename</button>
            <button id="oa-ka-prof-del" type="button">Delete</button>
          </div>
        </div>

        <div class="ka-hint">(Steps + rectangle saved per profile)</div>

        <div style="height:10px;"></div>

        <label class="ka-inline" style="min-width:240px;">
          <span>Scheduled walk profile</span>
          <select id="oa-ka-sched-profile"></select>
        </label>
        <div class="ka-hint">(profile used by scheduled walk)</div>
      </div>

      <div class="ka-card">
        <div class="ka-card-title">Schedules (up to 5)</div>

        <div id="oa-ka-sched-table-wrap" style="overflow-x:auto;">
          <table id="oa-ka-sched-table" style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:rgba(148,163,184,.12);text-align:left;">
                <th style="padding:8px;border-bottom:1px solid rgba(148,163,184,.22);">On</th>
                <th style="padding:8px;border-bottom:1px solid rgba(148,163,184,.22);">Profile</th>
                <th style="padding:8px;border-bottom:1px solid rgba(148,163,184,.22);">Start</th>
                <th style="padding:8px;border-bottom:1px solid rgba(148,163,184,.22);">Repeat</th>
                <th style="padding:8px;border-bottom:1px solid rgba(148,163,184,.22);">Next Run</th>
                <th style="padding:8px;border-bottom:1px solid rgba(148,163,184,.22);"></th>
              </tr>
            </thead>
            <tbody id="oa-ka-sched-tbody"></tbody>
          </table>
        </div>

        <div class="ka-row" style="margin-top:10px;gap:8px;">
          <button id="oa-ka-sched-add" type="button">+ Add Schedule</button>
        </div>

        <div class="ka-hint" style="margin-top:8px;">AutoCombat will pause during scheduled walks and resume after.</div>
      </div>
    </div>

    <div class="ka-body">
      <div class="ka-card">
        <div class="ka-card-title">Area & Options</div>

        <div class="ka-grid">
          <label class="ka-span-all">Owner (must match)
            <input id="oa-ka-owner" type="text" placeholder="Your name">
          </label>
          <label class="ka-span-all">Plane (for Kingdom Auto)
            <select id="oa-ka-plane">
              <option value="">(No plane enforcement)</option>
              <option value="underworld">Underworld</option>
              <option value="katabasis">Katabasis</option>
              <option value="aetheria">Aetheria</option>
              <option value="aerion">Aerion</option>
              <option value="olympus">Olympus</option>
</select>
              <button type="button" class="oa-btn oa-btn-xs" id="oa-ka-plane-lock-current" title="Set this profile's plane to your current plane">
                Lock Current
              </button>

          </label>

          <label>Bottom-Left X
            <input id="oa-ka-blx" type="number" min="0" max="49">
          </label>
          <label>Bottom-Left Y
            <input id="oa-ka-bly" type="number" min="0" max="49">
          </label>

          <label>Top-Right X
            <input id="oa-ka-trx" type="number" min="0" max="49">
          </label>
          <label>Top-Right Y
            <input id="oa-ka-try" type="number" min="0" max="49">
          </label>

          <label>Teleport to start
            <select id="oa-ka-teleport"><option value="1">Yes</option><option value="0">No</option></select>
          </label>

          <label>Owner mismatch
            <select id="oa-ka-mismatch"><option value="1">Stop</option><option value="0">Skip tile</option></select>
          </label>

          <label>Only unruled tiles (still runs steps on your tiles)
            <select id="oa-ka-onlyunruled"><option value="1">Yes</option><option value="0">No</option></select>
          </label>

          <label>Detect NPCs 🧙 (walks on map instead of kingdoms tab)
            <select id="oa-ka-detect-npcs"><option value="0">No (faster)</option><option value="1">Yes (slower)</option></select>
          </label>

          <label>Dry-run
            <select id="oa-ka-dry"><option value="0">Off</option><option value="1">On</option></select>
          </label>

          <label>Debug
            <select id="oa-ka-debug"><option value="0">Off</option><option value="1">On</option></select>
          </label>
        </div>

        <div class="ka-hint" style="margin-top:8px;">
          Rectangle is walked from top-left to bottom-right (inclusive). Keep it small if you have lots of steps.
        </div>
      </div>

      <div class="ka-card">
        <div class="ka-card-title">Steps</div>
        <div class="ka-hint">
          Go to <b>tab=kingdoms</b> on a tile you own, set dropdowns, then click <b>Capture Step</b>.
        </div>

        <div id="oa-ka-steps" class="ka-steps"></div>

        <div class="ka-row" style="margin-top:10px;">
          <button id="oa-ka-save" type="button">Save</button>
          <button id="oa-ka-refresh" type="button">Refresh options</button>
          <button id="oa-ka-addstep" type="button">Add Step</button>
          <button id="oa-ka-capture" type="button">Capture Step</button>
          <button id="oa-ka-clear" type="button">Clear Steps</button>
        </div>
      </div>
    </div>
  </div>
</div>
      `;
      document.body.appendChild(m);

      m.addEventListener("click", (e) => { if (e.target === m) closeModal(); });
      m.querySelector("#oa-ka-close").addEventListener("click", () => closeModal());
      m.querySelector("#oa-ka-save").addEventListener("click", () => saveModal());

// Profiles: switch / create / rename / delete
try {
  const profSel = m.querySelector("#oa-ka-profile");
  const btnNew = m.querySelector("#oa-ka-prof-new");
  const btnRen = m.querySelector("#oa-ka-prof-rename");
  const btnDel = m.querySelector("#oa-ka-prof-del");

  profSel?.addEventListener("change", (e) => {
    const name = normalizeProfileName(e?.target?.value || "");
    if (!name) return;
    const ok = setActiveProfile(name);
    if (!ok) return;
    renderModal();
    renderWidget();
    notify("Profile switched: " + name);
  });

  btnNew?.addEventListener("click", () => {
    const name = prompt("New profile name (clones current):", "New");
    if (!name) return;
    const res = createProfile(name, true);
    if (!res.ok) return notify("Profile not created: " + (res.reason || "Unknown"));
    renderModal();
    renderWidget();
    notify("Profile created: " + res.name);
  });

  btnRen?.addEventListener("click", () => {
    const s = loadSettings();
    const oldName = s.activeProfile || "Default";
    if (oldName === "Default") return notify("Default profile cannot be renamed.");
    const name = prompt("Rename profile:", oldName);
    if (!name || normalizeProfileName(name) === oldName) return;
    const res = renameProfile(oldName, name);
    if (!res.ok) return notify("Rename failed: " + (res.reason || "Unknown"));
    renderModal();
    renderWidget();
    notify("Profile renamed: " + res.name);
  });

  btnDel?.addEventListener("click", () => {
    const s = loadSettings();
    const name = s.activeProfile || "Default";
    if (name === "Default") return notify("Default profile cannot be deleted.");
    const ok = confirm(`Delete profile "${name}"? This cannot be undone.`);
    if (!ok) return;
    const res = deleteProfile(name);
    if (!res.ok) return notify("Delete failed: " + (res.reason || "Unknown"));
    renderModal();
    renderWidget();
    notify("Profile deleted.");
  });
} catch {}

      // Multi-Scheduler (Scheduled Kingdom Walk) settings
try {
  const SCHED_MULTI_KEY_LOCAL = "oa_sched_multi_kingdom_walk_v1";
  const MAX_SCHEDS = 5;

  function getMultiScheds() {
    try {
      const arr = JSON.parse(localStorage.getItem(SCHED_MULTI_KEY_LOCAL) || "[]");
      return Array.isArray(arr) ? arr.slice(0, MAX_SCHEDS) : [];
    } catch { return []; }
  }

  function setMultiScheds(arr) {
    try { localStorage.setItem(SCHED_MULTI_KEY_LOCAL, JSON.stringify(arr || [])); } catch {}
  }

  function genId() {
    return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  }

  function normHHMM(v) {
    const s = String(v || "").trim();
    const mt = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!mt) return null;
    let hh = parseInt(mt[1], 10);
    let mi = parseInt(mt[2], 10);
    if (!Number.isFinite(hh) || !Number.isFinite(mi)) return null;
    hh = Math.max(0, Math.min(23, hh));
    mi = Math.max(0, Math.min(59, mi));
    return String(hh).padStart(2, "0") + ":" + String(mi).padStart(2, "0");
  }

  function getNextRunText(sched) {
    try {
      if (!sched.enabled) return "—";
      if (!window.__oaScheduler || typeof window.__oaScheduler.getServerLocalMs !== "function") return "—";
      const nowLocal = window.__oaScheduler.getServerLocalMs();
      const cfg = { startHHMM: sched.startHHMM || "00:00", everyValue: sched.everyValue || 1, everyUnit: sched.everyUnit || "hours" };

      // Calculate period
      const v = Math.max(1, parseInt(cfg.everyValue, 10) || 1);
      const u = String(cfg.everyUnit || "hours");
      let periodMin = v * 60;
      if (u === "minutes") periodMin = v;
      else if (u === "days") periodMin = v * 1440;
      const periodMs = periodMin * 60000;

      // Parse start time
      const mt = String(cfg.startHHMM || "00:00").match(/^(\d{2}):(\d{2})$/);
      const hh = mt ? parseInt(mt[1], 10) : 0;
      const mi = mt ? parseInt(mt[2], 10) : 0;
      const startMin = (hh * 60) + mi;

      const dayMs = 86400000;
      const dayStart = Math.floor(nowLocal / dayMs) * dayMs;
      const firstMs = dayStart + (startMin * 60000);

      let nextMs;
      if (nowLocal < firstMs) {
        nextMs = firstMs;
      } else {
        const k = Math.floor((nowLocal - firstMs) / periodMs);
        nextMs = firstMs + ((k + 1) * periodMs);
      }

      const d = new Date(nextMs);
      return String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
    } catch { return "—"; }
  }

  function renderSchedTable() {
    const tbody = m.querySelector("#oa-ka-sched-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const scheds = getMultiScheds();
    const store = getStore();
    const profileNames = listProfileNames(store);

    for (const sched of scheds) {
      const tr = document.createElement("tr");
      tr.style.borderBottom = "1px solid rgba(148,163,184,.15)";

      // Enabled checkbox
      const tdOn = document.createElement("td");
      tdOn.style.padding = "8px";
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = !!sched.enabled;
      chk.addEventListener("change", () => {
        const arr = getMultiScheds();
        const s = arr.find(x => x.id === sched.id);
        if (s) {
          s.enabled = chk.checked;
          // Set notBeforeMs to next occurrence to prevent instant fire
          if (s.enabled) {
            try {
              const nowLocal = window.__oaScheduler?.getServerLocalMs?.() || Date.now();
              s.notBeforeMs = nowLocal + 60000; // At least 1 minute from now
            } catch {}
          }
          setMultiScheds(arr);
        }
        renderSchedTable();
      });
      tdOn.appendChild(chk);
      tr.appendChild(tdOn);

      // Profile dropdown
      const tdProf = document.createElement("td");
      tdProf.style.padding = "8px";
      const sel = document.createElement("select");
      sel.style.cssText = "background:rgba(15,23,42,.92);border:1px solid rgba(148,163,184,.45);border-radius:8px;padding:4px 6px;color:#e5e7eb;font-size:11px;";
      for (const pn of profileNames) {
        const opt = document.createElement("option");
        opt.value = pn;
        opt.textContent = pn;
        if (pn === sched.profile) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener("change", () => {
        const arr = getMultiScheds();
        const s = arr.find(x => x.id === sched.id);
        if (s) { s.profile = sel.value; setMultiScheds(arr); }
      });
      tdProf.appendChild(sel);
      tr.appendChild(tdProf);

      // Start time input
      const tdStart = document.createElement("td");
      tdStart.style.padding = "8px";
      const inpStart = document.createElement("input");
      inpStart.type = "text";
      inpStart.value = sched.startHHMM || "00:00";
      inpStart.placeholder = "HH:MM";
      inpStart.style.cssText = "width:60px;background:rgba(15,23,42,.92);border:1px solid rgba(148,163,184,.45);border-radius:8px;padding:4px 6px;color:#e5e7eb;font-size:11px;";
      inpStart.addEventListener("change", () => {
        const arr = getMultiScheds();
        const s = arr.find(x => x.id === sched.id);
        if (s) {
          s.startHHMM = normHHMM(inpStart.value) || "00:00";
          inpStart.value = s.startHHMM;
          setMultiScheds(arr);
          renderSchedTable();
        }
      });
      tdStart.appendChild(inpStart);
      tr.appendChild(tdStart);

      // Repeat (value + unit)
      const tdRepeat = document.createElement("td");
      tdRepeat.style.padding = "8px";
      const repeatWrap = document.createElement("div");
      repeatWrap.style.cssText = "display:flex;gap:4px;align-items:center;";
      const inpEvery = document.createElement("input");
      inpEvery.type = "number";
      inpEvery.min = "1";
      inpEvery.value = String(sched.everyValue || 1);
      inpEvery.style.cssText = "width:50px;background:rgba(15,23,42,.92);border:1px solid rgba(148,163,184,.45);border-radius:8px;padding:4px 6px;color:#e5e7eb;font-size:11px;";
      inpEvery.addEventListener("change", () => {
        const arr = getMultiScheds();
        const s = arr.find(x => x.id === sched.id);
        if (s) { s.everyValue = Math.max(1, parseInt(inpEvery.value, 10) || 1); setMultiScheds(arr); renderSchedTable(); }
      });
      const selUnit = document.createElement("select");
      selUnit.style.cssText = "background:rgba(15,23,42,.92);border:1px solid rgba(148,163,184,.45);border-radius:8px;padding:4px 6px;color:#e5e7eb;font-size:11px;";
      for (const u of ["minutes", "hours", "days"]) {
        const opt = document.createElement("option");
        opt.value = u;
        opt.textContent = u;
        if (u === sched.everyUnit) opt.selected = true;
        selUnit.appendChild(opt);
      }
      selUnit.addEventListener("change", () => {
        const arr = getMultiScheds();
        const s = arr.find(x => x.id === sched.id);
        if (s) { s.everyUnit = selUnit.value; setMultiScheds(arr); renderSchedTable(); }
      });
      repeatWrap.appendChild(inpEvery);
      repeatWrap.appendChild(selUnit);
      tdRepeat.appendChild(repeatWrap);
      tr.appendChild(tdRepeat);

      // Next run
      const tdNext = document.createElement("td");
      tdNext.style.padding = "8px";
      tdNext.style.color = "#94a3b8";
      tdNext.textContent = getNextRunText(sched);
      tr.appendChild(tdNext);

      // Remove button
      const tdDel = document.createElement("td");
      tdDel.style.padding = "8px";
      const btnDel = document.createElement("button");
      btnDel.textContent = "✕";
      btnDel.title = "Remove schedule";
      btnDel.style.cssText = "padding:4px 8px;font-size:11px;";
      btnDel.addEventListener("click", () => {
        const arr = getMultiScheds().filter(x => x.id !== sched.id);
        setMultiScheds(arr);
        renderSchedTable();
        notify("Schedule removed.");
      });
      tdDel.appendChild(btnDel);
      tr.appendChild(tdDel);

      tbody.appendChild(tr);
    }

    // Show message if no schedules
    if (scheds.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 6;
      td.style.cssText = "padding:16px;text-align:center;color:#64748b;";
      td.textContent = "No schedules. Click '+ Add Schedule' to create one.";
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  }

  // Add Schedule button
  const btnAdd = m.querySelector("#oa-ka-sched-add");
  btnAdd?.addEventListener("click", () => {
    const arr = getMultiScheds();
    if (arr.length >= MAX_SCHEDS) {
      notify("Maximum " + MAX_SCHEDS + " schedules reached.");
      return;
    }
    const defaultProfile = m.querySelector("#oa-ka-sched-profile")?.value || "Default";
    const newSched = {
      id: genId(),
      enabled: false,
      profile: defaultProfile,
      startHHMM: "00:00",
      everyValue: 1,
      everyUnit: "hours",
      lastOccMs: 0,
      notBeforeMs: 0
    };
    arr.push(newSched);
    setMultiScheds(arr);
    renderSchedTable();
    notify("Schedule added. Configure and enable it.");
  });

  // Initial render
  renderSchedTable();

} catch (e) { console.error("Multi-scheduler UI error:", e); }

m.querySelector("#oa-ka-refresh").addEventListener("click", async () => {
        const ok = await refreshOptionsCache();
        notify(ok ? "Options refreshed." : "Open tab=kingdoms to refresh options.");
        renderModal();
      });
      const addStepBtn = m.querySelector("#oa-ka-addstep");
      if (!addStepBtn) {
        console.error('[KingdomAuto] Add Step button not found in modal!');
        return;
      }

      addStepBtn.addEventListener("click", () => {
        console.log('[KingdomAuto] Add Step clicked');
        try {
          const s = loadSettings();
          console.log('[KingdomAuto] Current settings:', s);
          s.steps = Array.isArray(s.steps) ? s.steps : [];
          console.log('[KingdomAuto] Current steps:', s.steps.length);
          s.steps.push({ label: "Step " + (s.steps.length + 1), mode: "build_army", unit: "", direction: "", structure: "", amount: "" });
          console.log('[KingdomAuto] Added step, new count:', s.steps.length);
          saveSettings(s);
          console.log('[KingdomAuto] Settings saved');
          try { localStorage.setItem("oa_ka_last_plane_v1", normalizePlaneName(s.plane || "")); } catch {}
          renderModal();
          console.log('[KingdomAuto] Modal rendered');
          renderWidget();
          console.log('[KingdomAuto] Widget rendered');
        } catch (err) {
          console.error('[KingdomAuto] Add Step error:', err);
          console.error('[KingdomAuto] Error stack:', err.stack);
        }
      });

      m.querySelector("#oa-ka-capture").addEventListener("click", async () => {
        const s = loadSettings();
        const res = captureStepFromCurrentTile();
        if (!res.ok) return notify(res.error);
        s.steps = Array.isArray(s.steps) ? s.steps : [];
        await refreshOptionsCache();
        s.steps.push(res.step);
        saveSettings(s);
        renderModal();
        renderWidget();
        notify("Captured step.");
      });
      m.querySelector("#oa-ka-clear").addEventListener("click", () => {
        const s = loadSettings();
        s.steps = [];
        saveSettings(s);
        renderModal();
        renderWidget();
      });

      return m;
    }

    function renderModal() {
  const m = ensureModal();

const s = loadSettings();

// Profiles
try {
  const store = getStore();
  const sel = m.querySelector("#oa-ka-profile");
  if (sel) {
    const names = listProfileNames(store);
    sel.innerHTML = "";
    for (const n of names) {
      const opt = document.createElement("option");
      opt.value = n;
      opt.textContent = n;
      sel.appendChild(opt);
    }
    sel.value = store.activeProfile || (s.activeProfile || "Default");
  }
} catch {}

// Scheduler profile + schedule settings (Scheduled Kingdom Walk)
try {
  const store = getStore();
  const names = listProfileNames(store);

  // Profile dropdown
  const sel2 = m.querySelector("#oa-ka-sched-profile");
  if (sel2) {
    sel2.innerHTML = "";
    for (const n of names) {
      const opt = document.createElement("option");
      opt.value = n;
      opt.textContent = n;
      sel2.appendChild(opt);
    }
    let want = "Default";
    try {
      const cfg = (window.__oaScheduler && typeof window.__oaScheduler.getKingdomWalkSchedule === "function")
        ? window.__oaScheduler.getKingdomWalkSchedule()
        : (jget("oa_sched_kingdom_walk_cfg_v1", null) || null);
      if (cfg && typeof cfg.profile === "string") want = String(cfg.profile || "").trim() || "Default";
    } catch {}
    if (!names.includes(want)) want = (names.includes("Default") ? "Default" : (store.activeProfile || names[0] || "Default"));
    sel2.value = want;
    sel2.addEventListener("change", () => {
      try {
        const cfg2 = getCfg();
        cfg2.profile = String(sel2.value || "Default").trim() || "Default";
        setCfg(cfg2);
        try { notify("Scheduled Walk profile saved."); } catch {}
        renderModal();
        renderWidget();
      } catch {}
    });
  }

} catch {}

// Basic settings
  m.querySelector("#oa-ka-owner").value = s.owner || "";

  try {
    const selPlane = m.querySelector("#oa-ka-plane");
    if (selPlane) {
      const want = String(s.plane || "").trim();
      // normalize stored values to match options
      const norm = planeTitle(want) || "";
      selPlane.value = (normalizePlaneName(s.plane || "") || "");

  // Plane controls: auto-save plane selection + "Lock Current" (robust binding)
  try {
    const selPlane2 = m.querySelector("#oa-ka-plane");

      /* PLANE_UI_BIND_V159 */
      const planeStatus = m.querySelector("#oa-ka-plane-status");
      const updatePlaneStatus = () => {
        try {
          const cfgNow = loadSettings();
          const wantNow = normalizePlaneName(cfgNow?.plane || "");
          const curNow = normalizePlaneName(detectPlaneLocal() || "");
          if (planeStatus) planeStatus.textContent = `Plane (profile): ${planeTitle(wantNow) || "—"} | Current: ${planeTitle(curNow) || "?"}`;
        } catch {}
      };
      updatePlaneStatus();

      // Auto-save plane on change (immediate feedback)
      if (selPlane2) {
        selPlane2.addEventListener("change", () => {
            __oaRecordUIAction("plane_select_change", { plane: normalizePlaneName(String(selPlane2.value||"")), profile: String(loadSettings?.().activeProfile||"") });

          console.log("[KingdomAuto][Plane] UI change ->", selPlane2.value);
          __oaRecordUIAction("plane_select_change", { plane: String(selPlane2.value||""), profile: String(loadSettings?.().activeProfile||"") });
          try {
            const v = normalizePlaneName(String(selPlane2.value || ""));
            const tmp = loadSettings();
            tmp.plane = v;
            saveSettings(tmp);
            try { localStorage.setItem("oa_ka_last_plane_v1", v); } catch {}
            updatePlaneStatus();
            console.log("[KingdomAuto][Plane] selected+saved:", v);
            __oaRecordUIAction("plane_select_saved", { plane: v, profile: String(loadSettings?.().activeProfile||"") });

          } catch (e) {
            console.warn("[KingdomAuto][Plane] save failed", e);
          }
        });
      }
    const btnLock = m.querySelector("#oa-ka-plane-lock-current");

    if (selPlane2) {
      // Status line (visible feedback inside the modal)
      let msg = m.querySelector("#oa-ka-plane-msg");
      if (!msg) {
        msg = document.createElement("div");
        msg.id = "oa-ka-plane-msg";
        msg.style.fontSize = "11px";
        msg.style.opacity = "0.85";
        msg.style.marginTop = "6px";
        msg.style.lineHeight = "1.2";
        msg.style.whiteSpace = "normal";
        // Prefer placing under the lock button, otherwise under the select.
        const host = (btnLock && btnLock.parentElement) ? btnLock.parentElement : (selPlane2.parentElement || m);
        host.appendChild(msg);
      }
      const setMsg = (t) => { try { if (msg) msg.textContent = String(t || ""); } catch {} };

      // Auto-save when dropdown changes
      if (!selPlane2.dataset.oaBoundPlane) {
        selPlane2.dataset.oaBoundPlane = "1";
        selPlane2.addEventListener("change", () => {
          const val = normalizePlaneName(String(selPlane2.value || ""));
          try { localStorage.setItem("oa_ka_last_plane_v1", val || ""); } catch {}

          try {
            const tmp = loadSettings();
            tmp.plane = val;
            saveSettings(tmp);
            renderWidget();
            console.log("[KingdomAuto] Plane selected+saved:", val || "(none)");
            setMsg(val ? `Saved plane: ${planeTitle(val)}` : "Saved plane: (no enforcement)");
          } catch (e) {
            console.warn("[KingdomAuto] Plane save failed", e);
            setMsg("Plane save failed (see console).");
          }
        });
      }

      // Lock Current (idempotent bind)
      if (btnLock && !btnLock.dataset.oaBoundPlaneLock) {
        btnLock.dataset.oaBoundPlaneLock = "1";
        btnLock.addEventListener("click", (ev) => {
          console.log("[KingdomAuto][Plane] Lock Current clicked");
          __oaRecordUIAction("lock_current_clicked", { profile: String(loadSettings?.().activeProfile||"") });
          try { ev.preventDefault(); ev.stopPropagation(); } catch {}

          let cur = detectPlaneLocal();
          if (!cur) {
            try { cur = normalizePlaneName(localStorage.getItem("oa_pve_plane_lock_v1") || ""); } catch {}
          }

          if (!cur) {
            console.log("[KingdomAuto] Lock Current: plane unknown on this tab; opening Map.");
            __oaRecordUIAction("lock_current_unknown_plane", { profile: String(loadSettings?.().activeProfile||"") });

            setMsg("Couldn't detect plane here. Switching to Map… then reopen Settings.");
            try { notify("Plane: couldn't detect current plane here — switching to Map. Open Settings again and click Lock Current."); } catch {}
            try { gotoTab("map"); } catch {}
            return;
          }

          selPlane2.value = cur;
          try { localStorage.setItem("oa_ka_last_plane_v1", cur); } catch {}

          try {
            const tmp = loadSettings();
            tmp.plane = cur;
            saveSettings(tmp);
            renderWidget();
            console.log("[KingdomAuto] Plane locked+saved:", cur);
            __oaRecordUIAction("lock_current_saved", { plane: cur, profile: String(loadSettings?.().activeProfile||"") });
            setMsg(`Locked+saved plane: ${planeTitle(cur)}`);
          } catch (e) {
            console.warn("[KingdomAuto] Plane lock save failed", e);
            setMsg("Plane lock save failed (see console).");
          }

          try { notify(`Plane locked to current: ${planeTitle(cur)}`); } catch {}
        });
      }
    }
  } catch (e) { try { console.warn("[KingdomAuto] Plane UI bind error", e); } catch {} }

    }
  } catch {}
  m.querySelector("#oa-ka-blx").value = String(s.bottomLeft.x);
  m.querySelector("#oa-ka-bly").value = String(s.bottomLeft.y);
  m.querySelector("#oa-ka-trx").value = String(s.topRight.x);
  m.querySelector("#oa-ka-try").value = String(s.topRight.y);

  m.querySelector("#oa-ka-teleport").value = s.teleportToStart ? "1" : "0";
  m.querySelector("#oa-ka-mismatch").value = s.stopOnOwnerMismatch ? "1" : "0";
  m.querySelector("#oa-ka-onlyunruled").value = s.onlyUnruled ? "1" : "0";
  m.querySelector("#oa-ka-detect-npcs").value = s.detectNPCs ? "1" : "0";
  m.querySelector("#oa-ka-dry").value = s.dryRun ? "1" : "0";
  m.querySelector("#oa-ka-debug").value = s.debug ? "1" : "0";

  // Steps editor
  const stepsEl = m.querySelector("#oa-ka-steps");
  stepsEl.innerHTML = "";
  const steps = Array.isArray(s.steps) ? s.steps : [];

  console.log('[KingdomAuto] renderModal: steps count =', steps.length);
  console.log('[KingdomAuto] renderModal: steps =', steps);

  const cache = getOptionsCache();
  const modes = (cache.modes && cache.modes.length) ? cache.modes : FULL_FALLBACK_MODES;

  const mkSelect = (opts, value) => {
    const sel = document.createElement("select");
    for (const o of opts || []) {
      const opt = document.createElement("option");
      opt.value = String(o.value);
      opt.textContent = String(o.label);
      if (String(value) === String(o.value)) opt.selected = true;
      sel.appendChild(opt);
    }
    return sel;
  };

  const mkInput = (value) => {
    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = String(value || "");
    return inp;
  };

  const mkField = (labelText, inputEl) => {
    const l = document.createElement("label");
    l.style.color = "#e5e7eb";
    l.style.fontSize = "12px";
    l.style.gap = "4px";
    l.style.display = "flex";
    l.style.flexDirection = "column";
    const sp = document.createElement("span");
    sp.textContent = labelText;
    l.appendChild(sp);
    l.appendChild(inputEl);
    return l;
  };

  if (!steps.length) {
    console.log('[KingdomAuto] renderModal: No steps, showing empty message');
    const empty = document.createElement("div");
    empty.style.color = "#d1d5db";
    empty.style.fontSize = "12px";
    empty.style.marginTop = "8px";
    empty.textContent = "No steps yet. Use Add Step or Capture Step.";
    stepsEl.appendChild(empty);
    return;
  }

  console.log('[KingdomAuto] renderModal: Rendering', steps.length, 'steps');

  for (let i = 0; i < steps.length; i++) {
    const stp = steps[i] || {};

    // Legacy captured steps: show as label + delete.
    if (stp.fields) {
      const row = document.createElement("div");
      row.className = "step";
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";

      const t = document.createElement("div");
      t.style.color = "#e5e7eb";
      t.style.fontSize = "12px";
      t.textContent = String(stp.label || ("Captured Step " + (i + 1)));

      const del = document.createElement("button");
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        const cur = loadSettings();
        cur.steps = (cur.steps || []).filter((_, idx) => idx !== i);
        saveSettings(cur);
        renderModal();
        renderWidget();
      });

      row.appendChild(t);
      row.appendChild(del);
      stepsEl.appendChild(row);
      continue;
    }

    const box = document.createElement("div");
    box.className = "step";
    box.style.flexDirection = "column";
    box.style.alignItems = "stretch";

    const top = document.createElement("div");
    top.style.display = "flex";
    top.style.gap = "8px";
    top.style.alignItems = "center";
    top.style.justifyContent = "space-between";

    const title = document.createElement("div");
    title.style.color = "#e5e7eb";
    title.style.fontSize = "12px";
    title.textContent = "Step " + (i + 1);

    const del = document.createElement("button");
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      const cur = loadSettings();
      cur.steps = (cur.steps || []).filter((_, idx) => idx !== i);
      saveSettings(cur);
      renderModal();
      renderWidget();
    });

    top.appendChild(title);
    top.appendChild(del);

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
    grid.style.gap = "8px";
    grid.style.marginTop = "8px";

    const modeSel = mkSelect(modes, stp.mode || "build_army");
    modeSel.id = "oa-ka-step-" + i + "-mode";

    const unitEl = (cache.units && cache.units.length) ? mkSelect(cache.units, stp.unit || "") : mkInput(stp.unit || "");
    unitEl.id = "oa-ka-step-" + i + "-unit";

    const dirEl = (cache.directions && cache.directions.length) ? mkSelect(cache.directions, stp.direction || "") : mkInput(stp.direction || "");
    dirEl.id = "oa-ka-step-" + i + "-dir";

    const structEl = (cache.structures && cache.structures.length) ? mkSelect(cache.structures, stp.structure || "") : mkInput(stp.structure || "");
    structEl.id = "oa-ka-step-" + i + "-struct";

    const amtEl = document.createElement("input");
    amtEl.type = "number";
    amtEl.value = String(stp.amount ?? "");
    amtEl.id = "oa-ka-step-" + i + "-amt";

    grid.appendChild(mkField("Mode", modeSel));
    grid.appendChild(mkField("Unit (build_army)", unitEl));
    grid.appendChild(mkField("Direction (fortify)", dirEl));
    grid.appendChild(mkField("Structure (fortify)", structEl));
    grid.appendChild(mkField("Amount", amtEl));

    box.appendChild(top);
    box.appendChild(grid);
    stepsEl.appendChild(box);
  }
}

async function openModal() {
      const m = ensureModal();
      try { if (getTab() === "kingdoms") await refreshOptionsCache(); } catch {}
      renderModal();
      m.style.display = "flex";
    }

    function closeModal() {
      const m = document.getElementById("oa-ka-modal");
      try {
        const v = normalizePlaneName(String(m?.querySelector("#oa-ka-plane")?.value || ""));
        if (v) localStorage.setItem("oa_ka_last_plane_v1", v);
      } catch {}
      if (m) m.style.display = "none";
    }

    function saveModal() {
      __oaRecordUIAction("save_modal", { profile: String(loadSettings?.().activeProfile||"") });
          try { __oaRecordUIAction("save_modal_plane", { profile: String(loadSettings?.().activeProfile||""), plane: normalizePlaneName(String(m.querySelector("#oa-ka-plane")?.value||"")) }); } catch {}

          try { __oaRecordUIAction("save_modal_plane", { profile: String(loadSettings?.().activeProfile||""), plane: normalizePlaneName(String(m.querySelector("#oa-ka-plane")?.value||"")) }); } catch {}

      const m = ensureModal();
      const s = loadSettings();

      s.owner = String(m.querySelector("#oa-ka-owner").value || "").trim();

      try { s.plane = normalizePlaneName(String(m.querySelector("#oa-ka-plane")?.value || "").trim()); } catch {}
s.bottomLeft = { x: clampInt(m.querySelector("#oa-ka-blx").value, 0, 49), y: clampInt(m.querySelector("#oa-ka-bly").value, 0, 49) };
      s.topRight = { x: clampInt(m.querySelector("#oa-ka-trx").value, 0, 49), y: clampInt(m.querySelector("#oa-ka-try").value, 0, 49) };
      s.teleportToStart = m.querySelector("#oa-ka-teleport").value === "1";
      s.stopOnOwnerMismatch = m.querySelector("#oa-ka-mismatch").value === "1";
      s.onlyUnruled = m.querySelector("#oa-ka-onlyunruled").value === "1";
      s.detectNPCs = m.querySelector("#oa-ka-detect-npcs").value === "1";
      s.dryRun = m.querySelector("#oa-ka-dry").value === "1";
      s.debug = m.querySelector("#oa-ka-debug").value === "1";

      // Persist semantic step builder rows (legacy captured steps are preserved)
      try {
        const cur = loadSettings();
        const existing = Array.isArray(cur.steps) ? cur.steps : [];
        const out = [];
        for (let i = 0; i < existing.length; i++) {
          const stp = existing[i] || {};
          if (stp.fields) { out.push(stp); continue; }
          const mode = document.getElementById("oa-ka-step-" + i + "-mode")?.value || stp.mode || "build_army";
          const unit = document.getElementById("oa-ka-step-" + i + "-unit")?.value || stp.unit || "";
          const direction = document.getElementById("oa-ka-step-" + i + "-dir")?.value || stp.direction || "";
          const structure = document.getElementById("oa-ka-step-" + i + "-struct")?.value || stp.structure || "";
          const amount = document.getElementById("oa-ka-step-" + i + "-amt")?.value ?? (stp.amount ?? "");
          out.push({ label: "Mode: " + mode, mode, unit, direction, structure, amount });
        }
        s.steps = out;
      } catch {}

      saveSettings(s);
      closeModal();
      renderWidget();
      notify("Kingdom Auto: saved.");
    }

    function renderWidget() {
      const w = ensureWidget();
      const s = loadSettings();
      const st = loadState();
      const rect = computeRect(s);
      const cur = st?.cur ? `(${st.cur.x},${st.cur.y})` : "(?,?)";
      const steps = Array.isArray(s.steps) ? s.steps.length : 0;

      const meta = w.querySelector("#oa-ka-meta");
      const dbgOn = s.debug ? "DBG" : "";
      meta.textContent = `Owner: ${s.owner || "(unset)"} | Profile: ${s.activeProfile || "Default"} | Rect: [${rect.minX},${rect.maxY}]→[${rect.maxX},${rect.minY}] | Steps: ${steps} | ${isRunning() ? ("RUN " + cur) : "OFF"}${dbgOn ? (" | " + dbgOn) : ""}`;

      const btn = w.querySelector("#oa-ka-toggle");
      btn.textContent = isRunning() ? "Stop (F4)" : "Start (F4)";
    }

    // ---------- Runner ----------
    async function tick() {

      // Check if gold is at cap and needs conversion to drachma (runs while KA is active)
      if (isRunning()) {
        try {
          const convertPhase = jget(LS_GOLD_CONVERT_PHASE, null);
          const didConvert = await checkAndConvertGoldToDrachma();

          // If we're in the conversion process, pause other KA actions
          if (didConvert || convertPhase) {
            const newPhase = jget(LS_GOLD_CONVERT_PHASE, null);
            // If conversion just completed (phase cleared), go back to kingdoms
            if (convertPhase && !newPhase) {
              dbg("gold convert done, returning to kingdoms");
              await sleep(500);
              gotoTab("kingdoms");
            }
            return; // Wait for conversion to complete
          }
        } catch {}
      }

      // Check if player is dead and try to revive first before doing anything
      try {
        if (typeof isPlayerDead === "function" && isPlayerDead()) {
          const reviveBtn = typeof findReviveButton === "function" ? findReviveButton() : null;
          if (reviveBtn) {
            dbg("revive", { found: true });
            try { if (typeof recordRevive === "function") recordRevive(); } catch {}
            reviveBtn.click();
            return; // Wait for revive to complete
          } else {
            dbg("revive", { found: false, dead: true });
            // Player is dead but no revive button found - wait
            return;
          }
        }
      } catch (e) {
        dbg("revive error", String(e?.message || e));
      }

      // Pending start due to plane enforcement: once plane matches, clear and start.
      // Only process if Kingdom Auto is actually supposed to be starting
      try {
        const pend = jget("oa_ka_pending_start_plane_v1", null);
        if (pend && pend.desiredPlane) {
          // Timeout: if pending for more than 30 seconds, clear it and abort
          if (pend.startedAt && Date.now() - pend.startedAt > 30000) {
            console.log("[KingdomAuto][Plane] Pending start timed out after 30s, clearing");
            try { localStorage.removeItem("oa_ka_pending_start_plane_v1"); } catch {}
            try { localStorage.removeItem("oa_ka_plane_fix_laststep_ms_v2"); } catch {}
            try { localStorage.removeItem("oa_ka_plane_step_count_v1"); } catch {}
            notify("Kingdom Auto: Plane correction timed out - cleared.");
            return;
          }

          // Max step count: prevent infinite loops (max 20 steps should cover any plane change)
          const stepCount = Number(localStorage.getItem("oa_ka_plane_step_count_v1") || 0);
          if (stepCount > 20) {
            console.log("[KingdomAuto][Plane] Too many steps, aborting plane correction");
            try { localStorage.removeItem("oa_ka_pending_start_plane_v1"); } catch {}
            try { localStorage.removeItem("oa_ka_plane_fix_laststep_ms_v2"); } catch {}
            try { localStorage.removeItem("oa_ka_plane_step_count_v1"); } catch {}
            notify("Kingdom Auto: Plane correction failed (too many steps) - cleared.");
            return;
          }

          const want = normalizePlaneName(pend.desiredPlane);
          const curRaw = (typeof detectPlaneLocal === "function" ? detectPlaneLocal() : ((typeof getCurrentPlaneName === "function" ? getCurrentPlaneName() : "") || ""));
          const cur = normalizePlaneName(curRaw || "");
          if (!cur) {
            try { gotoTab("map"); } catch {}
            return;
          }
          if (cur && want && cur === want) {
            try { localStorage.removeItem("oa_ka_pending_start_plane_v1"); } catch {}
            try { localStorage.removeItem("oa_ka_plane_step_count_v1"); } catch {}
            // start now
            startStop();
            return;
          }

          // keep stepping (multi-step) until plane matches
          if (want && cur && cur !== want) {
            const a = PLANE_ORDER.indexOf(cur);
            const b = PLANE_ORDER.indexOf(want);
            if (a >= 0 && b >= 0) {
              const now = Date.now();
              const last = Number((() => { try { return localStorage.getItem("oa_ka_plane_fix_laststep_ms_v2") || 0; } catch { return 0; } })()) || 0;
              if (now - last >= 1400) {
                const dir = (b > a) ? "up" : "down";
                try { if (getTab() !== "map") { gotoTab("map"); return; } } catch {}
                try { localStorage.setItem("oa_autocombat_restore_delay_until_ms_v1", String(now + 1000)); } catch {}
                clickPlaneStep(dir);
                try { localStorage.setItem("oa_ka_plane_fix_laststep_ms_v2", String(now)); } catch {}
                try { localStorage.setItem("oa_ka_plane_step_count_v1", String(stepCount + 1)); } catch {}
                try { localStorage.setItem("oa_ka_last_plane_enforce_v1", JSON.stringify({at:Date.now(), want, cur, tab:getTab(), mode:"pending_start"})); } catch {}
                notify(`Kingdom Auto: correcting plane to ${planeTitle(want)}...`);
              try { console.log("[KingdomAuto][Plane] step", {cur, want, tab:getTab(), stepCount: stepCount + 1}); } catch {}
              }
            } else {
              // Invalid plane - abort
              console.log("[KingdomAuto][Plane] Invalid plane index, aborting", {cur, want, a, b});
              try { localStorage.removeItem("oa_ka_pending_start_plane_v1"); } catch {}
              try { localStorage.removeItem("oa_ka_plane_step_count_v1"); } catch {}
            }
            return; // wait for plane update then re-tick
          }

          return; // wait
        }

      } catch {}

      // While running, keep Kingdom Auto on the profile's configured plane (multi-step).
      // If plane drifts (you ascend/descend manually), pause actions and step back.
      try {
        if (isRunning()) {
          const cfg = loadSettings();
          const want = normalizePlaneName(cfg?.plane || "");
          if (want && PLANE_ORDER.includes(want)) {
            const curRaw = (typeof detectPlaneLocal === "function" ? detectPlaneLocal() : ((typeof getCurrentPlaneName === "function" ? getCurrentPlaneName() : "") || ""));
            const cur = normalizePlaneName(curRaw || "");
            if (!cur) {
              try { if (getTab() !== "map") gotoTab("map"); } catch {}
              try { console.log("[KingdomAuto][Plane] cur unknown; routing to map"); } catch {}
              return;
            }
            if (cur && cur !== want) {
              // Check step count to prevent infinite loops
              const stepCount = Number(localStorage.getItem("oa_ka_plane_step_count_v1") || 0);
              if (stepCount > 20) {
                console.log("[KingdomAuto][Plane] Too many steps while running, stopping");
                try { localStorage.removeItem("oa_ka_plane_step_count_v1"); } catch {}
                try { localStorage.removeItem("oa_ka_plane_fix_laststep_ms_v2"); } catch {}
                return stop("Kingdom Auto: Plane correction failed (stuck) - stopped.");
              }

              const now = Date.now();
              const last = Number((() => { try { return localStorage.getItem("oa_ka_plane_fix_laststep_ms_v2") || 0; } catch { return 0; } })()) || 0;
              if (now - last >= 1400) {
                const a = PLANE_ORDER.indexOf(cur);
                const b = PLANE_ORDER.indexOf(want);
                if (a >= 0 && b >= 0) {
                  try { if (getTab() !== "map") { gotoTab("map"); return; } } catch {}
                  clickPlaneStep((b > a) ? "up" : "down");
                  try { localStorage.setItem("oa_ka_plane_fix_laststep_ms_v2", String(now)); } catch {}
                  try { localStorage.setItem("oa_ka_plane_step_count_v1", String(stepCount + 1)); } catch {}
                  notify(`Kingdom Auto: correcting plane to ${planeTitle(want)}...`);
              try { console.log("[KingdomAuto][Plane] step", {cur, want, tab:getTab(), stepCount: stepCount + 1}); } catch {}
                }
              }
              return; // wait for plane to update before doing anything else
            } else {
              // Plane is correct - reset step counter
              try { localStorage.removeItem("oa_ka_plane_step_count_v1"); } catch {}
            }
          }
        }
      } catch {}

// Scheduled Kingdom Walk: auto-start Kingdom Auto when a pending schedule is present.
      if (!isRunning()) {
                  try { if (jget("oa_ka_pending_start_plane_v1", null)) return; } catch {}

        try {
          const schedKey = "oa_sched_hourly_kingdom_walk_active_v1";
          const sched = jget(schedKey, null);
          if (sched && sched.runId && String(sched.phase || "") === "pending_start") {
            // Mark as running and kick off.
            sched.phase = "running";
            jset(schedKey, sched);

            // Apply scheduler-selected profile for this run (temporary; restored at end).
            try {
              const desired = String(sched.desiredProfile || "").trim();
              if (desired) setActiveProfile(desired);
            } catch {}

            // startStop() will handle tab routing (map/kingdoms) as needed.
            startStop();

            // If it didn't actually start (missing settings), cancel + return.
            setTimeout(() => {
              try {
                if (!isRunning()) {
                  try { if (jget("oa_ka_pending_start_plane_v1", null)) return; } catch {}

                  // restore and return
                  const schedObj = jget(schedKey, null) || {};
                  const snap = (schedObj.snapshot || {});
                  const prevProfile = String(schedObj.prevProfile || "").trim();
                  if (prevProfile) { try { setActiveProfile(prevProfile); } catch {} }
                  try { localStorage.setItem("oa_auto_combat_enabled_v1", JSON.stringify(!!snap.autoCombatEnabled)); } catch {}
                  try { localStorage.setItem("oa_last_beast_auto_v1", JSON.stringify(!!snap.autoBeastEnabled)); } catch {}
                  try { localStorage.setItem("oa_game_autocombat_wanted_v1", JSON.stringify(!!snap.gameAutoWanted)); } catch {}
                  try { localStorage.setItem("oa_game_autocombat_force_v1", JSON.stringify(!!snap.gameAutoForce)); } catch {}
                  try { localStorage.removeItem(schedKey); } catch {}
                  gotoTab("combat");
                }
              } catch {}
            }, 1600);

            return;
          }
        } catch {}
        return;
      }
      if (!acquireLock()) return;

      try {
        const settings = loadSettings();
        let st = loadState();
        if (!st || !st.running) {
          st = initialState(settings);
          console.log('[KingdomAuto] Starting walk - detectNPCs:', settings.detectNPCs, 'plane:', settings.plane);
          saveState(st);
        }

        const tab = getTab();
        const now = nowMs();
        dbg("tick", { phase: st.phase, tab, cur: st.cur, stepIdx: st.stepIdx, justColonized: st.justColonized, stepsLen: (Array.isArray(settings.steps) ? settings.steps.length : 0) });
        if (now - (st.lastActAt || 0) < 150) return;

        if (st.phase === PHASE.NAV_MAP) {

          if (settings.teleportToStart && !st.didTeleport) {
            st.phase = PHASE.TP_START;
            st.tpTarget = { x: st.bounds.minX, y: st.bounds.maxY };
            st.tpStartedAt = 0;
            st.lastActAt = now;
            saveState(st);
            return;
          }

          st.phase = PHASE.NAV_KINGDOMS;
          st.lastActAt = now;
          saveState(st);
          gotoTab("kingdoms");
          return;
        }

        if (st.phase === PHASE.TP_START) {

          if (!st.tpStartedAt) {
            st.tpStartedAt = now;
            st.lastActAt = now;
            saveState(st);
            teleportToStart(st.tpTarget.x, st.tpTarget.y);
            st.phase = PHASE.WAIT_TP;
            saveState(st);
            return;
          }
        }

        if (st.phase === PHASE.WAIT_TP) {
          // Make sure we're on the map tab
          if (tab !== "map") {
            st.lastActAt = now;
            saveState(st);
            gotoTab("map");
            return;
          }

          // Timeout after 30 seconds - skip teleport and continue
          if (st.tpStartedAt && (now - st.tpStartedAt > 30000)) {
            console.log('[KingdomAuto] Teleport timeout - continuing without teleport');
            st.didTeleport = false;
            st.phase = PHASE.NAV_KINGDOMS;
            st.lastActAt = now;
            saveState(st);
            gotoTab("kingdoms");
            return;
          }

          const pos = getMapPosFromDom();
          if (pos && pos.x === st.tpTarget.x && pos.y === st.tpTarget.y) {
            st.cur = { ...pos };
            st.didTeleport = true;
            st.phase = PHASE.NAV_KINGDOMS;
            st.lastActAt = now;
            saveState(st);
            gotoTab("kingdoms");
            return;
          }
          // stay on map until we confirm position changed
          st.lastActAt = now;
          saveState(st);
          return;
        }

        if (st.phase === PHASE.NAV_KINGDOMS) {
          // Position already verified in WAIT_MOVE phase

          // NPC detection mode: stay on map tab only
          if (settings.detectNPCs) {
            if (tab !== "map") {
              st.lastActAt = now;
              saveState(st);
              gotoTab("map");
              return;
            }
            st.phase = PHASE.RUN_TILE;
            st.stepIdx = 0;
            st.justColonized = false;
            st.lastActAt = now;
            saveState(st);
            return;
          }

          // Normal mode: use kingdoms tab
          if (tab !== "kingdoms") {
            st.lastActAt = now;
            saveState(st);
            gotoTab("kingdoms");
            return;
          }
          st.phase = PHASE.RUN_TILE;
          st.stepIdx = 0;
          st.justColonized = false;
          st.lastActAt = now;
          saveState(st);
          return;
        }

        if (st.phase === PHASE.RUN_TILE) {
          // NPC DETECTION MODE: Stay on map, save NPCs directly, move to next
          if (settings.detectNPCs) {
            if (tab !== "map") {
              st.lastActAt = now;
              saveState(st);
              gotoTab("map");
              return;
            }

            // Wait for NPC panel to update with new location's NPCs
            // We use a new phase to track this wait
            if (!st.npcPanelWaitStarted) {
              st.npcPanelWaitStarted = now;
              st.lastActAt = now;
              saveState(st);
              return;
            }

            const waitElapsed = now - st.npcPanelWaitStarted;
            if (waitElapsed < 300) {
              // Wait for NPC panel to load (300ms)
              return;
            }

            // Now save NPCs from map tab
            try {
              if (st.cur) {
                // Read actual plane from DOM instead of relying on settings
                const mapCoords = getMapCoordsFromDOM();
                const plane = mapCoords?.plane || settings.plane || "";

                if (!plane) {
                  console.log('[KingdomAuto] [NPC Mode] ERROR: Cannot determine plane name');
                  console.log('[KingdomAuto] [NPC Mode] mapCoords:', mapCoords);
                  console.log('[KingdomAuto] [NPC Mode] settings.plane:', settings.plane);
                }

                console.log('[KingdomAuto] [NPC Mode] Saving NPCs at', st.cur, 'on plane:', plane);
                saveNPCsFromMapTab(st.cur, plane);
              }
            } catch (e) {
              console.log('[KingdomAuto] [NPC Mode] Error saving NPCs:', e);
            }

            // Done - move to next tile (no kingdom steps in NPC mode)
            st.npcPanelWaitStarted = null; // Reset wait tracker
            st.phase = PHASE.MOVE_NEXT;
            st.lastActAt = now;
            saveState(st);
            return;
          }

          // NORMAL MODE: Use kingdoms tab, run steps
          if (tab !== "kingdoms") { st.lastActAt = now; saveState(st); gotoTab("kingdoms"); return; }

          const panel = findKingdomPanel();
          if (!panel) { st.lastActAt = now; saveState(st); return; }

          // CRITICAL: Verify we're actually on the expected tile before running steps
          // Parse HUD location coords (format: "Loc: 000,Oly,044" or just "000,Oly,044")
          try {
            const hudCoordsEl = document.getElementById("hud-location-coords");
            const hudText = String(hudCoordsEl?.textContent || "").trim();
            // Extract coords - handle "Loc: 000,Oly,044" or "000,Oly,044"
            const coordMatch = hudText.match(/(\d{3}),([^,]+),(\d{3})/);
            if (coordMatch && st.cur) {
              const hudX = parseInt(coordMatch[1], 10);
              const hudY = parseInt(coordMatch[3], 10);
              const expectedX = st.cur.x;
              const expectedY = st.cur.y;

              if (hudX !== expectedX || hudY !== expectedY) {
                st.positionMismatchCount = (st.positionMismatchCount || 0) + 1;
                dbg("position mismatch - waiting", { expected: st.cur, hudX, hudY, hudText, mismatchCount: st.positionMismatchCount });
                console.log("[KingdomAuto] Position mismatch - waiting for HUD to update", { expected: { x: expectedX, y: expectedY }, actual: { x: hudX, y: hudY }, mismatchCount: st.positionMismatchCount });

                // If position mismatch persists for 20+ ticks, something is wrong - resync position
                if (st.positionMismatchCount >= 20) {
                  console.log("[KingdomAuto] Position mismatch timeout - resyncing to actual position", { hudX, hudY });
                  st.cur = { x: hudX, y: hudY };
                  st.positionMismatchCount = 0;
                }

                st.lastActAt = now;
                saveState(st);
                return; // Wait for position to match before proceeding
              } else {
                // Position matches - reset mismatch counter
                st.positionMismatchCount = 0;
              }
            }
          } catch (e) {
            dbg("position check error", String(e?.message || e));
          }

          // Save current kingdom to database
          try {
            if (window.__kingdomDB && typeof window.__kingdomDB.saveAt === "function" && st.cur) {
              // Get plane from settings or detect it
              const plane = settings.plane || "";
              console.log('[KingdomAuto] Saving kingdom to DB at', st.cur, 'plane:', plane);
              window.__kingdomDB.saveAt(st.cur.x, st.cur.y, plane);
            } else {
              console.log('[KingdomAuto] __kingdomDB.saveAt not available or no position');
            }
          } catch (e) {
            console.log('[KingdomAuto] Error saving to DB:', e);
          }

          const desiredOwner = normalizeOwner(settings.owner);
          const unruled = isUnruled(panel);
          dbg("tile", { cur: st.cur, unruled, ownerText: ownerFromPanel(panel), hasColonize: !!panel.querySelector('input[name="action"][value="colonize_kingdom"]'), hasEstablishBtn: Array.from(panel.querySelectorAll("button")).some((b)=>String(b.textContent||"").toLowerCase().includes("establish a kingdom")) });

          if (!unruled) {
            const ownerNow = normalizeOwner(ownerFromPanel(panel));
            if (desiredOwner && ownerNow && ownerNow !== desiredOwner) {
              if (settings.stopOnOwnerMismatch) return stop(`Kingdom Auto: owner mismatch (${ownerNow}).`);
              st.phase = PHASE.MOVE_NEXT;
              st.lastActAt = now;
              saveState(st);
              return;
            }
            // Note: we still run steps on tiles owned by your configured owner.
            // "Only unruled" now controls colonize behavior (and skipping other owners), not whether to run steps on your tiles.
          }

          if (unruled && !st.justColonized) {
            const ok = submitColonize(panel, settings, st);
            if (!ok) {
            st.colonizeFailCount = (st.colonizeFailCount || 0) + 1;
            dbg("colonize failed", { count: st.colonizeFailCount, cur: st.cur });
            st.lastActAt = now;
            saveState(st);
            if (st.colonizeFailCount >= 10) return stop("Kingdom Auto: colonize not found after retries (see console DBG).");
            return; // retry next tick
          }
          st.colonizeFailCount = 0;
            st.justColonized = true;
            st.lastActAt = now;
            saveState(st);
            return; // will reload
          }

          const steps = Array.isArray(settings.steps) ? settings.steps : [];
          if (st.stepIdx >= steps.length) {
            st.phase = PHASE.MOVE_NEXT;
            st.lastActAt = now;
            saveState(st);
            return;
          }

          const step = steps[st.stepIdx];

          if (step && step.fields) {
            const form = findActionForm(panel);
            if (!form) return stop("Kingdom Auto: action form missing.");
            applyFieldsToForm(form, step.fields || {});
            const ok = submitForm(form, settings, step.label || ("Step " + (st.stepIdx + 1)));
            if (!ok) return stop("Kingdom Auto: failed submitting step.");
          } else {
            const applied = applySemanticStep(panel, step || {});
            if (!applied.ok) {
              dbg("step waiting", { reason: applied.reason, stepIdx: st.stepIdx, cur: st.cur });
              st.lastActAt = now;
              saveState(st);
              return;
            }
            const ok = submitForm(applied.form, settings, step?.label || ("Step " + (st.stepIdx + 1)));
            if (!ok) return stop("Kingdom Auto: failed submitting step.");
          }

          st.stepIdx += 1;
          st.lastActAt = now;
          saveState(st);

          // Check if gold is at cap after any action (especially withdraw)
          // and convert to drachma if needed
          try {
            const stepMode = step?.mode || step?.fields?.kingdom_action_mode || "";
            if (stepMode === "withdraw" || !stepMode) {
              // Small delay to let gold update, then check
              setTimeout(async () => {
                try { await checkAndConvertGoldToDrachma(); } catch {}
              }, 1500);
            }
          } catch {}

          return;
        }

        if (st.phase === PHASE.NAV_BACK_MAP) {
          st.phase = PHASE.MOVE_NEXT;
        }

        if (st.phase === PHASE.MOVE_NEXT) {

          const next = computeNextTile(st);
          if (!next) return stop("Kingdom Auto: finished rectangle.");

          try {
            await moveMap(next.move);
          } catch (e) {
            const msg = String(e?.message || e);
            if (msg.includes("cooldown")) {
              // Movement on cooldown - wait and retry
              console.log('[KingdomAuto] Movement on cooldown, waiting...');
              return; // Retry next tick (150ms)
            }
            return stop("Kingdom Auto: move failed - " + msg);
          }

          // Store TARGET position separately - don't update st.cur yet!
          st.targetPos = { x: next.x, y: next.y };
          st.rowDir = next.rowDir;
          st.phase = PHASE.WAIT_MOVE;
          st.stepIdx = 0;
          st.justColonized = false;
          st.positionMismatchCount = 0;
          st.moveStartedAt = now; // Track when move started
          st.lastActAt = now;
          saveState(st);
          return;
        }

        if (st.phase === PHASE.WAIT_MOVE) {
          // Wait minimum 200ms for character to move and DOM to update
          const elapsed = now - (st.moveStartedAt || now);
          if (elapsed < 200) {
            return; // Wait for movement
          }

          // Now verify position from DOM
          const mapCoords = getMapCoordsFromDOM();

          if (!mapCoords) {
            console.log('[KingdomAuto] ERROR: Cannot read map coords from DOM');
            st.positionMismatchCount = (st.positionMismatchCount || 0) + 1;
            if (st.positionMismatchCount >= 20) {
              return stop('[KingdomAuto] Failed to read map position - stopping');
            }
            return; // Retry next tick
          }

          if (!st.targetPos) {
            console.log('[KingdomAuto] ERROR: targetPos missing in WAIT_MOVE');
            return stop('[KingdomAuto] Invalid state - no target position');
          }

          const targetX = st.targetPos.x;
          const targetY = st.targetPos.y;

          if (mapCoords.x !== targetX || mapCoords.y !== targetY) {
            st.positionMismatchCount = (st.positionMismatchCount || 0) + 1;

            console.log('[KingdomAuto] Waiting for position update', {
              target: st.targetPos,
              actual: mapCoords,
              elapsed: elapsed + 'ms',
              attempts: st.positionMismatchCount
            });

            // Position still not updated - keep waiting
            if (st.positionMismatchCount < 40) { // Increased from 20 to 40 (6 seconds)
              return; // Check again next tick
            } else {
              // Timeout after 6 seconds - use actual DOM position and continue
              console.log('[KingdomAuto] Position timeout - resyncing to actual position', {
                target: st.targetPos,
                actual: mapCoords
              });
              st.cur = { x: mapCoords.x, y: mapCoords.y };
              st.positionMismatchCount = 0;
              st.phase = PHASE.NAV_KINGDOMS;
              st.targetPos = null;
              st.lastActAt = now;
              saveState(st);
              return;
            }
          } else {
            // Position matches! Character has arrived at target
            console.log('[KingdomAuto] Position verified!', {
              position: mapCoords,
              elapsed: elapsed + 'ms'
            });
            st.cur = { x: mapCoords.x, y: mapCoords.y };
            st.positionMismatchCount = 0;
            st.phase = PHASE.NAV_KINGDOMS;
            st.targetPos = null;
            st.lastActAt = now;
            saveState(st);
            return;
          }
        }

        saveState(st);
      } finally {
        releaseLock();
        renderWidget();
      }
    }

    // Hotkey
    window.addEventListener("keydown", (e) => {
      if (e.key === "F4") {
        const ae = document.activeElement;
        const tag = ae?.tagName ? String(ae.tagName).toLowerCase() : "";
        if (tag === "input" || tag === "textarea" || tag === "select") return;
        e.preventDefault();
        startStop();
      }
    }, true);

    // Bootstrap
    setInterval(() => { try { tick(); } catch {} }, 150);
    setTimeout(() => { try { renderWidget(); } catch {} }, 500);
  })();

  // --- CANARY: ensure scheduler API is always reachable ---
  (function ensureSchedulerAPI(){
    try {
      if (window.__oaScheduler && typeof window.__oaScheduler.getNextKingdomWalkRunInfo === "function") return;
      // Try to discover scheduler on window (some builds store it elsewhere)
      const cand = window.__oaScheduler || window.__OAScheduler || window.__oaSchedulerV2;
      if (cand && typeof cand.getNextKingdomWalkRunInfo === "function") {
        window.__oaScheduler = cand;
        return;
      }
    } catch {}
  })();

  // --- PageBridge API Patch: expose server clock helpers to page console ---
  (function __OA_PAGEBRIDGE_API_PATCH__(){
    try {
      const sch = window.__oaScheduler;
      if (!sch) return;

      if (typeof sch.getServerLocalMs !== "function") {
        sch.getServerLocalMs = function(){
          try {
            const info = (typeof sch.getNextKingdomWalkRunInfo === "function") ? sch.getNextKingdomWalkRunInfo() : null;
            if (info && typeof info.nowLocalMs === "number") return info.nowLocalMs;
          } catch {}
          return Date.now();
        };
      }

      if (typeof sch.getServerNowText !== "function") {
        sch.getServerNowText = function(){
          try {
            const info = (typeof sch.getNextKingdomWalkRunInfo === "function") ? sch.getNextKingdomWalkRunInfo() : null;
            if (info && typeof info.nowText === "string") return info.nowText;
          } catch {}
          return "—";
        };
      }

      if (typeof sch.getNextText !== "function") {
        sch.getNextText = function(){
          try {
            const info = (typeof sch.getNextKingdomWalkRunInfo === "function") ? sch.getNextKingdomWalkRunInfo() : null;
            if (info && typeof info.nextText === "string") return info.nextText;
          } catch {}
          return "—";
        };
      }
    } catch {}
  })();

  // ===== COMBAT STAT ANALYZER v3 - Full Stat Cross-Reference + Claude AI =====
  // Reads all 7 stats (DUR/STR/DEX/CON/AGI/INT/PER) from DOM [data-stat-value="xxx"]
  // Cross-references with combat performance for smart stat allocation recommendations
  // Optionally uses Claude API for SC solving and deep analysis
  (function initCombatStatAnalyzerV3() {
    const STATS_KEY = "oa_combat_stats_v3";
    const AI_KEY = "oa_ai_api_key_v1";
    const OPENAI_KEY = "oa_openai_api_key_v1";
    const SOLVER_KEY = "oa_sc_solver_choice_v1"; // "capsolver" | "claude" | "off"
    const MODEL_KEY = "oa_sc_model_choice_v1";  // "haiku" | "sonnet" | "gpt52"
    const PANEL_VIS_KEY = "oa_analyzer_vis_v3";
    const TAG = "[StatAnalyzer]";

    // ── Utility ──
    function fmt(n) { return Number.isFinite(n) ? n.toLocaleString() : "0"; }
    function pct(n) { return Number.isFinite(n) ? n.toFixed(1) + "%" : "0.0%"; }
    function safeInt(s) { return parseInt(String(s).replace(/,/g, ""), 10) || 0; }

    // ── Read ALL 7 Player Stats from DOM ──
    // Uses: <span data-stat-value="durability">1,671</span> etc.
    function readPlayerStats() {
      const result = {
        dur: 0, str: 0, dex: 0, con: 0, agi: 0, int: 0, per: 0,
        level: 0, hp: 0, maxHp: 0, statPoints: 0
      };

      // Primary: data-stat-value elements (the grid display)
      const statMap = {
        durability: "dur", strength: "str", dexterity: "dex",
        concentration: "con", agility: "agi", intelligence: "int", perception: "per"
      };
      document.querySelectorAll("[data-stat-value]").forEach(el => {
        const key = (el.getAttribute("data-stat-value") || "").toLowerCase().trim();
        const mapped = statMap[key];
        if (mapped) result[mapped] = safeInt(el.textContent);
      });

      // Fallback: stat allocation modal config
      const modal = document.getElementById("stat-allocation-modal");
      if (modal) {
        try {
          const cfg = JSON.parse(modal.getAttribute("data-stat-config") || "{}");
          if (cfg.stats) {
            for (const [key, val] of Object.entries(cfg.stats)) {
              const k = key.toLowerCase().trim();
              const v = typeof val === "object" ? (val.value || 0) : (val || 0);
              const mapped = statMap[k] || (k.length <= 3 ? k : null);
              if (mapped && result[mapped] === 0) result[mapped] = safeInt(v);
            }
          }
          if (cfg.stat_points) result.statPoints = safeInt(cfg.stat_points);
        } catch {}
      }

      // Fallback: data-stat-row elements
      document.querySelectorAll("[data-stat-row]").forEach(row => {
        const key = (row.getAttribute("data-stat-row") || "").toLowerCase().trim();
        const valEl = row.querySelector("[data-stat-current]");
        if (!valEl) return;
        const v = safeInt(valEl.textContent);
        const mapped = statMap[key] || (key.length <= 3 ? key : null);
        if (mapped && result[mapped] === 0) result[mapped] = v;
      });

      // HP from HUD
      const hpText = document.getElementById("player-hp-text");
      if (hpText) {
        const m = (hpText.textContent || "").match(/([\d,]+)\s*\/\s*([\d,]+)/);
        if (m) { result.hp = safeInt(m[1]); result.maxHp = safeInt(m[2]); }
      }

      // Level from HUD
      const lvlEl = document.getElementById("player-level-value");
      if (lvlEl) result.level = safeInt(lvlEl.textContent);

      // Stat points
      if (window.CombatState && typeof window.CombatState.statPoints === "number") {
        result.statPoints = window.CombatState.statPoints;
      }

      return result;
    }

    // ── Combat Tracking ──
    function defaults() {
      return {
        attacks: 0, hits: 0, misses: 0, crits: 0, normalHits: 0,
        totalDmg: 0, critDmg: 0, normalDmg: 0, bonusDmg: 0,
        dmgTaken: 0, kills: 0, deaths: 0, dodges: 0, hpRegen: 0,
        lastUpdated: Date.now()
      };
    }
    function load() { try { const r = JSON.parse(localStorage.getItem(STATS_KEY)); return r && r.attacks >= 0 ? r : defaults(); } catch { return defaults(); } }
    function save(s) { try { s.lastUpdated = Date.now(); localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch {} }

    let all = load();
    let sess = defaults();
    let panel = null;
    let isVisible = false;
    try { isVisible = localStorage.getItem(PANEL_VIS_KEY) === "1"; } catch {}

    // ── Parse Log Entry ──
    function parse(node) {
      const type = node.dataset?.logType || "";
      const text = (node.textContent || "").trim();
      const lower = text.toLowerCase();
      const r = { type, text, damage: 0, isCrit: false, isHit: false, isMiss: false, isBonus: false, isDmgTaken: false, isKill: false, isDeath: false, isRegen: false, isDodge: false };

      const dmgMatch = text.match(/for\s+([\d,]+)\s+(?:total\s+)?damage/i);
      if (dmgMatch) r.damage = safeInt(dmgMatch[1]);
      if (!r.damage) { const m2 = text.match(/([\d,]+)\s+damage/i); if (m2) r.damage = safeInt(m2[1]); }

      if (type === "player-critical" || type === "player-spell-critical" || lower.includes("arcane rush") || lower.includes("critical")) {
        r.isCrit = true; r.isHit = true;
      } else if (type.startsWith("player-hit") || type === "player-spell-hit" || type === "player-ranged-hit" || type === "player-attack" || type === "player-hit-mixed") {
        r.isHit = true;
      } else if (type === "player-miss" || type === "player-miss-spell" || type === "player-miss-phys" || lower.includes("you miss")) {
        r.isMiss = true;
      } else if (type === "player-dodge" || lower.includes("dodg")) {
        r.isDodge = true;
      } else if (type === "spell-bonus" || lower.includes("surge") || lower.includes("bonus damage") || lower.includes("erupts")) {
        r.isBonus = true;
        if (!r.damage) { const m2 = text.match(/([\d,]+)/); if (m2) r.damage = safeInt(m2[1]); }
      } else if (type === "monster-hit" || lower.includes("hits you") || lower.includes("hit you")) {
        r.isDmgTaken = true;
      }

      if (type === "monster-defeated" || (lower.includes("defeated") && !lower.includes("you were") && !lower.includes("you have been"))) {
        r.isKill = true;
      }
      if (type === "player-defeat" || lower.includes("you were defeated") || lower.includes("you have been defeated")) {
        r.isDeath = true;
      }
      if (type === "player-regen" || type === "player-heal" || type === "spell-heal" || lower.includes("regenerat") || lower.includes("restores") || lower.includes("heals")) {
        r.isRegen = true;
        if (!r.damage) { const m2 = text.match(/([\d,]+)/); if (m2) r.damage = safeInt(m2[1]); }
      }

      return r;
    }

    function record(p) {
      for (const s of [all, sess]) {
        if (p.isHit) {
          s.attacks++; s.hits++; s.totalDmg += p.damage;
          if (p.isCrit) { s.crits++; s.critDmg += p.damage; }
          else { s.normalHits++; s.normalDmg += p.damage; }
        }
        if (p.isMiss) { s.attacks++; s.misses++; }
        if (p.isBonus) { s.bonusDmg += p.damage; s.totalDmg += p.damage; }
        if (p.isDmgTaken) { s.dmgTaken += p.damage; }
        if (p.isKill) { s.kills++; }
        if (p.isDeath) { s.deaths++; }
        if (p.isRegen) { s.hpRegen += p.damage; }
        if (p.isDodge) { s.dodges++; }
      }
      save(all);
    }

    // ── Metrics ──
    function metrics(s) {
      const accuracy = s.attacks > 0 ? (s.hits / s.attacks * 100) : 0;
      const critRate = s.hits > 0 ? (s.crits / s.hits * 100) : 0;
      const avgDmg = s.hits > 0 ? Math.round(s.totalDmg / s.hits) : 0;
      const avgCrit = s.crits > 0 ? Math.round(s.critDmg / s.crits) : 0;
      const avgNormal = (s.hits - s.crits) > 0 ? Math.round(s.normalDmg / (s.hits - s.crits)) : 0;
      const critMult = avgNormal > 0 ? (avgCrit / avgNormal) : 0;
      const survivalRate = (s.kills + s.deaths) > 0 ? (s.kills / (s.kills + s.deaths) * 100) : 100;
      const avgDmgTaken = s.dmgTaken > 0 && (s.kills + s.deaths) > 0 ? Math.round(s.dmgTaken / (s.kills + s.deaths)) : 0;
      return { accuracy, critRate, avgDmg, avgCrit, avgNormal, critMult, survivalRate, avgDmgTaken };
    }

    // ── Recommendations ──
    function recommend() {
      const stats = readPlayerStats();
      const m = metrics(sess.attacks >= 20 ? sess : all);
      const recs = [];
      const total = stats.dur + stats.str + stats.dex + stats.con + stats.agi + stats.int + stats.per;
      const noStats = total === 0;
      const noData = all.attacks < 5;

      if (noStats || noData) return { recs: [], stats, metrics: m, total };

      // CONCENTRATION → Accuracy
      if (m.accuracy < 80) {
        recs.push({ stat: "CON (Accuracy)", prio: "CRITICAL", color: "#ef4444",
          val: stats.con, reason: `Accuracy ${pct(m.accuracy)} — missing ${pct(100-m.accuracy)} of attacks!`,
          action: `PUMP CON. Every miss = 0 damage. CON is your #1 priority until 85%+.` });
      } else if (m.accuracy < 90) {
        recs.push({ stat: "CON (Accuracy)", prio: "HIGH", color: "#f59e0b",
          val: stats.con, reason: `Accuracy ${pct(m.accuracy)} — still losing ${pct(100-m.accuracy)} DPS to misses.`,
          action: `More CON. Target 90%+ for reliable damage output.` });
      } else if (m.accuracy < 96) {
        recs.push({ stat: "CON (Accuracy)", prio: "MEDIUM", color: "#3b82f6",
          val: stats.con, reason: `Accuracy ${pct(m.accuracy)} — solid. Marginal gains from more CON.`,
          action: `CON is fine. Consider INT/PER instead for bigger gains.` });
      } else {
        recs.push({ stat: "CON (Accuracy)", prio: "LOW", color: "#22c55e",
          val: stats.con, reason: `Accuracy ${pct(m.accuracy)} — excellent! No more CON needed.`,
          action: `Stop adding CON. You almost never miss.` });
      }

      // PERCEPTION → Crit
      if (m.critRate < 10) {
        recs.push({ stat: "PER (Crit)", prio: "HIGH", color: "#f59e0b",
          val: stats.per, reason: `Crit rate ${pct(m.critRate)} — ARCANE RUSH barely triggers.`,
          action: `Add PER. Crits do ${m.critMult > 0 ? m.critMult.toFixed(1)+"x" : "?"} normal. Each crit = ${fmt(m.avgCrit)} vs ${fmt(m.avgNormal)}.` });
      } else if (m.critRate < 25) {
        recs.push({ stat: "PER (Crit)", prio: "MEDIUM", color: "#3b82f6",
          val: stats.per, reason: `Crit rate ${pct(m.critRate)} — decent. Crits avg ${fmt(m.avgCrit)} dmg.`,
          action: `More PER = more ARCANE RUSH procs. Good balanced investment.` });
      } else {
        recs.push({ stat: "PER (Crit)", prio: "LOW", color: "#22c55e",
          val: stats.per, reason: `Crit rate ${pct(m.critRate)} — strong! Crits happen often.`,
          action: `PER is in a good spot. Focus INT for bigger hit numbers.` });
      }

      // INTELLIGENCE → Damage
      const effDmg = m.avgDmg * (m.accuracy / 100);
      if (m.accuracy >= 85 && m.critRate >= 15) {
        recs.push({ stat: "INT (Damage)", prio: "HIGH", color: "#f59e0b",
          val: stats.int, reason: `Acc ${pct(m.accuracy)} + Crit ${pct(m.critRate)} = solid foundation. INT = ${fmt(stats.int)}.`,
          action: `PUMP INT. Your hits land and crit — bigger base damage amplifies everything. Effective DPS/hit: ${fmt(Math.round(effDmg))}.` });
      } else if (m.accuracy >= 80) {
        recs.push({ stat: "INT (Damage)", prio: "MEDIUM", color: "#3b82f6",
          val: stats.int, reason: `Avg hit: ${fmt(m.avgDmg)}. INT = ${fmt(stats.int)}. But accuracy/crit could be better.`,
          action: `Balance INT with CON/PER. Effective DPS/hit: ${fmt(Math.round(effDmg))}.` });
      } else {
        recs.push({ stat: "INT (Damage)", prio: "LOW", color: "#22c55e",
          val: stats.int, reason: `Accuracy too low (${pct(m.accuracy)}) for INT to shine.`,
          action: `Fix CON first. INT won't help if hits don't land.` });
      }

      // DURABILITY → Survivability
      if (m.survivalRate < 85) {
        recs.push({ stat: "DUR (HP/Defense)", prio: "HIGH", color: "#f59e0b",
          val: stats.dur, reason: `Survival rate ${pct(m.survivalRate)} — dying too much! MaxHP: ${fmt(stats.maxHp)}.`,
          action: `Add DUR. Deaths = lost combat time. More HP + damage reduction.` });
      } else if (m.survivalRate < 95) {
        recs.push({ stat: "DUR (HP/Defense)", prio: "MEDIUM", color: "#3b82f6",
          val: stats.dur, reason: `Survival ${pct(m.survivalRate)}. DUR = ${fmt(stats.dur)}, MaxHP = ${fmt(stats.maxHp)}.`,
          action: `A few DUR points could help. Dying occasionally costs DPS time.` });
      } else {
        recs.push({ stat: "DUR (HP/Defense)", prio: "LOW", color: "#22c55e",
          val: stats.dur, reason: `Survival ${pct(m.survivalRate)} — tanky! Rarely dying.`,
          action: `DUR is fine. Focus on DPS stats.` });
      }

      // STR / DEX / AGI — we know less about these but show them
      recs.push({ stat: "STR/DEX/AGI", prio: "INFO", color: "#94a3b8",
        val: stats.str + stats.dex + stats.agi,
        reason: `STR: ${fmt(stats.str)} | DEX: ${fmt(stats.dex)} | AGI: ${fmt(stats.agi)}`,
        action: `Physical stats. STR may affect phys damage, DEX ranged/dodge, AGI speed. Use AI analysis for deeper insight.` });

      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
      recs.sort((a, b) => (order[a.prio] ?? 9) - (order[b.prio] ?? 9));
      return { recs, stats, metrics: m, total };
    }

    // ── Claude AI Analysis ──
    async function aiAnalyze() {
      const key = localStorage.getItem(AI_KEY);
      if (!key) return { error: "No API key. Run: setAIApiKey('sk-ant-...')" };

      const stats = readPlayerStats();
      const m = metrics(all);
      const sm = metrics(sess);
      const total = stats.dur + stats.str + stats.dex + stats.con + stats.agi + stats.int + stats.per;

      const prompt = `You are an expert advisor for the browser RPG "Olympus Awakened". Analyze this player's stats and combat performance. Give specific, actionable advice.

PLAYER STATS (Level ${stats.level}):
- Durability (DUR): ${stats.dur} → HP pool (${stats.maxHp} max HP) and damage reduction
- Strength (STR): ${stats.str} → Physical damage
- Dexterity (DEX): ${stats.dex} → Ranged/dodge
- Concentration (CON): ${stats.con} → Accuracy (hit chance)
- Agility (AGI): ${stats.agi} → Speed/evasion
- Intelligence (INT): ${stats.int} → Spell/magic damage
- Perception (PER): ${stats.per} → Critical hit chance
Total: ${total} points | Available: ${stats.statPoints} unspent

COMBAT PERFORMANCE (All-time / ${all.attacks} attacks):
- Accuracy: ${m.accuracy.toFixed(1)}% (${all.hits} hits / ${all.misses} misses)
- Crit Rate: ${m.critRate.toFixed(1)}% (${all.crits} crits / ${all.hits} hits) — triggers ARCANE RUSH
- Avg Damage: ${m.avgDmg} | Avg Crit: ${m.avgCrit} | Avg Normal: ${m.avgNormal}
- Crit Multiplier: ${m.critMult > 0 ? m.critMult.toFixed(2) + "x" : "N/A"}
- Kills: ${all.kills} | Deaths: ${all.deaths} | Survival: ${m.survivalRate.toFixed(1)}%
- Damage Taken: ${all.dmgTaken} | Dodges: ${all.dodges}
- Bonus Damage (spells): ${all.bonusDmg} | HP Regen: ${all.hpRegen}

${sess.attacks >= 10 ? `SESSION (${sess.attacks} attacks): Acc ${sm.accuracy.toFixed(1)}% | Crit ${sm.critRate.toFixed(1)}% | Avg ${sm.avgDmg} | Kills ${sess.kills}` : ""}

Give:
1) Overall build assessment (what kind of build is this, is it balanced or lopsided?)
2) Biggest weakness right now
3) Priority order for next 50 stat points with reasoning
4) What stat ratios to aim for at this level
5) Any hidden synergies or diminishing returns to watch for
Be concise but specific with numbers.`;

      try {
        const res = await gmFetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 600, messages: [{ role: 'user', content: prompt }] })
        });
        if (!res.ok) { const t = await res.json().catch(() => ({})); throw new Error(t.error?.message || `HTTP ${res.status}`); }
        const data = await res.json();
        const text = data.content?.[0]?.text || "No response";
        console.log(TAG, "AI Analysis:\n" + text);
        return { success: true, analysis: text };
      } catch (e) {
        console.error(TAG, "AI Error:", e);
        return { error: e.message };
      }
    }

    // Claude Vision SC Solver
    // Captcha is 6-character alphanumeric. Sometimes asks for specific positions.
    // Now includes LEARNING from past successes/failures!
    async function solveWithClaude(processedBase64, rawBase64, modelId) {
      const isGPT = modelId && modelId.startsWith('gpt-');
      const key = isGPT ? localStorage.getItem(OPENAI_KEY) : localStorage.getItem(AI_KEY);
      if (!key) throw new Error(isGPT ? "No OpenAI API key set" : "No Claude API key set");

      const useModel = modelId || 'claude-haiku-4-5-20251001';

      // Build image content - USE ONLY PROCESSED IMAGE (raw didn't help)
      const hasProcessed = processedBase64 && processedBase64.length > 100;
      if (!hasProcessed) throw new Error("No usable image");

      console.log(`[ClaudeSC] Sending processed image to ${isGPT ? 'OpenAI' : 'Claude'}`);
      const imageInstructions = `You are reading a CAPTCHA image from a game security check.`;

      // ===== LEARNING: Build context from past performance =====
      let learningContext = '';
      try {
        const stats = loadCapSolverStats();

        // Calculate and show accuracy context
        const passRate = stats.passed > 0 ? ((stats.passed / (stats.passed + stats.rejected)) * 100).toFixed(0) : 0;
        if (stats.passed + stats.rejected >= 5) {
          learningContext += `\n\nYour current accuracy: ${passRate}% (${stats.passed} passed, ${stats.rejected} rejected). Be extra careful with each character.`;
          if (parseInt(passRate) < 70) {
            learningContext += ' Your accuracy is LOW - slow down and examine each character individually before answering.';
          }
        }

        // ===== HUMAN CORRECTIONS: Most valuable learning signal =====
        try {
          const corrections = loadSCCorrections();
          if (corrections.length > 0) {
            // 1. Aggregate character-level misread patterns (THIS IS THE MOST USEFUL PART)
            const correctionPatterns = {};
            const analysisInsights = [];
            for (const c of corrections) {
              if (!c.claudeAnswer || !c.correctAnswer) continue;
              for (let i = 0; i < 6; i++) {
                if (c.claudeAnswer[i] !== c.correctAnswer[i]) {
                  const key = `${c.claudeAnswer[i]}\u2192${c.correctAnswer[i]}`;
                  correctionPatterns[key] = (correctionPatterns[key] || 0) + 1;
                }
              }
              // Collect unique visual analysis insights
              if (c.analysis && analysisInsights.length < 3) {
                const snippet = c.analysis.substring(0, 150).trim();
                if (snippet && !analysisInsights.some(a => a === snippet)) {
                  analysisInsights.push(snippet);
                }
              }
            }

            const topCorrPatterns = Object.entries(correctionPatterns).sort((a, b) => b[1] - a[1]).slice(0, 8);
            if (topCorrPatterns.length > 0) {
              learningContext += '\n\nCRITICAL - YOUR PROVEN MISREAD PATTERNS (human-verified from ' + corrections.length + ' past failures):';
              topCorrPatterns.forEach(([pattern, count]) => {
                const [from, to] = pattern.split('\u2192');
                if (count >= 3) {
                  learningContext += `\n\u26A0\uFE0F HIGH FREQUENCY: You misread "${to}" as "${from}" (${count}x) - When you see what looks like "${from}", it is VERY LIKELY actually "${to}"!`;
                } else if (count >= 2) {
                  learningContext += `\n- You confuse "${from}" with "${to}" (${count}x) - double-check any "${from}" characters carefully`;
                } else {
                  learningContext += `\n- "${from}" was actually "${to}" - watch for this`;
                }
              });

              // Add visual analysis insights if available
              if (analysisInsights.length > 0) {
                learningContext += '\n\nVISUAL CLUES FROM PAST MISTAKES:';
                analysisInsights.forEach(insight => {
                  learningContext += `\n- ${insight}`;
                });
              }
            }
          }
        } catch (e) {
          console.log('[ClaudeSC] Could not load corrections:', e.message);
        }

        console.log('[ClaudeSC] Learning context:', learningContext || '(none)');
      } catch (e) {
        console.log('[ClaudeSC] Could not build learning context:', e.message);
      }

      // Simple system prompt - let AI figure it out
      let systemPrompt = 'You are a CAPTCHA reading expert. Read 6-character alphanumeric codes from images. Always respond with exactly 2 lines: Line 1 = 6 characters, Line 2 = confidence number. No explanations.';

      const userPromptText = `${imageInstructions}

Read the 6 alphanumeric characters (A-Z, 0-9) from this CAPTCHA image.

RESPONSE FORMAT:
Line 1: Exactly 6 uppercase characters (no spaces, no punctuation)
Line 2: Your confidence as a number 0-100

Example:
ABC123
75

Read the image and respond with exactly those two lines.`;

      let res;
      if (isGPT) {
        // OpenAI Chat Completions API
        const openaiContent = [];
        openaiContent.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${processedBase64}`, detail: 'high' } });
        openaiContent.push({ type: 'text', text: userPromptText });

        res = await gmFetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({
            model: useModel,
            max_completion_tokens: 50,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: openaiContent }
            ]
          })
        });
      } else {
        // Anthropic Messages API
        const imageContent = [];
        imageContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: processedBase64 } });
        imageContent.push({ type: 'text', text: userPromptText });

        res = await gmFetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: useModel,
            max_tokens: 50,
            system: systemPrompt,
            messages: [{ role: 'user', content: imageContent }]
          })
        });
      }

      if (!res.ok) { const t = await res.json().catch(() => ({})); throw new Error(t.error?.message || `HTTP ${res.status}`); }
      const data = await res.json();
      // Parse response - different format per provider
      const rawText = isGPT
        ? (data.choices?.[0]?.message?.content || "")
        : (data.content?.[0]?.text || "");

      // Parse answer and confidence
      // Expected format: "ABC123\n85" or "ABC123\n85%" or just "ABC123"
      const lines = rawText.trim().split('\n');
      const answerLine = lines[0] || '';
      const confidenceLine = lines[1] || '';

      // Extract just alphanumeric characters from first line
      const raw = answerLine.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

      // If response is too long (AI gave explanation), try to find 6-char sequence
      let finalAnswer = raw;
      if (raw.length > 6) {
        console.warn(`[ClaudeSC] Response too long (${raw.length} chars): ${raw.substring(0, 50)}...`);
        // Try to extract first valid 6-char sequence
        for (let i = 0; i <= raw.length - 6; i++) {
          const candidate = raw.substring(i, i + 6);
          if (/^[A-Z0-9]{6}$/.test(candidate)) {
            finalAnswer = candidate;
            console.log(`[ClaudeSC] Extracted 6-char sequence: ${finalAnswer}`);
            break;
          }
        }
        if (finalAnswer.length !== 6) {
          finalAnswer = raw.substring(0, 6); // Just take first 6 as fallback
          console.warn(`[ClaudeSC] Using first 6 chars as fallback: ${finalAnswer}`);
        }
      }

      if (finalAnswer.length !== 6) {
        throw new Error(`${isGPT ? 'GPT' : 'Claude'} didn't return valid 6 chars. Got: "${raw.substring(0, 100)}"`);
      }

      // Parse confidence (default to 50 if not provided or unparseable)
      let confidence = 50;
      const confMatch = confidenceLine.match(/(\d+)/);
      if (confMatch) {
        confidence = Math.min(100, Math.max(0, parseInt(confMatch[1])));
      }

      console.log(`[ClaudeSC] Solution: ${finalAnswer}, Confidence: ${confidence}%`);
      return { solution: finalAnswer, confidence: confidence };
    }

    // Extract specific positions from modal text (same logic as CapSolver)
    function extractPositions(modalText) {
      const positions = new Set();
      const lowerText = modalText.toLowerCase();

      // Check if asking for full code
      const wantsFullCode = /enter\s+(?:the\s+)?(?:full\s+)?6[- ]?character\s+code/i.test(modalText) ||
                            /enter\s+(?:the\s+)?(?:full\s+)?code\s+shown/i.test(modalText) ||
                            /enter\s+(?:the\s+)?(?:entire|complete|whole|full)/i.test(modalText);
      if (wantsFullCode) return null; // null = use full solution

      // Single position: "Enter the 4th character"
      const singlePos = /(?:enter\s+)?(?:the\s+)?(\d)(?:st|nd|rd|th)\s+character/gi;
      let m;
      while ((m = singlePos.exec(modalText)) !== null) {
        const n = parseInt(m[1]);
        if (n >= 1 && n <= 6) positions.add(n);
      }

      // "character X" or "character #X"
      const charNum = /character\s*#?\s*(\d)/gi;
      while ((m = charNum.exec(modalText)) !== null) {
        const n = parseInt(m[1]);
        if (n >= 1 && n <= 6) positions.add(n);
      }

      // "Enter characters 2, 4 and 6" or "characters 1, 3, 5 from the code"
      const charactersPattern = /(?:enter\s+)?characters?\s+(\d)(?:[,\s]+(?:and\s+)?(\d))*(?:\s+(?:from|of))?/gi;
      while ((m = charactersPattern.exec(modalText)) !== null) {
        const allDigits = m[0].match(/\b(\d)\b/g) || [];
        for (const d of allDigits) {
          const n = parseInt(d);
          if (n >= 1 && n <= 6) positions.add(n);
        }
      }

      // Ordinal: "1st, 3rd, and 6th"
      const ordinals = /(\d)(?:st|nd|rd|th)/gi;
      while ((m = ordinals.exec(modalText)) !== null) {
        const n = parseInt(m[1]);
        if (n >= 1 && n <= 6) positions.add(n);
      }

      // Word forms: "first", "third", etc.
      const wordMap = { 'first':1,'second':2,'third':3,'fourth':4,'fifth':5,'sixth':6 };
      const wordPat = /(first|second|third|fourth|fifth|sixth)/gi;
      while ((m = wordPat.exec(lowerText)) !== null) {
        const ctx = lowerText.substring(Math.max(0,m.index-30), Math.min(lowerText.length, m.index+m[0].length+30));
        if (ctx.includes('character')) {
          const n = wordMap[m[1].toLowerCase()];
          if (n) positions.add(n);
        }
      }

      if (positions.size > 0 && positions.size < 6) return Array.from(positions).sort((a,b) => a-b);
      return null; // use full solution
    }

    // Hook into the SC solving flow — intercept botcheck modal
    function getSolverChoice() {
      try { return localStorage.getItem(SOLVER_KEY) || "capsolver"; } catch { return "capsolver"; }
    }
    function setSolverChoice(v) {
      try { localStorage.setItem(SOLVER_KEY, v); } catch {}
    }
    function getModelChoice() {
      try { return localStorage.getItem(MODEL_KEY) || "haiku"; } catch { return "haiku"; }
    }
    function setModelChoice(v) {
      try { localStorage.setItem(MODEL_KEY, v); } catch {}
    }

    let claudeSolveInProgress = false;
    let claudeLastAttempt = 0;
    const CLAUDE_MIN_INTERVAL = 8000;

    async function autoSolveWithClaude() {
      const choice = getSolverChoice();
      if (choice !== "claude") return;
      const modelChoice = getModelChoice();
      const isGPTModel = modelChoice === 'gpt52';
      const key = isGPTModel ? localStorage.getItem(OPENAI_KEY) : localStorage.getItem(AI_KEY);
      if (!key) return;

      const now = Date.now();
      if (now - claudeLastAttempt < CLAUDE_MIN_INTERVAL) return;
      if (claudeSolveInProgress) return;

      const modal = document.getElementById("botcheck-modal");
      if (!modal || !modal.classList.contains("flex")) return;

      const captchaImg = modal.querySelector("[data-botcheck-image]");
      if (!captchaImg || !captchaImg.complete || !captchaImg.naturalWidth) return;

      const timerEl = modal.querySelector("[data-botcheck-timer]");
      const modalText = modal.textContent || "";
      if (!timerEl && !/time\s*left/i.test(modalText)) return;

      try {
        claudeSolveInProgress = true;
        claudeLastAttempt = now;
        scNotificationFailDetected = false; // Reset failure flag for this attempt
        scNotificationFailText = '';
        console.log("[ClaudeSC] Starting auto-solve...");

        // Capture RAW image first (Claude vision works best with raw)
        let rawBase64 = '';
        try {
          const rawCanvas = document.createElement("canvas");
          const scale = 3; // 3x upscale for raw image
          rawCanvas.width = captchaImg.naturalWidth * scale;
          rawCanvas.height = captchaImg.naturalHeight * scale;
          const rawCtx = rawCanvas.getContext("2d");
          rawCtx.imageSmoothingEnabled = true;
          rawCtx.imageSmoothingQuality = 'high';
          rawCtx.drawImage(captchaImg, 0, 0, rawCanvas.width, rawCanvas.height);
          rawBase64 = rawCanvas.toDataURL("image/png").split(",")[1];
          console.log("[ClaudeSC] Raw image captured, size:", rawBase64.length);
        } catch {}

        // Also get preprocessed image as fallback
        let base64 = '';
        try {
          if (typeof preprocessCaptchaImage === "function") {
            const preprocessResult = preprocessCaptchaImage(captchaImg);
            base64 = preprocessResult?.base64 || '';
            console.log("[ClaudeSC] Preprocessed image ready");
          }
        } catch {}

        if (!base64 || base64.length < 100) {
          const canvas = document.createElement("canvas");
          canvas.width = captchaImg.naturalWidth;
          canvas.height = captchaImg.naturalHeight;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(captchaImg, 0, 0);
          base64 = canvas.toDataURL("image/png").split(",")[1];
        }

        const bestImg = rawBase64 && rawBase64.length > 100 ? rawBase64 : base64;
        if (!bestImg || bestImg.length < 100) {
          console.log("[ClaudeSC] Failed to capture image");
          claudeSolveInProgress = false;
          return;
        }

        // Model selection
        const modelChoice = getModelChoice();
        const modelMap = {
          'haiku': 'claude-haiku-4-5-20251001',
          'sonnet': 'claude-sonnet-4-5-20250929',
          'gpt52': 'gpt-5.2'
        };
        const modelId = modelMap[modelChoice] || modelMap.haiku;
        const NUM_ATTEMPTS = 1; // Single attempt - no voting
        console.log(`[ClaudeSC] Using ${modelChoice} (${modelId}), 1 attempt (simplified mode)`);

        // VOTING: All models use 3 votes for fair comparison testing
        // Early exit if 2 agree (majority achieved)
        // Now with CONFIDENCE SCORING for all modes
        const solutions = [];
        const confidences = [];
        let lowestConfidence = 100;

        for (let i = 1; i <= NUM_ATTEMPTS; i++) {
          try {
            const result = await solveWithClaude(base64, rawBase64, modelId);
            console.log(`[ClaudeSC] Attempt ${i}/${NUM_ATTEMPTS}: ${result.solution} (confidence: ${result.confidence}%)`);
            if (result.solution && result.solution.length === 6) {
              solutions.push(result.solution);
              confidences.push(result.confidence);
              lowestConfidence = Math.min(lowestConfidence, result.confidence);
            }
            // Early exit if 2 votes agree (majority achieved in 3-vote system)
            if (i === 2 && solutions.length === 2 && solutions[0] === solutions[1]) {
              console.log(`[ClaudeSC] First 2 votes agree, skipping 3rd`);
              break;
            }
          } catch (e) {
            console.log(`[ClaudeSC] Attempt ${i} failed:`, e.message);
          }
        }

        if (solutions.length === 0) throw new Error("All solve attempts failed");

        // AUTO-REFRESH DISABLED - was causing infinite loops
        // Just submit whatever the votes agree on
        const CONFIDENCE_THRESHOLD = 0; // Disabled (set to 0 = never refresh)
        const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

        console.log(`[ClaudeSC] Confidence stats: lowest=${lowestConfidence}%, avg=${avgConfidence.toFixed(0)}%, threshold=${CONFIDENCE_THRESHOLD}%`);

        if (lowestConfidence < CONFIDENCE_THRESHOLD) {
          const refreshBtn = modal.querySelector("[data-botcheck-refresh]");
          if (refreshBtn && typeof refreshBtn.click === 'function') {
            console.log(`[ClaudeSC] ⚠️ Low confidence (${lowestConfidence}%) - auto-refreshing for clearer captcha...`);
            try {
              window.gameNotifications?.show?.(`🔄 Claude SC: Low confidence (${lowestConfidence}%) - refreshing`);
            } catch {}
            claudeSolveInProgress = false;
            await new Promise(r => setTimeout(r, 500));
            refreshBtn.click();
            return;
          } else {
            console.log(`[ClaudeSC] ⚠️ Low confidence but refresh button not found - proceeding with ${lowestConfidence}% confidence`);
          }
        }

        // Pick most common answer for multi-vote, or use the single answer for 1-shot
        const counts = {};
        for (const s of solutions) counts[s] = (counts[s] || 0) + 1;
        let solution = solutions[0];
        let maxCount = 0;
        for (const [s, count] of Object.entries(counts)) {
          if (count > maxCount) { maxCount = count; solution = s; }
        }

        // If no majority and we have multiple solutions, do per-character voting (fallback)
        if (maxCount === 1 && solutions.length >= 3) {
          console.log("[ClaudeSC] No majority - using per-character voting");
          let charVoted = '';
          for (let pos = 0; pos < 6; pos++) {
            const charCounts = {};
            for (const s of solutions) {
              const c = s[pos];
              charCounts[c] = (charCounts[c] || 0) + 1;
            }
            let bestChar = solutions[0][pos];
            let bestCharCount = 0;
            for (const [c, cnt] of Object.entries(charCounts)) {
              if (cnt > bestCharCount) { bestCharCount = cnt; bestChar = c; }
            }
            charVoted += bestChar;
          }
          console.log(`[ClaudeSC] Per-char voting: ${solutions.join(' / ')} → ${charVoted}`);
          solution = charVoted;
        }

        console.log(`[ClaudeSC] Winner: ${solution} (${maxCount}/${solutions.length} votes, ${avgConfidence.toFixed(0)}% avg confidence)`);

        // Check if modal asks for specific positions
        const modalFullText = modal.textContent || modal.innerText || '';
        const positions = extractPositions(modalFullText);
        let finalAnswer = solution;

        if (positions) {
          finalAnswer = positions.map(pos => solution[pos - 1]).join('');
          console.log(`[ClaudeSC] Extracting positions ${positions.join(',')} from "${solution}" = "${finalAnswer}"`);
        } else {
          console.log("[ClaudeSC] Using full 6-character solution");
        }

        // Save context for failure review (consumed by recordSecurityCheckResult)
        lastSCImageBase64 = base64 || bestImg; // processed
        lastSCImageRawBase64 = rawBase64 || ''; // raw
        lastSCModalText = modalFullText.substring(0, 300);
        lastSCFullSolution = solution;
        lastSCPositions = positions || null;

        // Human delay 5-8 seconds
        const delay = Math.floor(Math.random() * 3000) + 5000;
        console.log(`[ClaudeSC] Waiting ${(delay/1000).toFixed(1)}s (human delay)...`);
        await new Promise(r => setTimeout(r, delay));

        // Submit the answer
        const input = modal.querySelector("[data-botcheck-input]");
        const submitBtn = modal.querySelector("[data-botcheck-submit]");
        if (!input) { console.log("[ClaudeSC] Input not found"); claudeSolveInProgress = false; return; }

        // Set value with React-compatible methods
        try {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(input, finalAnswer);
        } catch (e) {
          input.value = finalAnswer;
        }
        input.focus();
        input.dispatchEvent(new Event('focus', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.setAttribute('value', finalAnswer);

        // (Claude solver handles its own result detection — no recordSecurityCheckAttempt needed)
        const submitTimestamp = Date.now();

        // ===== PRE-SUBMISSION CHECKS =====
        // Verify the modal is still open and timer hasn't expired during our solve
        const modalStillOpen = modal.classList.contains('flex') && !modal.classList.contains('hidden');
        if (!modalStillOpen || scNotificationFailDetected) {
          console.log(`[ClaudeSC] ⚠️ Cannot submit — ${scNotificationFailDetected ? 'failure notification detected: ' + scNotificationFailText : 'modal closed (timer expired)'}`);
          // Record as failure with saved images
          const scStats = loadCapSolverStats();
          scStats.rejected = (scStats.rejected || 0) + 1;
          if (!scStats.history) scStats.history = [];
          scStats.history.unshift({ answer: finalAnswer, passed: false, auto: true, time: 0, at: Date.now(), reason: 'timer_expired' });
          if (scStats.history.length > 20) scStats.history.length = 20;
          saveCapSolverStats(scStats);
          try {
            saveFailedSCAttempt(lastSCImageBase64, lastSCImageRawBase64, lastSCModalText, finalAnswer, lastSCFullSolution, lastSCPositions);
          } catch (e) { console.warn('[ClaudeSC] Could not save failed image:', e.message); }
          try { window.gameNotifications?.show?.('\u274C Claude SC: Timer expired during solve — saved for review'); } catch {}
          lastSCImageBase64 = ''; lastSCImageRawBase64 = ''; lastSCModalText = ''; lastSCFullSolution = ''; lastSCPositions = null;
          scNotificationFailDetected = false; scNotificationFailText = '';
          claudeSolveInProgress = false;
          return;
        }

        // Press Enter after a short pause
        await new Promise(r => setTimeout(r, 500));
        input.focus();
        input.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true }));
        console.log("[ClaudeSC] Submitted:", finalAnswer);

        // ===== DIRECT RESULT DETECTION =====
        // Poll for pass/fail instead of relying on observers which miss failures.
        // Capture state before we poll so we can detect changes.
        const captchaImgEl = modal.querySelector("[data-botcheck-image]");
        const captchaImgSrcBefore = captchaImgEl ? captchaImgEl.src : '';
        const errorEl = modal.querySelector("[data-botcheck-error]");
        const toastTextEl = document.getElementById("notification-toast-text");
        const toastEl = document.getElementById("notification-toast");

        let detected = null; // 'pass' | 'fail' | null
        const POLL_INTERVAL = 500;
        const POLL_TIMEOUT = 10000;
        const pollStart = Date.now();

        while (!detected && (Date.now() - pollStart) < POLL_TIMEOUT) {
          await new Promise(r => setTimeout(r, POLL_INTERVAL));

          // Check 0 (HIGHEST PRIORITY): Notification interceptor caught a failure message
          if (scNotificationFailDetected) {
            detected = 'fail';
            console.log("[ClaudeSC-Detect] Notification interceptor: " + scNotificationFailText + " → FAIL");
            break;
          }

          // Check 1: Error element visible with text → FAIL (wrong answer)
          if (errorEl) {
            const errText = (errorEl.textContent || '').trim();
            const errVisible = !errorEl.classList.contains('hidden') && errText.length > 0;
            if (errVisible) {
              detected = 'fail';
              console.log("[ClaudeSC-Detect] Error element visible:", errText, "→ FAIL");
              break;
            }
          }

          // Check 2: Notification toast says "failed" or "security check" → FAIL (timeout or rejection)
          if (toastEl && toastTextEl && !toastEl.classList.contains('hidden')) {
            const toastText = (toastTextEl.textContent || '').toLowerCase();
            if (toastText.includes('fail') || (toastText.includes('security check') && !toastText.includes('passed')) || toastText.includes('incorrect') || toastText.includes('wrong')) {
              detected = 'fail';
              console.log("[ClaudeSC-Detect] Toast notification:", toastTextEl.textContent, "→ FAIL");
              break;
            }
          }

          // Check 3: Captcha image src changed (new captcha loaded after rejection) → FAIL
          if (captchaImgEl && captchaImgSrcBefore) {
            const currentSrc = captchaImgEl.src || '';
            if (currentSrc && currentSrc !== captchaImgSrcBefore) {
              detected = 'fail';
              console.log("[ClaudeSC-Detect] Captcha image changed → FAIL (new captcha loaded)");
              break;
            }
          }

          // Check 4: Modal closed → PASS (only if no failure signals above)
          const modalVisible = modal.classList.contains('flex') && !modal.classList.contains('hidden');
          if (!modalVisible) {
            detected = 'pass';
            console.log("[ClaudeSC-Detect] Modal closed → PASS");
            break;
          }
        }

        // If polling timed out, assume fail
        if (!detected) {
          detected = 'fail';
          console.log("[ClaudeSC-Detect] Poll timed out after " + POLL_TIMEOUT + "ms → assuming FAIL");
        }

        // Record the result directly
        const scStats = loadCapSolverStats();
        scStats.solves = (scStats.solves || 0) + 1;
        scStats.lastSolvedAt = Date.now();
        scStats.lastAttemptAnswer = finalAnswer;

        const timeTaken = Date.now() - submitTimestamp;

        if (detected === 'pass') {
          scStats.passed = (scStats.passed || 0) + 1;
          if (!scStats.history) scStats.history = [];
          scStats.history.unshift({ answer: finalAnswer, passed: true, auto: true, time: timeTaken, at: Date.now() });
          if (scStats.history.length > 20) scStats.history.length = 20;
          saveCapSolverStats(scStats);
          console.log("[ClaudeSC] ✅ PASSED!", finalAnswer);
          try { window.gameNotifications?.show?.('\u2714 Claude SC: PASSED! (' + solution + (positions ? ' \u2192 ' + finalAnswer : '') + ')'); } catch {}
        } else {
          scStats.rejected = (scStats.rejected || 0) + 1;
          if (!scStats.history) scStats.history = [];
          scStats.history.unshift({ answer: finalAnswer, passed: false, auto: true, time: timeTaken, at: Date.now() });
          if (scStats.history.length > 20) scStats.history.length = 20;
          saveCapSolverStats(scStats);
          console.log("[ClaudeSC] ❌ FAILED!", finalAnswer);
          // Save failed attempt with image for human review
          try {
            saveFailedSCAttempt(
              lastSCImageBase64, lastSCImageRawBase64, lastSCModalText,
              finalAnswer, lastSCFullSolution, lastSCPositions
            );
          } catch (e) { console.warn('[ClaudeSC] Could not save failed image:', e.message); }
          try { window.gameNotifications?.show?.('\u274C Claude SC: FAILED (' + finalAnswer + ') — saved for review'); } catch {}
        }

        // Reset temp vars
        lastSCImageBase64 = '';
        lastSCImageRawBase64 = '';
        lastSCModalText = '';
        lastSCFullSolution = '';
        lastSCPositions = null;
        scNotificationFailDetected = false;
        scNotificationFailText = '';

      } catch (e) {
        console.error("[ClaudeSC] Error:", e);
        const scStats = loadCapSolverStats();
        scStats.failures = (scStats.failures || 0) + 1;
        saveCapSolverStats(scStats);
      } finally {
        claudeSolveInProgress = false;
      }
    }

    // Poll for SC modal when Claude solver is selected
    setInterval(() => {
      if (getSolverChoice() === "claude") autoSolveWithClaude();
    }, 2000);

    // ── UI Panel ──
    function createPanel() {
      if (panel) return;
      panel = document.createElement("div");
      panel.id = "oa-stat-analyzer-v3";
      panel.style.cssText = `
        position: fixed; top: 10px; right: 10px; width: 320px; max-height: 85vh;
        background: rgba(15,15,25,0.97); border: 1px solid rgba(212,175,55,0.4);
        border-radius: 8px; font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px;
        color: #e5e5e5; z-index: 99999; box-shadow: 0 4px 24px rgba(0,0,0,0.6);
        display: ${isVisible ? "flex" : "none"}; flex-direction: column; overflow: hidden;
      `;
      panel.innerHTML = `
        <style>
          #oa-stat-analyzer-v3 .sa-hdr { display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:rgba(212,175,55,0.15); border-bottom:1px solid rgba(212,175,55,0.3); cursor:move; flex-shrink:0; }
          #oa-stat-analyzer-v3 .sa-title { font-weight:700; color:#d4af37; font-size:12px; }
          #oa-stat-analyzer-v3 .sa-btn { background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:#ccc; padding:2px 6px; border-radius:3px; cursor:pointer; font-size:10px; }
          #oa-stat-analyzer-v3 .sa-btn:hover { background:rgba(212,175,55,0.3); color:#fff; }
          #oa-stat-analyzer-v3 .sa-body { overflow-y:auto; padding:8px 10px; flex:1; }
          #oa-stat-analyzer-v3 .sa-sect { margin-bottom:6px; padding:5px 7px; background:rgba(0,0,0,0.3); border-radius:5px; border:1px solid rgba(255,255,255,0.06); }
          #oa-stat-analyzer-v3 .sa-sect-title { font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:#94a3b8; font-weight:600; margin-bottom:3px; }
          #oa-stat-analyzer-v3 .sa-row { display:flex; justify-content:space-between; padding:1px 0; font-size:11px; }
          #oa-stat-analyzer-v3 .sa-bar { height:4px; background:rgba(255,255,255,0.08); border-radius:2px; margin:1px 0; overflow:hidden; }
          #oa-stat-analyzer-v3 .sa-fill { height:100%; border-radius:2px; transition:width 0.3s; }
          #oa-stat-analyzer-v3 .sa-rec { margin:3px 0; padding:5px 7px; border-radius:4px; border:1px solid rgba(255,255,255,0.1); }
          #oa-stat-analyzer-v3 .sa-ai-box { background:rgba(139,92,246,0.1); border:1px solid rgba(139,92,246,0.3); border-radius:4px; padding:8px; margin-top:6px; font-size:10px; max-height:200px; overflow-y:auto; white-space:pre-wrap; display:none; }
        </style>
        <div class="sa-hdr">
          <span class="sa-title">\u2694\uFE0F Stat Analyzer</span>
          <div style="display:flex;gap:3px;">
            <button class="sa-btn" id="sa3-ai" title="Claude AI Analysis">\uD83E\uDD16 AI</button>
            <button class="sa-btn" id="sa3-scan" title="Deep Scan - Analyze all game code">\uD83D\uDD0D Scan</button>
            <button class="sa-btn" id="sa3-refresh" title="Refresh">\uD83D\uDD04</button>
            <button class="sa-btn" id="sa3-reset" title="Reset stats">\u21BA</button>
            <button class="sa-btn" id="sa3-close" title="Close">\u2715</button>
          </div>
        </div>
        <div class="sa-body" id="sa3-body"></div>
      `;
      document.body.appendChild(panel);

      // Drag
      let drag=false, dx=0, dy=0;
      panel.querySelector(".sa-hdr").onmousedown = e => {
        if (e.target.classList.contains("sa-btn")) return;
        drag=true; dx=e.clientX-panel.offsetLeft; dy=e.clientY-panel.offsetTop;
      };
      document.addEventListener("mousemove", e => { if(drag){ panel.style.left=(e.clientX-dx)+"px"; panel.style.top=(e.clientY-dy)+"px"; panel.style.right="auto"; }});
      document.addEventListener("mouseup", ()=>{ drag=false; });

      document.getElementById("sa3-close").onclick = () => togglePanel(false);
      document.getElementById("sa3-refresh").onclick = refreshPanel;
      document.getElementById("sa3-reset").onclick = () => {
        if (confirm("Reset all combat stats?")) { all=defaults(); sess=defaults(); save(all); refreshPanel(); }
      };
      document.getElementById("sa3-ai").onclick = async () => {
        const btn = document.getElementById("sa3-ai");
        btn.textContent = "\u23F3";
        const result = await aiAnalyze();
        btn.textContent = "\uD83E\uDD16 AI";
        let aiBox = document.getElementById("sa3-ai-box");
        if (!aiBox) {
          aiBox = document.createElement("div");
          aiBox.id = "sa3-ai-box";
          aiBox.className = "sa-ai-box";
          document.getElementById("sa3-body").appendChild(aiBox);
        }
        aiBox.style.display = "block";
        aiBox.textContent = result.error ? "Error: " + result.error : result.analysis;
      };
      document.getElementById("sa3-scan").onclick = async () => {
        const btn = document.getElementById("sa3-scan");
        if (!confirm("Deep Scan v2 — 3-pass analysis:\n• Pass 1: Combat mechanics (~$0.10)\n• Pass 2: Game systems (~$0.10)\n• Pass 3: Script improvements (~$0.10)\n\nTotal: ~$0.30. Takes 2-3 minutes.\nResults cache — won't re-run completed passes.\n\nContinue?")) return;
        btn.textContent = "\u23F3";
        btn.disabled = true;
        let aiBox = document.getElementById("sa3-ai-box");
        if (!aiBox) {
          aiBox = document.createElement("div");
          aiBox.id = "sa3-ai-box";
          aiBox.className = "sa-ai-box";
          document.getElementById("sa3-body").appendChild(aiBox);
        }
        aiBox.style.display = "block";
        aiBox.style.maxHeight = "400px";
        aiBox.textContent = "Starting 3-pass deep scan...\nPass 1: Combat mechanics analysis...\n(Check console for detailed progress)";
        try {
          const results = await deepScan();
          if (results.error) {
            aiBox.textContent = "Error: " + results.error;
          } else {
            aiBox.textContent = "═══ PASS 1: Combat Mechanics ═══\n" + (results.pass1?.text || "(cached)").substring(0, 2000) + "\n\n═══ PASS 2: Game Systems ═══\n" + (results.pass2?.text || "(cached)").substring(0, 2000) + "\n\n═══ PASS 3: Script Improvements ═══\n" + (results.pass3?.text || "(cached)");
          }
        } catch (e) {
          aiBox.textContent = "Scan error: " + e.message;
        }
        btn.textContent = "\uD83D\uDD0D Scan";
        btn.disabled = false;
      };
    }

    function togglePanel(show) {
      isVisible = typeof show === "boolean" ? show : !isVisible;
      try { localStorage.setItem(PANEL_VIS_KEY, isVisible ? "1" : "0"); } catch {}
      if (!panel) createPanel();
      panel.style.display = isVisible ? "flex" : "none";
      if (isVisible) refreshPanel();
    }

    function refreshPanel() {
      const body = document.getElementById("sa3-body");
      if (!body) return;
      const { recs, stats, metrics: m, total } = recommend();
      const noStats = total === 0;
      const noData = all.attacks < 5;

      let html = "";

      // ── Stats Section ──
      html += `<div class="sa-sect"><div class="sa-sect-title">Your Stats (Lv.${stats.level})${stats.statPoints > 0 ? ` \u2014 <span style="color:#4ade80;font-weight:700">${stats.statPoints} pts!</span>` : ""}</div>`;
      if (noStats) {
        html += `<div style="color:#f59e0b;font-size:10px;">\u26A0 Can't read stats. Make sure you're on the combat page.</div>`;
      } else {
        const statDefs = [
          { key:"dur", label:"DUR", desc:"HP/Def", color:"#ef4444" },
          { key:"str", label:"STR", desc:"Phys Dmg", color:"#f97316" },
          { key:"dex", label:"DEX", desc:"Ranged", color:"#eab308" },
          { key:"con", label:"CON", desc:"Accuracy", color:"#3b82f6" },
          { key:"agi", label:"AGI", desc:"Speed", color:"#22d3ee" },
          { key:"int", label:"INT", desc:"Magic Dmg", color:"#a855f7" },
          { key:"per", label:"PER", desc:"Crit", color:"#f59e0b" }
        ];
        for (const sd of statDefs) {
          const v = stats[sd.key];
          const w = total > 0 ? Math.min(100, (v / total * 100)) : 0;
          html += `<div class="sa-row"><span style="color:${sd.color};font-weight:600;">${sd.label}</span><span>${fmt(v)} <span style="color:#475569;font-size:10px;">${sd.desc} (${w.toFixed(0)}%)</span></span></div>`;
          html += `<div class="sa-bar"><div class="sa-fill" style="width:${w}%;background:${sd.color};"></div></div>`;
        }
        html += `<div style="text-align:right;font-size:10px;color:#475569;margin-top:2px;">Total: ${fmt(total)} | HP: ${fmt(stats.hp)}/${fmt(stats.maxHp)}</div>`;
      }
      html += `</div>`;

      // ── Performance Section ──
      html += `<div class="sa-sect"><div class="sa-sect-title">Combat Performance (${fmt(all.attacks)} attacks)</div>`;
      if (noData) {
        html += `<div style="color:#94a3b8;">Fight some monsters to collect data!</div>`;
      } else {
        const perfBar = (label, val, color) => {
          const w = Math.min(100, val);
          let c = val >= 90 ? "#22c55e" : val >= 75 ? "#fbbf24" : "#ef4444";
          if (label.includes("Crit")) c = val >= 25 ? "#22c55e" : val >= 12 ? "#fbbf24" : "#ef4444";
          return `<div class="sa-row"><span>${label}</span><span style="color:${c};font-weight:600;">${pct(val)}</span></div><div class="sa-bar"><div class="sa-fill" style="width:${w}%;background:${c};"></div></div>`;
        };
        html += perfBar("Accuracy (CON\u2192)", m.accuracy);
        html += perfBar("Crit Rate (PER\u2192)", m.critRate);
        html += perfBar("Survival (DUR\u2192)", m.survivalRate);
        html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:1px 6px;margin-top:3px;font-size:10px;">
          <div>Avg Hit: <b style="color:#a78bfa">${fmt(m.avgDmg)}</b></div>
          <div>Avg Crit: <b style="color:#fbbf24">${fmt(m.avgCrit)}</b></div>
          <div>Avg Norm: <b>${fmt(m.avgNormal)}</b></div>
          <div>Crit x<b style="color:#fb923c">${m.critMult>0?m.critMult.toFixed(2):"?"}</b></div>
          <div>Kills: <b style="color:#4ade80">${fmt(all.kills)}</b></div>
          <div>Deaths: <b style="color:#ef4444">${fmt(all.deaths)}</b></div>
        </div>`;
        if (sess.attacks >= 5) {
          const sm = metrics(sess);
          html += `<div style="border-top:1px solid rgba(255,255,255,0.06);margin-top:3px;padding-top:3px;font-size:10px;color:#64748b;">Session (${sess.attacks}): ${pct(sm.accuracy)} acc | ${pct(sm.critRate)} crit | ${fmt(sess.kills)} kills</div>`;
        }
      }
      html += `</div>`;

      // ── Gold & Exp Rates ──
      let rates = { xpPerHour: 0, goldPerHour: 0 };
      let hudTrack = null;
      try {
        if (typeof window.__oaGetRates === 'function') {
          rates = window.__oaGetRates();
        }
        if (window.__oaHudTrack) {
          hudTrack = window.__oaHudTrack;
        }
      } catch {}

      const hasRateData = rates.xpPerHour > 0 || rates.goldPerHour > 0;

      html += `<div class="sa-sect"><div class="sa-sect-title">💰 Gold & Exp/Hour</div>`;

      if (!hasRateData) {
        html += `<div style="color:#94a3b8;font-size:10px;">
          Fight for a few minutes to calculate rates.<br>
          <span style="color:#64748b;font-size:9px;">Rates based on active combat time (excludes teleports/map time).</span>
        </div>`;
      } else {
        const formatRate = (val) => {
          if (val >= 1000000) return (val / 1000000).toFixed(2) + 'M';
          if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
          return val.toFixed(0);
        };

        const xpRate = rates.xpPerHour;
        const goldRate = rates.goldPerHour;

        // Calculate bar widths (relative to each other, max gets 100%)
        const maxRate = Math.max(xpRate, goldRate);
        const xpBarWidth = maxRate > 0 ? Math.min(100, (xpRate / maxRate) * 100) : 0;
        const goldBarWidth = maxRate > 0 ? Math.min(100, (goldRate / maxRate) * 100) : 0;

        html += `<div style="margin-bottom:6px;">
          <div class="sa-row"><span style="color:#a78bfa;font-weight:600;">⭐ Exp/Hour</span><span style="color:#a78bfa;font-weight:700;">${formatRate(xpRate)}</span></div>
          <div class="sa-bar"><div class="sa-fill" style="width:${xpBarWidth}%;background:#a78bfa;"></div></div>
        </div>`;

        html += `<div style="margin-bottom:6px;">
          <div class="sa-row"><span style="color:#fbbf24;font-weight:600;">💰 Gold/Hour</span><span style="color:#fbbf24;font-weight:700;">${formatRate(goldRate)}</span></div>
          <div class="sa-bar"><div class="sa-fill" style="width:${goldBarWidth}%;background:#fbbf24;"></div></div>
        </div>`;

        // Show total gains
        if (hudTrack) {
          const totalXp = hudTrack.xpGain || 0;
          const totalGold = hudTrack.goldGain || 0;
          const activeMinutes = (hudTrack.activeMsTotal || 0) / 60000;

          if (activeMinutes > 0) {
            html += `<div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:6px;margin-top:2px;font-size:10px;color:#94a3b8;">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px 6px;">
                <div>Active Time: <b style="color:#cbd5e1;">${activeMinutes.toFixed(1)}m</b></div>
                <div>Total XP: <b style="color:#a78bfa;">${formatRate(totalXp)}</b></div>
                <div></div>
                <div>Total Gold: <b style="color:#fbbf24;">${formatRate(totalGold)}</b></div>
              </div>
            </div>`;
          }
        }

        html += `<div style="font-size:9px;color:#64748b;margin-top:3px;">Based on last 15 min of active combat</div>`;
      }
      html += `</div>`;

      // ── Auto Speed Comparison ──
      const gameStats = getPerformanceStats('game');
      const scriptStats = getPerformanceStats('script');
      const hasGameData = gameStats.totalActions > 0;
      const hasScriptData = scriptStats.totalActions > 0;
      const hasBothData = hasGameData && hasScriptData;

      html += `<div class="sa-sect"><div class="sa-sect-title">⚡ Auto Speed Comparison</div>`;

      if (!hasGameData && !hasScriptData) {
        html += `<div style="color:#94a3b8;font-size:10px;">
          Turn on Game Auto (F3) or Script Auto (F1) to measure speed.<br>
          <span style="color:#64748b;font-size:9px;">Stats reset when you refresh the page.</span>
        </div>`;
      } else {
        // Game Auto Stats
        if (hasGameData) {
          const aps = gameStats.actionsPerSecond.toFixed(2);
          const avgTime = gameStats.avgTimePerAction.toFixed(0);
          html += `<div style="margin-bottom:6px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">
              <span style="color:#3b82f6;font-weight:600;">📊 Game Auto</span>
              <span style="color:#94a3b8;">${gameStats.totalActions} actions</span>
            </div>
            <div class="sa-row"><span>Actions/Second</span><span style="color:#3b82f6;font-weight:700;">${aps}</span></div>
            <div class="sa-bar"><div class="sa-fill" style="width:100%;background:#3b82f6;"></div></div>
            <div style="font-size:10px;color:#64748b;margin-top:1px;">Avg: ${avgTime}ms/action | Range: ${gameStats.minTime.toFixed(0)}-${gameStats.maxTime.toFixed(0)}ms</div>
          </div>`;
        }

        // Script Auto Stats
        if (hasScriptData) {
          const aps = scriptStats.actionsPerSecond.toFixed(2);
          const avgTime = scriptStats.avgTimePerAction.toFixed(0);
          const speedPct = hasGameData ? (scriptStats.actionsPerSecond / gameStats.actionsPerSecond * 100).toFixed(1) : 100;
          const barWidth = hasGameData ? Math.min(100, parseFloat(speedPct)) : 100;

          html += `<div style="margin-bottom:6px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">
              <span style="color:#8b5cf6;font-weight:600;">⚡ Script Auto</span>
              <span style="color:#94a3b8;">${scriptStats.totalActions} actions</span>
            </div>
            <div class="sa-row"><span>Actions/Second</span><span style="color:#8b5cf6;font-weight:700;">${aps}</span></div>
            <div class="sa-bar"><div class="sa-fill" style="width:${barWidth}%;background:#8b5cf6;"></div></div>
            <div style="font-size:10px;color:#64748b;margin-top:1px;">Avg: ${avgTime}ms/action | Range: ${scriptStats.minTime.toFixed(0)}-${scriptStats.maxTime.toFixed(0)}ms</div>
          </div>`;
        }

        // Comparison
        if (hasBothData) {
          const speedRatio = (scriptStats.actionsPerSecond / gameStats.actionsPerSecond) * 100;
          const timeDiff = scriptStats.avgTimePerAction - gameStats.avgTimePerAction;
          let statusColor, statusIcon, statusMsg;

          if (speedRatio >= 95) {
            statusColor = "#22c55e";
            statusIcon = "✅";
            statusMsg = "Virtually identical!";
          } else if (speedRatio >= 90) {
            statusColor = "#22c55e";
            statusIcon = "✅";
            statusMsg = "Very close - barely noticeable";
          } else if (speedRatio >= 80) {
            statusColor = "#fbbf24";
            statusIcon = "⚠️";
            statusMsg = "Noticeable but minor difference";
          } else {
            statusColor = "#ef4444";
            statusIcon = "⚠️";
            statusMsg = "Check stealth preset";
          }

          html += `<div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:6px;margin-top:2px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">
              <span style="color:#94a3b8;">Script is <b style="color:${statusColor}">${speedRatio.toFixed(1)}%</b> of game auto</span>
              <span style="color:${statusColor};">${statusIcon}</span>
            </div>
            <div style="font-size:10px;color:#cbd5e1;">Script adds <b style="color:#f59e0b">${timeDiff.toFixed(0)}ms</b> overhead per action</div>
            <div style="font-size:10px;color:${statusColor};margin-top:2px;">${statusMsg}</div>
          </div>`;
        }

        // Controls
        html += `<div style="border-top:1px solid rgba(255,255,255,0.08);margin-top:6px;padding-top:6px;display:flex;gap:3px;flex-wrap:wrap;">
          <button class="sa-btn" id="sa3-perf-reset" style="font-size:9px;">🔄 Reset Stats</button>
          <button class="sa-btn" id="sa3-perf-console" style="font-size:9px;">📊 Console</button>`;

        if (hasScriptData) {
          html += `<button class="sa-btn" id="sa3-perf-tune" style="font-size:9px;">⚡ Speed Tune</button>`;
        }

        html += `</div>`;
        html += `<div style="font-size:9px;color:#64748b;margin-top:3px;">Tip: Press F3 to toggle Game/Script Auto</div>`;
      }
      html += `</div>`;

      // ── Recommendations ──
      if (recs.length > 0) {
        html += `<div class="sa-sect"><div class="sa-sect-title">\uD83D\uDCCA Recommendations</div>`;
        for (const r of recs) {
          const bg = r.prio === "CRITICAL" ? "rgba(127,29,29,0.3)" : r.prio === "HIGH" ? "rgba(120,53,15,0.3)" : "rgba(0,0,0,0.2)";
          html += `<div class="sa-rec" style="background:${bg};border-color:${r.color}30;">
            <div style="display:flex;justify-content:space-between;margin-bottom:1px;">
              <span style="font-weight:700;color:${r.color};font-size:11px;">${r.stat} = ${fmt(r.val)}</span>
              <span style="font-size:9px;padding:0 4px;border-radius:2px;background:${r.color}20;color:${r.color};font-weight:600;">${r.prio}</span>
            </div>
            <div style="font-size:10px;color:#cbd5e1;">${r.reason}</div>
            <div style="font-size:10px;color:#4ade80;margin-top:1px;">\u2192 ${r.action}</div>
          </div>`;
        }
        html += `</div>`;
      }

      // ── SC Solver Selection ──
      const choice = getSolverChoice();
      html += `<div class="sa-sect"><div class="sa-sect-title">\uD83D\uDD12 Security Check Solver</div>`;
      html += `<div style="display:flex;gap:3px;margin-top:2px;">`;
      for (const opt of [["capsolver","CapSolver"],["claude","Claude AI"],["off","Off"]]) {
        const sel = choice === opt[0];
        html += `<button class="sa-btn sa3-solver" data-solver="${opt[0]}" style="${sel ? "background:rgba(212,175,55,0.3);color:#d4af37;border-color:#d4af37;" : ""}">${opt[1]}</button>`;
      }
      html += `</div>`;
      if (choice === "claude") {
        const hasClaudeKey = !!localStorage.getItem(AI_KEY);
        const hasOpenAIKey = !!localStorage.getItem(OPENAI_KEY);
        const modelChoice = getModelChoice();
        // Model selector
        html += `<div style="display:flex;gap:3px;margin-top:4px;align-items:center;flex-wrap:wrap;">`;
        html += `<span style="font-size:9px;color:#888;">Model:</span>`;
        for (const opt of [["haiku","Haiku 4.5 (1-shot)"],["sonnet","Sonnet 4.5 (1-shot)"],["gpt52","GPT-5.2 (1-shot)"]]) {
          const sel = modelChoice === opt[0];
          const isGPT = opt[0] === 'gpt52';
          const selColor = isGPT ? "background:rgba(16,163,127,0.3);color:#10a37f;border-color:#10a37f;" : "background:rgba(139,92,246,0.3);color:#a78bfa;border-color:#a78bfa;";
          html += `<button class="sa-btn sa3-model" data-model="${opt[0]}" style="font-size:9px;padding:2px 6px;${sel ? selColor : ""}">${opt[1]}</button>`;
        }
        html += `</div>`;
        // Key status and cost info
        const isGPTSelected = modelChoice === 'gpt52';
        const hasRequiredKey = isGPTSelected ? hasOpenAIKey : hasClaudeKey;
        let costInfo, keyHint;
        if (modelChoice === 'gpt52') {
          costInfo = "\u2705 OpenAI key set. GPT-5.2, 1-shot simplified. ~$0.005-0.01/solve. Alternative.";
          keyHint = "\u26A0 Need OpenAI key: setOpenAIKey('sk-...')";
        } else if (modelChoice === 'sonnet') {
          costInfo = "\u2705 Claude key set. Sonnet 4.5, 1-shot simplified. ~$0.005/solve. Best accuracy.";
          keyHint = "\u26A0 Need Claude key: setAIApiKey('sk-ant-...')";
        } else {
          costInfo = "\u2705 Claude key set. Haiku 4.5, 1-shot simplified. ~$0.001/solve. Simple & fast.";
          keyHint = "\u26A0 Need Claude key: setAIApiKey('sk-ant-...')";
        }
        html += `<div style="font-size:10px;color:${hasRequiredKey?"#4ade80":"#f59e0b"};margin-top:3px;">${hasRequiredKey ? costInfo : keyHint}</div>`;
        // Review failed SC button — always shown when Claude active
        const failedImgs = (typeof loadFailedSCImages === 'function') ? loadFailedSCImages() : [];
        const failedCount = failedImgs.length;
        const uncorrectedCount = failedImgs.filter(f => !f.corrected).length;
        if (failedCount > 0) {
          html += `<button class="sa-btn" id="sa3-review-sc" style="margin-top:4px;font-size:10px;width:100%;${uncorrectedCount > 0 ? 'background:rgba(239,68,68,0.2);border-color:#ef4444;color:#ef4444;' : 'background:rgba(74,222,128,0.15);border-color:#4ade80;color:#4ade80;'}">\uD83D\uDD0D Review Failed SC (${uncorrectedCount} uncorrected / ${failedCount} total)</button>`;
        } else {
          html += `<button class="sa-btn" id="sa3-review-sc" style="margin-top:4px;font-size:10px;width:100%;opacity:0.5;" disabled>\uD83D\uDD0D No failed SC images yet</button>`;
        }
      }
      html += `</div>`;

      // Preserve AI box if it exists
      const existingAI = document.getElementById("sa3-ai-box");
      const aiContent = existingAI ? existingAI.textContent : "";
      const aiVis = existingAI ? existingAI.style.display : "none";

      body.innerHTML = html;

      // Re-add AI box
      if (aiContent || aiVis === "block") {
        const aiBox = document.createElement("div");
        aiBox.id = "sa3-ai-box";
        aiBox.className = "sa-ai-box";
        aiBox.style.display = aiVis;
        aiBox.textContent = aiContent;
        body.appendChild(aiBox);
      }

      // Solver buttons
      body.querySelectorAll(".sa3-solver").forEach(btn => {
        btn.addEventListener("click", () => {
          setSolverChoice(btn.dataset.solver);
          refreshPanel();
        });
      });

      // Model buttons
      body.querySelectorAll(".sa3-model").forEach(btn => {
        btn.addEventListener("click", () => {
          setModelChoice(btn.dataset.model);
          refreshPanel();
        });
      });

      // Review failed SC button
      const reviewBtn = body.querySelector("#sa3-review-sc");
      if (reviewBtn && !reviewBtn.disabled) {
        reviewBtn.addEventListener("click", () => {
          if (typeof _w.reviewFailedSCVisual === 'function') _w.reviewFailedSCVisual();
        });
      }

      // Performance monitor buttons
      const perfResetBtn = body.querySelector("#sa3-perf-reset");
      if (perfResetBtn) {
        perfResetBtn.addEventListener("click", () => {
          if (confirm("Reset performance stats for both Game Auto and Script Auto?")) {
            if (typeof _w.resetPerfStats === 'function') _w.resetPerfStats();
            refreshPanel();
          }
        });
      }

      const perfConsoleBtn = body.querySelector("#sa3-perf-console");
      if (perfConsoleBtn) {
        perfConsoleBtn.addEventListener("click", () => {
          if (typeof _w.compareAutoSpeeds === 'function') _w.compareAutoSpeeds();
        });
      }

      const perfTuneBtn = body.querySelector("#sa3-perf-tune");
      if (perfTuneBtn) {
        perfTuneBtn.addEventListener("click", () => {
          console.log('[StatAnalyzer] Speed tuning options:');
          console.log('');
          console.log('⚡ PRESETS:');
          console.log('  useStealthPreset("minimal")  - Fastest (93% of game auto)');
          console.log('  useStealthPreset("fast")     - Fast (89% of game auto)');
          console.log('  useStealthPreset("balanced") - Balanced (83% of game auto)');
          console.log('  useStealthPreset("maximum")  - Safest (71% of game auto)');
          console.log('');
          console.log('🎯 MANUAL TUNING:');
          console.log('  setStealthConfig("redBarDelayMin", 10)');
          console.log('  setStealthConfig("redBarDelayMax", 40)');
          console.log('  setStealthConfig("buttonChangeDelayMin", 20)');
          console.log('  setStealthConfig("buttonChangeDelayMax", 80)');
          console.log('');
          console.log('📊 CHECK STATUS:');
          console.log('  stealthStatus()  - View current settings');
          console.log('  listStealthPresets()  - See all presets');
        });
      }
    }

    // ── Toggle Button ──
    function createToggle() {
      const btn = document.createElement("button");
      btn.id = "sa3-toggle";
      btn.textContent = "\uD83D\uDCCA";
      btn.title = "Stat Analyzer (F4)";
      btn.style.cssText = `
        position:fixed; bottom:10px; right:10px; width:34px; height:34px;
        background:linear-gradient(135deg,rgba(30,58,95,0.9),rgba(45,27,105,0.9));
        border:1px solid rgba(212,175,55,0.4); border-radius:50%; z-index:99998;
        cursor:pointer; font-size:15px; display:flex; align-items:center; justify-content:center;
        box-shadow:0 2px 8px rgba(0,0,0,0.3);
      `;
      btn.addEventListener("click", () => togglePanel());
      document.body.appendChild(btn);
    }

    // ── Auto Combat Toggle Button ──
    function createAutoCombatButton() {
      if (document.getElementById("oa-autocombat-btn")) return;

      const btn = document.createElement("button");
      btn.id = "oa-autocombat-btn";
      btn.title = "Toggle Auto Combat (F1)";
      btn.style.cssText = `
        position:fixed; bottom:130px; right:10px; width:34px; height:34px;
        border-radius:50%; z-index:99998;
        cursor:pointer; font-size:12px; font-weight:700;
        display:flex; align-items:center; justify-content:center;
        box-shadow:0 2px 8px rgba(0,0,0,0.4);
        transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
        border: 2px solid;
      `;

      function isOn() {
        return !!(window.__oaState && window.__oaState.enabled);
      }

      function updateBtn() {
        const on = isOn();
        btn.textContent = on ? "ON" : "OFF";
        btn.title = on ? "Auto Combat ON — click to stop (F1)" : "Auto Combat OFF — click to start (F1)";
        if (on) {
          btn.style.background = "linear-gradient(135deg,rgba(22,101,52,0.95),rgba(20,83,45,0.95))";
          btn.style.borderColor = "rgba(74,222,128,0.8)";
          btn.style.color = "#4ade80";
          btn.style.boxShadow = "0 2px 12px rgba(74,222,128,0.35)";
        } else {
          btn.style.background = "linear-gradient(135deg,rgba(120,20,20,0.95),rgba(90,15,15,0.95))";
          btn.style.borderColor = "rgba(248,113,113,0.5)";
          btn.style.color = "#f87171";
          btn.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";
        }
      }

      btn.addEventListener("click", () => {
        try {
          // Try direct state toggle first (most reliable)
          if (window.__oaState) {
            const wasOn = window.__oaState.enabled;
            if (wasOn) {
              // Turn OFF
              window.__oaState.enabled = false;
              try { localStorage.setItem("oa_autocombat_enabled_v1", "false"); } catch {}
              console.log("[AutoCombat] Button: Disabled");
            } else {
              // Turn ON - dispatch F1 to trigger full enable logic
              document.dispatchEvent(new KeyboardEvent("keydown", {
                key: "F1", code: "F1", keyCode: 112, bubbles: true, cancelable: true
              }));
              console.log("[AutoCombat] Button: Enabled");
            }
            // Update button immediately, then again after state settles
            updateBtn();
            setTimeout(updateBtn, 200);
            setTimeout(updateBtn, 500);
          } else {
            // Fallback: simulate F1
            document.dispatchEvent(new KeyboardEvent("keydown", {
              key: "F1", code: "F1", keyCode: 112, bubbles: true, cancelable: true
            }));
            setTimeout(updateBtn, 300);
          }
        } catch (e) {
          console.error("[AutoCombat] Button toggle error:", e);
        }
      });

      document.body.appendChild(btn);

      // Stealth Preset Menu
      setTimeout(() => {
        if (document.getElementById("oa-stealth-preset-selector")) return;

        const dd = document.createElement("select");
        dd.id = "oa-stealth-preset-selector";
        dd.style.cssText = "position:fixed;bottom:130px;right:50px;padding:4px 8px;border-radius:8px;font-size:11px;border:2px solid rgba(139,92,246,0.6);background:rgba(139,92,246,0.2);color:#c4b5fd;cursor:pointer;font-weight:600;z-index:99998;";

        [['off','❌ OFF'],['maximum','🐌 Max'],['balanced','⚖️ Bal'],['fast','⚡ Fast'],['minimal','🚀 Min'],['ludicrous','💀 Lud']].forEach(([v,l]) => {
          const o = document.createElement("option");
          o.value = v;
          o.textContent = l;
          dd.appendChild(o);
        });

        dd.value = localStorage.getItem('oa_stealth_preset_v1') || 'balanced';

        dd.onchange = (e) => {
          const val = e.target.value;
          const wasOn = !!(window.__oaState && window.__oaState.enabled);

          if (val === 'off') {
            STEALTH_CONFIG.enabled = false;
            STEALTH_CONFIG.useKeyboard = false;
            localStorage.setItem('oa_stealth_preset_v1', 'off');
            console.log('[Stealth] OFF - Direct clicks, zero delays');
          } else {
            const p = STEALTH_PRESETS[val];
            if (p) {
              STEALTH_CONFIG.enabled = true;
              STEALTH_CONFIG.useKeyboard = true;
              Object.assign(STEALTH_CONFIG, p);
              localStorage.setItem('oa_stealth_preset_v1', val);
              console.log('[Stealth] Applied:', p.name);
            }
          }

          // Restart combat if it was running
          if (wasOn && window.__oaState) {
            console.log('[Stealth] Restarting combat...');
            window.__oaState.enabled = false;
            setTimeout(() => {
              document.dispatchEvent(new KeyboardEvent("keydown", {key: "F1", code: "F1", keyCode: 112, bubbles: true}));
            }, 200);
          }
        };

        document.body.appendChild(dd);
        console.log('[Stealth] Menu created');
      }, 700);
      setInterval(updateBtn, 500);
      updateBtn();
      window.__oaUpdateAutoCombatBtn = updateBtn;
    }

    setTimeout(createAutoCombatButton, 600);

    // ── Hotkey F4 ──
    document.addEventListener("keydown", e => {
      if (e.key === "F4" && !(e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) {
        e.preventDefault(); togglePanel();
      }
    });

    // ── Combat Log Monitor ──
    function startMonitor() {
      const log = document.getElementById("combat-log");
      if (!log) { setTimeout(startMonitor, 2000); return; }
      new MutationObserver(muts => {
        let changed = false;
        for (const mut of muts) {
          for (const node of mut.addedNodes) {
            if (node.nodeType === 1 && node.classList?.contains("log-line")) {
              record(parse(node));
              changed = true;
            }
          }
        }
        if (changed && isVisible) refreshPanel();
      }).observe(log, { childList: true, subtree: true });
      console.log(TAG, "Combat log monitor started");
    }

    // ── Expose Console API ──
    _w.setAIApiKey = function(key) {
      localStorage.setItem(AI_KEY, key);
      console.log(TAG, "API key saved! Used for AI analysis + Claude SC solver.");
    };
    _w.setOpenAIKey = function(key) {
      localStorage.setItem(OPENAI_KEY, key);
      console.log(TAG, "OpenAI API key saved! Used for GPT-5.2 SC solver.");
    };
    _w.aiAnalyze = aiAnalyze;
    _w.combatStats = function() { const s = readPlayerStats(); const m = metrics(all); console.log("Player Stats:", s); console.log("Combat:", all); console.log("Metrics:", m); return { stats: s, combat: all, metrics: m }; };
    _w.combatAnalyzerShow = function() { togglePanel(true); };
    _w.combatAnalyzerHide = function() { togglePanel(false); };
    _w.statAnalyzer = function() { return recommend(); };
    _w.statAnalyzerReset = function() { all = defaults(); sess = defaults(); save(all); console.log(TAG, "Reset."); };

    // ═══════════════════════════════════════════════════════════════════
    // ── DEEP SCAN v2: Multi-Pass Analysis System ──
    // Pass 1: Combat mechanics (combat.js + state)
    // Pass 2: Game systems (header, stats, quests, kingdoms, map)
    // Pass 3: Script improvement recommendations (userscript + pass 1&2 findings)
    // ═══════════════════════════════════════════════════════════════════
    const SCAN_KEY = "oa_deep_scan_v2";
    const SCAN_TAG = "[DeepScan]";

    // ── Helpers ──
    async function fetchJSSource(url) {
      try {
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) return null;
        return await res.text();
      } catch (e) { return null; }
    }

    function getGameScriptURLs() {
      const urls = [];
      document.querySelectorAll('script[src]').forEach(el => {
        const src = el.src || el.getAttribute('src') || '';
        if (src && !src.includes('cloudflare') && !src.includes('analytics') && !src.includes('gtag') && !src.includes('google') && !src.includes('beacon')) {
          urls.push(src);
        }
      });
      return urls;
    }

    function getInlineScripts() {
      const results = [];
      document.querySelectorAll('script:not([src])').forEach((el, i) => {
        const code = (el.textContent || '').trim();
        if (code.length > 50 && !code.includes('cloudflareinsights') && !code.includes('gtag') && !code.includes('__cfBeacon')) {
          results.push({ index: i, size: code.length, code });
        }
      });
      return results;
    }

    // ── DOM/State scraping (shared across passes) ──
    function scrapeMonsterSelect() {
      const sel = document.getElementById('monster-select');
      if (!sel) return [];
      return Array.from(sel.options).map(opt => ({
        value: opt.value,
        text: opt.textContent.trim(),
        level: opt.getAttribute('data-monster-level') || null,
        abilityName: opt.getAttribute('data-ability-name') || null,
        abilityDesc: opt.getAttribute('data-ability-desc') || null,
        isBeast: opt.getAttribute('data-beast-option') === '1',
        isTemp: opt.getAttribute('data-temp-current') === '1'
      })).filter(o => o.value);
    }

    function scrapeCombatConfig() {
      try {
        const el = document.querySelector('[data-combat-config]');
        if (!el) return null;
        const raw = (el.getAttribute('data-combat-config') || '{}').replace(/&quot;/g, '"').replace(/&#34;/g, '"');
        return JSON.parse(raw);
      } catch { return null; }
    }

    function scrapeAllGameState() {
      const state = {};
      // CombatState
      try { if (window.CombatState) { state.combatState = {}; for (const k of Object.keys(window.CombatState)) { const v = window.CombatState[k]; state.combatState[k] = typeof v === 'function' ? '[fn]' : v; } } } catch {}
      // Player stats
      state.playerStats = readPlayerStats();
      state.combatMetrics = { allTime: metrics(all), session: metrics(sess), raw: all };
      // Monster list
      state.monsters = scrapeMonsterSelect();
      // Combat config
      state.combatConfig = scrapeCombatConfig();
      // APIs
      state.apis = {};
      return state;
    }

    async function fetchAPIs() {
      const apis = {};
      try { const r = await fetch('/api/hud_state.php', { credentials: 'same-origin' }); if (r.ok) apis.hudState = await r.json(); } catch {}
      try { const r = await fetch('api/combat_api.php', { credentials: 'same-origin' }); if (r.ok) apis.combatApi = await r.json(); } catch {}
      try { const r = await fetch('api/beasts_api.php', { credentials: 'same-origin' }); if (r.ok) apis.beastsApi = await r.json(); } catch {}
      try { const r = await fetch('api/tournament_status.php', { credentials: 'same-origin' }); if (r.ok) apis.tournament = await r.json(); } catch {}
      return apis;
    }

    // ── Relevant localStorage ──
    function scrapeLocalStorage() {
      const data = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('oa_') || k.startsWith('combat'))) {
            const v = localStorage.getItem(k);
            data[k] = v && v.length > 1000 ? v.substring(0, 1000) + '...[truncated]' : v;
          }
        }
      } catch {}
      return data;
    }

    // ── Claude API call helper ──
    async function claudeCall(prompt, maxTokens = 8000) {
      const key = localStorage.getItem(AI_KEY);
      if (!key) throw new Error("No API key. Run: localStorage.setItem('oa_ai_api_key_v1','sk-ant-...')");
      const res = await gmFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] })
      });
      if (!res.ok) { const t = await res.json().catch(() => ({})); throw new Error(t.error?.message || `HTTP ${res.status}`); }
      const data = await res.json();
      return { text: data.content?.[0]?.text || '', usage: data.usage || {} };
    }

    // ════════════════════════════════════════
    // PASS 1: Combat Mechanics Deep Dive
    // ════════════════════════════════════════
    async function scanPass1() {
      console.log(SCAN_TAG, "═══ PASS 1/3: Combat Mechanics ═══");
      console.log(SCAN_TAG, "Fetching combat.js...");

      // Fetch combat.js
      const urls = getGameScriptURLs();
      let combatJS = '';
      for (const url of urls) {
        if (url.includes('combat')) {
          combatJS = await fetchJSSource(url) || '';
          console.log(SCAN_TAG, `Fetched combat.js: ${(combatJS.length/1024).toFixed(0)}KB`);
          break;
        }
      }

      // Also get stat-allocation-modal
      let statJS = '';
      for (const url of urls) {
        if (url.includes('stat-allocation') || url.includes('stat_allocation')) {
          statJS = await fetchJSSource(url) || '';
          console.log(SCAN_TAG, `Fetched stat-allocation: ${(statJS.length/1024).toFixed(0)}KB`);
          break;
        }
      }

      // Inline scripts often contain config
      const inlines = getInlineScripts();

      const gameState = scrapeAllGameState();
      const apis = await fetchAPIs();
      const ls = scrapeLocalStorage();

      const prompt = `You are a reverse-engineer analyzing the browser RPG "Olympus Awakened". This is PASS 1 of 3 — focus ONLY on combat mechanics.

I'm giving you the COMPLETE combat.js source code, stat allocation code, live game state, and API responses. Analyze the code deeply — trace through functions, find formulas, map data flows.

CRITICAL TASKS:
1. STAT MECHANICS — What does EACH stat actually do? Trace through the code:
   - Durability (DUR): ${gameState.playerStats.dur}
   - Strength (STR): ${gameState.playerStats.str}
   - Dexterity (DEX): ${gameState.playerStats.dex}
   - Concentration (CON): ${gameState.playerStats.con}
   - Agility (AGI): ${gameState.playerStats.agi}
   - Intelligence (INT): ${gameState.playerStats.int}
   - Perception (PER): ${gameState.playerStats.per}
   Are damage/accuracy/crit formulas visible in client code or is it all server-side?

2. COMBAT FLOW — Trace the exact sequence:
   - How does sendAction('fight') / sendAction('start_fight') work?
   - What does the server response (applyResponse) contain? Every field.
   - How do combat logs get parsed? What log types exist?
   - What is the exact cooldown/delay system? How is actionDelayMs used?

3. MONSTER SYSTEM — From the select dropdown and combat config:
   - How are monsters structured? (id, level, abilities)
   - How do beast options differ from regular monsters?
   - What determines XP/gold rewards? (level difference? monster type?)
   - Monster abilities — how do they work mechanically?

4. AUTO-COMBAT SYSTEM — How does the built-in auto-combat work?
   - Start/stop conditions
   - Daily limits system
   - Death handling
   - How does it pick targets?

5. BOTCHECK SYSTEM — Full flow:
   - When does it trigger?
   - Token system, expiry, image refresh
   - 4-digit vs 6-digit — what does the code say?
   - Pass/fail handling

AVAILABLE MONSTERS RIGHT NOW:
${JSON.stringify(gameState.monsters, null, 1)}

COMBAT CONFIG:
${JSON.stringify(gameState.combatConfig, null, 1)}

COMBAT API RESPONSE:
${JSON.stringify(apis.combatApi, null, 1)}

HUD STATE:
${JSON.stringify(apis.hudState, null, 1)}

PLAYER COMBAT STATS:
${JSON.stringify(gameState.combatMetrics, null, 1)}

LOCALSTORAGE (game keys):
${JSON.stringify(ls, null, 1)}

=== COMBAT.JS SOURCE CODE (COMPLETE) ===
${combatJS}

=== STAT ALLOCATION MODAL SOURCE ===
${statJS}

=== INLINE SCRIPTS ===
${inlines.map(s => s.code).join('\n\n--- next inline ---\n\n')}

Be EXTREMELY specific. Reference function names, line patterns, variable names. If a formula is server-side only, say so explicitly. If you can see the formula, write it out. Output should be a detailed technical reference document.`;

      console.log(SCAN_TAG, `Pass 1 payload: ${(prompt.length/1024).toFixed(0)}KB (~${Math.ceil(prompt.length/4)} tokens)`);
      const result = await claudeCall(prompt);
      console.log(SCAN_TAG, `Pass 1 complete. Tokens: in=${result.usage.input_tokens} out=${result.usage.output_tokens}`);
      return result;
    }

    // ════════════════════════════════════════
    // PASS 2: Game Systems & APIs
    // ════════════════════════════════════════
    async function scanPass2(pass1Results) {
      console.log(SCAN_TAG, "═══ PASS 2/3: Game Systems & APIs ═══");

      const urls = getGameScriptURLs();
      const jsFiles = {};
      for (const url of urls) {
        const name = url.split('/').pop().split('?')[0];
        // Skip combat.js (already analyzed) and our userscript
        if (name.includes('combat') || name.includes('AutoCombat') || name.includes('userscript')) continue;
        console.log(SCAN_TAG, `Fetching ${name}...`);
        const code = await fetchJSSource(url);
        if (code && code.length > 100) {
          jsFiles[name] = code;
          console.log(SCAN_TAG, `  Got ${(code.length/1024).toFixed(0)}KB`);
        }
      }

      const apis = await fetchAPIs();

      const prompt = `You are a reverse-engineer analyzing the browser RPG "Olympus Awakened". This is PASS 2 of 3 — focus on ALL game systems EXCEPT combat (already analyzed).

FINDINGS FROM PASS 1 (Combat):
${pass1Results.text.substring(0, 3000)}
[...pass 1 truncated for space...]

CRITICAL TASKS:
1. HEADER/HUD SYSTEM — What data flows through the HUD?
   - How does hud_state.php get polled and applied?
   - What events trigger HUD updates?
   - XP/Gold tracking — how are rates calculated?
   - Event badges (XP boost, gold boost)

2. STAT ALLOCATION API — How do you allocate stats programmatically?
   - What endpoint? What parameters?
   - Is there validation? Rate limiting?
   - Can we auto-allocate via API?

3. MAP/MOVEMENT SYSTEM — How does movement work?
   - api/map_move.php parameters
   - Plane transitions
   - How coordinates map to monster availability

4. QUEST SYSTEM — Full quest API:
   - How to list available quests
   - How to accept/complete quests
   - Quest requirements and rewards
   - Auto-completion possibilities

5. KINGDOM SYSTEM — Automation opportunities:
   - Kingdom status API
   - Auto-walk scheduling
   - Resource management

6. CHAT SYSTEM — What data comes through chat?
   - Chat API structure
   - /rc commands for teleportation
   - Beast spawn announcements

7. ALL API ENDPOINTS — Map every endpoint with:
   - URL, method, parameters
   - Response structure
   - CSRF token requirements

GAME JS FILES:
${Object.entries(jsFiles).map(([name, code]) => `\n=== ${name} (${(code.length/1024).toFixed(0)}KB) ===\n${code}`).join('\n')}

HUD STATE API:
${JSON.stringify(apis.hudState, null, 1)}

BEASTS API:
${JSON.stringify(apis.beastsApi, null, 1)}

TOURNAMENT API:
${JSON.stringify(apis.tournament, null, 1)}

Be EXTREMELY specific. Reference function names, endpoints, parameters. This will be used to extend the automation script.`;

      console.log(SCAN_TAG, `Pass 2 payload: ${(prompt.length/1024).toFixed(0)}KB (~${Math.ceil(prompt.length/4)} tokens)`);
      const result = await claudeCall(prompt);
      console.log(SCAN_TAG, `Pass 2 complete. Tokens: in=${result.usage.input_tokens} out=${result.usage.output_tokens}`);
      return result;
    }

    // ════════════════════════════════════════
    // PASS 3: Script Improvement Plan
    // ════════════════════════════════════════
    async function scanPass3(pass1Results, pass2Results) {
      console.log(SCAN_TAG, "═══ PASS 3/3: Script Improvements ═══");

      // Get the userscript itself — just the key sections
      const urls = getGameScriptURLs();
      let userscriptCode = '';
      for (const url of urls) {
        if (url.includes('AutoCombat') || url.includes('userscript') || url.includes('tampermonkey')) {
          userscriptCode = await fetchJSSource(url) || '';
          break;
        }
      }

      // If we couldn't fetch the userscript from a script tag, describe what we have
      const scriptFeatures = `
CURRENT USERSCRIPT FEATURES (v6.9.16.174):
- Auto-combat (F1 toggle) — clicks attack button on cooldown
- Beast teleport (F2) — uses /rc chat to teleport to beasts
- CapSolver captcha solving — ImageToText with preprocessing, 3-vote system
- Claude AI captcha solving — Haiku 4.5 vision, 2-vote system
- Combat stat analyzer panel (F4) — tracks hits/misses/crits/kills/deaths
- Stat display — reads all 7 stats from DOM [data-stat-value]
- Stat recommendations — cross-references stats with combat performance
- AI analysis button — sends stats+metrics to Claude Sonnet for advice
- Deep scan system — scrapes all JS/DOM/state for analysis (this scan)
- Kingdom auto-walk — scheduled kingdom management
- Gold-to-drachma auto-conversion — converts at cap (5B)
- XP/Gold per hour tracking via hud_state.php polling
- Security check pass/fail tracking with history

CURRENT LIMITATIONS:
- Does NOT auto-switch monsters based on performance
- Does NOT auto-allocate stat points
- Does NOT interact with quest system
- Does NOT optimize monster selection based on level/abilities
- Does NOT predict beast spawns or optimize hunting routes
- Does NOT use map movement API
- Stat recommendations use hardcoded assumptions about what stats do
`;

      const prompt = `You are a senior automation engineer. Based on the deep analysis from Pass 1 (Combat) and Pass 2 (Systems), write a SPECIFIC implementation plan for improving the Olympus Awakened userscript.

═══ PASS 1 FINDINGS (Combat Mechanics): ═══
${pass1Results.text}

═══ PASS 2 FINDINGS (Game Systems): ═══
${pass2Results.text}

═══ CURRENT SCRIPT STATE: ═══
${scriptFeatures}

═══ PLAYER STATE: ═══
Stats: DUR=${readPlayerStats().dur} STR=${readPlayerStats().str} DEX=${readPlayerStats().dex} CON=${readPlayerStats().con} AGI=${readPlayerStats().agi} INT=${readPlayerStats().int} PER=${readPlayerStats().per}
Level: ${readPlayerStats().level} | HP: ${readPlayerStats().hp}/${readPlayerStats().maxHp}
Combat: ${all.attacks} attacks | ${pct(metrics(all).accuracy)} acc | ${pct(metrics(all).critRate)} crit | ${all.kills} kills / ${all.deaths} deaths

═══ YOUR TASK: ═══

Write SPECIFIC, IMPLEMENTABLE improvements. For each one provide:

1. **AUTO MOB SWITCHER** (HIGHEST PRIORITY)
   - Exact logic: which monster to pick based on level, ability danger, kill speed
   - How to change the #monster-select and start a fight programmatically
   - When to re-evaluate (every N kills? on level up? on death streak?)
   - Avoid Hellrage monsters if survival rate drops
   - Code the actual JavaScript function

2. **AUTO STAT ALLOCATION**
   - Based on what stats ACTUALLY do (from Pass 1 findings)
   - The exact API call to allocate stats
   - Priority order based on current combat performance
   - Code the function

3. **QUEST AUTO-MANAGEMENT**
   - Check available quests, auto-accept kill quests
   - Track progress, auto-complete
   - API calls needed

4. **IMPROVED COMBAT TRACKING**
   - Per-monster stats (which monsters give best XP/kill time?)
   - Death analysis (which monsters/abilities kill you?)
   - Session efficiency metrics

5. **BEAST HUNTING OPTIMIZATION**
   - Better spawn prediction from cooldown data
   - Priority ranking of beast types by reward
   - Route optimization

6. **ANYTHING ELSE** from the code analysis that could be automated or improved

For EACH improvement, write the COMPLETE JavaScript function(s) ready to paste into the script. Use actual selectors, API endpoints, and variable names from the codebase. Include error handling.

Format as a numbered implementation plan with code blocks.`;

      console.log(SCAN_TAG, `Pass 3 payload: ${(prompt.length/1024).toFixed(0)}KB (~${Math.ceil(prompt.length/4)} tokens)`);
      const result = await claudeCall(prompt, 8000);
      console.log(SCAN_TAG, `Pass 3 complete. Tokens: in=${result.usage.input_tokens} out=${result.usage.output_tokens}`);
      return result;
    }

    // ════════════════════════════════════════
    // Main deep scan orchestrator
    // ════════════════════════════════════════
    async function deepScan(passNumber) {
      const key = localStorage.getItem(AI_KEY);
      if (!key) {
        console.error(SCAN_TAG, "No API key. Run: localStorage.setItem('oa_ai_api_key_v1','sk-ant-...')");
        return { error: "No API key set" };
      }

      console.log(SCAN_TAG, "╔══════════════════════════════════════╗");
      console.log(SCAN_TAG, "║   DEEP SCAN v2 — Multi-Pass Analysis ║");
      console.log(SCAN_TAG, "║   3 passes, ~$0.10-0.15 each         ║");
      console.log(SCAN_TAG, "║   Total: ~$0.30-0.45                  ║");
      console.log(SCAN_TAG, "╚══════════════════════════════════════╝");

      const results = {};
      const existing = loadScanResults();

      try {
        // PASS 1
        if (!passNumber || passNumber === 1 || !existing.pass1) {
          console.log(SCAN_TAG, "");
          results.pass1 = await scanPass1();
          console.log(SCAN_TAG, "✓ Pass 1 done");
          console.log(SCAN_TAG, "─── Pass 1 Results ───");
          console.log(results.pass1.text);
          saveScanPass('pass1', results.pass1);
        } else {
          console.log(SCAN_TAG, "✓ Pass 1 cached (use deepScan(1) to re-run)");
          results.pass1 = existing.pass1;
        }

        // PASS 2
        if (!passNumber || passNumber === 2 || !existing.pass2) {
          console.log(SCAN_TAG, "");
          results.pass2 = await scanPass2(results.pass1);
          console.log(SCAN_TAG, "✓ Pass 2 done");
          console.log(SCAN_TAG, "─── Pass 2 Results ───");
          console.log(results.pass2.text);
          saveScanPass('pass2', results.pass2);
        } else {
          console.log(SCAN_TAG, "✓ Pass 2 cached (use deepScan(2) to re-run)");
          results.pass2 = existing.pass2;
        }

        // PASS 3
        if (!passNumber || passNumber === 3 || !existing.pass3) {
          console.log(SCAN_TAG, "");
          results.pass3 = await scanPass3(results.pass1, results.pass2);
          console.log(SCAN_TAG, "✓ Pass 3 done");
          console.log(SCAN_TAG, "─── Pass 3 Results ───");
          console.log(results.pass3.text);
          saveScanPass('pass3', results.pass3);
        } else {
          console.log(SCAN_TAG, "✓ Pass 3 cached (use deepScan(3) to re-run)");
          results.pass3 = existing.pass3;
        }

        // Summary
        const totalIn = (results.pass1?.usage?.input_tokens || 0) + (results.pass2?.usage?.input_tokens || 0) + (results.pass3?.usage?.input_tokens || 0);
        const totalOut = (results.pass1?.usage?.output_tokens || 0) + (results.pass2?.usage?.output_tokens || 0) + (results.pass3?.usage?.output_tokens || 0);
        console.log(SCAN_TAG, "");
        console.log(SCAN_TAG, "╔══════════════════════════════════════╗");
        console.log(SCAN_TAG, "║   DEEP SCAN COMPLETE                 ║");
        console.log(SCAN_TAG, `║   Total tokens: ${totalIn} in / ${totalOut} out`);
        console.log(SCAN_TAG, `║   Est. cost: ~$${((totalIn * 3 + totalOut * 15) / 1000000).toFixed(2)}`);
        console.log(SCAN_TAG, "╚══════════════════════════════════════╝");
        console.log(SCAN_TAG, "View results: deepScanResults() or deepScanResults(1/2/3)");

        return results;
      } catch (e) {
        console.error(SCAN_TAG, "Scan failed:", e);
        return { error: e.message, partialResults: results };
      }
    }

    // ── Storage ──
    function saveScanPass(passKey, data) {
      try {
        const all = loadScanResults();
        all[passKey] = { text: data.text, usage: data.usage, timestamp: new Date().toISOString() };
        all.lastUpdated = new Date().toISOString();
        localStorage.setItem(SCAN_KEY, JSON.stringify(all));
      } catch (e) {
        // If too big for localStorage, save individual passes
        try { localStorage.setItem(SCAN_KEY + '_' + passKey, JSON.stringify({ text: data.text, usage: data.usage, timestamp: new Date().toISOString() })); } catch {}
      }
    }

    function loadScanResults() {
      try {
        const raw = localStorage.getItem(SCAN_KEY);
        if (raw) return JSON.parse(raw);
      } catch {}
      // Try individual pass keys
      const results = {};
      for (const p of ['pass1','pass2','pass3']) {
        try {
          const raw = localStorage.getItem(SCAN_KEY + '_' + p);
          if (raw) results[p] = JSON.parse(raw);
        } catch {}
      }
      return results;
    }

    function viewScanResults(passNum) {
      const data = loadScanResults();
      if (!data || (!data.pass1 && !data.pass2 && !data.pass3)) {
        console.log(SCAN_TAG, "No scan results found. Run: deepScan()");
        return null;
      }

      if (passNum) {
        const p = data['pass' + passNum];
        if (!p) { console.log(SCAN_TAG, `Pass ${passNum} not found. Run: deepScan(${passNum})`); return null; }
        console.log(SCAN_TAG, `═══ PASS ${passNum} RESULTS (${p.timestamp}) ═══`);
        if (p.usage) console.log(SCAN_TAG, `Tokens: in=${p.usage.input_tokens || '?'} out=${p.usage.output_tokens || '?'}`);
        console.log(p.text);
        return p;
      }

      // Show all
      for (const [key, val] of Object.entries(data)) {
        if (key.startsWith('pass') && val && val.text) {
          const num = key.replace('pass','');
          const labels = { '1': 'Combat Mechanics', '2': 'Game Systems', '3': 'Script Improvements' };
          console.log(SCAN_TAG, `═══ PASS ${num}: ${labels[num] || key} (${val.timestamp}) ═══`);
          if (val.usage) console.log(SCAN_TAG, `Tokens: in=${val.usage.input_tokens || '?'} out=${val.usage.output_tokens || '?'}`);
          console.log(val.text);
          console.log(SCAN_TAG, "");
        }
      }
      return data;
    }

    // ── Expose to console ──
    _w.deepScan = deepScan;
    _w.deepScanResults = viewScanResults;
    _w.gameSnapshot = function() {
      const snap = { dom: scrapeDOMStructure(), state: scrapeAllGameState(), stats: readPlayerStats(), combat: { all, sess, metrics: metrics(all) } };
      console.log(SCAN_TAG, "Game Snapshot:", snap);
      return snap;
    };

    // Expose scrapeDOMStructure for gameSnapshot (need it still)
    function scrapeDOMStructure() {
      const result = {};
      const selectors = {
        combatConfig: '[data-combat-config]', monsterSelect: '#monster-select',
        combatLog: '#combat-log', statValues: '[data-stat-value]',
        statModal: '#stat-allocation-modal', hudLocationCard: '#hud-location-card',
        questsAvailable: '[data-quests-available-panel]', questsActive: '[data-quests-active-panel]',
        playerHp: '#player-hp-text', playerLevel: '#player-level-value'
      };
      for (const [key, sel] of Object.entries(selectors)) {
        try {
          const els = document.querySelectorAll(sel);
          if (els.length === 0) { result[key] = null; continue; }
          const items = [];
          els.forEach(el => {
            const info = { tag: el.tagName, id: el.id || null };
            const attrs = {};
            for (const attr of el.attributes) { if (attr.name.startsWith('data-')) attrs[attr.name] = attr.value.substring(0, 500); }
            if (Object.keys(attrs).length > 0) info.dataAttrs = attrs;
            if (el.tagName === 'SELECT') info.optionCount = el.options.length;
            if (['SPAN','DIV','P','BUTTON'].includes(el.tagName)) info.text = (el.textContent || '').trim().substring(0, 200);
            items.push(info);
          });
          result[key] = items.length === 1 ? items[0] : items;
        } catch {}
      }
      return result;
    }

    // ── Init ──
    setTimeout(() => { createToggle(); createPanel(); if (isVisible) refreshPanel(); startMonitor(); }, 1500);
    console.log(TAG, "v3 loaded. F4=panel. setAIApiKey('key') for Claude. setOpenAIKey('key') for GPT. deepScan() for full analysis. combatStats() for data.");
  })();
// ===== OA AutoCraft Module =====
// Drop inside your main userscript IIFE. Runs on game.php (all tabs).
// ALL actions use fetch — zero page reloads except intentional combat tab switch.

(function initAutoCraftModule() {
  'use strict';

  const STORAGE_KEY   = 'oa_autocraft_v2';
  const RETURN_AT_KEY = 'oa_autocraft_return_at';
  const RETURNING_KEY  = 'oa_autocraft_returning';
  const COMBAT_MODE_KEY = 'oa_autocraft_combat_mode'; // 'inv_full' | 'timer'
  const ENABLED_KEY    = 'oa_autocraft_enabled';     // '1' = user wants it running
  const LOG           = (...a) => console.log('[AutoCraft]', ...a);

  function currentTab() {
    try { return new URLSearchParams(window.location.search).get('tab') || 'combat'; }
    catch { return 'combat'; }
  }
  function onCraftingTab() { return currentTab() === 'crafting'; }
  function onCombatTab()   { return currentTab() === 'combat';   }

  function loadSaved() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); } catch { return {}; } }
  function savePref(o) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({...loadSaved(),...o})); } catch {} }

  function goToCombat()   { location.href = '/game.php?tab=combat';   }
  function goToCrafting() { location.href = '/game.php?tab=crafting'; }

  function setReturnAlarm(s) { try { localStorage.setItem(RETURN_AT_KEY, String(Date.now()+s*1000)); } catch {} }
  function clearReturnAlarm(){ try { localStorage.removeItem(RETURN_AT_KEY); } catch {} }
  function getReturnAt()     { try { return parseInt(localStorage.getItem(RETURN_AT_KEY)||'0',10)||0; } catch { return 0; } }
  function setReturning()    { try { localStorage.setItem(RETURNING_KEY,'1'); } catch {} }
  function clearReturning()  { try { localStorage.removeItem(RETURNING_KEY); } catch {} }
  function isReturning()     { try { return localStorage.getItem(RETURNING_KEY)==='1'; } catch { return false; } }

  function fireF1() {
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'F1',code:'F1',keyCode:112,which:112,bubbles:true,cancelable:true,composed:true}));
  }
  function isScriptAutoCombatOn() { try { return !!window.__autoCombat?.status?.()?.enabled; } catch { return false; } }
  function enableAutoCombat()  { if (!isScriptAutoCombatOn()) { LOG('F1 ON');  fireF1(); } }
  function disableAutoCombat() { if ( isScriptAutoCombatOn()) { LOG('F1 OFF'); fireF1(); } }

  // ── Core fetch: serialize a form's hidden fields + a button's name/value ─
  function formPost(form, btn) {
    const params = new URLSearchParams();
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      if ((el.type==='checkbox'||el.type==='radio') && !el.checked) continue;
      params.append(el.name, el.value);
    }
    if (btn && btn.name) params.set(btn.name, btn.value);
    LOG('POST ' + params.toString().slice(0,120));
    return fetch('/game.php?tab=crafting', {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
      body: params.toString(),
    }).then(r => { if(!r.ok) throw new Error('HTTP '+r.status); return r.text(); })
      .then(h => new DOMParser().parseFromString(h,'text/html'));
  }

  // ── DOM parsing ───────────────────────────────────────────────────────────
  function parseQueue(doc) {
    const chip = doc.querySelector('.craft-queue-panel .oa-chip');
    let used=0, max=2;
    if (chip) { const m=chip.textContent.match(/(\d+)\/(\d+)/); if(m){used=+m[1];max=+m[2];} }

    // Find all claim forms — each queue slot that's done has one
    const claimForms = Array.from(doc.querySelectorAll('[data-queue-claim-form]'))
      .filter(f => !f.closest('[hidden]') && !f.classList.contains('hidden'));

    const items = Array.from(doc.querySelectorAll('[data-craft-queue-item]')).map(el => {
      const remaining = parseInt(el.dataset.remainingSeconds||'0',10)||0;
      const claimForm = el.querySelector('[data-queue-claim-form]');
      const claimBtn  = claimForm && !claimForm.classList.contains('hidden') && !claimForm.closest('[hidden]')
        ? claimForm.querySelector('button[value="claim_craft"]') : null;
      return { remaining, ready: !!claimBtn, claimForm: claimBtn ? claimForm : null, claimBtn };
    });

    if (!items.length && used > 0) for(let i=0;i<used;i++) items.push({remaining:999,ready:false,claimForm:null,claimBtn:null});

    return { used, max, items, claimForms };
  }

  function parseSalvageCount(doc) { return doc.querySelectorAll('[data-salvage-card]').length; }
  function minRemaining(q) {
    const ip = q.items.filter(i=>!i.ready&&i.remaining>0);
    return ip.length ? Math.min(...ip.map(i=>i.remaining)) : 0;
  }

  function patchLiveDom(fd) {
    try {
      // Replace queue panel
      const fq=fd.querySelector('.craft-queue-panel'), lq=document.querySelector('.craft-queue-panel');
      if(fq&&lq) lq.replaceWith(fq.cloneNode(true));
      // Replace salvage section
      const fs=fd.querySelector('[data-salvage-panel]'), ls=document.querySelector('[data-salvage-panel]');
      if(fs&&ls) ls.replaceWith(fs.cloneNode(true));
      // Rotate CSRF
      const fc=fd.querySelector('input[name="csrf_token"]');
      if(fc) document.querySelectorAll('input[name="csrf_token"]').forEach(e=>e.value=fc.value);
    } catch(e) { LOG('patchLiveDom non-fatal:',e); }
  }

  // Check if any ingredient has fewer than required by parsing "have/need" numbers.
  // Works regardless of color class (green/amber/white/red).
  function hasInsufficientMats(doc) {
    const spans = doc.querySelectorAll('.ingredient span');
    for (const span of spans) {
      const m = span.textContent.trim().match(/^(\d[\d,]*)\s*\/\s*(\d[\d,]*)$/);
      if (!m) continue;
      const have = parseInt(m[1].replace(/,/g,''), 10);
      const need = parseInt(m[2].replace(/,/g,''), 10);
      if (have < need) {
        LOG('Insufficient mat: have ' + have + ', need ' + need + ' (' + span.textContent.trim() + ')');
        return true;
      }
    }
    return false;
  }

  function sleep(ms) { return new Promise(r=>setTimeout(r,Math.max(0,ms))); }
  function randGauss(mean,std) {
    let u=Math.random(); if(u<0.0001)u=0.0001;
    return Math.max(mean*0.3, Math.round(mean+Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*Math.random())*std));
  }

  // ── UI refs ───────────────────────────────────────────────────────────────
  let running=false, pollTimer=null, loopsCompleted=0;
  let _statusEl=null, _loopEl=null, _queueEl=null;

  function setStatus(msg) { LOG(msg); if(_statusEl) _statusEl.textContent=msg; }
  function updateDisplay(q) { if(_queueEl) _queueEl.textContent=q.used+'/'+q.max; }

  // ── Main loop — NO page reloads ───────────────────────────────────────────
  async function runLoop() {
    if (!running) return;
    const saved = loadSaved();
    if (!saved.recipeId) { setStatus('Select a recipe first'); return; }

    try {
      let queue   = parseQueue(document);
      let salvage = parseSalvageCount(document);
      updateDisplay(queue);
      LOG('queue='+queue.used+'/'+queue.max+' ready='+queue.items.filter(i=>i.ready).length+' salvage='+salvage);

      // ── Inventory-full detection ─────────────────────────────────────────────
      // The server returns a notice/error when claiming fails due to full inventory.
      // We detect it in the response doc so we don't loop-retry forever.
      function isInvFullDoc(doc) {
        const text = (doc.body || doc).textContent || '';
        return /inventory (is )?full/i.test(text) ||
               /no (more )?space/i.test(text) ||
               /can't (carry|hold|claim)/i.test(text) ||
               !!doc.querySelector('[data-inv-full], .inv-full, .inventory-full');
      }

      // ── Fetch fresh crafting page state ──────────────────────────────────────
      // After salvage the response doc may not include claim buttons (server renders
      // the page differently after a salvage POST). Always fetch a fresh page so we
      // get accurate queue state before acting on it.
      async function fetchFreshState() {
        const freshDoc = await fetch('/game.php?tab=crafting', { credentials: 'include' })
          .then(r => r.text()).then(h => new DOMParser().parseFromString(h, 'text/html'));
        patchLiveDom(freshDoc);
        queue   = parseQueue(freshDoc);
        salvage = parseSalvageCount(freshDoc);
        updateDisplay(queue);
        LOG('Fresh state: queue='+queue.used+'/'+queue.max+' ready='+queue.items.filter(i=>i.ready).length+' salvage='+salvage);
        return freshDoc;
      }

      // ── Inline salvage then re-fetch ─────────────────────────────────────────
      async function doInlineSalvage() {
        // Always fetch fresh page first to make sure salvage form is in DOM
        let btn  = document.querySelector('button[value="salvage_all_items"]');
        let form = btn?.closest('form');
        if (!form || !btn) {
          setStatus('Fetching page for salvage form...');
          await fetchFreshState();
          btn  = document.querySelector('button[value="salvage_all_items"]');
          form = btn?.closest('form');
        }
        if (!form || !btn) { LOG('No salvage form found even after fresh fetch'); return; }

        setStatus('Salvaging '+salvage+' item(s)...');
        await sleep(randGauss(700, 180));
        const doc = await formPost(form, btn);
        loopsCompleted++;
        if (_loopEl) _loopEl.textContent = 'Loops: ' + loopsCompleted;

        // Fetch fresh page AFTER salvage so DOM has accurate claim buttons
        await fetchFreshState();
        LOG('Salvage complete, salvage now='+salvage);
      }

      // 1. Claim all ready items
      let readyItems = queue.items.filter(i=>i.ready && i.claimForm && i.claimBtn);
      if (readyItems.length > 0) {
        // If inventory has salvageable items, clear space first, then re-read state
        if (salvage > 0) {
          setStatus('Salvaging before claim to free inventory...');
          await doInlineSalvage();
          // readyItems may have changed — re-read from the freshly patched DOM
          readyItems = queue.items.filter(i=>i.ready && i.claimForm && i.claimBtn);
          if (readyItems.length === 0) {
            // Claim buttons gone after salvage (shouldn't happen) — restart
            await sleep(300);
            if (running) runLoop();
            return;
          }
        }

        setStatus('Claiming '+readyItems.length+' item(s)...');
        for (const item of readyItems) {
          await sleep(randGauss(600, 150));
          LOG('Claiming queue_id='+item.claimForm.querySelector('[name="queue_id"]')?.value);
          const doc = await formPost(item.claimForm, item.claimBtn);

          // Check if server rejected claim (inv full text in response)
          const invFullText = (() => {
            const t = (doc.body||doc).textContent||'';
            return /inventory.{0,15}full/i.test(t) || /no.{0,8}space/i.test(t);
          })();

          if (invFullText) {
            LOG('Server rejected claim — inventory full');
            setStatus('Inventory full — salvaging to make room...');
            patchLiveDom(doc);
            queue   = parseQueue(doc);
            salvage = parseSalvageCount(doc);
            await doInlineSalvage();
            // After salvage+fresh-fetch, queue/salvage/readyItems are updated
            // Just restart the loop — doInlineSalvage already fetched fresh state
            await sleep(300);
            if (running) runLoop();
            return;
          }

          // Claim succeeded — update state from fresh fetch (not salvage response)
          await fetchFreshState();
          // If new salvage appeared, clear it inline before claiming next item
          if (salvage > 0) {
            await doInlineSalvage();
          }
        }
        await sleep(300);
        if (running) runLoop();
        return;
      }

      // 2. Salvage any items in inventory before crafting/mat-checking
      if (salvage > 0) {
        await doInlineSalvage();
        await sleep(randGauss(400, 100));
        setStatus('Loop '+loopsCompleted+' done — continuing...');
      }

      // 3. Check mats before trying to craft
      if (hasInsufficientMats(document)) {
        setStatus('Out of mats — farming combat until inventory full...');
        LOG('Insufficient mats detected before crafting');
        await sleep(1000);
        try { localStorage.setItem(COMBAT_MODE_KEY, 'inv_full'); } catch {}
        setReturnAlarm(1);
        enableAutoCombat();
        await sleep(400);
        goToCombat();
        return;
      }

      // Fill queue via fetch — track how many we queued up
      let crafted = 0;
      while (running && queue.used < queue.max) {
        setStatus('Crafting slot '+(queue.used+1)+'/'+queue.max+'...');
        await sleep(randGauss(700,180));
        const recipeForm = document.querySelector('form:has(input[name="recipe_id"][value="'+saved.recipeId+'"])');
        const craftBtn   = recipeForm?.querySelector('button[type="submit"]');
        const doc = (recipeForm && craftBtn)
          ? await formPost(recipeForm, craftBtn)
          : await (()=>{
              const params=new URLSearchParams({csrf_token:document.querySelector('input[name="csrf_token"]')?.value||'',action:'craft_recipe',recipe_id:saved.recipeId,craft_tab:saved.craftTab||'armor',rarity:saved.rarity||'all'});
              return fetch('/game.php?tab=crafting',{method:'POST',credentials:'include',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:params.toString()}).then(r=>r.text()).then(h=>new DOMParser().parseFromString(h,'text/html'));
            })();
        patchLiveDom(doc);

        // Check ingredients in the response — if now short, head to combat for mats
        if (hasInsufficientMats(doc)) {
          setStatus('Out of mats — farming combat until inventory full...');
          await sleep(1000);
          try { localStorage.setItem(COMBAT_MODE_KEY, 'inv_full'); } catch {}
          setReturnAlarm(1);
          enableAutoCombat();
          await sleep(400);
          goToCombat();
          return;
        }

        crafted++;
        const freshQueue = parseQueue(doc);
        // If server confirms queue grew, update; otherwise trust crafted counter
        if (freshQueue.used > queue.used) queue = freshQueue;
        else queue = { ...queue, used: queue.used + 1 };
        salvage = parseSalvageCount(doc);
        updateDisplay(queue);
        await sleep(randGauss(350,100));
      }

      // 4. We have items in queue (or just crafted some) — go fight while waiting for craft
      if (running && (queue.used > 0 || crafted > 0)) {
        setStatus('Queue full — heading to combat while crafts finish...');
        await sleep(randGauss(800,200));
        // Use actual remaining time; fall back to 90s if unreadable
        const waitSecs = minRemaining(queue) > 0 ? minRemaining(queue) : 90;
        try { localStorage.setItem(COMBAT_MODE_KEY, 'timer'); } catch {}
        setReturnAlarm(waitSecs + 5); // +5s buffer so items are definitely done
        enableAutoCombat();
        await sleep(400);
        goToCombat();
        return;
      }

      // Fallback: nothing happened — wait and retry
      setStatus('Nothing to do — retrying in 10s...');
      await sleep(10000);
      if (running) runLoop();

    } catch(err) {
      LOG('Loop error:', err);
      setStatus('Error: '+(err.message||err)+' — retrying in 5s');
      if(running) pollTimer=setTimeout(runLoop,5000);
    }
  }

  // =========================================================================
  // =========================================================================
  // COMBAT TAB — watch combat log for inventory full, then head to crafting
  // =========================================================================
  function initCombatWatcher() {
    if (!getReturnAt()) return;
    const mode = localStorage.getItem(COMBAT_MODE_KEY) || 'timer';
    LOG('Combat watcher — mode: ' + mode);
    setTimeout(enableAutoCombat, 1200);

    const badge = document.createElement('div');
    badge.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483640;background:rgba(8,10,22,0.95);border:1px solid rgba(212,175,55,0.55);border-radius:10px;padding:8px 14px;color:#e2e8f0;font-family:Cinzel,Georgia,serif;font-size:11px;pointer-events:none;box-shadow:0 4px 20px rgba(0,0,0,0.7);';
    badge.innerHTML = mode === 'inv_full'
      ? '&#9874; AutoCraft \u2014 farming until inventory full'
      : '&#9874; AutoCraft \u2014 returning in <span id="oa-ac-cbd">\u2026</span>';
    document.body.appendChild(badge);

    function isBotcheckActive() {
      const el = document.querySelector('[data-botcheck-input], [data-botcheck-submit], [data-botcheck-image]');
      return !!el && el.offsetParent !== null;
    }

    function returnToCrafting() {
      // If user disabled autocraft while we were farming, abort cleanly
      const stillEnabled = (() => { try { return localStorage.getItem(ENABLED_KEY) === '1'; } catch { return false; } })();
      if (!stillEnabled) {
        LOG('Autocraft disabled — aborting return');
        try { localStorage.removeItem(COMBAT_MODE_KEY); } catch {}
        clearReturnAlarm(); clearReturning();
        disableAutoCombat();
        badge.remove();
        return;
      }
      if (isBotcheckActive()) {
        LOG('Security check active — holding return, rechecking in 5s');
        badge.innerHTML = '&#9874; AutoCraft \u2014 security check\u2026';
        setTimeout(returnToCrafting, 5000);
        return;
      }
      LOG('Returning to crafting (mode: ' + mode + ')');
      try { localStorage.removeItem(COMBAT_MODE_KEY); } catch {}
      setReturning();
      clearReturnAlarm();
      disableAutoCombat();
      badge.remove();
      setTimeout(goToCrafting, 600);
    }

    // ── inv_full mode: watch combat log for "Inventory full" ─────────────
    if (mode === 'inv_full') {
      function isInventoryFull(text) { return /inventory full/i.test(text); }

      const existing = document.querySelectorAll('#combat-log .log-line');
      for (const line of existing) {
        if (isInventoryFull(line.textContent)) {
          LOG('Inventory already full on load');
          setTimeout(returnToCrafting, 1000);
          return;
        }
      }

      const combatLog = document.getElementById('combat-log');
      if (!combatLog) {
        LOG('No #combat-log — fallback 10min');
        setTimeout(returnToCrafting, 10 * 60 * 1000);
        return;
      }

      const obs = new MutationObserver(mutations => {
        for (const mut of mutations) {
          for (const node of mut.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (isInventoryFull(node.textContent)) {
              LOG('Inventory full in combat log');
              obs.disconnect();
              setTimeout(returnToCrafting, 1200);
              return;
            }
          }
        }
      });
      obs.observe(combatLog, { childList: true, subtree: true });
      LOG('Watching combat log for inventory full');
      return;
    }

    // ── timer mode: poll crafting page until items are claimable ─────────
    const returnAt = getReturnAt();
    const cdEl = document.getElementById('oa-ac-cbd');

    async function craftingItemsReady() {
      try {
        const res = await fetch('/game.php?tab=crafting', { credentials: 'include' });
        if (!res.ok) return false;
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const btn = doc.querySelector('[data-queue-claim-form] button[value="claim_craft"]');
        if (btn && !btn.closest('[hidden]') && !btn.closest('.hidden')) return true;
        const chip = doc.querySelector('.craft-queue-panel .oa-chip');
        if (chip) { const m = chip.textContent.match(/(\d+)\/(\d+)/); if (m && +m[1] === 0) return true; }
        return false;
      } catch { return false; }
    }

    async function tick() {
      if (isBotcheckActive()) {
        if (cdEl) cdEl.textContent = 'security check…';
        setTimeout(tick, 5000);
        return;
      }
      const ms = returnAt - Date.now();
      if (ms > 8000) {
        const s = Math.ceil(ms / 1000);
        if (cdEl) cdEl.textContent = s >= 60 ? Math.floor(s/60) + 'm ' + (s%60) + 's' : s + 's';
        setTimeout(tick, 1000);
        return;
      }
      if (cdEl) cdEl.textContent = 'checking…';
      const ready = await craftingItemsReady();
      if (ready) { returnToCrafting(); return; }
      if (cdEl) cdEl.textContent = 'waiting…';
      setTimeout(tick, 3000);
    }
    tick();
  }

  // =========================================================================
  // UI
  // =========================================================================
  function scrapeRecipes() {
    return Array.from(document.querySelectorAll('[data-recipe-card]')).map(el=>{
      let recipeId='',craftTab='armor',rarity='all';
      try{const u=new URL(el.getAttribute('href')||'',location.origin);recipeId=u.searchParams.get('recipe_id')||'';craftTab=u.searchParams.get('craft_tab')||'armor';rarity=u.searchParams.get('rarity')||'all';}catch{}
      const n=el.querySelector('[class*="font-semibold"]');
      return{recipeId,craftTab,rarity,name:n?n.textContent.trim():(el.dataset.recipeName||recipeId),category:el.dataset.recipeCategory||el.dataset.recipeSkill||'other'};
    }).filter(r=>r.recipeId);
  }

  function buildUI() {
    document.getElementById('oa-autocraft-panel')?.remove();
    const saved=loadSaved(),recipes=scrapeRecipes(),grouped={};
    recipes.forEach(r=>{(grouped[r.category||'other']=grouped[r.category||'other']||[]).push(r);});
    const optHTML=Object.entries(grouped).map(([g,rs])=>
      `<optgroup label="${g[0].toUpperCase()+g.slice(1)}">${rs.map(r=>`<option value="${r.recipeId}" data-craft-tab="${r.craftTab}" data-rarity="${r.rarity}"${saved.recipeId===r.recipeId?' selected':''}>${r.name}</option>`).join('')}</optgroup>`
    ).join('');

    const panel=document.createElement('div');
    panel.id='oa-autocraft-panel';
    panel.style.cssText='position:fixed;bottom:16px;right:16px;z-index:2147483640;background:rgba(8,10,22,0.97);border:1px solid rgba(212,175,55,0.55);border-radius:12px;padding:14px 16px;color:#e2e8f0;font-family:Cinzel,Georgia,serif;font-size:12px;min-width:260px;max-width:320px;box-shadow:0 6px 32px rgba(0,0,0,0.75);user-select:none;';
    panel.innerHTML=`<style>#oa-autocraft-panel select,#oa-autocraft-panel button{font-family:inherit}</style>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <span style="font-weight:700;color:#d4af37;font-size:13px;">&#9874; AutoCraft</span>
        <div style="display:flex;gap:8px;align-items:center;">
          <span id="oa-ac-loop" style="font-size:10px;color:#64748b;">Loops: 0</span>
          <button id="oa-ac-col" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:14px;padding:0 2px;">&minus;</button>
        </div>
      </div>
      <div id="oa-ac-body">
        <label style="display:block;font-size:10px;color:#64748b;margin-bottom:4px;text-transform:uppercase;">Recipe</label>
        <select id="oa-ac-sel" style="width:100%;background:rgba(0,0,0,.45);color:#e2e8f0;border:1px solid rgba(255,255,255,.18);border-radius:6px;padding:5px 8px;font-size:11px;margin-bottom:10px;"><option value="">&#8212; Select &#8212;</option>${optHTML}</select>
        <div style="margin-bottom:10px;padding:5px 8px;background:rgba(255,255,255,.04);border-radius:6px;">
          <div style="font-size:9px;color:#64748b;text-transform:uppercase;">Active</div>
          <div id="oa-ac-rname" style="font-size:11px;color:#d4af37;">${saved.recipeName||'None'}</div>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:10px;">
          <div style="flex:1;padding:5px 8px;background:rgba(0,0,0,.3);border-radius:6px;">
            <div style="font-size:9px;color:#64748b;">Queue</div>
            <div id="oa-ac-queue" style="font-size:11px;color:#94a3b8;">&#8212;</div>
          </div>
          <div style="flex:1;padding:5px 8px;background:rgba(0,0,0,.3);border-radius:6px;">
            <div style="font-size:9px;color:#64748b;">State</div>
            <div id="oa-ac-badge" style="font-size:11px;color:#94a3b8;">Idle</div>
          </div>
        </div>
        <div id="oa-ac-status" style="font-size:10px;color:#94a3b8;min-height:15px;margin-bottom:10px;">Press Start to begin</div>
        <button id="oa-ac-toggle" style="width:100%;padding:7px 12px;border-radius:8px;border:none;cursor:pointer;font-size:11px;font-weight:700;background:rgba(22,163,74,.85);color:#fff;">&#9654; Start</button>
        <div style="margin-top:8px;font-size:9px;color:rgba(100,116,139,.6);border-top:1px solid rgba(255,255,255,.06);padding-top:8px;">No page reloads — combat farms while crafting</div>
      </div>`;
    document.body.appendChild(panel);

    _statusEl=panel.querySelector('#oa-ac-status');
    _loopEl  =panel.querySelector('#oa-ac-loop');
    _queueEl =panel.querySelector('#oa-ac-queue');
    const badgeEl=panel.querySelector('#oa-ac-badge'),rnameEl=panel.querySelector('#oa-ac-rname'),toggleBtn=panel.querySelector('#oa-ac-toggle');

    setInterval(()=>{
      if(badgeEl) badgeEl.textContent=running?'Running':'Idle';
      if(_loopEl) _loopEl.textContent='Loops: '+loopsCompleted;
      updateDisplay(parseQueue(document));
    },1500);

    panel.querySelector('#oa-ac-sel').addEventListener('change',e=>{
      const o=e.target.options[e.target.selectedIndex];
      if(!o.value) return;
      if(rnameEl) rnameEl.textContent=o.text.trim();
      savePref({recipeId:o.value,craftTab:o.dataset.craftTab||'armor',rarity:o.dataset.rarity||'all',recipeName:o.text.trim()});
    });

    function startRunning() {
      if(!loadSaved().recipeId){setStatus('Select a recipe first!');return;}
      try { localStorage.setItem(ENABLED_KEY,'1'); } catch {}
      running=true; loopsCompleted=0;
      toggleBtn.textContent='\u25a0 Stop';
      toggleBtn.style.background='rgba(220,38,38,.85)';
      setStatus('Starting...');
      runLoop();
    }

    toggleBtn.addEventListener('click',()=>{
      if(running){
        running=false;
        if(pollTimer){clearTimeout(pollTimer);pollTimer=null;}
        try { localStorage.removeItem(ENABLED_KEY); } catch {}
        try { localStorage.removeItem(COMBAT_MODE_KEY); } catch {}
        clearReturnAlarm(); clearReturning();
        toggleBtn.textContent='\u25b6 Start';
        toggleBtn.style.background='rgba(22,163,74,.85)';
        setStatus('Stopped');
      } else startRunning();
    });

    panel._startRunning=startRunning;

    let col=false;
    panel.querySelector('#oa-ac-col').addEventListener('click',()=>{
      col=!col;
      panel.querySelector('#oa-ac-body').style.display=col?'none':'';
      panel.querySelector('#oa-ac-col').textContent=col?'+':'\u2212';
    });
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  function init() {
    if (onCraftingTab()) {
      buildUI();
      updateDisplay(parseQueue(document));
      const userEnabled = (() => { try { return localStorage.getItem(ENABLED_KEY) === '1'; } catch { return false; } })();
      if (isReturning() && userEnabled) {
        clearReturning();
        clearReturnAlarm();
        if (loadSaved().recipeId) {
          LOG('Returned from combat — resuming');
          const panel=document.getElementById('oa-autocraft-panel');
          if(panel?._startRunning) setTimeout(panel._startRunning, 1000+Math.random()*400);
        }
      } else if (isReturning()) {
        // User stopped it while we were on combat tab — clean up flags but don't resume
        clearReturning();
        clearReturnAlarm();
        try { localStorage.removeItem(COMBAT_MODE_KEY); } catch {}
        LOG('Not resuming — user disabled autocraft');
      }
    } else if (onCombatTab()) {
      initCombatWatcher();
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
  else setTimeout(init, 500+Math.random()*200);

})();


// ===== OA Drop Rate Scanner =====
// Observes combat log for kills/drops per mob, 100 kills each, then advances to next mob.
// Reads current plane from oa_last_plane_cache_v1. Salvages on inventory full.
// Paste inside your main userscript IIFE, or include as standalone.

(function initDropRateModule() {
  'use strict';

  const DATA_KEY   = 'oa_droprate_data_v1';  // { plane: { mobId: { name, kills, drops } } }
  const STATE_KEY  = 'oa_droprate_state_v1'; // { running, plane, mobIndex }
  const KILLS_GOAL = 100;
  const LOG        = (...a) => console.log('[DropRate]', ...a);

  // ── Persistence ─────────────────────────────────────────────────────────────
  function loadData()  { try { return JSON.parse(localStorage.getItem(DATA_KEY)  || '{}'); } catch { return {}; } }
  function saveData(d) { try { localStorage.setItem(DATA_KEY,  JSON.stringify(d)); } catch {} }
  function loadState() { try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch { return null; } }
  function saveState(s){ try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch {} }
  function clearState(){ try { localStorage.removeItem(STATE_KEY); } catch {} }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function getCurrentPlane() {
    try { const v = localStorage.getItem('oa_last_plane_cache_v1'); if (v && v.trim()) return v.trim(); } catch {}
    // Fallback: combat_api current_plane (we already fetched it on load via the existing script)
    try { return window.__combatState?.currentPlane || 'unknown'; } catch {}
    return 'unknown';
  }

  function getMobOptions() {
    const sel = document.getElementById('monster-select');
    if (!sel) return [];
    return Array.from(sel.options)
      .filter(o => o.value && o.value !== '0' && o.getAttribute('data-monster-option') === '1' && !o.disabled)
      .map(o => ({ id: o.value, name: parseMobName(o.textContent) }));
  }

  function parseMobName(text) {
    // Strip "[300/300]" HP tags and "(Lvl X)" suffixes
    return text.replace(/\s*\[[\d/]+\]\s*/g, '').replace(/\s*\(Lvl\s*\d+\)\s*/gi, '').trim();
  }

  function getCurrentMobId() {
    const sel = document.getElementById('monster-select');
    return sel ? sel.value : null;
  }

  // Use the Beast HUD's built-in "Fight #" pin so the existing script enforces
  // the right mob for us (beasts still take priority as the tooltip notes).
  // The Fight # input is 1-based; our scanMobList is 0-based.
  function pinMobByIndex(zeroBasedIndex) {
    // Find the Fight # number input in the HUD
    const numInput = (() => {
      for (const el of document.querySelectorAll('input[type="number"]')) {
        if (el.placeholder && /1.*2.*3/i.test(el.placeholder)) return el;
        const row = el.closest('div');
        if (row && row.textContent.includes('Fight #')) return el;
      }
      return null;
    })();

    if (!numInput) {
      LOG('Fight # input not found — falling back to direct select');
      return pinMobDirect(zeroBasedIndex);
    }

    const fightNum = zeroBasedIndex + 1; // convert to 1-based
    numInput.value = String(fightNum);
    numInput.dispatchEvent(new Event('input',  { bubbles: true }));
    numInput.dispatchEvent(new Event('change', { bubbles: true }));

    // Find and click the adjacent Pin button
    const row = numInput.closest('div');
    const pinBtn = row && Array.from(row.querySelectorAll('button')).find(b =>
      b.textContent.trim() === 'Pin' || b.title?.toLowerCase().includes('pin this')
    );

    if (pinBtn) {
      pinBtn.click();
      LOG(`Pinned via HUD Fight #${fightNum}`);
    } else {
      LOG('Pin button not found — falling back');
      pinMobDirect(zeroBasedIndex);
    }
  }

  // Fallback: directly set monster-select (less reliable, existing script may override)
  function pinMobDirect(zeroBasedIndex) {
    const sel = document.getElementById('monster-select');
    if (!sel) return;
    const mob = scanMobList[zeroBasedIndex];
    if (!mob) return;
    sel.value = mob.id;
    sel.dispatchEvent(new Event('input',  { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    LOG(`Direct-selected mob ${mob.id}`);
  }

  // Clear the HUD pin when scan stops so normal autocombat resumes
  function clearHudPin() {
    const row = (() => {
      for (const el of document.querySelectorAll('input[type="number"]')) {
        if (el.placeholder && /1.*2.*3/i.test(el.placeholder)) return el.closest('div');
        const r = el.closest('div');
        if (r && r.textContent.includes('Fight #')) return r;
      }
      return null;
    })();
    if (!row) return;
    const clearBtn = Array.from(row.querySelectorAll('button')).find(b =>
      b.textContent.trim() === '✕' || b.title?.toLowerCase().includes('clear pin')
    );
    if (clearBtn) { clearBtn.click(); LOG('HUD pin cleared'); }
  }

  // No-op stubs so existing call sites don't break
  function startEnforcer() {}
  function stopEnforcer()  {}

  function selectMob(mobId) {
    const idx = scanMobList.findIndex(m => m.id === mobId);
    if (idx >= 0) pinMobByIndex(idx);
    LOG(`selectMob → index ${idx} id ${mobId}`);
    return true;
  }

  function ensurePlaneEntry(data, plane) {
    if (!data[plane]) data[plane] = {};
    return data[plane];
  }

  function ensureMobEntry(planeData, mobId, name) {
    if (!planeData[mobId]) planeData[mobId] = { name, kills: 0, drops: 0 };
    else if (name && planeData[mobId].name !== name) planeData[mobId].name = name; // keep name fresh
    return planeData[mobId];
  }

  function pct(mob) {
    if (!mob || !mob.kills) return 0;
    return (mob.drops / mob.kills) * 100;
  }

  // ── Scanner state ────────────────────────────────────────────────────────────
  let scanning     = false;
  let scanPlane    = '';
  let scanMobList  = [];   // [{id, name}] snapshot at scan start
  let scanMobIndex = 0;
  let obs          = null; // MutationObserver
  let _panel       = null;

  function setStatus(msg) {
    LOG(msg);
    const el = document.getElementById('oa-dr-status');
    if (el) el.textContent = msg;
  }

  function updateProgressUI() {
    const data  = loadData();
    const state = loadState();

    // Update the fight number pin display
    const pinEl = document.getElementById('oa-dr-fight-num');
    if (pinEl) {
      if (state && scanMobList.length > 0) {
        pinEl.textContent = `#${scanMobIndex + 1} / ${scanMobList.length}`;
        pinEl.style.color = '#d4af37';
      } else {
        pinEl.textContent = '—';
        pinEl.style.color = '#64748b';
      }
    }

    if (!state) return;
    const plane = state.plane;
    const pd    = data[plane] || {};

    const mob   = scanMobList[scanMobIndex];
    if (!mob) return;
    const entry = pd[mob.id];
    const kills = entry ? entry.kills : 0;

    const pEl = document.getElementById('oa-dr-progress');
    if (pEl) {
      pEl.textContent = `${mob.name} — ${kills}/${KILLS_GOAL} kills`;
    }
  }

  // ── Core: advance to next mob ────────────────────────────────────────────────
  function advanceToNextMob() {
    scanMobIndex++;
    if (scanMobIndex >= scanMobList.length) {
      // Done all mobs on this plane
      setStatus(`Scan complete for plane: ${scanPlane}`);
      scanning = false;
      clearState();
      stopObserver();
      renderResults();
      updateToggleBtn();
      return;
    }
    const next = scanMobList[scanMobIndex];
    saveState({ running: true, plane: scanPlane, mobIndex: scanMobIndex });
    setStatus(`Moving to: ${next.name} (${scanMobIndex + 1}/${scanMobList.length})`);
    // Small delay so autocombat finishes current fight
    setTimeout(() => {
      processedBatches = new Set();
      const logEl  = document.getElementById('combat-log');
      const chatEl = document.getElementById('chat-messages');
      if (logEl)  { lastCombatHtml = logEl.innerHTML; processedBatches.add(simpleHash(lastCombatHtml)); }
      if (chatEl) {
        let max = 0;
        for (const div of chatEl.querySelectorAll('[data-message-id]')) {
          const id = parseInt(div.getAttribute('data-message-id') || '0', 10);
          if (id > max) max = id;
        }
        lastSeenMsgId = max;
      }
      selectMob(next.id);
      startEnforcer();
      updateProgressUI();
    }, 1500);
  }

  // ── Salvage on inventory full ────────────────────────────────────────────────
  function doSalvageAll() {
    // Navigate to inventory tab and click salvage all
    const salvageUrl = '/game.php?tab=inventory';
    setStatus('Inventory full — salvaging...');
    scanning = false; // pause observer temporarily
    stopObserver();

    // Do it via fetch so we don't leave the combat page
    fetch(salvageUrl, { credentials: 'include' })
      .then(r => r.text())
      .then(html => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const btn = doc.querySelector('button[value="salvage_all_items"]');
        if (!btn) {
          LOG('No salvage button found on inventory page');
          resumeScanning();
          return;
        }
        const form = btn.closest('form');
        if (!form) { resumeScanning(); return; }
        const params = new URLSearchParams();
        for (const el of form.elements) {
          if (!el.name || el.disabled) continue;
          params.append(el.name, el.value);
        }
        params.set(btn.name || 'action', btn.value);
        return fetch('/game.php?tab=inventory', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });
      })
      .then(() => {
        LOG('Salvage done');
        setStatus('Salvaged — resuming scan...');
        setTimeout(resumeScanning, 1000);
      })
      .catch(e => {
        LOG('Salvage error:', e);
        resumeScanning();
      });
  }

  function resumeScanning() {
    if (!scanning) {
      scanning = true;
      startObserver();
      updateProgressUI();
    }
  }

  // ── Observers: combat-log for kills, chat-messages for drops ────────────────
  // Kills: combat-log replaces innerHTML wholesale each fight — hash-deduplicate.
  // Drops: chat-messages appends new [data-message-id] divs — track highest ID seen.

  let processedBatches = new Set();
  let lastCombatHtml   = '';
  let lastSeenMsgId    = 0;
  let chatObs          = null;

  function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    return h;
  }

  // ── Kill tracking (combat-log) ───────────────────────────────────────────────
  function processCombatLog(logEl) {
    if (!scanning) return;
    const html = logEl.innerHTML;
    if (html === lastCombatHtml) return;
    lastCombatHtml = html;

    const batchId = simpleHash(html);
    if (processedBatches.has(batchId)) return;
    processedBatches.add(batchId);
    if (processedBatches.size > 200) processedBatches = new Set([...processedBatches].slice(-100));

    const lines = Array.from(logEl.querySelectorAll('.log-line'));
    for (const node of lines) {
      const type = node.getAttribute('data-log-type') || '';
      const text = (node.textContent || '').trim();

      if (/inventory full/i.test(text)) {
        LOG('Inventory full (combat log)');
        doSalvageAll();
        return;
      }

      const mob = scanMobList[scanMobIndex];
      if (!mob) continue;

      if (type === 'monster-defeated') {
        const data  = loadData();
        const pd    = ensurePlaneEntry(data, scanPlane);
        const entry = ensureMobEntry(pd, mob.id, mob.name);
        entry.kills++;
        saveData(data);
        LOG(`Kill ${entry.kills}/${KILLS_GOAL} for ${mob.name}`);
        updateProgressUI();
        if (entry.kills >= KILLS_GOAL) {
          LOG(`${mob.name} done — advancing`);
          advanceToNextMob();
        }
      }
    }
  }

  // ── Drop tracking (chat-messages) ───────────────────────────────────────────
  function processChatNode(node) {
    if (!scanning) return;
    if (node.nodeType !== 1) return;

    // Handle both direct message divs and container replacements
    const msgDivs = node.hasAttribute && node.hasAttribute('data-message-id')
      ? [node]
      : Array.from(node.querySelectorAll ? node.querySelectorAll('[data-message-id]') : []);

    for (const div of msgDivs) {
      const msgId = parseInt(div.getAttribute('data-message-id') || '0', 10);
      if (!msgId || msgId <= lastSeenMsgId) continue;
      lastSeenMsgId = Math.max(lastSeenMsgId, msgId);

      const text = (div.textContent || '').trim();

      if (/inventory full/i.test(text)) {
        LOG('Inventory full (chat)');
        doSalvageAll();
        return;
      }

      if (/^you find a /i.test(text)) {
        const mob = scanMobList[scanMobIndex];
        if (!mob) continue;
        const data  = loadData();
        const pd    = ensurePlaneEntry(data, scanPlane);
        const entry = ensureMobEntry(pd, mob.id, mob.name);
        if (entry.kills > 0) {
          entry.drops++;
          saveData(data);
          LOG(`Drop for ${mob.name}: "${text}" (${entry.drops} total)`);
        }
      }
    }
  }

  function startObserver() {
    // ── Combat log observer (kills) ──────────────────────────────────────────
    const logEl = document.getElementById('combat-log');
    if (logEl && !obs) {
      lastCombatHtml = logEl.innerHTML;
      processedBatches.add(simpleHash(lastCombatHtml));
      obs = new MutationObserver(() => processCombatLog(logEl));
      obs.observe(logEl, { childList: true, subtree: true });
      LOG('Combat log observer started');
    }

    // ── Chat messages observer (drops) ───────────────────────────────────────
    const chatEl = document.getElementById('chat-messages');
    if (chatEl && !chatObs) {
      // Seed lastSeenMsgId from current messages so we don't count history
      const existing = chatEl.querySelectorAll('[data-message-id]');
      for (const div of existing) {
        const id = parseInt(div.getAttribute('data-message-id') || '0', 10);
        if (id > lastSeenMsgId) lastSeenMsgId = id;
      }
      LOG(`Chat observer started — seeded lastSeenMsgId=${lastSeenMsgId}`);

      chatObs = new MutationObserver(mutations => {
        for (const mut of mutations) {
          for (const node of mut.addedNodes) processChatNode(node);
        }
      });
      chatObs.observe(chatEl, { childList: true, subtree: true });
    } else if (!chatEl) {
      LOG('No #chat-messages found — drops will not be tracked');
    }
  }

  function stopObserver() {
    if (obs)     { obs.disconnect();     obs     = null; }
    if (chatObs) { chatObs.disconnect(); chatObs = null; }
    stopEnforcer();
  }

  // ── Start / stop scan ────────────────────────────────────────────────────────
  function startScan() {
    const mobs = getMobOptions();
    if (mobs.length === 0) { setStatus('No mobs available in monster-select'); return; }

    scanPlane    = getCurrentPlane();
    scanMobList  = mobs;
    scanMobIndex = 0;

    // Resume from saved state if same plane
    const saved = loadState();
    if (saved && saved.plane === scanPlane && saved.mobIndex < mobs.length) {
      scanMobIndex = saved.mobIndex;
      LOG('Resuming scan from mob', scanMobIndex);
    }

    scanning = true;
    saveState({ running: true, plane: scanPlane, mobIndex: scanMobIndex });

    const mob = scanMobList[scanMobIndex];
    selectMob(mob.id);
    startEnforcer();
    setStatus(`Scanning ${scanPlane} — mob ${scanMobIndex + 1}/${scanMobList.length}: ${mob.name}`);
    updateProgressUI();
    startObserver();
    renderResults();
    updateToggleBtn();
  }

  function stopScan() {
    scanning = false;
    stopObserver();
    clearHudPin();
    clearState();
    setStatus('Scan stopped');
    updateToggleBtn();
  }

  function updateToggleBtn() {
    const btn = document.getElementById('oa-dr-toggle');
    if (!btn) return;
    btn.textContent  = scanning ? '⏹ Stop Scan' : '▶ Start Scan';
    btn.style.background = scanning ? 'rgba(220,38,38,.85)' : 'rgba(22,163,74,.85)';
  }

  // ── Results visual ───────────────────────────────────────────────────────────
  function renderResults() {
    const container = document.getElementById('oa-dr-results');
    if (!container) return;

    const data = loadData();
    if (Object.keys(data).length === 0) {
      container.innerHTML = '<div style="color:#64748b;font-size:10px;text-align:center;padding:8px;">No data yet</div>';
      return;
    }

    let html = '';
    for (const [plane, mobs] of Object.entries(data)) {
      const mobEntries = Object.values(mobs).filter(m => m.kills > 0);
      if (mobEntries.length === 0) continue;

      // Sort by drop rate desc
      mobEntries.sort((a, b) => pct(b) - pct(a));
      const maxPct = pct(mobEntries[0]) || 1;

      html += `<div style="margin-bottom:12px;">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#d4af37;margin-bottom:6px;border-bottom:1px solid rgba(212,175,55,.3);padding-bottom:3px;">
          ${plane}
        </div>`;

      for (const mob of mobEntries) {
        const rate      = pct(mob);
        const barWidth  = maxPct > 0 ? (rate / maxPct) * 100 : 0;
        const incomplete = mob.kills < KILLS_GOAL;
        const color     = rate > 50 ? '#4ade80' : rate > 20 ? '#fbbf24' : rate > 0 ? '#f87171' : '#475569';
        const alpha     = incomplete ? '0.5' : '1';

        html += `<div style="margin-bottom:5px;opacity:${alpha};">
          <div style="display:flex;justify-content:space-between;font-size:9px;color:#cbd5e1;margin-bottom:2px;">
            <span>${mob.name}${incomplete ? ` <span style="color:#64748b">(${mob.kills}/${KILLS_GOAL})</span>` : ''}</span>
            <span style="color:${color};font-weight:600;">${rate.toFixed(1)}%</span>
          </div>
          <div style="height:4px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden;">
            <div style="height:100%;width:${barWidth}%;background:${color};border-radius:2px;transition:width .4s;"></div>
          </div>
        </div>`;
      }

      html += '</div>';
    }

    container.innerHTML = html || '<div style="color:#64748b;font-size:10px;text-align:center;padding:8px;">No data yet</div>';
  }

  // ── UI ───────────────────────────────────────────────────────────────────────
  function buildPanel() {
    document.getElementById('oa-droprate-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'oa-droprate-panel';
    panel.style.cssText = [
      'position:fixed;top:16px;left:16px;z-index:2147483639',
      'background:rgba(6,8,20,0.97)',
      'border:1px solid rgba(212,175,55,.45)',
      'border-radius:12px;padding:14px 16px',
      'color:#e2e8f0;font-family:Cinzel,Georgia,serif;font-size:12px',
      'width:280px;max-height:80vh',
      'box-shadow:0 6px 32px rgba(0,0,0,.8)',
      'display:flex;flex-direction:column;gap:8px',
      'user-select:none',
    ].join(';');

    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="font-weight:700;color:#d4af37;font-size:13px;">⚔ Drop Rate Scanner</span>
        <div style="display:flex;gap:6px;align-items:center;">
          <button id="oa-dr-clear" title="Clear data" style="background:none;border:1px solid rgba(255,255,255,.15);color:#64748b;cursor:pointer;font-size:9px;border-radius:4px;padding:2px 6px;">Clear</button>
          <button id="oa-dr-col" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:14px;padding:0 2px;">&minus;</button>
        </div>
      </div>
      <div id="oa-dr-body" style="display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
          <div id="oa-dr-status" style="font-size:10px;color:#94a3b8;flex:1;">Press Start to begin scanning mobs</div>
          <div style="display:flex;align-items:center;gap:4px;background:rgba(0,0,0,.4);border:1px solid rgba(212,175,55,.3);border-radius:6px;padding:3px 8px;white-space:nowrap;">
            <span style="font-size:9px;color:#64748b;">Fight#</span>
            <span id="oa-dr-fight-num" style="font-size:11px;font-weight:700;color:#64748b;">—</span>
          </div>
        </div>
        <div id="oa-dr-progress" style="font-size:10px;color:#64748b;"></div>
        <button id="oa-dr-toggle" style="width:100%;padding:7px;border-radius:8px;border:none;cursor:pointer;font-size:11px;font-weight:700;background:rgba(22,163,74,.85);color:#fff;">▶ Start Scan</button>
        <div style="font-size:9px;color:rgba(100,116,139,.5);border-top:1px solid rgba(255,255,255,.06);padding-top:6px;">
          Kills goal: ${KILLS_GOAL} per mob · Auto-salvages on full inventory
        </div>
        <div id="oa-dr-results" style="overflow-y:auto;max-height:50vh;padding-right:2px;">
          <div style="color:#64748b;font-size:10px;text-align:center;padding:8px;">No data yet</div>
        </div>
      </div>`;

    document.body.appendChild(panel);
    _panel = panel;

    panel.querySelector('#oa-dr-toggle').addEventListener('click', () => {
      if (scanning) stopScan(); else startScan();
    });

    panel.querySelector('#oa-dr-clear').addEventListener('click', () => {
      if (!confirm('Clear all drop rate data?')) return;
      saveData({});
      clearState();
      renderResults();
      setStatus('Data cleared');
    });

    let collapsed = false;
    panel.querySelector('#oa-dr-col').addEventListener('click', () => {
      collapsed = !collapsed;
      panel.querySelector('#oa-dr-body').style.display = collapsed ? 'none' : 'flex';
      panel.querySelector('#oa-dr-col').textContent = collapsed ? '+' : '−';
    });

    // Refresh results display every 2s while scanning
    setInterval(() => {
      if (scanning) { renderResults(); updateProgressUI(); }
    }, 2000);
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    if (new URLSearchParams(window.location.search).get('tab') !== 'combat') return;
    buildPanel();
    renderResults();

    // Auto-resume if a scan was in progress
    const saved = loadState();
    if (saved && saved.running) {
      LOG('Auto-resuming scan for plane', saved.plane);
      setTimeout(() => {
        // Wait for combat page to fully load before starting
        const mobs = getMobOptions();
        if (mobs.length > 0) startScan();
        else {
          setStatus('Waiting for monster list...');
          const wait = setInterval(() => {
            if (getMobOptions().length > 0) { clearInterval(wait); startScan(); }
          }, 1000);
        }
      }, 2000);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 600 + Math.random() * 200);

})();



})();
