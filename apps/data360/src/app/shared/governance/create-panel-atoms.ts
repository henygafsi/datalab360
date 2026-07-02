import { atom } from 'jotai';

/**
 * Open-state atoms bridging the governance create CTAs (rendered in the page
 * header, outside the table) to the DOCKED create panels (hosted as flex
 * siblings inside the respective tables). The buttons only flip these flags;
 * the tables read them and dock `AddUserForm` / `AddRoleForm` beside their
 * content — replacing the former centered `useModal()` overlays with a
 * non-blocking docked side panel.
 */
export const addUserPanelOpenAtom = atom(false);
export const addRolePanelOpenAtom = atom(false);
