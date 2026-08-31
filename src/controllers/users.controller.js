import {
  createUserWithInvitation,
  listUsers,
  updateUserByAdmin,
} from "../services/users.service.js";

export async function createUser(req, res) {
  const result = await createUserWithInvitation(req.user, req.body);
  res.status(201).json({
    message: result.invitationSent
      ? "Usuario creado. Se ha enviado el acceso por email."
      : "Usuario creado, pero no se pudo entregar la invitación. Puede solicitar un enlace desde «He olvidado mi contraseña».",
    user: result.user,
    invitationSent: result.invitationSent,
  });
}

export async function getUsers(req, res) {
  const result = await listUsers(req.validatedQuery);
  res.json(result);
}

export async function patchUser(req, res) {
  const user = await updateUserByAdmin(req.user, req.params.id, req.body);
  res.json({ message: "Usuario actualizado", user });
}
