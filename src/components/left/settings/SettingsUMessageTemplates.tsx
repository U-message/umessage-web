import type { FormEvent } from 'react';
import { memo, useEffect, useState } from '../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../global';

import type { UMessageTemplate } from '../../../types';

import { selectSettingsKeys } from '../../../global/selectors';

import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import Island, { IslandDescription, IslandTitle } from '../../gili/layout/Island';
import Button from '../../ui/Button';
import InputText from '../../ui/InputText';
import ListItem from '../../ui/ListItem';
import TextArea from '../../ui/TextArea';

type OwnProps = {
  isActive?: boolean;
  onReset: () => void;
};

type StateProps = {
  templates?: UMessageTemplate[];
};

const SHORTCUT_PATTERN = /[^\p{L}\p{N}_]/gu;

// Quick replies: "/shortcut" + space in any chat turns into the saved text (see richEditorTextReplacements)
const SettingsUMessageTemplates = ({ isActive, templates = [], onReset }: OwnProps & StateProps) => {
  const { setSettingOption } = getActions();
  const lang = useLang();

  const [editingIndex, setEditingIndex] = useState<number>();
  const [shortcut, setShortcut] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();

  useHistoryBack({ isActive, onBack: onReset });

  useEffect(() => {
    if (!isActive) {
      setEditingIndex(undefined);
      setShortcut('');
      setText('');
      setError(undefined);
    }
  }, [isActive]);

  const startEdit = useLastCallback((index: number) => {
    setEditingIndex(index);
    setShortcut(templates[index].shortcut);
    setText(templates[index].text);
    setError(undefined);
  });

  const handleSubmit = useLastCallback((e: FormEvent) => {
    e.preventDefault();
    const cleanShortcut = shortcut.replace(SHORTCUT_PATTERN, '');
    if (!cleanShortcut || !text.trim()) {
      setError(lang('UMessageTemplateEmpty'));
      return;
    }

    const others = templates.filter((_, i) => i !== editingIndex)
      .filter((item) => item.shortcut.toLowerCase() !== cleanShortcut.toLowerCase());
    setSettingOption({ umTemplates: [...others, { shortcut: cleanShortcut, text: text.trim() }] });
    setEditingIndex(undefined);
    setShortcut('');
    setText('');
    setError(undefined);
  });

  const handleDelete = useLastCallback((index: number) => {
    setSettingOption({ umTemplates: templates.filter((_, i) => i !== index) });
  });

  return (
    <div className="settings-content custom-scroll">
      {Boolean(templates.length) && (
        <Island>
          {templates.map((template, index) => (
            <ListItem
              key={template.shortcut}
              narrow
              multiline
              onClick={() => startEdit(index)}
              contextActions={[
                { title: lang('UMessageTemplateEdit'), icon: 'edit', handler: () => startEdit(index) },
                { title: lang('Delete'), icon: 'delete', destructive: true, handler: () => handleDelete(index) },
              ]}
            >
              <span className="title">{`/${template.shortcut}`}</span>
              <span className="subtitle">{template.text}</span>
            </ListItem>
          ))}
        </Island>
      )}
      <IslandDescription dir={lang.isRtl ? 'rtl' : undefined}>{lang('UMessageTemplatesInfo')}</IslandDescription>

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>
        {lang(editingIndex === undefined ? 'UMessageTemplateAdd' : 'UMessageTemplateEdit')}
      </IslandTitle>
      <Island>
        <form className="settings-item" onSubmit={handleSubmit}>
          <InputText
            label={lang('UMessageTemplateShortcut')}
            value={shortcut}
            onChange={(e) => setShortcut(e.currentTarget.value.replace(SHORTCUT_PATTERN, ''))}
          />
          <TextArea
            label={lang('UMessageTemplateText')}
            value={text}
            error={error}
            onChange={(e) => setText(e.currentTarget.value)}
          />
          <Button type="submit">{lang('Save')}</Button>
        </form>
      </Island>
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): Complete<StateProps> => ({
    templates: selectSettingsKeys(global).umTemplates,
  }),
)(SettingsUMessageTemplates));
