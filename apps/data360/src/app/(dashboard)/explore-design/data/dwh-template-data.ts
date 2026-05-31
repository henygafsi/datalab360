/**
 * Hardcoded DWH Template — Retail Data Warehouse schema
 * 13 tables with columns, primary keys, foreign keys, and computed columns.
 * Used when a user selects "Use DWH Template" in the modeling workflow.
 */

import type { TableItem, ColumnInfo } from '../../mapping/components/VirtualizedTableList';
import type { TableRelationship } from '@/app/services/explore-design/de-objects';

// ─── Template Column Definition ────────────────────────────────────────────────

export interface DwhTemplateColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  primaryKey: boolean;
  computedExpression?: string; // e.g. "(MNT * UNIT_PRICE)"
}

export interface DwhTemplateTable {
  tableName: string;
  columns: DwhTemplateColumn[];
  primaryKeys: string[];
}

export interface DwhTemplateFK {
  constraintName: string;
  childTable: string;
  childColumn: string;
  parentTable: string;
  parentColumn: string;
}

// ─── Tables ────────────────────────────────────────────────────────────────────

export const DWH_TEMPLATE_TABLES: DwhTemplateTable[] = [
  // ── DIM_CALENDAR ──
  {
    tableName: 'DIM_CALENDAR',
    primaryKeys: ['DAT_REFERENCE'],
    columns: [
      { name: 'DAT_REFERENCE', dataType: 'DATE', nullable: false, primaryKey: true },
      { name: 'ANNEE', dataType: 'NUMBER(4,0)', nullable: true, primaryKey: false },
      { name: 'SEMESTRE', dataType: 'NUMBER(1,0)', nullable: true, primaryKey: false },
      { name: 'TRIMESTRE', dataType: 'NUMBER(1,0)', nullable: true, primaryKey: false },
      { name: 'MOIS', dataType: 'NUMBER(2,0)', nullable: true, primaryKey: false },
      { name: 'MOIS_LIB_COURT', dataType: 'VARCHAR(10)', nullable: true, primaryKey: false },
      { name: 'MOIS_LIB_LONG', dataType: 'VARCHAR(20)', nullable: true, primaryKey: false },
      { name: 'SEMAINE', dataType: 'NUMBER(2,0)', nullable: true, primaryKey: false },
      { name: 'JOUR', dataType: 'NUMBER(2,0)', nullable: true, primaryKey: false },
      { name: 'JOUR_LIB', dataType: 'VARCHAR(20)', nullable: true, primaryKey: false },
      { name: 'JOUR_NUM_SEMAINE', dataType: 'NUMBER(1,0)', nullable: true, primaryKey: false },
      { name: 'JOUR_NUM_ANNEE', dataType: 'NUMBER(3,0)', nullable: true, primaryKey: false },
      { name: 'FLG_JOUR_FERIE', dataType: 'NUMBER(1,0)', nullable: true, primaryKey: false },
      { name: 'LIB_JOUR_FERIE', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'FLG_JOUR_OUVRE', dataType: 'NUMBER(1,0)', nullable: true, primaryKey: false },
      { name: 'FLG_JOUR_WEEKEND', dataType: 'NUMBER(1,0)', nullable: true, primaryKey: false },
      { name: 'FLG_EVENEMENT', dataType: 'NUMBER(1,0)', nullable: true, primaryKey: false },
      { name: 'LIB_EVENEMENT', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'FLG_VACANCES_ZONE_1', dataType: 'NUMBER(1,0)', nullable: true, primaryKey: false },
      { name: 'LIB_VACANCES_ZONE_1', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'FLG_VACANCES_ZONE_2', dataType: 'NUMBER(1,0)', nullable: true, primaryKey: false },
      { name: 'LIB_VACANCES_ZONE_2', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'FLG_VACANCES_ZONE_3', dataType: 'NUMBER(1,0)', nullable: true, primaryKey: false },
      { name: 'LIB_VACANCES_ZONE_3', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
    ],
  },

  // ── DIM_CLIENTS ──
  {
    tableName: 'DIM_CLIENTS',
    primaryKeys: ['COD_CLIENT'],
    columns: [
      { name: 'COD_CLIENT', dataType: 'VARCHAR(20)', nullable: false, primaryKey: true },
      { name: 'LIB_NOM', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_PRENOM', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_TELEPHONE', dataType: 'VARCHAR(20)', nullable: true, primaryKey: false },
      { name: 'LIB_ADRESSE1', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_ADRESSE2', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_ADRESSE3', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_CODE_POSTAL', dataType: 'VARCHAR(10)', nullable: true, primaryKey: false },
      { name: 'LIB_VILLE', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_PAYS', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'DAT_NAISSANCE', dataType: 'DATE', nullable: true, primaryKey: false },
      { name: 'LIB_NATIONALITE', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_LANGUE_MATERNELLE', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_LANGUE_ETRANGERE1', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_LANGUE_ETRANGERE2', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_LANGUE_ETRANGERE3', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'COD_PAYS_RESIDENCE', dataType: 'VARCHAR(10)', nullable: true, primaryKey: false },
      { name: 'FLG_CLIENT_ACTIF', dataType: 'NUMBER(1,0)', nullable: true, primaryKey: false },
    ],
  },

  // ── DIM_DEVISES ──
  {
    tableName: 'DIM_DEVISES',
    primaryKeys: ['COD_DEVISE'],
    columns: [
      { name: 'COD_DEVISE', dataType: 'VARCHAR(10)', nullable: false, primaryKey: true },
      { name: 'LIB_DEVISE', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'RAT_CONVERSION', dataType: 'FLOAT', nullable: true, primaryKey: false },
      { name: 'DAT_REFERENCE', dataType: 'DATE', nullable: true, primaryKey: false },
    ],
  },

  // ── DIM_FOURNISSEURS ──
  {
    tableName: 'DIM_FOURNISSEURS',
    primaryKeys: ['COD_FOURNISSEUR'],
    columns: [
      { name: 'COD_FOURNISSEUR', dataType: 'VARCHAR(20)', nullable: false, primaryKey: true },
      { name: 'LIB_FOURNISSEUR', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_ADRESSE1', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_ADRESSE2', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_ADRESSE3', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_CODE_POSTAL', dataType: 'VARCHAR(10)', nullable: true, primaryKey: false },
      { name: 'LIB_VILLE', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_PAYS', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_TELEPHONE', dataType: 'VARCHAR(20)', nullable: true, primaryKey: false },
      { name: 'URL_FOURNISSEUR', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
    ],
  },

  // ── DIM_ITEMS ──
  {
    tableName: 'DIM_ITEMS',
    primaryKeys: ['COD_ARTICLE'],
    columns: [
      { name: 'COD_ARTICLE', dataType: 'VARCHAR(20)', nullable: false, primaryKey: true },
      { name: 'LIB_ARTICLE', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'PIC_ARTICLE', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'DAT_CRE', dataType: 'DATE', nullable: true, primaryKey: false },
      { name: 'DAT_MAJ', dataType: 'DATE', nullable: true, primaryKey: false },
      { name: 'CATEGORY', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'SUBCATEGORY', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'BRAND', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'SUPPLIER_ID', dataType: 'VARCHAR(20)', nullable: true, primaryKey: false },
    ],
  },

  // ── DIM_MAGASINS ──
  {
    tableName: 'DIM_MAGASINS',
    primaryKeys: ['COD_MAGASIN'],
    columns: [
      { name: 'COD_MAGASIN', dataType: 'VARCHAR(20)', nullable: false, primaryKey: true },
      { name: 'LIB_MAGASIN', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_ADRESSE_MAGASIN_1', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_ADRESSE_MAGASIN_2', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_ADRESSE_MAGASIN_3', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_TELEPHONE_MAGASIN', dataType: 'VARCHAR(20)', nullable: true, primaryKey: false },
      { name: 'COD_PAYS', dataType: 'VARCHAR(10)', nullable: true, primaryKey: false },
      { name: 'TYP_MAGASIN', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'IND_SUPERFICIE_MAGASIN', dataType: 'NUMBER(10,2)', nullable: true, primaryKey: false },
      { name: 'DAT_OUVERTURE_MAGASIN', dataType: 'DATE', nullable: true, primaryKey: false },
      { name: 'DAT_FERMETURE_MAGASIN', dataType: 'DATE', nullable: true, primaryKey: false },
      { name: 'FLG_MAGASIN_ACTIF', dataType: 'NUMBER(1,0)', nullable: true, primaryKey: false },
      { name: 'REGION', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'CITY', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
    ],
  },

  // ── DIM_PRICES ──
  {
    tableName: 'DIM_PRICES',
    primaryKeys: ['COD_ARTICLE', 'DAT_REFERENCE'],
    columns: [
      { name: 'COD_ARTICLE', dataType: 'VARCHAR(20)', nullable: false, primaryKey: true },
      { name: 'DAT_REFERENCE', dataType: 'DATE', nullable: false, primaryKey: true },
      { name: 'PRICE', dataType: 'FLOAT', nullable: true, primaryKey: false },
      { name: 'CURRENCY', dataType: 'VARCHAR(10)', nullable: true, primaryKey: false },
    ],
  },

  // ── DIM_VENDEURS ──
  {
    tableName: 'DIM_VENDEURS',
    primaryKeys: ['COD_VENDEUR'],
    columns: [
      { name: 'COD_VENDEUR', dataType: 'VARCHAR(20)', nullable: false, primaryKey: true },
      { name: 'LIB_VENDEUR', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'COD_MAGASIN', dataType: 'VARCHAR(20)', nullable: true, primaryKey: false },
      { name: 'DAT_DEBUT', dataType: 'DATE', nullable: true, primaryKey: false },
      { name: 'DAT_FIN', dataType: 'DATE', nullable: true, primaryKey: false },
      { name: 'FLG_ACTIF', dataType: 'NUMBER(1,0)', nullable: true, primaryKey: false },
      { name: 'LIB_NOM', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_PRENOM', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_TELEPHONE', dataType: 'VARCHAR(20)', nullable: true, primaryKey: false },
      { name: 'LIB_ADRESSE1', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_ADRESSE2', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_ADRESSE3', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_CODE_POSTAL', dataType: 'VARCHAR(10)', nullable: true, primaryKey: false },
      { name: 'LIB_VILLE', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_PAYS', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'DAT_NAISSANCE', dataType: 'DATE', nullable: true, primaryKey: false },
      { name: 'LIB_AGE', dataType: 'NUMBER(3,0)', nullable: true, primaryKey: false },
      { name: 'LIB_NATIONALITE', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_LANGUE_MATERNELLE', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_LANGUE_ETRANGERE1', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_LANGUE_ETRANGERE2', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'LIB_LANGUE_ETRANGERE3', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
    ],
  },

  // ── FACT_FINANCE ──
  {
    tableName: 'FACT_FINANCE',
    primaryKeys: ['DAT_REFERENCE', 'COD_MAGASIN'],
    columns: [
      { name: 'DAT_REFERENCE', dataType: 'DATE', nullable: false, primaryKey: true },
      { name: 'COD_MAGASIN', dataType: 'VARCHAR(20)', nullable: false, primaryKey: true },
      { name: 'TOTAL_REVENUE', dataType: 'FLOAT', nullable: true, primaryKey: false },
      { name: 'TOTAL_EXPENSES', dataType: 'FLOAT', nullable: true, primaryKey: false },
      { name: 'TOTAL_PROFIT', dataType: 'FLOAT', nullable: true, primaryKey: false },
      { name: 'NET_PROFIT_MARGIN', dataType: 'FLOAT', nullable: true, primaryKey: false },
    ],
  },

  // ── FACT_MARKETING ──
  {
    tableName: 'FACT_MARKETING',
    primaryKeys: ['CAMPAIGN_ID'],
    columns: [
      { name: 'CAMPAIGN_ID', dataType: 'NUMBER(38,0)', nullable: false, primaryKey: true },
      { name: 'CAMPAIGN_NAME', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'START_DATE', dataType: 'DATE', nullable: true, primaryKey: false },
      { name: 'END_DATE', dataType: 'DATE', nullable: true, primaryKey: false },
      { name: 'BUDGET', dataType: 'FLOAT', nullable: true, primaryKey: false },
      { name: 'COST', dataType: 'FLOAT', nullable: true, primaryKey: false },
      { name: 'IMPRESSIONS', dataType: 'NUMBER(38,0)', nullable: true, primaryKey: false },
      { name: 'CLICKS', dataType: 'NUMBER(38,0)', nullable: true, primaryKey: false },
      { name: 'CONVERSIONS', dataType: 'NUMBER(38,0)', nullable: true, primaryKey: false },
      { name: 'REVENUE', dataType: 'FLOAT', nullable: true, primaryKey: false },
      { name: 'ROI', dataType: 'FLOAT', nullable: true, primaryKey: false },
      { name: 'RECOMMENDED_PRODUCTS', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
      { name: 'TARGET_AUDIENCE', dataType: 'VARCHAR(256)', nullable: true, primaryKey: false },
    ],
  },

  // ── FACT_ORDERS ──
  {
    tableName: 'FACT_ORDERS',
    primaryKeys: ['COD_MAGASIN', 'NUM_COMMANDE', 'COD_ARTICLE'],
    columns: [
      { name: 'COD_MAGASIN', dataType: 'VARCHAR(20)', nullable: false, primaryKey: true },
      { name: 'NUM_COMMANDE', dataType: 'NUMBER(38,0)', nullable: false, primaryKey: true },
      { name: 'COD_ARTICLE', dataType: 'VARCHAR(20)', nullable: false, primaryKey: true },
      { name: 'DAT_COMMANDE', dataType: 'DATE', nullable: true, primaryKey: false },
      { name: 'TYP_COMMANDE', dataType: 'VARCHAR(50)', nullable: true, primaryKey: false },
      { name: 'DAT_DEPART', dataType: 'DATE', nullable: true, primaryKey: false },
      { name: 'DAT_LIVRAISON_SOUHAITEE', dataType: 'DATE', nullable: true, primaryKey: false },
      { name: 'DAT_LIVRAISON_CONFIRMEE', dataType: 'DATE', nullable: true, primaryKey: false },
      { name: 'DAT_LIVRAISON_REELLE', dataType: 'DATE', nullable: true, primaryKey: false },
      { name: 'COD_STATUT_COMMANDE', dataType: 'VARCHAR(50)', nullable: true, primaryKey: false },
      { name: 'COD_FOURNISSEUR', dataType: 'VARCHAR(20)', nullable: true, primaryKey: false },
      { name: 'MNT_TOTAL_COMMANDE', dataType: 'FLOAT', nullable: true, primaryKey: false },
      { name: 'UNIT_PRICE', dataType: 'FLOAT', nullable: true, primaryKey: false },
      { name: 'TOTAL_COST', dataType: 'FLOAT', nullable: true, primaryKey: false, computedExpression: 'MNT_TOTAL_COMMANDE * UNIT_PRICE' },
    ],
  },

  // ── FACT_STOCKS ──
  {
    tableName: 'FACT_STOCKS',
    primaryKeys: ['COD_MAGASIN', 'COD_ARTICLE'],
    columns: [
      { name: 'COD_MAGASIN', dataType: 'VARCHAR(20)', nullable: false, primaryKey: true },
      { name: 'COD_ARTICLE', dataType: 'VARCHAR(20)', nullable: false, primaryKey: true },
      { name: 'QTE_STOCK', dataType: 'NUMBER(10,2)', nullable: true, primaryKey: false },
      { name: 'DAT_ENTREE', dataType: 'DATE', nullable: true, primaryKey: false },
      { name: 'FLG_DISPO_VENTE', dataType: 'NUMBER(1,0)', nullable: true, primaryKey: false },
      { name: 'UNIT_PRICE', dataType: 'FLOAT', nullable: true, primaryKey: false },
      { name: 'STOCK_VALUE', dataType: 'FLOAT', nullable: true, primaryKey: false, computedExpression: 'CAST(QTE_STOCK AS FLOAT) * UNIT_PRICE' },
    ],
  },

  // ── FACT_TRANSACTIONS ──
  {
    tableName: 'FACT_TRANSACTIONS',
    primaryKeys: ['COD_MAGASIN', 'NUM_TICKET', 'NUM_TICKET_LIGNE'],
    columns: [
      { name: 'COD_MAGASIN', dataType: 'VARCHAR(20)', nullable: false, primaryKey: true },
      { name: 'NUM_TICKET', dataType: 'VARCHAR(38)', nullable: false, primaryKey: true },
      { name: 'NUM_TICKET_LIGNE', dataType: 'NUMBER(38,0)', nullable: false, primaryKey: true },
      { name: 'DAT_FACTURE', dataType: 'DATE', nullable: true, primaryKey: false },
      { name: 'COD_CAISSE', dataType: 'VARCHAR(10)', nullable: true, primaryKey: false },
      { name: 'TYP_MODE_PAIEMENT', dataType: 'VARCHAR(50)', nullable: true, primaryKey: false },
      { name: 'COD_VENDEUR', dataType: 'VARCHAR(20)', nullable: true, primaryKey: false },
      { name: 'COD_CLIENT', dataType: 'VARCHAR(20)', nullable: true, primaryKey: false },
      { name: 'COD_ARTICLE', dataType: 'VARCHAR(20)', nullable: true, primaryKey: false },
      { name: 'QTE_FACTURE', dataType: 'NUMBER(10,2)', nullable: true, primaryKey: false },
      { name: 'COD_DEVISE', dataType: 'VARCHAR(10)', nullable: true, primaryKey: false },
      { name: 'MNT_FACTURE_HT', dataType: 'FLOAT', nullable: true, primaryKey: false },
      { name: 'MNT_FACTURE_TTC', dataType: 'FLOAT', nullable: true, primaryKey: false },
      { name: 'MNT_TAXES', dataType: 'FLOAT', nullable: true, primaryKey: false },
      { name: 'MNT_DISCOUNT', dataType: 'FLOAT', nullable: true, primaryKey: false },
      { name: 'UNIT_PRICE', dataType: 'FLOAT', nullable: true, primaryKey: false },
      { name: 'TOTAL_COST', dataType: 'FLOAT', nullable: true, primaryKey: false, computedExpression: 'CAST(QTE_FACTURE AS FLOAT) * UNIT_PRICE' },
    ],
  },
];

// ─── Foreign Key Relationships ─────────────────────────────────────────────────

export const DWH_TEMPLATE_RELATIONSHIPS: DwhTemplateFK[] = [
  // DIM_PRICES FKs
  { constraintName: 'FK_PRICES_ARTICLE', childTable: 'DIM_PRICES', childColumn: 'COD_ARTICLE', parentTable: 'DIM_ITEMS', parentColumn: 'COD_ARTICLE' },
  { constraintName: 'FK_PRICES_CURRENCY', childTable: 'DIM_PRICES', childColumn: 'CURRENCY', parentTable: 'DIM_DEVISES', parentColumn: 'COD_DEVISE' },

  // FACT_FINANCE FKs
  { constraintName: 'FK_FACT_FINANCE_MAGASIN', childTable: 'FACT_FINANCE', childColumn: 'COD_MAGASIN', parentTable: 'DIM_MAGASINS', parentColumn: 'COD_MAGASIN' },
  { constraintName: 'FK_FACT_FINANCE_DATE', childTable: 'FACT_FINANCE', childColumn: 'DAT_REFERENCE', parentTable: 'DIM_CALENDAR', parentColumn: 'DAT_REFERENCE' },

  // FACT_ORDERS FKs
  { constraintName: 'FK_FACT_ORDERS_MAGASIN', childTable: 'FACT_ORDERS', childColumn: 'COD_MAGASIN', parentTable: 'DIM_MAGASINS', parentColumn: 'COD_MAGASIN' },
  { constraintName: 'FK_FACT_ORDERS_ARTICLE', childTable: 'FACT_ORDERS', childColumn: 'COD_ARTICLE', parentTable: 'DIM_ITEMS', parentColumn: 'COD_ARTICLE' },
  { constraintName: 'FK_FACT_ORDERS_FOURNISSEUR', childTable: 'FACT_ORDERS', childColumn: 'COD_FOURNISSEUR', parentTable: 'DIM_FOURNISSEURS', parentColumn: 'COD_FOURNISSEUR' },

  // FACT_STOCKS FKs
  { constraintName: 'FK_FACT_STOCKS_MAGASIN', childTable: 'FACT_STOCKS', childColumn: 'COD_MAGASIN', parentTable: 'DIM_MAGASINS', parentColumn: 'COD_MAGASIN' },
  { constraintName: 'FK_FACT_STOCKS_ARTICLE', childTable: 'FACT_STOCKS', childColumn: 'COD_ARTICLE', parentTable: 'DIM_ITEMS', parentColumn: 'COD_ARTICLE' },

  // FACT_TRANSACTIONS FKs
  { constraintName: 'FK_FACT_TRANSACTIONS_MAGASIN', childTable: 'FACT_TRANSACTIONS', childColumn: 'COD_MAGASIN', parentTable: 'DIM_MAGASINS', parentColumn: 'COD_MAGASIN' },
  { constraintName: 'FK_FACT_TRANSACTIONS_CLIENT', childTable: 'FACT_TRANSACTIONS', childColumn: 'COD_CLIENT', parentTable: 'DIM_CLIENTS', parentColumn: 'COD_CLIENT' },
  { constraintName: 'FK_FACT_TRANSACTIONS_ARTICLE', childTable: 'FACT_TRANSACTIONS', childColumn: 'COD_ARTICLE', parentTable: 'DIM_ITEMS', parentColumn: 'COD_ARTICLE' },
  { constraintName: 'FK_FACT_TRANSACTIONS_VENDEUR', childTable: 'FACT_TRANSACTIONS', childColumn: 'COD_VENDEUR', parentTable: 'DIM_VENDEURS', parentColumn: 'COD_VENDEUR' },
  { constraintName: 'FK_FACT_TRANSACTIONS_DEVISE', childTable: 'FACT_TRANSACTIONS', childColumn: 'COD_DEVISE', parentTable: 'DIM_DEVISES', parentColumn: 'COD_DEVISE' },
];

// ─── Helper Functions ──────────────────────────────────────────────────────────

/**
 * Build TableItem[] from template for a given target database + schema.
 */
export function buildTemplateTableItems(database: string, schema: string): TableItem[] {
  return DWH_TEMPLATE_TABLES.map((t) => {
    const id = `${database}.${schema}.${t.tableName}`;
    return {
      id,
      database,
      schema,
      table: t.tableName,
      columnCount: t.columns.length,
      hasPrimaryKey: t.primaryKeys.length > 0,
      status: 'configured' as const,
      sensitiveColumns: 0,
    };
  });
}

/**
 * Build Map<string, ColumnInfo[]> from template for a given target database + schema.
 */
export function buildTemplateColumnsMap(database: string, schema: string): Map<string, ColumnInfo[]> {
  const map = new Map<string, ColumnInfo[]>();
  DWH_TEMPLATE_TABLES.forEach((t) => {
    const tableId = `${database}.${schema}.${t.tableName}`;
    map.set(
      tableId,
      t.columns.map((col) => ({
        name: col.name,
        dataType: col.dataType,
        isPrimaryKey: col.primaryKey,
        isNullable: col.nullable,
        isSensitive: false,
      })),
    );
  });
  return map;
}

/**
 * Build TableRelationship[] from template for a given schema.
 * Each FK constraint becomes one TableRelationship entry.
 */
export function buildTemplateRelationships(schema: string): TableRelationship[] {
  return DWH_TEMPLATE_RELATIONSHIPS.map((fk) => ({
    constraint_name: fk.constraintName,
    child_schema: schema,
    child_table: fk.childTable,
    child_column: fk.childColumn,
    parent_schema: schema,
    parent_table: fk.parentTable,
    parent_column: fk.parentColumn,
  }));
}
