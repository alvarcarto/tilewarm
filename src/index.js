#!/usr/bin/env node

const BPromise = require('bluebird');
const _ = require('lodash');
const request = require('request-promise');
const promiseRetryify = require('promise-retryify');
const cq = require('concurrent-queue')
const cliParser = require('./cli-parser');
const { createTiles, buildUrl } = require('./tile');

function requestTile(tileUrl, opts) {
  return request({
    url: tileUrl,
    method: opts.method,
    headers: opts.headers,
    resolveWithFullResponse: true,
  })
    .then((res) => {
      console.log(`${opts.method} ${tileUrl} ${res.statusCode}`);
    })
    .catch((err) => {
      if (err.name === 'StatusCodeError') {
        const res = err.response;
        console.log(`${opts.method} ${tileUrl} ${res.statusCode} "${res.body}"`);
        throw err;
      }

      console.log(`${opts.method} ${tileUrl} XXX "${err.message}"`);
      throw err;
    });
}

function main(opts) {
  console.error('Calculating tiles ..')
  const tiles = createTiles(opts);
  if (opts.verbose) console.log(`${tiles.length} tile urls total`);

  const retryingRequestTile = promiseRetryify(requestTile, {
    beforeRetry: retryCount => console.log(`Retrying tile request (${retryCount}) ..`),
    retryTimeout: count => count * opts.retryBaseTimeout,
    maxRetries: opts.maxRetries,
  });

  // Request the urls in order with the given concurrency limit. I.e.
  // n workers consuming a FIFO queue, doing requests as fast as they can
  const queueOpts = { concurrency: opts.concurrency };
  const queue = cq().limit(queueOpts).process((xyz) => {
    const tileUrl = buildUrl(opts.url, xyz);

    if (opts.list) {
      console.log(tileUrl);
      return BPromise.resolve(true);
    }

    return retryingRequestTile(tileUrl, opts)
      .catch(err => {
        console.error(`Error requesting ${tileUrl}: "${err.message}", no more retries! Continuing ..`);
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
