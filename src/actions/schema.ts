/**
 * Action Schema
 * Defines all available actions, their payloads, and documentation
 * This serves as the single source of truth for what the system can do
 */

import type { ActionSchema } from '@/types/actions';

export const ACTION_SCHEMA: ActionSchema = {
  // ═══════════════════════════════════════════════════════════
  // CASE MUTATIONS
  // ═══════════════════════════════════════════════════════════
  
  'case.create': {
    description: 'Create a new dental case',
    payload: {
      caseNumber: { type: 'string', required: true, description: 'Case ID/number' },
      department: { type: 'enum', values: ['Digital', 'Metal', 'C&B', 'General'] as const, required: true },
      due: { type: 'date', required: true, description: 'Due date in YYYY-MM-DD format' },
      priority: { type: 'boolean', default: false },
      rush: { type: 'boolean', default: false },
      hold: { type: 'boolean', default: false },
      caseType: { type: 'enum', values: ['general', 'bbs', 'flex'] as const, default: 'general' },
      needsRepair: { type: 'boolean', default: false, description: 'If true, Digital cases start in Finishing' },
    },
    examples: [
      { caseNumber: '1234', department: 'Digital', due: '2025-12-15' },
      { caseNumber: '5678 Crown prep', department: 'Metal', due: '2025-12-18', rush: true },
    ],
    returns: 'Case',
  },

  'case.update': {
    description: 'Update an existing case',
    payload: {
      id: { type: 'uuid', required: true },
      caseNumber: { type: 'string' },
      department: { type: 'enum', values: ['Digital', 'Metal', 'C&B', 'General'] as const },
      due: { type: 'date', description: 'Due date in YYYY-MM-DD format' },
      priority: { type: 'boolean' },
      rush: { type: 'boolean' },
      hold: { type: 'boolean' },
      caseType: { type: 'enum', values: ['general', 'bbs', 'flex'] as const },
    },
    returns: 'Case',
  },

  'case.delete': {
    description: 'Permanently delete a case',
    payload: {
      id: { type: 'uuid', required: true },
    },
  },

  'case.toggle_priority': {
    description: 'Toggle the priority flag on a case',
    payload: {
      id: { type: 'uuid', required: true },
    },
  },

  'case.toggle_rush': {
    description: 'Toggle the rush flag on a case (urgent processing)',
    payload: {
      id: { type: 'uuid', required: true },
    },
  },

  'case.toggle_hold': {
    description: 'Toggle the hold flag on a case (pauses processing)',
    payload: {
      id: { type: 'uuid', required: true },
    },
  },

  'case.toggle_complete': {
    description: 'Mark a case as completed or undo completion',
    payload: {
      id: { type: 'uuid', required: true },
    },
  },

  'case.toggle_stage2': {
    description: 'Move case to Stage 2 or back to Stage 1',
    payload: {
      id: { type: 'uuid', required: true },
    },
  },

  'case.change_stage': {
    description: 'Move a case to a different production stage',
    payload: {
      id: { type: 'uuid', required: true },
      stage: { type: 'enum', values: ['design', 'production', 'finishing', 'qc'] as const, required: true },
      isRepair: { type: 'boolean', default: false },
    },
  },

  'case.archive': {
    description: 'Archive one or more completed cases',
    payload: {
      ids: { type: 'array', required: true, description: 'Array of case UUIDs' },
    },
  },

  'case.restore': {
    description: 'Restore a case from archive',
    payload: {
      id: { type: 'uuid', required: true },
    },
  },

  'case.toggle_stats_exclusion': {
    description: 'Exclude or include a case from statistics calculations',
    payload: {
      id: { type: 'uuid', required: true },
      stage: { type: 'string', description: 'Specific stage to exclude from, or null for all' },
      reason: { type: 'string', description: 'Reason for exclusion' },
    },
    returns: '{ isExcluded: boolean }',
  },

  'case.batch_toggle_exclusions': {
    description: 'Batch exclude/include multiple cases from statistics',
    payload: {
      ids: { type: 'array', required: true },
      exclude: { type: 'boolean', required: true },
      stage: { type: 'string' },
      reason: { type: 'string' },
    },
    returns: '{ caseId: string; success: boolean }[]',
  },

  // ═══════════════════════════════════════════════════════════
  // USER ACTIONS
  // ═══════════════════════════════════════════════════════════

  'user.set_name': {
    description: 'Set the current user name',
    payload: {
      name: { type: 'string', required: true },
    },
  },

  'user.switch': {
    description: 'Switch to a different user (logs out current)',
    payload: {},
  },

  // ═══════════════════════════════════════════════════════════
  // UI ACTIONS
  // ═══════════════════════════════════════════════════════════

  'ui.set_department': {
    description: 'Filter view to show only a specific department (or null for all)',
    payload: {
      department: { type: 'enum', values: ['Digital', 'Metal', 'C&B', 'General', 'all'] as const, required: true, description: 'Use "all" for no filter' },
    },
  },

  'ui.set_theme': {
    description: 'Change the application color theme',
    payload: {
      theme: { type: 'enum', values: ['light', 'dark', 'system'] as const, required: true },
    },
  },

  'ui.open_editor': {
    description: 'Open the case editor with a specific case loaded',
    payload: {
      id: { type: 'uuid', description: 'Case ID to edit, or omit for new case' },
    },
  },

  'ui.close_editor': {
    description: 'Close the case editor panel',
    payload: {},
  },

  'ui.open_settings': {
    description: 'Open the settings modal',
    payload: {
      tab: { type: 'enum', values: ['user', 'display', 'system'] as const, default: 'user' },
    },
  },

  'ui.navigate': {
    description: 'Navigate to a different view',
    payload: {
      view: { type: 'enum', values: ['board', 'manage', 'history', 'archive'] as const, required: true },
    },
  },

  // ═══════════════════════════════════════════════════════════
  // QUERY ACTIONS
  // ═══════════════════════════════════════════════════════════

  'query.get_case': {
    description: 'Get details of a specific case',
    payload: {
      id: { type: 'uuid', required: true },
    },
    returns: 'Case | null',
  },

  'query.search_cases': {
    description: 'Search for cases matching criteria',
    payload: {
      caseNumber: { type: 'string', description: 'Partial case number to search' },
      department: { type: 'string' },
      status: { type: 'enum', values: ['active', 'completed', 'archived', 'overdue', 'on_hold'] as const },
    },
    returns: 'Case[]',
  },

  'query.get_overdue': {
    description: 'Get all overdue cases',
    payload: {
      department: { type: 'string', description: 'Optional department filter' },
    },
    returns: 'Case[]',
  },

  'query.get_on_hold': {
    description: 'Get all cases currently on hold',
    payload: {
      department: { type: 'string' },
    },
    returns: 'Case[]',
  },

  'query.get_cases_by_date': {
    description: 'Get all cases due on a specific date',
    payload: {
      date: { type: 'date', required: true, description: 'Date in YYYY-MM-DD format' },
      department: { type: 'string' },
    },
    returns: 'Case[]',
  },

  'query.check_duplicates': {
    description: 'Check if a case number already exists',
    payload: {
      caseNumber: { type: 'string', required: true },
      excludeId: { type: 'uuid', description: 'Exclude this case from results (for editing)' },
    },
    returns: 'Case[]',
  },

  'query.get_history': {
    description: 'Get action history for a case or all cases',
    payload: {
      caseId: { type: 'uuid', description: 'Specific case, or omit for all history' },
      limit: { type: 'number', default: 50 },
    },
    returns: 'HistoryEntry[]',
  },

  'query.get_active_users': {
    description: 'Get list of currently active users',
    payload: {},
    returns: 'User[]',
  },

  // ═══════════════════════════════════════════════════════════
  // DATA ACTIONS
  // ═══════════════════════════════════════════════════════════

  'data.refresh': {
    description: 'Force refresh all case data from database',
    payload: {},
  },
};

/**
 * Generate a system prompt for the LLM describing available actions
 */
export function generateLLMSystemPrompt(): string {
  const actionDocs = Object.entries(ACTION_SCHEMA)
    .map(([type, schema]) => {
      const payloadDoc = Object.entries(schema.payload)
        .map(([key, config]) => {
          let line = `    ${key}: ${config.type}`;
          if (config.required) line += ' (required)';
          if (config.default !== undefined) line += ` (default: ${config.default})`;
          if (config.description) line += ` - ${config.description}`;
          if (config.values) line += ` [${config.values.join(', ')}]`;
          return line;
        })
        .join('\n');

      return `
### ${type}
${schema.description}
${schema.returns ? `Returns: ${schema.returns}` : ''}

Payload:
${payloadDoc || '    (none)'}
${schema.examples ? `\nExamples:\n${schema.examples.map(ex => `    ${JSON.stringify(ex)}`).join('\n')}` : ''}`;
    })
    .join('\n');

  return `You are an AI assistant for a Dental Lab case management system called Stoma Board.

You can execute actions by returning JSON in this format:
{
  "actions": [
    { "type": "action.type", "payload": { ... } }
  ]
}

## Available Actions:
${actionDocs}

When the user asks you to do something, determine which action(s) to execute and return the JSON.
You can execute multiple actions in sequence by including them in the actions array.`;
}
