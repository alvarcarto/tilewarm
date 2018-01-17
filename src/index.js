#!/usr/bin/env node

const BPromise = require('bluebird');
const _ = require('lodash');
const path = require('path');
const cliParser = require('./cli-parser');
const { createTiles } = require('./tile');

function main(_opts) {
  const opts = _.extend({}, cliParser.defaultOpts, _opts);

  const tiles = createTiles(opts);
  console.log(tiles);
  return BPromise.resolve();
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
