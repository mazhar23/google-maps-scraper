/**
 * Simple template renderer for HTML email templates.
 * Supports:
 *   - <%= key %>        → value replacement
 *   - {{#each array}}   → loop start
 *   - {{/each}}         → loop end
 *   - {{> partial}}     → not implemented (future)
 */

export function renderTemplate(template, data) {
  let html = template;

  // Handle loops first: {{#each arrayKey}}...{{/each}}
  const eachRegex = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
  html = html.replace(eachRegex, (match, key, block) => {
    const arr = data[key];
    if (!Array.isArray(arr)) return '';
    return arr.map(item => {
      let itemBlock = block;
      // Replace {{this}} with the item value
      itemBlock = itemBlock.replace(/\{\{this\}\}/g, String(item));
      // Replace simple {{property}} with item property
      itemBlock = itemBlock.replace(/\{\{(\w+)\}\}/g, (_, propKey) => {
        if (typeof item === 'object' && item[propKey] !== undefined) {
          return String(item[propKey]);
        }
        return '';
      });
      return itemBlock;
    }).join('');
  });

  // Handle simple <%= key %> replacements
  const varRegex = /<%=\s*(\w+)\s*%>/g;
  html = html.replace(varRegex, (match, key) => {
    if (data[key] !== undefined) return String(data[key]);
    return '';
  });

  // Handle <% if/else/endif %> blocks (simple truthy check)
  const ifRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  html = html.replace(ifRegex, (match, key, block) => {
    return data[key] ? block : '';
  });

  return html;
}
