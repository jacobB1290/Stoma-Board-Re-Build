/**
 * Action Dispatcher
 * Central hub for all application actions
 * Both UI and LLM route through this single entry point
 */

import type {
  ActionType,
  ActionPayloads,
  ActionResults,
  ActionHandler,
  ActionContext,
  DispatchResult,
  Action,
} from '@/types/actions';
import { ACTION_SCHEMA } from './schema';

// ═══════════════════════════════════════════════════════════
// DISPATCHER CLASS
// ═══════════════════════════════════════════════════════════

type Middleware = (action: Action, context: ActionContext) => Promise<{ blocked: boolean; reason?: string } | void>;
type Subscriber = (event: {
  type: ActionType;
  payload: unknown;
  result: unknown;
  success: boolean;
  error?: string;
  timestamp: number;
}) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (payload: any, context: ActionContext) => Promise<any>;

class ActionDispatcher {
  private handlers: Map<ActionType, AnyHandler> = new Map();
  private middleware: Middleware[] = [];
  private subscribers: Set<Subscriber> = new Set();
  private context: ActionContext | null = null;

  /**
   * Set the context that will be passed to handlers
   */
  setContext(ctx: ActionContext): void {
    this.context = ctx;
  }

  /**
   * Register a handler for an action type
   */
  register<T extends ActionType>(
    actionType: T,
    handler: ActionHandler<T>
  ): void {
    // Store handler with type assertion to avoid complex generic issues
    this.handlers.set(actionType, handler as AnyHandler);
  }

  /**
   * Add middleware (runs before every action)
   */
  use(middleware: Middleware): () => void {
    this.middleware.push(middleware);
    return () => {
      const index = this.middleware.indexOf(middleware);
      if (index > -1) this.middleware.splice(index, 1);
    };
  }

  /**
   * Subscribe to all dispatched actions
   */
  subscribe(callback: Subscriber): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Validate payload against schema
   */
  private validatePayload<T extends ActionType>(
    actionType: T,
    payload: ActionPayloads[T]
  ): { valid: boolean; error?: string } {
    const schema = ACTION_SCHEMA[actionType];
    if (!schema) {
      return { valid: false, error: `Unknown action type: ${actionType}` };
    }

    // Check required fields
    for (const [field, config] of Object.entries(schema.payload)) {
      if (config.required) {
        const value = (payload as Record<string, unknown>)[field];
        if (value === undefined || value === null) {
          return { valid: false, error: `Missing required field: ${field}` };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Dispatch an action
   */
  async dispatch<T extends ActionType>(
    action: Action<T>
  ): Promise<DispatchResult<T>> {
    const { type, payload } = action;
    const timestamp = Date.now();

    // 1. Validate action type exists
    if (!ACTION_SCHEMA[type]) {
      return { success: false, error: `Unknown action: ${type}` };
    }

    // 2. Validate payload
    const validation = this.validatePayload(type, payload);
    if (!validation.valid) {
      return { success: false, error: validation.error! };
    }

    // 3. Ensure context is set
    if (!this.context) {
      return { success: false, error: 'Dispatcher context not initialized' };
    }

    // 4. Run middleware
    for (const mw of this.middleware) {
      try {
        const result = await mw(action as Action, this.context);
        if (result?.blocked) {
          return { success: false, error: result.reason || 'Blocked by middleware' };
        }
      } catch (err) {
        console.error('Middleware error:', err);
      }
    }

    // 5. Get handler
    const handler = this.handlers.get(type);
    if (!handler) {
      return { success: false, error: `No handler registered for: ${type}` };
    }

    // 6. Execute handler
    try {
      const result = await handler(payload, this.context);
      
      // 7. Notify subscribers
      this.notifySubscribers({
        type,
        payload,
        result,
        success: true,
        timestamp,
      });

      return { success: true, data: result as ActionResults[T] };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      
      // Notify subscribers of failure
      this.notifySubscribers({
        type,
        payload,
        result: null,
        success: false,
        error: errorMessage,
        timestamp,
      });

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Dispatch multiple actions in sequence
   */
  async dispatchBatch(actions: Action[]): Promise<DispatchResult<ActionType>[]> {
    const results: DispatchResult<ActionType>[] = [];
    
    for (const action of actions) {
      const result = await this.dispatch(action);
      results.push(result);
      
      // Stop on first failure (optional - could make this configurable)
      if (!result.success) break;
    }
    
    return results;
  }

  /**
   * Check if a handler is registered for an action type
   */
  hasHandler(actionType: ActionType): boolean {
    return this.handlers.has(actionType);
  }

  /**
   * Get list of registered action types
   */
  getRegisteredActions(): ActionType[] {
    return Array.from(this.handlers.keys());
  }

  private notifySubscribers(event: Parameters<Subscriber>[0]): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(event);
      } catch (err) {
        console.error('Subscriber error:', err);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════

export const dispatcher = new ActionDispatcher();

// ═══════════════════════════════════════════════════════════
// CONVENIENCE FUNCTION
// ═══════════════════════════════════════════════════════════

/**
 * Type-safe dispatch function
 */
export function dispatch<T extends ActionType>(
  type: T,
  payload: ActionPayloads[T]
): Promise<DispatchResult<T>> {
  return dispatcher.dispatch({ type, payload });
}

// ═══════════════════════════════════════════════════════════
// LOGGING MIDDLEWARE (for debugging)
// ═══════════════════════════════════════════════════════════

export function createLoggingMiddleware(enabled = true): Middleware {
  return async (action) => {
    if (enabled) {
      console.log(`[Action] ${action.type}`, action.payload);
    }
    return undefined;
  };
}
