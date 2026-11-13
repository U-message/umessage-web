import { memo, useMemo } from '../../../lib/teact/teact';
import { getActions, getGlobal, withGlobal } from '../../../global';

import { ALL_FOLDER_ID, ARCHIVED_FOLDER_ID } from '../../../config';
import { selectIsUMessageStranger } from '../../../global/selectors';
import { unique } from '../../../util/iteratees';

import { useFolderManagerForOrderedIds } from '../../../hooks/useFolderManager';
import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';

import Island, { IslandDescription } from '../../gili/layout/Island';
import UMessageChatRow from './UMessageChatRow';

type OwnProps = {
  isActive?: boolean;
  onReset: () => void;
};

type StateProps = {
  lastMessageIds?: Record<string, number>;
};

// Chats that "Protection from strangers" keeps out of the chat list; replying brings a chat back
const SettingsUMessageStrangerChats = ({ isActive, lastMessageIds, onReset }: OwnProps & StateProps) => {
  const { openChat } = getActions();
  const lang = useLang();

  useHistoryBack({ isActive, onBack: onReset });

  const allIds = useFolderManagerForOrderedIds(ALL_FOLDER_ID);
  const archivedIds = useFolderManagerForOrderedIds(ARCHIVED_FOLDER_ID);
  const strangerIds = useMemo(() => {
    const global = getGlobal();
    return unique([...allIds || [], ...archivedIds || []]).filter((id) => selectIsUMessageStranger(global, id));
    // Last messages decide whether a chat is still a stranger's
    // eslint-disable-next-line react-hooks-static-deps/exhaustive-deps
  }, [allIds, archivedIds, lastMessageIds]);

  return (
    <div className="settings-content custom-scroll">
      <Island>
        {strangerIds.length ? strangerIds.map((chatId) => (
          <UMessageChatRow
            key={chatId}
            chatId={chatId}
            onClick={(id) => openChat({ id, shouldReplaceHistory: true })}
          />
        )) : (
          <p className="settings-item-description">{lang('UMessageStrangerChatsEmpty')}</p>
        )}
      </Island>
      <IslandDescription dir={lang.isRtl ? 'rtl' : undefined}>{lang('UMessageStrangerChatsInfo')}</IslandDescription>
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): Complete<StateProps> => ({
    lastMessageIds: global.chats.lastMessageIds.all,
  }),
)(SettingsUMessageStrangerChats));
