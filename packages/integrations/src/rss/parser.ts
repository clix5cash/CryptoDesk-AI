import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { NewsFeedAuthor, NewsFeedDocument, NewsFeedItem, NewsFeedParser } from './types.js';

export class RssNewsFeedParseError extends Error {}

/**
 * Concrete safe XML parser for RSS 2.0 and Atom. Parser-library objects are
 * converted immediately into RSS/Atom-local feed types.
 */
export class XmlNewsFeedParser implements NewsFeedParser {
  parse(input: string): NewsFeedDocument {
    if (!input.trim()) {
      throw new RssNewsFeedParseError('RSS/Atom feed XML body is empty.');
    }

    const validation = XMLValidator.validate(input);

    if (validation !== true) {
      throw new RssNewsFeedParseError('RSS/Atom feed XML is malformed.');
    }

    try {
      const parsed = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        textNodeName: '#text',
        cdataPropName: '#cdata',
        removeNSPrefix: false,
        parseTagValue: false,
        parseAttributeValue: false,
        processEntities: false,
        maxNestedTags: 100,
        isArray: (tagName) => ['item', 'entry', 'author', 'category', 'link'].includes(tagName),
      }).parse(input) as unknown;

      return mapXmlDocument(parsed);
    } catch (error) {
      if (error instanceof RssNewsFeedParseError) {
        throw error;
      }

      throw new RssNewsFeedParseError(
        `Unable to parse RSS/Atom feed XML: ${toErrorMessage(error)}.`,
      );
    }
  }
}

function mapXmlDocument(value: unknown): NewsFeedDocument {
  const root = asRecord(value);

  if (!root) {
    throw new RssNewsFeedParseError('RSS/Atom feed XML does not contain a document root.');
  }

  const rss = asRecord(root.rss);

  if (rss) {
    return mapRssDocument(rss);
  }

  const atom = asRecord(root.feed);

  if (atom) {
    return mapAtomDocument(atom);
  }

  throw new RssNewsFeedParseError('RSS/Atom feed XML must contain an RSS or Atom root.');
}

function mapRssDocument(rss: Readonly<Record<string, unknown>>): NewsFeedDocument {
  const channel = asRecord(rss.channel);

  if (!channel) {
    throw new RssNewsFeedParseError('RSS feed XML requires a channel.');
  }

  return {
    title: textValue(channel.title),
    language: textValue(channel.language),
    items: asArray(channel.item).map(mapRssItem),
  };
}

function mapAtomDocument(feed: Readonly<Record<string, unknown>>): NewsFeedDocument {
  return {
    title: textValue(feed.title),
    language: textValue(feed.lang) ?? textValue(feed['xml:lang']),
    items: asArray(feed.entry).map(mapAtomItem),
  };
}

function mapRssItem(value: unknown): NewsFeedItem {
  const item = requireRecord(value, 'RSS feed item');

  return {
    guid: textValue(item.guid),
    title: textValue(item.title),
    link: firstTextValue(item.link),
    publishedAt: textValue(item.pubDate),
    authors: mapAuthors(item.author, item['dc:creator']),
    excerpt: textValue(item.description),
    content: textValue(item['content:encoded']),
    categories: asArray(item.category)
      .map(textValue)
      .filter((category): category is string => category !== undefined),
  };
}

function mapAtomItem(value: unknown): NewsFeedItem {
  const entry = requireRecord(value, 'Atom feed entry');

  return {
    id: textValue(entry.id),
    title: textValue(entry.title),
    link: atomLink(entry.link),
    publishedAt: textValue(entry.published),
    updatedAt: textValue(entry.updated),
    authors: mapAtomAuthors(entry.author),
    excerpt: textValue(entry.summary),
    content: textValue(entry.content),
    categories: asArray(entry.category).flatMap((category) => {
      const attributes = asRecord(category);
      return textValue(attributes?.term) ?? textValue(category) ?? [];
    }),
    language: textValue(entry.lang) ?? textValue(entry['xml:lang']),
  };
}

function mapAuthors(author: unknown, creator: unknown): ReadonlyArray<NewsFeedAuthor> | undefined {
  const names = [...asArray(author), ...asArray(creator)]
    .flatMap(textValue)
    .map((name) => ({ name }));

  return names.length > 0 ? names : undefined;
}

function mapAtomAuthors(author: unknown): ReadonlyArray<NewsFeedAuthor> | undefined {
  const authors = asArray(author)
    .map(asRecord)
    .flatMap((value) => {
      const name = textValue(value?.name);
      return name ? [{ name }] : [];
    });

  return authors.length > 0 ? authors : undefined;
}

function atomLink(value: unknown): string | undefined {
  const links = asArray(value)
    .map(asRecord)
    .filter((link): link is Record<string, unknown> => !!link);
  const alternate = links.find((link) => textValue(link.rel) === 'alternate') ?? links[0];
  return textValue(alternate?.href);
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  const record = asRecord(value);

  if (!record) {
    throw new RssNewsFeedParseError(`${label} has an invalid structure.`);
  }

  return record;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asArray(value: unknown): ReadonlyArray<unknown> {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function textValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || undefined;
  }

  const record = asRecord(value);

  if (!record) {
    return undefined;
  }

  return textValue(record['#text']) ?? textValue(record['#cdata']);
}

function firstTextValue(value: unknown): string | undefined {
  for (const item of asArray(value)) {
    const text = textValue(item);

    if (text) {
      return text;
    }
  }

  return undefined;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
