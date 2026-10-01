// scripts/state-import/states.js
// US state list — Geofabrik URL slug, FIPS code, ISO 3166-2 code.
'use strict';

const STATES = [
  { name: 'alabama',              fips: '01', code: 'AL' },
  { name: 'alaska',               fips: '02', code: 'AK' },
  { name: 'arizona',              fips: '04', code: 'AZ' },
  { name: 'arkansas',             fips: '05', code: 'AR' },
  { name: 'california',           fips: '06', code: 'CA' },
  { name: 'colorado',             fips: '08', code: 'CO' },
  { name: 'connecticut',          fips: '09', code: 'CT' },
  { name: 'delaware',             fips: '10', code: 'DE' },
  { name: 'district-of-columbia', fips: '11', code: 'DC' },
  { name: 'florida',              fips: '12', code: 'FL' },
  { name: 'georgia',              fips: '13', code: 'GA' },
  { name: 'hawaii',               fips: '15', code: 'HI' },
  { name: 'idaho',                fips: '16', code: 'ID' },
  { name: 'illinois',             fips: '17', code: 'IL' },
  { name: 'indiana',              fips: '18', code: 'IN' },
  { name: 'iowa',                 fips: '19', code: 'IA' },
  { name: 'kansas',               fips: '20', code: 'KS' },
  { name: 'kentucky',             fips: '21', code: 'KY' },
  { name: 'louisiana',            fips: '22', code: 'LA' },
  { name: 'maine',                fips: '23', code: 'ME' },
  { name: 'maryland',             fips: '24', code: 'MD' },
  { name: 'massachusetts',        fips: '25', code: 'MA' },
  { name: 'michigan',             fips: '26', code: 'MI' },
  { name: 'minnesota',            fips: '27', code: 'MN' },
  { name: 'mississippi',          fips: '28', code: 'MS' },
  { name: 'missouri',             fips: '29', code: 'MO' },
  { name: 'montana',              fips: '30', code: 'MT' },
  { name: 'nebraska',             fips: '31', code: 'NE' },
  { name: 'nevada',               fips: '32', code: 'NV' },
  { name: 'new-hampshire',        fips: '33', code: 'NH' },
  { name: 'new-jersey',           fips: '34', code: 'NJ' },
  { name: 'new-mexico',           fips: '35', code: 'NM' },
  { name: 'new-york',             fips: '36', code: 'NY' },
  { name: 'north-carolina',       fips: '37', code: 'NC' },
  { name: 'north-dakota',         fips: '38', code: 'ND' },
  { name: 'ohio',                 fips: '39', code: 'OH' },
  { name: 'oklahoma',             fips: '40', code: 'OK' },
  { name: 'oregon',               fips: '41', code: 'OR' },
  { name: 'pennsylvania',         fips: '42', code: 'PA' },
  { name: 'rhode-island',         fips: '44', code: 'RI' },
  { name: 'south-carolina',       fips: '45', code: 'SC' },
  { name: 'south-dakota',         fips: '46', code: 'SD' },
  { name: 'tennessee',            fips: '47', code: 'TN' },
  { name: 'texas',                fips: '48', code: 'TX' },
  { name: 'utah',                 fips: '49', code: 'UT' },
  { name: 'vermont',              fips: '50', code: 'VT' },
  { name: 'virginia',             fips: '51', code: 'VA' },
  { name: 'washington',           fips: '53', code: 'WA' },
  { name: 'west-virginia',        fips: '54', code: 'WV' },
  { name: 'wisconsin',            fips: '55', code: 'WI' },
  { name: 'wyoming',              fips: '56', code: 'WY' },
];

function geofabrikUrl(name) {
  // e.g. https://download.geofabrik.de/north-america/us/california-latest.osm.pbf
  return `https://download.geofabrik.de/north-america/us/${name}-latest.osm.pbf/`;
}

function byCode(code) {
  return STATES.find((s) => s.code === code);
}

function byName(name) {
  return STATES.find((s) => s.name === name);
}

module.exports = { STATES, geofabrikUrl, byCode, byName };