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
TODO
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
