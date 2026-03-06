# Dispatch Shipment Workbench Blueprint

Last updated: March 4, 2026

## Goal

Reduce operator confusion by exposing a single dispatch object: **Shipment**.

- Dispatch users should not need to choose between Loads vs Trips.
- The screen should support both **FTL** and **LTL** in one queue.
- Domain truth remains split:
  - **Execution authority**: Trip
  - **Commercial authority**: Load

## Current UX contract

1. `/dispatch` is a single shipment-first workspace.
2. Movement mode selector exists at top-level:
   - `All modes`
   - `LTL`
   - `FTL`
3. LTL-only ownership lanes (`All lanes / Outbound / Inbound`) are hidden while viewing FTL-only mode.
4. Core quick controls remain visible: map, create shipment, queue view, mode, refresh.
5. Advanced controls remain under Workbench Controls menu.

## Business workflow diagrams

### LTL workflow

```mermaid
flowchart TD
  A[Dispatch queue - Shipment rows] --> B[Select LTL shipment]
  B --> C[Execution update]
  C --> D[PATCH /shipments/:id/execution]
  D --> E[Trip write + trip-load mirror sync]
  E --> F[Audit + webhooks + queue event]

  B --> G[Commercial update]
  G --> H[PATCH /shipments/:id/commercial]
  H --> I[Load write]
  I --> F
```

### FTL workflow

```mermaid
flowchart TD
  A[Dispatch queue - Shipment rows] --> B[Select FTL shipment]
  B --> C[Execution action]
  C --> D[Trip route/adapter]
  D --> E[Trip write + mirror sync]
  E --> F[Audit + queue event]

  B --> G[Commercial action]
  G --> H[Load route]
  H --> I[Load write]
  I --> F
```

### Authority boundary

```mermaid
flowchart LR
  A[Shipment UI command] --> B{Command type}
  B -->|Execution| C[Trip authority]
  B -->|Commercial| D[Load authority]
  C --> E[Projected shipment read model]
  D --> E
```

## Why this reduces confusion

1. One top-level object in dispatch (`Shipment`) removes dual mental model switching.
2. Operators keep one queue regardless of movement mode.
3. FTL and LTL differ by rules, not by separate top-level pages.
4. Advanced controls are available but no longer dominate primary actions.

## Next UX hardening steps

1. Replace `Load #` header label with `Shipment #` in dispatch grid.
2. Move low-frequency toolbar actions into Workbench Controls menu.
3. Add role-specific row primary CTA (`Assign`, `Advance status`, `Resolve exception`).
4. Keep one expandable row detail with tabs: `Execution`, `Commercial`, `Timeline`.
