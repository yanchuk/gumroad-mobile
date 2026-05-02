import { AudienceSheet } from "@/components/email-compose/audience-sheet";
import { PhotoAttachment } from "@/components/email-compose/photo-attachment";
import { RestoreDraftBanner } from "@/components/email-compose/restore-draft-banner";
import { RichTextBody, useRichTextBody } from "@/components/email-compose/rich-text-body";
import type { AudienceType } from "@/components/email-compose/use-audience-options";
import { useAudienceOptions } from "@/components/email-compose/use-audience-options";
import type { Draft } from "@/components/email-compose/use-email-draft";
import { useEmailDraft } from "@/components/email-compose/use-email-draft";
import { usePhotoUpload } from "@/components/email-compose/use-photo-upload";
import { usePublishEmail } from "@/components/email-compose/use-publish-email";
import { LineIcon } from "@/components/icon";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Screen } from "@/components/ui/screen";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/auth-context";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

export default function EmailComposeScreen() {
  const { isCreator } = useAuth();
  const router = useRouter();
  const audienceQuery = useAudienceOptions();
  const { draft: storedDraft, isLoaded: draftIsLoaded, save: saveDraft, clear: clearDraft } = useEmailDraft();
  const photoUpload = usePhotoUpload();
  const publish = usePublishEmail();

  const [title, setTitle] = useState("");
  const [audienceType, setAudienceType] = useState<AudienceType>("audience");
  const [html, setHtml] = useState("");
  const [photoCdnUrl, setPhotoCdnUrl] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => Crypto.randomUUID());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [restoreCandidate, setRestoreCandidate] = useState<Draft | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const editor = useRichTextBody({ initialHtml: "", onChange: setHtml });

  const initialDraftHandled = useRef(false);
  useEffect(() => {
    if (initialDraftHandled.current || !draftIsLoaded) return;
    initialDraftHandled.current = true;
    if (storedDraft) setRestoreCandidate(storedDraft);
  }, [draftIsLoaded, storedDraft]);

  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!draftIsLoaded) return;
    if (!title && !html) return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      saveDraft({ title, html, audienceType, idempotencyKey, photoCdnUrl: photoCdnUrl ?? undefined });
    }, 1000);
    return () => {
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    };
  }, [draftIsLoaded, saveDraft, title, html, audienceType, idempotencyKey, photoCdnUrl]);

  const lastPublishWasError = useRef(false);
  useEffect(() => {
    if (publish.isError) lastPublishWasError.current = true;
  }, [publish.isError]);
  const publishReset = publish.reset;
  useEffect(() => {
    if (lastPublishWasError.current && (title || html)) {
      lastPublishWasError.current = false;
      setIdempotencyKey(Crypto.randomUUID());
      setErrorMessage(null);
      publishReset();
    }
  }, [title, html, audienceType, publishReset]);

  const eligibility = audienceQuery.data?.eligibility;
  const options = audienceQuery.data?.options ?? [];
  const selectedOption = useMemo(() => options.find((o) => o.type === audienceType), [options, audienceType]);

  const canPublish = !!eligibility?.can_send_emails && title.trim().length > 0 && html.trim().length > 0 && !publish.isPending;

  const handlePublish = useCallback(async () => {
    setErrorMessage(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await publish.mutateAsync({ title, html, audienceType, photoCdnUrl, idempotencyKey });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
      await clearDraft();
      router.dismiss();
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to publish");
    }
  }, [publish, title, html, audienceType, photoCdnUrl, idempotencyKey, clearDraft, router]);

  const handlePickPhoto = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.8,
    });
    if (!result.assets?.length) return;
    for (const asset of result.assets) {
      const url = await photoUpload.upload(asset);
      if (url) {
        setPhotoCdnUrl(url);
        editor.setImage(url);
      }
    }
  }, [photoUpload, editor]);

  const handleRemovePhoto = useCallback(() => {
    setPhotoCdnUrl(null);
    photoUpload.reset();
  }, [photoUpload]);

  const handleRestoreContinue = useCallback(() => {
    if (!restoreCandidate) return;
    setTitle(restoreCandidate.title);
    setAudienceType(restoreCandidate.audienceType as AudienceType);
    setIdempotencyKey(restoreCandidate.idempotencyKey);
    if (restoreCandidate.photoCdnUrl) setPhotoCdnUrl(restoreCandidate.photoCdnUrl);
    editor.setContent(restoreCandidate.html);
    setHtml(restoreCandidate.html);
    setRestoreCandidate(null);
  }, [restoreCandidate, editor]);

  const handleRestoreDiscard = useCallback(async () => {
    await clearDraft();
    setRestoreCandidate(null);
  }, [clearDraft]);

  if (!isCreator) {
    return (
      <Screen>
        <Banner variant="error" message="Only creator accounts can compose emails." />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: "New email",
          headerRight: () => (
            <Pressable
              onPress={handlePublish}
              disabled={!canPublish}
              accessibilityRole="button"
              accessibilityLabel="Publish email"
              accessibilityState={{ disabled: !canPublish }}
              hitSlop={8}
            >
              <Text className={canPublish ? "text-base font-semibold text-accent" : "text-base font-semibold text-muted-foreground"}>
                {publish.isPending ? "Publishing…" : "Publish"}
              </Text>
            </Pressable>
          ),
        }}
      />

      {audienceQuery.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <LoadingSpinner />
        </View>
      ) : null}

      {audienceQuery.isError ? (
        <Banner
          variant="error"
          message="Couldn't load audience options. Pull to retry."
          actionLabel="Retry"
          onAction={() => audienceQuery.refetch()}
        />
      ) : null}

      {restoreCandidate ? (
        <RestoreDraftBanner draft={restoreCandidate} onContinue={handleRestoreContinue} onDiscard={handleRestoreDiscard} />
      ) : null}

      {eligibility && !eligibility.can_send_emails ? (
        <Banner variant="error" message={eligibility.reason ?? "You can't send emails yet."} />
      ) : null}

      {errorMessage ? <Banner variant="error" message={errorMessage} /> : null}

      <View className="px-4 py-2">
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          placeholderTextColor="#999"
          accessibilityLabel="Email title"
          className="border-b border-border py-3 text-lg text-foreground"
        />
      </View>

      <Pressable
        onPress={() => setSheetOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Audience: ${selectedOption?.label ?? audienceType}`}
        className="mx-4 my-2 flex-row items-center justify-between rounded border border-border bg-card px-4 py-3"
      >
        <View>
          <Text className="text-xs text-muted-foreground">Audience</Text>
          <Text className="text-base font-medium">{selectedOption?.label ?? "Everyone"}</Text>
        </View>
        <LineIcon name="chevron-right" size={20} className="text-muted-foreground" />
      </Pressable>

      <View className="mx-4 my-2 flex-row gap-2">
        <Button variant="outline" size="sm" onPress={handlePickPhoto}>
          <LineIcon name="image" size={16} className="text-foreground" />
          <Text>Add photo</Text>
        </Button>
      </View>

      <PhotoAttachment status={photoUpload.status} onRemove={handleRemovePhoto} onRetry={handlePickPhoto} />

      <RichTextBody editor={editor} />

      <AudienceSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        options={options}
        selectedType={audienceType}
        onSelect={setAudienceType}
      />
    </Screen>
  );
}
