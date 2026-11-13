import UMESSAGE_STRINGS from '../../assets/localization/umessage.json';

// U message's own keys are not in Telegram's language packs; their translations come from the Android app
// (dev/import-umessage-strings.py). English lives in fallback.strings like every other key.
const STRINGS = UMESSAGE_STRINGS as Record<string, Record<string, string>>;

export function getUMessageString(langCode: string | undefined, key: string) {
  if (!langCode) return undefined;
  return STRINGS[langCode]?.[key] ?? STRINGS[langCode.split('-')[0]]?.[key];
}
