'use client';

/**
 * CaseEditor Component
 * Add/Edit case form with duplicate detection
 * Matches original Manage Cases view
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useData } from '@/contexts/DataContext';
import { useUI } from '@/contexts/UIContext';
import { useDispatch } from '@/contexts/DispatchContext';
import { checkForDuplicates } from '@/services/caseService';
import { DEPARTMENTS, CASE_TYPES } from '@/lib/constants';
import { toISODate, getToday, getDateFromToday } from '@/utils/dateUtils';
import type { Case, CreateCaseInput, UpdateCaseInput, Department, CaseType } from '@/types/case';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface CaseEditorProps {
  editCase?: Case | null;
  onClose?: () => void;
}

interface FormData {
  caseNumber: string;
  department: Department;
  due: string;
  priority: boolean;
  rush: boolean;
  hold: boolean;
  caseType: CaseType;
  needsRepair: boolean;
}

// ═══════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════

export function CaseEditor({ editCase, onClose }: CaseEditorProps) {
  const { addOrUpdate, allRows } = useData();
  const { activeDepartment } = useUI();
  const { dispatch } = useDispatch();

  // Form state
  const [formData, setFormData] = useState<FormData>({
    caseNumber: '',
    department: (activeDepartment as Department) || 'Digital',
    due: toISODate(getDateFromToday(1)), // Default to tomorrow
    priority: false,
    rush: false,
    hold: false,
    caseType: 'general',
    needsRepair: false,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Initialize form when editing
  useEffect(() => {
    if (editCase) {
      setFormData({
        caseNumber: editCase.caseNumber || '',
        department: (editCase.department === 'General' ? 'Digital' : editCase.department) as Department,
        due: editCase.due || toISODate(getToday()),
        priority: editCase.priority || false,
        rush: editCase.rush || false,
        hold: editCase.hold || false,
        caseType: editCase.caseType || 'general',
        needsRepair: false,
      });
    }
  }, [editCase]);

  // Check for duplicates when case number changes
  useEffect(() => {
    const doCheck = async () => {
      if (formData.caseNumber.length >= 3) {
        const duplicates = await checkForDuplicates(
          formData.caseNumber, 
          editCase?.id
        );
        
        if (duplicates.length > 0) {
          const dup = duplicates[0];
          setDuplicateWarning(`Case ${formData.caseNumber} already exists (due: ${dup.due})`);
        } else {
          setDuplicateWarning(null);
        }
      } else {
        setDuplicateWarning(null);
      }
    };

    const debounce = setTimeout(doCheck, 300);
    return () => clearTimeout(debounce);
  }, [formData.caseNumber, editCase]);

  // Update form field
  const updateField = useCallback(<K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  }, []);

  // Handle form submission
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.caseNumber.trim()) {
      setError('Case number is required');
      return;
    }

    if (!formData.due) {
      setError('Due date is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Convert department for DB (Digital → General)
      const dbDepartment = formData.department === 'Digital' ? 'General' : formData.department;

      if (editCase) {
        // Update existing case
        const updatePayload: UpdateCaseInput = {
          id: editCase.id,
          caseNumber: formData.caseNumber.trim().toUpperCase(),
          department: dbDepartment as Department,
          due: formData.due,
          priority: formData.priority,
          rush: formData.rush,
          hold: formData.hold,
          caseType: formData.caseType,
        };

        const result = await addOrUpdate(updatePayload, editCase.id);
        
        if (result.error) {
          setError(result.error.message);
        } else {
          handleClose();
        }
      } else {
        // Create new case
        const createPayload: CreateCaseInput = {
          caseNumber: formData.caseNumber.trim().toUpperCase(),
          department: dbDepartment as Department,
          due: formData.due,
          priority: formData.priority,
          rush: formData.rush,
          hold: formData.hold,
          caseType: formData.caseType,
          needsRepair: formData.needsRepair,
        };

        const result = await addOrUpdate(createPayload);
        
        if (result.error) {
          setError(result.error.message);
        } else {
          // Clear form for next entry
          setFormData({
            caseNumber: '',
            department: formData.department,
            due: toISODate(getDateFromToday(1)),
            priority: false,
            rush: false,
            hold: false,
            caseType: 'general',
            needsRepair: false,
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, editCase, addOrUpdate]);

  // Handle close
  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      dispatch('ui.close_editor', {});
    }
  }, [onClose, dispatch]);

  // Quick date buttons
  const quickDates = useMemo(() => [
    { label: 'Today', date: toISODate(getToday()) },
    { label: 'Tomorrow', date: toISODate(getDateFromToday(1)) },
    { label: '+2 Days', date: toISODate(getDateFromToday(2)) },
    { label: '+3 Days', date: toISODate(getDateFromToday(3)) },
    { label: '+1 Week', date: toISODate(getDateFromToday(7)) },
  ], []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="p-6 rounded-2xl"
      style={{ background: 'var(--color-bg-card)' }}
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">
          {editCase ? 'Edit Case' : 'Add New Case'}
        </h2>
        {editCase && (
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Case Number */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Case Number
          </label>
          <input
            type="text"
            value={formData.caseNumber}
            onChange={(e) => updateField('caseNumber', e.target.value.toUpperCase())}
            placeholder="Enter case number"
            className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 
                     text-white placeholder-gray-500 focus:border-teal-500 focus:ring-1 
                     focus:ring-teal-500 outline-none transition-colors font-mono"
            autoFocus
          />
          
          {/* Duplicate Warning */}
          <AnimatePresence>
            {duplicateWarning && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 px-3 py-2 bg-yellow-500/20 border border-yellow-500/40 
                         rounded-lg text-yellow-300 text-sm"
              >
                ⚠️ {duplicateWarning}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Department */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Department
          </label>
          <div className="flex gap-2">
            {DEPARTMENTS.map((dept) => (
              <button
                key={dept}
                type="button"
                onClick={() => updateField('department', dept as Department)}
                className={`
                  flex-1 px-4 py-2 rounded-lg font-medium transition-colors text-sm
                  ${formData.department === dept
                    ? getDeptActiveClass(dept)
                    : 'bg-white/10 text-gray-400 hover:bg-white/20'
                  }
                `}
              >
                {dept}
              </button>
            ))}
          </div>
        </div>

        {/* Due Date */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Due Date
          </label>
          <input
            type="date"
            value={formData.due}
            onChange={(e) => updateField('due', e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 
                     text-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 
                     outline-none transition-colors"
          />
          
          {/* Quick Date Buttons */}
          <div className="flex gap-2 mt-2 flex-wrap">
            {quickDates.map(({ label, date }) => (
              <button
                key={label}
                type="button"
                onClick={() => updateField('due', date)}
                className={`
                  px-3 py-1 rounded text-xs font-medium transition-colors
                  ${formData.due === date
                    ? 'bg-teal-500 text-white'
                    : 'bg-white/10 text-gray-400 hover:bg-white/20'
                  }
                `}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Case Type (Digital only) */}
        {(formData.department === 'Digital' || formData.department === 'General') && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Case Type
            </label>
            <div className="flex gap-2">
              {CASE_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => updateField('caseType', type as CaseType)}
                  className={`
                    flex-1 px-4 py-2 rounded-lg font-medium transition-colors text-sm uppercase
                    ${formData.caseType === type
                      ? 'bg-teal-500 text-white'
                      : 'bg-white/10 text-gray-400 hover:bg-white/20'
                    }
                  `}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Flags */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Status Flags
          </label>
          <div className="flex gap-3 flex-wrap">
            <FlagToggle
              label="Priority"
              icon="★"
              active={formData.priority}
              color="yellow"
              onClick={() => updateField('priority', !formData.priority)}
            />
            <FlagToggle
              label="Rush"
              icon="⚡"
              active={formData.rush}
              color="red"
              onClick={() => updateField('rush', !formData.rush)}
            />
            <FlagToggle
              label="On Hold"
              icon="⏸"
              active={formData.hold}
              color="orange"
              onClick={() => updateField('hold', !formData.hold)}
            />
            {!editCase && formData.department === 'Digital' && (
              <FlagToggle
                label="Repair"
                icon="🔧"
                active={formData.needsRepair}
                color="purple"
                onClick={() => updateField('needsRepair', !formData.needsRepair)}
              />
            )}
          </div>
        </div>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4 py-3 bg-red-500/20 border border-red-500/40 
                       rounded-lg text-red-300 text-sm"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className={`
            w-full py-3 rounded-lg font-semibold text-white transition-all
            ${isSubmitting
              ? 'bg-gray-500 cursor-not-allowed'
              : 'bg-teal-500 hover:bg-teal-400 active:scale-[0.98]'
            }
          `}
        >
          {isSubmitting 
            ? 'Saving...' 
            : editCase 
              ? 'Update Case' 
              : 'Add Case'
          }
        </button>
      </form>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════

function FlagToggle({
  label,
  icon,
  active,
  color,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  color: 'yellow' | 'red' | 'orange' | 'purple';
  onClick: () => void;
}) {
  const colorClasses = {
    yellow: active ? 'bg-yellow-500/30 text-yellow-300 border-yellow-500/50' : '',
    red: active ? 'bg-red-500/30 text-red-300 border-red-500/50' : '',
    orange: active ? 'bg-orange-500/30 text-orange-300 border-orange-500/50' : '',
    purple: active ? 'bg-purple-500/30 text-purple-300 border-purple-500/50' : '',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        px-3 py-2 rounded-lg font-medium transition-all text-sm
        border flex items-center gap-2
        ${active
          ? colorClasses[color]
          : 'bg-white/10 text-gray-400 hover:bg-white/20 border-white/20'
        }
      `}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function getDeptActiveClass(dept: string): string {
  switch (dept) {
    case 'Digital':
      return 'bg-teal-500 text-white';
    case 'Metal':
      return 'bg-purple-500 text-white';
    case 'C&B':
      return 'bg-orange-500 text-white';
    default:
      return 'bg-teal-500 text-white';
  }
}
