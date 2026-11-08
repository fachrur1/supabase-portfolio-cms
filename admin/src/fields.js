// admin/src/fields.js - pure helpers for form controls.
//
// Kept dependency-free on purpose: the select wiring is unit-testable in Node
// without pulling in supabase-js or the DOM.

/**
 * Resolve the choice list for a `select` field.
 *
 * Fields either declare static `options` ([{ value, label }]) or point at the
 * `content_categories` table via `optionsFromCategories: '<kind>'`. The latter
 * are hydrated from the rows loaded by `listCategories(kind)` - dropping that
 * hand-off left every category dropdown showing only “- None -”.
 *
 * @param {object} field schema field definition
 * @param {Array<{id:string,name?:string,slug?:string}>} [categories] rows for this kind
 * @returns {Array<{value:string,label:string}>}
 */
export function selectChoices(field, categories) {
  if (field && field.optionsFromCategories) {
    const rows = Array.isArray(categories) ? categories : [];
    return rows
      .filter((row) => row && row.id)
      .map((row) => ({
        value: String(row.id),
        label: String(row.name || row.slug || row.id),
      }));
  }
  const options = (field && Array.isArray(field.options)) ? field.options : [];
  return options.map((opt) => ({
    value: String(opt.value),
    label: String(opt.label ?? opt.value),
  }));
}

/**
 * True when a value must be preserved even though it is absent from the choice
 * list (categories still loading, or the row was filtered out). Keeping it as a
 * placeholder option prevents an edit from silently clearing the column.
 */
export function needsPlaceholderOption(field, value, choices) {
  if (value === null || value === undefined || value === '') return false;
  if (!field || !field.optionsFromCategories) return Boolean(field && field.required);
  return !choices.some((choice) => choice.value === String(value));
}
