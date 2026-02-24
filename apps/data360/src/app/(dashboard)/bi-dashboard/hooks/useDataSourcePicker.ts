'use client';

import { useState, useEffect, useCallback } from 'react';
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTables } from '@/app/services/mapping/getTables';
import { getTableColumns, type TableColumn } from '@/app/services/mapping/fetch_tables';

interface SelectOption {
  value: string;
  label: string;
}

interface DataSourceState {
  database: string;
  schema: string;
  table: string;
}

export function useDataSourcePicker(initial?: Partial<DataSourceState>) {
  const [source, setSource] = useState<DataSourceState>({
    database: initial?.database || '',
    schema: initial?.schema || '',
    table: initial?.table || '',
  });

  const [dbOptions, setDbOptions] = useState<SelectOption[]>([]);
  const [schemaOptions, setSchemaOptions] = useState<SelectOption[]>([]);
  const [tableOptions, setTableOptions] = useState<SelectOption[]>([]);
  const [columnOptions, setColumnOptions] = useState<SelectOption[]>([]);
  const [columns, setColumns] = useState<TableColumn[]>([]);

  // Load databases on mount
  useEffect(() => {
    getDatabases()
      .then((dbs) => setDbOptions(dbs.map((d) => ({ value: d, label: d }))))
      .catch(() => {});
  }, []);

  // Load schemas when database changes
  useEffect(() => {
    if (!source.database) {
      setSchemaOptions([]);
      return;
    }
    getSchemas(source.database)
      .then((schemas) => setSchemaOptions(schemas.map((s) => ({ value: s, label: s }))))
      .catch(() => {});
  }, [source.database]);

  // Load tables when schema changes
  useEffect(() => {
    if (!source.database || !source.schema) {
      setTableOptions([]);
      return;
    }
    getTables(source.database, source.schema)
      .then((tables) => setTableOptions(tables.map((t) => ({ value: t, label: t }))))
      .catch(() => {});
  }, [source.database, source.schema]);

  // Load columns when table changes
  useEffect(() => {
    if (!source.database || !source.schema || !source.table) {
      setColumnOptions([]);
      setColumns([]);
      return;
    }
    getTableColumns(source.database, source.schema, source.table)
      .then((cols) => {
        setColumns(cols);
        const names = cols
          .map((c) => c.name || c.COLUMN_NAME || '')
          .filter(Boolean) as string[];
        setColumnOptions(names.map((n) => ({ value: n, label: n })));
      })
      .catch(() => {});
  }, [source.database, source.schema, source.table]);

  const setDatabase = useCallback((db: string) => {
    setSource({ database: db, schema: '', table: '' });
  }, []);

  const setSchema = useCallback((schema: string) => {
    setSource((prev) => ({ ...prev, schema, table: '' }));
  }, []);

  const setTable = useCallback((table: string) => {
    setSource((prev) => ({ ...prev, table }));
  }, []);

  return {
    source,
    dbOptions,
    schemaOptions,
    tableOptions,
    columnOptions,
    columns,
    setDatabase,
    setSchema,
    setTable,
    isComplete: !!(source.database && source.schema && source.table),
  };
}
