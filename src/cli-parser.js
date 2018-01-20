const _ = require('lodash');
const yargs = require('yargs');
const fs = require('fs');

const VERSION = require('../package.json').version;

const defaultOpts = {
  buffer: '0km',
  zoom: '3-9',
  list: false,
  input: null,
  method: 'GET',
  headers: {},
  concurrency: 5,
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
    .example('tilewarm http://tileserver.com/{z}/{x}/{y}.png --point 62.31,23.12 --buffer 10km')
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

    .option('input', {
      describe: 'GeoJSON input file',
      default: defaultOpts.input,
      type: 'string'
    })
    .alias('i', 'input')

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

  if (!/^((\d+\-\d+)|(\d+(,\d+)*))$/.test(opts.zoom)) throwArgumentError('Invalid "zoom" argument');
  assertTemplateUrl(opts.url);

  return _.merge({}, opts, {
    buffer: parseBuffer(opts.buffer),
    zoom: parseZoomRange(opts.zoom),
    point: parsePoint(opts.point),
    input: parseInput(opts.input),
  });
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

function parsePoint(point) {
  const arr = String(point).split(',');
  const nums = _.map(arr, i => parseFloat(i));
  return {
    lat: nums[0],
    lng: nums[1],
  };
}

function parseBuffer(buffer) {
  const radius = parseFloat(buffer);
  const unit = /mi$/.test(buffer) ? 'miles' : 'kilometers';
  return {
    radius,
    unit,
  };
}

function parseZoomRange(zoom) {
  if (zoom.indexOf('-') > -1) {
    const parts = zoom.split('-');
    const min = Number(parts[0]);
    const max = Number(parts[1]);
    return _.range(min, max + 1);
  }

  const nums = _.map(zoom.split(','), s => Number(s));
  return _.sortBy(nums);
}

function parseInput(input) {
  if (!input) {
    return null;
  }

  const content = fs.readFileSync(input, { encoding: 'utf8'});
  let obj;
  try {
    obj = JSON.parse(content);
  } catch (e) {
    throwArgumentError('Invalid JSON');
  }
  return obj;
}

function assertTemplateUrl(template) {
  if (!/^https?\:/.test(template)) {
    throwArgumentError('Invalid url');
  }

  assertTemplateUrlParameter(template, '{x}');
  assertTemplateUrlParameter(template, '{y}');
  assertTemplateUrlParameter(template, '{z}');
}

function assertTemplateUrlParameter(template, param) {
  if (template.indexOf(param) === -1) {
    throwArgumentError(`Template url is missing parameter: ${param}`);
  }
};

module.exports = {
  getOpts: getOpts
};
