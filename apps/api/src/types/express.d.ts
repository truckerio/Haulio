import "express";

type AppRequestUser = {
  id: string;
  orgId: string;
  role: string;
  email: string;
  name: string | null;
  permissions: string[];
};

declare global {
  namespace Express {
    interface Request {
      user?: AppRequestUser;
      cookies?: Record<string, string>;
    }
  }
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AppRequestUser;
    cookies?: Record<string, string>;
  }
}

export {};
