import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

const guestUser: User = {
  id: 0,
  openId: "guest",
  name: "Demo Kullanıcı",
  email: null,
  loginMethod: "guest",
  role: "user",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  lastSignedIn: new Date(),
};

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // If authentication fails, fall back to a guest user so the app stays usable.
    user = guestUser;
  }

  if (!user) {
    user = guestUser;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
