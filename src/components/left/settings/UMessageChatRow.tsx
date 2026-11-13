import { memo } from '../../../lib/teact/teact';
import { withGlobal } from '../../../global';

import type { ApiPeer } from '../../../api/types';
import type { MenuItemContextAction } from '../../ui/ListItem';

import { selectPeer } from '../../../global/selectors';

import Avatar from '../../common/Avatar';
import FullNameTitle from '../../common/FullNameTitle';
import ListItem from '../../ui/ListItem';

type OwnProps = {
  chatId: string;
  subtitle?: string;
  contextActions?: MenuItemContextAction[];
  onClick?: (chatId: string) => void;
};

type StateProps = {
  peer?: ApiPeer;
};

// One chat in the U message lists (hidden chats, strangers, trash): avatar, name and an optional line under it
const UMessageChatRow = ({
  chatId, subtitle, contextActions, peer, onClick,
}: OwnProps & StateProps) => {
  return (
    <ListItem
      className="chat-item-clickable small-icon"
      ripple
      narrow
      contextActions={contextActions}
      onClick={onClick ? () => onClick(chatId) : undefined}
    >
      <Avatar size="medium" peer={peer} />
      <div className="contact-info" dir="auto">
        {peer && <FullNameTitle peer={peer} />}
        {subtitle && <div className="contact-phone" dir="auto">{subtitle}</div>}
      </div>
    </ListItem>
  );
};

export default memo(withGlobal<OwnProps>(
  (global, { chatId }): Complete<StateProps> => ({
    peer: selectPeer(global, chatId),
  }),
)(UMessageChatRow));
