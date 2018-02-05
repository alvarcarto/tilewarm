#!/usr/bin/env node

// First install: npm i @mapbox/abaculus
// It was removed from devDependencies because node-mapnik is very slow to install
//
// node create-zoom-level-images.js
// convert -limit thread 10 -delay 60 -resize 600x600 -layers optimize *.png levels.gif

const BPromise = require('bluebird');
const fs = require('fs');
const _ = require('lodash');
const request = require('request-promise');
const Jimp = require('jimp');
const abaculus = BPromise.promisify(require('@mapbox/abaculus'));
const turf = require('@turf/turf');

if (!process.env.TILE_URL) {
  throw new Error(`TILE_URL environment variable must be set! Format: http://yourtileserver.com/{z}/{x}/{y}/tile.png`);
}

const BARCELONA_CENTER = {
  lat: 41.382374,
  lng: 2.166612,
};

function main() {
  return BPromise.mapSeries(_.range(3, 20), z => getImageForZoom(z));
}

function getImageForZoom(zoom) {
  console.log(`Fetching images for zoom level ${zoom}`);
  return getImage({
    zoom,
    lat: BARCELONA_CENTER.lat,
    lng: BARCELONA_CENTER.lng,
    template: process.env.TILE_URL,
  })
    .then(image => addText(image, zoom))
    .then(image => {
      fs.writeFileSync(`${_.padStart(zoom, 2, '0')}.png`, image, { encoding: 'binary' });
    });
}

function addText(image, text) {
  let loadedImage;

  return Jimp.read(image)
    .then((image) => {
      loadedImage = image;
      return Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
    })
    .then((font) => {
      drawRect(loadedImage, 30, 30, 100, 90, { r: 255, g: 255, b: 255, a: 255 });

      const printedImage = loadedImage.print(font, 40, 40, String(text));
      BPromise.promisifyAll(printedImage);
      return printedImage.getBufferAsync(Jimp.MIME_PNG);
    });
}

function drawRect(image, x, y, w, h, rgba) {
  _.forEach(_.range(x, x + w + 1), x => {
    _.forEach(_.range(y, y + h + 1), y => {
      image.setPixelColor(hexColor(rgba), x, y);
    });
  });
}

function hexColor(rgba) {
  return Jimp.rgbaToInt(rgba.r, rgba.g, rgba.b, rgba.a);
}

function getImage(opts) {
  const params = {
    zoom: opts.zoom,
    scale: 1,
    center: {
      x: opts.lng,
      y: opts.lat,
      w: 256 * 4,
      h: 256 * 4,
    },
    format: 'png',
    tileSize: 256,
    getTile: function(z, x, y, callback){
      const tileUrl = buildUrl(opts.template, [x, y, z]);

      BPromise.resolve(request({
        url: tileUrl,
        encoding: null,
        timeout: 20 * 60 * 1000
      }))
        .then(data => Buffer.from(data))
        .asCallback(callback);
    },
  };

  return abaculus(params);
}

function buildUrl(template, xyz) {
  return template
    .replace(/\{x\}/g, xyz[0])
    .replace(/\{y\}/g, xyz[1])
    .replace(/\{z\}/g, xyz[2]);
}

main()
  .catch(err => {
    throw err;
  });
