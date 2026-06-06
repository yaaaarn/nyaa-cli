import { Command, InvalidArgumentError } from 'commander';
import { load } from 'cheerio';
import chalk from 'chalk';
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlink } from "node:fs/promises";
import { version } from './package.json';

// TODO: make another categories list for sukebei
export const Categories = {
  ALL: { id: '0_0' },
  ANIME: {
    id: '1_0',
    subs: { AMV: '1_1', ENGLISH: '1_2', NON_ENGLISH: '1_3', RAW: '1_4' }
  },
  AUDIO: {
    id: '2_0',
    subs: { LOSSLESS: '2_1', LOSSY: '2_2' }
  },
  LITERATURE: {
    id: '3_0',
    subs: { ENGLISH: '3_1', NON_ENGLISH: '3_2', RAW: '3_3' }
  },
  LIVE_ACTION: {
    id: '4_0',
    subs: { ENGLISH: '4_1', IDOL_PROMOTIONAL_VIDEO: '4_2', NON_ENGLISH: '4_3', RAW: '4_4' }
  },
  PICTURES: {
    id: '5_0',
    subs: { GRAPHICS: '5_1', PHOTOS: '5_2' }
  },
  SOFTWARE: {
    id: '6_0',
    subs: { APPLICATIONS: '6_1', GAMES: '6_2' }
  }
} as const;

type Keys = keyof typeof Categories;
export type Category =
  | typeof Categories[Keys]['id']
  | typeof Categories[Exclude<Keys, 'ALL'>]['subs'][keyof typeof Categories[Exclude<Keys, 'ALL'>]['subs']];

interface SearchOptions {
  category: Category;
  filter: number;
  page: number;
  url: string;
  sort?: 'comments' | 'size' | 'date' | 'seeders' | 'leechers' | 'downloads';
  order?: 'asc' | 'desc';
  limit: number;
}

interface IDOptions {
  url: string;
  download?: string;
}

export function parseCategory(input: string): Category | undefined {
  const [mainInput, subInput] = input.toUpperCase().split(':');

  if (!((mainInput ?? '') in Categories)) return undefined;
  const mainCategory = Categories[mainInput as Keys];

  if (!subInput) {
    return mainCategory.id;
  }

  if ('subs' in mainCategory) {
    const subs = mainCategory.subs as Record<string, string>;
    if (subInput in subs) {
      return subs[subInput] as Category;
    }
  }

  return undefined;
}

const validCategoryInputs = Object.entries(Categories).flatMap(([mainKey, mainVal]) => {
  const keys = [mainKey.toLowerCase()];
  if ('subs' in mainVal) {
    const subKeys = Object.keys(mainVal.subs).map(subKey => `${mainKey}:${subKey}`.toLowerCase());
    keys.push(...subKeys);
  }
  return keys;
});

function getBaseUrl(sukebei: boolean): string {
  return sukebei ? 'https://sukebei.nyaa.si/' : 'https://nyaa.si/';
}

function parseIntOption(value: string) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new InvalidArgumentError('not a valid number.');
  }
  return parsed;
}

function parseCategoryOption(value: string) {
  const normalized = value.toLowerCase();
  if (!validCategoryInputs.includes(normalized)) {
    throw new InvalidArgumentError(`allowed categories: ${validCategoryInputs.join(', ')}`);
  }
  return normalized;
}

function parseOrderOption(value: string) {
  const normalized = value.toLowerCase();
  if (normalized !== 'asc' && normalized !== 'desc') {
    throw new InvalidArgumentError('order must be either "asc" or "desc".');
  }
  return normalized as 'asc' | 'desc';
}

async function downloadTorrent(torrentId: number | string, baseUrl: string, output?: string) {
  const downloadUrl = new URL(`/download/${torrentId}.torrent`, baseUrl);
  const response = await fetch(downloadUrl.toString());
  if (!response.ok) {
    throw new Error(`failed to download torrent: HTTP ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  const filename = output ?? `${torrentId}.torrent`;
  await Bun.write(filename, new Uint8Array(buffer));
  console.log(`\n${chalk.green('✓')} downloaded: ${chalk.bold(filename)}`);
}

const Scraper = {
  async search(query: string | null | undefined, options: SearchOptions) {
    const url = new URL(options.url);
    url.searchParams.set('p', options.page.toString());
    url.searchParams.set('f', options.filter.toString());
    url.searchParams.set('c', options.category.toString());
    if (query) url.searchParams.set('q', query);
    if (options.sort) url.searchParams.set('s', options.sort);
    if (options.order) url.searchParams.set('o', options.order);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const html = await response.text();
    const $ = load(html);

    console.log(`\n${chalk.italic(chalk.gray('search results for:', query || '[none]'))}`);

    $('table tbody tr').slice(0, options.limit).each((_, row) => {
      const cols = $(row).find('td');
      const category = $(cols[0]).find('img').attr('alt') ?? '';
      const title = $(cols[1]).find('a:not(.comments)').last().text().trim();
      const pageLink = $(cols[1]).find('a[href^="/view/"]').attr('href') ?? '';

      const size = $(cols[3]).text().trim();
      const date = $(cols[4]).text().trim();
      const seeders = Number($(cols[5]).text().trim());
      const leechers = Number($(cols[6]).text().trim());
      const downloads = Number($(cols[7]).text().trim());

      console.log(`\n${chalk.black(chalk.bgGray(` ${pageLink.replace('/view/', '').split('#')[0]} `))} ${chalk.bold(title)}`);
      console.log(
        chalk.gray(category), chalk.gray('|'),
        chalk.green(`󰞙 ${seeders} *`), chalk.red(`󰞕 ${leechers} *`), chalk.gray(`󰇚 ${downloads}`),
        chalk.gray('|'), chalk.gray(`󰋊 ${size} *`), chalk.gray(`󰃭 ${date}`)
      );
    });
  },

  async findById(torrentId: number, options: IDOptions) {
    const url = new URL(`/view/${torrentId}`, options.url);

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const html = await response.text();
      const $ = load(html);

      const title = $('.panel-title').first().text().trim();
      if (!title) {
        console.log(chalk.red(`\nerror: torrent #${torrentId} not found.`));
        return;
      }

      const metadata: Record<string, string> = {};
      $('.panel-body').first().find('.row').each((_, row) => {
        const labelEl = $(row).find('.col-md-1, .col-md-offset-6');
        const valueEl = $(row).find('.col-md-5');

        labelEl.each((idx, label) => {
          const key = $(label).text().replace(':', '').trim();
          const val = $(valueEl[idx]).text().trim();
          if (key) metadata[key] = val;
        });
      });

      const seeders = $('.panel-body span[style="color: green;"]').text().trim() || '0';
      const leechers = $('.panel-body span[style="color: red;"]').text().trim() || '0';
      const magnetLink = $('.panel-footer a[href^="magnet:"]').attr('href');
      const torrentLink = $('.panel-footer a[href^="/download/"]').attr('href');
      const description = $('#torrent-description').text().trim() || 'no description provided';

      console.log(`\n${chalk.bold(title)}`);
      console.log(`${chalk.gray('Category:')}   ${metadata['Category'] || 'unknown'}`);
      console.log(`${chalk.gray('Submitter:')}  ${metadata['Submitter'] || 'anon'}`);
      console.log(`${chalk.gray('Date:')}       ${metadata['Date'] || 'unknown'}`);
      console.log(`${chalk.gray('Size:')}       ${metadata['File size'] || 'unknown'}`);
      console.log(`${chalk.gray('Hash:')}       ${chalk.yellow(metadata['Info hash'] || 'unknown')}\n`);

      console.log(chalk.green(`󰞙 ${seeders}`), chalk.gray('|'), chalk.red(`󰞕 ${leechers}`), chalk.gray('|'), chalk.blue(`󰇚 ${metadata['Completed'] || '0'}`));

      if (options.download !== undefined) {
        const output = typeof options.download === 'string' ? options.download : undefined;
        try {
          await downloadTorrent(torrentId, options.url, output);
        } catch (err) {
          console.error(chalk.red(`\nfailed to download torrent file:`), err instanceof Error ? err.message : err);
        }
      } else {
        const tempFilePath = join(tmpdir(), `glow-${crypto.randomUUID()}.md`);
        try {
          await Bun.write(tempFilePath, description);
          await Bun.$`glow --style=dark ${tempFilePath}`.env({ CLICOLOR_FORCE: '1', ...process.env });
        } catch (err) {
          console.error("an error occurred rendering markdown:", err);
        } finally {
          await unlink(tempFilePath).catch(() => { });
        }

        if (magnetLink) console.log(`\n${chalk.magenta('Magnet Link:')}\n${chalk.underline(magnetLink)}`);
        if (torrentLink) console.log(`\n${chalk.magenta('Torrent Link:')}\n${chalk.underline(new URL(torrentLink, options.url))}\n`);
      }

    } catch (error) {
      console.error(chalk.red(`\nfailed to fetch or parse torrent #${torrentId}:`), error instanceof Error ? error.message : error);
    }
  }
};

const program = new Command();

program
  .name('nyaa-cli')
  .description('a simple nyaa.si cli client')
  .version(process.env.NYAA_BUILD_VER ?? version);

program.option('-x, --sukebei', 'use sukebei (nsfw)', false);

program
  .command('search [query]')
  .description('search torrents')
  .option('-c, --category <type>', 'show category (e.g., anime, anime:raw)', parseCategoryOption, 'anime')
  .option('-f, --filter <number>', 'filter out torrents (1=no_remakles, 2=trusted_only)', parseIntOption, 0)
  .option('-p, --page <number>', 'page index', parseIntOption, 1)
  .option('-s, --sort <type>', 'sort by (comments, size, date, seeders, leechers, downloads)')
  .option('-o, --order <direction>', 'sort order (asc or desc)', parseOrderOption)
  .option('-l, --limit <number>', 'limit results', parseIntOption, Infinity)
  .action(async (query, options) => {
    const globalOpts = program.opts();

    if (options.filter !== 0 && options.filter !== 1 && options.filter !== 2) {
      throw new InvalidArgumentError('filter must be either 1 or 2.');
    }

    await Scraper.search(query, {
      url: getBaseUrl(globalOpts.sukebei),
      page: options.page,
      filter: options.filter,
      category: parseCategory(options.category) ?? '0_0',
      sort: options.sort,
      order: options.order,
      limit: options.limit
    });
  });

// ID command
program
  .command('id <id>')
  .description('get torrent details from id')
  .option('-d, --download [filename]', 'download the .torrent file')
  .action(async (id, options) => {
    const globalOpts = program.opts();
    const numericId = parseInt(id, 10);

    if (isNaN(numericId)) {
      console.error(chalk.red('error: id parameter must be a numeric value.'));
      process.exit(1);
    }

    await Scraper.findById(numericId, { url: getBaseUrl(globalOpts.sukebei), download: options.download });
  });

// Open command
program
  .command('open <id>')
  .description('open torrent page in browser')
  .action(async (id) => {
    const globalOpts = program.opts();
    const numericId = parseInt(id, 10);

    if (isNaN(numericId)) {
      console.error(chalk.red('error: id parameter must be a numeric value.'));
      process.exit(1);
    }

    const url = new URL(`/view/${numericId}`, getBaseUrl(globalOpts.sukebei)).toString();
    console.log(`opening ${chalk.underline(url)}`);

    if (process.platform === 'darwin') {
      await Bun.$`open ${url}`;
    } else {
      await Bun.$`xdg-open ${url}`;
    }
  });

// Execute entry
program.parse(process.argv);
