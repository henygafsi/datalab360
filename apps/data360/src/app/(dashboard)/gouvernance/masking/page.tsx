'use client';

import React, { useEffect, useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { applyMaskingPolicy, createMaskingPolicy, listMaskedColumns, listMaskingPolicies, removeMaskingPolicy } from '@/app/services/gouvernance/masking';
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTablesTarget } from '@/app/services/mapping/getTablesTarget';
import { getTableColumns } from '@/app/services/mapping/fetch_tables';
import { Badge } from 'rizzui';
import { HiOutlineShieldCheck } from 'react-icons/hi2';
import MaskingAdvancedTable from '@/app/shared/gouvernance/masking/table-advanced';
import CreatePolicyButton from '@/app/shared/gouvernance/masking/create-policy-button';
import ApplyPolicyButton from '@/app/shared/gouvernance/masking/apply-policy-button';

// Align with other Governance pages
const ModernCard = ({ children, className = '', ...props }: { children: React.ReactNode; className?: string }) => {
    return (
        <div className={`bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-lg shadow-slate-200/20 dark:shadow-slate-900/20 ${className}`} {...props}>
            {children}
        </div>
    );
};

const MaskingPolicyPage: React.FC = () => {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [policies, setPolicies] = useState<any[]>([]);
    const [masked, setMasked] = useState<any[]>([]);
    const [showCreate, setShowCreate] = useState(false);
    const [showApply, setShowApply] = useState(false);

    const [formCreate, setFormCreate] = useState({
        policy_name: '',
        data_type: 'STRING',
        return_type: 'STRING',
        role_name: '',
        replace_with: '*******',
    });

    const [formApply, setFormApply] = useState({
        database: '', schema: '', table: '', column: '', policy_name: ''
    });

    const [scope, setScope] = useState({ database: '', schema: '' });

    const [databases, setDatabases] = useState<string[]>([]);
    const [schemas, setSchemas] = useState<string[]>([]);
    const [tables, setTables] = useState<string[]>([]);
    const [columns, setColumns] = useState<string[]>([]);

    const refreshPolicies = async () => {
        try {
            const res = await listMaskingPolicies();
            setPolicies(Array.isArray(res) ? res : []);
        } catch (e: any) {
            toast({ title: 'Error', description: e.message || 'Failed to list policies', variant: 'destructive' });
        }
    };

    const refreshMasked = async () => {
        if (!scope.database || !scope.schema) return;
        try {
            const res = await listMaskedColumns({ database: scope.database, schema: scope.schema });
            setMasked(Array.isArray(res) ? res : []);
        } catch (e: any) {
            toast({ title: 'Error', description: e.message || 'Failed to list masked columns', variant: 'destructive' });
        }
    };

    useEffect(() => { refreshPolicies(); }, []);
    useEffect(() => { refreshMasked(); }, [scope.database, scope.schema]);

    // Load databases on mount
    useEffect(() => {
        const loadDatabases = async () => {
            try {
                const dbs = await getDatabases();
                setDatabases(dbs || []);
            } catch (e) { /* ignore */ }
        };
        loadDatabases();
    }, []);

    // Load schemas when database changes (for both scope and apply form)
    useEffect(() => {
        const loadSchemas = async () => {
            if (!formApply.database) { setSchemas([]); return; }
            try {
                const scs = await getSchemas(formApply.database);
                setSchemas(scs || []);
            } catch (e) { setSchemas([]); }
        };
        loadSchemas();
    }, [formApply.database]);

    // Load tables when schema changes
    useEffect(() => {
        const loadTables = async () => {
            if (!formApply.database || !formApply.schema) { setTables([]); return; }
            try {
                const tbs = await getTablesTarget(formApply.database, formApply.schema);
                setTables(tbs || []);
            } catch (e) { setTables([]); }
        };
        loadTables();
    }, [formApply.database, formApply.schema]);

    // Load columns when table changes
    useEffect(() => {
        const loadColumns = async () => {
            if (!formApply.database || !formApply.schema || !formApply.table) { setColumns([]); return; }
            try {
                const cols = await getTableColumns(formApply.database, formApply.schema, formApply.table);
                const names = (cols || []).map((c: any) => c.name || c.COLUMN_NAME);
                setColumns(names);
            } catch (e) { setColumns([]); }
        };
        loadColumns();
    }, [formApply.database, formApply.schema, formApply.table]);

    const handleCreate = async () => {
        setLoading(true);
        try {
            await createMaskingPolicy(formCreate);
            toast({ title: 'Policy Created', description: formCreate.policy_name, variant: 'success' });
            await refreshPolicies();
        } catch (e: any) {
            toast({ title: 'Error', description: e.response?.data?.detail || e.message || 'Failed to create policy', variant: 'destructive' });
        } finally { setLoading(false); }
    };

    const handleApply = async () => {
        if (!formApply.database || !formApply.schema || !formApply.table || !formApply.column || !formApply.policy_name) {
            toast({ title: 'Missing fields', description: 'Please fill database, schema, table, column and policy', variant: 'destructive' });
            return;
        }
        setLoading(true);
        try {
            await applyMaskingPolicy(formApply);
            toast({ title: 'Policy Applied', description: `${formApply.policy_name} on ${formApply.table}.${formApply.column}`, variant: 'success' });
            await refreshMasked();
        } catch (e: any) {
            toast({ title: 'Error', description: e.response?.data?.detail || e.message || 'Failed to apply policy', variant: 'destructive' });
        } finally { setLoading(false); }
    };

    const handleRemove = async (row: any) => {
        setLoading(true);
        try {
            await removeMaskingPolicy({ database: row.database, schema: row.schema, table: row.table, column: row.column });
            toast({ title: 'Policy Removed', description: `${row.table}.${row.column}`, variant: 'success' });
            await refreshMasked();
        } catch (e: any) {
            toast({ title: 'Error', description: e.response?.data?.detail || e.message || 'Failed to remove policy', variant: 'destructive' });
        } finally { setLoading(false); }
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-500/25">
                        <HiOutlineShieldCheck className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">Masking Policies</h1>
                        <p className="text-slate-600 dark:text-slate-400 text-lg">Create, apply and manage data masking policies</p>
                    </div>
                </div>
                <div className="flex items-center space-x-3">
                    <ApplyPolicyButton onApplied={refreshMasked} />
                    <CreatePolicyButton onCreated={refreshPolicies} />
                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 px-3 py-1 text-sm font-medium">Secure Data</Badge>
                </div>
            </div>

            <ModernCard className="p-8 space-y-6">
            {/* Policies Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Policies</CardTitle>
                </CardHeader>
                <CardContent>
                    <MaskingAdvancedTable />
                </CardContent>
            </Card>


            </ModernCard>

            {/* Modals provided by global modal system via buttons */}
        </div>
    );
};

export default MaskingPolicyPage;


