import type { FunctionComponent } from "react";
import FppDailyAnalytics, {
  type FppDailyAnalyticsProps,
} from "./fpp/fpp-daily-analytics";
import FppReceiverMail, {
  type FppReceiverProps,
} from "./fpp/fpp-receiver-mail";
import FppSenderMail, { type FppSenderMailProps } from "./fpp/fpp-sender-mail";
import SySerendipityRequestMail, {
  type SySerendipityRequestProps,
} from "./sy-serendipity/request-receiver-mail";

export interface EmailTemplateEntry<Props> {
  id: string;
  name: string;
  component: FunctionComponent<Props>;
  previewProps: Props;
}

export const emailRegistry: [
  EmailTemplateEntry<FppSenderMailProps>,
  EmailTemplateEntry<FppReceiverProps>,
  EmailTemplateEntry<FppDailyAnalyticsProps>,
  EmailTemplateEntry<SySerendipityRequestProps>,
] = [
  {
    id: "fpp-sender",
    name: "FPP – contact confirmation",
    component: FppSenderMail,
    previewProps: FppSenderMail.PreviewProps,
  },
  {
    id: "fpp-receiver",
    name: "FPP – contact form submission",
    component: FppReceiverMail,
    previewProps: FppReceiverMail.PreviewProps,
  },
  {
    id: "fpp-daily-analytics",
    name: "FPP – daily analytics",
    component: FppDailyAnalytics,
    previewProps: FppDailyAnalytics.PreviewProps,
  },
  {
    id: "sy-serendipity-request",
    name: "SY Serendipity – charter request",
    component: SySerendipityRequestMail,
    previewProps: SySerendipityRequestMail.PreviewProps,
  },
];
