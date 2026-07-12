import { Request, Response } from "express";
import { testnetAspService } from "../../services/index.js";

export async function testnetAspProofHandler(req: Request, res: Response) {
  if (!testnetAspService.isEnabled()) return res.status(404).json({ error: "Testnet ASP mode is disabled" });
  try {
    if (!req.params.label || !req.query.chainId) return res.status(400).json({ error: "chainId and label are required" });
    return res.json(await testnetAspService.proof(Number(req.query.chainId), BigInt(req.params.label)));
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Unable to compute ASP proof" });
  }
}
