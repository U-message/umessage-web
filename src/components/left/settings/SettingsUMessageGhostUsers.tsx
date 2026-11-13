import {
  memo, useEffect, useMemo, useState,
} from '../../../lib/teact/teact';
import { getActions, getGlobal, withGlobal } from '../../../global';

import { ALL_FOLDER_ID, ARCHIVED_FOLDER_ID, SERVICE_NOTIFICATIONS_USER_ID } from '../../../config';
import { isDeletedUser, isUserBot } from '../../../global/helpers';
import { filterPeersByQuery } from '../../../global/helpers/peers';
import { selectSettingsKeys } from '../../../global/selectors';
import { unique } from '../../../util/iteratees';

import { useFolderManagerForOrderedIds } from '../../../hooks/useFolderManager';
import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import PeerPicker from '../../common/pickers/PeerPicker';
import FloatingActionButton from '../../ui/FloatingActionButton';

type OwnProps = {
  isActive?: boolean;
  onReset: () => void;
};

type StateProps = {
  currentUserId?: string;
  ghostUserIds?: string[];
};

const EMPTY_IDS: string[] = [];

// People that ghost mode's "only selected" / "everyone except" scope applies to; users only, as on Android
const SettingsUMessageGhostUsers = ({
  isActive,
  currentUserId,
  ghostUserIds = EMPTY_IDS,
  onReset,
}: OwnProps & StateProps) => {
  const { setUMessageGhostUsers } = getActions();
  const lang = useLang();

  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitShown, setIsSubmitShown] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(ghostUserIds);

  useEffect(() => {
    if (!isActive) {
      setSelectedIds(ghostUserIds);
      setIsSubmitShown(false);
    }
  }, [isActive, ghostUserIds]);

  useHistoryBack({ isActive, onBack: onReset });

  const folderAllOrderedIds = useFolderManagerForOrderedIds(ALL_FOLDER_ID);
  const folderArchivedOrderedIds = useFolderManagerForOrderedIds(ARCHIVED_FOLDER_ID);

  const displayedIds = useMemo(() => {
    const usersById = getGlobal().users.byId;
    const userIds = unique([...folderAllOrderedIds || [], ...folderArchivedOrderedIds || []])
      .filter((id) => {
        const user = usersById[id];
        return user && !isDeletedUser(user) && !isUserBot(user)
          && id !== currentUserId && id !== SERVICE_NOTIFICATIONS_USER_ID;
      });

    if (searchQuery) return filterPeersByQuery({ ids: userIds, query: searchQuery });
    return unique([...ghostUserIds, ...userIds]);
  }, [folderAllOrderedIds, folderArchivedOrderedIds, ghostUserIds, searchQuery, currentUserId]);

  const handleSelectedIdsChange = useLastCallback((ids: string[]) => {
    setSelectedIds(ids);
    setIsSubmitShown(true);
  });

  const handleSubmit = useLastCallback(() => {
    setUMessageGhostUsers({ userIds: selectedIds });
    onReset();
  });

  return (
    <div className="Picker settings-picker-islands">
      <PeerPicker
        itemIds={displayedIds}
        selectedIds={selectedIds}
        filterValue={searchQuery}
        filterPlaceholder={lang('UMessageGhostUsersAdd')}
        searchInputId="umessage-ghost-users-search"
        isSearchable
        onSelectedIdsChange={handleSelectedIdsChange}
        onFilterChange={setSearchQuery}
        allowMultiple
        itemInputType="checkbox"
        withDefaultPadding
        withStatus
        withIslands
      />

      <FloatingActionButton
        isShown={isSubmitShown}
        onClick={handleSubmit}
        ariaLabel={lang('UMessageGhostUsers')}
        iconName="check"
      />
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): Complete<StateProps> => ({
    currentUserId: global.currentUserId,
    ghostUserIds: selectSettingsKeys(global).umGhostUserIds,
  }),
)(SettingsUMessageGhostUsers));
