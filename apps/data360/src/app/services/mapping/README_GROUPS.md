# Groups Storage Implementation

## Overview
This implementation uses the event-based approach to store mapping groups in the backend.

### Event-Based Approach (Implemented)
- Uses `addGroupEvent()` function
- Follows the existing backend pattern of storing events
- Each group is saved as an `ADD_GROUP` event
- Consistent with existing architecture

## Backend Endpoint Required

### Event-Based Endpoint:
```
POST /mapping/add-event/
Body: {
  "project_id": "string",
  "event_type": "ADD_GROUP",
  "event_details": {
    "group_index": number,
    "sources": TableSelection[],
    "target": TableSelection | null
  }
}
```

## Frontend Usage

### Manual Save
Click the "Save Groups" button in Step 1 to manually save groups.

### Auto-Save
Groups are automatically saved 2 seconds after any modification (optional feature).

### Data Structure
```typescript
interface GroupData {
  sources: TableSelection[];
  target: TableSelection | null;
}

interface TableSelection {
  database: string;
  schema: string;
  table: string;
}
```

## Implementation Notes

1. Uses the event-based approach exclusively
2. Each group is saved as a separate `ADD_GROUP` event
3. Auto-save is debounced to prevent excessive API calls
4. Error handling provides user feedback via toast notifications
5. Groups are stored in the same event system as other mapping operations
