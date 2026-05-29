'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Badge, Button, Input, Loader } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  Package, Search, Plus, Loader2, RefreshCw, ShieldCheck, Eye,
  Star, Tag, X, CheckCircle, Database, Layers, BarChart3, TrendingUp,
  ArrowRight, GitBranch, Brain, Zap, Users, Clock, Shield, Activity,
  ChevronRight, Target, FolderOpen, Settings, Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { getApiErrorMessage } from '@/lib/api-client';
import {
  listDataProducts,
  createDataProduct,
  subscribeToProduct,
  type DataProduct,
  type CreateDataProductRequest,
} from '@/app/services/data-products';
import {
  getCatalogOverview,
  getCatalogScores,
  getCatalogProducts,
  type CatalogOverviewResponse,
  type CatalogScoresResponse,
} from '@/app/services/catalog';

type ViewMode = 'portfolio' | 'grid';

function DataProductsPage() {
  const [products, setProducts] = useState<DataProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('portfolio');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [catalogScores, setCatalogScores] = useState<CatalogScoresResponse | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listDataProducts();
      setProducts(res.data || []);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    getCatalogScores().then(setCatalogScores).catch(() => {});
  }, [fetchProducts]);

  const handleCreate = useCallback(async (body: CreateDataProductRequest) => {
    try {
      await createDataProduct(body);
      toast.success(`Product "${body.name}" created`);
      setShowCreate(false);
      await fetchProducts();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  }, [fetchProducts]);

  const handleSubscribe = useCallback(async (productId: string) => {
    setSubscribing(productId);
    try {
      const res = await subscribeToProduct(productId);
      toast.success(res.message || 'Subscribed');
      setProducts((prev) => prev.map((p) => p.PRODUCT_ID === productId ? { ...p, CONSUMERS: (p.CONSUMERS ?? 0) + 1 } : p));
    } catch (err) {
      toast.error(getApiErrorMessage(err));
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

  const stats = useMemo(() => ({
    total: products.length,
    active: products.filter((p) => p.STATUS === 'active' || p.STATUS === 'certified').length,
    consumers: products.reduce((s, p) => s + (p.CONSUMERS ?? 0), 0),
    avgQuality: products.length ? Math.round(products.reduce((s, p) => s + (p.QUALITY_THRESHOLD || 0), 0) / products.length) : 0,
    certified: products.filter((p) => p.STATUS === 'certified').length,
    domains: new Set(products.flatMap((p) => p.TAGS || [])).size,
  }), [products]);

  const sel = products.find((p) => p.PRODUCT_ID === selectedProduct);

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
            <Button variant="outline" size="sm" className="gap-1.5" onClick={fetchProducts} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setShowCreate(!showCreate)}>
              <Plus className="h-3.5 w-3.5" />Create Product
            </Button>
          </div>
        </div>

        {/* KPI Stats Row */}
        <div className="grid grid-cols-6 gap-3 mb-4">
          {[
            { label: 'Data Products', value: stats.total, icon: <Package className="h-4 w-4" />, color: 'blue', sub: `${stats.active} active` },
            { label: 'Certified', value: stats.certified, icon: <ShieldCheck className="h-4 w-4" />, color: 'emerald', sub: 'verified quality' },
            { label: 'Avg Quality', value: `${stats.avgQuality}%`, icon: <Target className="h-4 w-4" />, color: 'purple', sub: 'threshold score' },
            { label: 'Consumers', value: stats.consumers, icon: <Users className="h-4 w-4" />, color: 'amber', sub: 'total subscribers' },
            { label: 'Domains', value: stats.domains, icon: <Tag className="h-4 w-4" />, color: 'indigo', sub: 'tag categories' },
            { label: 'Trust Score', value: catalogScores?.averages?.trust_avg != null ? `${Math.round(catalogScores.averages.trust_avg)}` : '—', icon: <Activity className="h-4 w-4" />, color: 'emerald', sub: 'catalog average' },
          ].map((s) => (
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
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
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Package className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                {search ? 'No products match your search' : 'No data products yet'}
              </h3>
              {!search && (
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
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Detail Panel */}
        {sel && (
          <div className="w-[380px] shrink-0 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-y-auto">
            <ProductDetailPanel product={sel} onClose={() => setSelectedProduct(null)} />
          </div>
        )}
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
// Create Form
// ---------------------------------------------------------------------------
function CreateForm({ onSubmit, onCancel }: { onSubmit: (d: CreateDataProductRequest) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [tableFqn, setTableFqn] = useState('');
  const [description, setDescription] = useState('');
  const [sla, setSla] = useState(24);
  const [qualityThreshold, setQualityThreshold] = useState(90);
  const [tagsStr, setTagsStr] = useState('');

  const handleSubmit = () => {
    if (!name.trim() || !tableFqn.trim()) { toast.error('Name and Table FQN are required'); return; }
    onSubmit({
      name: name.trim(),
      table_fqn: tableFqn.trim(),
      description: description.trim() || undefined,
      sla_freshness_hours: sla,
      quality_threshold: qualityThreshold,
      tags: tagsStr ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
    });
  };

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50/30 dark:bg-blue-900/10 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Plus className="h-4 w-4 text-blue-600" />New Data Product
        </h3>
        <button onClick={onCancel} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"><X className="h-4 w-4 text-gray-500" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input size="sm" placeholder="Product Name *" value={name} onChange={(e) => setName(e.target.value)} />
        <Input size="sm" placeholder="DB.SCHEMA.TABLE *" value={tableFqn} onChange={(e) => setTableFqn(e.target.value)} />
        <Input size="sm" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} className="col-span-2" />
        <Input size="sm" type="number" placeholder="SLA hours" value={String(sla)} onChange={(e) => setSla(Number(e.target.value))} />
        <Input size="sm" type="number" placeholder="Quality %" value={String(qualityThreshold)} onChange={(e) => setQualityThreshold(Number(e.target.value))} />
        <Input size="sm" placeholder="Tags (comma-separated)" value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} className="col-span-2" />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSubmit}>Create Product</Button>
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

function ProductCard({ product, isSelected, onSelect, onSubscribe, subscribing }: {
  product: DataProduct; isSelected: boolean;
  onSelect: () => void; onSubscribe: () => void; subscribing: boolean;
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
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{product.OWNER || product.CREATED_BY}</p>
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
        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{product.CONSUMERS ?? 0}</span>
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
// Product Detail Panel
// ---------------------------------------------------------------------------
function ProductDetailPanel({ product, onClose }: { product: DataProduct; onClose: () => void }) {
  const qualityColor = product.QUALITY_THRESHOLD >= 90 ? 'emerald' : product.QUALITY_THRESHOLD >= 70 ? 'amber' : 'red';

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">{product.NAME}</h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
          <X className="h-4 w-4 text-gray-400" />
        </button>
      </div>

      {product.DESCRIPTION && (
        <p className="text-xs text-gray-600 dark:text-gray-400">{product.DESCRIPTION}</p>
      )}

      {/* Overview Metrics */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Quality', value: `${product.QUALITY_THRESHOLD}%`, color: qualityColor },
          { label: 'SLA', value: `${product.SLA_FRESHNESS_HOURS}h`, color: 'blue' },
          { label: 'Consumers', value: product.CONSUMERS ?? 0, color: 'amber' },
          { label: 'Status', value: product.STATUS, color: product.STATUS === 'certified' ? 'emerald' : 'gray' },
        ].map((m) => (
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
            { label: 'Table FQN', value: product.TABLE_FQN },
            { label: 'Owner', value: product.OWNER || product.CREATED_BY },
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

      {/* Lineage Placeholder */}
      <div>
        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Lineage</h4>
        <div className="p-4 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 text-center">
          <GitBranch className="h-6 w-6 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-[10px] text-gray-400">Source → Model → Product lineage</p>
          <p className="text-[10px] text-gray-400">Available after modeling</p>
        </div>
      </div>

      {/* Recommended Actions */}
      <div>
        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Recommended Actions</h4>
        <div className="space-y-1.5">
          {[
            { icon: <Shield className="h-3 w-3 text-emerald-500" />, text: 'Apply governance policies', severity: 'medium' },
            { icon: <BarChart3 className="h-3 w-3 text-blue-500" />, text: 'Generate KPI metrics', severity: 'low' },
            { icon: <Brain className="h-3 w-3 text-purple-500" />, text: 'Enrich with AI descriptions', severity: 'low' },
            { icon: <Zap className="h-3 w-3 text-amber-500" />, text: 'Optimize refresh schedule', severity: 'low' },
          ].map((a, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors">
              {a.icon}
              <span className="text-xs text-gray-700 dark:text-gray-300 flex-1">{a.text}</span>
              <Badge size="sm" className={cn(
                'text-[9px]',
                a.severity === 'high' ? 'bg-red-100 text-red-700' :
                  a.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-600'
              )}>
                {a.severity}
              </Badge>
              <ChevronRight className="h-3 w-3 text-gray-300" />
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
        <Button size="sm" variant="outline" className="flex-1 gap-1.5">
          <Settings className="h-3 w-3" />Configure
        </Button>
        <Button size="sm" className="flex-1 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
          <ArrowRight className="h-3 w-3" />Open in Modeling
        </Button>
      </div>
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
