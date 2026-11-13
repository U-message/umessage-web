import { memo, useMemo } from '../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../global';

import type { UMessageTrashEntry } from '../../../types';

import { selectSettingsKeys, UMESSAGE_TRASH_TTL_MS } from '../../../global/selectors';

import useFlag from '../../../hooks/useFlag';
import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';

import Island, { IslandDescription } from '../../gili/layout/Island';
import ConfirmDialog from '../../ui/ConfirmDialog';
import ListItem from '../../ui/ListItem';
import UMessageChatRow from './UMessageChatRow';

type OwnProps = {
  isActive?: boolean;
  onReset: () => void;
};

type StateProps = {
  trash?: UMessageTrashEntry[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

const SettingsUMessageChatTrash = ({ isActive, trash, onReset }: OwnProps & StateProps) => {
  const { restoreUMessageChat, purgeUMessageTrash } = getActions();
  const lang = useLang();
  const [isEmptyConfirmOpen, openEmptyConfirm, closeEmptyConfirm] = useFlag();

  useHistoryBack({ isActive, onBack: onReset });

  const entries = useMemo(() => [...(trash || [])].sort((a, b) => b.trashedAt - a.trashedAt), [trash]);

  return (
    <div className="settings-content custom-scroll">
      <Island>
        {entries.length ? entries.map((entry) => {
          const daysLeft = Math.max(1, Math.ceil((entry.trashedAt + UMESSAGE_TRASH_TTL_MS - Date.now()) / DAY_MS));
          return (
            <UMessageChatRow
              key={entry.chatId}
              chatId={entry.chatId}
              subtitle={lang('UMessageChatTrashDaysLeft', { 0: daysLeft })}
              contextActions={[
                {
                  title: lang('UMessageChatTrashRestore'),
                  icon: 'undo',
                  handler: () => restoreUMessageChat({ chatId: entry.chatId }),
                },
                {
                  title: lang('UMessageChatTrashDeleteNow'),
                  icon: 'delete',
                  destructive: true,
                  handler: () => purgeUMessageTrash({ chatIds: [entry.chatId] }),
                },
              ]}
            />
          );
        }) : (
          <p className="settings-item-description">{lang('UMessageChatTrashEmptyInfo')}</p>
        )}
      </Island>
      {Boolean(entries.length) && (
        <>
          <IslandDescription dir={lang.isRtl ? 'rtl' : undefined}>{lang('UMessageChatTrashInfo')}</IslandDescription>
          <Island>
            <ListItem icon="delete" destructive narrow onClick={openEmptyConfirm}>
              <span className="title">{lang('UMessageChatTrashEmpty')}</span>
            </ListItem>
          </Island>
        </>
      )}
      <ConfirmDialog
        isOpen={isEmptyConfirmOpen}
        title={lang('UMessageChatTrashEmpty')}
        text={lang('UMessageChatTrashEmptyConfirm')}
        confirmLabel={lang('Delete')}
        confirmIsDestructive
        confirmHandler={() => {
          closeEmptyConfirm();
          purgeUMessageTrash({ isAll: true });
        }}
        onClose={closeEmptyConfirm}
      />
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): Complete<StateProps> => ({
    trash: selectSettingsKeys(global).umTrash,
  }),
)(SettingsUMessageChatTrash));
