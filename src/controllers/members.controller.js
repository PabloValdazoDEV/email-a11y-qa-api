import {
  listOrganizationMembers,
  removeOrganizationMember,
  updateOrganizationMemberRole,
} from "../services/members.service.js";

export async function getMembers(req, res) {
  const members = await listOrganizationMembers(
    req.auth.userId,
    req.params.organizationId,
  );
  res.json({ members });
}

export async function patchMember(req, res) {
  const member = await updateOrganizationMemberRole(
    req.auth.userId,
    req.params.organizationId,
    req.params.membershipId,
    req.body.role,
  );
  res.json({ message: "Rol actualizado", member });
}

export async function deleteMember(req, res) {
  await removeOrganizationMember(
    req.auth.userId,
    req.params.organizationId,
    req.params.membershipId,
  );
  res.json({ message: "Miembro eliminado de la organización" });
}
