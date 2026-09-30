'use strict';

// Distance conversion helpers. The app's UI uses miles.
const MILES_PER_METER = 1 / 1609.344;

const milesToMeters = (m) => Math.round(m * 1609.344);
const metersToMiles = (m) => m * MILES_PER_METER;

module.exports = { milesToMeters, metersToMiles };
