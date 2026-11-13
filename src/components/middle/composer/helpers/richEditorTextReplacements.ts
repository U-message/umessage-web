import { Extension, InputRule } from '@tiptap/core';
import { getGlobal } from '../../../../global';

import { selectSettingsKeys } from '../../../../global/selectors';
import { selectSharedSettings } from '../../../../global/selectors/sharedState';

// U message quick replies: "/shortcut" followed by a space turns into the saved text
const UMESSAGE_TEMPLATE_RULE = /(?:^|\s)\/([\p{L}\p{N}_]+)\s$/u;

const TEXT_REPLACEMENTS = [
  { find: /--$/, replacement: '—' },
  { find: /<<$/, replacement: '«' },
  { find: />>$/, replacement: '»' },
  { find: /:shrug:$/, replacement: '¯\\_(ツ)_/¯' },
];

export const RichEditorTextReplacements = Extension.create({
  name: 'textReplacements',

  addInputRules() {
    const templateRule = new InputRule({
      find: UMESSAGE_TEMPLATE_RULE,
      handler: ({ state, range, match }) => {
        const shortcut = match[1].toLowerCase();
        const template = selectSettingsKeys(getGlobal()).umTemplates
          ?.find((item) => item.shortcut.toLowerCase() === shortcut);
        // tiptap treats a null result as "rule not applied", so the space is typed normally
        // eslint-disable-next-line no-null/no-null
        if (!template) return null;

        const typedLength = shortcut.length + 2; // "/" + shortcut + the space
        state.tr.insertText(`${template.text} `, range.to - typedLength + 1, range.to);
        return undefined;
      },
    });

    return [templateRule, ...TEXT_REPLACEMENTS.map(({ find, replacement }) => new InputRule({
      find,
      handler: ({ state, range }) => {
        if (!selectSharedSettings(getGlobal()).shouldReplaceTextShortcuts) {
          return;
        }

        state.tr.insertText(replacement, range.from, range.to);
      },
    }))];
  },
});
