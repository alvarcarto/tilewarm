#!/usr/bin/env node

const util = require('util');
const BPromise = require('bluebird');
const _ = require('lodash');
const prettyMs = require('pretty-ms');
const request = require('request-promise');
const chalk = require('chalk');
const promiseRetryify = require('promise-retryify');
const cq = require('concurrent-queue')
const cliParser = require('./cli-parser');
const { createTiles, buildUrl } = require('./tile');

function oneliner(str, maxLen = 200) {
  let cut = str;
  if (Buffer.isBuffer(cut)) {
    cut = cut.toString('utf8');
  } else if (!_.isString(cut)) {
    cut = `[${Object.prototype.toString.call(cut)}]`;
  }

  cut = util.inspect(cut);

  if (cut.length > maxLen) {
    return `${cut.substring(0, maxLen)} ... (text cut)`;
  }

  return cut;
}

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
  const mainProcessStartTime = (new Date()).getTime();

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
    totalProcessedTiles: 0,
    totalProcessTime: 0,
    totalResponseTime: 0,
    totalRequests: 0,

    // cleared after each z level
    zoomProcessedTiles: 0,
    zoomProcessTime: 0,
    zoomResponseTime: 0,
    zoomRequests: 0
  };

  function getAvgProcessTime(attrPrefix = 'zoom') {
    const attrReq = `${attrPrefix}ProcessedTiles`;
    const attrTime = `${attrPrefix}ProcessTime`;
    if (stats[attrReq] === 0) {
      return 0;
    }

    return Number((stats[attrTime] / stats[attrReq]).toFixed(0))
  }

  const avgConcurrency = _.meanBy(opts.zoom, zoom => opts.concurrency(zoom));

  await BPromise.each(tilesForLevels, async (level) => {
    const zoomProcessStartTime = (new Date()).getTime();

    const { zoom, tileUrls } = level;
    const concurrency = opts.concurrency(zoom);

    logInfo('\n\n');
    logInfo(`Requesting ${tileUrls.length} tiles for z${zoom} with concurrency ${concurrency} ..`);

    stats.zoomProcessedTiles = 0;
    stats.zoomProcessTime = 0;
    stats.zoomResponseTime = 0;
    stats.zoomRequests = 0;

    function reportProgress() {
      const zoomProgress = `${stats.zoomProcessedTiles}/${tileUrls.length}`;
      const totalProgress = `${stats.totalProcessedTiles}/${totalTilesSum}`;
      const zoomTimeLeftMs = ((tileUrls.length - stats.zoomProcessedTiles) * getAvgProcessTime('zoom')) / concurrency;
      const totalTimeLeftMs = ((totalTilesSum - stats.totalProcessedTiles) * getAvgProcessTime('total')) / avgConcurrency;
      logInfo(`${zoomProgress} for z${zoom} (${totalProgress} total)`);
      logInfo(`avg tile processing time per tile ${getAvgProcessTime('zoom')}ms at z${zoom} (${getAvgProcessTime('total')}ms for all zooms)`);
      logInfo(`estimated time left for z${zoom} is ${prettyMs(zoomTimeLeftMs)} with concurrency ${concurrency} (${prettyMs(totalTimeLeftMs)} total)`);
    }

    const retryingRequestTile = promiseRetryify(function requestTile(tileUrl, opts) {
      const timeStart = (new Date()).getTime();

      return request({
        url: tileUrl,
        method: opts.method,
        headers: opts.headers,
        encoding: null,
        simple: false,
        resolveWithFullResponse: true,
      })
        .then((res) => {
          const msResponse = (new Date()).getTime() - timeStart;
          stats.totalRequests += 1;
          stats.totalResponseTime += msResponse;
          stats.zoomRequests += 1;
          stats.zoomResponseTime += msResponse;

          const isOk = res.statusCode >= 200 && res.statusCode < 300;
          if (!isOk) {
            const msg = oneliner(res.body);
            logOut(`${opts.method} ${tileUrl} ${chalk.red(res.statusCode)} ${msResponse}ms "${msg}"`);
            const err = new Error(`Received status ${res.statusCode}: ${res.body}`);
            err.skipLog = true;
            throw err;
          }

          return {
            method: opts.method,
            tileUrl,
            bytes: res.body.byteLength,
            statusCode: res.statusCode,
            response: res,
            msResponseTime: msResponse,
          };
        })
        .catch((err) => {
          if (!err.skipLog) {
            const msg = oneliner(err.message);
            logErr(`${opts.method} ${tileUrl} XXX "${msg}"`);
          }

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
      const timeStart = (new Date()).getTime();

      return retryingRequestTile(tileUrl, opts)
        .catch(err => {
          logErr(`Error requesting ${tileUrl}: "${err.message}", no more retries! Continuing ..`);
          return err;
        })
        .then((metricsOrErr) => {
          const msProcess = (new Date()).getTime() - timeStart;

          if (_.isPlainObject(metricsOrErr)) {
            const m = metricsOrErr;
            logOut(`${m.method} ${m.tileUrl} ${m.statusCode} ${m.msResponseTime}ms (${msProcess}ms total) ${m.bytes}B`);
          }

          stats.totalProcessedTiles += 1;
          stats.totalProcessTime += msProcess;
          stats.zoomProcessedTiles += 1;
          stats.zoomProcessTime += msProcess;
          if (stats.zoomProcessedTiles > 0 && stats.zoomProcessedTiles % 100 === 0) {
            reportProgress();
          }
        });
    })

    const promises = _.map(tileUrls, tileUrl => queue(tileUrl));
    await BPromise.all(promises);
    const zoomProcessMs = (new Date()).getTime() - zoomProcessStartTime;
    logInfo(`${stats.zoomProcessedTiles}/${tileUrls.length} for z${zoom} done, average processing time per tile for z${zoom} was ${getAvgProcessTime('zoom')}ms`);
    logInfo(`total processing time for z${zoom} was ${prettyMs(zoomProcessMs)}`);
  });

  logInfo('\n\n')
  logInfo(`${stats.totalProcessedTiles}/${totalTilesSum} done, average processing time per tile was ${getAvgProcessTime('total')}ms`);
  const totalMainProcessMs = (new Date()).getTime() - mainProcessStartTime;
  logInfo(`total processing time was ${prettyMs(totalMainProcessMs)}`);
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
