// versions.js - aggregated module versions. v1.0.0
// v1.1.1: APP_VERSION bumped to 2.5.9 — CRITICAL BUGFIX: dark-mode label
//          overrides (map 1.8.4's vibrant palette) silently did nothing on
//          cold public-domain loads. Root cause: MapLibre's `styledata`
//          event fires BEFORE `isStyleLoaded()` returns true, so the
//          `map.once('styledata', ...)` chain recursed infinitely without
//          ever entering the override branch. The test environment
//          happened to hit `isStyleLoaded=true` on first emit; production
//          never did, so the palette was being skipped entirely on every
//          cold page load. Fix (map 1.8.5): the theme:change listener now
//          listens to BOTH `styledata` AND `idle` events with a 600ms
//          setTimeout fallback, guarded by a `done` flag so the override
//          applies exactly once per theme change. Verified visually on
//          public domain — city/town/suburb/highway labels now render in
//          the vibrant hue-distinct palette on the very first paint.
// v1.1.0: APP_VERSION bumped to 2.5.8 — vibrant hue-distinct dark-mode label
//          palette. map 1.8.4 gives each label class its own hue so labels
//          pop as a separate visual layer from the grey road casings:
//          city→#ffffff, town→#ffe066 (warm yellow), suburb→#7fdbff (sky
//          blue), major highway→#ffd166 (amber), minor highway→#c0aaff
//          (lavender), water→#5ac8fa (vivid blue), transit→#ff9ec7 (pink),
//          housenum→#b8b8c8. Halo widened to 2.0/0.8 for stronger
//          separation against the dark basemap. v1.0.9's all-grey palette
//          (whites + light greys + light blues) blended into the road
//          casings rgba(124,124,128,.95) / rgba(96,96,100,.9) and labels
//          didn't read as a distinct layer.
// v1.0.9: APP_VERSION bumped to 2.5.7 — attribution COMPLETELY minimized.
//          map 1.8.3: collapseAttribution() now runs on every map event
//          (load/styledata/idle/sourcedata/popupopen/popupclose) AND a
//          MutationObserver on the .maplibregl-ctrl-attrib element itself
//          reverts any re-open in the same animation frame. The previous
//          once-flag (v1.8.0) collapsed the element once but MapLibre
//          re-applied `open=""` on every style swap and popup interaction,
//          leaving a 351×24px attribution bar visible. CSS shrinks the
//          collapsed state to a true 22×22 dark circle with only the "i"
//          glyph; expanded state (when user explicitly taps) caps at
//          min(220px, 100vw-32px) so it never spans the screen.
// v1.0.8: APP_VERSION bumped to 2.5.6 — bugfix: dark-mode label overrides
//          actually applying. map 1.8.2 fixes two bugs in applyBasemapOverrides
//          that meant the v1.8.0/1.8.1 palette edits had zero visible effect:
//            (a) safeSetPaint guarded on Object.hasOwnProperty(paint, prop),
//                but layer.paint is wrapped by MapLibre's crossfading object
//                (keys are '_properties' / '_values') so the guard returned
//                false for every property and nothing was set.
//            (b) the if/else matched `place_label_*` / `road_label_*`, but
//                the real basemap layer ids are `place_*` / `highway_name_*`
//                (no `_label` suffix). New id prefixes now match the dark
//                Liberty style and the brighter palette applies.
// v1.0.7: APP_VERSION bumped to 2.5.5 — back-to-city overlap + brighter labels.
//          map 1.8.1 bumps the dark-mode label palette one tier brighter
//          (city/town → pure white, suburb → bright grey, road major →
//          near-white, road minor → bright grey) and strengthens the
//          text halo to rgba(0,0,0,0.95) width 1.8. back-to-city 1.2.2
//          moves its FAB from top-right (top:140px right:16px — collided
//          with the GeolocateControl) to top-left, mirroring the offset
//          of the NavigationControl group. CSS-only change in app.css.
// v1.0.6: APP_VERSION bumped to 2.5.4 — UX fixes batch (map 1.8.0
//          attribution bottom-left + dark label hierarchy, theme 1.0.1
//          cycle() is a true light/dark toggle, back-to-city 1.2.1
//          resets sheet to 'mini', poi-categories lottery_yes expanded
//          to include gas stations / supermarkets / department stores /
//          kiosks per user request "list all the gas stations as well").
// v1.0.5: APP_VERSION bumped to 2.5.3 (map 1.7.0 Google Maps dark palette).
// v1.0.4: APP_VERSION bumped to 2.5.2 (map 1.6.0 modern POI pins).
// v1.0.3: APP_VERSION bumped to 2.5.1 (map 1.5.0 attribution collapsed).
// v1.0.2: APP_VERSION bumped to 2.5.0 (sheet 1.4.0 lottery badge,
//          poi 1.3.0 lottery-priority dedup).
// v1.0.1: APP_VERSION bumped to 2.3.0 (wedge 1.1.0, city 1.1.0,
//          compass 1.1.0, api 1.1.0, map 1.4.0).
import { name as apiN, version as apiV } from '../modules/api/index.js';
import { name as themeN, version as themeV } from '../modules/theme/index.js';
import { name as mapN, version as mapV } from '../modules/map/index.js';
import { name as wedgeN, version as wedgeV } from '../modules/wedge/index.js';
import { name as cityN, version as cityV } from '../modules/city/index.js';
import { name as dirN, version as dirV } from '../modules/direction/index.js';
import { name as poiN, version as poiV } from '../modules/poi/index.js';
import { name as searchN, version as searchV } from '../modules/search/index.js';
import { name as geoN, version as geoV } from '../modules/geolocate/index.js';
import { name as sheetN, version as sheetV } from '../modules/sheet/index.js';
import { name as compN, version as compV } from '../modules/compass/index.js';
import { name as lvlN, version as lvlV } from '../modules/level/index.js';
import { name as stN, version as stV } from '../modules/style-toggle/index.js';
import { name as toastN, version as toastV } from '../modules/toast/index.js';
import { name as dbgN, version as dbgV } from '../modules/debug-hud/index.js';
import { name as backN, version as backV } from '../modules/back-to-city/index.js';

export const CORE_VERSION = '1.0.1';
export const APP_VERSION = '2.5.9';
export const MODULES = {
  [apiN]: apiV,
  [themeN]: themeV,
  [mapN]: mapV,
  [wedgeN]: wedgeV,
  [cityN]: cityV,
  [dirN]: dirV,
  [poiN]: poiV,
  [searchN]: searchV,
  [geoN]: geoV,
  [sheetN]: sheetV,
  [compN]: compV,
  [lvlN]: lvlV,
  [stN]: stV,
  [toastN]: toastV,
  [dbgN]: dbgV,
  [backN]: backV,
};