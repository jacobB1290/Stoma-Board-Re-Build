# Stoma Board

A modern Dental Lab Case Management System built with Next.js, TypeScript, and Supabase.

---

## 🏗️ ARCHITECTURE PRINCIPLES

This application follows an **AI-Native, Efficiency-First Architecture**. Every decision prioritizes:

1. **Reuse over recreation** - Never duplicate logic
2. **Thin UI components** - Components render state, they don't manage business logic
3. **Single source of truth** - One place for each piece of logic
4. **Action-driven interactions** - All state changes flow through the dispatcher

---

## 🎯 EFFICIENCY-FIRST MINDSET

### ⚠️ MANDATORY RULES BEFORE ANY CODE CHANGE

```
┌─────────────────────────────────────────────────────────────────────────┐
│  STOP! Before writing ANY code, answer these questions:                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. DOES THIS LOGIC ALREADY EXIST?                                      │
│     Search these files first:                                           │
│     • services/caseService.ts - All case business logic                 │
│     • lib/animations.ts - All animation configs                         │
│     • lib/constants.ts - All constants                                  │
│     • utils/dateUtils.ts - All date utilities                           │
│     • contexts/*Context.tsx - All shared state                          │
│     → If found: IMPORT IT, don't recreate                               │
│                                                                         │
│  2. WHERE IS THE CORRECT LOCATION FOR THIS?                             │
│     • Database operations → services/*.ts                               │
│     • State mutations → dispatch('action.type', payload)                │
│     • Animation config → lib/animations.ts                              │
│     • Constants/colors → lib/constants.ts or CSS variables              │
│     • UI rendering → components/*.tsx (THIN, no logic)                  │
│                                                                         │
│  3. WILL THIS CAUSE DUPLICATION?                                        │
│     → If YES: Refactor existing code to be reusable FIRST               │
│     → Extract into shared module, THEN import                           │
│                                                                         │
│  4. IS THIS A COMPONENT ANTI-PATTERN?                                   │
│     Check the "Anti-Patterns" section below                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### ❌ ANTI-PATTERNS (NEVER DO)

```typescript
// ❌ NEVER: Local state for global data
const [isComplete, setIsComplete] = useState(caseData.completed);

// ❌ NEVER: Direct Supabase calls in components
const handleClick = async () => {
  await supabase.from('cases').update({ completed: true });
};

// ❌ NEVER: Business logic in components
const bgColor = caseData.modifiers?.includes('stage2') ? '#6F5BA8' : '#4D8490';

// ❌ NEVER: Inline animation configs
<motion.div transition={{ type: "spring", stiffness: 500, damping: 40 }} />

// ❌ NEVER: Hardcoded colors
<div style={{ backgroundColor: '#16525F' }} />

// ❌ NEVER: Duplicating shared components
// If DayCol and MetaCol need same PriorityBar, extract to shared component

// ❌ NEVER: Multiple files with same calculations
// If ranking/sorting exists in Board.tsx, don't recreate in DayCol.tsx
```

### ✅ CORRECT PATTERNS (ALWAYS DO)

```typescript
// ✅ USE: Dispatch for all mutations
const { dispatch } = useDispatch();
onClick={() => dispatch('case.toggle_complete', { id: caseData.id })}

// ✅ USE: Context for all global state
const { rows, loading } = useData();
const { activeDepartment } = useUI();

// ✅ USE: Shared animations
import { SPRING, layoutProps, rowVariants } from '@/lib/animations';
<motion.div {...layoutProps} variants={rowVariants} />

// ✅ USE: CSS variables for colors
<div style={{ backgroundColor: 'var(--row-default)' }} />
<div className="bg-[var(--col-normal)]" />

// ✅ USE: Pure helper functions for derived values
function getRowBackground(c: Case): string {
  if (c.stage2) return 'var(--row-stage2)';
  if (c.caseType === 'bbs') return 'var(--row-bbs)';
  return 'var(--row-default)';
}

// ✅ USE: Shared components
import { PriorityBar } from '@/components/board/shared/PriorityBar';
import { ColumnShell } from '@/components/board/shared/ColumnShell';
```

---

## 📐 SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Board      │  │   Editor     │  │   Settings   │          │
│  │   View       │  │   View       │  │   Modal      │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └─────────────────┼─────────────────┘                   │
│                           │                                     │
│                           ▼                                     │
│              ┌────────────────────────┐                         │
│              │   dispatch(action)     │  ← ONE entry point      │
│              └────────────┬───────────┘                         │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ACTION DISPATCHER                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Registered Handlers (DispatchContext.tsx):             │   │
│  │  • case.create    → caseService.createCase()            │   │
│  │  • case.update    → caseService.updateCase()            │   │
│  │  • case.delete    → caseService.deleteCase()            │   │
│  │  • case.toggle_*  → caseService.toggleModifier()        │   │
│  │  • case.change_stage → caseService.updateStage()        │   │
│  │  • ui.*           → UIContext state setters             │   │
│  │  • query.*        → caseService query functions         │   │
│  └─────────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SERVICES LAYER                             │
│  ┌─────────────────┐  ┌─────────────────┐                      │
│  │  caseService    │  │  userService    │  ← Business logic    │
│  │  • CRUD ops     │  │  • Identity     │     lives HERE       │
│  │  • Queries      │  │  • Heartbeat    │                      │
│  │  • Validation   │  │  • Presence     │                      │
│  │  • Modifiers    │  │                 │                      │
│  └────────┬────────┘  └────────┬────────┘                      │
│           │                    │                                │
│           └────────────────────┘                                │
│                       │                                         │
└───────────────────────┼─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SUPABASE                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   cases     │  │  history    │  │  devices    │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                           │                                     │
│                    Realtime Subscription                        │
│                           │                                     │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATA CONTEXT                               │
│  • Holds current state (rows, loading, error)                   │
│  • Receives realtime updates                                    │
│  • Provides filtered views via hooks                            │
│  • DOES NOT contain business logic                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 PROJECT STRUCTURE

```
src/
├── actions/                    # Action System
│   ├── schema.ts              # Action type definitions (SOURCE OF TRUTH)
│   ├── dispatcher.ts          # Core dispatcher (routes actions to handlers)
│   └── index.ts               # Exports
│
├── services/                   # Business Logic Layer (NO UI CODE HERE)
│   ├── caseService.ts         # ALL case operations (CRUD, queries, modifiers)
│   ├── userService.ts         # User identity, heartbeat
│   └── index.ts               # Exports
│
├── contexts/                   # React State Management
│   ├── DataContext.tsx        # Case data + realtime subscription
│   ├── UIContext.tsx          # UI state (view, department, modals)
│   ├── UserContext.tsx        # User identity
│   ├── DispatchContext.tsx    # Connects dispatcher to React (HANDLERS HERE)
│   └── index.ts               # Exports
│
├── components/                 # UI Components (THIN - render only)
│   ├── common/                # Shared UI components
│   │   ├── Providers.tsx      # Context providers wrapper
│   │   ├── Header.tsx         # Navigation header
│   │   └── index.ts
│   ├── board/                 # Board view components
│   │   ├── Board.tsx          # Main board container
│   │   ├── DayCol.tsx         # Day column
│   │   ├── MetaCol.tsx        # Overdue/OnHold columns
│   │   ├── CaseRow.tsx        # Single case row (THIN)
│   │   ├── shared/            # Shared board subcomponents
│   │   │   ├── ColumnShell.tsx
│   │   │   ├── ColumnHeader.tsx
│   │   │   ├── PriorityBar.tsx
│   │   │   └── StageDivider.tsx
│   │   └── index.ts
│   └── editor/                # Case editor
│       ├── CaseEditor.tsx     # Editor form
│       └── index.ts
│
├── lib/                        # Shared Utilities (IMPORT FROM HERE)
│   ├── index.ts               # BARREL FILE - import all from '@/lib'
│   ├── supabase.ts            # Supabase client
│   ├── constants.ts           # App constants (departments, stages)
│   ├── animations.ts          # ALL animation configs (SINGLE SOURCE)
│   └── cn.ts                  # Class name utility
│
├── utils/                      # Pure Utility Functions
│   └── dateUtils.ts           # Date formatting/calculations
│
├── types/                      # TypeScript Definitions
│   ├── database.ts            # DB schema types
│   ├── case.ts                # Case domain types
│   ├── actions.ts             # Action payload types
│   └── index.ts               # Exports
│
└── app/                        # Next.js App Router
    ├── layout.tsx             # Root layout with providers
    ├── page.tsx               # Main page (routes to views)
    └── globals.css            # Global styles + CSS variables
```

---

## 🎨 STYLING ARCHITECTURE

### CSS Variables (SINGLE SOURCE OF TRUTH)

All colors, spacing, and design tokens are defined ONCE in `globals.css`:

```css
:root {
  /* Column backgrounds */
  --col-normal: #16525F;      /* Teal columns */
  --col-today: #fef9c3;       /* Yellow for today */
  --col-overdue: #b91c1c;     /* Red for overdue */
  --col-hold: #b45309;        /* Amber for on hold */
  
  /* Row backgrounds */
  --row-default: #4D8490;     /* Teal rows */
  --row-stage2: #6F5BA8;      /* Purple for stage2 */
  --row-bbs: #55679B;         /* Blue for BBS */
  --row-flex: #C75A9E;        /* Pink for Flex */
  
  /* Status rings - use Tailwind ring utilities */
  /* Priority: ring-red-500 */
  /* Rush: ring-orange-400 */
}
```

### Animation Config (SINGLE SOURCE in lib/animations.ts)

```typescript
// IMPORT these, never define inline
import { 
  SPRING,           // Standard spring transition
  FAST_SPRING,      // Quick exits
  BUBBLE_SPRING,    // Button reveals
  layoutProps,      // Spread onto motion.div for layout
  rowVariants,      // Row enter/exit animations
  revealButtonVariants,
  dividerVariants,
  initPulseClock,   // Call once at app start
  isInBlueWindow,   // Time-based pulse logic
  isInRedWindow,
} from '@/lib/animations';
```

---

## 🔄 DATA FLOW EXAMPLE

### User clicks "Next Stage" on a case:

```
1. CaseRow component (THIN)
   └─→ onClick={() => dispatch('case.change_stage', { id, stage: 'production' })}

2. DispatchContext
   └─→ Routes to registered handler

3. Handler (in DispatchContext.tsx)
   └─→ Calls caseService.updateStage(id, 'production', userName)

4. caseService (services/caseService.ts)
   └─→ Updates Supabase
   └─→ Logs to case_history

5. Supabase Realtime
   └─→ Broadcasts change to all clients

6. DataContext subscription
   └─→ Updates local state (rows array)

7. React re-renders
   └─→ CaseRow shows new stage
```

**Key insight:** The component NEVER directly manipulates data. It only dispatches an intent.

---

## 📋 COMPONENT PATTERNS

### ✅ Correct CaseRow Pattern:

```tsx
function CaseRow({ caseData }: { caseData: Case }) {
  const { dispatch } = useDispatch();
  
  // ALL interactions dispatch actions - NO direct logic
  return (
    <motion.div 
      {...layoutProps}
      variants={rowVariants}
      onClick={() => dispatch('ui.open_editor', { id: caseData.id })}
      onContextMenu={(e) => {
        e.preventDefault();
        dispatch('case.toggle_priority', { id: caseData.id });
      }}
      className={cn(
        'case-row',
        caseData.priority && 'ring-[3px] ring-red-500',
        caseData.rush && !caseData.priority && 'ring-[3px] ring-orange-400'
      )}
      style={{ backgroundColor: getRowBackground(caseData) }}
    >
      {caseData.caseNumber}
    </motion.div>
  );
}

// PURE function - no side effects, easy to test
function getRowBackground(c: Case): string {
  if (c.stage2) return 'var(--row-stage2)';
  if (c.caseType === 'bbs') return 'var(--row-bbs)';
  if (c.caseType === 'flex') return 'var(--row-flex)';
  return 'var(--row-default)';
}
```

### ✅ Correct Column Pattern (Shared Components):

```tsx
// components/board/shared/ColumnShell.tsx
export function ColumnShell({ 
  children, 
  variant 
}: { 
  children: React.ReactNode;
  variant: 'normal' | 'today' | 'overdue' | 'hold';
}) {
  const bgClass = {
    normal: 'bg-[var(--col-normal)]',
    today: 'bg-[var(--col-today)]',
    overdue: 'bg-[var(--col-overdue)]',
    hold: 'bg-[var(--col-hold)]',
  }[variant];

  return (
    <motion.div {...layoutProps} className={cn('flex-1 min-w-[200px] p-4 rounded-lg', bgClass)}>
      {children}
    </motion.div>
  );
}

// Now DayCol and MetaCol both use:
import { ColumnShell } from './shared/ColumnShell';
```

---

## 🚀 ADDING NEW FEATURES

### Checklist Before Implementation:

1. [ ] Search existing code - does this logic exist anywhere?
2. [ ] Identify correct location per architecture diagram
3. [ ] Check if action type exists in schema.ts (add if needed)
4. [ ] Check if service function exists (add if needed)
5. [ ] Verify handler registered in DispatchContext
6. [ ] Component ONLY dispatches actions (no direct logic)
7. [ ] Styles use CSS variables
8. [ ] Animations use shared configs from lib/animations.ts
9. [ ] No duplication with existing code

### Adding a New Toggle (Example):

```typescript
// 1. Check schema.ts - add if not present:
'case.toggle_rush': { id: string }

// 2. Check caseService.ts - toggleModifier() already handles this ✓

// 3. Check DispatchContext.tsx - add handler if needed:
registerHandler('case.toggle_rush', async ({ id }) => {
  await toggleModifier(id, 'rush', userName);
});

// 4. Component just dispatches:
<button onClick={() => dispatch('case.toggle_rush', { id })}>
  Toggle Rush
</button>
```

---

## 🔧 TECH STACK

- **Framework:** Next.js 15+ (App Router)
- **Language:** TypeScript (strict mode)
- **Database:** Supabase (PostgreSQL + Realtime)
- **Styling:** Tailwind CSS v4 + CSS Variables
- **Animation:** Framer Motion (shared configs)
- **State:** React Context + Realtime subscriptions

---

## 📊 DEVELOPMENT STATUS

### Core Infrastructure ✅
- [x] Action schema & dispatcher
- [x] Services layer (caseService, userService)
- [x] Contexts (Data, UI, User, Dispatch)
- [x] Supabase integration & realtime
- [x] CSS variables & design tokens
- [x] Shared animation configs

### UI Components (Efficiency-First Rebuild)
- [x] Board view
- [x] DayCol component
- [x] MetaCol component  
- [x] CaseRow component (THIN)
- [x] Header with dropdowns
- [x] CaseEditor form
- [x] CaseTable with collapsible sections
- [x] Filter inputs (department, search)
- [ ] Settings modal
- [ ] All History modal
- [ ] Delete confirmation modal

### Future
- [ ] LLM API endpoint
- [ ] Voice commands
- [ ] Statistics dashboard

---

## 📈 CODE REFACTORING STATISTICS

This section tracks how code has been transformed from the original app.

### RULES FOR CODE CHANGES:
```
┌─────────────────────────────────────────────────────────────────────────┐
│  Code Change Classification:                                            │
│                                                                         │
│  • REFACTORED: Logic understood, rebuilt in new architecture            │
│    - Same functionality, different implementation                       │
│    - Follows efficiency-first patterns                                  │
│    - Uses shared utilities, CSS variables, dispatch()                   │
│                                                                         │
│  • NEW: Original architecture code (services, contexts, types)          │
│    - Did not exist in original app                                      │
│    - Enables the efficiency-first architecture                          │
│                                                                         │
│  • PORTED: Directly copied/adapted with minimal changes                 │
│    - Same logic, same structure                                         │
│    - Only syntax changes (JSX → TSX, CSS classes)                       │
│                                                                         │
│  RULE: We DO NOT copy-paste. We understand and rebuild.                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### Current Statistics (as of last update):

| Category | Files | Lines | Description |
|----------|-------|-------|-------------|
| **REFACTORED** | 13 | ~2,600 | Components rebuilt with new architecture |
| **NEW** | 18 | ~3,100 | Architecture code (services, contexts, types) |
| **PORTED** | 2 | ~800 | CSS variables, animation configs |
| **TOTAL** | 41 | ~6,500 | Full application |

### Component Breakdown:

| Component | Original | Status | Notes |
|-----------|----------|--------|-------|
| Board.tsx | Board.jsx | REFACTORED | Uses shared helpers, dispatch() |
| CaseRow.tsx | Row.jsx | REFACTORED | Thin component, no business logic |
| DayCol.tsx | DayCol.jsx | REFACTORED | Uses ColumnShell, shared dividers |
| MetaCol.tsx | MetaCol.jsx | REFACTORED | Reuses DayCol components |
| Header.tsx | App.jsx header | REFACTORED | Same dropdowns, new architecture |
| CaseEditor.tsx | Editor.jsx | REFACTORED | Glass panel, dispatch pattern |
| CaseTable.tsx | CaseTable.jsx | REFACTORED | Collapsible sections, status dots |
| caseService.ts | caseService.js | REFACTORED | TypeScript, cleaner API |
| animations.ts | animationEngine.js | PORTED | Same configs, typed |
| globals.css | styles.css + glass.css | PORTED | Combined, CSS variables |

### Original vs New Architecture:

| Aspect | Original | New |
|--------|----------|-----|
| Components | 18 JSX files | 13 TSX files (consolidated) |
| Business Logic | Mixed in components | Centralized in services/ |
| State Mutations | Direct Supabase calls | dispatch() → handlers → services |
| Animations | Inline configs | Shared lib/animations.ts |
| Colors | Hardcoded | CSS variables |
| Types | None (JavaScript) | Full TypeScript |

### After Each Change:
Update this section with:
1. Files changed
2. Lines added/removed
3. Classification (REFACTORED/NEW/PORTED)
4. Brief description of change

---

## 📜 LICENSE

Private - All rights reserved
