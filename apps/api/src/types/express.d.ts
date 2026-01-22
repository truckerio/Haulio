import "express";

declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: string;
      orgId: string;
      role: string;
      email: string;
      name: string | null;
      permissions: string[];
    };
    cookies?: Record<string, string>;
  }
}
