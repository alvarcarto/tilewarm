#!/usr/bin/env node

// Convert cities to geojson
// Usage:
// node tools/cities-to-geojson.js cities.csv > cities.json

const BPromise = require('bluebird');
const fs = require('fs');
const _ = require('lodash');
const csv = require('csv');
const turf = require('@turf/turf');


// https://gis.stackexchange.com/questions/8650/measuring-accuracy-of-latitude-and-longitude
const CITY_RADIUS = 0.2;  // 0.2 degrees = ~20km

BPromise.promisifyAll(csv);

if (!process.argv[2]) {
  console.error('Incorrect parameters');
  console.error('Usage: ./cities-to-geojson.js <csv-file>');
  process.exit(2);
}

function main() {
  const INPUT_CSV_PATH = process.argv[2];
  const fileContent = fs.readFileSync(INPUT_CSV_PATH, { encoding: 'utf8' });

  csv.parseAsync(fileContent, {
    comment: '#',
    delimiter: ',',
    auto_parse: false,
    trim: true,
  })
  .then(data => transform(data))
  .then(result => JSON.stringify(result))
  .tap(str => console.log(str))
  .catch((err) => {
    console.log('err', err)
    throw err;
  });
}

function transform(matrix) {
  const rows = _.filter(_.tail(matrix), row => !_.isEmpty(row[0]));
  const cities = _.map(rows, row => ({
    name: row[1],
    lat: Number(row[4]),
    lng: Number(row[5]),
    countryCode: row[8].toUpperCase(),
    population: Number(row[14]),
  }));

  const filteredCities = _.filter(cities, c => c.population > 60000);
  const arr = _.map(filteredCities, city => {
    const point = turf.point([city.lng, city.lat]);
    const topLeft = getDestination(point, -45).geometry.coordinates;
    const topRight = getDestination(point, 45).geometry.coordinates;
    const bottomRight = getDestination(point, 135).geometry.coordinates;
    const bottomLeft = getDestination(point, -135).geometry.coordinates;

    return turf.polygon([[
      topLeft,
      topRight,
      bottomRight,
      bottomLeft,
      topLeft,
    ]]);
  });

  return turf.featureCollection(arr);
}

function getDestination(point, bearing) {
  const distance = 15;
  const options = { units: 'kilometers' };
  return turf.destination(point, distance, bearing, options);
}

main();
