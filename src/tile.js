const _ = require('lodash');
const turf = require('@turf/turf');
const tileCover = require('@mapbox/tile-cover');

function createTiles(opts) {
  let geojson = turf.point([opts.point.lng, opts.point.lat]);

  geojson = turf.buffer(geojson, opts.buffer.radius, { units: opts.buffer.unit });

  const arrOfArrs = _.map(opts.zoom, z => tileCover.tiles(geojson.geometry, {
    min_zoom: z,
    max_zoom: z
  }));
  const arrOfXyzs = _.flatten(arrOfArrs);
  return _.map(arrOfXyzs, xyz => buildUrl(opts.url, xyz));
}

function buildUrl(template, xyz) {
  return template
    .replace(/\{x\}/g, xyz[0])
    .replace(/\{y\}/g, xyz[1])
    .replace(/\{z\}/g, xyz[2]);
}

module.exports = {
  createTiles,
};
