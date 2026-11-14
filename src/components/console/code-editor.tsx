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
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { javascript } from '@codemirror/lang-javascript';

const base: Extension = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightActiveLine(),
  drawSelection(),
  history(),
  indentOnInput(),
  bracketMatching(),
  closeBrackets(),
  javascript(),
  EditorView.lineWrapping,
  keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
  EditorView.theme({
    '&': { height: '100%', fontSize: '14px' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
    '&.cm-focused': { outline: 'none' },
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
}: {
  value: string;
  onChange: (value: string) => void;
  theme: Extension;
  keys?: Parameters<typeof keymap.of>[0];
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const themeSlot = useRef(new Compartment());
  const reported = useRef(value);
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
