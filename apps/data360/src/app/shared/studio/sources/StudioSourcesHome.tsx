'use client';

/**
 * StudioSourcesHome — /studio/source, recomposed.
 *
 * Two local views over the same surface — « Connections » (reusable
 * technical access) and « Objects in use » (what applications actually
 * read) — as dense lists with search/sort/pagination; a click opens the
 * matching sheet in place of the list, nothing is open without a
 * selection. One primary action: « Add a source », which runs the guided
 * journey (reuse or create a connection → test → pick objects → preview →
 * attach) full-width.
 *
 * The view and the open sheet are URL-addressable (?view= / ?connection= /
 * ?object=) via history.replaceState — deep-linkable without remounting
 * the page (the repo rule: tabs are query params, not Suspense panels).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { invalidateSourcesCaches } from '@/app/services/studio/studio-api';
import { PlainQuestionHeader, QuietAction } from '@/app/shared/studio/PlainKit';
import ConnectionsPanel from '@/app/shared/studio/sources/ConnectionsPanel';
import StudioLakeMap from '@/app/shared/studio/sources/StudioLakeMap';
import ObjectsPanel from '@/app/shared/studio/sources/ObjectsPanel';
import StudioScanOptionsPanel from '@/app/shared/studio/sources/StudioScanOptionsPanel';
import StudioSourceOnboarding from '@/app/shared/studio/StudioSourceOnboarding';
import { routes } from '@/config/routes';
import { useTrackEvent } from '@/hooks/useTrackEvent';

type View = 'connections' | 'objects' | 'lake';

function writeUrl(view: View, sel: { connection?: string | null; object?: string | null }) {
  const p = new URLSearchParams(window.location.search);
  p.set('view', view);
  if (sel.connection) p.set('connection', sel.connection);
  else p.delete('connection');
  if (sel.object) p.set('object', sel.object);
  else p.delete('object');
  window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`);
}

export default function StudioSourcesHome() {
  const sp = useSearchParams();
  const { trackTabSwitch } = useTrackEvent();

  const [view, setView] = useState<View>(
    sp.get('view') === 'objects' ? 'objects' : sp.get('view') === 'lake' ? 'lake' : 'connections',
  );
  const [adding, setAdding] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  // deep links are read once; afterwards the panels own their selection
  const initialConnection = useRef(sp.get('connection'));
  const initialObject = useRef(sp.get('object'));
  const selRef = useRef<{ connection?: string | null; object?: string | null }>({
    connection: initialConnection.current,
    object: initialObject.current,
  });

  useEffect(() => {
    writeUrl(view, selRef.current);
  }, [view]);

  // the view toggle unmounts/remounts the panels, which re-read the
  // initial* refs — keep them in sync so a CLOSED sheet does not reopen
  // from a stale deep-link on the next toggle
  const onConnectionSel = useCallback(
    (key: string | null) => {
      selRef.current.connection = key;
      initialConnection.current = key;
      writeUrl(view, selRef.current);
    },
    [view],
  );
  const onObjectSel = useCallback(
    (fqn: string | null) => {
      selRef.current.object = fqn;
      initialObject.current = fqn;
      writeUrl(view, selRef.current);
    },
    [view],
  );

  const closeAdd = useCallback(() => {
    // a finished (or abandoned) add flow may have created connections or
    // attached objects — the lists must not serve their pre-mutation cache
    invalidateSourcesCaches();
    setAdding(false);
    setRefreshToken((n) => n + 1);
  }, []);

  if (adding) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="px-4 pt-3 md:px-6">
          <QuietAction label="← Back to your sources" onClick={closeAdd} />
        </div>
        {/* the guided add journey — Wave 2 restructures its first step into
            « reuse an authorised connection or create one » */}
        <StudioSourceOnboarding />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <PlainQuestionHeader
        question="Your sources"
        detail="Connections are reusable technical access; objects are what an application actually reads through them."
        backHref={routes.studio}
        backLabel="Studio"
        actions={
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            <Plus aria-hidden className="h-4 w-4" />
            Add a source
          </button>
        }
      />

      <div
        className="flex w-fit rounded-lg border border-slate-200 p-0.5 dark:border-slate-700"
        role="tablist"
        aria-label="Sources views"
      >
        {(
          [
            { id: 'connections', label: 'Connections' },
            { id: 'objects', label: 'Objects in use' },
            { id: 'lake', label: 'Lake map' },
          ] as const
        ).map((v) => (
          <button
            key={v.id}
            id={`sources-tab-${v.id}`}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            aria-controls="sources-panel"
            tabIndex={view === v.id ? 0 : -1}
            onClick={() => {
              setView(v.id);
              trackTabSwitch(`sources_${v.id}`);
            }}
            onKeyDown={(e) => {
              // roving tabs: the arrows move AND activate (two tabs only)
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const next = v.id === 'connections' ? 'objects' : 'connections';
                setView(next);
                trackTabSwitch(`sources_${next}`);
                document.getElementById(`sources-tab-${next}`)?.focus();
              }
            }}
            className={`rounded-md px-3 py-1 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
              view === v.id
                ? 'bg-accent-600 font-medium text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div id="sources-panel" role="tabpanel" aria-labelledby={`sources-tab-${view}`}>
        {view === 'lake' ? (
          <StudioLakeMap />
        ) : view === 'connections' ? (
        <ConnectionsPanel
          initialSelection={initialConnection.current}
          onSelectionChange={onConnectionSel}
          onOpenObjects={() => setView('objects')}
          refreshToken={refreshToken}
        />
      ) : (
        <ObjectsPanel
          initialSelection={initialObject.current}
          onSelectionChange={onObjectSel}
          onAddSource={() => setAdding(true)}
          onOpenConnection={(connectionId) => {
            selRef.current.connection = connectionId;
            initialConnection.current = connectionId;
            setView('connections');
            setRefreshToken((n) => n + 1);
          }}
        />
        )}

        {/* every way of scanning the estate, PRICED — the cost is the
            centre of the understanding work (user directive); reading the
            options is free, launching one is the explicit spend */}
        <div className="mt-3">
          <StudioScanOptionsPanel databases={['DATA360_LITE']} />
        </div>
      </div>
    </div>
  );
}
