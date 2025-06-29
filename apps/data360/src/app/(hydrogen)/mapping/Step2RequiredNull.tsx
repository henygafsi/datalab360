// components/mapping-wizard/Step2RequiredNull.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { getAuthToken } from '@/lib/auth';
import { getTableColumns } from '@/app/services/mapping/fetch_tables';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

interface Constraint {
    table_name: string;
    column_name: string;
    constraint_type: string;
}

interface Column {
    name: string;
    data_type: string;
    is_nullable: boolean;
    is_primary_key: boolean;
    is_foreign_key: boolean;
}

interface Step2Props {
    onNext: () => void;
    onBack: () => void;
    mappingData: any;
    updateMappingData: (newData: any) => void;
    selectedSourceTable: { database: string; schema: string; table: string } | null;
    selectedTargetTable: { database: string; schema: string; table: string } | null;
}

const Step2RequiredNull: React.FC<Step2Props> = ({ onNext, onBack, mappingData, updateMappingData, selectedSourceTable, selectedTargetTable }) => {
    const [sourceColumns, setSourceColumns] = useState<Column[]>([]);
    const [targetColumns, setTargetColumns] = useState<Column[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        const fetchColumns = async () => {
            if (!selectedSourceTable || !selectedTargetTable) {
                toast({
                    title: 'Error',
                    description: 'Source or target table not selected in the previous step.',
                    variant: 'destructive',
                });
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                // Fetch source and target columns using our service
                const [sourceColumns, targetColumns] = await Promise.all([
                    getTableColumns(
                        selectedSourceTable.database,
                        selectedSourceTable.schema,
                        selectedSourceTable.table
                    ),
                    getTableColumns(
                        selectedTargetTable.database,
                        selectedTargetTable.schema,
                        selectedTargetTable.table
                    ),
                ]);

                // Initialize column attributes from fetched data
                const initialSourceColumns = sourceColumns.map((col: any) => ({
                    name: col.name || col.COLUMN_NAME,
                    data_type: col.type || col.DATA_TYPE,
                    is_nullable: col.is_nullable || col.IS_NULLABLE === 'YES',
                    is_primary_key: col.is_primary_key || col.CONSTRAINT_TYPE === 'PRIMARY KEY',
                    is_foreign_key: col.is_foreign_key || col.CONSTRAINT_TYPE === 'FOREIGN KEY',
                }));

                const initialTargetColumns = targetColumns.map((col: any) => ({
                    name: col.name || col.COLUMN_NAME,
                    data_type: col.type || col.DATA_TYPE,
                    is_nullable: col.is_nullable || col.IS_NULLABLE === 'YES',
                    is_primary_key: col.is_primary_key || col.CONSTRAINT_TYPE === 'PRIMARY KEY',
                    is_foreign_key: col.is_foreign_key || col.CONSTRAINT_TYPE === 'FOREIGN KEY',
                }));

                setSourceColumns(initialSourceColumns);
                setTargetColumns(initialTargetColumns);

                // Fetch constraints from the backend
                const token = getAuthToken();
                if (!token) {
                    throw new Error('No authentication token available');
                }

                const [sourceConstraintsRes, targetConstraintsRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/mapping/constraints?database_name=${selectedSourceTable.database}&schema=${selectedSourceTable.schema}`, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    }),
                    fetch(`${API_BASE_URL}/mapping/constraints?database_name=${selectedTargetTable.database}&schema=${selectedTargetTable.schema}`, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    })
                ]);

                if (!sourceConstraintsRes.ok || !targetConstraintsRes.ok) {
                    throw new Error('Failed to fetch constraints');
                }

                const sourceConstraints = (await sourceConstraintsRes.json()) as Constraint[];
                const targetConstraints = (await targetConstraintsRes.json()) as Constraint[];

                // Update columns with constraint information
                const updatedSourceColumns = initialSourceColumns.map((col) => ({
                    ...col,
                    is_foreign_key: sourceConstraints.some((c) =>
                        c.table_name === selectedSourceTable.table && 
                        c.column_name === col.name &&
                        c.constraint_type === 'FOREIGN KEY'
                    )
                }));

                const updatedTargetColumns = initialTargetColumns.map((col) => ({
                    ...col,
                    is_foreign_key: targetConstraints.some((c) =>
                        c.table_name === selectedTargetTable.table && 
                        c.column_name === col.name &&
                        c.constraint_type === 'FOREIGN KEY'
                    )
                }));

                setSourceColumns(updatedSourceColumns);
                setTargetColumns(updatedTargetColumns);

            } catch (error: any) {
                console.error('Error fetching columns:', error);
                toast({
                    title: 'Error',
                    description: `Failed to load column details: ${error.message}`,
                    variant: 'destructive',
                });
            } finally {
                setLoading(false);
            }
        };

        fetchColumns();
    }, [selectedSourceTable, selectedTargetTable, toast]);

    const handleNullableChange = (tableName: 'source' | 'target', colName: string, isChecked: boolean) => {
        if (tableName === 'source') {
            setSourceColumns(prev =>
                prev.map(col =>
                    col.name === colName ? { ...col, is_nullable: isChecked } : col
                )
            );
        } else {
            setTargetColumns(prev =>
                prev.map(col =>
                    col.name === colName ? { ...col, is_nullable: isChecked } : col
                )
            );
        }
    };

    const handleNextStep = () => {
        // Update the global mappingData with the nullable information
        const updatedColumnAttributes: any = {
            [selectedSourceTable!.table]: {},
            [selectedTargetTable!.table]: {},
        };

        sourceColumns.forEach(col => {
            updatedColumnAttributes[selectedSourceTable!.table][col.name] = {
                is_nullable: col.is_nullable,
                is_primary_key: col.is_primary_key,
                is_foreign_key: col.is_foreign_key,
            };
        });

        targetColumns.forEach(col => {
            updatedColumnAttributes[selectedTargetTable!.table][col.name] = {
                is_nullable: col.is_nullable,
                is_primary_key: col.is_primary_key,
                is_foreign_key: col.is_foreign_key,
            };
        });

        updateMappingData({ column_attributes: updatedColumnAttributes });
        onNext();
    };

    if (loading) {
        return (
            <Card className="p-4">
                <CardHeader><CardTitle>Step 2: Required & Nullable Column Configuration</CardTitle></CardHeader>
                <CardContent>Loading column details...</CardContent>
            </Card>
        );
    }

    return (
        <Card className="p-4">
            <CardHeader>
                <CardTitle>Step 2: Required & Nullable Column Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Source Table Columns */}
                    <div>
                        <h3 className="text-lg font-semibold mb-2">Source Table: {selectedSourceTable?.table}</h3>
                        {sourceColumns.length === 0 ? (
                            <p>No columns found for source table.</p>
                        ) : (
                            <div className="space-y-2">
                                {sourceColumns.map((col) => (
                                    <div key={col.name} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`source-${col.name}`}
                                            checked={!col.is_nullable} // Checkbox means "required" (not nullable)
                                            onCheckedChange={(checked: boolean) => handleNullableChange('source', col.name, !checked)}
                                        />
                                        <Label htmlFor={`source-${col.name}`}>
                                            {col.name} ({col.data_type}) {col.is_primary_key && '(PK)'} {col.is_foreign_key && '(FK)'} - {col.is_nullable ? 'Nullable' : 'Required'}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Target Table Columns */}
                    <div>
                        <h3 className="text-lg font-semibold mb-2">Target Table: {selectedTargetTable?.table}</h3>
                        {targetColumns.length === 0 ? (
                            <p>No columns found for target table.</p>
                        ) : (
                            <div className="space-y-2">
                                {targetColumns.map((col) => (
                                    <div key={col.name} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`target-${col.name}`}
                                            checked={!col.is_nullable}
                                            onCheckedChange={(checked: boolean) => handleNullableChange('target', col.name, !checked)}
                                        />
                                        <Label htmlFor={`target-${col.name}`}>
                                            {col.name} ({col.data_type}) {col.is_primary_key && '(PK)'} {col.is_foreign_key && '(FK)'} - {col.is_nullable ? 'Nullable' : 'Required'}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onBack}>Back</Button>
                    <Button onClick={handleNextStep}>Next</Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default Step2RequiredNull;