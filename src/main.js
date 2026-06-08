export async function setupAnnotationEngine() {
  let engine = null;

  async function parseCode(rawCode) {
  const lines = rawCode.split('\n');
  return lines.map((line, idx) => {
    const trimmed = line.trim();
    const text = line || '';
    let type = 'expression';
    let summary = 'Executes an operation or evaluates a value.';
    let note = 'Ungrouped statement.';
    let purpose = 'Executes an operation or evaluates a value.';

if (!trimmed) {
  type = 'blank';
  summary = 'Empty line';
  note = 'Whitespace or spacing.';
  purpose = 'Spacing or whitespace.';
} else if (/^@\w+/.test(trimmed)) {
  type = 'decorator';
  summary = `Decorator: @${trimmed.split(/\s+/)[0].slice(1)}`;
  note = 'Modifies a function or class on the next line.';
  purpose = 'Changes behavior for the next definition.';
} else if (/^import\s/.test(trimmed)) {
  type = 'import';
  summary = `Import: ${trimmed}`;
  note = 'Brings a module into the current namespace.';
  purpose = 'Makes a module available for use here.';
} else if (/^from\s/.test(trimmed)) {
  type = 'import';
  summary = `From import: ${trimmed}`;
  note = 'Imports specific names from the given module.';
  purpose = 'Imports selected names from the specified module.';
} else if (/^def\s/.test(trimmed)) {
  type = 'function';
  summary = `Define function: ${trimmed.split('(')[0]}`;
  note = 'Defines a callable function block.';
  purpose = 'Creates a reusable function.';
} else if (/^class\s/.test(trimmed)) {
  type = 'class';
  summary = `Define class: ${trimmed.split('(')[0] || trimmed.split('{')[0]}`;
  note = 'Defines a class blueprint.';
  purpose = 'Defines a new class template.';
} else if (/^(return|raise|yield|assert|pass|break|continue|global|nonlocal)\b/.test(trimmed)) {
  type = 'control';
  summary = `Control: ${trimmed.split('(')[0].trim()}`;
  note = 'Control-flow or keyword statement.';
  purpose = 'Alters execution flow or control state.';
} else if (/^(if|elif|else|while|for|in|with|try|except|finally|async|await)\b/.test(trimmed)) {
  type = 'control';
  summary = `Control: ${trimmed.split('(')[0].trim()}`;
  note = 'Flow control or block starter.';
  purpose = 'Changes or scopes program flow.';
} else if (/^#/.test(trimmed)) {
  type = 'comment';
  summary = 'Comment';
  note = trimmed;
  purpose = 'Explains intent or documents behavior.';
} else if (/=\s*[^=]/.test(trimmed)) {
  type = 'assignment';
  summary = `Assignment`;
  note = 'Assigns a value to a target.';
  purpose = 'Assigns a value to a target.';
} else if (/print\s*\(/.test(trimmed)) {
  type = 'io';
  summary = `print(...)`;
  note = 'Outputs text or repr to stdout.';
  purpose = 'Outputs text or repr to stdout.';
} else if (/^(open|input|eval|exec|compile)\s*\(/.test(trimmed)) {
  type = 'io';
  summary = `${trimmed.split('(')[0]}(...)`;
  note = 'External I/O or dynamic evaluation.';
  purpose = 'Interacts with files or dynamic evaluation.';
} else if (/^\w[\w.`]*\(/.test(trimmed)) {
  const name = trimmed.split('(')[0].trim();
  type = 'call';
  summary = `Call: ${name}(...)`;
  note = 'Invokes a function or method.';
  purpose = 'Invokes a function or method.';
}

const classification = { type, summary, note, purpose, index: idx + 1 };
return classification;
});
}

  async function generateSummary(raw) {
if (!engine) {
  return null;
}
const summary = engine.translate(raw, { max_new_tokens: 120, temperature: 0.2 });
return summary;
}

  return {
    parseCode,
    generateSummary,
getEngine: () => engine,
    setEngine: (value) => {
      engine = value;
    }
  };
}
