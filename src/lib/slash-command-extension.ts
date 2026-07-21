import { Extension } from "@tiptap/react";
import { Suggestion } from "@tiptap/suggestion";
import type { Editor, Range } from "@tiptap/react";

export interface SlashCommandOptions {
  suggestion: Record<string, any>;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        startOfLine: false,
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: any }) => {
          // Delete the slash and query text
          editor.chain().focus().deleteRange(range).run();
          // Execute the command
          props.command(editor);
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
