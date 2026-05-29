'use client';

import { useState } from 'react';
import { Button, Input, Loader, Badge } from 'rizzui';
import toast from 'react-hot-toast';
import {
  PiTreeStructureDuotone,
  PiMagnifyingGlass,
  PiArrowUp,
  PiArrowDown,
  PiArrowsLeftRight,
} from 'react-icons/pi';
import { getObjectDependencies, getDependencyGraph } from '@/app/services/observability';

export default function DependenciesCard() {
  const [objectName, setObjectName] = useState('');
  const [objectDomain, setObjectDomain] = useState('');
  const [direction, setDirection] = useState<'upstream' | 'downstream'>('downstream');
  const [days, setDays] = useState('30');
  const [dependencies, setDependencies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Graph view
  const [graphDb, setGraphDb] = useState('');
  const [graphSchema, setGraphSchema] = useState('');
  const [graph, setGraph] = useState<any>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  const [activeView, setActiveView] = useState<'search' | 'graph'>('search');

  const handleSearch = async () => {
    if (!objectName) { toast.error('Enter an object name'); return; }
    setLoading(true);
    try {
      const result = await getObjectDependencies({
        object_name: objectName,
        object_domain: objectDomain || undefined,
        direction,
        days: parseInt(days) || 30,
      });
      const deps = result.dependencies ?? result.data ?? result;
      setDependencies(Array.isArray(deps) ? deps : []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load dependencies');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadGraph = async () => {
    if (!graphDb) { toast.error('Enter a database name'); return; }
    setGraphLoading(true);
    try {
      const result = await getDependencyGraph({
        database: graphDb,
        schema: graphSchema || undefined,
      });
      setGraph(result.data || result);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load dependency graph');
    } finally {
      setGraphLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* View Toggle */}
      <div className="flex gap-2">
        <Button
          variant={activeView === 'search' ? 'solid' : 'outline'}
          onClick={() => setActiveView('search')}
          className={activeView === 'search' ? 'bg-indigo-600 text-white' : ''}
        >
          <PiMagnifyingGlass className="w-4 h-4 mr-2" />
          Object Search
        </Button>
        <Button
          variant={activeView === 'graph' ? 'solid' : 'outline'}
          onClick={() => setActiveView('graph')}
          className={activeView === 'graph' ? 'bg-indigo-600 text-white' : ''}
        >
          <PiTreeStructureDuotone className="w-4 h-4 mr-2" />
          Schema Graph
        </Button>
      </div>

      {activeView === 'search' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Object Dependency Search</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <Input
                label="Object Name"
                placeholder="DB.SCHEMA.TABLE"
                value={objectName}
                onChange={(e) => setObjectName(e.target.value)}
              />
              <Input
                label="Object Domain (optional)"
                placeholder="TABLE, VIEW, FUNCTION..."
                value={objectDomain}
                onChange={(e) => setObjectDomain(e.target.value)}
              />
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Direction</label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={direction === 'upstream' ? 'solid' : 'outline'}
                    onClick={() => setDirection('upstream')}
                    className={`gap-1 flex-1 ${direction === 'upstream' ? 'bg-blue-600 text-white' : ''}`}
                  >
                    <PiArrowUp className="w-3.5 h-3.5" /> Upstream
                  </Button>
                  <Button
                    size="sm"
                    variant={direction === 'downstream' ? 'solid' : 'outline'}
                    onClick={() => setDirection('downstream')}
                    className={`gap-1 flex-1 ${direction === 'downstream' ? 'bg-blue-600 text-white' : ''}`}
                  >
                    <PiArrowDown className="w-3.5 h-3.5" /> Downstream
                  </Button>
                </div>
              </div>
              <Input
                label="Days"
                type="number"
                placeholder="30"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </div>
            <Button onClick={handleSearch} disabled={loading} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700">
              {loading ? <Loader variant="spinner" size="sm" /> : <PiMagnifyingGlass className="w-4 h-4" />}
              Search Dependencies
            </Button>
          </div>

          {dependencies.length > 0 && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
              <h4 className="font-semibold text-slate-900 dark:text-white mb-3">
                {dependencies.length} Dependencies Found
                <Badge className="ml-2 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400">
                  {direction}
                </Badge>
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left py-2 px-3 font-medium text-slate-600 dark:text-slate-400">Object</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-600 dark:text-slate-400">Domain</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-600 dark:text-slate-400">Referenced By</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-600 dark:text-slate-400">Ref Domain</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dependencies.map((dep: any, i: number) => (
                      <tr key={i} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="py-2 px-3 text-slate-900 dark:text-white font-mono text-xs">
                          {dep.referencing_object_name || dep.REFERENCING_OBJECT_NAME || '-'}
                        </td>
                        <td className="py-2 px-3">
                          <Badge size="sm" className="bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                            {dep.referencing_object_domain || dep.REFERENCING_OBJECT_DOMAIN || '-'}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400 font-mono text-xs">
                          {dep.referenced_object_name || dep.REFERENCED_OBJECT_NAME || '-'}
                        </td>
                        <td className="py-2 px-3">
                          <Badge size="sm" className="bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                            {dep.referenced_object_domain || dep.REFERENCED_OBJECT_DOMAIN || '-'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeView === 'graph' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Schema Dependency Graph</h3>
            <div className="flex gap-3 mb-4">
              <Input
                label="Database"
                placeholder="MY_DATABASE"
                value={graphDb}
                onChange={(e) => setGraphDb(e.target.value)}
                className="flex-1"
              />
              <Input
                label="Schema (optional)"
                placeholder="PUBLIC"
                value={graphSchema}
                onChange={(e) => setGraphSchema(e.target.value)}
                className="flex-1"
              />
            </div>
            <Button onClick={handleLoadGraph} disabled={graphLoading} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700">
              {graphLoading ? <Loader variant="spinner" size="sm" /> : <PiTreeStructureDuotone className="w-4 h-4" />}
              Load Graph
            </Button>
          </div>

          {graph && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
              <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Dependency Graph</h4>
              <pre className="text-sm bg-slate-50 dark:bg-slate-900 p-4 rounded-lg overflow-auto max-h-96 text-slate-700 dark:text-slate-300">
                {JSON.stringify(graph, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
