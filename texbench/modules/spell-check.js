// Spell check, using the checker built into your browser (it underlines words; right-click for suggestions).
export default {
  id: 'spell-check',
  name: 'Spell check',
  description: 'Underlines misspelt words using your browser’s own spell checker. Right-click a word for suggestions. The language is your browser’s.',
  category: 'Writing',
  activate(ctx) {
    ctx.editor.addExtension(ctx.cm.EditorView.contentAttributes.of({ spellcheck: 'true', autocorrect: 'off', autocapitalize: 'off' }));
  },
};
