#!/usr/bin/env node

const BPromise = require('bluebird');
const _ = require('lodash');
const request = require('request-promise');
const path = require('path');
const cq = require('concurrent-queue')
const cliParser = require('./cli-parser');
const { createTiles } = require('./tile');

function main(opts) {
  const tileUrls = createTiles(opts);

  // Request the urls in order with the given concurrency limit. I.e.
  // n workers consuming a FIFO queue, doing requests as fast as they can
  const queueOpts = { concurrency: opts.concurrency };
  const queue = cq().limit(queueOpts).process((url) => {
    console.log(`${opts.method} ${url}`);
    return request({
      url,
      method: opts.method,
      headers: opts.headers,
    })
      .then(() => true)
      .catch(err => err);
  })

  const promises = [];
  _.forEach(tileUrls, url => queue(url));
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
