import { atom, useAtom } from "jotai";

export const dndEnabled = atom(true);

export function useDndEnabled() {
  const [enabled, setEnabled] = useAtom(dndEnabled);
  return { enabled, setEnabled };
}
