import { useAuth } from "@/lib/auth-context";
import { request, requestAPI } from "@/lib/request";
import * as Sentry from "@sentry/react-native";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useState } from "react";

export type PhotoStatus = "idle" | "uploading_blob" | "uploading_s3" | "fetching_cdn_url" | "uploaded" | "failed";

type DirectUploadResponse = {
  signed_id: string;
  key: string;
  filename: string;
  byte_size: number;
  direct_upload: { url: string; headers: Record<string, string> };
};

type CdnUrlResponse = { url: string };

const md5Base64 = async (uri: string): Promise<string> => {
  const { File } = await import("expo-file-system");
  const Crypto = await import("expo-crypto");
  const buffer = await new File(uri).arrayBuffer();
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.MD5, buffer);
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return globalThis.btoa(binary);
};

export const usePhotoUpload = () => {
  const { accessToken } = useAuth();
  const [status, setStatus] = useState<PhotoStatus>("idle");
  const [cdnUrl, setCdnUrl] = useState<string | null>(null);

  const upload = useCallback(
    async (asset: ImagePicker.ImagePickerAsset): Promise<string | null> => {
      if (!accessToken) return null;
      try {
        setStatus("uploading_blob");

        const filename = asset.fileName ?? `photo-${Date.now()}.jpg`;
        const byteSize = asset.fileSize ?? 0;
        const checksum = await md5Base64(asset.uri);
        const contentType = asset.mimeType ?? "image/jpeg";

        const blobResponse = await requestAPI<DirectUploadResponse>("mobile/direct_uploads", {
          method: "POST",
          accessToken,
          data: { blob: { filename, byte_size: byteSize, checksum, content_type: contentType } },
        });

        setStatus("uploading_s3");
        const fileBlob = await (await fetch(asset.uri)).blob();
        await request(blobResponse.direct_upload.url, {
          method: "PUT",
          headers: blobResponse.direct_upload.headers,
          body: fileBlob,
          skipResponseBody: true,
        });

        setStatus("fetching_cdn_url");
        const cdnResponse = await requestAPI<CdnUrlResponse>(
          `mobile/s3_utility/cdn_url_for_blob?key=${encodeURIComponent(blobResponse.key)}`,
          { method: "GET", accessToken },
        );

        setCdnUrl(cdnResponse.url);
        setStatus("uploaded");
        return cdnResponse.url;
      } catch (error) {
        Sentry.captureException(error);
        setStatus("failed");
        return null;
      }
    },
    [accessToken],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setCdnUrl(null);
  }, []);

  return { status, cdnUrl, upload, reset };
};
