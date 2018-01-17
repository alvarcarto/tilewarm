const _ = require('lodash');
const yargs = require('yargs');

const VERSION = require('../package.json').version;

const defaultOpts = {
  buffer: '10km',
  zoom: '7-16',
  list: false,
};

function getOpts(argv) {
  const userOpts = getUserOpts();
  const opts = _.merge(defaultOpts, userOpts);
  return validateAndTransformOpts(opts);
}

function getUserOpts() {
  const userOpts = yargs
    .usage(
      'Usage: $0 <url> [options]\n\n' +
      '<url>   Tile URL template\n'
    )
    .example('$0 http://tileserver.com/{z}/{x}/{y}.png')
    .demand(1)
    .option('point', {
      describe: 'Center of region (use with -b)',
      default: defaultOpts.point,
      type: 'string'
    })
    .alias('p', 'point')

    .option('buffer', {
      describe: 'Buffer point/geometry by an amount. Affix units at end: mi,km',
      default: defaultOpts.buffer,
      type: 'string'
    })
    .alias('b', 'buffer')

    .option('zoom', {
      describe: 'Zoom levels (comma separated or range)',
      default: defaultOpts.zoom,
      type: 'string'
    })
    .alias('z', 'zoom')

    .option('list', {
      describe: 'Don\'t perform any requests, just list all tile URLs',
      default: defaultOpts.list,
      type: 'boolean'
    })
    .alias('l', 'list')

    .help('h')
    .alias('h', 'help')
    .alias('v', 'version')
    .version(VERSION)
    .argv;

  userOpts.url = userOpts._[0];
  return userOpts;
}

function validateAndTransformOpts(opts) {
  if (opts.point && !opts.buffer) {
    throwArgumentError('When --point is set, --buffer must also be set');
  }

  return opts;
}

function assertNumber(val, message) {
  const number = Number(val);
  if (!_.isFinite(number)) {
    throwArgumentError(message);
  }
}

function throwArgumentError(message) {
  const err = new Error(message);
  err.argumentError = true;
  throw err;
}

module.exports = {
  defaultOpts: defaultOpts,
  getOpts: getOpts
};
