let editor = null;
const output = document.getElementById('code-output');
const annotateBtn = document.getElementById('annotate-btn');
const clearBtn = document.getElementById('clear-btn');
const copyBtn = document.getElementById('copy-btn');
const deepToggle = document.getElementById('deep-toggle');

async function init() {
  const { CodeMirror } = await import('https://cdn.jsdelivr.net/npm/codemirror@6/+esm');
  const { EditorState } = await import('https://cdn.jsdelivr.net/npm/@codemirror/state@6/+esm');
  const { EditorView, keymap } = await import('https://cdn.jsdelivr.net/npm/@codemirror/view@6/+esm');
  const { defaultKeymap, indentWithTab } = await import('https://cdn.jsdelivr.net/npm/@codemirror/commands@6/+esm');
  const { bracketMatching } = await import('https://cdn.jsdelivr.net/npm/@codemirror/language@6/+esm');
  const { python } = await import('https://cdn.jsdelivr.net/npm/@codemirror/lang-python@6/+esm');

  editor = new EditorView({
    state: EditorState.create({
      doc: document.getElementById('code-input').value,
      extensions: [
        python(),
        keymap.of([defaultKeymap, indentWithTab]),
        bracketMatching(),
        EditorView.lineWrapping
      ]
    }),
    parent: document.getElementById('code-input').closest('.panel')
  });

  document.getElementById('code-input').style.display = 'none';
  document.getElementById('code-input').closest('.panel').appendChild(editor.dom);
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function highlightPython(code) {
  let escaped = escapeHtml(code);

  const keywords = /\b(def|class|return|if|elif|else|while|for|try|except|finally|with|as|import|from|pass|break|continue|raise|and|or|not|in|is|lambda|yield|async|await|global|nonlocal)\b/g;
  const builtins = /\b(print|len|range|int|str|float|list|dict|set|tuple|bool|open|input|type|isinstance|enumerate|zip|map|filter|sorted|sum|abs|min|max|round|help|super|property|staticmethod|classmethod|__name__|self|cls)\b/g;
  const strings = /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
  const numbers = /\b(\d+\.?\d*(?:[eE][+-]?\d+)?|0x[0-9a-fA-F]+|0b[01]+)\b/g;
  const comments = /(#.*$)/gm;
  const functions = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g;
  const decorators = /(@\w+)/g;

  escaped = escaped
    .replace(decorators, '<span class="token-keyword">$1</span>')
    .replace(strings, '<span class="token-string">$&</span>')
    .replace(comments, '<span class="token-comment">$1</span>')
    .replace(keywords, '<span class="token-keyword">$1</span>')
    .replace(builtins, '<span class="token-builtin">$1</span>')
    .replace(numbers, '<span class="token-number">$1</span>')
    .replace(functions, '<span class="token-function">$1</span>');

  return escaped;
}

function classify(line, idx) {
  const trimmed = line.trim();
  const full = line.slice(0);

  if (!trimmed) return { tag: 'blank', label: 'Blank', detail: 'Empty line used for spacing.', purpose: 'Separation or whitespace.' };

  let parser = null;

  if (/^@\w+/.test(trimmed)) parser = decoratorLine(trimmed, full);
  else if (/^(import|from)\s/.test(trimmed)) parser = importLine(trimmed, full);
  else if (/^class\s/.test(trimmed)) parser = classLine(trimmed, full);
  else if (/^(async\s+)?def\s/.test(trimmed)) parser = defLine(trimmed, full);
  else if (/^(async\s+)?(with|for|while|if|elif|else|try|except|finally)\s/.test(trimmed)) parser = blockLine(trimmed, full);
  else if (/^(return|raise|yield|break|continue|pass)\b/.test(trimmed)) parser = controlLine(trimmed, full);
  else if (trimmed.startsWith('#')) parser = commentLine(trimmed, full);
  else if (/^\w[\w\s]*?=/.test(trimmed) || /^(?:\w[\w\s]*?,?\s*)+=/.test(trimmed)) parser = assignmentLine(trimmed, full);
  else if (/[+\-*/%]=/.test(trimmed) || /^(?:\w[\w\s]*?)\s*(\+\+|--)/.test(trimmed)) parser = opAssignLine(trimmed, full);
  else if (/print\s*\(/.test(trimmed) || /\.print\s*\(/.test(trimmed)) parser = printLine(trimmed, full);
  else if (/open\s*\(/.test(trimmed) || /eval\s*\(/.test(trimmed) || /exec\s*\(/.test(trimmed)) parser = ioLine(trimmed, full);
  else if (/^\w[\w\.]*\(/.test(trimmed)) parser = callLine(trimmed, full);

  if (!parser) {
    parser = {
      tag: 'expression',
      label: 'Expression',
      detail: 'A standalone expression or statement.',
      purpose: 'Executes an operation or evaluates a value.'
    };
  }

  return parser;
}

function decoratorLine(trimmed, full) {
  const name = trimmed.split(/\s+/)[0].replace('@', '');
  return {
    tag: 'decorator',
    label: `Decorator @${name}`,
    detail: 'Applies a wrapper to the next function or class definition.',
    purpose: `@${name} modifies the behavior of the function/class on the next line.`
  };
}

function importLine(trimmed, full) {
  const isFrom = trimmed.startsWith('from ');
  if (isFrom) {
    const match = trimmed.match(/^from\s+([\w.]+)\s+import\s+(.+)$/);
    if (match) {
      return {
        tag: 'import',
        label: `from ${match[1]} import ${match[2].split(',').map(s => s.trim()).join(', ')}`,
        detail: `Imports ${match[2].trim()} from module ${match[1]}.`,
        purpose: `Makes ${match[2].trim().split(',').map(s => s.trim()).join(' and ')} available from ${match[1]}.`
      };
    }
  } else {
    const match = trimmed.match(/^import\s+(.+)$/);
    if (match) {
      const names = match[1].split(',').map(s => s.trim()).join(', ');
      return {
        tag: 'import',
        label: `import ${names}`,
        detail: `Loads module(s) ${names}.`,
        purpose: `Provides namespaces or helpers like ${names.split(',')[0]} for later use.`
      };
    }
  }
  return { tag: 'import', label: 'import', detail: trimmed, purpose: 'Imports names/modules.' };
}

function classLine(trimmed, full) {
  const match = trimmed.match(/^class\s+([\w_][\w\d_]*)(?:\(([^)]*)\))?/);
  if (match) {
    const bases = match[2] ? ` (extends ${match[2].trim()})` : '';
    return {
      tag: 'class',
      label: `class ${match[1]}${bases}`,
      detail: `Defines class ${match[1]}${match[2] ? ' inheriting from ' + match[2].trim() : ''}.`,
      purpose: `Groups behavior and state under one blueprint called ${match[1]}.`
    };
  }
  return { tag: 'class', label: 'class', detail: trimmed, purpose: 'Defines a class.' };
}

function defLine(trimmed, full) {
  const match = trimmed.match(/^(?:async\s+)?def\s+([\w_][\w\d_]*)\s*\(([^)]*)\)(?:\s*->\s*([\w\[\], \t\.]+))?:?/);
  if (match) {
    const async_ = trimmed.startsWith('async') ? ' async' : '';
    const params = match[2] ? `params ${match[2].trim()}` : 'no params';
    const ret = match[3] ? `returning ${match[3].trim()}` : '';
    const suffix = ret ? ` and ${ret}` : '';
    return {
      tag: 'def',
      label: `def ${match[1]}(${match[2] ? match[2].trim() : ''})`,
      detail: `Defines${async_} function ${match[1]} with ${params}.${suffix ? ' + ' + suffix : ''}`,
      purpose: `Creates a callable named ${match[1]} for reuse or abstraction.`
    };
  }
  return { tag: 'def', label: 'def', detail: trimmed, purpose: 'Defines a function.' };
}

function blockLine(trimmed, full) {
  const keyword = trimmed.split(/\s+/)[0];
  const purposeByKeyword = {
    if: 'Conditional branch executed when the condition is true.',
    elif: 'Additional conditional branch when earlier conditions failed.',
    else: 'Fallback branch when no prior condition matched.',
    for: 'Iterates over an iterable and binds each item.',
    while: 'Repeats while a condition holds.',
    with: 'Enters a context manager and binds a resource.',
    try: 'Starts a protected block that may raise.',
    except: 'Catches and handles a specific exception type.',
    finally: 'Runs cleanup whether or not an exception occurred.',
    async: 'Declares the next block/def as asynchronous.'
  };
  return {
    tag: keyword,
    label: `${keyword} ...`,
    detail: `Control structure starting with ${keyword}.`,
    purpose: purposeByKeyword[keyword] || 'Controls flow.'
  };
}

function controlLine(trimmed, full) {
  const keyword = trimmed.split(/\s+/)[0];
  const detailByKeyword = {
    return: 'Returns a value or exits the function.',
    raise: 'Raises an exception.',
    yield: 'Yields a value from a generator.',
    break: 'Exits the nearest loop.',
    continue: 'Skips to the next iteration.',
    pass: 'No-op placeholder required by syntax.'
  };
  return {
    tag: keyword,
    label: `${keyword} ...`,
    detail: detailByKeyword[keyword] || 'Control statement.',
    purpose: detailByKeyword[keyword] || 'Controls flow.'
  };
}

function commentLine(trimmed, full) {
  return {
    tag: 'comment',
    label: 'comment',
    detail: full.trim(),
    purpose: 'Explains intent or documents behavior.'
  };
}

function assignmentLine(trimmed, full) {
  const match = full.match(/^([A-Za-z_][\w]*)\s*=\s*(.+)$/);
  if (match) {
    return {
      tag: 'assignment',
      label: `${match[1]} = ...`,
      detail: `Assigns the value or result of ${match[2].trim()} to ${match[1]}.`,
      purpose: `Stores the result under the name ${match[1]} for later use.`
    };
  }
  return { tag: 'assignment', label: 'assignment', detail: full.trim(), purpose: 'Assigns a value.' };
}

function opAssignLine(trimmed, full) {
  return { tag: 'assignment', label: 'augmented assignment', detail: full.trim(), purpose: 'Updates a variable using its current value.' };
}

function printLine(trimmed, full) {
  return { tag: 'io', label: 'print(...)', detail: 'Outputs text or a value to stdout.', purpose: 'Displays a value during execution.' };
}

function ioLine(trimmed, full) {
  const name = trimmed.split(/\s*\(/)[0];
  const purposeByKeyword = {
    open: 'Opens a file and returns a stream.',
    eval: 'Evaluates a Python expression dynamically.',
    exec: 'Executes dynamic Python code.'
  };
  return {
    tag: 'io',
    label: `${name}(...)`,
    detail: `Calls ${name}().`,
    purpose: purposeByKeyword[name] || 'Interacts with I/O or dynamic evaluation.'
  };
}

function callLine(trimmed, full) {
  const match = trimmed.match(/^([\w.]+)\s*\(/);
  if (match) {
    return {
      tag: 'call',
      label: `${match[1]}(...)`,
      detail: `Calls ${match[1]}().`,
      purpose: `Invokes behavior in ${match[1]}.`
    };
  }
  return { tag: 'call', label: 'call', detail: trimmed, purpose: 'Calls a function/method.' };
}

function annotate(code) {
  const lines = code.split('\n');
  const annotations = lines.map((line, idx) => {
    const parsed = classify(line, idx + 1);
    const highlighted = highlightPython(line);
    return {
      line: idx + 1,
      source: highlighted,
      tag: parsed.tag,
      label: parsed.label,
      detail: parsed.detail,
      purpose: deepToggle.checked ? parsed.purpose : ''
    };
  });
  return annotations;
}

function render(annotations) {
  if (!annotations.length) {
    output.innerHTML = '';
    output.className = 'output-empty';
    output.textContent = 'Nothing annotated yet. Paste code and click Annotate.';
    return;
  }

  output.className = '';
  output.innerHTML = annotations.map(item => `
    <div class="annotation">
      <div class="annotation-line">L${item.line}</div>
      <div class="annotation-source">${item.source}</div>
      <div class="annotation-tag">${escapeHtml(item.tag + ' / ' + item.label)}</div>
      <div class="annotation-purpose">${escapeHtml(item.detail)}${item.purpose ? ' — ' + escapeHtml(item.purpose) : ''}</div>
    </div>
  `).join('');
}

function getBreakdownText(annotations) {
  return annotations.map(item => {
    const prefix = `L${item.line}: `;
    const body = item.detail + (item.purpose ? ' — ' + item.purpose : '');
    return prefix + body;
  }).join('\n');
}

annotateBtn.addEventListener('click', () => {
  if (!editor) return;
  const code = editor.state.doc.toString();
  const annotations = annotate(code);
  render(annotations);
  window.__lastAnnotations = annotations;
});

clearBtn.addEventListener('click', () => {
  if (!editor) return;
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: '' }
  });
  output.innerHTML = '';
  output.className = 'output-empty';
  output.textContent = 'Nothing annotated yet. Paste code and click Annotate.';
  window.__lastAnnotations = [];
});

copyBtn.addEventListener('click', async () => {
  const text = getBreakdownText(window.__lastAnnotations || []);
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    alert('Could not copy to clipboard.');
  }
});

init().catch(err => {
  output.innerHTML = `<span style="color:var(--keyword)">Failed to load editor: ${escapeHtml(String(err))}</span>`;
});