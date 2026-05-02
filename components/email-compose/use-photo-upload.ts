import { useAuth } from "@/lib/auth-context";
import { requestAPI } from "@/lib/request";
import * as Sentry from "@sentry/react-native";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useRef, useState } from "react";

export type PhotoStatus = "idle" | "uploading_blob" | "uploading_s3" | "fetching_cdn_url" | "uploaded" | "failed";

type DirectUploadResponse = {
  signed_id: string;
  key: string;
  filename: string;
  byte_size: number;
  direct_upload: { url: string; headers: Record<string, string> };
};

type CdnUrlResponse = { url: string };

const md5BytesBase64 = async (bytes: Uint8Array): Promise<string> => {
  const Crypto = await import("expo-crypto");
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.MD5, new Uint8Array(bytes));
  const out = new Uint8Array(digest);
  let binary = "";
  for (let i = 0; i < out.length; i++) binary += String.fromCharCode(out[i]!);
  return globalThis.btoa(binary);
};

export const usePhotoUpload = () => {
  const { accessToken } = useAuth();
  const [status, setStatus] = useState<PhotoStatus>("idle");
  const [cdnUrl, setCdnUrl] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const upload = useCallback(
    async (asset: ImagePicker.ImagePickerAsset): Promise<string | null> => {
      if (!accessToken) return null;
      const myId = ++requestIdRef.current;
      const isStale = () => requestIdRef.current !== myId;
      try {
        setStatus("uploading_blob");

        const { File } = await import("expo-file-system");
        const file = new File(asset.uri);
        const bytes = await file.bytes();
        if (isStale()) return null;
        const blob = await fetch(asset.uri).then((r) => r.blob());
        if (isStale()) return null;
        const filename = asset.fileName ?? `photo-${Date.now()}.jpg`;
        const byteSize = asset.fileSize ?? bytes.byteLength;
        const checksum = await md5BytesBase64(bytes);
        if (isStale()) return null;
        const contentType = asset.mimeType ?? blob.type ?? "image/jpeg";

        console.info("[photo] step 1: POST /mobile/direct_uploads", { filename, byteSize, contentType });
        const blobResponse = await requestAPI<DirectUploadResponse>("mobile/direct_uploads", {
          method: "POST",
          accessToken,
          data: { blob: { filename, byte_size: byteSize, checksum, content_type: contentType } },
        });
        if (isStale()) return null;
        console.info("[photo] step 1 ok", { key: blobResponse.key, signed_id_present: !!blobResponse.signed_id });

        setStatus("uploading_s3");
        const s3Url = blobResponse.direct_upload.url;
        const s3Host = (() => { try { return new URL(s3Url).host; } catch { return "<invalid-url>"; } })();
        console.info("[photo] step 2: PUT", s3Host, { headers: Object.keys(blobResponse.direct_upload.headers ?? {}) });
        const s3Response = await fetch(s3Url, {
          method: "PUT",
          headers: blobResponse.direct_upload.headers,
          body: blob,
        });
        if (!s3Response.ok) {
          const errBody = await s3Response.text().catch(() => "<no-body>");
          throw new Error(`S3 PUT ${s3Response.status}: ${errBody.slice(0, 500)}`);
        }
        console.info("[photo] step 2 ok", s3Response.status);
        if (isStale()) return null;

        setStatus("fetching_cdn_url");
        console.info("[photo] step 3: GET /mobile/s3_utility/cdn_url_for_blob", blobResponse.key);
        const cdnResponse = await requestAPI<CdnUrlResponse>(
          `mobile/s3_utility/cdn_url_for_blob?key=${encodeURIComponent(blobResponse.key)}`,
          { method: "GET", accessToken },
        );
        if (isStale()) return null;
        console.info("[photo] step 3 ok", { url_host: (() => { try { return new URL(cdnResponse.url).host; } catch { return "<invalid>"; } })() });

        setCdnUrl(cdnResponse.url);
        setStatus("uploaded");
        return cdnResponse.url;
      } catch (error) {
        if (isStale()) return null;
        console.error("[photo] upload failed:", error instanceof Error ? error.message : error);
        Sentry.captureException(error);
        setStatus("failed");
        return null;
      }
    },
    [accessToken],
  );

  const reset = useCallback(() => {
    requestIdRef.current++;
    setStatus("idle");
    setCdnUrl(null);
  }, []);

  return { status, cdnUrl, upload, reset };
};
