import { useMemo } from '../../../../lib/teact/teact';
import { getGlobal } from '../../../../global';

import type { GlobalState } from '../../../../global/types';

import { selectIsUMessageHiddenFromList, selectSettingsKeys } from '../../../../global/selectors';

import { useShallowSelector } from '../../../../hooks/data/useSelector';

function selectListSettings(global: GlobalState) {
  const { umHiddenChatIds, umTrash, umStrangerProtection } = selectSettingsKeys(global);
  return { umHiddenChatIds, umTrash, umStrangerProtection };
}

// U message: hidden chats, chats in the trash and (with protection on) strangers stay out of the chat list
export default function useUMessageVisibleChatIds(orderedIds: string[] | undefined, isSaved?: boolean) {
  const { umHiddenChatIds, umTrash, umStrangerProtection } = useShallowSelector(selectListSettings);

  return useMemo(() => {
    if (!orderedIds || isSaved || (!umHiddenChatIds?.length && !umTrash?.length && !umStrangerProtection)) {
      return orderedIds;
    }
    const global = getGlobal();
    return orderedIds.filter((id) => !selectIsUMessageHiddenFromList(global, id));
  }, [orderedIds, isSaved, umHiddenChatIds, umTrash, umStrangerProtection]);
}
