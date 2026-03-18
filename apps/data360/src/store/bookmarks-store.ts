/**
 * Bookmarks Store — Jotai + localStorage persistence
 *
 * Allows users to bookmark/favorite any page or resource across Data360.
 * SAP BO-inspired favorites system for enterprise UX.
 */
import { atom, useAtom } from 'jotai';

export interface Bookmark {
  id: string;
  label: string;
  href: string;
  module: string;
  addedAt: string;
}

const STORAGE_KEY = 'data360:bookmarks';

function loadBookmarks(): Bookmark[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Bookmark[]) : [];
  } catch {
    return [];
  }
}

function saveBookmarks(bookmarks: Bookmark[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  } catch {
    // localStorage full or unavailable
  }
}

const bookmarksAtom = atom<Bookmark[]>(loadBookmarks());

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useAtom(bookmarksAtom);

  const addBookmark = (bookmark: Omit<Bookmark, 'id' | 'addedAt'>) => {
    const newBookmark: Bookmark = {
      ...bookmark,
      id: `${bookmark.href}-${Date.now()}`,
      addedAt: new Date().toISOString(),
    };
    const updated = [...bookmarks.filter((b) => b.href !== bookmark.href), newBookmark];
    setBookmarks(updated);
    saveBookmarks(updated);
  };

  const removeBookmark = (href: string) => {
    const updated = bookmarks.filter((b) => b.href !== href);
    setBookmarks(updated);
    saveBookmarks(updated);
  };

  const isBookmarked = (href: string) => bookmarks.some((b) => b.href === href);

  const toggleBookmark = (bookmark: Omit<Bookmark, 'id' | 'addedAt'>) => {
    if (isBookmarked(bookmark.href)) {
      removeBookmark(bookmark.href);
    } else {
      addBookmark(bookmark);
    }
  };

  return { bookmarks, addBookmark, removeBookmark, isBookmarked, toggleBookmark };
}
