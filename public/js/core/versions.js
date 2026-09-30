// versions.js - aggregated module versions. v1.0.0
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

export const CORE_VERSION = '1.0.0';
export const APP_VERSION = '2.1.0';
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