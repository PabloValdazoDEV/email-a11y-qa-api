import {
  createOrganizationForUser,
  getOrganizationForUser,
  listOrganizationsForUser,
} from "../services/organizations.service.js";

export async function createOrganization(req, res) {
  const organization = await createOrganizationForUser(req.auth.userId, req.body);
  res.status(201).json({
    message: "Organización creada",
    organization,
  });
}

export async function getOrganizations(req, res) {
  const organizations = await listOrganizationsForUser(req.auth.userId);
  res.json({ organizations });
}

export async function getOrganization(req, res) {
  const organization = await getOrganizationForUser(req.auth.userId, req.params.id);
  res.json({ organization });
}
