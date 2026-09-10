import {
  getCampaignDraft,
  replaceCampaignDraft,
  updateCampaignDraft,
} from "../services/drafts.service.js";
import { readUploadedHtml } from "../utils/draftValidation.js";

export async function getDraft(req, res) {
  const draft = await getCampaignDraft(req.auth.userId, req.params.campaignId);
  res.json({ draft });
}

export async function putDraft(req, res) {
  const result = await replaceCampaignDraft(
    req.auth.userId,
    req.params.campaignId,
    req.body.html,
  );
  res.status(result.created ? 201 : 200).json({
    message: result.created ? "Borrador creado" : "Borrador sustituido",
    draft: result.draft,
  });
}

export async function patchDraft(req, res) {
  const draft = await updateCampaignDraft(
    req.auth.userId,
    req.params.campaignId,
    req.body.htmlCurrent,
  );
  res.json({ message: "Borrador actualizado", draft });
}

export async function importDraft(req, res) {
  const html = readUploadedHtml(req.file.buffer);
  const result = await replaceCampaignDraft(req.auth.userId, req.params.campaignId, html);
  res.status(result.created ? 201 : 200).json({
    message: result.created ? "HTML importado y borrador creado" : "HTML importado",
    draft: result.draft,
  });
}
