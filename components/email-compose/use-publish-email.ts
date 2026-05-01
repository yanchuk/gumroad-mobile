import { assertDefined } from "@/lib/assert";
import { useAuth } from "@/lib/auth-context";
import { requestAPI } from "@/lib/request";
import { useMutation } from "@tanstack/react-query";

import type { AudienceType } from "./use-audience-options";

type PublishVars = {
  title: string;
  html: string;
  audienceType: AudienceType;
  photoCdnUrl: string | null;
  idempotencyKey: string;
};

type PublishResponse = {
  success: boolean;
  installment: {
    external_id: string;
    name: string;
    installment_type: string;
    published_at: string | null;
    message: string;
  };
};

export const usePublishEmail = () => {
  const { accessToken } = useAuth();

  return useMutation<PublishResponse, Error, PublishVars>({
    mutationFn: ({ title, html, audienceType, photoCdnUrl, idempotencyKey }) =>
      requestAPI<PublishResponse>("mobile/emails", {
        method: "POST",
        accessToken: assertDefined(accessToken),
        data: {
          installment: {
            name: title,
            message: html,
            installment_type: audienceType,
            shown_on_profile: true,
            send_emails: true,
            allow_comments: true,
            files: photoCdnUrl ? [{ url: photoCdnUrl, position: 0, stream_only: false }] : [],
          },
          publish: true,
          idempotency_key: idempotencyKey,
        },
      }),
  });
};
