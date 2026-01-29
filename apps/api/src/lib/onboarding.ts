import type { NextFunction, Request, Response } from "express";
import { prisma } from "@truckerio/db";

export async function requireOperationalOrg(req: Request, res: Response, next: NextFunction) {
  const orgId = req.user?.orgId;
  if (!orgId) {
    res.status(403).json({
      code: "ORG_NOT_OPERATIONAL",
      message: "Finish setup to perform this action.",
      ctaHref: "/onboarding",
    });
    return;
  }
  const state = await prisma.onboardingState.findFirst({
    where: { orgId },
    select: { status: true },
  });
  if (!state || state.status !== "OPERATIONAL") {
    res.status(403).json({
      code: "ORG_NOT_OPERATIONAL",
      message: "Finish setup to perform this action.",
      ctaHref: "/onboarding",
    });
    return;
  }
  next();
}
