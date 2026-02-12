<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>OlympusAwakened</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="csrf-token" content="bfea82eaa55379c6417569f75371a56f66172af7af2212a6a2e03ccdb7c0cee0">
  <link rel="icon" type="image/svg+xml" href="https://olympusawakened.com/assets/img/olympus-shield.svg">
  <link
    rel="stylesheet"
    href="https://olympusawakened.com/assets/css/tailwind.min.css?v=444"
  >
  <link
    rel="stylesheet"
    href="https://olympusawakened.com/assets/css/oa-theme.css?v=444"
  >
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=New+Rocker&display=swap"
  >
  <script src="https://olympusawakened.com/assets/js/core/app.min.js?v=444"></script>
</head>
<body class="oa-game-bg">
<script src="https://olympusawakened.com/assets/js/core/notifications.min.js?v=444"></script>
<script src="https://olympusawakened.com/assets/js/game/map-controls.min.js?v=444"></script>
<script src="https://olympusawakened.com/assets/js/game/quests-refresh.min.js?v=444"></script>
<script src="https://olympusawakened.com/assets/js/game/kingdoms.min.js?v=444"></script>
<div class="min-h-screen px-4 pt-2 pb-4">
  <div
    id="notification-toast"
    class="fixed left-1/2 top-1/3 transform -translate-x-1/2 bg-yellow-500 text-black px-6 py-3 rounded-lg shadow-lg text-sm font-semibold text-center hidden z-50"
    role="status"
    aria-live="polite"
    data-initial=""
  >
    <span id="notification-toast-text"></span>
  </div>

  <div class="max-w-screen-2xl mx-auto">
    <div
  class="oa-panel oa-panel--header rounded-lg px-4 pt-3 pb-5 lg:pb-6 mb-2 relative"
  data-hud-stat-mode="modified"
>
  <div class="mb-2 text-xs sm:text-sm text-gray-300 space-y-2">
    <div class="flex flex-wrap items-center gap-2 sm:gap-3">
      <div class="flex flex-wrap items-center gap-2 sm:gap-3">
        <div class="text-xl font-semibold oa-level-gold">
          Level <span id="player-level-value">110</span>
        </div>
        <div class="oa-currency-pill oa-currency-pill--gold text-xs sm:text-sm font-semibold">
          <span class="oa-currency-dot" aria-hidden="true"></span>
          <span id="player-gold-value">1,828,174,640 G</span>
        </div>
        <div class="flex items-center gap-2 text-xs sm:text-sm font-semibold">
          <div class="oa-currency-pill oa-currency-pill--drachma">
            <span class="oa-currency-dot" aria-hidden="true"></span>
            <span id="player-drachma-value">0 D</span>
          </div>
          <div class="oa-currency-pill oa-currency-pill--silver">
            <span class="oa-currency-dot" aria-hidden="true"></span>
            <span id="player-silver-value">3,450 S</span>
          </div>
          <a href="store.php" class="oa-chip oa-chip--active">
            Buy          </a>
          <div
            class="flex items-center gap-1 hidden"
            id="hud-event-badges"
          >
            <span
              class="oa-event-badge hidden"
              id="hud-exp-event-badge"
            >2x EXP</span>
            <span
              class="oa-event-badge oa-event-badge--gold hidden"
              id="hud-gold-event-badge"
            >2x GOLD</span>
          </div>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2 text-xs text-gray-300 mx-auto">
        <div class="text-left">Logged in as Andro</div>
        <div
          class="oa-chip"
          id="server-time"
          data-server-epoch="1770892724"
          data-server-utc-offset="-21600"
          title="Server time (America/Chicago)"
        >
          Server: 04:38        </div>
        <a
          href="game.php?tab=settings"
          class="oa-chip"
        >
          Settings
        </a>
                <form method="post" action="logout.php">
          <input type="hidden" name="csrf_token" value="bfea82eaa55379c6417569f75371a56f66172af7af2212a6a2e03ccdb7c0cee0">          <button
            type="submit"
            class="oa-chip"
          >
            Logout
          </button>
        </form>
      </div>
    </div>
        <div>
      <button
        type="button"
        data-open-stat-modal
        class="px-3 py-1 rounded-md text-xs font-semibold transition-colors bg-yellow-500 text-black hover:bg-yellow-400 hidden"
      >
        Allocate Stats
        <span
          data-stat-points-pill
          class="ml-2 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-black text-yellow-300"
        >0</span>
      </button>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-4 gap-2 items-start text-xs sm:text-sm text-gray-300">
    <!-- Column 1 -->
    <div class="space-y-3">
      <div class="text-xs text-gray-200 space-y-2">
        <div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1 text-gray-400">
              <span aria-hidden="true">&#10084;</span> HP
            </div>
            <span id="player-hp-text">16,861 / 24,340</span>
          </div>
          <div class="bg-gray-900 h-2 rounded-full overflow-hidden">
            <div id="player-hp-bar" class="bg-red-500 h-2" style="width: 69.272801972062%;"></div>
          </div>
        </div>
        <div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1 text-gray-400">
              <span aria-hidden="true">&#9889;</span> EXP
            </div>
            <span id="player-exp-text">0 / 0</span>
          </div>
          <div class="bg-gray-900 h-2 rounded-full overflow-hidden">
            <div id="player-exp-bar" class="bg-purple-500 h-2" style="width: 0%;"></div>
          </div>
        </div>
      </div>
      <div class="text-xs text-gray-300 pt-1">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1">
                                  <div class="flex items-baseline gap-2 py-0">
              <span class="font-semibold text-purple-200">DUR:</span>
              <span data-stat-value="durability">2,424</span>
            </div>
                                  <div class="flex items-baseline gap-2 py-0">
              <span class="font-semibold text-purple-200">STR:</span>
              <span data-stat-value="strength">2,120</span>
            </div>
                                  <div class="flex items-baseline gap-2 py-0">
              <span class="font-semibold text-purple-200">DEX:</span>
              <span data-stat-value="dexterity">2,047</span>
            </div>
                                  <div class="flex items-baseline gap-2 py-0">
              <span class="font-semibold text-purple-200">CON:</span>
              <span data-stat-value="concentration">6,435</span>
            </div>
                                  <div class="flex items-baseline gap-2 py-0">
              <span class="font-semibold text-purple-200">AGI:</span>
              <span data-stat-value="agility">1,829</span>
            </div>
                                  <div class="flex items-baseline gap-2 py-0">
              <span class="font-semibold text-purple-200">INT:</span>
              <span data-stat-value="intelligence">13,764</span>
            </div>
                                  <div class="flex items-baseline gap-2 py-0">
              <span class="font-semibold text-purple-200">PER:</span>
              <span data-stat-value="perception">1,720</span>
            </div>
                  </div>
      </div>
    </div>

    <!-- Column 4 / Mini-map -->
    <div
      class="flex flex-col items-center sm:items-end text-xs text-gray-400 mt-1 lg:mt-0 lg:absolute lg:top-0 lg:right-12"
      id="hud-location-card"
      data-plane-id="underworld"
      data-plane-width="50"
      data-plane-height="50"
      data-pos-x="26"
      data-pos-y="39"
    >
      <div class="mb-1 w-32 sm:w-40 mr-1 text-center">
        <div class="text-[11px] text-gray-300" id="hud-location-coords">Loc: 026,Und,039</div>
      </div>
      <div class="relative w-32 h-28 sm:w-40 sm:h-32 border border-green-500 overflow-hidden bg-gray-900">
        <img
          src="https://olympusawakened.com/assets/maps/underworld-map.jpg"
          alt="Mini map background"
          class="absolute inset-0 w-full h-full object-cover object-center opacity-60"
          data-mini-map-image="true"
        >
        <div class="absolute inset-0 bg-gradient-to-b from-black/20 to-black/60"></div>
        <div
          class="absolute w-6 h-6 text-amber-300 flex items-center justify-center text-lg leading-none drop-shadow-[0_0_8px_rgba(251,191,36,0.9)] transform -translate-x-1/2 -translate-y-1/2"
          style="left: 53%; top: 79%;"
          title="Your current location"
          data-mini-map-marker="true"
        >
          ⚔️
        </div>
      </div>
      <div class="mt-1 flex justify-center w-32 sm:w-40">
        <div class="inline-flex items-center gap-1.5 sm:gap-2" aria-label="Movement controls">
          <div class="inline-flex items-center gap-1">
            <!-- Up -->
            <form method="post" action="game.php" data-map-move-form>
              <input type="hidden" name="csrf_token" value="bfea82eaa55379c6417569f75371a56f66172af7af2212a6a2e03ccdb7c0cee0">              <input type="hidden" name="action" value="move_map">
              <input type="hidden" name="direction" value="north">
              <button
                type="submit"
                class="oa-map-btn w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center rounded-sm text-sm sm:text-xs"
                title="Move North"
              >
                &#8593;
              </button>
            </form>
            <!-- Down -->
            <form method="post" action="game.php" data-map-move-form>
              <input type="hidden" name="csrf_token" value="bfea82eaa55379c6417569f75371a56f66172af7af2212a6a2e03ccdb7c0cee0">              <input type="hidden" name="action" value="move_map">
              <input type="hidden" name="direction" value="south">
              <button
                type="submit"
                class="oa-map-btn w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center rounded-sm text-sm sm:text-xs"
                title="Move South"
              >
                &#8595;
              </button>
            </form>
            <!-- Left -->
            <form method="post" action="game.php" data-map-move-form>
              <input type="hidden" name="csrf_token" value="bfea82eaa55379c6417569f75371a56f66172af7af2212a6a2e03ccdb7c0cee0">              <input type="hidden" name="action" value="move_map">
              <input type="hidden" name="direction" value="west">
              <button
                type="submit"
                class="oa-map-btn w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center rounded-sm text-sm sm:text-xs"
                title="Move West"
              >
                &#8592;
              </button>
            </form>
            <!-- Right -->
            <form method="post" action="game.php" data-map-move-form>
              <input type="hidden" name="csrf_token" value="bfea82eaa55379c6417569f75371a56f66172af7af2212a6a2e03ccdb7c0cee0">              <input type="hidden" name="action" value="move_map">
              <input type="hidden" name="direction" value="east">
              <button
                type="submit"
                class="oa-map-btn w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center rounded-sm text-sm sm:text-xs"
                title="Move East"
              >
                &#8594;
              </button>
            </form>
          </div>
                      <div class="inline-flex items-center gap-1">
                                            <form method="post" action="game.php" data-plane-change-form>
                  <input type="hidden" name="csrf_token" value="bfea82eaa55379c6417569f75371a56f66172af7af2212a6a2e03ccdb7c0cee0">                  <input type="hidden" name="action" value="change_plane">
                  <input type="hidden" name="plane_source" value="hud">
                  <input type="hidden" name="plane_id" value="katabasis">
                  <button
                    type="submit"
                    class="oa-map-btn w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center rounded-sm text-sm sm:text-xs"
                    title="Ascend to Katabasis"
                  >
                    P&#8593;
                  </button>
                </form>
                          </div>
                  </div>
      </div>
    </div>
  </div>
</div>

<script src="https://olympusawakened.com/assets/js/components/header-panel.min.js?v=444"></script>
<script>
  (function updateServerClock() {
    const clock = document.getElementById('server-time');
    if (!clock) return;
    const epochSeconds = Number(clock.dataset.serverEpoch || 0);
    const utcOffsetSeconds = Number(clock.dataset.serverUtcOffset || 0);
    if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) return;
    if (!Number.isFinite(utcOffsetSeconds)) return;
    const offsetMs = (epochSeconds * 1000) - Date.now();
    const tzOffsetMs = utcOffsetSeconds * 1000;

    function render() {
      const serverNowMs = Date.now() + offsetMs;
      const displayMs = serverNowMs + tzOffsetMs;
      const now = new Date(displayMs);
      const hh = String(now.getUTCHours()).padStart(2, '0');
      const mm = String(now.getUTCMinutes()).padStart(2, '0');
      clock.textContent = `Server: ${hh}:${mm}`;
    }

    render();
    window.setInterval(render, 30000);
  })();
</script>

    <div class="oa-tabs flex flex-wrap gap-1.5 sm:gap-2 mb-2">
          <a
      href="game.php?tab=combat"
      class="px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm font-semibold transition-all oa-tab oa-tab--active" data-tab-id="combat" data-active-tab="1" data-tab-lockable="1"    >
      Combat    </a>
          <a
      href="game.php?tab=inventory"
      class="px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm font-semibold transition-all oa-tab" data-tab-id="inventory" data-tab-lockable="1"    >
      Inventory    </a>
          <a
      href="game.php?tab=shop"
      class="px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm font-semibold transition-all oa-tab" data-tab-id="shop" data-tab-lockable="1"    >
      Shop    </a>
          <a
      href="game.php?tab=market"
      class="px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm font-semibold transition-all oa-tab" data-tab-id="market" data-tab-lockable="1"    >
      Market    </a>
          <a
      href="game.php?tab=map"
      class="px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm font-semibold transition-all oa-tab" data-tab-id="map" data-tab-lockable="1"    >
      Map    </a>
          <a
      href="game.php?tab=quests"
      class="px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm font-semibold transition-all oa-tab" data-tab-id="quests" data-tab-lockable="1"    >
      Quests    </a>
          <a
      href="game.php?tab=kingdoms"
      class="px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm font-semibold transition-all oa-tab" data-tab-id="kingdoms" data-tab-lockable="1"    >
      Kingdoms    </a>
          <a
      href="clan.php"
      class="px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm font-semibold transition-all oa-tab" data-tab-id="clan" data-tab-lockable="1"    >
      Clan    </a>
          <a
      href="game.php?tab=crafting"
      class="px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm font-semibold transition-all oa-tab" data-tab-id="crafting" data-tab-lockable="1"    >
      Crafting    </a>
          <a
      href="skills.php"
      class="px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm font-semibold transition-all oa-tab" data-tab-id="skills" data-tab-lockable="1"    >
      Skills    </a>
  </div>

<script
  id="tournament-lock-config"
  data-tournament-lock="1"
  data-is-staff="0"
  data-tournament-status="https://olympusawakened.com/api/tournament_status.php"
  data-tournament-redirect="https://olympusawakened.com/game.php?tab=tournament"
  data-tournament-poll="3000"
></script>
<script src="https://olympusawakened.com/assets/js/core/tournament-lock.min.js?v=444"></script>

<script>
  (function initTabScrollPersistence() {
    try {
      if (!window.sessionStorage) return;
      var restoreKey = 'game_tab_scroll_restore';
      var yKey = 'game_tab_scroll_y';
      var tabs = document.querySelectorAll('[data-tab-id]');
      tabs.forEach(function (link) {
        link.addEventListener('click', function () {
          try {
            var y = window.scrollY || window.pageYOffset || 0;
            window.sessionStorage.setItem(yKey, String(y));
            window.sessionStorage.setItem(restoreKey, '1');
          } catch (e) {
            // Ignore storage failures.
          }
        });
      });

      if (window.sessionStorage.getItem(restoreKey) === '1') {
        var stored = window.sessionStorage.getItem(yKey);
        if (stored !== null) {
          var y = parseInt(stored, 10);
          if (!Number.isNaN(y)) {
            window.scrollTo(0, y);
          }
        }
        window.sessionStorage.removeItem(restoreKey);
      }
    } catch (e) {
      // Fail silently.
    }
  })();
</script>

    
                      
<div
  class="oa-panel p-4 rounded-lg text-sm"
  data-combat-config="{&quot;inCombat&quot;:false,&quot;currentMonsterId&quot;:null,&quot;lastMonsterId&quot;:1313,&quot;playerHp&quot;:16861,&quot;playerMaxHp&quot;:24340,&quot;playerGold&quot;:1828174640,&quot;playerSilver&quot;:3450,&quot;playerExp&quot;:0,&quot;playerExpToNext&quot;:0,&quot;playerLevel&quot;:110,&quot;statPoints&quot;:0,&quot;playerId&quot;:164,&quot;abilityName&quot;:&quot;&quot;,&quot;abilityDesc&quot;:&quot;&quot;,&quot;beasts&quot;:[],&quot;logTypeClasses&quot;:{&quot;player-critical&quot;:&quot;text-red-400 font-semibold&quot;,&quot;player-weapon-mismatch&quot;:&quot;text-amber-200 italic&quot;},&quot;useRoundLogView&quot;:true,&quot;actionDelayMs&quot;:500,&quot;defaultDelayMs&quot;:3000,&quot;nextActionTs&quot;:1770892669,&quot;nextActionTsMs&quot;:1770892669000,&quot;planeId&quot;:&quot;underworld&quot;,&quot;isTournamentPlane&quot;:false,&quot;avatars&quot;:{&quot;player&quot;:{&quot;show&quot;:true,&quot;show_setting&quot;:true,&quot;has_avatar&quot;:true,&quot;id&quot;:2,&quot;name&quot;:&quot;Mage-Default&quot;,&quot;display_name&quot;:&quot;Andro&quot;,&quot;src&quot;:&quot;https://olympusawakened.com/avatar_image.php?file=mage.png&quot;},&quot;opponent&quot;:null,&quot;is_pvp&quot;:false},&quot;autoCombat&quot;:{&quot;unlocked&quot;:true,&quot;maxMinutes&quot;:0,&quot;maxDeaths&quot;:50,&quot;enabled&quot;:true,&quot;dailyLimitMinutes&quot;:1440,&quot;dailyRemainingSeconds&quot;:73054}}"
>
  <div id="combat-delay-indicator" class="mb-4 transition-opacity duration-150" aria-live="polite">
    <div
      id="combat-delay-track"
      class="w-full h-3 rounded border border-red-500/70 bg-slate-900 relative overflow-hidden"
    >
      <div
        id="combat-delay-fill"
        class="absolute inset-y-0 left-0 bg-gradient-to-r from-red-700 via-red-500 to-red-400 shadow-[0_0_12px_rgba(248,113,113,0.8)] transition-[width,opacity] duration-150 ease-linear"
        style="width: 0%; opacity: 0;"
      ></div>
    </div>
  </div>

  <div class="oa-combat-shell bg-gray-900/80 p-3 rounded-lg">

    <!-- Enemy select + main button -->
    <div class="flex flex-col md:flex-row gap-2 mb-2 items-stretch">
      <select
        id="monster-select"
        class="oa-input flex-1 px-2 py-2 rounded text-xs"
        data-last-selected="1313"
      >
                  <option value="">-- Select Enemy --</option>
                    <optgroup label="Beasts Nearby" id="beast-options-group">
                      </optgroup>
                                  <option
              value="1264"
              data-ability-name="Grave Mending"
              data-ability-desc="20% chance to heal 8% of max HP after being hit."
              data-monster-option="1"
              data-monster-name="Ashen Wraith"
              data-monster-level="101"
                          >
              Ashen Wraith (Lvl 101)
            </option>
                                  <option
              value="1265"
              data-ability-name="Bone Ward"
              data-ability-desc="Blocks 20 damage from incoming attacks."
              data-monster-option="1"
              data-monster-name="Stygian Reaper"
              data-monster-level="102"
                          >
              Stygian Reaper (Lvl 102)
            </option>
                                  <option
              value="1266"
              data-ability-name="Stygian Lash"
              data-ability-desc="25% chance to deal +45 shadow damage."
              data-monster-option="1"
              data-monster-name="Bonechill Stalker"
              data-monster-level="103"
                          >
              Bonechill Stalker (Lvl 103)
            </option>
                                  <option
              value="1267"
              data-ability-name="Venom Gash"
              data-ability-desc="30% chance to deal +35 poison damage."
              data-monster-option="1"
              data-monster-name="Graveborn Marauder"
              data-monster-level="104"
                          >
              Graveborn Marauder (Lvl 104)
            </option>
                                  <option
              value="1268"
              data-ability-name="Hellrage"
              data-ability-desc="Below 40% HP, attacks deal 40% more damage."
              data-monster-option="1"
              data-monster-name="Obsidian Ravager"
              data-monster-level="105"
                          >
              Obsidian Ravager (Lvl 105)
            </option>
                                  <option
              value="1269"
              data-ability-name="Grim Spear"
              data-ability-desc="25% chance to deal +40 damage."
              data-monster-option="1"
              data-monster-name="River Styx Ferryman"
              data-monster-level="106"
                          >
              River Styx Ferryman (Lvl 106)
            </option>
                                  <option
              value="1270"
              data-ability-name="Cinder Hex"
              data-ability-desc="20% chance to deal +50 fire damage."
              data-monster-option="1"
              data-monster-name="Erebos Shade"
              data-monster-level="107"
                          >
              Erebos Shade (Lvl 107)
            </option>
                                  <option
              value="1271"
              data-ability-name="Erebos Grasp"
              data-ability-desc="20% chance to deal +55 shadow damage."
              data-monster-option="1"
              data-monster-name="Pitcrawler Fiend"
              data-monster-level="108"
                          >
              Pitcrawler Fiend (Lvl 108)
            </option>
                                  <option
              value="1272"
              data-ability-name="Grave Mending"
              data-ability-desc="20% chance to heal 8% of max HP after being hit."
              data-monster-option="1"
              data-monster-name="Tarnished Legionary"
              data-monster-level="109"
                          >
              Tarnished Legionary (Lvl 109)
            </option>
                                  <option
              value="1273"
              data-ability-name="Bone Ward"
              data-ability-desc="Blocks 20 damage from incoming attacks."
              data-monster-option="1"
              data-monster-name="Cryptfang Ghoul"
              data-monster-level="110"
                          >
              Cryptfang Ghoul (Lvl 110)
            </option>
                                  <option
              value="1274"
              data-ability-name="Stygian Lash"
              data-ability-desc="25% chance to deal +45 shadow damage."
              data-monster-option="1"
              data-monster-name="Soulchain Binder"
              data-monster-level="111"
                          >
              Soulchain Binder (Lvl 111)
            </option>
                                  <option
              value="1275"
              data-ability-name="Venom Gash"
              data-ability-desc="30% chance to deal +35 poison damage."
              data-monster-option="1"
              data-monster-name="Bloodmist Hunter"
              data-monster-level="112"
                          >
              Bloodmist Hunter (Lvl 112)
            </option>
                                  <option
              value="1276"
              data-ability-name="Hellrage"
              data-ability-desc="Below 40% HP, attacks deal 40% more damage."
              data-monster-option="1"
              data-monster-name="Dreadforge Brute"
              data-monster-level="113"
                          >
              Dreadforge Brute (Lvl 113)
            </option>
                                  <option
              value="1277"
              data-ability-name="Grim Spear"
              data-ability-desc="25% chance to deal +40 damage."
              data-monster-option="1"
              data-monster-name="Blackflame Hexer"
              data-monster-level="114"
                          >
              Blackflame Hexer (Lvl 114)
            </option>
                                  <option
              value="1278"
              data-ability-name="Cinder Hex"
              data-ability-desc="20% chance to deal +50 fire damage."
              data-monster-option="1"
              data-monster-name="Tombward Sentinel"
              data-monster-level="115"
                          >
              Tombward Sentinel (Lvl 115)
            </option>
                                  <option
              value="1279"
              data-ability-name="Erebos Grasp"
              data-ability-desc="20% chance to deal +55 shadow damage."
              data-monster-option="1"
              data-monster-name="Hades Gatekeeper"
              data-monster-level="116"
                          >
              Hades Gatekeeper (Lvl 116)
            </option>
                                  <option
              value="1280"
              data-ability-name="Grave Mending"
              data-ability-desc="20% chance to heal 8% of max HP after being hit."
              data-monster-option="1"
              data-monster-name="Tartarus Warden"
              data-monster-level="117"
                          >
              Tartarus Warden (Lvl 117)
            </option>
                                  <option
              value="1281"
              data-ability-name="Bone Ward"
              data-ability-desc="Blocks 20 damage from incoming attacks."
              data-monster-option="1"
              data-monster-name="Undercrypt Slicer"
              data-monster-level="118"
                          >
              Undercrypt Slicer (Lvl 118)
            </option>
                                  <option
              value="1282"
              data-ability-name="Stygian Lash"
              data-ability-desc="25% chance to deal +45 shadow damage."
              data-monster-option="1"
              data-monster-name="Chthonic Assassin"
              data-monster-level="119"
                          >
              Chthonic Assassin (Lvl 119)
            </option>
                                  <option
              value="1283"
              data-ability-name="Venom Gash"
              data-ability-desc="30% chance to deal +35 poison damage."
              data-monster-option="1"
              data-monster-name="Doomveil Adept"
              data-monster-level="120"
                          >
              Doomveil Adept (Lvl 120)
            </option>
                                  <option
              value="1284"
              data-ability-name="Hellrage"
              data-ability-desc="Below 40% HP, attacks deal 40% more damage."
              data-monster-option="1"
              data-monster-name="Hellbrand Spearman"
              data-monster-level="121"
                          >
              Hellbrand Spearman (Lvl 121)
            </option>
                                  <option
              value="1285"
              data-ability-name="Grim Spear"
              data-ability-desc="25% chance to deal +40 damage."
              data-monster-option="1"
              data-monster-name="Sepulcher Knight"
              data-monster-level="122"
                          >
              Sepulcher Knight (Lvl 122)
            </option>
                                  <option
              value="1286"
              data-ability-name="Cinder Hex"
              data-ability-desc="20% chance to deal +50 fire damage."
              data-monster-option="1"
              data-monster-name="Shadowroot Horror"
              data-monster-level="123"
                          >
              Shadowroot Horror (Lvl 123)
            </option>
                                  <option
              value="1287"
              data-ability-name="Erebos Grasp"
              data-ability-desc="20% chance to deal +55 shadow damage."
              data-monster-option="1"
              data-monster-name="Ebonclaw Skirmisher"
              data-monster-level="124"
                          >
              Ebonclaw Skirmisher (Lvl 124)
            </option>
                                  <option
              value="1288"
              data-ability-name="Grave Mending"
              data-ability-desc="20% chance to heal 8% of max HP after being hit."
              data-monster-option="1"
              data-monster-name="Necrotic Herald"
              data-monster-level="125"
                          >
              Necrotic Herald (Lvl 125)
            </option>
                                  <option
              value="1289"
              data-ability-name="Bone Ward"
              data-ability-desc="Blocks 20 damage from incoming attacks."
              data-monster-option="1"
              data-monster-name="Gloomspire Watcher"
              data-monster-level="126"
                          >
              Gloomspire Watcher (Lvl 126)
            </option>
                                  <option
              value="1290"
              data-ability-name="Stygian Lash"
              data-ability-desc="25% chance to deal +45 shadow damage."
              data-monster-option="1"
              data-monster-name="Woegrim Berserker"
              data-monster-level="127"
                          >
              Woegrim Berserker (Lvl 127)
            </option>
                                  <option
              value="1291"
              data-ability-name="Venom Gash"
              data-ability-desc="30% chance to deal +35 poison damage."
              data-monster-option="1"
              data-monster-name="Ashriver Ravager"
              data-monster-level="128"
                          >
              Ashriver Ravager (Lvl 128)
            </option>
                                  <option
              value="1292"
              data-ability-name="Hellrage"
              data-ability-desc="Below 40% HP, attacks deal 40% more damage."
              data-monster-option="1"
              data-monster-name="Dreadmarrow Stalker"
              data-monster-level="129"
                          >
              Dreadmarrow Stalker (Lvl 129)
            </option>
                                  <option
              value="1293"
              data-ability-name="Grim Spear"
              data-ability-desc="25% chance to deal +40 damage."
              data-monster-option="1"
              data-monster-name="Cinderbone Reaver"
              data-monster-level="130"
                          >
              Cinderbone Reaver (Lvl 130)
            </option>
                                  <option
              value="1294"
              data-ability-name="Cinder Hex"
              data-ability-desc="20% chance to deal +50 fire damage."
              data-monster-option="1"
              data-monster-name="Gravebell Caller"
              data-monster-level="131"
                          >
              Gravebell Caller (Lvl 131)
            </option>
                                  <option
              value="1295"
              data-ability-name="Erebos Grasp"
              data-ability-desc="20% chance to deal +55 shadow damage."
              data-monster-option="1"
              data-monster-name="Blackened Hoplite"
              data-monster-level="132"
                          >
              Blackened Hoplite (Lvl 132)
            </option>
                                  <option
              value="1296"
              data-ability-name="Grave Mending"
              data-ability-desc="20% chance to heal 8% of max HP after being hit."
              data-monster-option="1"
              data-monster-name="Styxbound Enforcer"
              data-monster-level="133"
                          >
              Styxbound Enforcer (Lvl 133)
            </option>
                                  <option
              value="1297"
              data-ability-name="Bone Ward"
              data-ability-desc="Blocks 20 damage from incoming attacks."
              data-monster-option="1"
              data-monster-name="Ironmask Jailor"
              data-monster-level="134"
                          >
              Ironmask Jailor (Lvl 134)
            </option>
                                  <option
              value="1298"
              data-ability-name="Stygian Lash"
              data-ability-desc="25% chance to deal +45 shadow damage."
              data-monster-option="1"
              data-monster-name="Chainbound Tormentor"
              data-monster-level="135"
                          >
              Chainbound Tormentor (Lvl 135)
            </option>
                                  <option
              value="1299"
              data-ability-name="Venom Gash"
              data-ability-desc="30% chance to deal +35 poison damage."
              data-monster-option="1"
              data-monster-name="Ebon Warden"
              data-monster-level="136"
                          >
              Ebon Warden (Lvl 136)
            </option>
                                  <option
              value="1300"
              data-ability-name="Hellrage"
              data-ability-desc="Below 40% HP, attacks deal 40% more damage."
              data-monster-option="1"
              data-monster-name="Obsidian Colossus"
              data-monster-level="137"
                          >
              Obsidian Colossus (Lvl 137)
            </option>
                                  <option
              value="1301"
              data-ability-name="Grim Spear"
              data-ability-desc="25% chance to deal +40 damage."
              data-monster-option="1"
              data-monster-name="Nightveil Lurker"
              data-monster-level="138"
                          >
              Nightveil Lurker (Lvl 138)
            </option>
                                  <option
              value="1302"
              data-ability-name="Cinder Hex"
              data-ability-desc="20% chance to deal +50 fire damage."
              data-monster-option="1"
              data-monster-name="Plagueborn Ravager"
              data-monster-level="139"
                          >
              Plagueborn Ravager (Lvl 139)
            </option>
                                  <option
              value="1303"
              data-ability-name="Erebos Grasp"
              data-ability-desc="20% chance to deal +55 shadow damage."
              data-monster-option="1"
              data-monster-name="Bonewarden Captain"
              data-monster-level="140"
                          >
              Bonewarden Captain (Lvl 140)
            </option>
                                  <option
              value="1304"
              data-ability-name="Grave Mending"
              data-ability-desc="20% chance to heal 8% of max HP after being hit."
              data-monster-option="1"
              data-monster-name="Mournblade Duelist"
              data-monster-level="141"
                          >
              Mournblade Duelist (Lvl 141)
            </option>
                                  <option
              value="1305"
              data-ability-name="Bone Ward"
              data-ability-desc="Blocks 20 damage from incoming attacks."
              data-monster-option="1"
              data-monster-name="Phlegethon Flamekeeper"
              data-monster-level="142"
                          >
              Phlegethon Flamekeeper (Lvl 142)
            </option>
                                  <option
              value="1306"
              data-ability-name="Stygian Lash"
              data-ability-desc="25% chance to deal +45 shadow damage."
              data-monster-option="1"
              data-monster-name="Shadehost Vanguard"
              data-monster-level="143"
                          >
              Shadehost Vanguard (Lvl 143)
            </option>
                                  <option
              value="1307"
              data-ability-name="Venom Gash"
              data-ability-desc="30% chance to deal +35 poison damage."
              data-monster-option="1"
              data-monster-name="Nethercoil Serpent"
              data-monster-level="144"
                          >
              Nethercoil Serpent (Lvl 144)
            </option>
                                  <option
              value="1308"
              data-ability-name="Hellrage"
              data-ability-desc="Below 40% HP, attacks deal 40% more damage."
              data-monster-option="1"
              data-monster-name="Hollow Throne Guard"
              data-monster-level="145"
                          >
              Hollow Throne Guard (Lvl 145)
            </option>
                                  <option
              value="1309"
              data-ability-name="Grim Spear"
              data-ability-desc="25% chance to deal +40 damage."
              data-monster-option="1"
              data-monster-name="Hades Enforcer"
              data-monster-level="146"
                          >
              Hades Enforcer (Lvl 146)
            </option>
                                  <option
              value="1310"
              data-ability-name="Cinder Hex"
              data-ability-desc="20% chance to deal +50 fire damage."
              data-monster-option="1"
              data-monster-name="Doomgate Leviathan"
              data-monster-level="147"
                          >
              Doomgate Leviathan (Lvl 147)
            </option>
                                  <option
              value="1311"
              data-ability-name="Erebos Grasp"
              data-ability-desc="20% chance to deal +55 shadow damage."
              data-monster-option="1"
              data-monster-name="Erebus Harrier"
              data-monster-level="148"
                          >
              Erebus Harrier (Lvl 148)
            </option>
                                  <option
              value="1312"
              data-ability-name="Grave Mending"
              data-ability-desc="20% chance to heal 8% of max HP after being hit."
              data-monster-option="1"
              data-monster-name="Casketborne Marauder"
              data-monster-level="149"
                          >
              Casketborne Marauder (Lvl 149)
            </option>
                                  <option
              value="1313"
              data-ability-name="Bone Ward"
              data-ability-desc="Blocks 20 damage from incoming attacks."
              data-monster-option="1"
              data-monster-name="Underworld Paragon"
              data-monster-level="150"
                          >
              Underworld Paragon (Lvl 150)
            </option>
                        </select>
      <button
        id="combat-main-button"
        type="button"
        class="oa-button oa-button--primary px-2.5 py-2 font-semibold text-xs"
      >
        Start (F)      </button>
      <div class="flex items-center gap-1">
        <button
          id="auto-combat-toggle"
          type="button"
          class="oa-button oa-button--muted px-2.5 py-2 font-semibold text-[11px] hidden relative group"
          aria-describedby="auto-combat-tooltip"
        >
          <span id="auto-combat-label">Auto: Off</span>
          <span
            id="auto-combat-tooltip"
            class="absolute top-full right-0 mt-0.5 whitespace-nowrap rounded border border-gray-700 bg-gray-900/95 px-2 py-1 text-[10px] text-gray-200 opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100"
          >
            --:--
          </span>
        </button>
      </div>
    </div>

    <!-- Center display -->
        <div class="oa-combat-layout mb-0.5 text-xs">
      <div class="oa-combat-side">
        <div
          id="combat-player-avatar"
          class="oa-avatar-card "
          data-avatar-slot="player"
        >
          <div class="oa-avatar-frame">
            <img
              class="oa-avatar-img "
              data-avatar-image="1"
              src="https://olympusawakened.com/avatar_image.php?file=mage.png"
              alt="Mage-Default"
            >
            <div class="oa-avatar-fallback hidden" data-avatar-fallback="1">
              No Avatar
            </div>
          </div>
          <div class="oa-avatar-name" data-avatar-name="1">You</div>
        </div>
      </div>
      <div class="oa-combat-main">
        <div class="oa-combat-center flex flex-col items-center gap-1">
          <div
            id="combat-placeholder"
            class="flex flex-col items-center py-2 text-gray-400  w-full max-w-[360px]"
          >
            <span class="font-semibold">No enemy selected</span>
          </div>

          <div id="combat-active" class="hidden flex flex-col items-center text-center">
            <div class="text-sm mb-0.5 flex items-center gap-1 justify-center">
              <span aria-hidden="true">&#9876;</span>
              <span>VS</span>
              <span aria-hidden="true">&#9876;</span>
              <span id="combat-monster-name" class="font-semibold">
                ??                              </span>
            </div>
            <div id="combat-monster-ability" class="text-[9px] text-gray-400 mb-1">
                              <span class="text-gray-500">No special ability.</span>
                          </div>
                        <div class="flex items-center gap-2 w-full justify-center mb-0.5">
              <span aria-hidden="true">&hearts;</span>
              <div class="w-48 bg-gray-800/80 h-3 rounded-full overflow-hidden border border-red-500/40">
                <div
                  id="combat-hp-bar"
                  class="bg-red-500 h-3"
                  style="width: 0%;"
                ></div>
              </div>
              <span id="combat-hp-text" class="text-[11px]">
                                  0 / 0
                              </span>
            </div>
          </div>

          <!-- Log (current view) -->
          <div
            id="combat-log"
            class="oa-combat-log text-[10px] mb-1 w-full max-w-[360px] hidden overflow-hidden px-1 bg-transparent border-0">
                                  </div>
        </div>

        <style>
          #combat-log .log-line[data-log-type="player-dodge"] {
            color: #facc15 !important;
          }
          #combat-log .log-line[data-log-type="monster-ability"] {
            color: #f97316 !important;
            font-style: italic;
          }
          #combat-log .pvp-target-link {
            cursor: pointer;
            text-decoration: underline;
            text-underline-offset: 1px;
          }
          #combat-log .pvp-target-link:hover {
            color: #fbbf24 !important;
          }
        </style>

      </div>

      <div class="oa-combat-side">
        <div
          id="combat-enemy-avatar"
          class="oa-avatar-card oa-avatar-card--off"
          data-avatar-slot="opponent"
        >
          <div class="oa-avatar-frame">
            <img
              class="oa-avatar-img hidden"
              data-avatar-image="1"
              src=""
              alt="Opponent avatar"
            >
            <div class="oa-avatar-fallback " data-avatar-fallback="1">
              No Avatar
            </div>
          </div>
          <div class="oa-avatar-name" data-avatar-name="1">Opponent</div>
        </div>
      </div>
    </div>

    <!-- Potions (still normal POST for now) -->
    <div class="mt-2">
      <h3 class="text-amber-200 font-semibold mb-1 text-xs">Potions</h3>
              <div class="flex flex-wrap gap-2">
                      <div class="text-gray-400 text-[11px]">No potions in inventory.</div>
                  </div>
          </div>

    <!-- Timed Boosts -->
        <div
      class="mt-3"
      data-boost-section
      data-boost-active="0"
    >
      <h3 class="text-amber-200 font-semibold mb-1 text-xs">Timed Boosts</h3>
                              <div class="flex flex-wrap gap-2">
                                <div class="text-gray-400 text-[11px]">No timed boosts in inventory.</div>
                  </div>
          </div>

    <!-- Revive (handled via combat.js / AJAX) -->
    <div
      id="revive-panel"
      class="mt-2 hidden"
    >
      <form method="post" onsubmit="return false;">
        <input type="hidden" name="csrf_token" value="bfea82eaa55379c6417569f75371a56f66172af7af2212a6a2e03ccdb7c0cee0">        <button
          type="button"
          id="revive-button"
          class="oa-button oa-button--primary px-3 py-1 text-xs"
        >
          Revive (-10g)
        </button>
      </form>
    </div>
  </div>
</div>

<div
  id="botcheck-modal"
  class="fixed inset-0 z-50 hidden items-center justify-center"
  role="dialog"
  aria-modal="true"
  aria-labelledby="botcheck-title"
>
  <div class="absolute inset-0 bg-black/70" data-botcheck-overlay></div>
  <div class="relative flex items-center justify-center min-h-full p-4">
    <div class="oa-panel oa-panel--header w-full max-w-sm rounded-2xl p-6 text-gray-100 shadow-2xl border border-amber-200/30 space-y-4">
      <div class="space-y-2">
        <div class="oa-chip inline-flex">Security Check</div>
        <h2 id="botcheck-title" class="text-xl font-semibold text-amber-200">Confirm you're human</h2>
        <p class="text-sm text-gray-300" data-botcheck-instruction>Enter the 6-character code shown in the image to continue fighting.</p>
      </div>
      <div class="text-center">
        <img
          class="mx-auto h-16 w-48 rounded-md border border-white/10 bg-slate-900/60"
          alt="Security check code"
          data-botcheck-image
        >
        <div class="text-xs text-gray-400 mt-2" data-botcheck-timer>Time left: 10s</div>
        <button
          type="button"
          class="mt-2 text-[11px] text-amber-200 underline underline-offset-2"
          data-botcheck-refresh
        >Refresh code</button>
      </div>
      <div class="space-y-2">
        <input
          type="text"
          inputmode="text"
          pattern="[A-HJ-NP-Z2-9]{6}"
          maxlength="6"
          placeholder="6-character code"
          class="w-full rounded-lg border border-white/10 px-3 py-2 text-center text-lg tracking-[0.3em]"
          style="background-color:#111827;color:#f9fafb;text-transform:uppercase;"
          data-botcheck-input
        >
        <div class="text-xs text-red-300 hidden" data-botcheck-error></div>
      </div>
      <button
        type="button"
        class="oa-button oa-button--primary w-full py-2 text-[11px] font-semibold"
        data-botcheck-submit
      >Verify & Continue</button>
    </div>
  </div>
</div>

<script src="https://olympusawakened.com/assets/js/game/combat.min.js?v=444"></script>
<script>
(() => {
  const timerEl = document.querySelector('[data-boost-timer]');
  if (!timerEl) return;
  const untilMs = Number(timerEl.getAttribute('data-boost-until-ms') || 0);
  const serverMs = Number(timerEl.getAttribute('data-server-time-ms') || 0);
  if (!untilMs || !serverMs) return;
  const name = timerEl.getAttribute('data-boost-name') || 'Timed Boost';
  const start = Date.now();
  const boostButtons = document.querySelectorAll('[data-boost-button]');
  const boostSection = document.querySelector('[data-boost-section]');
  const boostActive = boostSection?.getAttribute('data-boost-active') === '1';
  const setButtonsEnabled = (enabled) => {
    if (!boostButtons || boostButtons.length === 0) return;
    boostButtons.forEach((button) => {
      if (button instanceof HTMLButtonElement) {
        button.disabled = !enabled;
      }
      if (enabled) {
        button.removeAttribute('disabled');
        button.classList.remove('opacity-60', 'cursor-not-allowed');
        button.removeAttribute('aria-disabled');
      } else {
        button.classList.add('opacity-60', 'cursor-not-allowed');
        button.setAttribute('disabled', 'disabled');
        button.setAttribute('aria-disabled', 'true');
      }
    });
  };

  const render = () => {
    const nowMs = serverMs + (Date.now() - start);
    const remainingMs = untilMs - nowMs;
    if (remainingMs <= 0) {
      timerEl.textContent = `Active: ${name} (expired)`;
      setButtonsEnabled(true);
      return;
    }
    const totalSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    timerEl.textContent = `Active: ${name} (${minutes}m ${seconds}s)`;
    setButtonsEnabled(false);
  };

  if (boostActive) {
    setButtonsEnabled(false);
  }

  render();
  setInterval(render, 1000);
})();
</script>
      <div class="mt-4 oa-panel p-4 rounded-lg">
  <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
    <div class="flex flex-col gap-2 w-full sm:flex-row sm:items-center sm:gap-3">
      <div class="flex items-center gap-2 text-sm font-semibold text-amber-200">
        <span>💬</span>
        <span>Global Chat</span>
      </div>
      <form id="chat-form" class="flex-1 flex gap-2 items-center w-full" method="post" action="api/chat_api.php">
        <input type="hidden" name="csrf_token" value="bfea82eaa55379c6417569f75371a56f66172af7af2212a6a2e03ccdb7c0cee0">        <input
          type="text"
          name="message"
          id="chat-input"
          class="oa-input flex-1 px-3 py-2 rounded text-xs"
          placeholder="Type a message..."
          maxlength="300"
          autocomplete="off"
        >
                <button
          type="submit"
          class="oa-button oa-button--primary px-4 py-2 text-xs font-semibold"
        >
          Send
        </button>
      </form>
    </div>
  </div>

  <div
    id="chat-messages"
    class="bg-black/90 border border-amber-500/40 rounded-md mb-3 p-2 h-72 md:h-80 overflow-y-auto text-sm"
  >
    <div class="text-gray-500">Loading chat…</div>
  </div>

<style>
  #chat-messages {
    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* IE/Edge */
  }
  #chat-messages::-webkit-scrollbar {
    display: none; /* Chrome/Safari */
  }
  .text-purple-300.chat-player-name {
    /* Default player name color; per-user inline colors still override this. */
    color: #D8B4FE;
  }
  .chat-player-name {
    cursor: pointer !important;
  }
  .chat-sub-badge {
    color: #FCD34D;
    margin-left: 2px;
    font-size: 0.85em;
    display: inline-flex;
    align-items: center;
    vertical-align: middle;
  }
  .chat-sub-badge__icon {
    width: 16px;
    height: 16px;
    object-fit: contain;
    display: inline-block;
  }
  .chat-item-link {
    color: #FBBF24;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .chat-item-link--common { color: #9CA3AF; }
  .chat-item-link--uncommon { color: #4ADE80; }
  .chat-item-link--rare { color: #60A5FA; }
  .chat-item-link--epic { color: #C084FC; }
  .chat-item-link--legendary { color: #F59E0B; }
  .chat-item-link--mythic { color: #22D3EE; }
  .chat-item-tooltip {
    position: absolute;
    z-index: 9999;
    background: rgba(17, 24, 39, 0.98);
    border: 1px solid #374151;
    color: #E5E7EB;
    padding: 6px 8px;
    border-radius: 6px;
    font-size: 11px;
    max-width: 240px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }
  .chat-item-tooltip.hidden {
    display: none;
  }
  .chat-item-tooltip__title {
    font-weight: 600;
    margin-bottom: 4px;
  }
  .chat-item-tooltip__title--common { color: #9CA3AF; }
  .chat-item-tooltip__title--uncommon { color: #4ADE80; }
  .chat-item-tooltip__title--rare { color: #60A5FA; }
  .chat-item-tooltip__title--epic { color: #C084FC; }
  .chat-item-tooltip__title--legendary { color: #F59E0B; }
  .chat-item-tooltip__title--mythic { color: #22D3EE; }
  .chat-item-tooltip__line {
    line-height: 1.2;
    margin-top: 2px;
  }
  .chat-item-tooltip__label {
    color: #9CA3AF;
  }
  .chat-item-tooltip__corrupted {
    color: #FCA5A5;
    font-weight: 600;
  }
  #chat-messages {
    box-shadow: 0 0 20px rgba(255, 186, 104, 0.12) inset;
  }
</style>

</div>

<script>
  window.chatCommands = [{"name":"ann","description":"","url_template":"https://olympusawakened.com/ann.php"},{"name":"banned","description":"","url_template":"https://olympusawakened.com/banned_characters.php"},{"name":"change","description":"","url_template":"https://olympusawakened.com/changelog.php"},{"name":"changes","description":"changelog page","url_template":"https://olympusawakened.com/changelog.php"},{"name":"discord","description":"","url_template":"https://discord.gg/ayQbUDNZdZ"},{"name":"fallen","description":"","url_template":"https://olympusawakened.com/fallen_clans.php"},{"name":"help","description":"Help Page","url_template":"https://olympusawakened.com/help.php"},{"name":"hof","description":"","url_template":"https://olympusawakened.com/hall_of_fame.php"},{"name":"map","description":"","url_template":"https://olympusawakened.com/atlas.php"},{"name":"maps","description":"","url_template":"https://olympusawakened.com/atlas.php"},{"name":"news","description":"News page","url_template":"https://olympusawakened.com/ann.php"},{"name":"profile","description":"Open a player profile","url_template":"https://olympusawakened.com/profile.php?name={query}"},{"name":"top","description":"Top Players","url_template":"https://olympusawakened.com/top_players.php"},{"name":"tops","description":"Top Players","url_template":"https://olympusawakened.com/top_players.php"}];
</script>

<script src="https://olympusawakened.com/assets/js/game/chat.min.js?v=444"></script>
<script>
  (function initChatProfileToggle() {
    var messagesEl = document.getElementById('chat-messages');
    var inputEl = document.getElementById('chat-input');
    var formEl = document.getElementById('chat-form');
    if (!messagesEl || !inputEl) {
      return;
    }

    var lastName = '';
    var lastMode = 'm';

    function findNameTarget(startEl) {
      if (!startEl) {
        return null;
      }
      if (typeof startEl.closest === 'function') {
        return startEl.closest('.chat-player-name');
      }
      var node = startEl;
      while (node && node !== messagesEl) {
        if (node.classList && node.classList.contains('chat-player-name')) {
          return node;
        }
        node = node.parentNode;
      }
      return null;
    }

    messagesEl.addEventListener('click', function handleNameToggle(event) {
      var nameEl = findNameTarget(event.target);
      if (!nameEl || !nameEl.getAttribute) {
        return;
      }

      var name = nameEl.getAttribute('data-name') || '';
      var trimmed = name.replace(/:$/, '').trim();
      if (!trimmed) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      if (trimmed === lastName) {
        lastMode = lastMode === 'm' ? 'profile' : 'm';
      } else {
        lastName = trimmed;
        lastMode = 'm';
      }

      if (lastMode === 'profile') {
        inputEl.value = '/profile ' + trimmed;
      } else {
        inputEl.value = '/m ' + trimmed + ': ';
      }
      inputEl.focus();
    }, true);

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', function resetNameToggle() {
        lastName = '';
        lastMode = 'm';
      });
    }
  })();
</script>
    
    <div
  id="stat-allocation-modal"
  class="fixed inset-0 z-50 hidden"
  role="dialog"
  aria-modal="true"
  aria-labelledby="stat-modal-title"
  data-stat-config="{&quot;stat_points&quot;:0,&quot;stats&quot;:{&quot;durability&quot;:{&quot;key&quot;:&quot;durability&quot;,&quot;label&quot;:&quot;Durability&quot;,&quot;description&quot;:&quot;+10 Max HP, +Defense&quot;,&quot;icon&quot;:&quot;🛡️&quot;,&quot;value&quot;:10},&quot;strength&quot;:{&quot;key&quot;:&quot;strength&quot;,&quot;label&quot;:&quot;Strength&quot;,&quot;description&quot;:&quot;+Damage&quot;,&quot;icon&quot;:&quot;⚔️&quot;,&quot;value&quot;:5},&quot;dexterity&quot;:{&quot;key&quot;:&quot;dexterity&quot;,&quot;label&quot;:&quot;Dexterity&quot;,&quot;description&quot;:&quot;+Physical Hit / Accuracy&quot;,&quot;icon&quot;:&quot;🎯&quot;,&quot;value&quot;:5},&quot;agility&quot;:{&quot;key&quot;:&quot;agility&quot;,&quot;label&quot;:&quot;Agility&quot;,&quot;description&quot;:&quot;+Dodge Chance&quot;,&quot;icon&quot;:&quot;💨&quot;,&quot;value&quot;:5},&quot;intelligence&quot;:{&quot;key&quot;:&quot;intelligence&quot;,&quot;label&quot;:&quot;Intelligence&quot;,&quot;description&quot;:&quot;+Spell Power&quot;,&quot;icon&quot;:&quot;✨&quot;,&quot;value&quot;:550},&quot;perception&quot;:{&quot;key&quot;:&quot;perception&quot;,&quot;label&quot;:&quot;Perception&quot;,&quot;description&quot;:&quot;+Crit Support / Anti-Cast Resist&quot;,&quot;icon&quot;:&quot;👁️&quot;,&quot;value&quot;:5},&quot;concentration&quot;:{&quot;key&quot;:&quot;concentration&quot;,&quot;label&quot;:&quot;Concentration&quot;,&quot;description&quot;:&quot;+Spell Success / Control&quot;,&quot;icon&quot;:&quot;🧠&quot;,&quot;value&quot;:5}},&quot;should_auto_open&quot;:false,&quot;user_id&quot;:169}"
>
  <div class="absolute inset-0 bg-black/70" data-stat-modal-overlay></div>
  <div class="relative flex items-center justify-center min-h-full p-4">
    <div class="oa-panel oa-panel--header w-full max-w-md rounded-2xl p-6 text-gray-100 shadow-2xl border border-amber-200/30 space-y-5">
      <div class="flex justify-between items-start gap-4">
        <div class="space-y-2">
          <div class="oa-chip inline-flex">Level Up</div>
          <h2 id="stat-modal-title" class="text-2xl font-semibold text-amber-200">Spend your stat points</h2>
          <p class="text-sm text-gray-300">Grow stronger by investing in your core stats.</p>
        </div>
        <button
          type="button"
          class="h-8 w-8 rounded-full border border-white/10 text-gray-300 hover:text-white hover:border-white/30 flex items-center justify-center"
          aria-label="Close stat modal"
          data-stat-modal-close
        >&times;</button>
      </div>
      <div class="text-center space-y-1">
        <span class="text-4xl font-extrabold text-white" data-stat-points>0</span>
        <div class="text-xs text-gray-400 font-semibold uppercase tracking-widest">stat points</div>
      </div>
      <div class="space-y-3 max-h-80 overflow-y-auto pr-2 oa-scroll" data-stat-list>
                  <div class="oa-panel--soft rounded-xl px-4 py-3 flex items-center justify-between gap-4" data-stat-row="durability">
            <div class="space-y-1">
              <div class="flex items-center gap-2 font-semibold text-sm">
                <span aria-hidden="true" class="text-base">🛡️</span>
                <span>Durability</span>
                <span class="oa-level-gold" data-stat-current>10</span>
              </div>
              <div class="text-xs text-gray-400">+10 Max HP, +Defense</div>
            </div>
            <div class="flex flex-col items-end gap-2">
              <button
                type="button"
                class="oa-button oa-button--primary px-3 py-1 text-[11px] font-semibold"
                data-action="increment"
                data-stat="durability"
                data-amount="1"
                aria-label="Increase Durability"
              >+</button>
              <div class="flex gap-1 text-[11px]" data-quick-buttons>
                                  <button
                    type="button"
                    class="oa-button oa-button--muted px-2 py-0.5 text-[10px] font-semibold hidden"
                    data-action="increment"
                    data-stat="durability"
                    data-amount="5"
                    data-quick="1"
                    aria-label="Increase Durability by 5"
                  >+5</button>
                                  <button
                    type="button"
                    class="oa-button oa-button--muted px-2 py-0.5 text-[10px] font-semibold hidden"
                    data-action="increment"
                    data-stat="durability"
                    data-amount="25"
                    data-quick="1"
                    aria-label="Increase Durability by 25"
                  >+25</button>
                                  <button
                    type="button"
                    class="oa-button oa-button--muted px-2 py-0.5 text-[10px] font-semibold hidden"
                    data-action="increment"
                    data-stat="durability"
                    data-amount="100"
                    data-quick="1"
                    aria-label="Increase Durability by 100"
                  >+100</button>
                              </div>
            </div>
          </div>
                  <div class="oa-panel--soft rounded-xl px-4 py-3 flex items-center justify-between gap-4" data-stat-row="strength">
            <div class="space-y-1">
              <div class="flex items-center gap-2 font-semibold text-sm">
                <span aria-hidden="true" class="text-base">⚔️</span>
                <span>Strength</span>
                <span class="oa-level-gold" data-stat-current>5</span>
              </div>
              <div class="text-xs text-gray-400">+Damage</div>
            </div>
            <div class="flex flex-col items-end gap-2">
              <button
                type="button"
                class="oa-button oa-button--primary px-3 py-1 text-[11px] font-semibold"
                data-action="increment"
                data-stat="strength"
                data-amount="1"
                aria-label="Increase Strength"
              >+</button>
              <div class="flex gap-1 text-[11px]" data-quick-buttons>
                                  <button
                    type="button"
                    class="oa-button oa-button--muted px-2 py-0.5 text-[10px] font-semibold hidden"
                    data-action="increment"
                    data-stat="strength"
                    data-amount="5"
                    data-quick="1"
                    aria-label="Increase Strength by 5"
                  >+5</button>
                                  <button
                    type="button"
                    class="oa-button oa-button--muted px-2 py-0.5 text-[10px] font-semibold hidden"
                    data-action="increment"
                    data-stat="strength"
                    data-amount="25"
                    data-quick="1"
                    aria-label="Increase Strength by 25"
                  >+25</button>
                                  <button
                    type="button"
                    class="oa-button oa-button--muted px-2 py-0.5 text-[10px] font-semibold hidden"
                    data-action="increment"
                    data-stat="strength"
                    data-amount="100"
                    data-quick="1"
                    aria-label="Increase Strength by 100"
                  >+100</button>
                              </div>
            </div>
          </div>
                  <div class="oa-panel--soft rounded-xl px-4 py-3 flex items-center justify-between gap-4" data-stat-row="dexterity">
            <div class="space-y-1">
              <div class="flex items-center gap-2 font-semibold text-sm">
                <span aria-hidden="true" class="text-base">🎯</span>
                <span>Dexterity</span>
                <span class="oa-level-gold" data-stat-current>5</span>
              </div>
              <div class="text-xs text-gray-400">+Physical Hit / Accuracy</div>
            </div>
            <div class="flex flex-col items-end gap-2">
              <button
                type="button"
                class="oa-button oa-button--primary px-3 py-1 text-[11px] font-semibold"
                data-action="increment"
                data-stat="dexterity"
                data-amount="1"
                aria-label="Increase Dexterity"
              >+</button>
              <div class="flex gap-1 text-[11px]" data-quick-buttons>
                                  <button
                    type="button"
                    class="oa-button oa-button--muted px-2 py-0.5 text-[10px] font-semibold hidden"
                    data-action="increment"
                    data-stat="dexterity"
                    data-amount="5"
                    data-quick="1"
                    aria-label="Increase Dexterity by 5"
                  >+5</button>
                                  <button
                    type="button"
                    class="oa-button oa-button--muted px-2 py-0.5 text-[10px] font-semibold hidden"
                    data-action="increment"
                    data-stat="dexterity"
                    data-amount="25"
                    data-quick="1"
                    aria-label="Increase Dexterity by 25"
                  >+25</button>
                                  <button
                    type="button"
                    class="oa-button oa-button--muted px-2 py-0.5 text-[10px] font-semibold hidden"
                    data-action="increment"
                    data-stat="dexterity"
                    data-amount="100"
                    data-quick="1"
                    aria-label="Increase Dexterity by 100"
                  >+100</button>
                              </div>
            </div>
          </div>
                  <div class="oa-panel--soft rounded-xl px-4 py-3 flex items-center justify-between gap-4" data-stat-row="agility">
            <div class="space-y-1">
              <div class="flex items-center gap-2 font-semibold text-sm">
                <span aria-hidden="true" class="text-base">💨</span>
                <span>Agility</span>
                <span class="oa-level-gold" data-stat-current>5</span>
              </div>
              <div class="text-xs text-gray-400">+Dodge Chance</div>
            </div>
            <div class="flex flex-col items-end gap-2">
              <button
                type="button"
                class="oa-button oa-button--primary px-3 py-1 text-[11px] font-semibold"
                data-action="increment"
                data-stat="agility"
                data-amount="1"
                aria-label="Increase Agility"
              >+</button>
              <div class="flex gap-1 text-[11px]" data-quick-buttons>
                                  <button
                    type="button"
                    class="oa-button oa-button--muted px-2 py-0.5 text-[10px] font-semibold hidden"
                    data-action="increment"
                    data-stat="agility"
                    data-amount="5"
                    data-quick="1"
                    aria-label="Increase Agility by 5"
                  >+5</button>
                                  <button
                    type="button"
                    class="oa-button oa-button--muted px-2 py-0.5 text-[10px] font-semibold hidden"
                    data-action="increment"
                    data-stat="agility"
                    data-amount="25"
                    data-quick="1"
                    aria-label="Increase Agility by 25"
                  >+25</button>
                                  <button
                    type="button"
                    class="oa-button oa-button--muted px-2 py-0.5 text-[10px] font-semibold hidden"
                    data-action="increment"
                    data-stat="agility"
                    data-amount="100"
                    data-quick="1"
                    aria-label="Increase Agility by 100"
                  >+100</button>
                              </div>
            </div>
          </div>
                  <div class="oa-panel--soft rounded-xl px-4 py-3 flex items-center justify-between gap-4" data-stat-row="intelligence">
            <div class="space-y-1">
              <div class="flex items-center gap-2 font-semibold text-sm">
                <span aria-hidden="true" class="text-base">✨</span>
                <span>Intelligence</span>
                <span class="oa-level-gold" data-stat-current>550</span>
              </div>
              <div class="text-xs text-gray-400">+Spell Power</div>
            </div>
            <div class="flex flex-col items-end gap-2">
              <button
                type="button"
                class="oa-button oa-button--primary px-3 py-1 text-[11px] font-semibold"
                data-action="increment"
                data-stat="intelligence"
                data-amount="1"
                aria-label="Increase Intelligence"
              >+</button>
              <div class="flex gap-1 text-[11px]" data-quick-buttons>
                                  <button
                    type="button"
                    class="oa-button oa-button--muted px-2 py-0.5 text-[10px] font-semibold hidden"
                    data-action="increment"
                    data-stat="intelligence"
                    data-amount="5"
                    data-quick="1"
                    aria-label="Increase Intelligence by 5"
                  >+5</button>
                                  <button
                    type="button"
                    class="oa-button oa-button--muted px-2 py-0.5 text-[10px] font-semibold hidden"
                    data-action="increment"
                    data-stat="intelligence"
                    data-amount="25"
                    data-quick="1"
                    aria-label="Increase Intelligence by 25"
                  >+25</button>
                                  <button
                    type="button"
                    class="oa-button oa-button--muted px-2 py-0.5 text-[10px] font-semibold hidden"
                    data-action="increment"
                    data-stat="intelligence"
                    data-amount="100"
                    data-quick="1"
                    aria-label="Increase Intelligence by 100"
                  >+100</button>
                              </div>
            </div>
          </div>
                  <div class="oa-panel--soft rounded-xl px-4 py-3 flex items-center justify-between gap-4" data-stat-row="perception">
            <div class="space-y-1">
              <div class="flex items-center gap-2 font-semibold text-sm">
                <span aria-hidden="true" class="text-base">👁️</span>
                <span>Perception</span>
                <span class="oa-level-gold" data-stat-current>5</span>
              </div>
              <div class="text-xs text-gray-400">+Crit Support / Anti-Cast Resist</div>
            </div>
            <div class="flex flex-col items-end gap-2">
              <button
                type="button"
                class="oa-button oa-button--primary px-3 py-1 text-[11px] font-semibold"
                data-action="increment"
                data-stat="perception"
                data-amount="1"
                aria-label="Increase Perception"
              >+</button>
              <div class="flex gap-1 text-[11px]" data-quick-buttons>
                                  <button
                    type="button"
                    class="oa-button oa-button--muted px-2 py-0.5 text-[10px] font-semibold hidden"
                    data-action="increment"
                    data-stat="perception"
                    data-amount="5"
                    data-quick="1"
                    aria-label="Increase Perception by 5"
                  >+5</button>
                                  <button
                    type="button"
                    class="oa-button oa-button--muted px-2 py-0.5 text-[10px] font-semibold hidden"
                    data-action="increment"
                    data-stat="perception"
                    data-amount="25"
                    data-quick="1"
                    aria-label="Increase Perception by 25"
                  >+25</button>
                                  <button
                    type="button"
                    class="oa-button oa-button--muted px-2 py-0.5 text-[10px] font-semibold hidden"
                    data-action="increment"
                    data-stat="perception"
                    data-amount="100"
                    data-quick="1"
                    aria-label="Increase Perception by 100"
                  >+100</button>
                              </div>
            </div>
          </div>
                  <div class="oa-panel--soft rounded-xl px-4 py-3 flex items-center justify-between gap-4" data-stat-row="concentration">
            <div class="space-y-1">
              <div class="flex items-center gap-2 font-semibold text-sm">
                <span aria-hidden="true" class="text-base">🧠</span>
                <span>Concentration</span>
                <span class="oa-level-gold" data-stat-current>5</span>
              </div>
              <div class="text-xs text-gray-400">+Spell Success / Control</div>
            </div>
            <div class="flex flex-col items-end gap-2">
              <button
                type="button"
                class="oa-button oa-button--primary px-3 py-1 text-[11px] font-semibold"
                data-action="increment"
                data-stat="concentration"
                data-amount="1"
                aria-label="Increase Concentration"
              >+</button>
              <div class="flex gap-1 text-[11px]" data-quick-buttons>
                                  <button
                    type="button"
                    class="oa-button oa-button--muted px-2 py-0.5 text-[10px] font-semibold hidden"
                    data-action="increment"
                    data-stat="concentration"
                    data-amount="5"
                    data-quick="1"
                    aria-label="Increase Concentration by 5"
                  >+5</button>
                                  <button
                    type="button"
                    class="oa-button oa-button--muted px-2 py-0.5 text-[10px] font-semibold hidden"
                    data-action="increment"
                    data-stat="concentration"
                    data-amount="25"
                    data-quick="1"
                    aria-label="Increase Concentration by 25"
                  >+25</button>
                                  <button
                    type="button"
                    class="oa-button oa-button--muted px-2 py-0.5 text-[10px] font-semibold hidden"
                    data-action="increment"
                    data-stat="concentration"
                    data-amount="100"
                    data-quick="1"
                    aria-label="Increase Concentration by 100"
                  >+100</button>
                              </div>
            </div>
          </div>
              </div>
      <div class="flex gap-2">
        <button
          type="button"
          class="oa-button oa-button--primary flex-1 py-2 text-[11px] font-semibold"
          data-stat-modal-later
        >Later</button>
        <button
          type="button"
          class="oa-button oa-button--muted px-4 py-2 text-[11px] font-semibold"
          data-stat-modal-close
        >Close</button>
      </div>
    </div>
  </div>
</div>
<script src="https://olympusawakened.com/assets/js/components/stat-allocation-modal.min.js?v=444"></script>

    
    <div
  id="name-color-modal"
  class="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-60 hidden"
  aria-hidden="true"
>
  <div class="bg-gray-900 border border-purple-600 rounded-lg shadow-2xl max-w-sm w-full p-4 text-gray-200">
    <h2 class="text-lg font-semibold text-purple-200 mb-2">Change Chat Name Color</h2>
    <p class="text-xs text-gray-400 mb-3">
      Each change or reset spends one premium credit. Dark / hard-to-read colors and exact duplicates are not allowed.
    </p>
    <form id="name-color-form" class="space-y-3">
      <input type="hidden" name="csrf_token" value="bfea82eaa55379c6417569f75371a56f66172af7af2212a6a2e03ccdb7c0cee0">      <div class="flex items-center gap-2">
        <input
          type="color"
          id="name-color-input"
          name="color"
          value="#D69315"
          class="bg-gray-900 border border-gray-700 rounded-md h-8 w-12 cursor-pointer"
        >
        <input
          type="text"
          id="name-color-hex"
          value="#D69315"
          class="flex-1 bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-[11px] font-mono"
          placeholder="#FFFFFF"
        >
      </div>
      <div id="name-color-error" class="text-xs text-red-400 min-h-[1.25rem]"></div>
      <div class="flex justify-between gap-2">
        <button
          type="button"
          class="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-[11px] font-semibold"
          id="name-color-reset-button"
        >
          Spend credit &amp; reset to default
        </button>
        <button
          type="button"
          class="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-xs font-semibold"
          onclick="window.hideNameColorModal && window.hideNameColorModal();"
        >
          Cancel
        </button>
        <button
          type="submit"
          class="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-xs font-semibold"
        >
          Spend Credit &amp; Save
        </button>
      </div>
    </form>
  </div>
</div>

<script>
  (function initNameColorModal() {
    const modal = document.getElementById('name-color-modal');
    const form = document.getElementById('name-color-form');
    const colorInput = document.getElementById('name-color-input');
    const hexInput = document.getElementById('name-color-hex');
    const errorEl = document.getElementById('name-color-error');
    const resetButton = document.getElementById('name-color-reset-button');

    if (!modal || !form || !colorInput || !hexInput) {
      return;
    }

    function showModal() {
      modal.classList.remove('hidden');
    }

    function hideModal() {
      modal.classList.add('hidden');
      if (errorEl) {
        errorEl.textContent = '';
      }
    }

    window.showNameColorModal = showModal;
    window.hideNameColorModal = hideModal;

    colorInput.addEventListener('input', function () {
      hexInput.value = String(colorInput.value || '').toUpperCase();
    });

    hexInput.addEventListener('input', function () {
      let value = String(hexInput.value || '').trim();
      if (!value) {
        return;
      }
      if (value.charAt(0) !== '#') {
        value = '#' + value;
      }
      if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
        colorInput.value = value;
        hexInput.value = value.toUpperCase();
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const color = String(hexInput.value || colorInput.value || '').trim();
      const csrfField = form.querySelector('input[name="csrf_token"]');
      const csrf = csrfField ? csrfField.value : (window.csrfToken || '');

      if (!color) {
        if (errorEl) errorEl.textContent = 'Please choose a color.';
        return;
      }

      const payload = new FormData();
      payload.append('color', color);
      payload.append('csrf_token', csrf);

      fetch('api/chat_name_color_change.php', {
        method: 'POST',
        credentials: 'same-origin',
        body: payload
      }).then(function (res) {
        if (!res.ok) {
          return res.text().then(function (text) {
            throw new Error(text || 'Unable to update name color.');
          });
        }
        return res.json();
      }).then(function (data) {
        if (!data || !data.success) {
          throw new Error('Unable to update name color.');
        }
        hideModal();
        if (window.gameNotifications && typeof window.gameNotifications.show === 'function') {
          window.gameNotifications.show(data.reset_to_default ? 'Chat name color reset to default.' : 'Chat name color updated.');
        } else {
          alert(data.reset_to_default ? 'Chat name color reset to default.' : 'Chat name color updated.');
        }
        window.location.reload();
      }).catch(function (err) {
        if (errorEl) {
          errorEl.textContent = String(err && err.message ? err.message : 'Unable to update name color.');
        }
      });
    });

    if (resetButton) {
      resetButton.addEventListener('click', function () {
        const csrfField = form.querySelector('input[name="csrf_token"]');
        const csrf = csrfField ? csrfField.value : (window.csrfToken || '');
        const payload = new FormData();
        payload.append('reset_to_default', '1');
        payload.append('csrf_token', csrf);

        fetch('api/chat_name_color_change.php', {
          method: 'POST',
          credentials: 'same-origin',
          body: payload
        }).then(function (res) {
          if (!res.ok) {
            return res.text().then(function (text) {
              throw new Error(text || 'Unable to reset name color.');
            });
          }
          return res.json();
        }).then(function (data) {
          if (!data || !data.success) {
            throw new Error('Unable to reset name color.');
          }
          hideModal();
          if (window.gameNotifications && typeof window.gameNotifications.show === 'function') {
            window.gameNotifications.show('Chat name color reset to default.');
          } else {
            alert('Chat name color reset to default.');
          }
          window.location.reload();
        }).catch(function (err) {
          if (errorEl) {
            errorEl.textContent = String(err && err.message ? err.message : 'Unable to reset name color.');
          }
        });
      });
    }
  })();
</script>
  </div>
</div>

<script src="https://olympusawakened.com/assets/js/game/tournament-tab.min.js?v=444"></script>
  <footer class="oa-footer">
    <div>
      &copy; 2026 Titanbyte LLC. All rights reserved.
    </div>
    <div>
      <a href="terms.php">
        Terms of Service
      </a>
      <span class="oa-footer__divider">•</span>
      <a href="privacy.php">
        Privacy Policy
      </a>
    </div>
  </footer>
<script defer src="https://static.cloudflareinsights.com/beacon.min.js/vcd15cbe7772f49c399c6a5babf22c1241717689176015" integrity="sha512-ZpsOmlRQV6y907TI0dKBHq9Md29nnaEIPlkf84rnaERnq6zvWvPUqr2ft8M1aS28oN72PdrCzSjY4U6VaAw1EQ==" data-cf-beacon='{"version":"2024.11.0","token":"62a75ab7c10f4b18b0c9aa8a0ddd3011","r":1,"server_timing":{"name":{"cfCacheStatus":true,"cfEdge":true,"cfExtPri":true,"cfL4":true,"cfOrigin":true,"cfSpeedBrain":true},"location_startswith":null}}' crossorigin="anonymous"></script>
</body>
</html>
