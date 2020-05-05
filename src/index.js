#!/usr/bin/env node

const BPromise = require('bluebird');
const _ = require('lodash');
const request = require('request-promise');
const chalk = require('chalk');
const promiseRetryify = require('promise-retryify');
const cq = require('concurrent-queue')
const cliParser = require('./cli-parser');
const { createTiles, buildUrl } = require('./tile');

function makeLog(_opts = {}) {
  const opts = _.extend({
    verbose: true,
    color: a => a,
    pad: '',
    out: console.log
  }, _opts);

  return (...args) => {
    if (opts.verbose) {
      const newArgs = _.map(args, a => opts.color(a));
      if (_.isString(newArgs[0])) {
        newArgs[0] = `${opts.pad}${newArgs[0]}`;
      }
      opts.out.apply(this, newArgs);
    }
  }
}

async function main(opts) {
  const logOut = makeLog();
  const logInfo = makeLog({
    verbose: opts.verbose,
    color: chalk.bold,
    out: console.error,
    pad: _.repeat(' ', opts.method.length + 1),
  });
  const logErr = makeLog({ color: chalk.red, out: console.error });

  logInfo('Calculating tiles ..')
  const tilesForLevels = _.map(opts.zoom, zoomLevel => {
    const tiles = createTiles(_.extend({}, opts, { zoom: [zoomLevel] }));
    logInfo(`z${zoomLevel}: ${tiles.length} tiles`);
    return {
      zoom: zoomLevel,
      tileUrls: _.map(tiles, xyz => buildUrl(opts.url, xyz)),
    };
  });

  const totalTilesSum = _.sumBy(tilesForLevels, level => level.tileUrls.length);
  logInfo(`Total of ${totalTilesSum} tile urls for all zoom levels\n`);

  if (totalTilesSum === 0) {
    logErr('No area to cover');
    return;
  }

  if (opts.list) {
    _.forEach(tilesForLevels, (level) => {
      _.forEach(level.tilesUrls, (tileUrl) => {
        logOut(tileUrl);
      });
    });

    return;
  }

  // Used to report average request times once in a while
  const stats = {
    totalRequests: 0,
    totalTime: 0,
    // cleared after each z level
    zoomRequests: 0,
    zoomTime: 0,
  };

  function getAvgResponseTime(attrPrefix = 'zoom') {
    const attrReq = `${attrPrefix}Requests`;
    const attrTime = `${attrPrefix}Time`;
    if (stats[attrReq] === 0) {
      return 0;
    }

    return Number((stats[attrTime] / stats[attrReq]).toFixed(0))
  }

  await BPromise.each(tilesForLevels, async (level) => {
    const { zoom, tileUrls } = level;
    const concurrency = opts.concurrency(zoom);
    logInfo('\n\n');
    logInfo(`Requesting ${tileUrls.length} tiles for z${zoom} with concurrency ${concurrency} ..`);

    stats.zoomRequests = 0;
    stats.zoomTime = 0;

    function reportProgress() {
      const zoomProgress = `${stats.zoomRequests}/${tileUrls.length}`
      const totalProgress = `${stats.totalRequests}/${totalTilesSum}`
      logInfo(`${zoomProgress} for z${zoom} (${totalProgress} total), avg response time for z${zoom} ${getAvgResponseTime('zoom')}ms (${getAvgResponseTime('total')}ms total)`);
    }

    const retryingRequestTile = promiseRetryify(function requestTile(tileUrl, opts) {
      const timeStart = (new Date()).getTime();

      return request({
        url: tileUrl,
        method: opts.method,
        headers: opts.headers,
        simple: false,
        resolveWithFullResponse: true,
      })
        .then((res) => {
          const msTotal = (new Date()).getTime() - timeStart;
          stats.totalRequests += 1;
          stats.totalTime += msTotal;
          stats.zoomRequests += 1;
          stats.zoomTime += msTotal;
          if (stats.zoomRequests > 0 && stats.zoomRequests % 100 === 0) {
            reportProgress();
          }

          const isOk = res.statusCode >= 200 && res.statusCode < 300;
          if (!isOk) {
            logOut(`${opts.method} ${tileUrl} ${chalk.red(res.statusCode)} ${msTotal}ms "${res.body}"`);
            throw new Error(`Received status ${res.statusCode}: ${res.body}`);
          }

          logOut(`${opts.method} ${tileUrl} ${res.statusCode} ${msTotal}ms`);
        })
        .catch((err) => {
          logErr(`${opts.method} ${tileUrl} XXX "${err.message}"`);
          throw err;
        })
    }, {
      beforeRetry: (retryCount, args) => {
        const tileUrl = args[0];
        logInfo(`Retrying tile request ${tileUrl} (${retryCount}) ..`)
      },
      retryTimeout: count => count * opts.retryBaseTimeout(zoom),
      maxRetries: opts.maxRetries(zoom),
    });

    // Request the urls in order with the given concurrency limit. I.e.
    // n workers consuming a FIFO queue, doing requests as fast as they can
    const queueOpts = { concurrency };
    const queue = cq().limit(queueOpts).process((tileUrl) => {
      return retryingRequestTile(tileUrl, opts)
        .catch(err => {
          logErr(`Error requesting ${tileUrl}: "${err.message}", no more retries! Continuing ..`);
          return err;
        });
    })

    const promises = _.map(tileUrls, tileUrl => queue(tileUrl));
    await BPromise.all(promises);
    logInfo(`${stats.zoomRequests}/${stats.zoomRequests} for z${zoom} done, average response time for z${zoom} was ${getAvgResponseTime('zoom')}ms`);
  });

  logInfo('\n\n')
  logInfo(`${stats.totalRequests}/${totalTilesSum} done, average response time was ${getAvgResponseTime('total')}ms`);
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
