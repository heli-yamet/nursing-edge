import { Resend } from "resend";

export type GrantInvitation = {
  to: string;
  subject: string;
  text: string;
};

export type InvitationSender = (invitation: GrantInvitation) => Promise<void>;

export function learnerSiteUrl(): string {
  const url = process.env.LEARNER_SITE_URL?.trim();
  if (!url) {
    throw new Error("LEARNER_SITE_URL is not set");
  }
  return url.replace(/\/+$/, "");
}

export function buildGrantInvitation(input: {
  email: string;
  hasAccount: boolean;
  siteUrl: string;
}): GrantInvitation {
  const site = input.siteUrl.replace(/\/+$/, "");
  if (input.hasAccount) {
    return {
      to: input.email,
      subject: "You have access to Nursing Edge",
      text: [
        "You have been given access to Nursing Edge.",
        "",
        `Sign in with ${input.email} to start using it:`,
        `${site}/sign-in`,
        "",
        "If you did not expect this email, you can ignore it.",
      ].join("\n"),
    };
  }
  return {
    to: input.email,
    subject: "You're invited to Nursing Edge",
    text: [
      "You have been given access to Nursing Edge.",
      "",
      `Create your account with ${input.email} to get started:`,
      `${site}/register`,
      "",
      "Use this exact email address so your access is linked to your account. We will email you a verification code when you create it.",
      "",
      "If you did not expect this email, you can ignore it.",
    ].join("\n"),
  };
}

export const sendWithResend: InvitationSender = async (invitation) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY or EMAIL_FROM is not set");
  }
  const { error } = await new Resend(apiKey).emails.send({
    from,
    to: invitation.to,
    subject: invitation.subject,
    text: invitation.text,
  });
  if (error) {
    throw new Error(error.message);
  }
};

export async function deliverGrantInvitation(input: {
  email: string;
  hasAccount: boolean;
  siteUrl: () => string;
  send: InvitationSender;
}): Promise<{ sent: boolean; error: string | null }> {
  try {
    await input.send(
      buildGrantInvitation({
        email: input.email,
        hasAccount: input.hasAccount,
        siteUrl: input.siteUrl(),
      }),
    );
    return { sent: true, error: null };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : "invitation_failed",
    };
  }
}
