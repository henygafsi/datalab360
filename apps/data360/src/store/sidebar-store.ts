import { atom, useAtom } from "jotai";

export const sidebarCollapsedAtom = atom(false);

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);
  return { collapsed, setCollapsed };
}
