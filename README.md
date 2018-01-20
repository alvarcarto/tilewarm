# tilewarm

A command-line tool to warm up your tile server cache. Give it a URL template, coordinates, and list of zoom levels and it will systematically request all tile images in the given area.

```bash
npm i -g tilewarm
```


## Examples

**Basic example:**

```bash
tilewarm http://tile.osm.org/{z}/{x}/{y}.png --point 1,1 --buffer 10km
```

## Usage

```
Usage:  <url> [options]

<url>   Tile URL template


Options:
  -h, --help     Show help                                             [boolean]
  -p, --point    Center of region (use with -b)                         [string]
  -b, --buffer   Buffer point/geometry by an amount. Affix units at end: mi,km
                                                       [string] [default: "0km"]
  -z, --zoom     Zoom levels (comma separated or range)
                                                      [string] [default: "3-11"]
  -l, --list     Don't perform any requests, just list all tile URLs
                                                      [boolean] [default: false]
  -i, --input    GeoJSON input file                     [string] [default: null]
  -v, --version  Show version number                                   [boolean]

Examples:
  tilewarm http://tileserver.com/{z}/{x}/{y}.png --point 62.31,23.12 --buffer 10km
```

### Warming cache for all cities in the world

Form a geojson for all cities in the world.

```bash
node tools/cities-to-geojson.js tools/cities.csv > cities.geojson

# Put geojson to clipboard, works on Mac
cat cities.geojson | pbcopy
```

You can debug the geojson by pasting it into http://geojson.io/. The file can
be compressed even more with https://www.npmjs.com/package/geojson-precision.


Then run:

```
tilewarm http://yourtileserver.com/{z}/{x}/{y}.png --input cities.geojson
```


# Contributors


## Release

* Commit all changes.
* Use [np](https://github.com/sindresorhus/npm) to automate the release:

    `np`

* Edit GitHub release notes.


## Attribution

This tool is almost a rewrite of [tilemantle](https://github.com/naturalatlas/tilemantle), which hadn't been updated for a while and had a crash bug for our
use case.


# License

MIT
