'use client';

import { useState, useEffect } from 'react';
import { Button, Card, Badge, Input } from 'rizzui';
import { HiOutlineCog6Tooth, HiOutlineArrowPath, HiOutlineTableCells } from 'react-icons/hi2';
import toast from 'react-hot-toast';
import { routes } from '@/config/routes';
import {
  getData360Config,
  getTableRefreshMapping,
  triggerRefresh,
  getCacheConfig,
  patchCacheConfig,
  type Data360ConfigResponse,
  type TableRefreshMappingItem,
} from '@/app/services/data360-config';

function Breadcrumb() {
  return (
    <nav className="mb-6">
      <div className="flex items-center gap-2 text-sm">
        <a href={routes.home} className="text-muted hover:text-primary font-medium">Home</a>
        <span className="text-muted">/</span>
        <span className="font-semibold text-gray-900 dark:text-gray-100">Config Data360</span>
      </div>
    </nav>
  );
}

export default function Data360ConfigPage() {
  const [config, setConfig] = useState<Data360ConfigResponse | null>(null);
  const [tables, setTables] = useState<TableRefreshMappingItem[]>([]);
  const [cacheConfig, setCacheConfig] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [discoverAll, setDiscoverAll] = useState(false);

  const loadConfig = async () => {
    try {
      const c = await getData360Config();
      setConfig(c);
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Erreur chargement config');
    }
  };

  const loadMapping = async () => {
    try {
      const res = await getTableRefreshMapping({ discover: true, discover_all: discoverAll });
      setTables(res.tables || []);
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Erreur chargement mapping');
    }
  };

  const loadCacheConfig = async () => {
    try {
      const c = await getCacheConfig();
      setCacheConfig(c || {});
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Erreur chargement cache');
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([loadConfig(), loadMapping(), loadCacheConfig()]);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [discoverAll]);

  const onRefreshZone = async (zone: string) => {
    setRefreshing(zone);
    try {
      await triggerRefresh({ zone });
      toast.success(`Refresh ${zone} effectué`);
      await loadMapping();
      await loadConfig();
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Erreur refresh');
    } finally {
      setRefreshing(null);
    }
  };

  const onRefreshTable = async (table: string) => {
    setRefreshing(table);
    try {
      await triggerRefresh({ table });
      toast.success(`Refresh table ${table} effectué`);
      await loadMapping();
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Erreur refresh');
    } finally {
      setRefreshing(null);
    }
  };

  if (loading && !config) {
    return (
      <div className="p-6">
        <Breadcrumb />
        <p className="text-muted">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <Breadcrumb />
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HiOutlineCog6Tooth className="w-7 h-7" />
          Config Data360 & Cache
        </h1>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setLoading(true);
            Promise.all([loadConfig(), loadMapping(), loadCacheConfig()]).finally(() => setLoading(false));
          }}
        >
          <HiOutlineArrowPath className="w-4 h-4 mr-1" />
          Recharger
        </Button>
      </div>

      {/* Config metadata */}
      {config && (
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-3">Configuration metadata</h2>
          <ul className="space-y-1 text-sm">
            <li><strong>Base metadata :</strong> {config.metadata_database}</li>
            <li><strong>Schémas :</strong> {config.metadata_schemas?.map((s) => s.name).join(', ')}</li>
            <li><strong>Zones cache :</strong> {config.zones?.join(', ')}</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            {config.zones?.map((zone) => (
              <Button
                key={zone}
                size="sm"
                variant="flat"
                onClick={() => onRefreshZone(zone)}
                disabled={refreshing !== null}
              >
                {refreshing === zone ? '…' : `Refresh ${zone}`}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {/* Table refresh mapping */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <HiOutlineTableCells className="w-5 h-5" />
            Tables & colonnes date (last refresh)
          </h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={discoverAll}
              onChange={(e) => setDiscoverAll(e.target.checked)}
            />
            Découvrir toutes les tables metadata
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Table</th>
                <th className="text-left py-2">Colonnes date</th>
                <th className="text-left py-2">Dernier refresh table</th>
                <th className="text-left py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {tables.map((row) => (
                <tr key={row.table} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 font-mono text-xs">{row.table}</td>
                  <td className="py-2">
                    {row.date_columns?.length
                      ? row.date_columns.map((c) => (
                          <span key={c.name} className="mr-2">
                            <Badge size="sm">{c.name}</Badge>
                            {c.last_refresh ? (
                              <span className="text-muted text-xs ml-1">{new Date(c.last_refresh).toLocaleString()}</span>
                            ) : null}
                          </span>
                        ))
                      : '—'}
                  </td>
                  <td className="py-2 text-muted text-xs">
                    {row.table_last_refresh ? new Date(row.table_last_refresh).toLocaleString() : '—'}
                  </td>
                  <td className="py-2">
                    <Button
                      size="sm"
                      variant="text"
                      onClick={() => onRefreshTable(row.table)}
                      disabled={refreshing !== null}
                    >
                      {refreshing === row.table ? '…' : 'Refresh'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {tables.length === 0 && !loading && (
          <p className="text-muted text-sm mt-2">Aucune table (ou pas de session Snowflake pour la découverte).</p>
        )}
      </Card>

      {/* Cache config (TTL) */}
      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-3">Config cache (TTL secondes)</h2>
        <p className="text-sm text-muted mb-3">
          Valeurs par défaut et overrides. Modifier via l’API PATCH /api/data360/cache-config si besoin.
        </p>
        <div className="flex flex-wrap gap-4">
          {cacheConfig && Object.entries(cacheConfig).slice(0, 12).map(([key, val]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="font-mono text-sm">{key}</span>
              <Badge>{val}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
