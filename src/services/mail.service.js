import { env } from "../config/env.js";
import { mailEnabled, mailTransport } from "../config/mail.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emailHtml({ heading, text, action, url, footer = "Si no has solicitado esta acción, puedes ignorar este correo." }) {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr><td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:12px;padding:32px">
          <tr><td>
            <p style="margin:0 0 20px;font-size:14px;color:#52525b">${escapeHtml(env.APP_NAME)}</p>
            <h1 style="margin:0 0 16px;font-size:24px">${escapeHtml(heading)}</h1>
            <p style="margin:0 0 24px;line-height:1.6">${escapeHtml(text)}</p>
            <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#18181b;color:#fff;text-decoration:none">${escapeHtml(action)}</a>
            <p style="margin:24px 0 0;font-size:13px;color:#71717a;line-height:1.5">${escapeHtml(footer)}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

async function sendMail(message) {
  if (!mailEnabled) return false;
  await mailTransport.sendMail({ from: env.MAIL_FROM, ...message });
  return true;
}

export function sendVerificationEmail({ to, token }) {
  const url = `${env.frontendUrl}/verify-email#token=${encodeURIComponent(token)}`;
  return sendMail({
    to,
    subject: `Verifica tu email — ${env.APP_NAME}`,
    text: `Verifica tu email abriendo este enlace: ${url}`,
    html: emailHtml({
      heading: "Verifica tu email",
      text: "Confirma que esta dirección de correo te pertenece para activar tu cuenta.",
      action: "Verificar email",
      url,
    }),
  });
}

export function sendPasswordResetEmail({ to, token }) {
  const url = `${env.frontendUrl}/reset-password#token=${encodeURIComponent(token)}`;
  return sendMail({
    to,
    subject: `Restablece tu contraseña — ${env.APP_NAME}`,
    text: `Restablece tu contraseña abriendo este enlace: ${url}`,
    html: emailHtml({
      heading: "Restablece tu contraseña",
      text: "Este enlace caduca pronto y solo puede utilizarse una vez.",
      action: "Crear nueva contraseña",
      url,
    }),
  });
}

export function sendInvitationEmail({ to, token }) {
  const url = `${env.frontendUrl}/reset-password#token=${encodeURIComponent(token)}`;
  return sendMail({
    to,
    subject: `Te han concedido acceso — ${env.APP_NAME}`,
    text: `Te han concedido acceso a ${env.APP_NAME}. Crea tu contraseña desde este enlace: ${url}`,
    html: emailHtml({
      heading: "Ya tienes acceso",
      text: "Un administrador ha creado tu cuenta. Define tu contraseña para activarla e iniciar sesión.",
      action: "Crear contraseña",
      url,
      footer: "Si no esperabas este acceso, informa al responsable de la aplicación.",
    }),
  });
}
