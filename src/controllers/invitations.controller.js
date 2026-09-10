import { createOrganizationInvitation } from "../services/organizationInvitations.service.js";

export async function createInvitation(req, res) {
  const result = await createOrganizationInvitation(
    req.auth.userId,
    req.params.organizationId,
    req.body,
  );

  let message = "Usuario añadido a la organización.";
  if (result.isNewUser) {
    message = result.invitationSent
      ? "Invitación enviada correctamente."
      : "Invitación creada, pero no se pudo entregar el email. La persona puede solicitar un enlace desde «He olvidado mi contraseña».";
  }

  res.status(201).json({
    message,
    member: result.member,
    ...(result.isNewUser ? { invitationSent: result.invitationSent } : {}),
  });
}
