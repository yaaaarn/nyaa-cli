# nyaa-cli

a simple cli client for [nyaa.si](https://nyaa.si/). search, view, and download torrents from the terminal.

## install

### run directly (no install)

```bash
bun run start
```

### nix flake

add to your `flake.nix` inputs:

```nix
nyaa-cli = {
  url = "github:noaanext/nyaa-cli";
  inputs.nixpkgs.follows = "nixpkgs";
};
```

then add `nyaa-cli.packages.${system}.default` to your `environment.systemPackages` or home-manager packages.

## usage

```
usage: nyaa [options] [command]

options:
  -x, --sukebei   use sukebei.nyaa.si (nsfw)
  -v, --version   display version
  -h, --help      display help

commands:
  search [query]  search torrents
  id <id>         view torrent details or download .torrent file
  open <id>       open torrent page in browser
```

### search

```
nyaa search [options] [query]

options:
  -c, --category <cat:sub>  category filter (e.g. anime, anime:raw)
  -f, --filter <n>          filter: 0=none, 1=no remakes, 2=trusted only
  -p, --page <n>            page number
  -s, --sort <field>        sort by: comments, size, date, seeders, leechers, downloads
  -o, --order <dir>         sort order: asc, desc
  -l, --limit <n>           limit results shown
```

### id

```
nyaa id [options] <id>

options:
  -d, --download [file]  download .torrent file
```

### open

```
nyaa open <id>
```

## dev

```bash
# enter the dev shell (if using nix)
nix-shell

# install dependencies
bun install

# build the binary
bun run build  # produces ./nyaa
```

## license

mit
