import {
  createCampaignRevision,
  getRevisionForUser,
  listCampaignRevisions,
} from "../services/revisions.service.js";

export async function postRevision(req, res) {
  const revision = await createCampaignRevision(
    req.auth.userId,
    req.params.campaignId,
  );
  res.status(201).json({
    message: `Revisión ${revision.version} guardada`,
    revision,
  });
}

export async function getRevisions(req, res) {
  const revisions = await listCampaignRevisions(
    req.auth.userId,
    req.params.campaignId,
  );
  res.json({ revisions });
}

export async function getRevision(req, res) {
  const revision = await getRevisionForUser(req.auth.userId, req.params.revisionId);
  res.json({ revision });
}
