'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Badge, Button } from 'rizzui';
import {
  Package, Search, Plus, Loader2, RefreshCw, ShieldCheck, Eye,
  Tag, X, CheckCircle, Database, Layers, Users, Clock, Shield,
  Activity, Target, AlertCircle, Boxes,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { getApiErrorMessage } from '@/lib/api-client';
import {
  listDataProducts,
  createDataProduct,
  subscribeToProduct,
  publishDataProduct,
  type DataProduct,
  type CreateDataProductRequest,
} from '@/app/services/data-products';
import {
  getCatalogScores,
  type CatalogScoresResponse,
} from '@/app/services/catalog';
import Object360Panel from './components/Object360Panel';
import KpiLifecyclePanel from './components/KpiLifecyclePanel';
import PublishGate from './components/PublishGate';
import RecommendationsPanel from './components/RecommendationsPanel';

/** Render a missing/unknown numeric value as an em-dash, never a fake 0. */
function fmtNum(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : String(v);
}

function DataProductsPage() {
  const [products, setProducts] = useState<DataProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [subscribeError, setSubscribeError] = useState<{ id: string; message: string } | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [object360Fqn, setObject360Fqn] = useState<{ fqn: string; title: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [catalogScores, setCatalogScores] = useState<CatalogScoresResponse | null>(null);
  const [scoresError, setScoresError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listDataProducts();
      setProducts(res.data || []);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchScores = useCallback(async () => {
    setScoresError(null);
    try {
      setCatalogScores(await getCatalogScores());
    } catch (err) {
      setScoresError(getApiErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    void fetchProducts();
    void fetchScores();
  }, [fetchProducts, fetchScores]);

  const handleCreate = useCallback(async (body: CreateDataProductRequest): Promise<string | null> => {
    try {
      await createDataProduct(body);
      setShowCreate(false);
      await fetchProducts();
      return null;
    } catch (err) {
      return getApiErrorMessage(err);
    }
  }, [fetchProducts]);

  const handleSubscribe = useCallback(async (productId: string) => {
    setSubscribing(productId);
    setSubscribeError(null);
    try {
      await subscribeToProduct(productId);
      setProducts((prev) => prev.map((p) =>
        p.PRODUCT_ID === productId ? { ...p, CONSUMERS: (p.CONSUMERS ?? 0) + 1 } : p
      ));
    } catch (err) {
      setSubscribeError({ id: productId, message: getApiErrorMessage(err) });
    } finally {
      setSubscribing(null);
    }
  }, []);

  const filtered = useMemo(() => {
    let result = products;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        p.NAME.toLowerCase().includes(q) ||
        p.TABLE_FQN.toLowerCase().includes(q) ||
        (p.DESCRIPTION || '').toLowerCase().includes(q) ||
        (p.TAGS || []).some((t) => t.toLowerCase().includes(q))
      );
    }
    if (filterStatus) {
      result = result.filter((p) => p.STATUS === filterStatus);
    }
    return result;
  }, [products, search, filterStatus]);

  const stats = useMemo(() => {
    const hasProducts = products.length > 0;
    return {
      total: products.length,
      active: products.filter((p) => p.STATUS === 'active' || p.STATUS === 'certified').length,
      consumers: hasProducts ? products.reduce((s, p) => s + (p.CONSUMERS ?? 0), 0) : null,
      avgQuality: hasProducts
        ? Math.round(products.reduce((s, p) => s + (p.QUALITY_THRESHOLD || 0), 0) / products.length)
        : null,
      certified: products.filter((p) => p.STATUS === 'certified').length,
      domains: new Set(products.flatMap((p) => p.TAGS || [])).size,
    };
  }, [products]);

  const sel = products.find((p) => p.PRODUCT_ID === selectedProduct);

  const trustAvg = catalogScores?.averages?.trust_avg;

  const kpis: { label: string; value: string; icon: React.ReactNode; color: string; sub: string }[] = [
    { label: 'Data Products', value: fmtNum(stats.total), icon: <Package className="h-4 w-4" />, color: 'blue', sub: loading ? '—' : `${stats.active} active` },
    { label: 'Certified', value: fmtNum(stats.certified), icon: <ShieldCheck className="h-4 w-4" />, color: 'emerald', sub: 'verified quality' },
    { label: 'Avg Quality', value: stats.avgQuality === null ? '—' : `${stats.avgQuality}%`, icon: <Target className="h-4 w-4" />, color: 'purple', sub: 'threshold score' },
    { label: 'Consumers', value: fmtNum(stats.consumers), icon: <Users className="h-4 w-4" />, color: 'amber', sub: 'total subscribers' },
    { label: 'Domains', value: fmtNum(stats.domains), icon: <Tag className="h-4 w-4" />, color: 'indigo', sub: 'tag categories' },
    {
      label: 'Trust Score',
      value: scoresError ? '—' : trustAvg != null ? `${Math.round(trustAvg)}` : '—',
      icon: <Activity className="h-4 w-4" />, color: 'emerald',
      sub: scoresError ? 'scores unavailable' : 'catalog average',
    },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              <a href="/" className="hover:text-blue-600">Home</a>
              <span className="mx-1">/</span>
              <span className="text-gray-700 dark:text-gray-300">Product Portfolio</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" />
              Product Portfolio
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Manage data products, KPIs, dashboards and consumption
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm" className="gap-1.5"
              onClick={() => { void fetchProducts(); void fetchScores(); }}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            <Button
              size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => setShowCreate((v) => !v)}
              aria-expanded={showCreate}
            >
              <Plus className="h-3.5 w-3.5" />Create Product
            </Button>
          </div>
        </div>

        {/* KPI Stats Row */}
        <div className="grid grid-cols-6 gap-3 mb-4">
          {kpis.map((s) => (
            <div key={s.label} className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="flex items-center gap-1.5 mb-1">
                <span className={cn(`text-${s.color}-500`)}>{s.icon}</span>
                <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">{s.label}</span>
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{loading ? '—' : s.value}</p>
              <p className="text-[10px] text-gray-400">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search products, tables, tags..."
              aria-label="Search products"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            aria-label="Filter by status"
            className="text-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="certified">Certified</option>
            <option value="draft">Draft</option>
          </select>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Product List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {showCreate && (
            <CreateForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
          )}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-3">
                  <div className="h-5 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-4 w-1/2 rounded bg-gray-100 dark:bg-gray-700" />
                  <div className="h-3 w-full rounded bg-gray-100 dark:bg-gray-700" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 p-6 text-center">
              <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">Failed to load data products</h3>
              <p className="text-xs text-red-600 dark:text-red-400 mb-4 break-words">{error}</p>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void fetchProducts()}>
                <RefreshCw className="h-3.5 w-3.5" />Retry
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Package className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                {search || filterStatus ? 'No products match your filters' : 'No data products yet'}
              </h3>
              {!search && !filterStatus && (
                <Button size="sm" className="mt-2 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setShowCreate(true)}>
                  <Plus className="h-3.5 w-3.5" />Create your first product
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map((product) => (
                <ProductCard
                  key={product.PRODUCT_ID}
                  product={product}
                  isSelected={selectedProduct === product.PRODUCT_ID}
                  onSelect={() => setSelectedProduct(selectedProduct === product.PRODUCT_ID ? null : product.PRODUCT_ID)}
                  onSubscribe={() => handleSubscribe(product.PRODUCT_ID)}
                  subscribing={subscribing === product.PRODUCT_ID}
                  subscribeError={subscribeError?.id === product.PRODUCT_ID ? subscribeError.message : null}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Detail Panel — Object-360 takes precedence when open. */}
        {object360Fqn ? (
          <div className="w-[440px] shrink-0 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <Object360Panel
              tableFqn={object360Fqn.fqn}
              title={object360Fqn.title}
              onClose={() => setObject360Fqn(null)}
            />
          </div>
        ) : sel ? (
          <div className="w-[380px] shrink-0 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-y-auto">
            <ProductDetailPanel
              product={sel}
              onClose={() => setSelectedProduct(null)}
              onOpenObject360={() =>
                setObject360Fqn({ fqn: sel.TABLE_FQN, title: sel.NAME })
              }
              onPublished={() => void fetchProducts()}
            />
          </div>
        ) : null}
      </div>

      {/* Cross-module links */}
      <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span>Related:</span>
        <a href="/sources" className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
          <Database className="h-3 w-3" />Source Catalog
        </a>
        <a href="/explore-design" className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
          <Layers className="h-3 w-3" />Explore & Design
        </a>
        <a href="/data-quality" className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
          <Shield className="h-3 w-3" />Data Quality
        </a>
        <a href="/governance" className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" />Governance
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Form (inline) — returns an error string on failure, surfaced inline.
// ---------------------------------------------------------------------------
function CreateForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (d: CreateDataProductRequest) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [tableFqn, setTableFqn] = useState('');
  const [description, setDescription] = useState('');
  const [sla, setSla] = useState(24);
  const [qualityThreshold, setQualityThreshold] = useState(90);
  const [tagsStr, setTagsStr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !tableFqn.trim()) {
      setFormError('Name and Table FQN are required.');
      return;
    }
    setFormError(null);
    setSubmitting(true);
    const err = await onSubmit({
      name: name.trim(),
      table_fqn: tableFqn.trim(),
      description: description.trim() || undefined,
      sla_freshness_hours: sla,
      quality_threshold: qualityThreshold,
      tags: tagsStr ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
    });
    setSubmitting(false);
    if (err) setFormError(err);
  }, [name, tableFqn, description, sla, qualityThreshold, tagsStr, onSubmit]);

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50/30 dark:bg-blue-900/10 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Plus className="h-4 w-4 text-blue-600" />New Data Product
        </h3>
        <button onClick={onCancel} aria-label="Cancel" className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"><X className="h-4 w-4 text-gray-500" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input className="col-span-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Product Name *" aria-label="Product name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="col-span-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="DB.SCHEMA.TABLE *" aria-label="Table FQN" value={tableFqn} onChange={(e) => setTableFqn(e.target.value)} />
        <input className="col-span-2 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Description" aria-label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <input className="col-span-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" type="number" placeholder="SLA hours" aria-label="SLA freshness hours" value={String(sla)} onChange={(e) => setSla(Number(e.target.value))} />
        <input className="col-span-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" type="number" placeholder="Quality %" aria-label="Quality threshold percent" value={String(qualityThreshold)} onChange={(e) => setQualityThreshold(Number(e.target.value))} />
        <input className="col-span-2 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Tags (comma-separated)" aria-label="Tags" value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} />
      </div>
      {formError && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="break-words">{formError}</span>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Create Product
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product Card
// ---------------------------------------------------------------------------
const TAG_COLORS = [
  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
];

function ProductCard({ product, isSelected, onSelect, onSubscribe, subscribing, subscribeError }: {
  product: DataProduct; isSelected: boolean;
  onSelect: () => void; onSubscribe: () => void; subscribing: boolean;
  subscribeError: string | null;
}) {
  const qualityColor = product.QUALITY_THRESHOLD >= 90
    ? 'text-emerald-600 dark:text-emerald-400'
    : product.QUALITY_THRESHOLD >= 70
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-red-600 dark:text-red-400';
  const isCertified = product.STATUS === 'certified' || product.STATUS === 'active';

  return (
    <div
      onClick={onSelect}
      className={cn(
        'rounded-xl border p-5 flex flex-col gap-3 cursor-pointer transition-all',
        isSelected
          ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10 shadow-md ring-1 ring-blue-200 dark:ring-blue-800'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-sm hover:border-gray-300'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{product.NAME}</h3>
            {isCertified && <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{product.OWNER || product.CREATED_BY || '—'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            size="sm"
            className={cn(
              'text-[10px] px-2',
              product.STATUS === 'certified' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : product.STATUS === 'active' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
            )}
          >
            {product.STATUS}
          </Badge>
          <span className={cn('text-xs font-semibold', qualityColor)}>{product.QUALITY_THRESHOLD}%</span>
        </div>
      </div>

      {product.DESCRIPTION && (
        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{product.DESCRIPTION}</p>
      )}

      <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1"><Database className="h-3 w-3" /><span className="font-mono truncate max-w-[180px]">{product.TABLE_FQN}</span></span>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />SLA: {product.SLA_FRESHNESS_HOURS}h</span>
        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{fmtNum(product.CONSUMERS)}</span>
      </div>

      {product.TAGS && product.TAGS.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {product.TAGS.map((tag, i) => (
            <span key={tag} className={cn('inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium', TAG_COLORS[i % TAG_COLORS.length])}>
              <Tag className="h-2.5 w-2.5" />{tag}
            </span>
          ))}
        </div>
      )}

      {subscribeError && (
        <div role="alert" className="flex items-start gap-1.5 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 px-2.5 py-1.5 text-[11px] text-red-700 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="break-words">{subscribeError}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 mt-auto pt-2 border-t border-gray-100 dark:border-gray-700">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 px-2"
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
          <Eye className="h-3 w-3" />Details
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs gap-1 px-2 bg-blue-600 hover:bg-blue-700 text-white"
          disabled={subscribing}
          onClick={(e) => { e.stopPropagation(); onSubscribe(); }}
        >
          {subscribing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
          Subscribe
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product Detail Panel (right rail)
// ---------------------------------------------------------------------------
function ProductDetailPanel({
  product,
  onClose,
  onOpenObject360,
  onPublished,
}: {
  product: DataProduct;
  onClose: () => void;
  onOpenObject360: () => void;
  onPublished: () => void;
}) {
  const qualityColor = product.QUALITY_THRESHOLD >= 90 ? 'emerald' : product.QUALITY_THRESHOLD >= 70 ? 'amber' : 'red';

  const metrics: { label: string; value: string; color: string }[] = [
    { label: 'Quality', value: `${product.QUALITY_THRESHOLD}%`, color: qualityColor },
    { label: 'SLA', value: `${product.SLA_FRESHNESS_HOURS}h`, color: 'blue' },
    { label: 'Consumers', value: fmtNum(product.CONSUMERS), color: 'amber' },
    { label: 'Status', value: product.STATUS, color: product.STATUS === 'certified' ? 'emerald' : 'gray' },
  ];

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">{product.NAME}</h3>
        <button onClick={onClose} aria-label="Close details" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
          <X className="h-4 w-4 text-gray-400" />
        </button>
      </div>

      {product.DESCRIPTION && (
        <p className="text-xs text-gray-600 dark:text-gray-400">{product.DESCRIPTION}</p>
      )}

      {/* Overview Metrics */}
      <div className="grid grid-cols-2 gap-2">
        {metrics.map((m) => (
          <div key={m.label} className={cn('p-3 rounded-lg border', `border-${m.color}-100 dark:border-${m.color}-800 bg-${m.color}-50/50 dark:bg-${m.color}-900/10`)}>
            <p className="text-[10px] text-gray-500">{m.label}</p>
            <p className={cn('text-sm font-bold', `text-${m.color}-600 dark:text-${m.color}-400`)}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Details */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300">Details</h4>
        <div className="space-y-1.5">
          {[
            { label: 'Table FQN', value: product.TABLE_FQN || '—' },
            { label: 'Owner', value: product.OWNER || product.CREATED_BY || '—' },
            { label: 'Created', value: product.CREATED_AT ? new Date(product.CREATED_AT).toLocaleDateString() : '—' },
          ].map((d) => (
            <div key={d.label} className="flex items-center justify-between text-xs">
              <span className="text-gray-500">{d.label}</span>
              <span className="text-gray-900 dark:text-white font-medium font-mono text-[11px] truncate max-w-[200px]">{d.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tags */}
      {product.TAGS && product.TAGS.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Tags</h4>
          <div className="flex flex-wrap gap-1">
            {product.TAGS.map((tag, i) => (
              <span key={tag} className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', TAG_COLORS[i % TAG_COLORS.length])}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Object-360 + Explore the backing table */}
      <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
        <button
          type="button"
          onClick={onOpenObject360}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-2"
        >
          <Boxes className="h-3 w-3" />Object 360
        </button>
        <a
          href="/explore-design"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-medium px-3 py-2"
        >
          <Layers className="h-3 w-3" />Explore
        </a>
      </div>

      {/* Publish gate (quality / governance / lineage thresholds) */}
      <PublishGate
        productId={product.PRODUCT_ID}
        tableFqn={product.TABLE_FQN}
        status={product.STATUS}
        onPublished={onPublished}
      />

      {/* KPI lifecycle */}
      <KpiLifecyclePanel productId={product.PRODUCT_ID} />

      {/* Recommendations (apply → surfaces suggested follow-up call) */}
      <RecommendationsPanel productId={product.PRODUCT_ID} />
    </div>
  );
}

export default function DataProductsPageWrapper() {
  return (
    <ErrorBoundary>
      <DataProductsPage />
    </ErrorBoundary>
  );
}
