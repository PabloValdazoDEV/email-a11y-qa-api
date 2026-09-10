import {
  archiveClientForUser,
  createOrganizationClient,
  getClientForUser,
  listOrganizationClients,
  restoreClientForUser,
  updateClientForUser,
} from "../services/clients.service.js";

export async function getClients(req, res) {
  const clients = await listOrganizationClients(
    req.auth.userId,
    req.params.organizationId,
  );
  res.json({ clients });
}

export async function createClient(req, res) {
  const client = await createOrganizationClient(
    req.auth.userId,
    req.params.organizationId,
    req.body,
  );
  res.status(201).json({ message: "Cliente creado", client });
}

export async function getClient(req, res) {
  const client = await getClientForUser(req.auth.userId, req.params.clientId);
  res.json({ client });
}

export async function patchClient(req, res) {
  const client = await updateClientForUser(
    req.auth.userId,
    req.params.clientId,
    req.body,
  );
  res.json({ message: "Cliente actualizado", client });
}

export async function deleteClient(req, res) {
  const client = await archiveClientForUser(req.auth.userId, req.params.clientId);
  res.json({ message: "Cliente archivado", client });
}

export async function restoreClient(req, res) {
  const client = await restoreClientForUser(req.auth.userId, req.params.clientId);
  res.json({ message: "Cliente restaurado", client });
}
