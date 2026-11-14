import { useEffect, useRef } from 'react';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  bracketMatching,
  codeFolding,
  foldGutter,
  foldKeymap,
  foldService,
  indentOnInput,
} from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { javascript } from '@codemirror/lang-javascript';

const indentOf = (text: string) => text.length - text.trimStart().length;

/**
 * VS Code-style folding by indentation: a line folds the lines below it
 * that are indented further (`kick: s("bd")` and its `.gain()` lines), and a
 * run of `//` comment lines folds after its first line.
 */
const indentFolding = foldService.of((state, from) => {
  const line = state.doc.lineAt(from);
  if (!line.text.trim()) return null;
  const comment = (text: string) => text.trimStart().startsWith('//');
  if (comment(line.text)) {
    if (line.number > 1 && comment(state.doc.line(line.number - 1).text))
      return null;
    let last = line;
    while (
      last.number < state.doc.lines &&
      comment(state.doc.line(last.number + 1).text)
    )
      last = state.doc.line(last.number + 1);
    return last.number > line.number ? { from: line.to, to: last.to } : null;
  }
  const indent = indentOf(line.text);
  let last = line;
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const next = state.doc.line(n);
    if (!next.text.trim()) continue;
    if (indentOf(next.text) <= indent) break;
    last = next;
  }
  return last.number > line.number ? { from: line.to, to: last.to } : null;
});

const base: Extension = [
  lineNumbers(),
  codeFolding({ placeholderText: '…' }),
  foldGutter({ openText: '⌄', closedText: '›' }),
  indentFolding,
  highlightActiveLineGutter(),
  highlightActiveLine(),
  drawSelection(),
  history(),
  indentOnInput(),
  bracketMatching(),
  closeBrackets(),
  javascript(),
  EditorView.lineWrapping,
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...historyKeymap,
    ...foldKeymap,
  ]),
  EditorView.theme({
    '&': { height: '100%', fontSize: '14px' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
    '&.cm-focused': { outline: 'none' },
    '.cm-foldGutter .cm-gutterElement': {
      cursor: 'pointer',
      padding: '0 4px',
      opacity: '0.6',
    },
    '.cm-foldGutter .cm-gutterElement:hover': { opacity: '1' },
    '.cm-foldPlaceholder': {
      background: 'transparent',
      border: '1px solid currentColor',
      borderRadius: '4px',
      padding: '0 4px',
      margin: '0 4px',
      opacity: '0.6',
      cursor: 'pointer',
    },
  }),
];

/**
 * A CodeMirror editor. `value` replaces the text only when it differs from
 * what the editor last reported, so outside updates never fight typing.
 */
export function CodeEditor({
  value,
  onChange,
  theme,
  keys = [],
  label,
  extensions = [],
}: {
  value: string;
  onChange: (value: string) => void;
  theme: Extension;
  keys?: Parameters<typeof keymap.of>[0];
  label: string;
  /** Fixed for the editor's lifetime. */
  extensions?: Extension;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const themeSlot = useRef(new Compartment());
  const reported = useRef(value);
  const fixedExtensions = useRef(extensions);
  const latest = useRef({ onChange, keys, theme });
  latest.current = { onChange, keys, theme };

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: reported.current,
        extensions: [
          keymap.of(latest.current.keys),
          base,
          fixedExtensions.current,
          themeSlot.current.of(latest.current.theme),
          EditorView.contentAttributes.of({ 'aria-label': label }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            const text = update.state.doc.toString();
            // `value` set from outside is not an edit; reporting it would
            // re-apply that text later and undo canvas changes made since.
            if (text === reported.current) return;
            reported.current = text;
            latest.current.onChange(text);
          }),
        ],
      }),
    });
    view.current = editor;
    return () => editor.destroy();
  }, [label]);

  useEffect(() => {
    view.current?.dispatch({
      effects: themeSlot.current.reconfigure(theme),
    });
  }, [theme]);

  useEffect(() => {
    const editor = view.current;
    if (!editor || value === reported.current) return;
    reported.current = value;
    const head = Math.min(editor.state.selection.main.head, value.length);
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: value },
      selection: { anchor: head },
    });
  }, [value]);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
}
