const _ = require('lodash');
const turf = require('@turf/turf');
const tileCover = require('@mapbox/tile-cover');

function createTiles(opts) {
  const coords = parsePoint(opts.point)
  let geojson = turf.point([coords.lng, coords.lat]);

  const buffer = parseBuffer(opts.buffer);
  geojson = turf.buffer(geojson, buffer.radius, { units: buffer.unit });

  const zooms = parseZoomRange(opts.zoom);
  const arrOfArrs = _.map(zooms, z => tileCover.tiles(geojson.geometry, {min_zoom: z, max_zoom: z}));
  const arrOfXyzs = _.flatten(arrOfArrs);
  return _.map(arrOfXyzs, xyz => buildUrl(opts.url, xyz));
}

function buildUrl(template, xyz) {
  return template
    .replace(/\{x\}/g, xyz[0])
    .replace(/\{y\}/g, xyz[1])
    .replace(/\{z\}/g, xyz[2]);
}

function parsePoint(point) {
  const arr = String(point).split(',');
  const nums = _.map(arr, i => parseFloat(i));
  return {
    lat: nums[0],
    lng: nums[1],
  };
}

function parseBuffer(buffer) {
  const radius = parseFloat(buffer);
  const unit = /mi$/.test(buffer) ? 'miles' : 'kilometers';
  return {
    radius,
    unit,
  };
}

function parseZoomRange(zoom) {
  if (zoom.indexOf('-') > -1) {
    const parts = zoom.split('-');
    const min = Number(parts[0]);
    const max = Number(parts[1]);
    return _.range(min, max + 1);
  }

  const nums = _.map(zoom.split(','), s => Number(s));
  return nums.sort();
}

module.exports = {
  createTiles,
};
