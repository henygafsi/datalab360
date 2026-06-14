'use client';

/**
 * Defines the payload for any table structure management operation.
 * This aligns with the query parameters of the backend's /manage_table endpoint.
 */
export interface ManageTablePayload {
    CONSTRAINT_TYPE: 'ADD_COLUMN' | 'DROP_COLUMN' | 'CHANGE_TYPE' | 'RENAME_COL' | 'ADD_PK' | 'ADD_FK' | 'SET_DEFAULT' | 'SET_NULL' | 'SET_NOT_NULL' | 'RENAME_TAB' | 'SWAP' | 'ADD_UNIQUE' | 'DROP_PK' | 'DROP_FK' | 'DROP_UNIQUE' | 'ADD_CHECK_CONSTRAINT' | 'DROP_CHECK_CONSTRAINT' | 'COMMENT_ON_COLUMN' | 'AUTO_INCREMENT';
    SOURCE_TABLE: string; // Fully qualified table name, e.g., "DATABASE.SCHEMA.TABLE"
    COLUMN_NAME?: string;
    COLUMN_TYPE?: string;
    NEW_NAME?: string;
    TABLE_REF?: string; // Fully qualified reference table name for FKs
    COLUMN_REF?: string;
    DEFAULT_VALUE?: string;
    TARGET_TABLE?: string; // For SWAP operation
    COLUMN_COMMENT?: string;
}

/**
 * Generic table-structure management (PK, FK, columns, etc.) keyed by CONSTRAINT_TYPE.
 *
 * The historical /explore-design/guided/manage_table route DOES NOT EXIST on the
 * current backend (the /explore-design router has no /guided sub-prefix). This helper
 * has no active consumers; rather than call a dead route it returns an honest
 * "unavailable" result so any future caller degrades visibly instead of silently failing.
 *
 * @param _payload - The details of the management operation (currently unused).
 * @returns An honest "unavailable" result.
 */
export const manageTableStructure = async (_payload: ManageTablePayload): Promise<any> => {
    return {
        status: 'unavailable',
        message: 'Table structure management is not available: the backend does not expose a manage-table endpoint.',
    };
};
