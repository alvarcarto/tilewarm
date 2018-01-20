const _ = require('lodash');
const turf = require('@turf/turf');
const tileCover = require('@mapbox/tile-cover');

function createTiles(opts) {
  const geometries = [];
  if (opts.input) {
    const geojson = opts.input;
    if (geojson.type === 'Feature') {
      geometries.push(geojson.geometry);
    } else {
      _.forEach(geojson.features, i => geometries.push(i.geometry));
    }
  } else {
    const point = turf.point([opts.point.lng, opts.point.lat]);

    // If buffer not defined, use 10meters
    const radius = opts.buffer.radius < 0.0001 ? 0.01 : opts.buffer.radius;
    const buffered = turf.buffer(point, radius, { units: opts.buffer.unit });
    geometries.push(buffered.geometry);
  }

  const a = _.map(geometries, geometry => {
    const b = _.map(opts.zoom, z => tileCover.tiles(geometry, {
      min_zoom: z,
      max_zoom: z
    }));
    return _.flatten(b);
  });
  const sorted = _.orderBy(_.flatten(a), ['2', '0', '1']);
  return _.uniqBy(sorted, xyz => `${xyz[0]}${xyz[1]}${xyz[2]}`);
}

function buildUrl(template, xyz) {
  return template
    .replace(/\{x\}/g, xyz[0])
    .replace(/\{y\}/g, xyz[1])
    .replace(/\{z\}/g, xyz[2]);
}

module.exports = {
  createTiles,
  buildUrl,
};
