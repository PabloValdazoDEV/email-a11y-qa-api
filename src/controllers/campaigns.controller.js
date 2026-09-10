import {
  archiveCampaignForUser,
  createClientCampaign,
  getCampaignForUser,
  listClientCampaigns,
  updateCampaignForUser,
} from "../services/campaigns.service.js";

export async function getCampaigns(req, res) {
  const campaigns = await listClientCampaigns(req.auth.userId, req.params.clientId);
  res.json({ campaigns });
}

export async function createCampaign(req, res) {
  const campaign = await createClientCampaign(
    req.auth.userId,
    req.params.clientId,
    req.body,
  );
  res.status(201).json({ message: "Campaña creada", campaign });
}

export async function getCampaign(req, res) {
  const campaign = await getCampaignForUser(req.auth.userId, req.params.campaignId);
  res.json({ campaign });
}

export async function patchCampaign(req, res) {
  const campaign = await updateCampaignForUser(
    req.auth.userId,
    req.params.campaignId,
    req.body,
  );
  res.json({ message: "Campaña actualizada", campaign });
}

export async function deleteCampaign(req, res) {
  const campaign = await archiveCampaignForUser(req.auth.userId, req.params.campaignId);
  res.json({ message: "Campaña archivada", campaign });
}
