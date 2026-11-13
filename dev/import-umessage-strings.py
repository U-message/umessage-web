#!/usr/bin/env python3
"""Copy U message strings from the Android app so web and Android say exactly the same thing.

English goes into fallback.strings (the typed source of lang keys), other languages into
src/assets/localization/umessage.json, which getString consults when Telegram's pack lacks a key.
Usage: python3 dev/import-umessage-strings.py [path to TMessagesProj/src/main/res]
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RES = Path(sys.argv[1] if len(sys.argv) > 1 else Path.home() / 'Desktop/Telegram/TMessagesProj/src/main/res')
KEYS_FILE = ROOT / 'dev/umessage-string-keys.txt'
FALLBACK = ROOT / 'src/assets/localization/fallback.strings'
OUT = ROOT / 'src/assets/localization/umessage.json'
LOCALES = {'uz': 'values-uz', 'ru': 'values-ru', 'kaa': 'values-b+kaa'}
# readStrings splits entries on ';', so the markers end with one to stay separate from the first key
BEGIN, END = '/* U message: begin */;', '/* U message: end */;'


def read_xml(folder):
    text = (RES / folder / 'strings.xml').read_text('utf8')
    result = {}
    for name, value in re.findall(r'<string name="([^"]+)"[^>]*>(.*?)</string>', text, re.S):
        value = re.sub(r'<!\[CDATA\[(.*?)\]\]>', r'\1', value, flags=re.S)
        value = value.replace("\\'", "'").replace('\\"', '"').replace('\\n', '\n').replace('\\@', '@')
        # Android positional args -> web {n} variables
        value = re.sub(r'%(\d+)\$[sd]', lambda m: '{' + str(int(m.group(1)) - 1) + '}', value)
        value = re.sub(r'%[sd]', '{0}', value)
        result[name] = html.unescape(value)
    return result


def main():
    keys = [k.strip() for k in KEYS_FILE.read_text('utf8').split() if k.strip()]
    en = read_xml('values')
    missing = [k for k in keys if k not in en]
    if missing:
        sys.exit(f'Not in Android values/strings.xml: {missing}')
    with_semicolon = [k for k in keys if ';' in en[k]]
    if with_semicolon:
        sys.exit(f'fallback.strings cannot hold ";" in a value: {with_semicolon}')

    lines = [BEGIN] + [f'"{k}" = {json.dumps(en[k], ensure_ascii=False)};' for k in keys] + [END]
    fallback = FALLBACK.read_text('utf8')
    fallback = re.sub(r'/\* U message: begin \*/;?.*?/\* U message: end \*/;?\n?', '', fallback, flags=re.S).rstrip('\n')
    FALLBACK.write_text(fallback + '\n' + '\n'.join(lines) + '\n', 'utf8')

    out = {}
    for code, folder in LOCALES.items():
        strings = read_xml(folder)
        out[code] = {k: strings[k] for k in keys if k in strings}
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', 'utf8')
    print(f'{len(keys)} keys; ' + ', '.join(f'{c}: {len(v)}' for c, v in out.items()))


main()
