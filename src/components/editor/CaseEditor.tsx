'use client';

/**
 * CaseEditor Component
 * Glass-panel form for adding/editing cases
 * EXACT REPLICA of original Editor.jsx styling
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useData } from '@/contexts/DataContext';
import { useUI } from '@/contexts/UIContext';
import { useDispatch } from '@/contexts/DispatchContext';
import { checkForDuplicates } from '@/services/caseService';
import { DEPARTMENTS, CASE_TYPES } from '@/lib/constants';
import { toISODate, getToday, getDateFromToday } from '@/utils/dateUtils';
import { cn } from '@/lib/cn';
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
  const { addOrUpdate } = useData();
  const { activeDepartment } = useUI();
  const { dispatch } = useDispatch();

  // Refs
  const caseInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formData, setFormData] = useState<FormData>({
    caseNumber: '',
    department: (activeDepartment as Department) || 'Digital',
    due: '',
    priority: false,
    rush: false,
    hold: false,
    caseType: 'general',
    needsRepair: false,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);

  // Has user made changes to an edited case?
  const hasChanges = useMemo(() => {
    if (!editCase) return true;
    return (
      formData.caseNumber !== editCase.caseNumber ||
      formData.department !== (editCase.department === 'General' ? 'Digital' : editCase.department) ||
      formData.due !== editCase.due ||
      formData.priority !== editCase.priority ||
      formData.rush !== editCase.rush ||
      formData.hold !== editCase.hold ||
      formData.caseType !== (editCase.caseType || 'general')
    );
  }, [editCase, formData]);

  // Initialize form when editing
  useEffect(() => {
    if (editCase) {
      setFormData({
        caseNumber: editCase.caseNumber || '',
        department: (editCase.department === 'General' ? 'Digital' : editCase.department) as Department,
        due: editCase.due?.split('T')[0] || toISODate(getToday()),
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
      const caseToCheck = formData.caseNumber.split(' ')[0]; // Only check case number, not notes
      if (caseToCheck.trim().length >= 1) {
        const found = await checkForDuplicates(caseToCheck, editCase?.id);
        if (found.length > 0) {
          setDuplicates(found);
          setShowDuplicateWarning(true);
        } else {
          setDuplicates([]);
          setShowDuplicateWarning(false);
        }
      } else {
        setDuplicates([]);
        setShowDuplicateWarning(false);
      }
    };

    const debounce = setTimeout(doCheck, 500);
    return () => clearTimeout(debounce);
  }, [formData.caseNumber, editCase]);

  // Update form field
  const updateField = useCallback(<K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  }, []);

  // Reset form
  const reset = useCallback(() => {
    setFormData({
      caseNumber: '',
      department: (activeDepartment as Department) || 'Digital',
      due: '',
      priority: false,
      rush: false,
      hold: false,
      caseType: 'general',
      needsRepair: false,
    });
    setDuplicates([]);
    setShowDuplicateWarning(false);
    setError(null);
  }, [activeDepartment]);

  // Handle form submission
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.caseNumber.trim() || !formData.due) return;
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const dbDepartment = formData.department === 'Digital' ? 'General' : formData.department;

      if (editCase) {
        // Update existing case
        const updatePayload: UpdateCaseInput = {
          id: editCase.id,
          caseNumber: formData.caseNumber.trim(),
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
          caseNumber: formData.caseNumber.trim(),
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
          setLastSaved(formData.caseNumber);
          reset();
          setTimeout(() => setLastSaved(null), 2000);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, editCase, addOrUpdate, reset]);

  // Handle button click (Submit or Cancel)
  const handleButtonClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    
    if (editCase && !hasChanges) {
      // Cancel editing
      handleClose();
    } else {
      // Submit form
      handleSubmit(e as any);
    }
  }, [editCase, hasChanges, handleSubmit]);

  // Handle close
  const handleClose = useCallback(() => {
    reset();
    if (onClose) {
      onClose();
    } else {
      dispatch('ui.close_editor', {});
    }
  }, [onClose, dispatch, reset]);

  // Handle date input click
  const handleDateClick = useCallback(() => {
    dateInputRef.current?.showPicker?.();
  }, []);

  return (
    <div className="max-w-2xl mx-auto">
      {/* Main Form Card - Glass Panel Style */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel p-6"
      >
        {/* Form Content */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Row 1: Case Number & Due Date */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Case Number Input */}
            <div className={cn('relative', showDuplicateWarning && 'input-warning-border')}>
              <input
                ref={caseInputRef}
                type="text"
                placeholder="Case #"
                value={formData.caseNumber}
                onChange={(e) => updateField('caseNumber', e.target.value)}
                className="form-input"
                autoFocus
              />
              {showDuplicateWarning && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* Due Date Input */}
            <div className="relative cursor-pointer" onClick={handleDateClick}>
              <input
                ref={dateInputRef}
                type="date"
                value={formData.due}
                onChange={(e) => updateField('due', e.target.value)}
                className={cn('form-input date-input cursor-pointer', !formData.due && 'date-empty')}
              />
              {!formData.due && (
                <div className="pointer-events-none absolute inset-0 flex items-center px-3">
                  <span className="text-gray-400 text-sm">mm/dd/yyyy</span>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Department & Case Type */}
          <div className="space-y-4">
            <motion.div
              className="flex items-start gap-4"
              animate={{ gap: formData.department === 'Digital' ? '1rem' : '0rem' }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            >
              {/* Department Select */}
              <motion.div
                animate={{ width: formData.department === 'Digital' ? 'calc(50% - 0.5rem)' : '100%' }}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                className="flex-shrink-0"
              >
                <select
                  value={formData.department}
                  onChange={(e) => {
                    const dept = e.target.value as Department;
                    updateField('department', dept);
                    if (dept !== 'Digital') updateField('caseType', 'general');
                  }}
                  className="form-select"
                >
                  <option value="Digital">Digital</option>
                  <option value="C&B">C&B</option>
                  <option value="Metal">Metal</option>
                </select>
              </motion.div>

              {/* Case Type Select (Digital only) */}
              <AnimatePresence>
                {formData.department === 'Digital' && (
                  <motion.div
                    initial={{ width: '0%', opacity: 0, scale: 0.95 }}
                    animate={{ width: 'calc(50% - 0.5rem)', opacity: 1, scale: 1 }}
                    exit={{ width: '0%', opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                    className="flex-shrink-0"
                  >
                    <select
                      value={formData.caseType}
                      onChange={(e) => updateField('caseType', e.target.value as CaseType)}
                      className={cn(
                        'form-select',
                        formData.caseType === 'bbs' && 'select-purple',
                        formData.caseType === 'flex' && 'select-pink'
                      )}
                    >
                      <option value="general">General</option>
                      <option value="bbs">Base Plates / Bite Rims / Splints</option>
                      <option value="flex">3D Flex</option>
                    </select>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>

          {/* Row 3: Toggle Buttons */}
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => updateField('priority', !formData.priority)}
              className={cn(
                'toggle-button',
                formData.priority
                  ? 'toggle-active toggle-glow-red'
                  : 'toggle-inactive text-red-600'
              )}
            >
              Priority {formData.priority ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              onClick={() => updateField('rush', !formData.rush)}
              className={cn(
                'toggle-button',
                formData.rush
                  ? 'toggle-active toggle-glow-orange'
                  : 'toggle-inactive text-orange-600'
              )}
            >
              Rush {formData.rush ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              onClick={() => updateField('hold', !formData.hold)}
              className={cn(
                'toggle-button',
                formData.hold
                  ? 'toggle-active toggle-glow-amber'
                  : 'toggle-inactive text-amber-600'
              )}
            >
              Hold {formData.hold ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Submit Button */}
          <button
            type="button"
            onClick={handleButtonClick}
            disabled={(!formData.caseNumber.trim() || !formData.due) && (!editCase || hasChanges)}
            className={cn(
              'primary-button w-full relative overflow-hidden',
              isSubmitting && 'animate-pulse cursor-not-allowed opacity-75',
              editCase && !hasChanges && 'cancel-button'
            )}
          >
            {isSubmitting
              ? 'Saving...'
              : editCase
                ? hasChanges
                  ? 'Update Case'
                  : 'Cancel'
                : 'Save Case'
            }
          </button>
        </form>

        {/* Success Message */}
        <AnimatePresence>
          {lastSaved && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-4 px-4 py-3 bg-green-100 border border-green-300 rounded-lg text-green-700 text-sm text-center"
            >
              Case <span className="font-semibold">{lastSaved}</span> saved successfully!
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-4 px-4 py-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm text-center"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>

      {/* Duplicate Warning Notification */}
      <AnimatePresence>
        {showDuplicateWarning && duplicates.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="glass-notification fixed top-20 right-4 w-96 p-4 rounded-xl shadow-xl z-50"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-gray-900">Possible Duplicate</h4>
                <p className="mt-1 text-sm text-gray-600">
                  Case number may already exist:
                </p>
                <ul className="mt-2 space-y-1">
                  {duplicates.slice(0, 3).map((dup) => (
                    <li key={dup.id} className="text-sm text-gray-700">
                      <span className="font-medium">{dup.caseNumber}</span>
                      <span className="text-gray-500"> - Due: {dup.due?.split('T')[0]}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => setShowDuplicateWarning(false)}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info Rows */}
      <div className="mx-auto mt-6 grid max-w-2xl grid-cols-1 sm:grid-cols-3 gap-3">
        <InfoRow
          type="priority"
          title="Priority"
          desc="Patient appointment today"
        />
        <InfoRow
          type="rush"
          title="Rush"
          desc="Patient appointment tomorrow"
        />
        <InfoRow
          type="standard"
          title="Standard"
          desc="Flexible timeline"
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// INFO ROW COMPONENT (from original)
// ═══════════════════════════════════════════════════════════

function InfoRow({ type, title, desc }: { type: 'priority' | 'rush' | 'standard'; title: string; desc: string }) {
  const typeStyles = {
    priority: 'ring-2 ring-red-500/30 bg-red-500/15',
    rush: 'ring-2 ring-orange-500/30 bg-orange-500/15',
    standard: 'ring-2 ring-teal-600/30 bg-teal-600/15',
  };
  
  const iconColors = {
    priority: 'bg-red-500',
    rush: 'bg-orange-500',
    standard: 'bg-teal-600',
  };

  return (
    <motion.div
      className={cn(
        'flex items-start space-x-3 p-4 rounded-xl text-white font-sans text-base h-full glass-card-dark',
        typeStyles[type]
      )}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
    >
      {type !== 'standard' && (
        <span className={cn('h-12 w-1 rounded-full', iconColors[type])} />
      )}
      <div>
        <div className="font-medium text-gray-100">{title}</div>
        <div className="text-sm text-gray-300 mt-0.5">{desc}</div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// CANCEL BUTTON STYLES (add to globals.css later if needed)
// ═══════════════════════════════════════════════════════════

// .cancel-button styling is defined in globals.css
