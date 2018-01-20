#!/usr/bin/env node

const BPromise = require('bluebird');
const _ = require('lodash');
const request = require('request-promise');
const path = require('path');
const cq = require('concurrent-queue')
const cliParser = require('./cli-parser');
const { createTiles, buildUrl } = require('./tile');

function main(opts) {
  const tiles = createTiles(opts);
  if (opts.verbose) console.log(`${tiles.length} tile urls total`);

  // Request the urls in order with the given concurrency limit. I.e.
  // n workers consuming a FIFO queue, doing requests as fast as they can
  const queueOpts = { concurrency: opts.concurrency };
  const queue = cq().limit(queueOpts).process((xyz) => {
    const tileUrl = buildUrl(opts.url, xyz);

    if (opts.list) {
      console.log(tileUrl);
      return BPromise.resolve(true);
    }

    console.log(`${opts.method} ${tileUrl}`);
    return request({
      url: tileUrl,
      method: opts.method,
      headers: opts.headers,
    })
      .then(() => true)
      .catch(err => {
        console.error(err.message);
        return err;
      });
  })

  if (tiles.length === 0) {
    console.log('No area to cover');
  }
  const promises = [];
  _.forEach(tiles, xyz => queue(xyz));
  return BPromise.all(promises);
}

if (require.main === module) {
  let opts;
  try {
    opts = cliParser.getOpts();
  } catch (err) {
    if (err.argumentError) {
      console.error(err.message);
      process.exit(1);
    }

    throw err;
  }

  main(opts)
    .catch((err) => {
      throw err;
    });
}

module.exports = main;
