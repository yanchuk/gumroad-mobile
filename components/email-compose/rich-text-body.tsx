import { useCSSVariable } from "uniwind";
import {
  LinkBridge,
  PlaceholderBridge,
  RichText,
  TenTapStartKit,
  Toolbar,
  useEditorBridge,
  type EditorBridge,
} from "@10play/tentap-editor";
import { useEffect } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const HEADER_HEIGHT = 38;

export const useRichTextBody = ({
  initialHtml,
  onChange,
}: {
  initialHtml: string;
  onChange: (html: string) => void;
}): EditorBridge => {
  const foreground = useCSSVariable("--color-foreground");
  const bodyBg = useCSSVariable("--color-body-bg");

  const editor = useEditorBridge({
    initialContent: initialHtml,
    autofocus: true,
    avoidIosKeyboard: true,
    bridgeExtensions: [
      ...TenTapStartKit,
      PlaceholderBridge.configureExtension({ placeholder: "Write your message…" }),
      LinkBridge.configureExtension({ openOnClick: false }),
    ],
  });

  useEffect(() => {
    const css = `body { color: ${foreground}; background-color: ${bodyBg}; font-size: 16px; line-height: 1.5; padding: 12px; }`;
    editor.injectCSS(css, "email-compose-theme");
  }, [editor, foreground, bodyBg]);

  useEffect(() => {
    const unsubscribe = editor._subscribeToEditorStateUpdate(async () => {
      const html = await editor.getHTML();
      onChange(html);
    });
    return unsubscribe;
  }, [editor, onChange]);

  return editor;
};

export const RichTextBody = ({ editor }: { editor: EditorBridge }) => {
  const { top } = useSafeAreaInsets();
  const keyboardVerticalOffset = HEADER_HEIGHT + top;
  return (
    <>
      <View className="flex-1" style={{ paddingBottom: Platform.OS === "ios" ? HEADER_HEIGHT : 0 }}>
        <RichText editor={editor} />
      </View>
      <KeyboardAvoidingView
        behavior="padding"
        style={{ position: "absolute", width: "100%", bottom: 0 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? keyboardVerticalOffset : undefined}
      >
        <Toolbar editor={editor} />
      </KeyboardAvoidingView>
    </>
  );
};
