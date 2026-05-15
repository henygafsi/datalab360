'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Badge, Button, Input } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  Package, Search, Plus, Loader2, RefreshCw, ShieldCheck, Eye,
  Star, Tag, X, CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/layout/PageHeader';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { getApiErrorMessage } from '@/lib/api-client';
import {
  listDataProducts,
  createDataProduct,
  subscribeToProduct,
  type DataProduct,
  type CreateDataProductRequest,
} from '@/app/services/data-products';

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-3">
      <div className="h-5 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-4 w-1/2 rounded bg-gray-100 dark:bg-gray-700" />
      <div className="h-3 w-full rounded bg-gray-100 dark:bg-gray-700" />
      <div className="flex gap-2 mt-2">
        <div className="h-6 w-16 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="h-6 w-16 rounded-full bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Form (inline)
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
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">New Data Product</h3>
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

function ProductCard({ product, onSubscribe, subscribing }: { product: DataProduct; onSubscribe: (id: string) => void; subscribing: string | null }) {
  const qualityColor = product.QUALITY_THRESHOLD >= 90 ? 'text-emerald-600 dark:text-emerald-400' : product.QUALITY_THRESHOLD >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
  const isCertified = product.STATUS === 'certified' || product.STATUS === 'active';

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{product.NAME}</h3>
            {isCertified && (
              <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" aria-label="Certified" />
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{product.OWNER || product.CREATED_BY}</p>
        </div>
        <Badge size="sm" className={cn('text-[10px] font-semibold', qualityColor, 'bg-transparent')}>
          {product.QUALITY_THRESHOLD}% quality
        </Badge>
      </div>

      {product.DESCRIPTION && (
        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{product.DESCRIPTION}</p>
      )}

      <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
        <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 font-mono truncate max-w-[200px]">{product.TABLE_FQN}</span>
        <span>SLA: {product.SLA_FRESHNESS_HOURS}h</span>
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

      <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100 dark:border-gray-700">
        <span className="text-[11px] text-gray-400 dark:text-gray-500">{product.CONSUMERS ?? 0} subscribers</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 px-2">
            <Eye className="h-3 w-3" />Preview
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs gap-1 px-2 bg-blue-600 hover:bg-blue-700 text-white"
            disabled={subscribing === product.PRODUCT_ID}
            onClick={() => onSubscribe(product.PRODUCT_ID)}
          >
            {subscribing === product.PRODUCT_ID ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
            Subscribe
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
function DataProductsPage() {
  const [products, setProducts] = useState<DataProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [subscribing, setSubscribing] = useState<string | null>(null);

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

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

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
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter((p) =>
      p.NAME.toLowerCase().includes(q) ||
      p.TABLE_FQN.toLowerCase().includes(q) ||
      (p.DESCRIPTION || '').toLowerCase().includes(q) ||
      (p.TAGS || []).some((t) => t.toLowerCase().includes(q))
    );
  }, [products, search]);

  const stats = useMemo(() => ({
    total: products.length,
    subscribed: products.filter((p) => (p.CONSUMERS ?? 0) > 0).length,
    certified: products.filter((p) => p.STATUS === 'certified' || p.STATUS === 'active').length,
    avgQuality: products.length ? Math.round(products.reduce((s, p) => s + (p.QUALITY_THRESHOLD || 0), 0) / products.length) : 0,
  }), [products]);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="text-xs text-slate-500 dark:text-slate-400">
        <a href="/" className="hover:text-blue-600">Home</a> / <span className="text-slate-700 dark:text-slate-300">Data Products</span>
      </div>

      <PageHeader
        icon={<Package className="h-6 w-6" />}
        title="Data Products"
        subtitle="Marketplace"
        color="blue"
        badges={
          <div className="flex items-center gap-2">
            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 px-3 py-1 text-sm font-medium">{stats.total} Products</Badge>
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 px-3 py-1 text-sm font-medium">{stats.subscribed} Subscribed</Badge>
            <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400 px-3 py-1 text-sm font-medium">{stats.certified} Certified</Badge>
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 px-3 py-1 text-sm font-medium">{stats.avgQuality}% Avg Quality</Badge>
          </div>
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={fetchProducts} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Refresh
            </Button>
            <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setShowCreate(!showCreate)}>
              <Plus className="h-4 w-4" />Create Product
            </Button>
          </div>
        }
      />

      {showCreate && <CreateForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />}

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input size="sm" placeholder="Search products, tables, tags..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">{search ? 'No products match your search' : 'No data products yet'}</p>
            {!search && (
              <Button size="sm" className="mt-3 gap-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setShowCreate(true)}>
                <Plus className="h-3.5 w-3.5" />Create your first product
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((product) => (
              <ProductCard key={product.PRODUCT_ID} product={product} onSubscribe={handleSubscribe} subscribing={subscribing} />
            ))}
          </div>
        )}
      </div>

      {/* Cross-module links */}
      <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span>Related:</span>
        <a href="/explore-design" className="text-blue-600 dark:text-blue-400 hover:underline">Explore & Design (Source Tables)</a>
        <a href="/data-quality" className="text-blue-600 dark:text-blue-400 hover:underline">Data Quality (SLA Monitoring)</a>
        <a href="/governance" className="text-blue-600 dark:text-blue-400 hover:underline">Governance (Access Policies)</a>
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
