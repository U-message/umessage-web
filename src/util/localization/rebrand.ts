const APP_NAME = 'U message';

// Telegram's own products and services keep their real names, as in the Android app
const KEPT_PRODUCTS = 'Premium|Stars|Passport|Business|Gateway|Gifts?|Wallet|Ads|Fragment|Support|Mini Apps?|API';

// Facts about Telegram's infrastructure stay true: data lives on Telegram servers and accounts
const KEPT_FACTS = 'servers?|cloud|accounts?|data ?cent(?:er|re)s?|Terms|Privacy Policy|team';

// "Telegram" as a whole word, but not in handles, domains, Telegram product names or infrastructure facts
const APP_NAME_REGEX = new RegExp(
  `(?<![@./\\w-])Telegram(?![\\w-]|\\.[a-z]|\\s+(?:${KEPT_PRODUCTS})\\b|(?:'s|’s)?\\s+(?:${KEPT_FACTS})\\b)`,
  'g',
);

const CACHE_LIMIT = 2000;
const cache = new Map<string, string>();

export default function rebrandString(value: string) {
  if (!value.includes('Telegram')) return value;

  const cached = cache.get(value);
  if (cached !== undefined) return cached;

  const result = value.replace(APP_NAME_REGEX, APP_NAME);
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(value, result);
  return result;
}
